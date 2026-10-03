import type { PrismaClient } from "../../app/generated/prisma/client";
import { get, put } from "@vercel/blob";
import { renderPrintfulCanvas } from "./printful-canvas";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { verifyIntakeAsset } from "../warlock-intake-assets";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { printfulSyncRequest } from "./printful-import.ts";
import { printfulGet } from "./printful-catalog.ts";
import { createTemporaryPrintfulAssetUrl } from "./asset-delivery.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { storedSyncId } from "./sync-id-storage.ts";
import { buildPlacementPreview, applyPlacementPreview, type PlacementPreview, placementFingerprint } from "./printful-placements.ts";

async function dependencies(productId:string,db:Pick<PrismaClient,"spellmarkAsset">=prisma) {
  const {auth,shopId}=await getWarlockEtsyOperatorContext();
  const prepared=new Map<string,Promise<Awaited<ReturnType<typeof prepare>>>>();
  async function prepare(asset:Parameters<typeof createTemporaryPrintfulAssetUrl>[0],position:Parameters<typeof renderPrintfulCanvas>[1]) {
      const result=await get(asset.blobUrl,{access:"private"});
      if(!result || result.statusCode!==200)throw Error("printful_placement_asset_missing");
      const reader=result.stream.getReader(),chunks:Buffer[]=[];let size=0;
      try { while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>20*1024*1024)throw Error("printful_placement_asset_too_large");chunks.push(Buffer.from(value.value));} } finally { await reader.cancel(); }
      if(size!==asset.byteSize)throw Error("printful_placement_asset_changed");
      const canvas=await renderPrintfulCanvas(Buffer.concat(chunks),position);
      const fileName="placement-"+canvas.sha256+".png";
      const stored=await put("warlock/"+productId+"/placements/"+fileName,canvas.bytes,{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"image/png"});
      const assetRow=await db.spellmarkAsset.upsert({where:{blobUrl:stored.url},update:{},create:{productId,role:"production_canvas",fileName,blobUrl:stored.url,pathname:stored.pathname,contentType:"image/png",byteSize:canvas.bytes.length}});
      if(assetRow.productId!==productId)throw Error("printful_placement_asset_not_owned");
      return {md5:canvas.md5,width:canvas.width,height:canvas.height,dpi:canvas.dpi,asset:assetRow};
  }
  return {shopId,request:printfulSyncRequest,get:printfulGet,etsyRead:(path:string)=>readEtsyForReconciliation(auth.session.access_token,path),
    prepareCanvas:(asset:Parameters<typeof createTemporaryPrintfulAssetUrl>[0],position:Parameters<typeof renderPrintfulCanvas>[1])=>{
      const key=asset.id+":"+placementFingerprint(position);
      let result=prepared.get(key);if(!result){result=prepare(asset,position);prepared.set(key,result);}return result;
    },
    verifyAsset:(asset:Parameters<typeof createTemporaryPrintfulAssetUrl>[0])=>verifyIntakeAsset({...asset,productId}),temporaryAsset:createTemporaryPrintfulAssetUrl};
}
export async function previewPrintfulPlacements(input:Parameters<typeof buildPlacementPreview>[1] & {productId:string}) {
  const manifest=await findWarlockProduct({productId:input.productId});
  if(!manifest)throw Error("printful_placement_product_missing");
  const preview=await buildPlacementPreview(manifest,input,await dependencies(manifest.id));
  const event=await prisma.spellmarkJournal.create({data:{productId:manifest.id,requestId:randomUUID(),kind:"PRINTFUL_PLACEMENT_PREVIEW",bodyJson:JSON.stringify(preview)}});
  return {...preview,previewId:event.id};
}
export async function applyPrintfulPlacements(input:{productId:string;previewId:string;confirmPlacementWrite:true}) {
  assertCommerceDraftWritesEnabled();
  return prisma.$transaction(async tx=>{
    // Serializes supplier edits for this product across preview applications.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.productId}))::text`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
    const saved=await tx.spellmarkJournal.findFirst({where:{id:input.previewId,productId:input.productId,kind:"PRINTFUL_PLACEMENT_PREVIEW"}});
    if(!saved)throw Error("printful_placement_preview_missing");
    const requestId="placement-apply:"+saved.id;
    const old=await tx.spellmarkJournal.findUnique({where:{productId_requestId:{productId:input.productId,requestId}}});
    if(old)return {...JSON.parse(old.bodyJson),reused:true};
    const manifest=await findWarlockProduct({productId:input.productId},tx);
    if(!manifest)throw Error("printful_placement_product_missing");
    const preview=JSON.parse(saved.bodyJson) as PlacementPreview;
    const deps=await dependencies(input.productId,tx);
    const evidence:unknown[]=[];
    const result=await applyPlacementPreview(manifest,preview,deps,async(variantId,quote,snapshot)=>{
      evidence.push({variantId,quote,snapshot});
      const plan=preview.variants.find(v=>v.variantId===variantId)!;
      await tx.spellmarkVariant.update({where:{id:variantId},data:{printfulSyncVariantId:storedSyncId(plan.syncVariantId),productionBaseCents:quote.productionBaseCents,productionQuotedAt:new Date(quote.quotedAt),productionQuoteJson:JSON.stringify(quote)}});
    });
    const listing=manifest.listings.find(l=>l.fulfillment==="PHYSICAL")!;
    await tx.spellmarkListing.update({where:{id:listing.id},data:{printfulSyncProductId:storedSyncId(preview.syncProductId),status:result.state==="PLACEMENT_FILES_VERIFIED"?"SYNCED":"PRINTFUL_MAPPING_FAILED",...(result.state==="PLACEMENT_FILES_VERIFIED"?{lastDraftSyncAt:new Date()}: {})}});
    await tx.spellmarkJournal.create({data:{productId:input.productId,requestId,kind:"PRINTFUL_PLACEMENT_RESULT",bodyJson:JSON.stringify({...result,previewId:saved.id,evidence})}});
    return {...result,previewId:saved.id};
  },{timeout:120000,maxWait:10000});
}
