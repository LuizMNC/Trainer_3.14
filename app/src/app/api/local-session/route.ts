import {assertLibraryAccess} from "@/lib/server/libraryAccess";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Heartbeat local sem dados da Biblioteca ou segredo do iniciador. */
export async function GET(request:Request){
  try{
    assertLibraryAccess(request,"1");
    return Response.json({application:"gto-trainer-session-v1"},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Acesso local recusado."},{status:403});}
}
