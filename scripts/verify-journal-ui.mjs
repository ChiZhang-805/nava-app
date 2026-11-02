import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='Q:/NAVA-Workspace/Build/TestRuns/journal-integration/ui';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const categories=process.env.NAVA_JOURNAL_CATEGORY?[process.env.NAVA_JOURNAL_CATEGORY]:['mood','food','sport','sleep','face','focus'];
const inputs={mood:{mood:'放松',reason:'完成今天的工作',notes:'明天继续'},food:{foods:'鸡肉米饭',portion:'一碗',calories:'520',protein:'30',carbs:'65',fat:'15'},sport:{activity:'散步',durationMinutes:'30',notes:'公园里走了一圈'},sleep:{bedtime:'23:00',wakeTime:'07:00',quality:'精神不错'},face:{feeling:'精神还好',eyeArea:'没有明显阴影',skinAppearance:'自然光下肤色均匀'},focus:{task:'阅读',durationMinutes:'0.1',notes:'读完一页'}};
const results=[];
async function checkBackground(frame,page,scene,width,height){
 const host=await page.locator('.journal-experience iframe').boundingBox();
 if(Math.abs(host.x)>1||Math.abs(host.y)>1||Math.abs(host.width-width)>1||Math.abs(host.height-height)>1)throw Error('Journal does not fill the NAVA screen');
 const valid=await frame.evaluate(({scene,width,height})=>{
  const bg=document.querySelector(scene==='celebrate'?'#green-bg':'.cream-bg'),r=bg.getBoundingClientRect();
  return r.x===0&&r.y===0&&r.width===width&&r.height===height&&bg.parentElement.className==='stage'&&Number(getComputedStyle(bg).opacity)===1;
 },{scene,width,height});
 if(!valid)throw Error(`Background not full viewport: ${scene} ${width}`);
}
let saveDispatcher;
await page.exposeFunction('saveRecord',record=>saveDispatcher(record));
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]]){
  await page.setViewportSize({width,height});
  for(const category of categories){
   let saves=0;const records=[];
   await page.route('**/__journal-harness',route=>route.fulfill({contentType:'text/html',body:`<link rel='stylesheet' href='/src/styles/global.css'><link rel='stylesheet' href='/src/styles/figma-v2.css'><link rel='stylesheet' href='/src/features/journal-experience.css'><div id='root'><div class='nava-app-stage'><div class='phone-frame phone-frame--journal'><div class='safe-top'></div><main class='app-content app-content--record'><div class='screen-panel'><section class='journal-experience'><iframe src='/journal/index.html'></iframe></section></div></main></div></div></div><script>window.addEventListener('load',()=>{const c=new MessageChannel();c.port1.onmessage=async({data})=>{let result=null;if(data.method==='save'){result=await window.saveRecord(data.payload.record);}if(data.method==='ai'){c.port1.postMessage({id:data.id,error:'Explicit offline UI fixture'});return;}c.port1.postMessage({id:data.id,result});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'${category}',locale:'zh',records:[],settings:{},nativePhotos:false}},location.origin,[c.port2]);});</script>`}));
   saveDispatcher=async record=>{saves++;const value={...record,version:1};records.push(value);return value;};
   await page.goto('http://localhost:5173/__journal-harness');
   const frame=page.frames().find(f=>f.url().includes('/journal/'));
   await frame.waitForSelector('#screen[data-scene="entry"]',{timeout:30000});
   await frame.waitForFunction(()=>document.querySelector('#loading').hidden||getComputedStyle(document.querySelector('#loading')).display==='none');
   for(const [key,value] of Object.entries(inputs[category])){
     const field=frame.locator(`#field-${key}`);
     if(['bedtime','wakeTime'].includes(key)){
       for(const [part,number] of value.split(':').entries()){
         await frame.locator(`.time-part[data-key="${key}"][data-part="${part}"]`).click();
         await frame.locator(`#sleep-time-option-${Number(number)}`).click();
       }
     }else if(await field.count())await field.fill(value);
   }
   if(category==='food')await frame.locator('.choice-pill[data-value="午餐"]').click();
   const before=await frame.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,keys:[...document.querySelectorAll('input[type=password]')].some(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden'),button:(()=>{const r=document.querySelector('#confirm-entry').getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width,height:r.height};})()}));
   if(before.overflow||before.keys||before.button.bottom>height+1)throw Error(`${category} ${width}: invalid layout ${JSON.stringify(before)}`);
   await frame.waitForTimeout(700);
   await checkBackground(frame,page,'entry',width,height);
   await page.screenshot({path:`${out}/${category}-${width}-entry.png`});
   await frame.locator('#confirm-entry').click();
   if(category==='focus'){
     await frame.waitForSelector('#screen[data-scene="focus"]');
     await frame.waitForSelector('#screen[data-scene="celebrate"]',{timeout:20000});
   }else{
     await frame.waitForSelector('#screen[data-scene="record"]');
     await frame.waitForTimeout(700);
     await checkBackground(frame,page,'record',width,height);
     await page.screenshot({path:`${out}/${category}-${width}-writing.png`});
     await frame.waitForFunction(()=>!document.querySelector('#primary').disabled);
     await frame.locator('#primary').click();
     await frame.waitForSelector('#screen[data-scene="celebrate"]');
   }
   await frame.waitForTimeout(700);await checkBackground(frame,page,'celebrate',width,height);
   await page.screenshot({path:`${out}/${category}-${width}-celebrate.png`});
   await frame.waitForFunction(()=>!document.querySelector('#primary').disabled);
   await frame.locator('#primary').click();
   await frame.waitForSelector('#screen[data-scene="review"]');
   await checkBackground(frame,page,'review',width,height);
   await page.screenshot({path:`${out}/${category}-${width}-recap.png`});
   results.push({category,width,height,saves,records:records.length,layout:before});
   if(saves!==1||records.length!==1)throw Error('Expected exactly one confirmed save');
   console.log(`${category} ${width} four-page UI passed`);
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(`${out}/results.json`,JSON.stringify({results,errors,ai:'offline fixture, not provider acceptance'},null,2));
}finally{await browser.close();}
