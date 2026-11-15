import {calculatePotOdds,calculateBluffBreakevenFoldEquity,calculateSimplifiedMdf} from "./mathEngine.ts";
import {LAB_VERSION} from "./labEquity.ts";
export interface EvInput {pot:number;bet:number;call:number;equity:number;fold:number;callFrequency:number;equityWhenCalled:number;checkEquity:number;cost:number;betFrequency:number}
export function validateNumber(value:number,name:string,min=0,max=1e12):void {if(!Number.isFinite(value)||value<min||value>max)throw Error(`${name}: valor finito entre ${min} e ${max}.`);}
export function calculateLabEv(input:EvInput){
  const {pot:P,bet:B,call:C,equity:e,fold:f,callFrequency:c,equityWhenCalled:q,checkEquity:ec,cost:K,betFrequency:m}=input;
  validateNumber(P,"Pote",0.000001);validateNumber(B,"Aposta",0.000001);validateNumber(C,"Call",0.000001);validateNumber(K,"Custo adicional");
  for(const [name,value] of Object.entries({equidade:e,fold:f,call:c,equidadeQuandoPago:q,equidadeCheck:ec,frequenciaBet:m}))validateNumber(value,name,0,1);
  if(Math.abs(f+c-1)>1e-10)throw Error("Fold + call devem somar 100%. Raises não são suportados neste modelo; normalize explicitamente.");
  const odds=calculatePotOdds(P,B,C),bluff=calculateBluffBreakevenFoldEquity(P,B),mdf=calculateSimplifiedMdf(P,B);
  const evCall=e*(P+B+C)-C,evBluff=f*P-c*B,evBet=f*P+c*(q*(P+2*B)-B)-K,evCheck=ec*P;
  const denominator=P-(q*(P+2*B)-B);
  const rawBreakEven=denominator===0?null:(K-(q*(P+2*B)-B))/denominator;
  return {provenance:"MODEL_BASED_EV" as const,algorithmVersion:LAB_VERSION,input:{...input},unit:"chipEV (unidade de fichas escolhida)",
    evCall,evFold:0,evBluff,evBet,evCheck,evMixed:m*evBet+(1-m)*evCheck,odds,bluff,mdf,
    betBreakEvenFold:rawBreakEven!==null&&rawBreakEven>=0&&rawBreakEven<=1?rawBreakEven:null,
    assumptions:["P = pote antes da aposta; B = aposta; C = valor para pagar. EV incremental ao ponto da decisão; custos anteriores são sunk costs.","Call final heads-up: e(P+B+C)−C. Fold = 0. Sem rake, side pots, raises ou decisões futuras.","Bet: fP+c[q(P+2B)−B]−K. Adversário desiste ou paga integralmente B. K é custo fixo adicional incorrido ao apostar, em ambos os ramos.","Check: realização total da equidade ec, sem apostas futuras. Blefe puro: fP−cB, com q=0 e K=0, independentemente das entradas do bet.","Mix hipotético: m×EV(bet)+(1−m)×EV(check). As probabilidades são fornecidas pelo usuário.","chipEV não é EV monetário, ICM ou PKO. Maior EV neste modelo não comprova estratégia GTO."],
    limits:{minimumPositiveAmount:0.000001,maximumAmount:1e12,probabilityTolerance:1e-10},monetaryEv:"INDISPONÍVEL",icm:"INDISPONÍVEL",pko:"INDISPONÍVEL"};
}
export function sensitivityLabel(parameter:keyof EvInput):string {
  return parameter==="equity"||parameter==="call"?"EV(call)":parameter==="checkEquity"?"EV(check)":parameter==="betFrequency"?"EV(mix)":"EV(bet)";
}
export function sensitivity(input:EvInput,parameter:keyof EvInput):{x:number;y:number}[]{
  const probability=["equity","fold","callFrequency","equityWhenCalled","checkEquity","betFrequency"].includes(parameter);
  const end=probability?1:Math.min(1e12,Math.max(input[parameter]*2,1));
  return Array.from({length:51},(_,i)=>{
    const x=probability?i/50:Math.max(0.000001,i/50*end),next={...input,[parameter]:x};
    if(parameter==="fold")next.callFrequency=1-x;
    if(parameter==="callFrequency")next.fold=1-x;
    const ev=calculateLabEv(next),model=sensitivityLabel(parameter);
    return {x,y:model==="EV(call)"?ev.evCall:model==="EV(check)"?ev.evCheck:model==="EV(mix)"?ev.evMixed:ev.evBet};
  });
}
