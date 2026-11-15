import {timingSafeEqual} from "node:crypto";
import {assertLibraryAccess} from "@/lib/server/libraryAccess";
import {libraryCommand} from "@/lib/server/libraryBridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{
    assertLibraryAccess(request);
    const expected=process.env.POKER_LAUNCH_TOKEN??"",actual=request.headers.get("x-poker-launch")??"";
    if(!expected||expected.length!==actual.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return Response.json({error:"Instância não autenticada."},{status:403});
    await libraryCommand({action:"list",filters:{page:"1",pageSize:"1"}});
    return Response.json({application:"gto-trainer-local-v1",instance:process.env.POKER_LAUNCH_INSTANCE,library:"ready"},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Aplicação ou SQLite local indisponível. Consulte o iniciador."},{status:503});}
}
