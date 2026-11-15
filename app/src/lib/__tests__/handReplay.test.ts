import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { CanonicalHand } from "../poker/handHistorySchema.ts";
import { MAX_REPLAY_JSON_BYTES, parseCanonicalHandText, validateCanonicalHand } from "../poker/handHistoryValidation.ts";
import { buildReplayFrame, formatAtoms, INITIAL_PLAYBACK, playbackTransition, replayEventLabel } from "../poker/handReplay.ts";

const names=["hu_fold","decimal_fold","three_way_allin","folded_sidepot","split_odd_ante","showdown_muck","partial_flop","late_reveal"];
function raw(name="hu_fold") { return readFileSync(`public/replays/${name}.json`,"utf8"); }
function hand(name="hu_fold") { return parseCanonicalHandText(raw(name)); }
function altered(mutate:(h:CanonicalHand)=>void,name="hu_fold") { const value=hand(name); mutate(value); return value; }
function indexOf(h:CanonicalHand,kind:string,player?:number) { return h.events.findIndex(e=>e.kind===kind&&(player===undefined||e.playerIndex===player)); }

describe("Fase 2B — validação runtime do contrato, sem autenticação de origem",()=>{
  it("aceita os oito exemplos reais do pipeline e confere os hashes do catálogo",()=>{
    const manifest=JSON.parse(readFileSync("src/data/replayExamples.json","utf8")) as {id:string;canonicalSha256:string;sourceSha256:string}[];
    assert.equal(manifest.length,8);
    for(const example of manifest) {
      const h=hand(example.id);
      assert.equal(createHash("sha256").update(raw(example.id)).digest("hex"),example.canonicalSha256);
      assert.equal(h.source.sha256,example.sourceSha256);
      assert.equal(h.integrity.gtoAnalysis,"NOT_EVALUATED"); assert.equal(h.integrity.evLoss,null);
    }
  });
  it("aceita canônico, saída de importação e exportação única do CLI",()=>{
    const h=hand();
    for(const value of [h,{ok:true,hand:h},{ok:true,status:h.integrity.status,issues:[],hand:h}]) assert.deepEqual(parseCanonicalHandText(JSON.stringify(value)),h);
    assert.throws(()=>parseCanonicalHandText(JSON.stringify({ok:true,status:"VALIDATED_PARTIAL",hand:h})),/envelope.status/);
  });
  it("recusa o diagnóstico inválido, JSON malformado e arquivos grandes",()=>{
    assert.throws(()=>parseCanonicalHandText(raw("invalid_missing_call")),/ILLEGAL_ACTION/);
    for(const text of ["{","[]","null",'"string"']) assert.throws(()=>parseCanonicalHandText(text));
    assert.throws(()=>parseCanonicalHandText(" ".repeat(MAX_REPLAY_JSON_BYTES+1)),/6 MiB/);
  });
  it("recusa versões, perfil, identificadores, tipos e campos não permitidos",()=>{
    for(const value of [altered(h=>Object.assign(h,{schemaVersion:"2.0.0"})),altered(h=>Object.assign(h,{profile:"NEW"})),altered(h=>h.recordId="phh-sha256:"+"0".repeat(64)),altered(h=>Object.assign(h.table,{playerCount:"2"})),altered(h=>Object.assign(h,{referenceStrategy:{status:"VERIFIED"}})),altered(h=>Object.assign(h,{metadata:null})),altered(h=>Object.assign(h.players[0].seat,{value:2}))]) assert.throws(()=>validateCanonicalHand(value));
    assert.throws(()=>validateCanonicalHand(altered(h=>Object.assign(h.integrity,{gtoAnalysis:"VERIFIED"}))));
    assert.throws(()=>validateCanonicalHand(altered(h=>Object.assign(h.integrity,{evLoss:0}))));
    assert.throws(()=>validateCanonicalHand(altered(h=>Object.assign(h.players[0].name,{status:["REPORTED"]}))));
    assert.throws(()=>validateCanonicalHand(altered(h=>Object.assign(h.events[0],{kind:["BlindOrStraddlePosting"]}))));
    assert.throws(()=>validateCanonicalHand(altered(h=>Object.assign(h.events[0].before,{street:["PREFLOP"]}))));
    assert.throws(()=>validateCanonicalHand(altered(h=>h.source.importedAtUtc="2026-02-31T00:00:00Z")));
  });
  it("não coage números/strings monetárias nem aceita overflow ou dupla devolução",()=>{
    for(const value of [1,-1,"-1","1.0","01","1e2","9007199254740992",true]) {
      const h=altered(h=>Object.assign(h.events[0].after.stacksAtoms,{0:value})); assert.throws(()=>validateCanonicalHand(h));
    }
    assert.throws(()=>validateCanonicalHand(altered(h=>h.results.returnedAtoms[0]="2")),/devoluções/);
    assert.throws(()=>validateCanonicalHand(altered(h=>h.results.awardsAtoms[0]="4")),/prêmios/);
  });
  it("recusa eventos quebrados, atores inexistentes e máscaras incompatíveis",()=>{
    for(const value of [altered(h=>h.events[0].sequence=1),altered(h=>h.events[0].playerIndex=2),altered(h=>h.events[3].sourceActionIndex=0),altered(h=>h.events[1].before.potAtoms="4"),altered(h=>h.events[0].after.allIn[0]=true),altered(h=>h.events[0].after.folded[1]=true),altered(h=>h.ending.stacksAtoms[0]="100")]) assert.throws(()=>validateCanonicalHand(value));
  });
  it("recusa cartas inválidas, duplicadas, retroativas e agregados divergentes",()=>{
    assert.throws(()=>validateCanonicalHand(altered(h=>h.events[3].cards=["As","As"])));
    assert.throws(()=>validateCanonicalHand(altered(h=>h.events[3].cards=["Xs","Kd"])));
    assert.throws(()=>validateCanonicalHand(altered(h=>h.events[0].before.board=["As","Kd","2c"])));
    assert.throws(()=>validateCanonicalHand(altered(h=>{h.players[0].holeCards={status:"REPORTED",value:["2c","3d"]};})));
  });
  it("recusa elegibilidade/pagamentos incoerentes e resultado final em prefixo",()=>{
    assert.throws(()=>validateCanonicalHand(altered(h=>h.pots[0].eligiblePlayerIndices=[1])),/elegibilidade|distribuição/);
    assert.throws(()=>validateCanonicalHand(altered(h=>h.pots[0].amountAtoms="3")),/distribuição/);
    assert.throws(()=>validateCanonicalHand(altered(h=>h.results.computedFinalStacksAtoms=["98","98"],"partial_flop")),/prefixo parcial/);
    assert.throws(()=>validateCanonicalHand(altered(h=>h.results.complete=true,"partial_flop")),/results.complete/);
  });
  it("confere limites de metadados e mantém distinção entre tipo e autenticidade",()=>{
    const h=hand(); h.metadata=JSON.parse('{"__proto__":{}}'); assert.throws(()=>validateCanonicalHand(h),/chave/);
    const renamed=altered(h=>h.players[0].name={status:"REPORTED",value:"Nome editado localmente"});
    assert.equal(validateCanonicalHand(renamed).players[0].name.status,"REPORTED");
    // Um JSON coerente editado pode passar pelo contrato; isso não prova sua origem.
    assert.equal("authenticated" in renamed,false);
  });
});

