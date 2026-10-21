import { etsyListingType } from "./etsy-listing-type.ts";

type Variant = { productId:string; etsyListingId:string|null; etsyProductId:string|null; etsySku:string|null; label:string; retailPriceCents:number|null };
type Listing = { productId:string; fulfillment:string; etsyListingId:string|null; printfulSyncProductId:string|null; observationJson:string|null };
type Read = (path:string)=>Promise<Record<string,unknown>>;
function fail():never { throw Error("printful_imported_draft_identity_changed"); }

/** Read-only recovery evidence; never allows remapping an existing supplier identity. */
export async function verifyImportedDraftMapping(variant:Variant, listing:Listing|null, shopId:number, read:Read) {
  if (!listing || listing.productId!==variant.productId || listing.fulfillment!=="PHYSICAL" ||
      !variant.etsyListingId || listing.etsyListingId!==variant.etsyListingId || listing.printfulSyncProductId ||
      !variant.etsyProductId || !variant.etsySku || !variant.retailPriceCents) fail();
  let observation;
  try { observation=JSON.parse(listing.observationJson ?? "null"); } catch { fail(); }
  if (observation?.source!=="ETSY_DRAFT_IMPORT" || observation.snapshot?.remoteState!=="draft" ||
      observation.snapshot?.fulfillment!=="PHYSICAL" || !Array.isArray(observation.snapshot?.variants)) fail();
  const imported=observation.snapshot.variants.filter((v:Variant)=>v.etsyProductId===variant.etsyProductId);
  if (imported.length!==1 || imported[0].etsySku!==variant.etsySku || imported[0].label!==variant.label ||
      imported[0].retailPriceCents!==variant.retailPriceCents) fail();
  const path="/listings/"+variant.etsyListingId;
  const verifyListing=(remote:Record<string,unknown>)=>{
    if (String(remote.listing_id)!==variant.etsyListingId || String(remote.shop_id)!==String(shopId) ||
        remote.state!=="draft" || etsyListingType(remote)!=="physical") fail();
  };
  verifyListing(await read(path));
  const inventory=await read(path+"/inventory?legacy=false");
  if (!Array.isArray(inventory.products)) fail();
  const matches=inventory.products.filter(p=>p && !p.is_deleted && String(p.product_id)===variant.etsyProductId);
  if (matches.length!==1) fail();
  const product=matches[0];
  if (product.sku!==variant.etsySku || !Array.isArray(product.property_values) || !Array.isArray(product.offerings)) fail();
  const labels=product.property_values.map((p:Record<string,unknown>)=>{
    if (!Array.isArray(p.values) || p.values.some(v=>typeof v!=="string")) fail();
    return p.values.join(" / ");
  }).filter(Boolean).join(" / ");
  if (labels!==variant.label) fail();
  const offerings=product.offerings.filter((o:Record<string,unknown>)=>!o.is_deleted);
  if (offerings.length!==1 || offerings[0].is_enabled!==true) fail();
  const money=offerings[0].price;
  if (!money || money.currency_code!=="USD" || !Number.isSafeInteger(money.amount) || money.amount<0 ||
      !Number.isSafeInteger(money.divisor) || money.divisor<=0 ||
      !Number.isSafeInteger(money.amount*100) || money.amount*100!==variant.retailPriceCents!*money.divisor) fail();
  verifyListing(await read(path));
}

export async function importedDraftContext() {
  const { getWarlockEtsyOperatorContext }=await import("../warlock-auth");
  const { readEtsyForReconciliation }=await import("./etsy-reconciliation-read");
  const {auth,shopId}=await getWarlockEtsyOperatorContext();
  return {shopId,read:(path:string)=>readEtsyForReconciliation(auth.session.access_token,path)};
}
