import { createHash } from "node:crypto";

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("printful_invalid_response");
  return value as Json;
}
function id(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error("printful_sync_identity_mismatch");
  return Number(value);
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));
  return value;
}
/** Exposes identities and a fingerprint, never source URLs or signed file credentials. */
export function readSyncConfiguration(payload: unknown, syncVariantId: number, catalogVariantId: number, syncProductId?: number) {
  const remote=object(object(object(payload).result).sync_variant);
  if(id(remote.id)!==syncVariantId || (syncProductId !== undefined && id(remote.sync_product_id)!==syncProductId)) throw new Error("printful_sync_identity_mismatch");
  if(!Array.isArray(remote.files) || typeof remote.synced!=="boolean") throw new Error("printful_invalid_response");
  const files=remote.files.map(object).filter(file=>file.type!=="preview");
  if(!files.length && remote.synced===false) return { configured:false as const };
  if(remote.synced!==true || remote.is_ignored===true || id(remote.variant_id)!==catalogVariantId || !files.length) throw new Error("printful_existing_configuration_incomplete");
  const types=files.map(file=>String(file.type));
  if(new Set(types).size!==types.length || files.some(file=>typeof file.type!=="string" || file.status!=="ok")) throw new Error("printful_existing_configuration_incomplete");
  const signature={catalogVariantId,files:files.map(file=>({id:id(file.id),type:file.type,options:file.options ?? [],position:file.position ?? null})).sort((a,b)=>String(a.type).localeCompare(String(b.type))),options:remote.options ?? []};
  const fingerprint=createHash("sha256").update(JSON.stringify(stable(signature))).digest("hex");
  const hasOptions=[signature.options,...signature.files.map(file=>file.options)].some(options=>!Array.isArray(options)||options.length>0);
  return { configured:true as const, fingerprint, fileTypes:types, hasOptions };
}
