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
