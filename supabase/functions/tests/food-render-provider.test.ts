import { foodRenderDeadline, generateFoodAsset, navaDashScopeKey, prepareFoodEvidence, reviewFoodAsset } from '../_shared/food-render-provider.ts';
import type { FoodVisualEvidenceV2 } from '../_shared/food-visual-v2.ts';
import { syntheticFoodPng, base64 } from './fixtures/food-png.ts';

function assert(value: unknown, message: string): asserts value { if(!value)throw new Error(message); }
async function rejects(fn:()=>unknown|Promise<unknown>,pattern:RegExp){try{await fn();}catch(e){assert(pattern.test(String(e)),String(e));return;}throw new Error('Expected rejection');}
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
type ChatPart={type:'text';text:string}|{type:'image_url';image_url:{url:string}};
type CapturedRequest={url:string;body:Record<string,unknown>;authorization:string|null};
type GenerationBody={model:string;input:{messages:Array<{content:Array<{text:string}|{image:string}>}>};parameters:{n:number;watermark:boolean;size:string}};
const chatContent=(request:CapturedRequest)=>(request.body as {messages:Array<{content:ChatPart[]}>}).messages[0].content;
const promptText=(request:CapturedRequest)=>{const part=chatContent(request)[0];assert(part.type==='text','expected text prompt');return part.text;};
const generationBody=(request:CapturedRequest)=>request.body as GenerationBody;
const canonical='https://wxteapvwagvhhtrjrbim.supabase.co';
const textEvidence:FoodVisualEvidenceV2={kind:'text',dishName:'燕麦酸奶',ingredients:['燕麦','酸奶'],description:'燕麦和酸奶',container:'bowl'};
const plan={shouldGenerate:true,confidence:.96,dishName:'燕麦酸奶',ingredients:['燕麦','酸奶'],description:'燕麦和酸奶',container:'bowl'};
const qa={dishIdentityScore:.98,visibleIngredientRecall:.98,unexpectedIngredientScore:0,artifactScore:0,plateCompositionPass:true,hasTextOrWatermark:false,hasHandsOrUtensils:false,feedback:''};

