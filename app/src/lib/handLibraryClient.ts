import type {CanonicalHand} from "./poker/handHistorySchema.ts";
import {validateCanonicalHand} from "./poker/handHistoryValidation.ts";

export interface StudyMetadata {note:string;tags:string[];favorite:boolean;pending:boolean;lastReviewedAtUtc:string|null}
export interface LibrarySummary {
  recordId:string;canonicalRecordId:string;handId:string|number|null;fileName:string|null;
  provenance:"PHH_RECONSTRUCTED"|"JSON_UNAUTHENTICATED";playedDate:string|null;playedTime:string|null;timeZone:string|null;
  importedAtUtc:string;playerCount:number;variant:string;gameFormat:string|null;decimalPlaces:number;currency:string|null;
  blindsAtoms:string[];antesAtoms:string[];bigBlind:string;status:"VALIDATED_COMPLETE"|"VALIDATED_PARTIAL";board:string[];
  players:{label:string;name:string|null;position:string|null;positionStatus:string;initialStackAtoms:string}[];study:StudyMetadata;
}
export interface LibraryListing {items:LibrarySummary[];total:number;page:number;pageSize:number;stats:{total:number;complete:number;partial:number;favorites:number;pending:number;byPlayers:{label:string;count:number}[];byImportMonth:{label:string;count:number}[]}}
export interface BatchResult {name:string;status:"IMPORTED"|"DUPLICATE"|"INVALID"|"UNSUPPORTED"|"ERROR";message:string;recordId?:string}
export interface LibraryReplay {hand:CanonicalHand;provenance:"PHH_RECONSTRUCTED"|"JSON_UNAUTHENTICATED";fileName:string;recordId:string}
export const LIBRARY_HEADERS={"X-Poker-Library":"local-v1"};

export async function libraryRequest<T>(params:Record<string,string>,options:RequestInit={}):Promise<T> {
  const response=await fetch("/api/hand-library?"+new URLSearchParams(params),{...options,headers:{...LIBRARY_HEADERS,...options.headers},cache:"no-store"});
  const value=await response.json();
  if(!response.ok||value.ok!==true)throw new Error(typeof value.error==="string"?value.error:"Biblioteca indisponível.");
  return value.data as T;
}
export function libraryWrite<T>(action:string,value:unknown):Promise<T> {
  return libraryRequest<T>({action},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
}
export async function readLibraryReplay(recordId:string):Promise<LibraryReplay> {
  const result=await libraryRequest<LibraryReplay>({action:"read",recordId});
  validateCanonicalHand(result.hand);
  if(!["PHH_RECONSTRUCTED","JSON_UNAUTHENTICATED"].includes(result.provenance)||result.recordId!==recordId)throw new Error("Identificação da mão recuperada é incompatível.");
  return result;
}

/** A mesma geração protege arquivo, exemplo e Biblioteca; saída/desmontagem invalida todos. */
export async function runLatest<T>(gate:{version:number},loader:()=>Promise<T>,success:(value:T,version:number)=>void,error:(error:unknown)=>void,finish:()=>void):Promise<void> {
  const version=++gate.version;
  try {const result=await loader();if(version===gate.version)success(result,version);}
  catch(e){if(version===gate.version)error(e);}
  finally {if(version===gate.version)finish();}
}

export async function importLibraryBatch(files:readonly File[],onResult:(result:BatchResult)=>void,send=(file:File,format:string,timeoutMs:number)=>libraryRequest<{status:BatchResult["status"];message:string;recordId?:string}>({action:"import"},{method:"POST",headers:{"X-File-Name":encodeURIComponent(file.name),"X-File-Format":format,"Content-Type":"application/octet-stream"},body:file,signal:AbortSignal.timeout(timeoutMs)})):Promise<void> {
  if(files.length>20||files.reduce((sum,file)=>sum+file.size,0)>20*1024*1024)throw new Error("Lote limitado a 20 arquivos e 20 MiB no total.");
  const deadline=Date.now()+120_000;
  for(const file of files){
    const format=file.name.split(".").pop()?.toLowerCase()??"";
    if(Date.now()>deadline){onResult({name:file.name,status:"ERROR",message:"Limite de 120 s do lote atingido; arquivo não iniciado."});continue;}
    if(!["phh","json"].includes(format)){onResult({name:file.name,status:"UNSUPPORTED",message:"Somente arquivos .phh e .json."});continue;}
    if(file.size===0||file.size>(format==="phh"?1_048_576:6*1024*1024)){onResult({name:file.name,status:"INVALID",message:"Arquivo vazio ou acima do limite: PHH 1 MiB, JSON 6 MiB."});continue;}
    try {const result=await send(file,format,Math.max(1,Math.min(35_000,deadline-Date.now())));onResult({...result,name:file.name});}
    catch(error){onResult({name:file.name,status:"ERROR",message:error instanceof Error?error.message:"Erro de leitura ou armazenamento."});}
  }
}

export function downloadLocal(bytes:BlobPart,name:string,type="application/json") {
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