describe("Fase 2B — frames e integridade temporal",()=>{
  it("conserva todas as fichas em cada frame dos oito exemplos",()=>{
    for(const name of names) {
      const h=hand(name), original=JSON.stringify(h);
      const total=h.players.reduce((a,p)=>a+BigInt(p.initialStackAtoms),0n);
      for(let cursor=0;cursor<=h.events.length;cursor++) {
        const f=buildReplayFrame(h,cursor,{kind:"public"});
        assert.equal(f.snapshot.stacksAtoms.reduce((a,v)=>a+BigInt(v),0n)+BigInt(f.snapshot.potAtoms),total);
        if(cursor) assert.deepEqual(f.snapshot,h.events[cursor-1].after);
      }
      assert.equal(JSON.stringify(h),original);
    }
  });
  it("avança, regride e volta ao início sem acumular pagamentos ou cartas",()=>{
    const h=hand("three_way_allin");
    const end=buildReplayFrame(h,h.events.length,{kind:"public"}); assert.equal(end.completed,true);
    const first=buildReplayFrame(h,0,{kind:"recorded"}); assert.deepEqual(first.visibleCards,[[null,null],[null,null],[null,null]]);
    assert.equal(first.snapshot.potAtoms,"0");
    const at4=buildReplayFrame(h,4,{kind:"recorded"});
    buildReplayFrame(h,20,{kind:"recorded"});
    assert.deepEqual(buildReplayFrame(h,4,{kind:"recorded"}),at4);
    assert.throws(()=>buildReplayFrame(h,-1,{kind:"public"})); assert.throws(()=>buildReplayFrame(h,0,{kind:"player",playerIndex:9}));
  });
  it("board aparece somente nos eventos alcançados e acompanha as streets",()=>{
    const h=hand("split_odd_ante");
    for(const [i,e] of h.events.entries()) if(e.kind==="BoardDealing") {
      assert.deepEqual(buildReplayFrame(h,i,{kind:"public"}).snapshot.board,e.before.board);
      assert.deepEqual(buildReplayFrame(h,i+1,{kind:"public"}).snapshot.board,e.after.board);
    }
    assert.equal(buildReplayFrame(h,0,{kind:"public"}).snapshot.street,"PREFLOP");
    assert.equal(buildReplayFrame(h,h.events.length,{kind:"public"}).snapshot.street,"RIVER");
  });
  it("aplica perspectivas sem mostrar cartas antes de sua distribuição",()=>{
    const h=hand(), dealt=indexOf(h,"HoleDealing",1)+1;
    for(const perspective of [{kind:"public"} as const,{kind:"player",playerIndex:1} as const,{kind:"recorded"} as const]) assert.deepEqual(buildReplayFrame(h,dealt-1,perspective).visibleCards[1],[null,null]);
    assert.deepEqual(buildReplayFrame(h,dealt,{kind:"public"}).visibleCards[1],[null,null]);
    assert.deepEqual(buildReplayFrame(h,dealt,{kind:"player",playerIndex:0}).visibleCards[1],[null,null]);
    assert.deepEqual(buildReplayFrame(h,dealt,{kind:"player",playerIndex:1}).visibleCards[1],["As","Kd"]);
    assert.deepEqual(buildReplayFrame(h,dealt,{kind:"recorded"}).visibleCards[1],["As","Kd"]);
  });
  it("não consulta o agregado final para antecipar cartas desconhecidas",()=>{
    const h=hand("late_reveal"), reveal=indexOf(h,"HoleCardsShowingOrMucking",0)+1;
    for(const perspective of [{kind:"public"} as const,{kind:"player",playerIndex:0} as const,{kind:"recorded"} as const]) {
      assert.deepEqual(buildReplayFrame(h,reveal-1,perspective).visibleCards[0],[null,null]);
      assert.deepEqual(buildReplayFrame(h,reveal,perspective).visibleCards[0],["2c","3d"]);
    }
    assert.deepEqual(buildReplayFrame(h,reveal-1,{kind:"public"}).visibleCards[1],[null,null]);
    assert.equal(buildReplayFrame(h,reveal,{kind:"public"}).showdown,true);
  });
  it("muck mantém cartas legitimamente conhecidas e não as torna públicas",()=>{
    const h=hand("showdown_muck"), muck=indexOf(h,"HoleCardsShowingOrMucking",0)+1;
    assert.deepEqual(buildReplayFrame(h,muck,{kind:"recorded"}).visibleCards[0],["2c","3d"]);
    assert.deepEqual(buildReplayFrame(h,muck,{kind:"public"}).visibleCards[0],[null,null]);
    assert.equal(buildReplayFrame(h,muck,{kind:"public"}).snapshot.mucked[0],true);
    const folded=hand(); assert.equal(buildReplayFrame(folded,indexOf(folded,"Folding")+1,{kind:"public"}).snapshot.folded[1],true);
    const allin=hand("three_way_allin"); assert.equal(buildReplayFrame(allin,indexOf(allin,"CheckingOrCalling",0)+1,{kind:"public"}).snapshot.allIn[0],true);
  });
  it("não duplica devoluções e separa prêmio destinado de crédito físico",()=>{
    const h=hand(), returned=indexOf(h,"UncollectedBetReturn")+1;
    const before=buildReplayFrame(h,returned-1,{kind:"public"}), after=buildReplayFrame(h,returned,{kind:"public"});
    assert.equal(after.returnedAtoms[0],"1"); assert.deepEqual(after.snapshot,before.snapshot);
    const push=buildReplayFrame(h,indexOf(h,"ChipsPushing")+1,{kind:"public"});
    assert.equal(push.awardsAtoms[0],"2"); assert.equal(push.snapshot.stacksAtoms[0],"98");
    const end=buildReplayFrame(h,h.events.length,{kind:"public"}); assert.equal(end.snapshot.stacksAtoms[0],"101");assert.equal(end.returnedAtoms[0],"1");
  });
  it("prefixo termina sem vencedor nem liquidação e labels não revelam cartas",()=>{
    const h=hand("partial_flop"), frame=buildReplayFrame(h,h.events.length,{kind:"recorded"});
    assert.equal(frame.atEnd,true);assert.equal(frame.completed,false);assert.deepEqual(frame.awardsAtoms,["0","0"]);
    assert.equal(frame.snapshot.potAtoms,"4");
    for(const name of names) for(const event of hand(name).events) assert.equal(/[2-9TJQKA][cdhs]/.test(replayEventLabel(event)),false);
  });
  it("formata valores e deltas sem conversão em ponto flutuante",()=>{
    assert.equal(formatAtoms("101",2),"1,01"); assert.equal(formatAtoms("2",6),"0,000002");
    assert.equal(formatAtoms("9007199254740991",6),"9.007.199.254,740991");assert.equal(formatAtoms(-1n,2),"−0,01");
    assert.throws(()=>formatAtoms("1.1",2));assert.throws(()=>formatAtoms("1",7));
  });
});

