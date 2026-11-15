// Ponte offline: reutiliza exatamente o decoder do Replayer, sem parser de poker novo.
import {parseCanonicalHandText} from '../poker/handHistoryValidation.ts';
try {
  const parts=[];let size=0;
  for await (const chunk of process.stdin) {
    size+=chunk.length;
    if(size>6*1024*1024) throw new Error('Arquivo acima de 6 MiB.');
    parts.push(chunk);
  }
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  process.stdout.write(JSON.stringify({ok:true,hand:parseCanonicalHandText(raw)}));
} catch(error) {
  process.stdout.write(JSON.stringify({ok:false,error:error instanceof Error?error.message:'JSON inválido.'}));
  process.exitCode=2;
}
