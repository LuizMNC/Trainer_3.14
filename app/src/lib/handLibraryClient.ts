import type {CanonicalHand} from "./poker/handHistorySchema.ts";
import {validateCanonicalHand} from "./poker/handHistoryValidation.ts";

export type LibraryProvenance = "PHH_RECONSTRUCTED"|"POKERSTARS_RECONSTRUCTED"|"JSON_UNAUTHENTICATED";
export interface StudyMetadata {note:string;tags:string[];favorite:boolean;pending:boolean;lastReviewedAtUtc:string|null}
export interface LibrarySummary {
  recordId:string;canonicalRecordId:string;handId:string|number|null;fileName:string|null;
  provenance:LibraryProvenance;playedDate:string|null;playedTime:string|null;timeZone:string|null;
  importedAtUtc:string;playerCount:number;variant:string;gameFormat:string|null;
  gameFormatStatus?:string;gameFormatReason?:string|null;tournamentId?:string|null;buyIn?:string|null;language?:string|null;hasBounty?:boolean;
  decimalPlaces:number;currency:string|null;
  blindsAtoms:string[];antesAtoms:string[];bigBlind:string;status:"VALIDATED_COMPLETE"|"VALIDATED_PARTIAL";board:string[];
  players:{label:string;name:string|null;position:string|null;positionStatus:string;initialStackAtoms:string}[];study:StudyMetadata;
}
export interface LibraryListing {
  items:LibrarySummary[];
  total:number;
  page:number;
  pageSize:number;
  stats:{
    total:number;complete:number;partial:number;favorites:number;pending:number;
    byPlayers:{label:string;count:number}[];
    byFormat?:{label:string;count:number}[];
    tournaments?:{tournamentId:string;buyIn:string|null;gameFormat:string|null;count:number}[];
    byImportMonth:{label:string;count:number}[];
  };
}
export interface BatchResult {name:string;status:"IMPORTED"|"DUPLICATE"|"INVALID"|"UNSUPPORTED"|"ERROR";message:string;recordId?:string}
export interface LibraryReplay {hand:CanonicalHand;provenance:LibraryProvenance;fileName:string;recordId:string}
export interface BatchIssue {fileName:string;handId:string|null;status:string;code:string;message:string}
export interface BatchProgress {
  phase:"analyze"|"commit";
  processedFiles:number;
  totalFiles:number;
  currentFile:string;
  filesFound:number;
  zipEntries:number;
  txtFiles:number;
  phhFiles:number;
  jsonFiles:number;
  handsIdentified:number;
  validHands:number;
  problemHands:number;
  duplicates:number;
  totalToImport:number;
  importedHands:number;
  cancelled:boolean;
}
export interface BatchImportSummary extends BatchProgress {
  formatsDetected:{MTT:number;SNG:number;CASH:number;UNKNOWN:number};
  languagesDetected:Record<string,number>;
  tournamentsDetected:{tournamentId:string;buyIn:string|null;gameFormat:string|null;validCount:number}[];
  issueCodeCounts:Record<string,number>;
  issues:BatchIssue[];
}
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
  if(!["PHH_RECONSTRUCTED","POKERSTARS_RECONSTRUCTED","JSON_UNAUTHENTICATED"].includes(result.provenance)||result.recordId!==recordId)throw new Error("Identificação da mão recuperada é incompatível.");
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

export async function encodeBatchFiles(files: readonly File[]): Promise<{name:string;format:string;base64:string}[]> {
  if (files.length < 1 || files.length > 500) {
    throw new Error("Selecione entre 1 e 500 arquivos por operação.");
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 48 * 1024 * 1024) {
    throw new Error("Tamanho total selecionado excede 48 MiB.");
  }
  const prepared: {name:string;format:string;base64:string}[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["zip", "txt", "phh", "json"].includes(ext)) {
      throw new Error(`Formato não suportado em "${file.name}". Use ZIP, TXT PokerStars, PHH ou JSON.`);
    }
    if (ext === "zip" && file.size > 16 * 1024 * 1024) {
      throw new Error(`Arquivo ZIP "${file.name}" excede 16 MiB.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    prepared.push({ name: file.name, format: ext, base64: btoa(binary) });
  }
  return prepared;
}

export async function runBatchImportStream(
  action: "analyzeBatch" | "commitBatch",
  files: readonly File[],
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal,
): Promise<BatchImportSummary> {
  const prepared = await encodeBatchFiles(files);
  const response = await fetch("/api/hand-library?action=" + action, {
    method: "POST",
    headers: { ...LIBRARY_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ files: prepared, stream: true }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    throw new Error(errJson && typeof errJson.error === "string" ? errJson.error : "Falha na comunicação com a biblioteca local.");
  }
  if (!response.body) {
    const payload = await response.json();
    if (!payload.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Erro ao processar lote.");
    return payload.data as BatchImportSummary;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: BatchImportSummary | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        const msg = JSON.parse(line) as { event?: string; ok?: boolean; error?: string; data?: unknown };
        if (msg.ok === false) {
          throw new Error(typeof msg.error === "string" ? msg.error : "Importação recusada.");
        }
        if (msg.event === "progress" && msg.data) {
          onProgress(msg.data as BatchProgress);
        } else if (msg.event === "done" && msg.ok && msg.data) {
          doneResult = msg.data as BatchImportSummary;
        }
      }
      nl = buffer.indexOf("\n");
    }
  }
  const tail = (buffer + decoder.decode()).trim();
  if (tail) {
    const msg = JSON.parse(tail) as { event?: string; ok?: boolean; error?: string; data?: unknown };
    if (msg.ok === false) throw new Error(typeof msg.error === "string" ? msg.error : "Importação recusada.");
    if (msg.event === "done" && msg.ok && msg.data) doneResult = msg.data as BatchImportSummary;
  }
  if (!doneResult) throw new Error("Fluxo encerrado sem resumo final da importação.");
  return doneResult;
}

export function downloadLocal(bytes:BlobPart,name:string,type="application/json") {
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
