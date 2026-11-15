import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {assertLibraryAccess,limitedBody} from "../server/libraryAccess.ts";
import {importLibraryBatch,readLibraryReplay,runLatest,type BatchResult,type LibraryReplay} from "../handLibraryClient.ts";
import {validateCanonicalHand} from "../poker/handHistoryValidation.ts";
import {buildReplayFrame} from "../poker/handReplay.ts";
import {GET,POST} from "../../app/api/hand-library/route.ts";

const root=resolve("..");
const fixture=(name:string)=>readFileSync(resolve(root,"pipeline/hand_history/fixtures",name+".phh"));
const hand=(name:string)=>validateCanonicalHand(JSON.parse(readFileSync(resolve(root,"app/public/replays",name+".json"),"utf8")));
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function request(action:string,method="GET",body?:BodyInit,extra:Record<string,string>={}) {
  return new Request("http://localhost:3000/api/hand-library?action="+action,{method,headers:{Host:"localhost:3000",Origin:"http://localhost:3000","X-Poker-Library":"local-v1",...extra},body});
}

describe("Fase 2C — fronteira local e limites",()=>{
  it("recusa backend desativado, host externo, CSRF, falta de cabeçalho e métodos",()=>{
    assert.throws(()=>assertLibraryAccess(request("list"),"0"),/desativada/);
    assert.doesNotThrow(()=>assertLibraryAccess(request("list"),"1"));
    assert.doesNotThrow(()=>assertLibraryAccess(request("study","POST","{}",{Host:"127.0.0.1:3000",Origin:"http://127.0.0.1:3000"}),"1"));
    for(const bad of [new Request("http://evil.invalid/api",{headers:{host:"evil.invalid","x-poker-library":"local-v1"}}),request("list","GET",undefined,{"X-Poker-Library":""}),request("study","POST","{}",{Origin:"http://evil.invalid"}),request("list","GET",undefined,{"Sec-Fetch-Site":"cross-site"}),request("list","DELETE")]) assert.throws(()=>assertLibraryAccess(bad,"1"));
  });
  it("limita bytes reais mesmo sem Content-Length e rejeita comprimento falso",async()=>{
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6));controller.close();}});
    await assert.rejects(limitedBody(new Request("http://localhost",{method:"POST",body:stream,duplex:"half"} as RequestInit),10),/limite/);
    await assert.rejects(limitedBody(new Request("http://localhost",{method:"POST",body:"x",headers:{"content-length":"999"}}),10),/limite/);
    assert.equal(new TextDecoder().decode(await limitedBody(new Request("http://localhost",{method:"POST",body:"abc"}),3)),"abc");
  });
});

describe("Fase 2C — lotes e seleção concorrente",()=>{
  it("continua após erro individual e distingue cinco resultados",async()=>{
    const results:BatchResult[]=[];
    const files=["good.phh","duplicate.phh","broken.json","unsupported.txt","storage.phh","after.phh"].map(n=>new File(["abc"],n));
    await importLibraryBatch(files,r=>results.push(r),async(file)=>{
      if(file.name==="storage.phh")throw new Error("SQLite indisponível");
      return {status:file.name==="duplicate.phh"?"DUPLICATE":file.name==="broken.json"?"INVALID":"IMPORTED",message:"Resultado individual"};
    });
    assert.deepEqual(results.map(r=>r.status),["IMPORTED","DUPLICATE","INVALID","UNSUPPORTED","ERROR","IMPORTED"]);
  });
  it("recusa lotes excessivos, vazios e arquivos acima do limite antes de enviar",async()=>{
    let calls=0;const send=async()=>{calls++;return {status:"IMPORTED" as const,message:"ok"};};
    await assert.rejects(importLibraryBatch(Array.from({length:21},()=>new File(["a"],"a.phh")),()=>{},send),/20 arquivos/);
    await assert.rejects(importLibraryBatch([new File([new Uint8Array(21*1024*1024)],"a.json")],()=>{},send),/20 MiB/);
    const result:BatchResult[]=[];
    await importLibraryBatch([new File([],"empty.phh"),new File([new Uint8Array(1_048_577)],"big.phh")],r=>result.push(r),send);
    assert.deepEqual(result.map(r=>r.status),["INVALID","INVALID"]);assert.equal(calls,0);
  });
  it("uma resposta antiga não substitui a seleção nova nem finaliza seu carregamento",async()=>{
    const gate={version:0},first=deferred<LibraryReplay>(),second=deferred<LibraryReplay>();
    const published:LibraryReplay[]=[],failures:unknown[]=[];let finishes=0;
    const a=runLatest(gate,()=>first.promise,value=>published.push(value),e=>failures.push(e),()=>finishes++);
    const b=runLatest(gate,()=>second.promise,value=>published.push(value),e=>failures.push(e),()=>finishes++);
    const current={hand:hand("partial_flop"),provenance:"PHH_RECONSTRUCTED" as const,fileName:"partial.phh",recordId:"second"};
    second.resolve(current);await b;first.resolve({...current,hand:hand("hu_fold"),recordId:"first"});await a;
    assert.deepEqual(published,[current]);assert.equal(finishes,1);assert.deepEqual(failures,[]);
    const frame=buildReplayFrame(published[0].hand,0,{kind:"public"});
    assert.equal(frame.snapshot.potAtoms,"0");assert.equal(frame.completed,false);assert.ok(frame.visibleCards.flat().every(c=>c===null));
  });
  it("desmontar invalida sucesso, erro e finally; trocar mão cria nova sessão no início",async()=>{
    const gate={version:0},pending=deferred<string>();const effects:string[]=[];
    const run=runLatest(gate,()=>pending.promise,v=>effects.push(v),()=>effects.push("error"),()=>effects.push("finish"));
    gate.version++;pending.reject(new Error("Resposta tardia"));await run;assert.deepEqual(effects,[]);
    for(const name of ["hu_fold","three_way_allin","partial_flop"]){const loaded=hand(name);const start=buildReplayFrame(loaded,0,{kind:"recorded"});assert.ok(start.visibleCards.flat().every(c=>c===null));assert.equal(start.snapshot.stacksAtoms.reduce((s,v)=>s+BigInt(v),0n),loaded.players.reduce((s,p)=>s+BigInt(p.initialStackAtoms),0n));}
  });
  it("cliente revalida o canônico recuperado antes de entregá-lo ao replayer",async()=>{
    const previous=globalThis.fetch;
    try {
      const good={hand:hand("late_reveal"),recordId:"selected",fileName:"late.phh",provenance:"PHH_RECONSTRUCTED"};
      globalThis.fetch=async()=>Response.json({ok:true,data:good});
      const loaded=await readLibraryReplay("selected");assert.equal(buildReplayFrame(loaded.hand,0,{kind:"public"}).visibleCards[0][0],null);
      good.hand.integrity.evLoss=7 as never;
      await assert.rejects(readLibraryReplay("selected"),/evLoss/);
    }finally{globalThis.fetch=previous;}
  });
});

