import { etsyHeaders } from "../etsy-client";
import { etsyWriteError } from "./etsy-write-error.ts";
import { etsyTitle } from "./etsy-listing-title.ts";
/** Narrow PATCH transport: title is the only form key; no state/publication, copy, inventory or images. */
export async function writeEtsyTitle(token:string,shopId:number,listingId:string,title:string){
 if(!Number.isSafeInteger(shopId)||shopId<1||!/^\d+$/.test(listingId))throw Error("etsy_title_identity_invalid");
 const body=new URLSearchParams({title:etsyTitle.parse(title)});
 const response=await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,{method:"PATCH",headers:{...etsyHeaders(token),"Content-Type":"application/x-www-form-urlencoded"},body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw await etsyWriteError(response,"listing",[token,...Object.values(etsyHeaders(token))]);
}
