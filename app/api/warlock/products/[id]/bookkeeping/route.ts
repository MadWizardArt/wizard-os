import { previewEtsyListingLink, applyEtsyListingLink } from "../../../../../../lib/warlock-commerce/etsy-listing-link-executor";
import { safeListingLinkError } from "../../../../../../lib/warlock-commerce/etsy-listing-link";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../../lib/museum-artist-auth";
import { sameOrigin } from "../../../../../../lib/warlock-products";
import { getProductBookkeeping, recordProductNote, reconcileEtsyListing, safeBookkeepingError } from "../../../../../../lib/warlock-commerce/bookkeeping";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({error:"artist_session_required"},{status:401,headers});
  const {id}=await context.params;
  try { return NextResponse.json(await getProductBookkeeping({productId:id,offset:Number(request.nextUrl.searchParams.get("offset") ?? 0)}),{headers}); }
  catch(error){return NextResponse.json({error:safeBookkeepingError(error)},{status:400,headers});}
}
export async function POST(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({error:"artist_session_required"},{status:401,headers});
  if (!sameOrigin(request)) return NextResponse.json({error:"cross_origin_request"},{status:403,headers});
  const {id}=await context.params, input=await request.json().catch(()=>null);
  if (!input || typeof input!=="object" || Array.isArray(input)) return NextResponse.json({error:"bookkeeping_invalid_input"},{status:400,headers});
  try {
    const {action,...body}=input;
    const result=action==="NOTE"?await recordProductNote({...input,productId:id}):action==="RECONCILE"?await reconcileEtsyListing({...input,productId:id}):action==="PREVIEW_LINK"?await previewEtsyListingLink({...body,productId:id}):action==="APPLY_LINK"?await applyEtsyListingLink({...body,productId:id}):null;
    if (!result) return NextResponse.json({error:"bookkeeping_invalid_action"},{status:400,headers});
    return NextResponse.json(result,{headers});
  } catch(error){return NextResponse.json({error:input.action==="PREVIEW_LINK"||input.action==="APPLY_LINK"?safeListingLinkError(error):safeBookkeepingError(error)},{status:400,headers});}
}
