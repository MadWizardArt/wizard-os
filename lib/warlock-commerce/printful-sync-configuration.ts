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
  return { configured:true as const, fingerprint, fileTypes:types, hasOptions,
    pricingOptions:[{scope:"product",options:signature.options},...signature.files.map(file=>({scope:"file",options:file.options}))] };
}

/** Only documented defaults that cannot affect standard DTG production are ignored.
 * Their full values remain in the fingerprint; this never changes supplier files/options.
 * https://developers.printful.com/docs/#tag/Common/Options
 */
export function validateSyncPricingOptions(configuration: Extract<ReturnType<typeof readSyncConfiguration>, {configured:true}>, technique:string): string[] {
  const ignored=new Set<string>();
  const standardDtg=technique==="dtg" && configuration.fileTypes.every(type=>["default","front","back","sleeve_left","sleeve_right"].includes(type));
  const threadIds=new Set(["thread_colors","thread_colors_back","thread_colors_right","thread_colors_left","thread_colors_apparel","thread_colors_apparel_back","thread_colors_chest_center","thread_colors_large_center","thread_colors_large_corner_right","thread_colors_chest_left","thread_colors_corner_left","thread_colors_chest_top_left","thread_colors_corner_right","thread_colors_outside_left","thread_colors_outside_right","thread_colors_inside_left","thread_colors_inside_right","thread_colors_patch_front","thread_colors_sleeve_left_top","thread_colors_sleeve_right_top","thread_colors_wrist_left","thread_colors_wrist_right","thread_colors_3d","text_thread_colors","text_thread_colors_back","text_thread_colors_right","text_thread_colors_left","text_thread_colors_apparel","text_thread_colors_apparel_back"]);
  for(const group of configuration.pricingOptions){
    if(!Array.isArray(group.options)) throw new Error("printful_configured_options_malformed");
    const seen=new Set<string>();
    for(const raw of group.options){
      const option=object(raw), key=option.id, value=option.value;
      if(typeof key!=="string" || !/^[a-z][a-z0-9_]{0,63}$/.test(key) || seen.has(key)) throw new Error("printful_configured_options_malformed");
      seen.add(key);
      // Thread palettes and flat embroidery selection are inactive with no embroidery files.
      const palette=Array.isArray(value) ? value : typeof value==="string" ? (value==="" ? [] : value.split(",")) : null;
      const safe=standardDtg && (group.scope==="product"
        ? (threadIds.has(key) && palette!==null && palette.every(color=>typeof color==="string" && /^#[0-9a-fA-F]{6}$/.test(color)))
          || (key==="embroidery_type" && value==="flat") || (key==="notes" && value==="") || (key==="lifelike" && typeof value==="boolean")
        : (key==="auto_thread_color" && typeof value==="boolean") || (key==="full_color" && value===false));
      if(!safe) throw new Error("printful_configured_"+group.scope+"_option_quote_unsupported_"+key);
      ignored.add(group.scope+":"+key);
    }
  }
  return [...ignored].sort();
}
