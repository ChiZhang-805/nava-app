import { foodVisualStyleVersionV2 } from '../_shared/food-visual-v2.ts';
import { syntheticFoodPng } from './fixtures/food-png.ts';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
type FinishBody={p_asset_path:string|null;p_error_code:string|null;p_source_revision:string;p_quality:{evidenceKind?:'text'|'photo'}};
type ReadyFinish=FinishBody&{p_asset_path:string};
type ChatBody={messages:Array<{content:Array<{type:'text';text:string}|{type:'image_url';image_url:{url:string}}>}>};

Deno.test('saved food render worker never marks failed/opaque/unreviewed media ready (all HTTP mocked)',async t=>{
  const previous={fetch:globalThis.fetch,env:Deno.env.get,serve:Deno.serve,edge:Object.getOwnPropertyDescriptor(globalThis,'EdgeRuntime')};
  let handler:(request:Request)=>Promise<Response>;
  const tasks:Promise<unknown>[]=[];
  const canonical='https://wxteapvwagvhhtrjrbim.supabase.co',owner='10000000-0000-4000-8000-000000000001',jobId='20000000-0000-4000-8000-000000000001',token='a'.repeat(64);
  const requests:Array<{url:string;method:string;body:Record<string,unknown>}>=[];
  let consent=true,claim=true,finishAccepted=true,lostFinishAcknowledgment=false,photoPath:string|null=null,style=foodVisualStyleVersionV2;
  const png=await syntheticFoodPng(),opaque=await syntheticFoodPng(true);let download=png;
  const validQa={dishIdentityScore:.98,visibleIngredientRecall:.96,unexpectedIngredientScore:.01,artifactScore:.02,plateCompositionPass:true,hasTextOrWatermark:false,hasHandsOrUtensils:false,feedback:''};
  let qa:unknown=validQa;
  Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:(fn:typeof handler)=>{handler=fn;}});
  Object.defineProperty(globalThis,'EdgeRuntime',{configurable:true,writable:true,value:{waitUntil:(task:Promise<unknown>)=>tasks.push(task)}});
  Deno.env.get=name=>({SUPABASE_URL:canonical,SUPABASE_SERVICE_ROLE_KEY:'fixture-service-only',DASHSCOPE_API_KEY:'fixture-authorized-canonical'} as Record<string,string>)[name];
  globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=input instanceof Request?input.url:String(input),method=init?.method??'GET';
    let body:Record<string,unknown>={};if(typeof init?.body==='string'){try{body=JSON.parse(init.body) as Record<string,unknown>;}catch{body={raw:true};}}
    requests.push({url,method,body});
    if(url.endsWith('/rpc/claim_food_render_job')){
      assert(body.p_job_id===jobId&&body.p_worker_token===token,'claim capability differs');
      return json(claim?[{id:jobId,user_id:owner,source_revision:'saved-v1',claimed_revision:'saved-v1',prompt_version:style,worker_token:token,attempts:1,input:{name:'燕麦酸奶',amount:null,kind:'journal',photoPath,photoBucket:photoPath?'diet-photos':null}}]:[]);
    }
    if(url.endsWith('/rpc/finish_food_render_job'))return lostFinishAcknowledgment?json({message:'Synthetic lost finish acknowledgment'},503):json(finishAccepted||body.p_asset_path===null);
    if(url.startsWith(canonical+'/rest/v1/profiles?')){
      assert(url.includes('id=eq.'+owner),'consent query escaped owner');
      return json({health_data_consent:consent,ai_personalization_consent:consent});
    }
    if(url.startsWith(canonical+'/storage/v1/object/sign/')){
      const p=url.slice((canonical+'/storage/v1').length);return json({signedURL:p+'?token=fixture-signed'});
    }
    if(url.startsWith(canonical+'/storage/v1/object/diet-renders/')){
      assert(method==='POST','only expected candidate upload');return json({Key:'fixture-upload'});
    }
    if(url===canonical+'/storage/v1/object/diet-renders'&&method==='DELETE')return json([]);
    if(url.includes('/compatible-mode/v1/chat/completions')){
      const firstPart=(body as ChatBody).messages[0].content[0];
      assert(firstPart.type==='text','expected text prompt before image evidence');
      const prompt=firstPart.text;
      const output=prompt.startsWith('You prepare evidence')?{shouldGenerate:true,confidence:.96,dishName:'燕麦酸奶',ingredients:['燕麦','酸奶'],description:'燕麦和酸奶',container:'bowl'}:qa;
      return json({choices:[{message:{content:JSON.stringify(output)}}]});
    }
    if(url.includes('/multimodal-generation/generation'))return json({output:{choices:[{message:{content:[{image:'https://fixture-render.invalid/candidate.png'}]}}]}});
    if(url==='https://fixture-render.invalid/candidate.png')return new Response(Uint8Array.from(download),{headers:{'Content-Type':'image/png'}});
    throw new Error('Unexpected network access: '+url);
  }) as typeof fetch;
  try{
    await import('../food-visualize/index.ts');
    const reset=()=>{requests.length=0;consent=true;claim=true;finishAccepted=true;lostFinishAcknowledgment=false;photoPath=null;style=foodVisualStyleVersionV2;download=png;qa=validQa;};
    const run=async()=>{
      const response=await handler(new Request('https://fixture-function.invalid/food-visualize',{method:'POST',body:JSON.stringify({jobId,workerToken:token})}));
      await Promise.all(tasks.splice(0));return response;
    };
    const finishes=()=>requests.filter(r=>r.url.endsWith('/rpc/finish_food_render_job')).map(r=>r.body as FinishBody);
    const uploads=()=>requests.filter(r=>r.method==='POST'&&r.url.startsWith(canonical+'/storage/v1/object/diet-renders/'));
    const removes=()=>requests.filter(r=>r.method==='DELETE'&&r.url===canonical+'/storage/v1/object/diet-renders');
    const ready=()=>finishes().filter((r):r is ReadyFinish=>typeof r.p_asset_path==='string'&&r.p_error_code===null);
    await t.step('missing/oversize job capabilities and non-POST never reach database or provider',async()=>{
      reset();
      for(const body of [{},{jobId,workerToken:'bad'},{jobId,workerToken:token,padding:'x'.repeat(2100)}]){
        const result=await handler(new Request('https://fixture-function.invalid',{method:'POST',body:JSON.stringify(body)}));assert(result.status===400,'invalid job accepted');
      }
      assert((await handler(new Request('https://fixture-function.invalid'))).status===405,'GET accepted');
      assert(requests.length===0&&tasks.length===0,'unclaimed request made network call');
    });
    await t.step('unclaimed/duplicate capability returns uniform response without generating',async()=>{
      reset();claim=false;const response=await run();assert(response.status===202,'claim status');
      assert((await response.json()).accepted===false,'empty claim accepted');
      assert(requests.length===1&&finishes().length===0,'empty claim spent credits');
    });
    await t.step('confirmed saved text can finish ready only after PNG and semantic QA',async()=>{
      reset();assert((await run()).status===202,'worker response');
      assert(uploads().length===1&&ready().length===1&&removes().length===0,'valid job did not attach exactly one asset');
      assert(ready()[0].p_asset_path.startsWith(owner+'/'+jobId+'/'),'asset not owner/job bound');
      assert(ready()[0].p_source_revision==='saved-v1'&&ready()[0].p_quality.evidenceKind==='text','revision/evidence metadata lost');
    });
    await t.step('photo generation signs only the owner source and retains photo evidence metadata',async()=>{
      reset();photoPath=owner+'/confirmed-meal.jpg';await run();
      assert(requests.some(r=>r.url.includes('/sign/diet-photos/'+photoPath)),'owner source was not signed');
      assert(ready().length===1&&ready()[0].p_quality.evidenceKind==='photo','photo evidence lost');
      reset();photoPath='another-owner/meal.jpg';await run();
      assert(ready().length===0&&uploads().length===0,'foreign photo generated/attached');
      assert(!requests.some(r=>r.url.includes('/sign/diet-photos/')),'foreign photo was signed');
    });
    await t.step('revoked consent and mismatched prompt version never call providers',async()=>{
      for(const mode of ['consent','style']){
        reset();if(mode==='consent')consent=false;else style='old-style';await run();
        assert(ready().length===0&&uploads().length===0,'blocked job uploaded');
        assert(!requests.some(r=>r.url.includes('dashscope')),'blocked job spent provider credits');
      }
    });
    await t.step('opaque output fails before upload and cannot finish ready',async()=>{
      reset();download=opaque;await run();
      assert(uploads().length===0&&ready().length===0,'opaque candidate stored/ready');
      assert(finishes().length===1&&finishes()[0].p_error_code==='transparent_output_unavailable','opaque failure not recorded');
    });
    await t.step('missing QA and rejected semantic scores remove candidate and never finish ready',async()=>{
      for(const result of [{...validQa,artifactScore:undefined},{...validQa,plateCompositionPass:false}]){
        reset();qa=result;await run();
        assert(uploads().length===1&&removes().length===1&&ready().length===0,'unreviewed candidate exposed');
        assert(finishes().length===1&&finishes()[0].p_asset_path===null,'failed QA retained path');
      }
    });
    await t.step('source changed during generation rejects attachment and removes candidate',async()=>{
      reset();finishAccepted=false;await run();
      assert(uploads().length===1&&removes().length===1,'stale candidate not cleaned');
      assert(finishes().length===2&&finishes()[1].p_asset_path===null&&finishes()[1].p_error_code==='source_changed','stale cleanup not recorded');
    });
    await t.step('lost finish acknowledgment does not delete an asset that may already be committed',async()=>{
      reset();lostFinishAcknowledgment=true;await run();
      assert(uploads().length===1&&removes().length===0,'uncertain finish deleted potentially accepted asset');
      assert(finishes().length===1&&typeof finishes()[0].p_asset_path==='string','uncertain finish was overwritten by a failure/null attachment');
    });
  }finally{
    await Promise.allSettled(tasks.splice(0));globalThis.fetch=previous.fetch;Deno.env.get=previous.env;
    Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:previous.serve});
    if(previous.edge)Object.defineProperty(globalThis,'EdgeRuntime',previous.edge);else Reflect.deleteProperty(globalThis,'EdgeRuntime');
  }
});
