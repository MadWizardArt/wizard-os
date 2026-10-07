import { etsyFailureDetails } from "./etsy-write-error.ts";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { writeEtsyTitle } from "./etsy-title-transport";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { titlePreviewSchema,titleApplySchema,buildTitlePreview,assertTitlePreview,titleListing,titleSnapshot,sameTitleSnapshot,safeTitleError,type TitlePreview } from "./etsy-listing-title.ts";
async function context(){const {auth,shopId}=await getWarlockEtsyOperatorContext();return {shopId,token:auth.session.access_token,read:(p:string)=>readEtsyForReconciliation(auth.session.access_token,p)};}
export async function previewEtsyListingTitle(raw:unknown){const input=titlePreviewSchema.parse(raw),product=await findWarlockProduct({productId:input.productId});if(!product)throw Error("etsy_title_product_missing");const {shopId,read}=await context();const preview=await buildTitlePreview(product,input,shopId,read);const saved=await prisma.spellmarkJournal.create({data:{productId:product.id,requestId:randomUUID(),kind:"ETSY_TITLE_PREVIEW",bodyJson:JSON.stringify(preview)}});return {state:"PREVIEW_READY",previewId:saved.id,preview,etsyMutated:false,nextAction:"Show the canonical title, current Etsy title, exact new title and active/draft state for owner approval. Apply this previewId with confirmTitleChange:true. This changes only the listing title; the internal product name remains unchanged."};}
export async function applyEtsyListingTitle(raw:unknown){
 const input=titleApplySchema.parse(raw);assertCommerceDraftWritesEnabled();
 const saved=await prisma.spellmarkJournal.findFirst({where:{id:input.previewId,productId:input.productId,kind:"ETSY_TITLE_PREVIEW"}});if(!saved)throw Error("etsy_title_preview_not_found");
 const p=JSON.parse(saved.bodyJson) as TitlePreview;if(p.input.productId!==input.productId)throw Error("etsy_title_product_mismatch");
 const key={productId:input.productId,requestId:"etsy-title:"+saved.id},old=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:key}});
 if(old&&JSON.parse(old.bodyJson).state==="TITLE_VERIFIED")return {...JSON.parse(old.bodyJson),reused:true,historical:true};
 const {shopId,read,token}=await context();if(shopId!==p.shopId)throw Error("etsy_title_shop_changed");
 // Commit approved canonical intent before an external write. A failed/unknown write never loses its ledger record.
 if(!old)await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  if(await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}}))throw Error("etsy_title_request_started_retry");
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product)throw Error("etsy_title_product_missing");assertTitlePreview(product,p,shopId);
  const remote=titleSnapshot(await read('/listings/'+p.input.expectedEtsyListingId),p.input,shopId);if(!sameTitleSnapshot(remote,p.remote))throw Error("etsy_title_remote_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_title_preview_expired");
  const listing=titleListing(product,p.input);
  await tx.spellmarkJournal.create({data:{...key,kind:"ETSY_TITLE_CHANGE",bodyJson:JSON.stringify({state:"INTENT_SAVED",previewId:saved.id,listingId:listing.id,approvedPreview:p})}});
  await tx.spellmarkListing.update({where:{id:listing.id},data:{title:p.input.newTitle,lastVerifiedAt:null,observationJson:null}});
 },{timeout:60000,maxWait:5000});
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const event=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});if(!event)throw Error("etsy_title_intent_missing");const intent=JSON.parse(event.bodyJson);
  if(intent.state==="TITLE_VERIFIED")return {...intent,reused:true,historical:true};
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product)throw Error("etsy_title_product_missing");const listing=titleListing(product,p.input);if(listing.title!==p.input.newTitle)throw Error("etsy_title_canonical_changed");
  const before=titleSnapshot(await read('/listings/'+p.input.expectedEtsyListingId),p.input,shopId);
  const expected={...p.remote,title:p.input.newTitle};
  if(!sameTitleSnapshot(before,expected)){
   // Only the first execution may send PATCH. Retries of an uncertain operation are verification-only.
   if(old||intent.state!=="INTENT_SAVED")throw Error("etsy_title_unknown_outcome_review_required");
   if(!sameTitleSnapshot(before,p.remote))throw Error("etsy_title_remote_changed");
   if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_title_preview_expired");
   // Mark sending durably outside this transaction below; no request is replayed after a failure.
   throw Error("etsy_title_send_ready");
  }
  const result={state:"TITLE_VERIFIED",productId:input.productId,previewId:saved.id,listingId:listing.id,etsyListingId:listing.etsyListingId,title:p.input.newTitle,listingState:before.state,verification:before,verifiedAt:new Date().toISOString(),etsyMutated:p.remote.title!==p.input.newTitle,published:false,approvedPreview:p};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:60000,maxWait:5000});}catch(e){
  if(!(e instanceof Error)||e.message!=="etsy_title_send_ready")return {state:"NEEDS_REVIEW",productId:input.productId,previewId:saved.id,errorCode:safeTitleError(e),etsyRejection:etsyFailureDetails(e),canonicalTitle:p.input.newTitle,nextAction:"Inspect current Etsy title and ledger. This operation will not blindly repeat a PATCH."};
 }
 // A durable SENDING marker commits before PATCH. Serialize this final read/write with other canonical edits.
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  const event=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});if(!event||JSON.parse(event.bodyJson).state!=="INTENT_SAVED")throw Error("etsy_title_request_started_retry");
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product||titleListing(product,p.input).title!==p.input.newTitle)throw Error("etsy_title_canonical_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_title_preview_expired");
  if(!sameTitleSnapshot(titleSnapshot(await read('/listings/'+p.input.expectedEtsyListingId),p.input,shopId),p.remote))throw Error("etsy_title_remote_changed");
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({...JSON.parse(event.bodyJson),state:"SENDING"})}});
  return {state:"SENDING"};
 },{timeout:60000,maxWait:5000}).then(async()=>prisma.$transaction(async tx=>{
  // SENDING is committed first: rollback cannot erase an uncertain write.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const product=await findWarlockProduct({productId:input.productId},tx);if(!product||titleListing(product,p.input).title!==p.input.newTitle)throw Error("etsy_title_canonical_changed");
  if(Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_title_preview_expired");
  if(!sameTitleSnapshot(titleSnapshot(await read('/listings/'+p.input.expectedEtsyListingId),p.input,shopId),p.remote))throw Error("etsy_title_remote_changed");
  await writeEtsyTitle(token,shopId,p.input.expectedEtsyListingId,p.input.newTitle);
  const after=titleSnapshot(await read('/listings/'+p.input.expectedEtsyListingId),p.input,shopId);
  if(!sameTitleSnapshot(after,{...p.remote,title:p.input.newTitle}))throw Error("etsy_title_readback_mismatch");
  const result={state:"TITLE_VERIFIED",productId:input.productId,previewId:saved.id,etsyListingId:p.input.expectedEtsyListingId,title:p.input.newTitle,listingState:after.state,verification:after,verifiedAt:new Date().toISOString(),etsyMutated:true,published:false,approvedPreview:p};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:60000,maxWait:5000}));}catch(e){return {state:"NEEDS_REVIEW",productId:input.productId,previewId:saved.id,errorCode:safeTitleError(e),etsyRejection:etsyFailureDetails(e),canonicalTitle:p.input.newTitle,nextAction:"Canonical intent is saved; inspect Etsy before continuing. Retry this same preview to verify only. No automatic rollback or repeated PATCH."};}
}
