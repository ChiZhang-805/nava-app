import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const initial={settings:{},records:[]};
const ctx=vm.createContext({__fluffyModules:{},window:{NavaJournal:{initial}},structuredClone,Date});
for(const file of ['model','sleep-time','catalog','journal-store','review-data','review-insights','focus-timer'])vm.runInContext(readFileSync(`public/journal/js/${file}.js`,'utf8'),ctx);
const M=ctx.__fluffyModules,C=M['catalog.js'],D=M['review-data.js'],I=M['review-insights.js'];
const date='2026-11-20';
const record=(category,data,extra={})=>({id:`${category}-${Math.random()}`,category,createdAt:`${date}T12:00:00+08:00`,recordDate:date,data,...extra});
const view=(category,records)=>I.build(D.build(category,date,records));
const fields={mood:{mood:'平静'},food:{foods:'米饭'},sport:{activity:'散步',durationMinutes:20},sleep:{bedtime:'23:00',wakeTime:'07:00'},face:{feeling:'有点困'},focus:{task:'读书',durationMinutes:25}};
test('six modules: four pages for empty, single and multi-day records; empty never equals zero',()=>{
 for(const [category,data] of Object.entries(fields)) {
  assert.ok(C.validate(category,data,true,{recordDate:date}).ok,category+' minimum');
  const empty=view(category,[]);assert.equal(empty.pages.length,4);assert.ok(empty.pages[1].series.every(d=>d.value===null),category);
  const one=view(category,[record(category,data)]);assert.equal(one.records,1);assert.equal(one.pages[3].records.length,1);
  const many=view(category,Array.from({length:5},(_,i)=>record(category,data,{recordDate:`2026-11-${20-i}`})));
  assert.equal(many.days,5);assert.equal(many.pages[1].series.length,7);assert.equal(many.pages[3].records.length,3);
 }
});
test('food only sums supplied nutrients, preserves real zero; face coverage is never a health score',()=>{
 const food=[record('food',{foods:'水',calories:0,protein:0}),record('food',{foods:'米饭',calories:null})];
 const day=D.build('food',date,food).today;assert.equal(day.value,0);assert.equal(day.macros.protein,0);assert.equal(day.macros.fat,null);assert.equal(day.score,null);assert.ok(day.coverage>0);
 const face=D.build('face',date,[record('face',{feeling:'困',eyeArea:'黑眼圈',skinAppearance:'泛红'})]).today;
 assert.equal(face.coverage,100);assert.equal(face.score,null);assert.equal(face.scoreKind,'');
 for(const x of [null,undefined,'', ' ',true,false])assert.equal(D.number(x),null);
});
test('focus plans are not elapsed time; missing target state and edited self reports are not counted as completed',()=>{
 const legacy=record('focus',fields.focus),measured=record('focus',fields.focus,{focus:{elapsedMs:600000}}),edited=record('focus',fields.focus,{focus:{elapsedMs:600000,plannedMs:1500000,reachedTarget:true,provenance:'self-reported'}});
 assert.equal(D.build('focus',date,[legacy]).today.value,null);
 assert.equal(C.rows(legacy)[1].label,'Planned time');assert.equal(C.rows(edited)[1].value,'10 min');
 assert.match(C.summary(legacy).value,/计划/);
 for(const r of [legacy,measured,edited])assert.ok(!view('focus',[r]).pages[0].facts.some(f=>f.label==='达到原定时长'));
 assert.equal(view('focus',[measured]).pages[2].bars.length,0);
 const timer=record('focus',fields.focus,{focus:{elapsedMs:1500000,plannedMs:1500000,startedAt:'2026-11-20T08:00:00+08:00'}});
 assert.equal(view('focus',[timer]).pages[0].facts.find(f=>f.label==='达到原定时长').value,'1 / 1');assert.equal(view('focus',[timer]).pages[2].bars.length,1);
 assert.equal(view('focus',[record('focus',fields.focus,{focus:{elapsedMs:1000,startedAt:'08:00'}})]).pages[2].bars.length,0);
});
test('mood intensity is explicit self report only; tags are explicit and no polarity score',()=>{
 assert.equal(view('mood',[record('mood',{mood:'十分开心'})]).pages[1].series.at(-1).value,null);
 assert.equal(view('mood',[record('mood',{mood:'有些难过',intensity:7,reasonTags:'工作、社交'})]).pages[1].series.at(-1).value,7);
 assert.equal(view('mood',[record('mood',{mood:'开心',intensity:11})]).pages[1].series.at(-1).value,null);
 assert.equal(C.validate('mood',{mood:'开心',reasonTags:'工作、未知'},true).ok,false);
});
test('sleep circular clock spread handles midnight; overlapping intervals counted once and legacy ISO dates remain valid',()=>{
 assert.equal(I.clockSpread([1430,10,0]),20);assert.equal(I.clockSpread([1430,10]),null);
 const old=record('sleep',{bedtime:'2026-11-19T23:00',wakeTime:'2026-11-20T07:00',quality:'还好'});
 assert.equal(D.build('sleep',date,[old]).today.value,8);
 assert.equal(D.build('sleep',date,[old,record('sleep',{bedtime:'00:00',wakeTime:'06:00'})]).today.value,8);
 initial.records=[old,record('sport',{activity:'跑步',durationMinutes:20,distanceKm:3,notes:'慢慢来'}),record('food',{meal:'早餐',foods:'粥'}),record('focus',fields.focus)];
 const restored=M['journal-store.js'].records();assert.equal(restored.length,4);assert.ok(restored.find(r=>r.category==='sport').data.notes.includes('3 公里'));
});
test('timer start survives pause/resume/restore; reset starts new period; legacy snapshots do not invent start',()=>{
 let now=1000;const Timer=M['focus-timer.js'].FocusTimer,a=new Timer(()=>now);a.start(25);now=2000;a.pause();now=3000;a.resume();
 assert.equal(a.startedAt,1000);const b=new Timer(()=>now);assert.ok(b.restore(a.snapshot()));assert.equal(b.startedAt,1000);
 const old={...a.snapshot()};delete old.startedAt;assert.ok(b.restore(old));assert.equal(b.startedAt,null);
 now=4000;a.reset();assert.equal(a.startedAt,4000);
});
