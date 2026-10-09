import { etsyFailureDetails } from "./etsy-write-error.ts";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { writeEtsyCategory } from "./etsy-category-transport";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { categoryPreviewSchema,categoryApplySchema,buildCategoryPreview,assertCategoryPreview,categoryListing,readCategorySnapshot,sameCategorySnapshot,safeCategoryError,verifyCategoryTarget,type CategoryPreview } from "./etsy-listing-category.ts";
async function context(){const {auth,shopId}=await getWarlockEtsyOperatorContext();return {shopId,token:auth.session.access_token,read:(p:string)=>readEtsyForReconciliation(auth.session.access_token,p)};}
export async function previewEtsyListingCategory(raw:unknown){const input=categoryPreviewSchema.parse(raw),product=await findWarlockProduct({productId:input.productId});if(!product)throw Error("etsy_category_product_missing");const {shopId,read}=await context();const preview=await buildCategoryPreview(product,input,shopId,read);const saved=await prisma.spellmarkJournal.create({data:{productId:product.id,requestId:randomUUID(),kind:"ETSY_CATEGORY_PREVIEW",bodyJson:JSON.stringify(preview)}});return {state:"PREVIEW_READY",previewId:saved.id,preview,etsyMutated:false,nextAction:"Show the canonical and current Etsy taxonomy IDs, exact proposed taxonomy ID/path, state and warnings for owner approval. Apply this previewId with confirmCategoryChange:true. No live write occurs during preview."};}
export async function applyEtsyListingCategory(raw:unknown){
 const input=categoryApplySchema.parse(raw);assertCommerceDraftWritesEnabled();
 const saved=await prisma.spellmarkJournal.findFirst({where:{id:input.previewId,productId:input.productId,kind:"ETSY_CATEGORY_PREVIEW"}});if(!saved)throw Error("etsy_category_preview_not_found");
 const p=JSON.parse(saved.bodyJson) as CategoryPreview;if(p.input.productId!==input.productId)throw Error("etsy_category_product_mismatch");
 const key={productId:input.productId,requestId:"etsy-category:"+saved.id},old=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:key}});
 if(old&&JSON.parse(old.bodyJson).state==="CATEGORY_VERIFIED")return {...JSON.parse(old.bodyJson),reused:true,historical:true};
 const {shopId,read,token}=await context();if(shopId!==p.shopId)throw Error("etsy_category_shop_changed");
 // Commit approved canonical intent before an external write. A failed/unknown write never loses its ledger record.
 if(!old)await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  if(await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}}))throw Error("etsy_category_request_started_retry");
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product)throw Error("etsy_category_product_missing");assertCategoryPreview(product,p,shopId);
  await verifyCategoryTarget(read,p);
  const remote=await readCategorySnapshot(read,p.input,shopId);if(!sameCategorySnapshot(remote,p.remote))throw Error("etsy_category_remote_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_category_preview_expired");
  const listing=categoryListing(product,p.input);
  await tx.spellmarkJournal.create({data:{...key,kind:"ETSY_CATEGORY_CHANGE",bodyJson:JSON.stringify({state:"INTENT_SAVED",previewId:saved.id,listingId:listing.id,approvedPreview:p})}});
  await tx.spellmarkListing.update({where:{id:listing.id},data:{taxonomyId:p.input.newTaxonomyId,lastVerifiedAt:null,observationJson:null}});
 },{timeout:60000,maxWait:5000});
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const event=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});if(!event)throw Error("etsy_category_intent_missing");const intent=JSON.parse(event.bodyJson);
  if(intent.state==="CATEGORY_VERIFIED")return {...intent,reused:true,historical:true};
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product)throw Error("etsy_category_product_missing");const listing=categoryListing(product,p.input);if(listing.taxonomyId!==p.input.newTaxonomyId)throw Error("etsy_category_canonical_changed");
  const before=await readCategorySnapshot(read,p.input,shopId);
  const expected={...p.remote,taxonomyId:p.input.newTaxonomyId};
  if(!sameCategorySnapshot(before,expected)){
   // Only the first execution may send PATCH. Retries of an uncertain operation are verification-only.
   if(old||intent.state!=="INTENT_SAVED")throw Error("etsy_category_unknown_outcome_review_required");
   if(!sameCategorySnapshot(before,p.remote))throw Error("etsy_category_remote_changed");
   if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_category_preview_expired");
   // Mark sending durably outside this transaction below; no request is replayed after a failure.
   throw Error("etsy_category_send_ready");
  }
  const result={state:"CATEGORY_VERIFIED",productId:input.productId,previewId:saved.id,listingId:listing.id,etsyListingId:listing.etsyListingId,taxonomyId:p.input.newTaxonomyId,listingState:before.state,verification:before,verifiedAt:new Date().toISOString(),etsyMutated:p.remote.taxonomyId!==p.input.newTaxonomyId,published:false,approvedPreview:p};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:60000,maxWait:5000});}catch(e){
  if(!(e instanceof Error)||e.message!=="etsy_category_send_ready")return {state:"NEEDS_REVIEW",productId:input.productId,previewId:saved.id,errorCode:safeCategoryError(e),etsyRejection:etsyFailureDetails(e),canonicalTaxonomyId:p.input.newTaxonomyId,nextAction:"Inspect current Etsy category and ledger. This operation will not blindly repeat a PATCH."};
 }
 // A durable SENDING marker commits before PATCH. Serialize this final read/write with other canonical edits.
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  const event=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});if(!event||JSON.parse(event.bodyJson).state!=="INTENT_SAVED")throw Error("etsy_category_request_started_retry");
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product||categoryListing(product,p.input).taxonomyId!==p.input.newTaxonomyId)throw Error("etsy_category_canonical_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_category_preview_expired");
  if(!sameCategorySnapshot(await readCategorySnapshot(read,p.input,shopId),p.remote))throw Error("etsy_category_remote_changed");
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({...JSON.parse(event.bodyJson),state:"SENDING"})}});
  return {state:"SENDING"};
 },{timeout:60000,maxWait:5000}).then(async()=>prisma.$transaction(async tx=>{
  // SENDING is committed first: rollback cannot erase an uncertain write.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product||categoryListing(product,p.input).taxonomyId!==p.input.newTaxonomyId)throw Error("etsy_category_canonical_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_category_preview_expired");
  if(!sameCategorySnapshot(await readCategorySnapshot(read,p.input,shopId),p.remote))throw Error("etsy_category_remote_changed");
  await verifyCategoryTarget(read,p);
  await writeEtsyCategory(token,shopId,p.input.expectedEtsyListingId,p.input.newTaxonomyId);
  const after=await readCategorySnapshot(read,p.input,shopId);
  if(!sameCategorySnapshot(after,{...p.remote,taxonomyId:p.input.newTaxonomyId}))throw Error("etsy_category_readback_mismatch");
  const result={state:"CATEGORY_VERIFIED",productId:input.productId,previewId:saved.id,etsyListingId:p.input.expectedEtsyListingId,taxonomyId:p.input.newTaxonomyId,listingState:after.state,verification:after,verifiedAt:new Date().toISOString(),etsyMutated:true,published:false,approvedPreview:p};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:60000,maxWait:5000}));}catch(e){return {state:"NEEDS_REVIEW",productId:input.productId,previewId:saved.id,errorCode:safeCategoryError(e),etsyRejection:etsyFailureDetails(e),canonicalTaxonomyId:p.input.newTaxonomyId,nextAction:"Canonical intent is saved; inspect Etsy before continuing. Retry this same preview to verify only. No automatic rollback or repeated PATCH."};}
}
