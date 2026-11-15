import {validateDeckUnique} from "./cards.ts";
import {createSeededRng} from "./mathEngine.ts";
import {cardId,evaluateIds} from "./labEvaluator.ts";
import {comboKey,MIN_LAB_WEIGHT,type LabRange} from "./labRanges.ts";

export const LAB_VERSION="holdem-lab-1.0.0";
export const LAB_LIMITS={players:6,exactOutcomes:250_000,tupleCandidates:100_000,samples:1_000_000,attempts:5_000_000,timeMs:60_000,batch:1000,inputBytes:2*1024*1024};
export type MathProvenance="EXACT_ENUMERATION"|"MONTE_CARLO_ESTIMATE"|"MODEL_BASED_EV"|"SOLVER_REFERENCE"|"EDUCATIONAL_ONLY";
export interface EquityInput {players:LabRange[];board:string[];dead:string[];method:"exact"|"monte-carlo";seed:string;samples:number}
export interface EquityEstimate {equity:number;win:number;tie:number;standardError:number|null;confidence95:[number,number]|null;normalApproximation95:[number,number]|null}
export interface EquityPoint {samples:number;players:EquityEstimate[]}
export interface EquityResult {
  provenance:MathProvenance;algorithmVersion:string;input:EquityInput;limits:typeof LAB_LIMITS;
  preflight:EquityPreflight;samples:number;attempts:number;elapsedMs:number;players:EquityEstimate[];evolution:EquityPoint[];
  assumptions:string[];intervalMethod:string;seedPolicy:string;
}
export interface EquityPreflight {rawCombos:number[];legalCombos:number[];candidateTuples:number;candidateTuplesDecimal:string;legalTuples:number|null;runoutsPerTuple:number;outcomes:number;outcomesDecimal:string;countIsUpperBound:boolean;exactAllowed:boolean}
interface Combo {ids:number[];weight:number;cumulative:number}
interface Prepared {ranges:Combo[][];known:number[];board:number[];missing:number;preflight:EquityPreflight}
export function choose(n:number,k:number):number {if(k<0||n<k)return 0;let v=1;for(let i=1;i<=k;i++)v=v*(n-k+i)/i;return Math.round(v);}
function walkTuples(ranges:Combo[][],known:number[],visit:(hands:Combo[],weight:number)=>void):void {
  const used=new Set(known), hands:Combo[]=[];
  function walk(i:number,weight:number){if(i===ranges.length){visit(hands,weight);return;}
    for(const c of ranges[i]){if(c.ids.some(x=>used.has(x)))continue;c.ids.forEach(x=>used.add(x));hands.push(c);walk(i+1,weight*c.weight);hands.pop();c.ids.forEach(x=>used.delete(x));}}
  walk(0,1);
}
function prepare(input:EquityInput):Prepared {
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>LAB_LIMITS.inputBytes)throw Error("Entrada acima do limite de memória de 2 MiB.");
  if(!input||!Array.isArray(input.players)||input.players.length<2||input.players.length>LAB_LIMITS.players)throw Error("Use 2 a 6 jogadores.");
  if(input.method!=="exact"&&input.method!=="monte-carlo")throw Error("Método inválido.");
  if(!Array.isArray(input.board)||![0,3,4,5].includes(input.board.length)||!Array.isArray(input.dead))throw Error("Board deve ter 0, 3, 4 ou 5 cartas.");
  if(typeof input.seed!=="string"||input.seed.length>200)throw Error("Seed inválida (até 200 caracteres).");
  const check=validateDeckUnique([...input.board,...input.dead]);if(!check.valid)throw Error(check.error);
  const known=check.normalized.map(cardId), knownSet=new Set(known);
  const ranges=input.players.map(range=>{
    if(!Array.isArray(range.combos)||range.combos.length>1326)throw Error("Limite de 1.326 combos por range.");
    const seen=new Set<string>();let cumulative=0;
    const result:Combo[]=[];
    for(const c of range.combos){
      if(!Array.isArray(c.cards)||c.cards.length!==2||!Number.isFinite(c.weight)||c.weight<0||c.weight>1||(c.weight>0&&c.weight<MIN_LAB_WEIGHT))throw Error("Combo ou peso inválido (mínimo positivo 0,000000001).");
      const valid=validateDeckUnique(c.cards);if(!valid.valid)throw Error(valid.error);
      const key=comboKey(c.cards);if(seen.has(key))throw Error("Combo duplicado no range.");seen.add(key);
      const ids=valid.normalized.map(cardId);if(!c.weight||ids.some(x=>knownSet.has(x)))continue;
      cumulative+=c.weight;result.push({ids,weight:c.weight,cumulative});
    }
    if(!result.length)throw Error("Range sem combinações legais após blockers.");
    return result;
  });
  const missing=5-input.board.length,remaining=52-known.length-ranges.length*2;
  if(remaining<missing)throw Error("Cartas insuficientes para completar o board.");
  const candidateTuplesExact=ranges.reduce((n,r)=>n*BigInt(r.length),1n),candidateTuples=Number(candidateTuplesExact);
  let legalTuples:number|null=null;
  if(candidateTuples<=LAB_LIMITS.tupleCandidates){legalTuples=0;walkTuples(ranges,known,()=>{legalTuples!++;});if(!legalTuples)throw Error("Ranges incompatíveis: não há configuração conjunta sem cartas repetidas.");}
  const runoutsPerTuple=choose(remaining,missing),outcomesExact=(legalTuples===null?candidateTuplesExact:BigInt(legalTuples))*BigInt(runoutsPerTuple),outcomes=Number(outcomesExact);
  return {ranges,known,board:input.board.map(cardId),missing,preflight:{rawCombos:input.players.map(p=>p.combos.length),legalCombos:ranges.map(r=>r.length),candidateTuples,candidateTuplesDecimal:candidateTuplesExact.toString(),legalTuples,runoutsPerTuple,outcomes,outcomesDecimal:outcomesExact.toString(),countIsUpperBound:legalTuples===null,exactAllowed:legalTuples!==null&&outcomes<=LAB_LIMITS.exactOutcomes}};
}
export function estimateEquityWork(input:EquityInput):EquityPreflight {return prepare(input).preflight;}
export interface EquityHooks {progress?:(point:EquityPoint,total:number)=>void;cancelled?:()=>boolean;now?:()=>number;maxTimeMs?:number}
export async function runEquity(input:EquityInput,hooks:EquityHooks={}):Promise<EquityResult> {
  const now=hooks.now??(()=>performance.now()),start=now(),p=prepare(input),n=p.ranges.length;
  const maxTime=Math.min(hooks.maxTimeMs??LAB_LIMITS.timeMs,LAB_LIMITS.timeMs);
  function guard(){if(hooks.cancelled?.())throw Error("Cálculo cancelado.");if(now()-start>maxTime)throw Error("Limite de 60 s atingido. Reduza o trabalho e execute novamente.");}
  guard();
  if(input.method==="exact"&&!p.preflight.exactAllowed)throw Error(`Enumeração recusada: ${BigInt(p.preflight.outcomesDecimal).toLocaleString("pt-BR")} resultados estimados. Limite de ${LAB_LIMITS.exactOutcomes}; selecione Monte Carlo explicitamente.`);
  if(input.method==="monte-carlo"&&(!Number.isSafeInteger(input.samples)||input.samples<100||input.samples>LAB_LIMITS.samples))throw Error("Monte Carlo exige de 100 a 1.000.000 amostras.");
  const wins=Array<number>(n).fill(0),ties=[...wins],mean=[...wins],m2=[...wins],equitySum=[...wins];
  let samples=0,attempts=0,totalWeight=0;const evolution:EquityPoint[]=[];
  function estimates():EquityEstimate[]{return mean.map((value,i)=>{
    const se=input.method==="monte-carlo"&&samples>1?Math.sqrt(Math.max(0,m2[i])/(samples-1)/samples):null;
    const radius=Math.sqrt(Math.log(40)/(2*samples));
    return {equity:input.method==="exact"?equitySum[i]/totalWeight:value,win:wins[i]/totalWeight,tie:ties[i]/totalWeight,standardError:se,confidence95:se===null?null:[Math.max(0,value-radius),Math.min(1,value+radius)],normalApproximation95:se===null?null:[Math.max(0,value-1.959963984540054*se),Math.min(1,value+1.959963984540054*se)]};
  });}
  function tally(hands:Combo[],board:number[],weight:number){
    const scores=hands.map(c=>evaluateIds([...c.ids,...board])),best=Math.max(...scores),winners=scores.filter(x=>x===best).length;
    samples++;totalWeight+=weight;
    for(let i=0;i<n;i++){
      const won=scores[i]===best,share=won?1/winners:0;
      if(won){if(winners===1)wins[i]+=weight;else ties[i]+=weight;}
      equitySum[i]+=share*weight;const delta=share-mean[i];mean[i]+=delta/samples;m2[i]+=delta*(share-mean[i]);
    }
  }
  const target=input.method==="exact"?p.preflight.outcomes:input.samples;
  async function checkpoint(){guard();const point={samples,players:estimates()};if(evolution.length<220)evolution.push(point);hooks.progress?.(point,target);await new Promise<void>(r=>setTimeout(r,0));guard();}
  if(input.method==="exact"){
    // Only small legal tuple sets reach here. No board completions are materialized.
    const tuples:{hands:Combo[];weight:number}[]=[];
    walkTuples(p.ranges,p.known,(hands,weight)=>tuples.push({hands:[...hands],weight}));
    for(const tuple of tuples){
      const used=new Set([...p.known,...tuple.hands.flatMap(c=>c.ids)]),deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.has(i));
      // Iterative lexicographic combinations: unordered runouts, each once.
      const ix=Array.from({length:p.missing},(_,i)=>i);
      let more=true;
      while(more){tally(tuple.hands,[...p.board,...ix.map(i=>deck[i])],tuple.weight);attempts++;
        if(samples%LAB_LIMITS.batch===0)await checkpoint();
        if(!p.missing)break;
        let j=ix.length-1;while(j>=0&&ix[j]===deck.length-ix.length+j)j--;
        if(j<0)more=false;else{ix[j]++;for(let k=j+1;k<ix.length;k++)ix[k]=ix[k-1]+1;}
      }
    }
  } else {
    const rng=createSeededRng(input.seed).nextFloat;
    const maxAttempts=Math.min(LAB_LIMITS.attempts,Math.max(10_000,input.samples*30));
    while(samples<input.samples){
      if(attempts>=maxAttempts)throw Error("Baixa aceitação dos ranges ou ranges incompatíveis. Reduza sobreposições; nenhum resultado parcial foi certificado.");
      attempts++;const used=new Set(p.known),hands:Combo[]=[];let legal=true;
      // Independent weighted proposals, then reject the ENTIRE tuple on any collision.
      // Resampling only the colliding player would bias the joint distribution.
      for(const range of p.ranges){const pick=rng()*range[range.length-1].cumulative;let lo=0,hi=range.length-1;while(lo<hi){const mid=(lo+hi)>>>1;if(pick<range[mid].cumulative)hi=mid;else lo=mid+1;}const c=range[lo];if(c.ids.some(x=>used.has(x))){legal=false;break;}hands.push(c);c.ids.forEach(x=>used.add(x));}
      if(legal){
        const deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.has(i));
        for(let j=0;j<p.missing;j++){const k=j+Math.floor(rng()*(deck.length-j));[deck[j],deck[k]]=[deck[k],deck[j]];}
        tally(hands,[...p.board,...deck.slice(0,p.missing)],1);
      }
      if(attempts%LAB_LIMITS.batch===0) {guard();if(legal&&samples%Math.max(1000,Math.floor(target/100))<LAB_LIMITS.batch)await checkpoint();else if(attempts%(LAB_LIMITS.batch*5)===0)await checkpoint();}
    }
  }
  guard();const point={samples,players:estimates()};evolution.push(point);hooks.progress?.(point,target);
  return {provenance:input.method==="exact"?"EXACT_ENUMERATION":"MONTE_CARLO_ESTIMATE",algorithmVersion:LAB_VERSION,input:structuredClone(input),limits:LAB_LIMITS,preflight:p.preflight,samples,attempts,elapsedMs:now()-start,players:point.players,evolution,
    assumptions:["Texas Hold'em high, 52 cartas, sem rake, sem side pots; cada jogador disputa o mesmo pote.","Peso conjunto proporcional ao produto dos pesos, condicionado a cartas distintas; board uniforme entre cartas restantes.","Vitória = vencedor único. Empate = participação em empate. Equidade = fração do pote (1/k).","Enumeração exaustiva com aritmética IEEE-754 nos pesos, tolerância numérica; não é solução GTO.","IC pontual, não simultâneo nem válido para parada opcional por precisão; dependência do gerador pseudoaleatório."],
    intervalMethod:input.method==="exact"?"Sem incerteza amostral; enumeração completa.":"IC 95% pontual conservador de Hoeffding para frações do pote em [0,1]: média ± √(ln(40)/(2n)), truncado a [0,1], sob amostras independentes. Erro-padrão: s/√n com variância das frações via Welford. O JSON também registra aproximação normal média ± 1,959964×EP; esta pode ser degenerada ou ter cobertura ruim em eventos raros. Nenhum intervalo é garantia de precisão, nem simultâneo para toda a curva.",
    seedPolicy:"Serial, gerador createSeededRng do mathEngine, sem paralelismo; mesma ordem de combos, seed e versão reproduzem a sequência. Tempos não são reproduzíveis."};
}
