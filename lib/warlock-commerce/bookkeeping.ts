import * as z from "zod/v4";
import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { bookkeepingFingerprint, canonicalBookkeepingFingerprint, listingEvidenceFingerprint, observeEtsyListing } from "./listing-observation.ts";

const productId = z.string().trim().min(1).max(100);
const remoteId = z.string().regex(/^[1-9]\d{0,18}$/);
export const bookkeepingReadShape = { productId: productId.optional(), offset: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(50).optional() };
export const productNoteShape = { productId, requestId: z.string().trim().min(8).max(100), note: z.string().trim().min(1).max(4000), confirmRecord: z.literal(true) };
export const listingReconciliationShape = { productId, fulfillment: z.enum(["DIGITAL", "PHYSICAL"]), expectedEtsyListingId: remoteId,
  assetMappings: z.array(z.object({ linkId: z.string().min(1).max(100), expectedRemoteId: remoteId.nullable(), remoteId })).max(20).optional().describe("Optional explicitly reviewed associations from canonical link IDs to observed Etsy image/file IDs. Never infer artwork identity from rank or filename alone."),
  confirmReconciliation: z.literal(true) };
const readSchema = z.object(bookkeepingReadShape), noteSchema = z.object(productNoteShape), reconciliationSchema = z.object(listingReconciliationShape);
export function safeBookkeepingError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^(bookkeeping_[a-z0-9_]+|etsy_http_\d{3}|etsy_invalid_response|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing)$/.test(code) ? code : "bookkeeping_request_failed";
}
function parse(value: string | null) { return value ? JSON.parse(value) : null; }
export async function getProductBookkeeping(raw: unknown) {
  const input = readSchema.parse(raw), offset=input.offset ?? 0, limit=input.limit ?? 25;
  if (!input.productId) {
    const products = await prisma.spellmarkProduct.findMany({ orderBy: [{updatedAt:"desc"},{id:"asc"}], skip:offset,take:limit,
      select:{id:true,title:true,status:true,updatedAt:true,variants:{select:{id:true,fulfillment:true,retailPriceCents:true,currency:true}},listings:{include:{assets:true}}} });
    return { mode:"CATALOG_BOOKKEEPING",offset,limit,products:products.map(({variants,...p})=>({...p,listings:p.listings.map(({observationJson,...l})=>({...l,observation:parse(observationJson),verificationCurrent:Boolean(l.lastVerifiedAt && parse(observationJson)?.canonicalFingerprint===listingEvidenceFingerprint(l,variants))}))})),nextOffset:products.length===limit?offset+limit:null };
  }
  const product = await prisma.spellmarkProduct.findUnique({ where:{id:input.productId},select:{id:true,title:true,notes:true,status:true,variants:{select:{id:true,fulfillment:true,retailPriceCents:true,currency:true}},listings:{include:{assets:true}}} });
  if (!product) throw Error("bookkeeping_product_not_found");
  const history = await prisma.spellmarkJournal.findMany({where:{productId:product.id},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:offset,take:limit});
  return { mode:"PRODUCT_BOOKKEEPING", productId:product.id,title:product.title,notes:product.notes,workflowStatus:product.status,
    listings:product.listings.map(({observationJson,...l})=>({...l,observation:parse(observationJson),verificationCurrent:Boolean(l.lastVerifiedAt && parse(observationJson)?.canonicalFingerprint===listingEvidenceFingerprint(l,product.variants))})),
    history:history.map(({bodyJson,...event})=>({...event,body:parse(bodyJson)})), offset,limit,nextOffset:history.length===limit?offset+limit:null,
    nextAction:"Reconcile saved listings to refresh live evidence. Record notes for production decisions. Observations are point-in-time facts, not live guarantees; workflow and observed Etsy state remain separate." };
}
export async function recordProductNote(raw: unknown) {
  const input=noteSchema.parse(raw), bodyJson=JSON.stringify({note:input.note});
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.productId}))::text`;
    if (!await tx.spellmarkProduct.findUnique({where:{id:input.productId},select:{id:true}})) throw Error("bookkeeping_product_not_found");
    const old=await tx.spellmarkJournal.findUnique({where:{productId_requestId:{productId:input.productId,requestId:input.requestId}}});
    if(old && (old.kind!=="NOTE" || old.bodyJson!==bodyJson)) throw Error("bookkeeping_request_id_conflict");
    const event=old ?? await tx.spellmarkJournal.create({data:{productId:input.productId,requestId:input.requestId,kind:"NOTE",bodyJson}});
    return {state:"NOTE_RECORDED",productId:input.productId,eventId:event.id,createdAt:event.createdAt,note:input.note,reused:Boolean(old),etsyMutated:false};
  });
}
export async function reconcileEtsyListing(raw: unknown) {
  const input=reconciliationSchema.parse(raw), product=await findWarlockProduct({productId:input.productId});
  if(!product)throw Error("bookkeeping_product_not_found");
  const listing=product.listings.find(l=>l.fulfillment===input.fulfillment);
  if(!listing || listing.etsyListingId!==input.expectedEtsyListingId)throw Error("bookkeeping_listing_identity_changed");
  const signature=canonicalBookkeepingFingerprint(product),{auth,shopId}=await getWarlockEtsyOperatorContext();
  const read=(path:string)=>readEtsyForReconciliation(auth.session.access_token,path), path="/listings/"+listing.etsyListingId;
  const remote=await read(path);
  // Verify identity before fetching private files or attaching any evidence.
  if(String(remote.shop_id)!==String(shopId) || String(remote.listing_id)!==listing.etsyListingId)throw Error("bookkeeping_listing_ownership_mismatch");
  const [images,files]=await Promise.all([read(path+"/images"),input.fulfillment==="DIGITAL"?read("/shops/"+shopId+path+"/files"):Promise.resolve({count:0,results:[]})]);
  const [rechecked, recheckedImages, recheckedFiles]=await Promise.all([read(path),read(path+"/images"),input.fulfillment==="DIGITAL"?read("/shops/"+shopId+path+"/files"):Promise.resolve({count:0,results:[]})]);
  if(bookkeepingFingerprint(images)!==bookkeepingFingerprint(recheckedImages) || bookkeepingFingerprint(files)!==bookkeepingFingerprint(recheckedFiles))throw Error("bookkeeping_etsy_assets_changed_retry");
  const relevant=(r:Record<string,unknown>)=>[r.listing_id,r.shop_id,r.state,r.listing_type,r.type,r.when_made,r.title,r.description,r.price,r.updated_timestamp];
  if(bookkeepingFingerprint(relevant(remote))!==bookkeepingFingerprint(relevant(rechecked)))throw Error("bookkeeping_etsy_changed_retry");
  const observation=observeEtsyListing(product,listing,shopId,rechecked,images,files,input.assetMappings),checkedAt=new Date();
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.productId}))::text`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT a.id FROM "SpellmarkListingAsset" a JOIN "SpellmarkListing" l ON l.id = a."listingId" WHERE l."productId" = ${input.productId} FOR UPDATE OF a`;
    const current=await findWarlockProduct({productId:input.productId},tx);
    if(!current || canonicalBookkeepingFingerprint(current)!==signature)throw Error("bookkeeping_canonical_changed_retry");
    // Do not overwrite canonical prices, titles, workflow stages, or supplier mapping with observed data.
    for(const mapping of input.assetMappings ?? [])await tx.spellmarkListingAsset.update({where:{id:mapping.linkId},data:{etsyRemoteId:mapping.remoteId,etsySyncedAt:checkedAt}});
    const saved=await tx.spellmarkListing.findUniqueOrThrow({where:{id:listing.id}}),bodyJson=JSON.stringify(observation);
    if(saved.lastVerifiedAt && saved.lastVerifiedAt > checkedAt)throw Error("bookkeeping_newer_verification_exists_retry");
    await tx.spellmarkListing.update({where:{id:listing.id},data:{lastVerifiedAt:checkedAt,observationJson:bodyJson}});
    if(saved.observationJson!==bodyJson)await tx.spellmarkJournal.create({data:{productId:product.id,requestId:crypto.randomUUID(),kind:"ETSY_OBSERVATION",bodyJson:JSON.stringify({...observation,checkedAt:checkedAt.toISOString()})}});
  });
  return {state:observation.assessment==="VERIFIED"?"RECONCILED":"NEEDS_REVIEW",productId:product.id,checkedAt:checkedAt.toISOString(),observation,
    nextAction:observation.discrepancies.length?"Review discrepancies. Explicitly associate known canonical image/file links using assetMappings, then reconcile again. Prices and live listing edits use their dedicated tools; physical supplier mapping uses reconcile_printful_product.":"Verified Etsy evidence is stored. Read it with get_product_bookkeeping; publishing remains a human action."};
}
