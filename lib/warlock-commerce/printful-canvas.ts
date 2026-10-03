import sharp from "sharp";
import { createHash } from "node:crypto";
import type { z } from "zod/v4";
import type { positionSchema } from "./printful-placements.ts";

/** Sync variant files have no writable position field. Preserve positioning in PNG pixels. */
export async function renderPrintfulCanvas(bytes:Buffer, position:z.infer<typeof positionSchema>) {
  const {area_width,area_height,width,height,top,left}=position;
  if(area_width*area_height>40000000 || left+width>area_width || top+height>area_height) throw Error("printful_placement_canvas_too_large");
  const image=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize(width,height,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().toColourspace("srgb").png().toBuffer();
  const png=await sharp({create:{width:area_width,height:area_height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:image,top,left}]).withMetadata({density:300}).png().toBuffer();
  if(png.length>20*1024*1024)throw Error("printful_placement_canvas_too_large");
  return {bytes:png,md5:createHash("md5").update(png).digest("hex"),sha256:createHash("sha256").update(png).digest("hex"),width:area_width,height:area_height,dpi:300};
}