describe("Fase 2C — API real Next → Python → SQLite",()=>{
  it("persiste lote misto, pesquisa, organiza, exporta e exclui somente com confirmação",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"poker-library-api-"));
    const oldDb=process.env.POKER_LIBRARY_DATABASE,oldEnabled=process.env.POKER_LIBRARY_ENABLED;
    process.env.POKER_LIBRARY_DATABASE=join(dir,"hands.sqlite3");process.env.POKER_LIBRARY_ENABLED="1";
    async function write(action:string,value:unknown) {return POST(request(action,"POST",JSON.stringify(value),{"Content-Type":"application/json"}));}
    async function ingest(name:string) {const response=await POST(request("import","POST",fixture(name),{"X-File-Name":name+".phh","X-File-Format":"phh"}));assert.equal(response.status,200);return (await response.json()).data;}
    try {
      const first=await ingest("hu_fold");assert.equal(first.status,"IMPORTED");
      assert.equal((await ingest("invalid_missing_call")).status,"INVALID");
      assert.equal((await ingest("hu_fold")).status,"DUPLICATE");
      assert.equal((await ingest("partial_flop")).status,"IMPORTED");
      assert.equal((await POST(request("import","POST","text",{"X-File-Format":"txt"}))).status,200);
      const saved=await write("study",{recordId:first.recordId,study:{note:"<img src=x onerror=alert(1)>",tags:["estudo"],favorite:true,pending:true,markReviewed:false}});assert.equal(saved.status,200);
      const page=await GET(new Request("http://localhost:3000/api/hand-library?action=list&favorite=yes&tag=estudo",{headers:request("list").headers}));
      const result=(await page.json()).data;assert.equal(result.total,1);assert.equal(result.stats.total,2);assert.equal(result.items[0].study.note,"<img src=x onerror=alert(1)>");assert.equal("events" in result.items[0],false);
      const read=await GET(new Request("http://localhost:3000/api/hand-library?action=read&recordId="+first.recordId,{headers:request("list").headers}));
      const loaded=(await read.json()).data;const canonical=validateCanonicalHand(loaded.hand);
      for(let cursor=0;cursor<=canonical.events.length;cursor++){const f=buildReplayFrame(canonical,cursor,{kind:"public"});assert.equal(f.snapshot.stacksAtoms.reduce((s,v)=>s+BigInt(v),0n)+BigInt(f.snapshot.potAtoms),200n);}
      const backup=await GET(request("backup"));assert.equal(backup.status,200);assert.ok((await backup.json()).data.base64.startsWith("U1FMaXRl"));
      assert.equal((await write("delete",{recordId:first.recordId,confirm:"no"})).status,400);
      assert.equal((await write("clearStudy",{recordId:first.recordId,confirm:first.recordId})).status,200);
      assert.equal((await write("delete",{recordId:first.recordId,confirm:first.recordId})).status,200);
      assert.equal((await (await GET(request("list"))).json()).data.total,1);
    } finally {
      if(oldDb===undefined)delete process.env.POKER_LIBRARY_DATABASE;else process.env.POKER_LIBRARY_DATABASE=oldDb;
      if(oldEnabled===undefined)delete process.env.POKER_LIBRARY_ENABLED;else process.env.POKER_LIBRARY_ENABLED=oldEnabled;
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
