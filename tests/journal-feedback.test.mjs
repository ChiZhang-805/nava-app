import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({__fluffyModules:{},structuredClone,window:{NavaJournal:{initial:{settings:{},locale:'zh'},call:async()=>({})}}});
for(const f of ['model','sleep-time','catalog','journal-store','review-data','review-conversation','entry-i18n','cat-feedback','bubble-copy'])vm.runInContext(readFileSync(`public/journal/js/${f}.js`,'utf8'),ctx);
const M=ctx.__fluffyModules,F=M['cat-feedback.js'],B=M['bubble-copy.js'],G=M['review-conversation.js'];
test('draft notices never claim a saved record; failures win and text validation is not called a number error',()=>{
 for(const key of ['entry-partial','photo-food-partial','review','ready'])for(const language of ['zh','en'])assert.doesNotMatch(F.say(key,{language}),/记好|记下来|保存|\bsaved\b/i);
 assert.match(B.prepare('ready').text,/草稿/);assert.match(F.say('saved'),/记好啦/);
 assert.equal(F.classify('这条未保存成功'),'save-failed');assert.equal(F.classify('not saved'),'save-failed');
 assert.doesNotMatch(F.say('写得简短一点',{field:'mood',invalid:true}),/数字/);
 assert.match(F.say('数字无效',{field:'intensity',invalid:true}),/数字/);
 assert.match(F.say('时分无效',{field:'mealTime',invalid:true}),/时间/);
});
test('greetings acknowledge actual data without claiming planned focus happened or asking answered questions',()=>{
 const view={id:'focus',date:'2026-11-20',today:{count:1,value:null,data:{task:'读书'}}};assert.match(G.greeting(view,'zh'),/计划/);assert.doesNotMatch(G.greeting(view,'zh'),/专注.*留住/);
 assert.match(G.greeting({...view,id:'sleep',today:{count:1,value:8,data:{quality:'有点困'}}},'zh'),/感受我看到了/);
 assert.doesNotMatch(G.greeting({...view,id:'face'},'zh'),/照片/);
 assert.doesNotMatch(G.greeting({...view,today:{count:0}},'en'),/saved|completed/i);
});
test('task acknowledgments wait for persistence; failure keeps the previous list and queued writes preserve both tasks',async()=>{
 const store=M['journal-store.js'];let resolve;
 ctx.window.NavaJournal.call=()=>new Promise(r=>{resolve=r});
 const a={id:'a',data:{task:'读书',durationMinutes:25},done:false};const pending=store.saveTask(a);await Promise.resolve();assert.equal(store.tasks().length,0);resolve({});assert.equal(await pending,true);assert.equal(store.tasks().length,1);
 ctx.window.NavaJournal.call=async()=>{throw Error('Offline')};assert.equal(await store.saveTask({...a,done:true}),false);assert.equal(store.tasks()[0].done,false);
 ctx.window.NavaJournal.call=async()=>({});await Promise.all([store.saveTask({...a,id:'b'}),store.saveTask({...a,id:'c'})]);assert.equal(store.tasks().length,3);
});