describe("Fase 2B — estado dos controles de reprodução",()=>{
  it("play, tick, pause e retomada respeitam o cursor",()=>{
    let s={...INITIAL_PLAYBACK};s=playbackTransition(s,{type:"play"},9);assert.equal(s.playing,true);
    s=playbackTransition(s,{type:"tick"},9);assert.equal(s.cursor,1);
    s=playbackTransition(s,{type:"pause"},9);assert.equal(s.playing,false);
    assert.deepEqual(playbackTransition(s,{type:"tick"},9),s);
    s=playbackTransition(s,{type:"play"},9);assert.equal(playbackTransition(s,{type:"tick"},9).cursor,2);
  });
  it("velocidade muda o intervalo sem avançar eventos e seleção pausa",()=>{
    let s=playbackTransition(INITIAL_PLAYBACK,{type:"play"},9);
    for(const delayMs of [500,1000,2000]) {s=playbackTransition(s,{type:"speed",delayMs},9);assert.equal(s.cursor,0);assert.equal(s.delayMs,delayMs);assert.equal(s.playing,true);}
    assert.deepEqual(playbackTransition(s,{type:"speed",delayMs:0},9),s);
    s=playbackTransition(s,{type:"goto",cursor:4},9);assert.equal(s.cursor,4);assert.equal(s.playing,false);
  });
  it("para no final, limita a navegação e rejeita cursor inválido",()=>{
    const s=playbackTransition({cursor:8,playing:true,delayMs:500},{type:"tick"},9);
    assert.deepEqual(s,{cursor:9,playing:false,delayMs:500});assert.equal(playbackTransition(s,{type:"play"},9).playing,false);
    assert.equal(playbackTransition(s,{type:"goto",cursor:500},9).cursor,9);assert.equal(playbackTransition(s,{type:"goto",cursor:-1},9).cursor,0);
    assert.throws(()=>playbackTransition(s,{type:"goto",cursor:NaN},9));assert.throws(()=>playbackTransition(s,{type:"tick"},0));
  });
});
