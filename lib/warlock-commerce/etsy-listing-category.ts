import * as z from "zod/v4";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { bookkeepingFingerprint, canonicalBookkeepingFingerprint } from "./listing-observation.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import { flattenSellerTaxonomy, type EtsyTaxonomyNode } from "./etsy-taxonomy.ts";
import type { ListingLinkRead } from "./etsy-listing-link.ts";

export const etsyTaxonomyId = z.number().int().positive().max(2147483647);
const id = z.string().min(1).max(100);
export const categoryPreviewShape = { productId:id, fulfillment:z.enum(["DIGITAL","PHYSICAL"]), expectedEtsyListingId:z.string().regex(/^[1-9]\d{0,18}$/), newTaxonomyId:etsyTaxonomyId };
export const categoryApplyShape = { productId:id, previewId:id, confirmCategoryChange:z.literal(true) };
export const categoryPreviewSchema=z.strictObject(categoryPreviewShape), categoryApplySchema=z.strictObject(categoryApplyShape);
export type CategoryInput=z.infer<typeof categoryPreviewSchema>;
export function categoryListing(product:WarlockProductManifest,input:CategoryInput) {
 const listings=product.listings.filter(l=>l.fulfillment===input.fulfillment);
 if(product.id!==input.productId||listings.length!==1||listings[0].etsyListingId!==input.expectedEtsyListingId)throw Error("etsy_category_listing_changed");
 return listings[0];
}
class CategoryResponseError extends Error {
 readonly validation: {stage:string; fields:Array<{field:string;code:string}>};
 constructor(stage:string,error:z.ZodError) {
  super("etsy_category_response_invalid");
  this.validation={stage,fields:error.issues.slice(0,20).map(i=>({field:i.path.join('.'),code:i.code}))};
 }
}
export function categoryErrorDetails(e:unknown):Record<string,unknown> {
 return e instanceof CategoryResponseError ? {validation:e.validation} : {};
}
async function categoryTarget(read:ListingLinkRead,taxonomyId:number) {
 const payload=await read('/seller-taxonomy/nodes');
 if(!Array.isArray(payload.results))throw Error("etsy_category_taxonomy_invalid");
 // Validate remote nodes before passing them to the existing taxonomy path resolver.
 const nodeSchema: z.ZodType<EtsyTaxonomyNode> = z.lazy(()=>z.object({id:etsyTaxonomyId,name:z.string().min(1),level:z.number().int().nonnegative(),parent_id:z.number().int().nullish().transform(v=>v??null),children:z.array(nodeSchema).optional()}));
 const parsed=z.array(nodeSchema).safeParse(payload.results);
 if(!parsed.success)throw new CategoryResponseError("seller_taxonomy",parsed.error);
 const nodes=parsed.data;
 const target=flattenSellerTaxonomy(nodes).find(n=>n.id===taxonomyId);
 if(!target)throw Error("etsy_category_taxonomy_not_found");
 return {id:target.id,name:target.name,path:target.path};
}
export async function readCategorySnapshot(read:ListingLinkRead,input:CategoryInput,shopId:number) {
 const remote=await read('/listings/'+input.expectedEtsyListingId);
 if(String(remote.listing_id)!==input.expectedEtsyListingId||String(remote.shop_id)!==String(shopId))throw Error("etsy_category_ownership_mismatch");
 if(!["draft","active"].includes(String(remote.state)))throw Error("etsy_category_state_unsupported");
 if(etsyListingType(remote)!==(input.fulfillment==="DIGITAL"?"download":"physical"))throw Error("etsy_category_type_mismatch");
 const parsed=z.object({taxonomy_id:etsyTaxonomyId}).safeParse(remote);
 if(!parsed.success)throw new CategoryResponseError("listing",parsed.error);
 const taxonomyId=parsed.data.taxonomy_id;
 const stable=Object.fromEntries(Object.entries(remote).filter(([k])=>!k.endsWith('_timestamp')&&!["taxonomy_id","num_favorers","views"].includes(k)));
 let inventoryFingerprint:string|null=null;
 if(input.fulfillment==='PHYSICAL') {
  const inventory=await read(`/listings/${input.expectedEtsyListingId}/inventory?legacy=false`);
  if(!Array.isArray(inventory.products))throw Error("etsy_category_inventory_invalid");
  inventoryFingerprint=bookkeepingFingerprint(inventory);
 }
 return {taxonomyId,state:String(remote.state),otherFieldsFingerprint:bookkeepingFingerprint(stable),inventoryFingerprint};
}
export async function buildCategoryPreview(product:WarlockProductManifest,input:CategoryInput,shopId:number,read:ListingLinkRead) {
 const listing=categoryListing(product,input),target=await categoryTarget(read,input.newTaxonomyId),remote=await readCategorySnapshot(read,input,shopId);
 if(listing.taxonomyId===input.newTaxonomyId&&remote.taxonomyId===input.newTaxonomyId)throw Error("etsy_category_already_matches");
 return {version:1 as const,input,shopId,canonicalFingerprint:canonicalBookkeepingFingerprint(product),canonicalTaxonomyId:listing.taxonomyId,remote,target,expiresAt:new Date(Date.now()+600000).toISOString(),
 warnings:["CATEGORY_ATTRIBUTES_REQUIRE_REVIEW: Etsy may require category-specific attributes. No attribute or variation values are guessed; Etsy rejection or changed inventory returns a review requirement."]};
}
export type CategoryPreview=Awaited<ReturnType<typeof buildCategoryPreview>>;
export async function verifyCategoryTarget(read:ListingLinkRead,p:CategoryPreview) {
 if(bookkeepingFingerprint(await categoryTarget(read,p.input.newTaxonomyId))!==bookkeepingFingerprint(p.target))throw Error("etsy_category_taxonomy_changed");
}
export function assertCategoryPreview(product:WarlockProductManifest,p:CategoryPreview,shopId:number) {
 if(p.version!==1||!Number.isFinite(Date.parse(p.expiresAt))||Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_category_preview_expired");
 if(p.shopId!==shopId||canonicalBookkeepingFingerprint(product)!==p.canonicalFingerprint)throw Error("etsy_category_canonical_changed");
 categoryListing(product,p.input);
}
export function sameCategorySnapshot(a:CategoryPreview['remote'],b:CategoryPreview['remote']) {return bookkeepingFingerprint(a)===bookkeepingFingerprint(b);}
export function safeCategoryError(e:unknown) {const s=e instanceof Error?e.message:"";return /^(etsy_category_[a-z_]+|etsy_reconciliation_path_invalid|etsy_invalid_response|etsy_http_\d{3}|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing|warlock_commerce_writes_disabled|etsy_listing_type_[a-z_]+)$/.test(s)?s:"etsy_category_edit_failed";}
