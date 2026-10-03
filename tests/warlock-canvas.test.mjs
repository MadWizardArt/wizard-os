import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderPrintfulCanvas} from '../lib/warlock-commerce/printful-canvas.ts';
test('approved offsets are baked into a transparent 300 DPI canvas with reproducible checksums',async()=>{
 const source=await sharp({create:{width:10,height:10,channels:4,background:'red'}}).png().toBuffer();
 const position={area_width:100,area_height:100,width:20,height:20,top:30,left:40,limit_to_print_area:true};
 const a=await renderPrintfulCanvas(source,position),b=await renderPrintfulCanvas(source,position);
 assert.equal(a.md5,b.md5);assert.equal(a.sha256,b.sha256);
 const meta=await sharp(a.bytes).metadata();assert.equal(meta.width,100);assert.equal(meta.height,100);assert.equal(meta.density,300);
 const {data}=await sharp(a.bytes).raw().toBuffer({resolveWithObject:true});
 assert.equal(data[(30*100+40)*4+3],255);assert.equal(data[(29*100+40)*4+3],0);assert.equal(data[(30*100+39)*4+3],0);assert.equal(data[(50*100+40)*4+3],0);
 assert.ok(!source.equals(a.bytes));
 await assert.rejects(renderPrintfulCanvas(source,{...position,left:99}));
});

test('pixel budget and out-of-bounds placement have separate diagnostics',async()=>{
 const bytes=await sharp({create:{width:1,height:1,channels:4,background:'red'}}).png().toBuffer();
 const p={area_width:3600,area_height:4800,width:3600,height:4800,top:0,left:0,limit_to_print_area:true};
 await assert.rejects(renderPrintfulCanvas(bytes,{...p,area_width:10000,area_height:10000}),/printful_placement_canvas_pixel_limit/);
 for(const patch of [{left:1},{top:1},{left:-1},{top:-1}])await assert.rejects(renderPrintfulCanvas(bytes,{...p,...patch}),/printful_placement_out_of_bounds/);
});

test('full-size 3600x4800 back canvas fits with lossless compression and identical decoded pixels',async()=>{
 const width=3600,height=4800,raw=Buffer.alloc(width*height*4);let seed=12345;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
 for(let y=0;y<height;y++){
  let r=next(),g=next(),b=next();
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4;r=(r+(next()&3))&255;g=(g+(next()&3))&255;b=(b+(next()&3))&255;
   raw[i]=r;raw[i+1]=g;raw[i+2]=b;raw[i+3]=x%200===0?128:255;
  }
 }
 const source=await sharp(raw,{raw:{width,height,channels:4}}).png({compressionLevel:9,adaptiveFiltering:true,palette:false}).toBuffer();
 assert.ok(source.length<20*1024*1024,'source remains within intake limit');
 const image=await sharp(source,{limitInputPixels:40000000}).rotate().resize(width,height,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().toColourspace('srgb').png().toBuffer();
 const baseline=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:image,top:0,left:0}]).withMetadata({density:300}).png().toBuffer();
 assert.ok(baseline.length>20*1024*1024,'old encoding reproduces the byte limit failure');
 const result=await renderPrintfulCanvas(source,{area_width:width,area_height:height,width,height,top:0,left:0,limit_to_print_area:true});
 assert.ok(result.bytes.length<=20*1024*1024);
 const before=await sharp(baseline).raw().toBuffer(),after=await sharp(result.bytes).raw().toBuffer();
 assert.ok(before.equals(after),'all decoded channels including alpha remain identical');
 const meta=await sharp(result.bytes).metadata();
 assert.equal(meta.width,width);assert.equal(meta.height,height);assert.equal(meta.density,300);assert.equal(meta.hasAlpha,true);assert.equal(meta.isPalette,false);
 console.log('Canvas regression bytes:',{source:source.length,before:baseline.length,after:result.bytes.length});
});
