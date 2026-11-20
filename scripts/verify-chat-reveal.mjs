import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat-reveal';
await mkdir(output,{recursive:true});applyProjectPublicEnv(process.cwd());
const server=await createServer({server:{host:'127.0.0.1',port:5315,strictPort:true},logLevel:'silent'});await server.listen();
const report={passed:false,scope:'Real AIScreen in Chromium/WebKit with a controlled, fully persisted reply fixture; no model-quality or native-iOS claim.',results:[],errors:[]};
const user='00000000-0000-4000-8000-000000000001',archiveId='10000000-0000-4000-8000-000000000010';
// Hold the full reply at the service boundary, then save all parts before returning.
const fixture=`export * from '/src/services/ai.ts?reveal-original';
export async function sendAiMessage(input){
 const key='nava-demo-conversation:'+input.userId;
 const userMessage={id:crypto.randomUUID(),role:'user',content:input.message,created_at:new Date().toISOString()};
 localStorage.setItem(key,JSON.stringify([...JSON.parse(localStorage.getItem(key)||'[]'),userMessage]));input.onUserMessage?.(userMessage);
 return new Promise(resolve=>{window.finishReply=()=>{
  const parts=[{type:'text',text:'听见啦～'},{type:'text',text:'我们慢慢聊。'},{type:'text',text:'今天也有值得留住的小事呀。'},{type:'text',text:'先给自己一点空间。'},{type:'text',text:'不用急着想好所有答案。'},{type:'text',text:'我在这儿呢。'},{type:'sticker',id:'hug'}];
  const assistantMessage={id:crypto.randomUUID(),role:'assistant',content:'[nava-reply:v1]'+JSON.stringify(parts),created_at:new Date().toISOString()};
  localStorage.setItem(key,JSON.stringify([...JSON.parse(localStorage.getItem(key)),assistantMessage]));window.lastReplyId=assistantMessage.id;
  resolve({userMessage,assistantMessage,dataType:null,extractedData:null});
 };});
}`;
async function openApp(page){await page.goto('http://127.0.0.1:5315/?demo=1#tab=ai',{waitUntil:'networkidle'});if(await page.locator('.launch-sequence').isVisible().catch(()=>false))await page.locator('.launch-sequence').click();await expect(page.locator('.chat-composer')).toBeVisible();}
async function send(page,text='继续聊聊吧'){
 await page.evaluate(()=>{window.finishReply=undefined;});
 await page.locator('.chat-input-shell input').fill(text);
 await expect(page.locator('.chat-input-shell input')).toHaveValue(text);
 await page.locator('.chat-send-button').click();await expect.poll(()=>page.evaluate(()=>typeof window.finishReply)).toBe('function');
}
try{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
   page.on('pageerror',error=>report.errors.push(error.message));
   await page.route('**/src/services/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:fixture}));
   await page.addInitScript(({user,archiveId})=>{
    sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem(`nava.onboarding.v3.${user}`,JSON.stringify({completed:true,version:3,answers:{}}));
    if(localStorage.getItem('reveal-fixture-seeded'))return;localStorage.setItem('reveal-fixture-seeded','1');const stamp=new Date().toISOString();
    const day=new Date(),key=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    localStorage.setItem(`nava-growth-activities:${user}:${key}:v1`,JSON.stringify(['checkin','ai','share']));
    localStorage.setItem(`nava-demo-conversation:${user}`,JSON.stringify(Array.from({length:14},(_,i)=>({id:crypto.randomUUID(),role:i%2?'assistant':'user',content:'这是一段已经保存的聊天，我们慢慢聊聊今天的小事。',created_at:stamp}))));
    localStorage.setItem(`nava-ai-history:${user}`,JSON.stringify([{id:archiveId,title:'之前的小记',dayKey:stamp.slice(0,10),createdAt:stamp,messages:[{id:crypto.randomUUID(),role:'user',content:'以前的聊天',created_at:stamp}]}]));
   },{user,archiveId});
   await openApp(page);await send(page);
   await expect(page.locator('.chat-message-new.user')).toHaveCount(1);
   assert.equal(await page.evaluate(user=>JSON.parse(localStorage.getItem(`nava-demo-conversation:${user}`)).length,user),15,'only the user is saved while waiting');
   
   await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);
   const id=await page.evaluate(()=>window.lastReplyId),reply=page.locator(`[data-message-id="${id}"]`);
   await expect(reply).toHaveCount(1);assert.equal(await page.evaluate(user=>JSON.parse(localStorage.getItem(`nava-demo-conversation:${user}`)).at(-1).content.startsWith('[nava-reply:v1]'),user),true,'full reply persisted before reveal');
   assert.equal(await page.locator('.ai-streaming-row').count(),0,'visual presentation cannot pretend model processing');
   await page.waitForTimeout(200);await expect(reply).toHaveCount(1);
   await page.waitForTimeout(500);assert((await reply.count())>1&&(await reply.count())<7);
   await page.waitForTimeout(2500);await expect(reply).toHaveCount(7);await expect(reply.last().locator('.chat-sticker-image')).toHaveCount(1);
   const nearBottom=await page.locator('.chat-list').evaluate(list=>list.scrollHeight-list.scrollTop-list.clientHeight);assert(nearBottom<3,`latest follows: ${nearBottom}`);
   await page.screenshot({path:`${output}/${engine}-six-bubbles-sticker.png`});
   
   // A user reading older messages stays at their position as new parts arrive.
   await send(page,'还有呢');await page.locator('.chat-list').evaluate(list=>{list.scrollTop=0;list.dispatchEvent(new Event('scroll'));});
   await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);const second=await page.evaluate(()=>window.lastReplyId);
   await expect(page.locator(`[data-message-id="${second}"]`)).toHaveCount(1);await page.waitForTimeout(3000);
   assert.equal(await page.locator('.chat-list').evaluate(list=>list.scrollTop),0,'new parts must not pull a reader to bottom');
   // Tap to show all, and sending a new user message never waits for old visuals.
   await send(page,'我还想说');await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);
   const third=await page.evaluate(()=>window.lastReplyId);await expect(page.locator(`[data-message-id="${third}"]`)).toHaveCount(1);
   await page.locator('.chat-reveal-all').click({force:true});await page.waitForTimeout(20);await expect(page.locator(`[data-message-id="${third}"]`)).toHaveCount(7);
   await send(page,'下一个话题');await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);const fourth=await page.evaluate(()=>window.lastReplyId);
   await page.locator('.chat-input-shell input').fill('这句不用等');await page.locator('.chat-send-button').click({force:true});await page.waitForTimeout(20);await expect(page.locator(`[data-message-id="${fourth}"]`)).toHaveCount(7);
   await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);const fifth=await page.evaluate(()=>window.lastReplyId);await expect(page.locator(`[data-message-id="${fifth}"]`)).toHaveCount(1);
   // Change conversations during the display sequence; old timer cannot add rows.
   await page.getByRole('button',{name:'更多操作',exact:true}).click({force:true});await page.getByRole('menuitem',{name:'历史',exact:true}).click({force:true});await page.locator('.ai-history-open').filter({hasText:'之前的小记'}).click({force:true});await page.waitForTimeout(3500);
   await expect(page.locator('.chat-message-row')).toHaveCount(1);await expect(page.locator('.chat-reveal-all')).toHaveCount(0);
   // A reload never replays old persisted messages.
   await page.evaluate(user=>localStorage.removeItem(`nava-ai-active-archive:${user}`),user);await page.reload({waitUntil:'networkidle'});if(await page.locator('.launch-sequence').isVisible().catch(()=>false))await page.locator('.launch-sequence').click();await expect(page.locator(`[data-message-id="${fifth}"]`)).toHaveCount(7);await expect(page.locator('.chat-message-new')).toHaveCount(0);
   // Reduced motion has neither staged waiting nor entry animation.
   await page.emulateMedia({reducedMotion:'reduce'});await send(page,'安静一点');await page.evaluate(()=>window.finishReply());await page.waitForTimeout(20);const reduced=await page.evaluate(()=>window.lastReplyId);await expect(page.locator(`[data-message-id="${reduced}"]`)).toHaveCount(7);await expect(page.locator('.chat-reveal-all')).toHaveCount(0);
   assert.equal(await page.locator(`[data-message-id="${reduced}"] .chat-bubble`).first().evaluate(el=>getComputedStyle(el).animationName),'none');
   report.results.push({engine,fullPersistBeforeReveal:true,fakeClock:false,nearBottom,readerPositionKept:true,tapToComplete:true,newMessageDoesNotWait:true,scopeCancels:true,reloadNoReplay:true,reducedMotionImmediate:true});await context.close();
  }finally{await browser.close();}
 }
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.passed=true;
}catch(error){report.errors.push(error.stack??String(error));}
finally{await server.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
if(!report.passed)throw new Error(report.errors.join('\n'));
console.log(`Reply presentation: ${report.results.length} browser cases passed.`);
