import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateHand} from "../poker/labEvaluator.ts";
import {parseLabRange,legalRange} from "../poker/labRanges.ts";
import {choose,estimateEquityWork,runEquity,type EquityInput} from "../poker/labEquity.ts";
import {calculateLabEv,sensitivity,type EvInput} from "../poker/labEv.ts";
import {buildReplayFrame} from "../poker/handReplay.ts";
import {parseCanonicalHandText} from "../poker/handHistoryValidation.ts";
import {replayToLab} from "../poker/labTransfer.ts";
import {readFileSync} from "node:fs";
const board="2c 3d 7h 9s Jc".split(" ");
function input(players=["AsAh","KsKh"],extra:Partial<EquityInput>={}):EquityInput{return {players:players.map(p=>parseLabRange(p)),board,dead:[],method:"exact",seed:"fixed-307",samples:10000,...extra};}
function near(a:number,b:number,tol=1e-12){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}
test("avaliador: dez categorias incluindo royal, wheel e kickers",()=>{
  const cases=[
    ["As Kd Qh 9c 7s","Carta alta"],["As Ad Qh 9c 7s","Um par"],["As Ad Qh Qc 7s","Dois pares"],["As Ad Ah Qc 7s","Trinca"],["As 2d 3h 4c 5s","Sequência"],["As Js 8s 7s 2s","Flush"],["As Ad Ah Qc Qs","Full house"],["As Ad Ah Ac Qs","Quadra"],["9s 8s 7s 6s 5s","Straight flush"],["As Ks Qs Js Ts","Straight flush"]];
  for(const [hand,category] of cases)assert.equal(evaluateHand(hand.split(" ")).category,category);
  assert.ok(evaluateHand("As 2d 3h 4c 5s".split(" ")).score<evaluateHand("2s 3d 4h 5c 6s".split(" ")).score);
  assert.ok(evaluateHand("As Ad Kh Qc 9s 2d 3c".split(" ")).score>evaluateHand("Ac Ah Ks Jc 9h 2s 3d".split(" ")).score);
  assert.equal(evaluateHand("As Ad Kh Qc 9s 2d 3c".split(" ")).score,evaluateHand("Ac Ah Ks Qh 9h 2s 3d".split(" ")).score);
  assert.ok(evaluateHand("As Ad Ah Ks Kd Kh 2s".split(" ")).score>evaluateHand("Ks Kd Kh Qs Qd 3c 2s".split(" ")).score);
});
test("entradas inválidas, blockers e ranges incompatíveis",async()=>{
  assert.throws(()=>evaluateHand(["As","As","Kh","Qd","2c"]),/duplicad/);
  assert.throws(()=>parseLabRange("AA,AsAh"),/repetido/);
  assert.throws(()=>parseLabRange("AKs:NaN"));assert.throws(()=>parseLabRange("AA:-.1"));
  assert.equal(parseLabRange("AA,AKs,AKo").combos.length,22);
  assert.equal(legalRange(parseLabRange("AA"),["As"]).combos.length,3);
  assert.throws(()=>estimateEquityWork(input(["AsAh","AhKh"])),/incompatíveis/);
  await assert.rejects(runEquity(input(undefined,{dead:["2c"]})),/duplicad/);
  await assert.rejects(runEquity(input(["AsAh","KsKh"],{board:["As",...board.slice(1)]})),/sem combinações/);
});
test("100%, 0%, empate obrigatório e multiway: conservação do pote",async()=>{
  const r=await runEquity(input());near(r.players[0].equity,1);near(r.players[1].equity,0);near(r.players[0].win,1);
  const tie=await runEquity(input(["2c3d","4c5d","6c7d"],{board:"As Ks Qs Js Ts".split(" ")}));
  for(const p of tie.players){near(p.equity,1/3);near(p.tie,1);near(p.win,0);}
  near(tie.players.reduce((n,p)=>n+p.equity,0),1);
});
test("enumeração turn analítica: AA perde somente nos dois reis restantes",async()=>{
  const r=await runEquity(input(undefined,{board:board.slice(0,4)}));assert.equal(r.samples,44);near(r.players[0].equity,42/44);
  const dead=await runEquity(input(undefined,{board:board.slice(0,4),dead:["Kd"]}));assert.equal(dead.samples,43);near(dead.players[0].equity,42/43);
  assert.equal(choose(48,5),1712304);
});
test("pesos condicionados à distribuição conjunta legal",async()=>{
  const weighted=await runEquity(input(["AsAh:1,QsQh:0.5","KsKh"]));near(weighted.players[0].equity,2/3);
  const r=await runEquity(input(["AsAh:0.5,QsQh:0.5","KsKh:0.1,AsAd:0.9"]));near(r.players[0].equity,1/11);assert.equal(r.preflight.legalTuples,3);
  near(r.players.reduce((n,p)=>n+p.equity,0),1);
});
test("limites recusam enumeração antes do trabalho; cancelamento e timeout",async()=>{
  const large=input(["AA","KK"],{board:[]});assert.equal(estimateEquityWork(large).exactAllowed,false);await assert.rejects(runEquity(large),/recusada/);
  await assert.rejects(runEquity(input(),{cancelled:()=>true}),/cancelado/);
  let ticks=0;await assert.rejects(runEquity(input(),{now:()=>ticks++*100_000}),/60 s/);
  await assert.rejects(runEquity(input(undefined,{method:"monte-carlo",samples:1000001})),/amostras/);
});
test("Monte Carlo: seeds fixas, reprodução, IC de fração de pote e convergência",async()=>{
  const fixed=input(undefined,{board:board.slice(0,4),method:"monte-carlo",samples:10000});
  const a=await runEquity(fixed),b=await runEquity(fixed);assert.deepEqual(a.players,b.players);assert.deepEqual(a.evolution,b.evolution);assert.equal(a.samples,10000);
  const target=42/44,se=a.players[0].standardError!;assert.ok(Math.abs(a.players[0].equity-target)<5*se);assert.ok(se>0);
  near(se,Math.sqrt(a.players[0].equity*(1-a.players[0].equity)/(a.samples-1)));
  const multi=await runEquity(input(["2c3d","4c5d","6c7d"],{method:"monte-carlo",samples:1000,board:"As Ks Qs Js Ts".split(" ")}));
  near(multi.players[0].equity,1/3);near(multi.players[0].standardError!,0);near(multi.players[0].tie,1);
  assert.match(multi.intervalMethod,/frações/);assert.match(multi.intervalMethod,/degenerad/);
  assert.ok(multi.players[0].confidence95![0]<1/3);assert.ok(multi.players[0].confidence95![1]>1/3);
  near(multi.players[0].confidence95![1]-1/3,Math.sqrt(Math.log(40)/2000));
});
test("Monte Carlo ponderado não amostra sequencialmente ranges incompatíveis",async()=>{
  const r=await runEquity(input(["AsAh:0.5,QsQh:0.5","KsKh:0.1,AsAd:0.9"],{method:"monte-carlo",samples:20000}));
  assert.ok(Math.abs(r.players[0].equity-1/11)<5*r.players[0].standardError!);assert.ok(r.attempts>r.samples);
  near(r.players.reduce((n,p)=>n+p.equity,0),1,1e-10);
});
test("frações de pote variáveis usam sua variância, sem aproximação Bernoulli",async()=>{
  const fractional=input(["AsKd","AhQd:1,6h6d:1","KsKh"],{board:"2c 3d 4h 5s 9c".split(" ")});
  const exact=await runEquity(fractional);near(exact.players[0].equity,.25);near(exact.players[0].tie,.5);
  const mc=await runEquity({...fractional,method:"monte-carlo",samples:10000}),hero=mc.players[0];
  near(hero.standardError!,Math.sqrt((.5*hero.equity-hero.equity**2)/(mc.samples-1)));
  assert.ok(Math.abs(hero.equity-.25)<5*hero.standardError!);assert.ok(hero.confidence95![0]<.25&&hero.confidence95![1]>.25);
});
test("contagens grandes preservam inteiros e entradas grandes são recusadas",()=>{
  const range=parseLabRange("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AKo");
  const p=estimateEquityWork(input(undefined,{players:Array.from({length:6},()=>range),board:[]}));
  assert.equal(p.outcomesDecimal,(BigInt(range.combos.length)**6n*BigInt(p.runoutsPerTuple)).toString());
  assert.equal(p.countIsUpperBound,true);assert.equal(p.exactAllowed,false);
  assert.throws(()=>parseLabRange(" ".repeat(60001)),/60.000/);
  assert.throws(()=>parseLabRange("AA:0.00000000001"),/limite numérico/);
  assert.throws(()=>estimateEquityWork({...input(),seed:" ".repeat(3*1024*1024)}),/2 MiB/);
});
test("cancelamento em lotes; curvas 1k, 10k e 100k são prefixos reproduzíveis",async()=>{
  let cancel=false;await assert.rejects(runEquity(input(undefined,{method:"monte-carlo",samples:100000}),{progress:()=>{cancel=true;},cancelled:()=>cancel}),/cancelado/);
  const r=await runEquity(input(undefined,{method:"monte-carlo",board:board.slice(0,4),samples:100000}));assert.equal(r.samples,100000);assert.ok(r.evolution.length>10);
});
const ev:EvInput={pot:10,bet:5,call:5,equity:.25,fold:1/3,callFrequency:2/3,equityWhenCalled:0,checkEquity:.5,cost:0,betFrequency:.5};
test("EV: referências analíticas, equilíbrio, extremos, valores fracionários e sizings",()=>{
  near(calculateLabEv(ev).evCall,0);near(calculateLabEv(ev).evBluff,0);
  near(calculateLabEv({...ev,equity:0}).evCall,-5);near(calculateLabEv({...ev,equity:.5}).evCall,5);near(calculateLabEv({...ev,equity:1}).evCall,15);
  near(calculateLabEv({...ev,fold:0,callFrequency:1}).evBluff,-5);near(calculateLabEv({...ev,fold:1,callFrequency:0}).evBluff,10);
  for(const bet of [.125,1,10000]){const r=calculateLabEv({...ev,bet,call:bet});near(r.evCall,.25*(10+2*bet)-bet);near(r.odds.requiredEquity,bet/(10+2*bet));}
  const r=calculateLabEv({...ev,equityWhenCalled:.5,cost:1});near(r.evBet,(1/3)*10+(2/3)*5-1);near(r.evCheck,5);near(r.evMixed,(r.evBet+5)/2);assert.equal(r.icm,"INDISPONÍVEL");
  assert.equal(sensitivity(ev,"fold").length,51);
  near(sensitivity(ev,"checkEquity")[50].y,10);near(sensitivity(ev,"checkEquity")[0].y,0);
  near(sensitivity(ev,"betFrequency")[0].y,5);near(sensitivity(ev,"betFrequency")[50].y,0);
  assert.equal(sensitivity({...ev,pot:1e12},"pot").at(-1)!.x,1e12);
});
test("EV rejeita NaN, probabilidades incompletas e custo/condições fora do modelo",()=>{
  for(const bad of [{fold:.8},{callFrequency:NaN},{equity:1.1},{pot:0},{bet:Infinity},{cost:-1},{call:0}])assert.throws(()=>calculateLabEv({...ev,...bad}));
});
test("transferência do Replayer preserva visibilidade temporal e não inventa ranges",()=>{
  const hand=parseCanonicalHandText(readFileSync(new URL("../../../public/replays/hu_fold.json",import.meta.url),"utf8"));
  const frame=buildReplayFrame(hand,0,{kind:"public"}),scenario=replayToLab(hand,frame);assert.deepEqual(scenario.board,[]);assert.ok(scenario.players.every(p=>p.cards.length===0));
});
