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

export type ProviderPngOptions = {
  width?: number; height?: number; radius?: number; centerX?: number; centerY?: number; aspect?: number;
  color?: 2 | 3 | 4 | 6; depth?: 1 | 2 | 4 | 8 | 16; alpha?: 'opaque' | 'empty' | 'ghost';
  filters?: boolean; interlace?: boolean; extraInflatedByte?: boolean; borderPixel?: boolean;
  missingTransparency?: boolean; invalidPaletteIndex?: boolean; softEdge?: boolean;
};
/** Deliberately non-normalized vendor samples, including packed indexed transparency. */
export async function providerFoodPng(options: ProviderPngOptions = {}) {
  const width=options.width??768,height=options.height??640,depth=options.depth??8,color=options.color??6;
  const channels=color===6?4:color===4?2:color===2?3:1;
  const stride=Math.max(1,Math.ceil(channels*depth/8)),rowBytes=Math.ceil(width*channels*depth/8);
  const raw=new Uint8Array((rowBytes+1)*height+(options.extraInflatedByte?1:0));
  let previous=new Uint8Array(rowBytes);
  for(let y=0;y<height;y++){
    const row=new Uint8Array(rowBytes),filter=options.filters?y%5:0;
    for(let x=0;x<width;x++){
      const distance=Math.hypot(x-(options.centerX??420), (y-(options.centerY??290))/(options.aspect??1));
      const inside=distance<=(options.radius??180) || (options.borderPixel&&x===0&&y===0);
      const alpha=options.alpha==='opaque'?255:options.alpha==='empty'?0:inside?(options.alpha==='ghost'?128:options.softEdge&&distance>(options.radius??180)-2?128:255):0;
      if(color===3){
        const index=options.invalidPaletteIndex&&x===0&&y===0?3:alpha?1:0;
        row[Math.floor(x*depth/8)]|=index<<(8-depth-x*depth%8);
      }else{
        for(let channel=0;channel<channels;channel++){
          const value=color!==2&&channel===channels-1?alpha:alpha?[40,100,220][channel%3]:[250,0,0][channel%3];
          const i=x*channels*depth/8+channel*depth/8;row[i]=value;if(depth===16)row[i+1]=value;
        }
      }
    }
    const start=y*(rowBytes+1);raw[start]=filter;
    for(let x=0;x<rowBytes;x++){
      const a=x>=stride?row[x-stride]:0,b=previous[x],c=x>=stride?previous[x-stride]:0;
      const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
      const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):da<=db&&da<=dc?a:db<=dc?b:c;
      raw[start+1+x]=(row[x]-prediction)&255;
    }
    previous=row;
  }
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=depth;header[9]=color;header[12]=options.interlace?1:0;
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    ...(color===3?[chunk('PLTE',new Uint8Array([250,0,0,40,100,220])),...(options.missingTransparency?[]:[chunk('tRNS',new Uint8Array([0,options.alpha==='ghost'?128:255]))])]:[]),
    chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
