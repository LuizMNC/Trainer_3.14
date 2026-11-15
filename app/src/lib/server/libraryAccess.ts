export function assertLibraryAccess(request: Request, enabled = process.env.POKER_LIBRARY_ENABLED): void {
  if (enabled !== "1") throw new Error("Biblioteca desativada. Configure POKER_LIBRARY_ENABLED=1 e inicie o Next em 127.0.0.1 conforme o relatório da Fase 2C.");
  const url = new URL(request.url);
  const host=request.headers.get("host");
  if(!host||! /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))throw new Error("Acesso permitido somente pelo endereço local configurado.");
  // Next pode normalizar request.url para localhost mesmo quando o Host é 127.0.0.1.
  // Ambos devem ser loopback; a origem do navegador é confrontada com o Host real.
  const address=new URL(url.protocol+"//"+host);
  if (!["http:","https:"].includes(url.protocol)||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||address.port!==url.port) throw new Error("Acesso permitido somente pelo endereço local configurado.");
  if (!["GET","POST"].includes(request.method)) throw new Error("Método não permitido.");
  if (request.headers.get("x-poker-library") !== "local-v1") throw new Error("Cabeçalho local obrigatório.");
  const origin = request.headers.get("origin");
  if ((request.method === "POST" && origin !== address.origin) || (origin && origin !== address.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Origem recusada.");
}

export async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length)||Number(length)>limit)) throw new Error("Entrada acima do limite.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts: Uint8Array[] = []; let size=0;
  try {
    while (true) {
      const item=await reader.read();
      if (item.done) break;
      size+=item.value.byteLength;
      if(size>limit) {await reader.cancel();throw new Error("Entrada acima do limite.");}
      parts.push(item.value);
    }
  } finally {reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;
  for(const part of parts) {result.set(part,offset);offset+=part.length;}
  return result;
}
