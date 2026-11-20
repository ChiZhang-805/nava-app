/** Synthetic RGBA PNG; no photograph or production media is used by these tests. */
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = crc & 1 ? (crc >>> 1)^0xedb88320 : crc >>> 1;
  }
  return (crc^0xffffffff)>>>0;
}
function join(parts: Uint8Array[]) {
  const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
  for(const p of parts){output.set(p,offset);offset+=p.length;}return output;
}
function chunk(type:string,data:Uint8Array){
  const output=new Uint8Array(data.length+12),view=new DataView(output.buffer);
  view.setUint32(0,data.length);output.set(new TextEncoder().encode(type),4);output.set(data,8);
  view.setUint32(output.length-4,crc32(output.subarray(4,output.length-4)));return output;
}
export async function syntheticFoodPng(opaque=false){
  const header=new Uint8Array(13),view=new DataView(header.buffer);
  view.setUint32(0,1024);view.setUint32(4,1024);header[8]=8;header[9]=6;
  const raw=new Uint8Array((1024*4+1)*1024);
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
    const i=y*4097+1+x*4;raw[i]=240;raw[i+1]=230;raw[i+2]=210;
    raw[i+3]=opaque||(x-511.5)**2+(y-511.5)**2<=450**2?255:0;
  }
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
export function base64(bytes:Uint8Array){
  let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);
}
