import type { CanonicalHand, HandSnapshot } from "./handHistorySchema.ts";
import { validateDeckUnique } from "./cards.ts";

/** Validação do contrato e das identidades, não autenticação nem execução de regras. */
export const MAX_REPLAY_JSON_BYTES = 6 * 1024 * 1024;
const MAX_ATOMS = 9_007_199_254_740_991n;
const streets = ["PREFLOP", "FLOP", "TURN", "RIVER"];
const reportedKinds = ["HoleDealing", "BoardDealing", "CheckingOrCalling", "CompletionBettingOrRaisingTo", "Folding", "HoleCardsShowingOrMucking", "NoOperation"];
const derivedKinds = ["AntePosting", "BlindOrStraddlePosting", "BetCollection", "CardBurning", "RunoutCountSelection", "HandKilling", "ChipsPushing", "ChipsPulling", "UncollectedBetReturn"];
const actorKinds = ["HoleDealing", "CheckingOrCalling", "CompletionBettingOrRaisingTo", "Folding", "HoleCardsShowingOrMucking", "AntePosting", "BlindOrStraddlePosting", "RunoutCountSelection", "HandKilling", "ChipsPulling"];

export class HandJsonError extends Error {
  constructor(path: string, message: string) { super(`${path}: ${message}`); this.name = "HandJsonError"; }
}
function need(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new HandJsonError(path, message);
}
function object(value: unknown, path: string, keys: string[], optional: string[] = []): Record<string, unknown> {
  need(value !== null && typeof value === "object" && !Array.isArray(value), path, "esperado objeto.");
  const obj = value as Record<string, unknown>;
  need(keys.every(k => Object.hasOwn(obj, k)), path, "campos obrigatórios ausentes.");
  need(Object.keys(obj).every(k => keys.includes(k) || optional.includes(k)), path, "campo fora do contrato.");
  return obj;
}
function integer(value: unknown, path: string, low: number, high: number): number {
  need(typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high, path, `esperado inteiro entre ${low} e ${high}.`);
  return value;
}
function text(value: unknown, path: string, max = 4096): string {
  need(typeof value === "string" && value.length <= max, path, "texto inválido ou extenso demais.");
  return value;
}
function literal(value: unknown, expected: unknown, path: string) { need(value === expected, path, `valor incompatível (${String(expected)}).`); }
function boolean(value: unknown, path: string) { need(typeof value === "boolean", path, "esperado booleano."); }
function array(value: unknown, path: string, min: number, max = min): unknown[] {
  need(Array.isArray(value) && value.length >= min && value.length <= max, path, `quantidade de itens inválida (${min}..${max}).`);
  return value;
}
function amount(value: unknown, path: string): bigint {
  need(typeof value === "string" && /^(0|[1-9]\d{0,15})$/.test(value), path, "esperado átomo inteiro em string decimal.");
  const result = BigInt(value);
  need(result <= MAX_ATOMS, path, "valor acima de 2^53−1.");
  return result;
}
function amounts(value: unknown, path: string, n: number): bigint[] { return array(value, path, n).map((v, i) => amount(v, `${path}[${i}]`)); }
function sum(v: readonly bigint[]) { return v.reduce((a,b) => a+b, 0n); }
function card(value: unknown, path: string, unknown = false) {
  need((unknown && value === null) || (typeof value === "string" && /^[2-9TJQKA][cdhs]$/.test(value)), path, "carta inválida.");
}
function observed(value: unknown, path: string, validate: (v: unknown, p: string) => void, extra: string[] = []) {
  const tag = object(value, path, ["status"], ["value", "reason", ...extra]);
  need(typeof tag.status==="string" && ["REPORTED","INFERRED","MISSING"].includes(tag.status), path, "status de informação inválido.");
  if (tag.status === "MISSING") {
    need(!Object.hasOwn(tag,"value") && !Object.hasOwn(tag,"reason"), path, "informação ausente não pode conter valor.");
  } else {
    need(Object.hasOwn(tag,"value"), path, "valor ausente.");
    validate(tag.value, `${path}.value`);
    if (tag.status === "INFERRED") need(text(tag.reason,`${path}.reason`).trim(),path,"inferência exige motivo.");
    else need(!Object.hasOwn(tag,"reason"),path,"motivo de inferência em valor reportado.");
  }
  return tag;
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function snapshot(value: unknown, path: string, n: number, total: bigint): HandSnapshot {
  const s = object(value,path,["street","board","stacksAtoms","betsAtoms","potAtoms","actorIndex","folded","mucked","allIn"]);
  need(typeof s.street==="string" && streets.includes(s.street),path,"street inválida.");
  const board = array(s.board,`${path}.board`,0,5);
  need([0,3,4,5].includes(board.length) && board.length <= [0,3,4,5][streets.indexOf(String(s.street))],path,"board incompatível com a etapa operacional.");
  board.forEach(c => card(c,`${path}.board`));
  const stacks = amounts(s.stacksAtoms,`${path}.stacksAtoms`,n);
  const bets = amounts(s.betsAtoms,`${path}.betsAtoms`,n);
  const pot = amount(s.potAtoms,`${path}.potAtoms`);
  for (const key of ["folded","mucked","allIn"]) array(s[key],`${path}.${key}`,n).forEach(v => boolean(v,`${path}.${key}`));
  if (s.actorIndex !== null) integer(s.actorIndex,`${path}.actorIndex`,0,n-1);
  need(sum(stacks)+pot === total,path,"fichas não conservadas (stacks + pote).");
  need(sum(bets) <= pot,path,"apostas pendentes excedem o pote total.");
  const result = s as unknown as HandSnapshot;
  result.allIn.forEach((allIn,i) => need(allIn === (stacks[i] === 0n && !result.folded[i]),path,"indicador de all-in incoerente."));
  return result;
}
function equalSnapshot(a: HandSnapshot, b: HandSnapshot): boolean {
  return a.street === b.street && a.actorIndex === b.actorIndex && a.potAtoms === b.potAtoms &&
    ["board","stacksAtoms","betsAtoms","folded","mucked","allIn"].every(key => same(a[key as keyof HandSnapshot],b[key as keyof HandSnapshot]));
}
function metadata(value: unknown, depth = 0): void {
  need(depth <= 16,"metadata","aninhamento excessivo.");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") { integer(value,"metadata",-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER); return; }
  need(typeof value === "object","metadata","tipo JSON inválido.");
  for (const [k,v] of Object.entries(value)) {
    need(!["__proto__","constructor","prototype"].includes(k),"metadata","chave não permitida.");
    metadata(v,depth+1);
  }
}

export function validateCanonicalHand(value: unknown): CanonicalHand {
  const h = object(value,"mão",["schemaVersion","profile","recordId","source","variant","gameFormat","amountPolicy","table","players","sourceActions","events","ending","pots","results","integrity","metadata"]);
  literal(h.schemaVersion,"1.0.0","schemaVersion"); literal(h.profile,"PHH_NT_SUBSET_1","profile"); literal(h.variant,"NLHE","variant");
  const source = object(h.source,"source",["format","targetStandardVersion","sha256","byteLength","fileName","handId","importedAtUtc"]);
  need(source.format==="PHH"||source.format==="POKERSTARS","source.format","valor incompatível (PHH | POKERSTARS).");
  const sourceFormat = source.format as "PHH" | "POKERSTARS";
  literal(source.targetStandardVersion,sourceFormat==="PHH"?"0.0.2":"PS_TEXT_1","source.targetStandardVersion");
  need(typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256),"source.sha256","SHA-256 inválido.");
  literal(h.recordId,`${sourceFormat==="PHH"?"phh":"ps"}-sha256:${source.sha256}`,"recordId"); integer(source.byteLength,"source.byteLength",1,1_048_576);
  observed(source.fileName,"source.fileName",(v,p) => { text(v,p); });
  observed(source.handId,"source.handId",(v,p) => { if (typeof v === "string") text(v,p); else integer(v,p,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER); });
  need(typeof source.importedAtUtc === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(source.importedAtUtc) && Number.isFinite(Date.parse(source.importedAtUtc)),"source.importedAtUtc","timestamp UTC inválido.");
  need(Number(source.importedAtUtc.slice(0,4))>0 && new Date(source.importedAtUtc).toISOString().slice(0,19)===source.importedAtUtc.slice(0,19),"source.importedAtUtc","data civil inválida.");
  observed(h.gameFormat,"gameFormat",(v,p) => { need(typeof v==="string" && ["CASH","MTT","SNG"].includes(v),p,"modalidade inválida."); });
  const policy = object(h.amountPolicy,"amountPolicy",["encoding","decimalPlaces","currency"]);
  literal(policy.encoding,"UNSIGNED_INTEGER_STRING","amountPolicy.encoding"); integer(policy.decimalPlaces,"amountPolicy.decimalPlaces",0,6);
  observed(policy.currency,"amountPolicy.currency",(v,p) => { text(v,p,80); });
  const table = object(h.table,"table",["playerCount","seatCount","rawBlindsAtoms","rawAntesAtoms","minBetAtoms","anteTrimming"]);
  const n = integer(table.playerCount,"table.playerCount",2,9);
  const seatCount = observed(table.seatCount,"table.seatCount",(v,p) => { integer(v,p,n,9); });
  const blinds = amounts(table.rawBlindsAtoms,"table.rawBlindsAtoms",n);
  amounts(table.rawAntesAtoms,"table.rawAntesAtoms",n);
  need(blinds[0]>0n && blinds[1]>=blinds[0] && blinds.slice(2).every(v => v===0n) && amount(table.minBetAtoms,"table.minBetAtoms")===blinds[1],"table","blinds fora do perfil.");
  observed(table.anteTrimming,"table.anteTrimming",boolean);
  const actions = array(h.sourceActions,"sourceActions",1,500); actions.forEach(a => text(a,"sourceActions",2000));
  const seats = new Set<number>();
  const players = array(h.players,"players",n);
  const initial = players.map((v,i) => {
    const p = object(v,`players[${i}]`,["index","sourceLabel","name","seat","position","initialStackAtoms","holeCards"]);
    literal(p.index,i,"players.index"); literal(p.sourceLabel,`p${i+1}`,"players.sourceLabel");
    observed(p.name,"players.name",(v,p) => { text(v,p); });
    observed(p.seat,"players.seat",(v,p) => { const seat = integer(v,p,1,seatCount.status === "MISSING" ? 9 : Number(seatCount.value)); need(!seats.has(seat),p,"assento duplicado."); seats.add(seat); });
    observed(p.position,"players.position",(v,p) => { text(v,p,80); });
    observed(p.holeCards,"players.holeCards",(v,p) => array(v,p,2).forEach(c => card(c,p,true)),["sourceActionIndex"]);
    const cards = p.holeCards as Record<string,unknown>;
    if (Object.hasOwn(cards,"sourceActionIndex") && cards.sourceActionIndex !== null) integer(cards.sourceActionIndex,"holeCards.sourceActionIndex",0,actions.length-1);
    const stack = amount(p.initialStackAtoms,"players.initialStackAtoms"); need(stack>0n,"players.initialStackAtoms","stack inicial deve ser positivo."); return stack;
  });
  const total = sum(initial); need(total<=MAX_ATOMS,"players","soma dos stacks excede limite.");
  const integrity = object(h.integrity,"integrity",["status","validator","validatorVersion","engineMode","gtoAnalysis","evLoss","assumptions","warnings"]);
  need(typeof integrity.status==="string" && ["VALIDATED_COMPLETE","VALIDATED_PARTIAL"].includes(integrity.status),"integrity.status","histórico não validado pelo perfil.");
  literal(integrity.validator,"PokerKit","integrity.validator"); literal(integrity.validatorVersion,"0.7.7","integrity.validatorVersion"); literal(integrity.engineMode,"CASH_GAME","integrity.engineMode");
  literal(integrity.gtoAnalysis,"NOT_EVALUATED","integrity.gtoAnalysis"); literal(integrity.evLoss,null,"integrity.evLoss");
  for (const key of ["assumptions","warnings"]) array(integrity[key],`integrity.${key}`,0,100).forEach(v => text(v,`integrity.${key}`));

  const events = array(h.events,"events",1,2048);
  const paid = Array<bigint>(n).fill(0n), returned = [...paid], awarded = [...paid];
  const holes = Array.from({length:n},() => [null,null] as (string|null)[]), dealt = Array<boolean>(n).fill(false);
  const lastHoleSource: (number|null)[] = Array(n).fill(null);
  const sourceIndices = new Set<number>(); let lastSource: number|null = null;
  let previous: HandSnapshot|undefined;
  events.forEach((value,index) => {
    const path = `events[${index}]`;
    const e = object(value,path,["sequence","sourceActionIndex","origin","kind","playerIndex","amountAtoms","cards","paidAtoms","returnedAtoms","awardedAtoms","before","after"]);
    literal(e.sequence,index,`${path}.sequence`);
    need(e.origin === sourceFormat || e.origin === "RULE_DERIVED",path,"origem de evento inválida.");
    text(e.kind,`${path}.kind`,80);
    need((e.origin === sourceFormat ? reportedKinds : derivedKinds).includes(String(e.kind)),path,"operação fora do perfil/origem.");
    const kind = String(e.kind);
    let actor: number|null = null;
    if (actorKinds.includes(kind)) actor = integer(e.playerIndex,`${path}.playerIndex`,0,n-1); else literal(e.playerIndex,null,`${path}.playerIndex`);
    if (e.origin === sourceFormat) {
      const sourceIndex = integer(e.sourceActionIndex,`${path}.sourceActionIndex`,0,actions.length-1);
      need(sourceIndex === sourceIndices.size,path,"índices da fonte fora de ordem ou duplicados."); sourceIndices.add(sourceIndex); lastSource = sourceIndex;
    } else literal(e.sourceActionIndex,lastSource,`${path}.sourceActionIndex`);
    if (e.amountAtoms !== null) amount(e.amountAtoms,`${path}.amountAtoms`);
    const monetaryOperation=["AntePosting","BlindOrStraddlePosting","CheckingOrCalling","CompletionBettingOrRaisingTo","ChipsPulling"].includes(kind);
    need(monetaryOperation ? e.amountAtoms!==null : e.amountAtoms===null,path,"valor individual incompatível com a operação.");
    const cards = array(e.cards,`${path}.cards`,0,5); cards.forEach(c => card(c,path,true));
    if (kind==="HoleCardsShowingOrMucking") need(cards.length===0 || (cards.length===2 && cards.every(c=>c!==null)),path,"revelação fora do perfil.");
    else if (kind==="CardBurning") need(cards.length===1 && cards[0]===null,path,"burn deve permanecer desconhecido neste perfil.");
    else if (!["HoleDealing","BoardDealing"].includes(kind)) need(cards.length===0,path,"cartas em operação incompatível.");
    const p = amounts(e.paidAtoms,`${path}.paidAtoms`,n), r = amounts(e.returnedAtoms,`${path}.returnedAtoms`,n), a = amounts(e.awardedAtoms,`${path}.awardedAtoms`,n);
    const before = snapshot(e.before,`${path}.before`,n,total), after = snapshot(e.after,`${path}.after`,n,total);
    if (previous) need(equalSnapshot(previous,before),path,"snapshots descontínuos.");
    else need(same(before.stacksAtoms,initial.map(String)) && before.potAtoms === "0" && before.board.length === 0 && before.street === "PREFLOP" && before.folded.every(v=>!v) && before.mucked.every(v=>!v),path,"estado inicial incoerente.");
    need(streets.indexOf(after.street)>=streets.indexOf(before.street),path,"street retrocedeu no histórico.");
    if (kind==="Folding") need(actor!==null && !before.folded[actor] && after.folded[actor],path,"evento fold sem alteração correspondente.");
    if (kind==="HoleCardsShowingOrMucking") need(actor!==null && dealt[actor] && !before.mucked[actor] && (cards.length>0 || after.mucked[actor]),path,"muck/revelação incoerente.");
    if (e.origin === sourceFormat && !["HoleDealing","NoOperation"].includes(kind)) need(dealt.every(Boolean),path,"ação antes da distribuição inicial completa.");
    need(after.board.slice(0,before.board.length).every((c,i)=>c===before.board[i]) && after.board.length>=before.board.length,path,"board retroativo.");
    if (kind === "HoleDealing" || (kind === "HoleCardsShowingOrMucking" && cards.length)) {
      need(actor !== null && cards.length === 2,path,"distribuição/revelação exige jogador e duas cartas.");
      if (kind === "HoleDealing") { need(!dealt[actor],path,"cartas distribuídas duas vezes."); dealt[actor]=true; }
      else need(dealt[actor] && holes[actor].filter(c=>c!==null).every(c=>cards.includes(c)),path,"revelação altera cartas conhecidas ou precede distribuição.");
      holes[actor] = cards as (string|null)[]; lastHoleSource[actor] = e.sourceActionIndex as number;
    }
    if (kind === "BoardDealing") need(cards.every(c=>c!==null) && (before.board.length===0 ? cards.length===3 : cards.length===1) && same([...before.board,...cards],after.board),path,"distribuição do board incoerente.");
    else need(same(before.board,after.board),path,"board mudou sem distribuição.");
    const known = [...holes.flat().filter((c):c is string=>c!==null),...after.board];
    need(validateDeckUnique(known).valid,path,"cartas conhecidas duplicadas.");
    for (let i=0;i<n;i++) {
      need(!before.folded[i] || after.folded[i],path,"fold apagado."); need(!before.mucked[i] || after.mucked[i],path,"muck apagado.");
      if (before.folded[i]!==after.folded[i]) need(kind==="Folding"&&i===actor,path,"fold sem evento correspondente.");
      if (before.mucked[i]!==after.mucked[i]) need(kind==="HoleCardsShowingOrMucking"&&cards.length===0&&i===actor,path,"muck sem evento correspondente.");
      paid[i]+=p[i]; returned[i]+=r[i]; awarded[i]+=a[i];
    }
    if (["AntePosting","BlindOrStraddlePosting","CheckingOrCalling","CompletionBettingOrRaisingTo"].includes(kind)) {
      need(actor!==null && p.every((v,i)=>i===actor || v===0n) && amount(before.stacksAtoms[actor],path)-amount(after.stacksAtoms[actor],path)===p[actor],path,"pagamento diverge do stack.");
      need(e.amountAtoms!==null && (kind==="CompletionBettingOrRaisingTo" ? after.betsAtoms[actor]===e.amountAtoms : p[actor]===amount(e.amountAtoms,path)),path,"valor da ação incoerente.");
    } else need(p.every(v=>v===0n),path,"contribuição em operação incompatível.");
    if (kind === "UncollectedBetReturn") need(equalSnapshot(before,after) && sum(r)>0n,path,"classificação de devolução incoerente.");
    else if (kind === "BetCollection") need(r.every((v,i)=>v===amount(after.stacksAtoms[i],path)-amount(before.stacksAtoms[i],path)),path,"devolução diverge do stack.");
    else need(r.every(v=>v===0n),path,"devolução em operação incompatível.");
    if (!monetaryOperation && kind!=="BetCollection") need(same(before.stacksAtoms,after.stacksAtoms),path,"stack mudou sem movimentação física.");
    if (kind !== "ChipsPushing") need(a.every(v=>v===0n),path,"prêmio em operação incompatível.");
    if (kind === "ChipsPulling") need(actor!==null && e.amountAtoms!==null && amount(after.stacksAtoms[actor],path)-amount(before.stacksAtoms[actor],path)===amount(e.amountAtoms,path),path,"coleta diverge do stack.");
    previous = after;
  });
  need(sourceIndices.size===actions.length,"events","ações da fonte sem evento correspondente.");
  need(dealt.every(Boolean),"events","distribuição inicial incompleta para este perfil.");
  players.forEach((v,i) => {
    const p = v as Record<string,unknown>, hole = p.holeCards as Record<string,unknown>;
    need(hole.status!=="MISSING" && same(hole.value,holes[i]),"players.holeCards","agregado final diverge dos eventos.");
    if (Object.hasOwn(hole,"sourceActionIndex")) literal(hole.sourceActionIndex,lastHoleSource[i],"players.holeCards.sourceActionIndex");
  });
  const ending = snapshot(h.ending,"ending",n,total); need(previous && equalSnapshot(previous,ending),"ending","estado final diverge do último evento.");
  const result = object(h.results,"results",["complete","computedFinalStacksAtoms","reportedEndingStacksAtoms","grossContributionsAtoms","returnedAtoms","netContributionsAtoms","awardsAtoms"]);
  boolean(result.complete,"results.complete"); literal(result.complete,integrity.status==="VALIDATED_COMPLETE","results.complete");
  need(same(amounts(result.grossContributionsAtoms,"results.grossContributionsAtoms",n).map(String),paid.map(String)),"results","contribuições divergem dos eventos.");
  need(same(amounts(result.returnedAtoms,"results.returnedAtoms",n).map(String),returned.map(String)),"results","devoluções divergem dos eventos.");
  need(same(amounts(result.awardsAtoms,"results.awardsAtoms",n).map(String),awarded.map(String)),"results","prêmios divergem dos eventos.");
  const net = amounts(result.netContributionsAtoms,"results.netContributionsAtoms",n);
  need(net.every((v,i)=>v===paid[i]-returned[i]),"results","contribuição líquida incoerente.");
  observed(result.reportedEndingStacksAtoms,"results.reportedEndingStacksAtoms",(v,p)=> { need(same(amounts(v,p,n).map(String),ending.stacksAtoms),p,"stacks reportados divergentes."); });
  const potAwards = Array<bigint>(n).fill(0n);
  const pots = array(h.pots,"pots",0,n);
  pots.forEach((v,i) => {
    const pot = object(v,`pots[${i}]`,["index","amountAtoms","eligiblePlayerIndices","awardsAtoms","origin"]);
    literal(pot.index,i,"pots.index"); literal(pot.origin,"RULE_DERIVED","pots.origin");
    const eligible = array(pot.eligiblePlayerIndices,"pots.eligiblePlayerIndices",1,n).map(v=>integer(v,"pots.eligiblePlayerIndices",0,n-1));
    need(new Set(eligible).size===eligible.length && eligible.every(i=>!ending.folded[i]&&!ending.mucked[i]),"pots","elegibilidade incoerente.");
    const awards = amounts(pot.awardsAtoms,"pots.awardsAtoms",n);
    need(sum(awards)===amount(pot.amountAtoms,"pots.amountAtoms") && awards.every((v,i)=>v===0n||eligible.includes(i)),"pots","distribuição do pote incoerente.");
    awards.forEach((v,i)=>{potAwards[i]+=v;});
  });
  if (result.complete) {
    const final = amounts(result.computedFinalStacksAtoms,"results.computedFinalStacksAtoms",n);
    need(same(final.map(String),ending.stacksAtoms) && ending.potAtoms==="0" && ending.actorIndex===null,"results","mão concluída com liquidação pendente.");
    need(sum(net)===sum(awarded) && final.every((v,i)=>v===initial[i]-net[i]+awarded[i]) && same(potAwards.map(String),awarded.map(String)),"results","liquidação não conserva fichas.");
  } else need(result.computedFinalStacksAtoms===null && pots.length===0 && awarded.every(v=>v===0n),"results","prefixo parcial não pode conter resultado final.");
  need(h.metadata!==null && typeof h.metadata==="object" && !Array.isArray(h.metadata),"metadata","esperado objeto.");
  metadata(h.metadata);
  return h as unknown as CanonicalHand;
}

export function parseCanonicalHandText(input: string): CanonicalHand {
  need(input.length<=MAX_REPLAY_JSON_BYTES && new TextEncoder().encode(input).length<=MAX_REPLAY_JSON_BYTES,"arquivo","limite de 6 MiB.");
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new HandJsonError("arquivo","JSON inválido."); }
  if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value,"ok")) {
    const envelope = value as Record<string,unknown>;
    if (envelope.ok !== true) {
      const issue = Array.isArray(envelope.issues) ? envelope.issues[0] : null;
      const code = issue && typeof issue === "object" && typeof issue.code === "string" ? issue.code.slice(0,80) : "IMPORTACAO_RECUSADA";
      throw new HandJsonError("importação",`histórico recusado pelo pipeline (${code}).`);
    }
    object(value,"envelope",["ok","hand"],["status","issues"]);
    if (Object.hasOwn(envelope,"issues")) need(Array.isArray(envelope.issues)&&envelope.issues.length===0,"envelope","issues incompatíveis com sucesso.");
    const hand = validateCanonicalHand(envelope.hand);
    if (Object.hasOwn(envelope,"status")) literal(envelope.status,hand.integrity.status,"envelope.status");
    return hand;
  }
  return validateCanonicalHand(value);
}
