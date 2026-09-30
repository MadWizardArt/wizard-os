import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { printfulGet, quotePrintfulVariant, type Get, type PrintfulQuote } from "./printful-catalog.ts";

export type SupplierVariantCheck = {
  variantId:string; label:string; printfulProductId:number; printfulVariantId:number; printfulStoreId:number;
  catalogVariantExists:boolean; catalogProductMatches:boolean; storeAccessible:boolean;
  availability:"in_stock" | "unavailable" | "unknown"; quote?:PrintfulQuote; pass:boolean;
};
export type SupplierPreflight = { configured:boolean; pass:boolean; checkedAt:string; variants:SupplierVariantCheck[]; errors:string[] };

export async function runPrintfulSupplierPreflight(manifest:WarlockProductManifest, get:Get=printfulGet):Promise<SupplierPreflight> {
  const physical=manifest.variants.filter(v=>v.fulfillment==="PHYSICAL");
  const configured=get!==printfulGet || Boolean(process.env.PRINTFUL_PRIVATE_TOKEN?.trim());
  const result:SupplierPreflight={configured,pass:physical.length===0,checkedAt:new Date().toISOString(),variants:[],errors:[]};
  if(!physical.length)return result;
  if(!configured){result.errors.push("printful_token_missing");return result;}
  if(physical.length>30){result.errors.push("printful_preflight_variant_limit: At most 30 physical editions per product in this release.");return result;}
  // Request-local deduplication shares store checks; nothing survives this preflight.
  const requests=new Map<string,ReturnType<Get>>();
  const fresh:Get=(path,storeId)=>{const key=String(storeId)+path;let promise=requests.get(key);if(!promise){promise=get(path,storeId);requests.set(key,promise);}return promise;};
  const checks:Array<SupplierVariantCheck | undefined>=new Array(physical.length);
  let next=0;
  async function worker(){
    while(next<physical.length){
      const index=next++,variant=physical[index];
      if(!variant.printfulProductId || !variant.printfulVariantId || !variant.printfulStoreId){result.errors.push("printful_mapping_incomplete:"+variant.id);continue;}
      const check:SupplierVariantCheck={variantId:variant.id,label:variant.label,printfulProductId:variant.printfulProductId,
        printfulVariantId:variant.printfulVariantId,printfulStoreId:variant.printfulStoreId,catalogVariantExists:false,
        catalogProductMatches:false,storeAccessible:false,availability:"unknown",pass:false};
      try{
        const quote=await quotePrintfulVariant({storeId:variant.printfulStoreId,productId:variant.printfulProductId,catalogVariantId:variant.printfulVariantId},fresh);
        if(variant.productionQuoteJson){
          const old=JSON.parse(variant.productionQuoteJson) as PrintfulQuote;
          if(old.catalogProductId!==quote.catalogProductId || old.catalogVariantId!==quote.catalogVariantId || old.storeId!==quote.storeId || old.technique!==quote.technique || old.fileType!==quote.fileType || old.placement!==quote.placement) throw new Error("printful_saved_configuration_changed");
        }
        Object.assign(check,{quote,catalogVariantExists:true,catalogProductMatches:true,storeAccessible:true,availability:quote.availability,pass:quote.availability==="in_stock"});
        if(!check.pass)result.errors.push("printful_variant_unavailable:"+variant.id);
      }catch(error){result.errors.push("live_quote_failed:"+variant.id+":"+(error instanceof Error?error.message:"unknown"));}
      checks[index]=check;
    }
  }
  await Promise.all(Array.from({length:Math.min(4,physical.length)},()=>worker()));
  result.variants=checks.filter((v):v is SupplierVariantCheck=>Boolean(v));
  result.checkedAt=new Date().toISOString();
  result.pass=result.variants.length===physical.length && result.variants.every(v=>v.pass) && !result.errors.length;
  return result;
}
