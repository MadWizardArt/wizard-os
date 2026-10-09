import { etsyHeaders } from "../etsy-client";
import { etsyWriteError } from "./etsy-write-error.ts";
import { etsyTaxonomyId } from "./etsy-listing-category.ts";
/** Narrow PATCH transport: taxonomy_id is the only form key; no state/publication, copy, inventory or images. */
export async function writeEtsyCategory(token:string,shopId:number,listingId:string,taxonomyId:number){
 if(!Number.isSafeInteger(shopId)||shopId<1||!/^\d+$/.test(listingId))throw Error("etsy_category_identity_invalid");
 const body=new URLSearchParams({taxonomy_id:String(etsyTaxonomyId.parse(taxonomyId))});
 const response=await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,{method:"PATCH",headers:{...etsyHeaders(token),"Content-Type":"application/x-www-form-urlencoded"},body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw await etsyWriteError(response,"listing",[token,...Object.values(etsyHeaders(token))]);
}
