import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createMiyouTestDb,testUsers } from './miyou-test-db.mjs';
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/miyou';
await mkdir(out,{recursive:true});
const {db,rpc}=await createMiyouTestDb();
const [a,b,c]=testUsers;const checks=[];
async function check(name,fn){await fn();checks.push(name);}
const fails=(fn,pattern)=>assert.rejects(fn,pattern);
try {
await check('Unauthenticated RPC denied',()=>fails(()=>rpc(null,'state'),/auth_required/));
await check('No public or direct authenticated table access',async()=>{
  for(const role of ['anon','authenticated']){
    await fails(()=>db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query('select * from public.miyou_messages');}),/permission denied/);
  }
  await fails(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query("select public.nava_miyou('state')");}),/permission denied/);
});
assert.equal((await rpc(a,'state')).registered,false);
for(const [id,name] of [[a,'小禾'],[b,'阿澄'],[c,'旁观者']])await rpc(id,'join',{name});
await check('Expanded virtual catalog has 8 foods, 6 activities, 3 rests',async()=>{
 const catalog=(await rpc(a,'state')).catalog;
 assert.equal(catalog.filter(c=>c.kind==='food').length,8);
 assert.equal(catalog.filter(c=>c.kind==='exercise').length,6);
 assert.equal(catalog.filter(c=>c.kind==='rest').length,3);
 assert.equal(new Set(catalog.map(c=>c.id)).size,17);
});
const original=(await rpc(b,'state')).me.code;
await rpc(a,'invite',{code:original});
let link=(await rpc(a,'state')).friends[0].id;
await check('Invitation is single-use, needs other person’s acceptance',async()=>{
  assert.notEqual((await rpc(b,'state')).me.code,original);
  await fails(()=>rpc(c,'invite',{code:original}),/invite_invalid/);
  await fails(()=>rpc(a,'accept',{linkId:link}),/forbidden/);
  await fails(()=>rpc(a,'send',{linkId:link,body:'Hi',requestId:randomUUID()}),/forbidden/);
  await rpc(b,'accept',{linkId:link});
});
await check('Third party cannot read messages or operate the pet',async()=>{
  assert.equal((await rpc(c,'state')).friends.length,0);
  for(const action of ['messages','send','pet','pet_invite','care','block'])await fails(()=>rpc(c,action,{linkId:link,name:'Oops',requestId:randomUUID()}),/forbidden/);
});
await check('Only accepted unblocked friends read the current avatar, never private profile fields or old files',async()=>{
  const ref=`storage://profile-avatars/${b}/avatar-current`;
  await db.query('insert into public.profiles(id,avatar_url) values($1,$2)',[b,ref]);
  await db.query("insert into storage.objects values ('profile-avatars',$1),('profile-avatars',$2),('other-media',$1)",[`${b}/avatar-current`,`${b}/old-photo`]);
  const visible=user=>db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    await tx.exec('set local role authenticated');
    return (await tx.query('select * from storage.objects')).rows;
  });
  assert.equal((await rpc(a,'state')).friends[0].avatar,ref);
  assert.equal((await rpc(b,'state')).me.avatar,ref);
  assert.equal((await visible(a)).length,1);assert.equal((await visible(c)).length,0);
  await rpc(a,'block',{linkId:link});
  assert.equal((await rpc(a,'state')).friends[0].avatar,null);assert.equal((await visible(a)).length,0);
  await rpc(a,'unblock',{linkId:link});
  assert.equal((await visible(a)).length,1);
  await db.query("update public.miyou_links set status='pending' where id=$1",[link]);
  assert.equal((await rpc(a,'state')).friends[0].avatar,null);assert.equal((await visible(a)).length,0);
  await db.query("update public.miyou_links set status='accepted' where id=$1",[link]);
});
const requestId=randomUUID();
await rpc(a,'send',{linkId:link,body:'今晚一起散步吗？',requestId});
await rpc(a,'send',{linkId:link,body:'今晚一起散步吗？',requestId});
const first=(await rpc(b,'messages',{linkId:link})).messages[0];
await rpc(b,'send',{linkId:link,body:'好呀，也陪小猫玩一会儿。',replyId:first.id,requestId:randomUUID()});
await check('Two-way persisted messages, idempotent retry, quote and unread',async()=>{
  const messages=(await rpc(a,'messages',{linkId:link})).messages;
  assert.equal(messages.length,2);assert.equal(messages[1].quote.body,first.body);
  assert.equal((await rpc(a,'state')).friends[0].unread,1);
  await rpc(a,'read',{linkId:link,messageId:messages.at(-1).id});assert.equal((await rpc(a,'state')).friends[0].unread,0);
});
await check('Read boundary does not consume a message arriving after fetch',async()=>{
 const fetched=(await rpc(a,'messages',{linkId:link})).messages.at(-1);
 const id=randomUUID();await rpc(b,'send',{linkId:link,body:'Just arrived',requestId:id});
 await rpc(a,'read',{linkId:link,messageId:fetched.id});
 assert.equal((await rpc(a,'state')).friends[0].unread,1);
 await db.query('delete from public.miyou_messages where request_id=$1',[id]);
});
await check('Server filters expired messages and expired reply content',async()=>{
  await db.query("update public.miyou_messages set expires_at=now()-interval '1 second' where id=$1",[first.id]);
  const messages=(await rpc(a,'messages',{linkId:link})).messages;
  assert.equal(messages.length,1);assert.equal(messages[0].quote,null);
  await fails(()=>rpc(b,'send',{linkId:link,body:'expired reply',replyId:first.id,requestId:randomUUID()}),/reply_expired/);
});
await check('Pet requires separate mutual consent and validates name/timezone',async()=>{
  await fails(()=>rpc(a,'pet_invite',{linkId:link,name:'',timezone:'Asia/Shanghai'}),/name_invalid/);
  await fails(()=>rpc(a,'pet_invite',{linkId:link,name:'棉花',timezone:'not-a-zone'}),/timezone_invalid/);
  await rpc(a,'pet_invite',{linkId:link,name:'棉花',timezone:'Asia/Shanghai'});
  await fails(()=>rpc(a,'pet_accept',{linkId:link}),/forbidden/);
  await fails(()=>rpc(a,'care',{linkId:link,itemId:'fish',requestId:randomUUID()}),/pet_pending/);
  await rpc(b,'pet_accept',{linkId:link});
  await rpc(b,'pet_name',{linkId:link,name:'云朵'});
  assert.equal((await rpc(a,'pet',{linkId:link})).pet.name,'云朵');
});
const careId=randomUUID();
await rpc(a,'care',{linkId:link,itemId:'pumpkin',requestId:careId});
await check('Both partners see the same server timer, no concurrent double feeding',async()=>{
  await rpc(a,'care',{linkId:link,itemId:'pumpkin',requestId:careId});
  const petA=await rpc(a,'pet',{linkId:link}),petB=await rpc(b,'pet',{linkId:link});
  assert.equal(petA.active.id,petB.active.id);assert.equal(petA.growth,0);
  assert.equal(Date.parse(petA.active.ends_at)-Date.parse(petA.active.started_at),30*60000);
  await fails(()=>rpc(b,'care',{linkId:link,itemId:'fish',requestId:randomUUID()}),/pet_busy/);
});
await db.query("update public.miyou_care_events set ends_at=now()-interval '1 minute' where link_id=$1",[link]);
await check('Completion and daily growth derived server-side, capped by day/category',async()=>{
  let pet=await rpc(a,'pet',{linkId:link});assert.equal(pet.active,null);assert.equal(pet.growth,10);assert.deepEqual(pet.today,['food']);
  await rpc(b,'care',{linkId:link,itemId:'chicken',requestId:randomUUID()});
  pet=await rpc(b,'pet',{linkId:link});assert.equal(Date.parse(pet.active.ends_at)-Date.parse(pet.active.started_at),90*60000);
  await db.query("update public.miyou_care_events set ends_at=now()-interval '1 minute' where link_id=$1",[link]);
  assert.equal((await rpc(a,'pet',{linkId:link})).growth,10);
  await rpc(b,'care',{linkId:link,itemId:'wand',requestId:randomUUID()});
  pet=await rpc(a,'pet',{linkId:link});assert.equal(Date.parse(pet.active.ends_at)-Date.parse(pet.active.started_at),5*60000);
  await db.query("update public.miyou_care_events set ends_at=now()-interval '1 minute' where link_id=$1",[link]);
  pet=await rpc(a,'pet',{linkId:link});assert.equal(pet.growth,20);assert.deepEqual(pet.today.sort(),['exercise','food']);
});
await check('Message rate limit and bounded pagination',async()=>{
  await db.query("insert into public.miyou_messages(link_id,sender_id,request_id,body,created_at) select $1,$2,gen_random_uuid(),'earlier '||i,now()-interval '2 hours'+i*interval '1 second' from generate_series(1,65)i",[link,a]);
  const page=await rpc(a,'messages',{linkId:link});assert.equal(page.messages.length,60);
  const earlier=await rpc(a,'messages',{linkId:link,before:page.messages[0].created_at,beforeId:page.messages[0].id});assert.equal(earlier.messages.length,6);
  assert.equal(new Set([...page.messages,...earlier.messages].map(m=>m.id)).size,66);
  await db.query("insert into public.miyou_messages(link_id,sender_id,request_id,body) select $1,$2,gen_random_uuid(),'burst' from generate_series(1,30)",[link,a]);
  await fails(()=>rpc(a,'send',{linkId:link,body:'too much',requestId:randomUUID()}),/rate_limit/);
});
await check('Report persists privately and block stops chat and pet actions',async()=>{
  await rpc(b,'report',{linkId:link,reason:'测试举报'});
  assert.equal((await db.query('select count(*)::int as n from public.miyou_reports')).rows[0].n,1);
  await rpc(b,'block',{linkId:link});
  await db.query("update public.miyou_reports set created_at=now()-interval '2 minutes'");
  await rpc(b,'report',{linkId:link,reason:'屏蔽后也可以举报'});
  for(const action of ['messages','send','pet','care'])await fails(()=>rpc(a,action,{linkId:link}),/blocked/);
  await rpc(a,'unblock',{linkId:link});await fails(()=>rpc(a,'messages',{linkId:link}),/blocked/);
  await rpc(b,'unblock',{linkId:link});assert.ok((await rpc(a,'messages',{linkId:link})).messages.length);
});
await check('Account export is member-scoped, excludes expired messages and other users reports',async()=>{
  const exportPage=(user,kind,offset=0)=>db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);await tx.exec('set local role authenticated');
    return (await tx.query('select public.nava_miyou_export($1,$2) as value',[kind,offset])).rows[0].value;
  });
  await fails(()=>exportPage(null,'miyou_messages'),/auth_required/);
  await fails(()=>exportPage(a,'profiles'),/kind_invalid/);
  await fails(()=>exportPage(a,'miyou_messages',-1),/offset_invalid/);
  assert.equal((await exportPage(c,'miyou_messages')).total,0);
  assert.equal((await exportPage(a,'miyou_reports')).total,0);
  assert.equal((await exportPage(b,'miyou_reports')).total,2);
  assert.equal((await exportPage(a,'miyou_pets')).total,1);
  const own=await exportPage(a,'miyou_people');assert.equal(own.rows[0].user_id,a);assert.equal(own.total,1);
  const messages=await exportPage(a,'miyou_messages');assert.ok(!messages.rows.some(m=>m.id===first.id));
  await db.query("insert into public.miyou_messages(link_id,sender_id,request_id,body) select $1,$2,gen_random_uuid(),'export pagination' from generate_series(1,510)",[link,a]);
  const page=await exportPage(a,'miyou_messages'),next=await exportPage(a,'miyou_messages',500);
  assert.equal(page.rows.length,500);assert.equal(page.rows.length+next.rows.length,page.total);
  assert.equal(new Set([...page.rows,...next.rows].map(m=>m.id)).size,page.total);
});
await check('Cron cleanup deletes expired rows, clears reply FK without deleting reply',async()=>{
  // pg_cron is unavailable in WASM; run the exact job SQL from the migration.
  const sql=await readFile(new URL('../supabase/migrations/202611220002_miyou_retention.sql',import.meta.url),'utf8');
  const body=sql.match(/\$job\$([\s\S]*?)\$job\$/)[1];await db.exec(body);
  assert.equal((await db.query('select count(*)::int as n from public.miyou_messages where id=$1',[first.id])).rows[0].n,0);
  const reply=await db.query('select reply_id from public.miyou_messages where body=$1',['好呀，也陪小猫玩一会儿。']);assert.equal(reply.rows[0].reply_id,null);
});
await check('Deleting either auth account removes shared records',async()=>{
  await db.query('delete from auth.users where id=$1',[a]);
  for(const table of ['miyou_links','miyou_messages','miyou_pets','miyou_care_events','miyou_reports'])assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n,0);
});
await writeFile(`${out}/database.json`,JSON.stringify({passed:true,checks,production:false,cronSchedulerTested:false},null,2));
console.log(`Miyou PostgreSQL verification passed: ${checks.length} scenarios.`);
}finally{await db.close();}
