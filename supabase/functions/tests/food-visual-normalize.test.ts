import { normalizeFoodVisualPngV2 } from '../_shared/food-visual-normalize.ts';
import { FoodPngError, foodPngCrc32, validateFoodVisualPngV2, type FoodPngReason } from '../_shared/food-visual-png.ts';
import { providerFoodPng, type ProviderPngOptions } from './fixtures/food-png.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(bytes: Uint8Array, code: FoodPngReason) {
  try { await normalizeFoodVisualPngV2(bytes); } catch (cause) {
    assert(cause instanceof FoodPngError && cause.code === code, `expected ${code}, received ${String(cause)}`);
    assert(Object.values(cause.diagnostics).every(value=>typeof value==='number'&&Number.isFinite(value)), 'diagnostics must contain only finite numbers');
    assert(!JSON.stringify(cause).includes('https:'), 'diagnostics must not contain provider URLs');
    return cause;
  }
  throw new Error(`expected ${code}`);
}

Deno.test('provider transparent canvas is centered to 1024 with preserved dish aspect, then independently validated', async()=>{
  const source=await providerFoodPng({aspect:.98,filters:true});
  const result=await normalizeFoodVisualPngV2(source);
  const image=await validateFoodVisualPngV2(result.bytes);
  assert(image.width===1024&&image.height===1024,'wrong output canvas');
  assert(image.foregroundWidthRatio>.87&&image.foregroundWidthRatio<.89,'dish target coverage');
  assert(Math.abs(image.foregroundHeightRatio/image.foregroundWidthRatio-.98)<.005,'normalization stretched the dish');
  assert(Math.abs((image.foregroundBounds.minX+image.foregroundBounds.maxX)/2-.5)<.001,'not centered horizontally');
  assert(Math.abs((image.foregroundBounds.minY+image.foregroundBounds.maxY)/2-.5)<.001,'not centered vertically');
  assert(result.diagnostics.width===768&&result.diagnostics.height===640,'source dimensions not retained for diagnosis');
  assert(result.diagnostics.minX!==image.foregroundBounds.minX,'test must actually translate/scale');
});

Deno.test('provider already-square but off-center complete dish is normalized without matting or distortion',async()=>{
  const source=await providerFoodPng({width:1024,height:1024,centerX:550,centerY:510,radius:450});
  let priorFailed=false;try{await validateFoodVisualPngV2(source);}catch{priorFailed=true;}
  assert(priorFailed,'regression fixture must fail the old geometry gate');
  const {bytes}=await normalizeFoodVisualPngV2(source);
  assert((await validateFoodVisualPngV2(bytes)).opaqueForegroundRatio>.99,'normalized foreground lost opacity');
});

Deno.test('bounded four-Mi-pixel 16-bit provider image can scale down to the same strict contract',async()=>{
  const input=await providerFoodPng({width:2048,height:2048,centerX:1100,centerY:1024,radius:800,depth:16});
  const {bytes,diagnostics}=await normalizeFoodVisualPngV2(input);
  assert(diagnostics.width===2048&&diagnostics.height===2048&&diagnostics.bitDepth===16,'source format diagnostic lost');
  assert((await validateFoodVisualPngV2(bytes)).opaqueForegroundRatio>.99,'downsample damaged the foreground');
});

Deno.test('provider indexed alpha at 1/2/4/8 bit and RGBA/gray-alpha 8/16 bit decode all five filters',async()=>{
  const formats:ProviderPngOptions[]=[...[1,2,4,8].map(depth=>({color:3,depth} as ProviderPngOptions)),{color:6,depth:16},{color:4,depth:8},{color:4,depth:16}];
  for(const format of formats){
    const result=await normalizeFoodVisualPngV2(await providerFoodPng({...format,filters:true}));
    assert((await validateFoodVisualPngV2(result.bytes)).opaqueForegroundRatio>.97,`format ${format.color}/${format.depth} not opaque`);
  }
});

Deno.test('normalization keeps color at soft edges instead of mixing RGB from transparent background',async()=>{
  const {bytes}=await normalizeFoodVisualPngV2(await providerFoodPng({softEdge:true}));
  const idat:Uint8Array[]=[];for(let offset=8;offset<bytes.length;){
    const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);
    if(String.fromCharCode(...bytes.subarray(offset+4,offset+8))==='IDAT')idat.push(bytes.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const raw=new Uint8Array(await new Response(new Blob(idat.map(part=>Uint8Array.from(part))).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  let edgeCount=0;
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
    const i=y*4097+1+x*4;
    if(raw[i+3]>0&&raw[i+3]<255){
      edgeCount++;assert(raw[i]===40&&raw[i+1]===100&&raw[i+2]===220,'transparent background bled into dish color');
    }
  }
  assert(edgeCount>100,'fixture should exercise antialiased pixels');
});

Deno.test('normalization rejects opaque, empty, translucent, clipped and elliptical subjects; never invents alpha or repairs geometry',async()=>{
  await rejects(await providerFoodPng({alpha:'opaque'}),'png_no_transparency');
  await rejects(await providerFoodPng({alpha:'empty'}),'png_no_foreground');
  await rejects(await providerFoodPng({alpha:'ghost'}),'png_subject_opacity');
  await rejects(await providerFoodPng({borderPixel:true}),'png_subject_clipped');
  await rejects(await providerFoodPng({centerX:50}),'png_subject_clipped');
  await rejects(await providerFoodPng({aspect:.9}),'png_subject_geometry');
  await rejects(await providerFoodPng({color:2}),'png_pixel_format');
  await rejects(await providerFoodPng({color:3,missingTransparency:true}),'png_pixel_format');
});

Deno.test('normalization enforces encoded/decoded bounds and rejects malformed or unsupported PNGs with fixed reasons',async()=>{
  const valid=await providerFoodPng();
  const badSignature=valid.slice();badSignature[0]=0xff;await rejects(badSignature,'png_signature');
  const badCrc=valid.slice();badCrc[45]^=1;await rejects(badCrc,'png_crc');
  await rejects(valid.slice(0,valid.length-3),'png_malformed');
  await rejects(new Uint8Array(8*1024*1024+1),'png_file_size');
  await rejects(await providerFoodPng({extraInflatedByte:true}),'png_compression');
  await rejects(await providerFoodPng({interlace:true}),'png_interlace');
  await rejects(await providerFoodPng({color:3,depth:4,invalidPaletteIndex:true}),'png_malformed');
  for(const [width,height] of [[4097,640],[4096,4096]]){
    const huge=valid.slice(),view=new DataView(huge.buffer);view.setUint32(16,width);view.setUint32(20,height);view.setUint32(29,foodPngCrc32(huge.subarray(12,29)));
    await rejects(huge,'png_canvas_size');
  }
});
