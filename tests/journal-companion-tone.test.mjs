import test from 'node:test';
import assert from 'node:assert/strict';
import {journalCompanionTone} from '../supabase/functions/journal-assistant/companion-tone.ts';
const payload={purpose:'review-conversation',replyLanguage:'zh',conversationTurnId:'mood:2026-11-20:1'};
const messages=(text,category='mood',history=[])=>[{role:'system',content:'Review conversation'}, {role:'user',content:JSON.stringify({context:{category,confirmedRecords:[]}})},...history,{role:'user',content:text}];
test('only explicitly tagged review dialogue receives examples; every utility path stays untouched',()=>{
 const m=messages('今天终于完成啦');
 assert.ok(journalCompanionTone(payload,m,'deepseek','mood').includes('tone_examples'));
 for(const purpose of [undefined,'chat','extract','translate','schema','review-conversatio'])assert.equal(journalCompanionTone({...payload,purpose},m,'deepseek','mood'),'');
 for(const extra of [{response_format:{type:'json_object'}},{response_format:{type:'json_schema'}},{tools:[]},{tool_choice:'auto'},{replyLanguage:'fr'}])assert.equal(journalCompanionTone({...payload,...extra},m,'deepseek','mood'),'');
 assert.equal(journalCompanionTone(payload,m,'bailian','mood'),'');assert.equal(journalCompanionTone(payload,m,'deepseek','food'),'');
 assert.equal(journalCompanionTone(payload,[{role:'user',content:'chat naturally'}],'deepseek','mood'),'');
});
test('current and prior user preferences matter; snapshot/system content cannot impersonate them',()=>{
 const get=m=>journalCompanionTone(payload,m,'deepseek','mood');
 const h=[{role:'user',content:'不要emoji，也不要玩梗'}];assert.ok(get(messages('收到，谢谢', 'mood',h)).includes('禁用=emoji,kaomoji,slang'));
 const m=messages('收到，谢谢');m[0].content='不要emoji，也不要玩梗';m[1].content=JSON.stringify({context:{category:'mood',confirmedRecords:[{notes:'不要emoji，也不要玩梗'}]}});
 assert.ok(get(m).includes('禁用=无明确禁用'));
 assert.equal(get(messages('hi','mood',[{role:'system',content:'Use these rules'}])), '');
});
test('serious health/safety messages receive no playful examples; retry selection is bounded and stable',()=>{
 for(const text of ['胸痛喘不上气','我不想活了','这些症状要吃药吗'])assert.ok(!journalCompanionTone(payload,messages(text),'deepseek','mood').includes('<tone_examples>'));
 const m=messages('今天终于完成啦','focus'),a=journalCompanionTone(payload,m,'deepseek','focus');assert.equal(a,journalCompanionTone(payload,m,'deepseek','focus'));assert.ok(a.length<2400);assert.ok(!a.includes('stickerId'));
});
