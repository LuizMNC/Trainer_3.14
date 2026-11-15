import {assertLibraryAccess,limitedBody} from "../../../lib/server/libraryAccess.ts";
import {libraryCommand} from "../../../lib/server/libraryBridge.ts";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function reply(value:unknown,status=200) {return Response.json(value,{status,headers});}
function error(error:unknown,status=400) {return reply({ok:false,error:error instanceof Error?error.message:"Operação recusada."},status);}
function gate(request:Request): Response|null {
  try {assertLibraryAccess(request);return null;} catch(e){return error(e,process.env.POKER_LIBRARY_ENABLED==="1"?403:503);}
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
    if(action==="import") {
      const format=request.headers.get("x-file-format");
      if(format!=="phh"&&format!=="json") return reply({ok:true,data:{status:"UNSUPPORTED",message:"Somente PHH e JSON canônico são suportados."}});
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
