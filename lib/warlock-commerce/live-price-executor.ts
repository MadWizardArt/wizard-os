import { prisma } from "../prisma";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { writeEtsyPriceInventory } from "./etsy-price-transport";
import { printfulSyncRequest } from "./printful-import.ts";
import { runPrintfulSupplierPreflight } from "./printful-preflight.ts";
import { inspectLiveVariantPrices, updateLiveVariantPrices, type LivePriceDependencies } from "./live-prices.ts";
import { assertCommercePriceWritesEnabled } from "./write-guard.ts";
import { livePriceUpdateSchema } from "./live-price-schema.ts";

export async function inspectEtsyVariantPrices(productId:string){
 const {auth,shopId}=await getWarlockEtsyOperatorContext();
 const deps:LivePriceDependencies={load:()=>findWarlockProduct({productId}),etsyRead:path=>readEtsyForReconciliation(auth.session.access_token,path),
  etsyWrite:(id,body)=>writeEtsyPriceInventory(auth.session.access_token,id,body),printful:printfulSyncRequest,supplier:runPrintfulSupplierPreflight};
 return inspectLiveVariantPrices(productId,shopId,deps);
}
export async function updateEtsyVariantPrices(raw:unknown){
 assertCommercePriceWritesEnabled();const input=livePriceUpdateSchema.parse(raw);
 const {auth,shopId}=await getWarlockEtsyOperatorContext();
 // Serialize this app's canonical and external retail edits for the same product.
 let started=false;let result:Awaited<ReturnType<typeof updateLiveVariantPrices>> | undefined;
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  started=true;result=await updateLiveVariantPrices(input,shopId,{load:()=>findWarlockProduct({productId:input.productId},tx),
   etsyRead:path=>readEtsyForReconciliation(auth.session.access_token,path),etsyWrite:(id,body)=>writeEtsyPriceInventory(auth.session.access_token,id,body),
   printful:printfulSyncRequest,supplier:runPrintfulSupplierPreflight});
  return result;
 },{maxWait:5000,timeout:165000});
 }catch(error){
  if(!started)throw error;
  return {...result,productId:input.productId,state:"VERIFY_OR_RETRY_REQUIRED",stage:"OPERATOR_LOCK_OR_FINALIZE",errorCode:"live_price_operator_lock_interrupted",
   checkedAt:new Date().toISOString(),nextAction:"Inspect live prices before retrying. The operator lock or transaction ended after external work began, so prices may have changed. No rollback is attempted."};
 }
}
