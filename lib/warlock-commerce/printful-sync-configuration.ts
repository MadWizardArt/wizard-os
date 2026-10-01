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
export type PricingOptionIssue={scope:"product"|"file";optionId:string;reason:"unsupported"|"malformed"|"duplicate";valueKind:string};
export class PrintfulPricingOptionsError extends Error {
  readonly optionIssues:PricingOptionIssue[];
  constructor(optionIssues:PricingOptionIssue[]){
    const first=optionIssues[0];
    super(first.reason!=="unsupported" ? "printful_configured_options_malformed" : "printful_configured_"+first.scope+"_option_quote_unsupported_"+first.optionId);
    this.optionIssues=optionIssues;
  }
}
export function validateSyncPricingOptions(configuration: Extract<ReturnType<typeof readSyncConfiguration>, {configured:true}>, technique:string) {
  const inactive=new Set<string>(),metadata=new Set<string>(),disabled=new Set<string>();
  const issues:PricingOptionIssue[]=[];
  const valueKind=(value:unknown)=>Array.isArray(value) ? (value.length ? "nonempty_array" : "empty_array") : value===null ? "null" : typeof value;
  const issue=(scope:"product"|"file",optionId:string,reason:PricingOptionIssue["reason"],value:unknown)=>{if(issues.length<64)issues.push({scope,optionId,reason,valueKind:valueKind(value)});};
  const licenses=new Set(["CLC","AFFINITY","BR","EX","NCAA","FAN","BCOMPLY","TAG","DLH","CORE81"]);
  const standardDtg=technique==="dtg" && configuration.fileTypes.every(type=>["default","front","back","sleeve_left","sleeve_right"].includes(type));
  // Both documented palette tables share these placements. Keep them paired so
  // imported text palettes cannot be omitted while their ordinary palette works.
  const paletteSuffixes=["","_back","_right","_left","_apparel","_apparel_back","_chest_center","_large_center","_large_corner_right","_chest_left","_corner_left","_chest_top_left","_corner_right","_outside_left","_outside_right","_inside_left","_inside_right","_patch_front","_sleeve_left_top","_sleeve_right_top","_wrist_left","_wrist_right"];
  const threadIds=new Set([...paletteSuffixes.flatMap(suffix=>["thread_colors"+suffix,"text_thread_colors"+suffix]),"thread_colors_3d","thread_colors_outline"]);
  for(const group of configuration.pricingOptions){
    const scope=group.scope==="product" ? "product" : "file";
    if(!Array.isArray(group.options)){issue(scope,"invalid_options","malformed",group.options);continue;}
    const seen=new Set<string>();
    for(const raw of group.options){
      if(!raw || typeof raw!=="object" || Array.isArray(raw)){issue(scope,"invalid_option","malformed",raw);continue;}
      const option=raw as Json, key=option.id, value=option.value;
      if(typeof key!=="string" || !/^[a-z][a-z0-9_]{0,63}$/.test(key)){issue(scope,"invalid_option_id","malformed",value);continue;}
      if(seen.has(key)){issue(scope,key,"duplicate",value);continue;}
      seen.add(key);
      const label=scope+":"+key;
      // Documented metadata does not select a print placement or production option.
      // Accept only the provider's documented shapes/values, preserving all values.
      if(scope==="product" && ((key==="license_type" && Array.isArray(value) && value.every(v=>typeof v==="string" && licenses.has(v)) && new Set(value).size===value.length) || (key==="lifelike" && typeof value==="boolean"))){metadata.add(label);continue;}
      if(scope==="product" && key==="notes" && value===""){metadata.add(label);continue;}
      if(standardDtg && ((scope==="product" && key==="inside_pocket" && value===false) || (scope==="file" && key==="full_color" && value===false))){disabled.add(label);continue;}
      // Thread palettes and flat embroidery selection are inactive with no embroidery files.
      const palette=Array.isArray(value) ? value : typeof value==="string" ? (value==="" ? [] : value.split(",")) : null;
      const safe=standardDtg && (scope==="product"
        ? (threadIds.has(key) && palette!==null && palette.every(color=>typeof color==="string" && /^#[0-9a-fA-F]{6}$/.test(color)))
          || (key==="embroidery_type" && value==="flat")
        : (key==="auto_thread_color" && typeof value==="boolean"));
      if(!safe){issue(scope,key,"unsupported",value);continue;}
      inactive.add(label);
    }
  }
  if(issues.length)throw new PrintfulPricingOptionsError(issues);
  return {inactiveOptionIds:[...inactive].sort(),metadataOptionIds:[...metadata].sort(),disabledOptionIds:[...disabled].sort()};
}
