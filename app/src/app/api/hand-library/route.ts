import {assertLibraryAccess,limitedBody,PayloadTooLargeError} from "../../../lib/server/libraryAccess.ts";
import {libraryCommand,libraryStreamCommand} from "../../../lib/server/libraryBridge.ts";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const MAX_BATCH_BODY_BYTES = 64 * 1024 * 1024;
function reply(value:unknown,status=200) {return Response.json(value,{status,headers});}
function error(error:unknown,status?:number) {
  const code = status ?? (error instanceof PayloadTooLargeError ? 413 : 400);
  return reply({ok:false,error:error instanceof Error?error.message:"Operação recusada."},code);
}
function gate(request:Request): Response|null {
  try {assertLibraryAccess(request);return null;} catch(e){return error(e,process.env.POKER_LIBRARY_ENABLED==="1"?403:503);}
}
function validateBatchPayload(value:unknown): {files:{name:string;format:string;base64:string}[];stream:boolean} {
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("Esperado objeto JSON.");
  const obj=value as Record<string,unknown>;
  if(Object.keys(obj).some(k=>k!=="files"&&k!=="stream")) throw new Error("Campo de lote inválido.");
  if(!Array.isArray(obj.files)||obj.files.length<1||obj.files.length>500) throw new Error("Lote exige entre 1 e 500 arquivos.");
  const files = obj.files.map((item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item)) throw new Error("Entrada de arquivo inválida.");
    const rec=item as Record<string,unknown>;
    if(typeof rec.name!=="string"||!rec.name||rec.name.length>180||/[\\/\0\r\n]/.test(rec.name)) throw new Error("Nome de arquivo inválido.");
    if(typeof rec.format!=="string"||!["zip","txt","phh","json"].includes(rec.format.toLowerCase())) throw new Error("Formato não suportado no lote.");
    if(typeof rec.base64!=="string"||!/^[A-Za-z0-9+/]*={0,2}$/.test(rec.base64)) throw new Error("Conteúdo base64 inválido.");
    return {name:rec.name,format:rec.format.toLowerCase(),base64:rec.base64};
  });
  return {files,stream:obj.stream===true};
}
export async function GET(request:Request) {
  const denied=gate(request);if(denied)return denied;
  try {
    const params=new URL(request.url).searchParams;
    const action=params.get("action")??"list";
    let command:Record<string,unknown>;
    if(action==="list") {const filters=Object.fromEntries(params);delete filters.action;command={action,filters};}
    else if(action==="read"||action==="export") command={action,recordId:params.get("recordId"),part:params.get("part")};
    else if(action==="backup") command={action};
    else throw new Error("Operação de leitura inválida.");
    return reply({ok:true,data:await libraryCommand(command)});
  }catch(e){return error(e);}
}
export async function POST(request:Request) {
  const denied=gate(request);if(denied)return denied;
  try {
    const action=new URL(request.url).searchParams.get("action");
    let command:Record<string,unknown>;
    if(action==="analyzeBatch"||action==="commitBatch") {
      const raw=await limitedBody(request,MAX_BATCH_BODY_BYTES);
      const parsed:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
      const {files,stream}=validateBatchPayload(parsed);
      command={action,files};
      if(stream) {
        const encoder=new TextEncoder();
        const body=new ReadableStream({
          async start(controller) {
            try {
              await libraryStreamCommand(command,(line)=>{
                controller.enqueue(encoder.encode(JSON.stringify(line)+"\n"));
              },request.signal);
              controller.close();
            } catch(e) {
              const msg=e instanceof Error?e.message:"Falha no processamento do lote.";
              controller.enqueue(encoder.encode(JSON.stringify({ok:false,error:msg})+"\n"));
              controller.close();
            }
          },
        });
        return new Response(body,{status:200,headers:{...headers,"Content-Type":"application/x-ndjson; charset=utf-8"}});
      }
      return reply({ok:true,data:await libraryCommand(command)});
    }
    if(action==="import") {
      const format=request.headers.get("x-file-format");
      if(format!=="phh"&&format!=="json") return reply({ok:true,data:{status:"UNSUPPORTED",message:"Somente PHH e JSON canônico no envio simples; use o importador de lote para ZIP e TXT PokerStars."}});
      const raw=await limitedBody(request,format==="phh"?1_048_576:6*1024*1024);
      command={action,format,name:decodeURIComponent(request.headers.get("x-file-name")??""),base64:Buffer.from(raw).toString("base64")};
    }else{
      const raw=await limitedBody(request,32*1024);
      const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
      if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Esperado objeto JSON.");
      const body=value as Record<string,unknown>;
      const allowed=action==="study"?["recordId","study"]:["recordId","confirm"];
      if(!["study","delete","clearStudy"].includes(action??"")||Object.keys(body).some(k=>!allowed.includes(k)))throw new Error("Operação/campo de escrita inválido.");
      command={...body,action};
    }
    return reply({ok:true,data:await libraryCommand(command)});
  }catch(e){return error(e);}
}
