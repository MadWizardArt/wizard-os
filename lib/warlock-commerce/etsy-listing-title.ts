import * as z from "zod/v4";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { bookkeepingFingerprint, canonicalBookkeepingFingerprint } from "./listing-observation.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import type { ListingLinkRead } from "./etsy-listing-link.ts";
export const etsyTitle = z.string().min(1).max(140).refine(t => t.trim() === t && !!t.trim() && !/[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/u.test(t) && [..."%:&+"].every(c => t.split(c).length <= 2), "Use 1–140 characters, Etsy-supported title characters, and each of %, :, & and + at most once.");
const id=z.string().min(1).max(100);
export const titlePreviewShape={productId:id,fulfillment:z.enum(["DIGITAL","PHYSICAL"]),expectedEtsyListingId:z.string().regex(/^[1-9]\d{0,18}$/),newTitle:etsyTitle};
export const titleApplyShape={productId:id,previewId:id,confirmTitleChange:z.literal(true)};
export const titlePreviewSchema=z.strictObject(titlePreviewShape),titleApplySchema=z.strictObject(titleApplyShape);
export type TitleInput=z.infer<typeof titlePreviewSchema>;
export function titleListing(product:WarlockProductManifest,input:TitleInput){const list=product.listings.filter(l=>l.fulfillment===input.fulfillment);if(product.id!==input.productId||list.length!==1||list[0].etsyListingId!==input.expectedEtsyListingId)throw Error("etsy_title_listing_changed");return list[0];}
export function titleSnapshot(remote:Record<string,unknown>,input:TitleInput,shopId:number){
 if(String(remote.listing_id)!==input.expectedEtsyListingId||String(remote.shop_id)!==String(shopId))throw Error("etsy_title_ownership_mismatch");
 if(!["draft","active"].includes(String(remote.state)))throw Error("etsy_title_state_unsupported");
 if(etsyListingType(remote)!==(input.fulfillment==="DIGITAL"?"download":"physical"))throw Error("etsy_title_type_mismatch");
 if(typeof remote.title!=="string")throw Error("etsy_title_response_invalid");
 // Readback verifies stable listing fields; server timestamps and engagement counters are not edit evidence.
 const stable=Object.fromEntries(Object.entries(remote).filter(([k])=>!k.endsWith("_timestamp")&&!["title","num_favorers","views"].includes(k)));
 return {title:remote.title,state:String(remote.state),otherFieldsFingerprint:bookkeepingFingerprint(stable)};
}
export async function buildTitlePreview(product:WarlockProductManifest,input:TitleInput,shopId:number,read:ListingLinkRead){
 const listing=titleListing(product,input),remote=titleSnapshot(await read('/listings/'+input.expectedEtsyListingId),input,shopId);
 if(listing.title===input.newTitle&&remote.title===input.newTitle)throw Error("etsy_title_already_matches");
 const words=input.newTitle.split(/\s+/).length;
 return {version:1 as const,input,shopId,canonicalFingerprint:canonicalBookkeepingFingerprint(product),canonicalTitle:listing.title,remote,expiresAt:new Date(Date.now()+600000).toISOString(),
 titleReview:{characters:input.newTitle.length,words,advisories:words>=15?["Consider fewer than 15 words for a clear, easy-to-scan title; this is guidance, not a hard limit."]:[],guidance:"Describe the item and its important distinguishing traits clearly. Avoid repeated keywords or unsupported claims. Owner review determines accuracy; no search ranking is promised."}};
}
export type TitlePreview=Awaited<ReturnType<typeof buildTitlePreview>>;
export function assertTitlePreview(product:WarlockProductManifest,p:TitlePreview,shopId:number){if(p.version!==1||!Number.isFinite(Date.parse(p.expiresAt))||Date.now()>=Date.parse(p.expiresAt))throw Error("etsy_title_preview_expired");if(p.shopId!==shopId||canonicalBookkeepingFingerprint(product)!==p.canonicalFingerprint)throw Error("etsy_title_canonical_changed");titleListing(product,p.input);}
export function sameTitleSnapshot(a:TitlePreview['remote'],b:TitlePreview['remote']){return bookkeepingFingerprint(a)===bookkeepingFingerprint(b);}
export function safeTitleError(e:unknown){const s=e instanceof Error?e.message:"";return /^(etsy_title_[a-z_]+|etsy_http_\d{3}|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing|warlock_commerce_writes_disabled|etsy_listing_type_[a-z_]+)$/.test(s)?s:"etsy_title_edit_failed";}
