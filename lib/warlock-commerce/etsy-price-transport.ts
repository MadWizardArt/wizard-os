import { etsyHeaders } from "../etsy-client";
import { object, positiveId, type Json } from "./live-price-inventory.ts";
/** Only inventory pricing. This transport cannot publish, edit metadata, or create listings. */
export async function writeEtsyPriceInventory(accessToken:string,listingId:string,body:Json){
 positiveId(listingId);
 const response=await fetch("https://api.etsy.com/v3/application/listings/"+listingId+"/inventory?legacy=false",{
  method:"PUT",headers:{...etsyHeaders(accessToken),"Content-Type":"application/json"},body:JSON.stringify(body),
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
 });
 if(!response.ok)throw Error("etsy_http_"+response.status);
 return object(await response.json().catch(()=>null));
}
