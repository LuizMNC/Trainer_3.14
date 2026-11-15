import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {homedir} from "node:os";
import {validateCanonicalHand} from "../poker/handHistoryValidation.ts";

let queued=0;
let chain:Promise<unknown>=Promise.resolve();
export async function libraryCommand(request: Record<string,unknown>): Promise<Record<string,unknown>> {
  if(queued>=3) throw new Error("Biblioteca ocupada. Aguarde e tente novamente.");
  queued++;
  const pending=chain.then(()=>execute(request));
  chain=pending.catch(()=>undefined);
  try {return await pending;} finally {queued--;}
}
function execute(request: Record<string,unknown>): Promise<Record<string,unknown>> {
  const root=resolve(process.cwd(),"..");
  const python=process.env.POKER_HH_PYTHON??resolve(root,"pipeline/hand_history/.venv",process.platform==="win32"?"Scripts/python.exe":"bin/python");
  // Fora do checkout/OneDrive por padrão. O caminho é configuração do operador, nunca entrada HTTP.
  const dataHome=process.platform==="win32"?(process.env.LOCALAPPDATA??resolve(homedir(),"AppData/Local")):(process.env.XDG_DATA_HOME??resolve(homedir(),".local/share"));
  const database=process.env.POKER_LIBRARY_DATABASE??resolve(dataHome,"Projeto-Poker/hand-library.sqlite3");
  return new Promise((done,reject)=>{
    const child=spawn(python,["-m","pipeline.hand_history.library_cli",database],{cwd:root,shell:false,windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,POKER_LIBRARY_NODE:process.execPath}});
    let size=0;const chunks:Buffer[]=[];let failure:Error|null=null;
    const timer=setTimeout(()=>{failure=new Error("Tempo de processamento excedido (30 s); confira o acervo antes de repetir a operação.");child.kill();},30_000);
    child.stdout.on("data",(part:Buffer)=>{size+=part.length;if(size>64*1024*1024){failure=new Error("Resposta acima de 64 MiB.");child.kill();}else chunks.push(part);});
    // Nunca encaminha históricos, caminhos privados ou tracebacks ao navegador/log remoto.
    child.stderr.resume();
    child.stdin.on("error",()=>undefined);
    child.on("error",()=>{clearTimeout(timer);reject(new Error("Python local indisponível. Configure POKER_HH_PYTHON e o ambiente da Fase 2A."));});
    child.on("close",()=>{
      clearTimeout(timer);
      if(failure){reject(failure);return;}
      try {
        const result=JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if(result.ok!==true) throw new Error(typeof result.error==="string"?result.error:"Operação local recusada.");
        if(request.action==="read") validateCanonicalHand(result.data.hand);
        done(result.data);
      } catch(error) {reject(error instanceof Error?error:new Error("Resposta inválida do backend."));}
    });
    child.stdin.end(JSON.stringify(request));
  });
}
