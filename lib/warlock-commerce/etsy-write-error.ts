/** Bounded public Etsy rejection details; never return raw bodies or response headers. */
export class EtsyWriteError extends Error {
 readonly status:number; readonly operation:string; readonly details:string[];
 constructor(status:number,operation:string,details:string[]){super("etsy_http_"+status);this.status=status;this.operation=operation;this.details=details;}
}
function redact(value:string,secrets:string[]){
 let clean=value;
 for(const secret of secrets.flatMap(value=>[value,...value.split(":")]).filter(Boolean))clean=clean.split(secret).join("[redacted]");
 return clean.replace(/https?:\/\/\S+/gi,"[url]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]")
  .replace(/(?:access_token|refresh_token|authorization|x-api-key|api_key|secret)\s*[=:]\s*[^\s,;]+/gi,"[credential redacted]")
  .replace(/\b[A-Za-z0-9_.-]{48,}\b/g,"[redacted]").replace(/[\u0000-\u001f\u007f]/g," ").slice(0,700);
}
export async function etsyWriteError(response:Response,operation:string,secrets:string[]=[]){
 const messages:string[]=[];
 // Limit the body read as well as the diagnostics returned. HTML and unexpected fields are omitted.
 try{
  const reader=response.body?.getReader();let body="";
  if(reader){const decoder=new TextDecoder();try{while(body.length<8192){const part=await reader.read();if(part.done)break;body+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel();}}
  if(body.length<=8192){const payload:unknown=JSON.parse(body);
   const visit=(value:unknown,depth=0)=>{if(depth>3||messages.length>=6)return;
    if(typeof value==="string"){messages.push(redact(value,secrets));return;}
    if(Array.isArray(value)){for(const item of value.slice(0,6))visit(item,depth+1);return;}
    if(value&&typeof value==="object")for(const key of ["error","errors","message","error_description","detail","field","code"]){if(key in value)visit((value as Record<string,unknown>)[key],depth+1);}
   };visit(payload);
  }
 }catch{ /* A non-JSON response remains a status-only diagnostic. */ }
 return new EtsyWriteError(response.status,operation,[...new Set(messages)]);
}
export function etsyFailureDetails(error:unknown){return error instanceof EtsyWriteError?{status:error.status,operation:error.operation,messages:error.details,responseReceived:true}:undefined;}