Deno.test('food provider isolates keys, saved evidence, strict QA and decoded PNG output without real network', async t=>{
  const original={fetch:globalThis.fetch,env:Deno.env.get};
  let env:Record<string,string|undefined>={SUPABASE_URL:canonical,DASHSCOPE_API_KEY:'fixture-authorized-canonical'};
  const requests:CapturedRequest[]=[];
  const png=await syntheticFoodPng(),opaque=await syntheticFoodPng(true);
  let chatOutput:unknown=plan,download=png,mattingOutput=base64(png);
  Deno.env.get=name=>env[name];
  globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=input instanceof Request?input.url:String(input),body=init?.body?JSON.parse(String(init.body)):{};
    requests.push({url,body,authorization:new Headers(init?.headers).get('Authorization')});
    if(url.includes('/chat/completions'))return json({choices:[{message:{content:JSON.stringify(chatOutput)}}]});
    if(url.includes('/multimodal-generation/'))return json({output:{choices:[{message:{content:[{image:'https://fixture-render.invalid/candidate.png'}]}}]}});
    if(url==='https://fixture-render.invalid/candidate.png')return new Response(Uint8Array.from(download),{headers:{'Content-Type':'image/png'}});
    if(url==='https://fixture-matting.invalid/run')return json({imageBase64:mattingOutput});
    throw new Error('Unexpected network access: '+url);
  }) as typeof fetch;
  try{
    await t.step('legacy key is authorized only inside exact canonical NAVA project',async()=>{
      assert(navaDashScopeKey()==='fixture-authorized-canonical','canonical legacy authorization not honored');
      for(const url of ['https://other.supabase.co','https://wxteapvwagvhhtrjrbim.supabase.co.evil.invalid',undefined]){
        env={SUPABASE_URL:url,DASHSCOPE_API_KEY:'forbidden',DASHSCOPE_API_KEY_MyLaptop:'forbidden',DASHSCOPE_API_KEY_DroneDream:'forbidden'};
        await rejects(()=>navaDashScopeKey(),/provider_not_configured/);
      }
      env={SUPABASE_URL:canonical,DASHSCOPE_API_KEY:'legacy',DASHSCOPE_API_KEY_NAVA:'fixture-explicit-NAVA'};
      assert(navaDashScopeKey()==='fixture-explicit-NAVA','scoped key must take precedence');
      env={SUPABASE_URL:canonical,DASHSCOPE_API_KEY:'fixture-authorized-canonical'};
    });
    await t.step('confirmed text is JSON evidence without an invented source image',async()=>{
      requests.length=0;chatOutput=plan;
      const result=await prepareFoodEvidence({name:'燕麦酸奶',amount:null,kind:'journal',photoPath:null,photoBucket:null},null,foodRenderDeadline());
      assert(result.kind==='text'&&result.dishName==='燕麦酸奶','wrong text evidence');
      const content=chatContent(requests[0]);
      assert(content.length===1&&content[0].type==='text','text request must not attach image');
      assert(content[0].text.includes('"name":"燕麦酸奶"')&&content[0].text.includes('untrusted data'),'saved text must be preserved as data');
      assert(!content[0].text.includes('fixture-user'),'source identity should not leak into prompt');
    });
    await t.step('confirmed photo preserves the evidence URL and rejects uncertain identity',async()=>{
      requests.length=0;chatOutput=plan;
      const result=await prepareFoodEvidence({name:'燕麦酸奶',amount:'1碗',kind:'nutrition',photoPath:'fixture-user/meal.jpg',photoBucket:'diet-photos'},'https://fixture-original.invalid/meal.jpg',foodRenderDeadline());
      assert(result.kind==='photo','photo kind lost');
      const reference=chatContent(requests[0])[1];
      assert(reference.type==='image_url'&&reference.image_url.url==='https://fixture-original.invalid/meal.jpg','wrong original');
      for(const invalid of [{...plan,confidence:.77},{...plan,confidence:'0.99'},{...plan,shouldGenerate:false}]){
        chatOutput=invalid;await rejects(()=>prepareFoodEvidence({name:'午饭',amount:null,kind:'journal',photoPath:null,photoBucket:null},null,foodRenderDeadline()),/needs_details/);
      }
    });
    await t.step('text planner cannot make its invented ingredients self-validating evidence',async()=>{
      requests.length=0;
      chatOutput={...plan,dishName:'草莓燕麦酸奶',ingredients:['燕麦','酸奶','草莓'],description:'一大碗加草莓的燕麦酸奶'};
      const result=await prepareFoodEvidence({name:'燕麦酸奶',amount:null,kind:'journal',photoPath:null,photoBucket:null},null,foodRenderDeadline());
      assert(result.dishName==='燕麦酸奶'&&result.ingredients.length===0,'planner recipe/name leaked into trusted text');
      assert(result.description==='Saved food: 燕麦酸奶\nSaved amount: unspecified','source words/unknown amount were changed');
      chatOutput=qa;requests.length=0;
      await reviewFoodAsset(result,null,'https://fixture-generated.invalid/meal.png',foodRenderDeadline());
      const prompt=promptText(requests[0]);
      assert(prompt.includes('燕麦酸奶')&&!prompt.includes('草莓'),'critic compared against invented recipe rather than saved words');
    });
    await t.step('text and photo critic inputs have one and two images respectively',async()=>{
      chatOutput=qa;requests.length=0;
      assert((await reviewFoodAsset(textEvidence,null,'https://fixture-generated.invalid/meal.png',foodRenderDeadline())).evidenceKind==='text','text QA mode');
      assert(chatContent(requests[0]).filter(p=>p.type==='image_url').length===1,'text QA invented original');
      requests.length=0;
      await reviewFoodAsset({...textEvidence,kind:'photo'},'https://fixture-original.invalid/meal.jpg','https://fixture-generated.invalid/meal.png',foodRenderDeadline());
      const images=chatContent(requests[0]).filter(p=>p.type==='image_url');
      assert(images.length===2&&images[0].image_url.url.includes('fixture-original')&&images[1].image_url.url.includes('fixture-generated'),'critic image order differs from prompt');
    });
    await t.step('every missing/invalid QA field and failed semantic score rejects',async()=>{
      for(const field of Object.keys(qa)){
        const missing:Record<string,unknown>={...qa};delete missing[field];chatOutput=missing;
        await rejects(()=>reviewFoodAsset(textEvidence,null,'https://fixture-generated.invalid/meal.png',foodRenderDeadline()),/Missing quality field/);
      }
      for(const invalid of [{...qa,artifactScore:'0'},{...qa,hasHandsOrUtensils:null},{...qa,artifactScore:.1}]){
        chatOutput=invalid;await rejects(()=>reviewFoodAsset(textEvidence,null,'https://fixture-generated.invalid/meal.png',foodRenderDeadline()),/finite number|boolean|quality_rejected/);
      }
    });
    await t.step('normal generation includes source only for photo and returns validated PNG',async()=>{
      download=png;requests.length=0;
      const generated=await generateFoodAsset(textEvidence,null,1,foodRenderDeadline());
      assert(generated.bytes.length===png.length&&generated.modelVersion==='wan2.7-image','generation result');
      const body=generationBody(requests[0]);
      assert(body.input.messages[0].content.every(p=>!('image' in p)),'text generation supplied image');
      assert(body.parameters.n===1&&body.parameters.watermark===false&&body.parameters.size==='1024*1024','exact square/bounded output contract');
      requests.length=0;
      await generateFoodAsset({...textEvidence,kind:'photo'},'https://fixture-original.invalid/meal.jpg',2,foodRenderDeadline());
      assert(requests[0].body.model==='wan2.7-image-pro','fallback model');
      const reference=generationBody(requests[0]).input.messages[0].content[0];
      assert('image' in reference&&reference.image==='https://fixture-original.invalid/meal.jpg','photo reference lost');
    });
    await t.step('opaque/oversize downloads and invalid matting output cannot be returned as an asset',async()=>{
      download=opaque;await rejects(()=>generateFoodAsset(textEvidence,null,1,foodRenderDeadline()),/transparent_output_unavailable/);
      env.NAVA_FOOD_MATTING_URL='https://fixture-matting.invalid/run';mattingOutput=base64(opaque);
      await rejects(()=>generateFoodAsset(textEvidence,null,1,foodRenderDeadline()),/invalid_transparent_output/);
      mattingOutput=base64(png);
      assert((await generateFoodAsset(textEvidence,null,1,foodRenderDeadline())).bytes.length===png.length,'valid matting should recover');
      download=new Uint8Array(8*1024*1024+1);
      await rejects(()=>generateFoodAsset(textEvidence,null,1,foodRenderDeadline()),/image_too_large/);
      delete env.NAVA_FOOD_MATTING_URL;
    });
    assert(requests.every(r=>!r.url.includes('other.supabase.co')),'unexpected project access');
  }finally{globalThis.fetch=original.fetch;Deno.env.get=original.env;}
});
