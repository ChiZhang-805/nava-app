import { spawnSync } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const project='wxteapvwagvhhtrjrbim',url=`https://${project}.supabase.co`;
const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true});
if(r.status!==0)throw Error('Secure test credentials unavailable');
const keys=JSON.parse(r.stdout),service=keys.find(x=>x.name==='service_role').api_key,anon=keys.find(x=>x.name==='anon').api_key;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),ids=[];
const results=[];
try{
 const clients=[];
 for(let i=0;i<2;i++){
  const email=`journal-acceptance-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw Error('Test account creation failed');ids.push(data.user.id);
  const p=await admin.from('profiles').upsert({id:data.user.id,ai_personalization_consent:true,health_data_consent:true});if(p.error)throw Error('Test consent setup failed');
  const c=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw Error('Real password authentication failed');clients.push(c);
 }
 const [a,b]=clients,date=new Date().toLocaleDateString('en-CA'),record={id:randomUUID(),category:'mood',recordDate:date,data:{mood:'平静',reason:'散步后放松',notes:'保持节奏'},source:'manual',estimated:false};
 const first=await a.rpc('save_journal_entry',{p_record:record});if(first.error)throw Error(`Create failed: ${first.error.code}`);assert.equal(first.data.user_id,ids[0]);results.push('confirmed create');
 const replay=await a.rpc('save_journal_entry',{p_record:record});assert.equal(replay.data.version,1);results.push('idempotent create');
 const isolated=await b.from('journal_entries').select('*');assert.equal(isolated.data.length,0);results.push('cross-account isolation');
 const changed={...record,data:{...record.data,mood:'轻松'}};
 assert.equal((await a.rpc('save_journal_entry',{p_record:changed,p_expected_version:1})).data.version,2);
 assert.ok((await a.rpc('save_journal_entry',{p_record:record,p_expected_version:1})).error);results.push('version conflict rejected');
 assert.ok((await a.rpc('save_journal_entry',{p_record:{...record,id:randomUUID(),data:{mood:'x'.repeat(100)}}})).error);results.push('field schema enforced');
 assert.ok((await a.from('journal_entries').update({fields:{mood:'bypass'}}).eq('id',record.id)).error);results.push('direct write bypass blocked');
 const {data:session}=await a.auth.getSession();
 const ai=await fetch(`${url}/functions/v1/journal-assistant`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${session.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({provider:'deepseek',category:'mood',recordDate:date,payload:{messages:[{role:'system',content:'Extract only stated facts. Return exactly this JSON structure, not flattened: {"fields":{"mood":"", "reason":"", "notes":""},"warnings":[],"estimated":false}. Each string <= 30 characters. Unknown text stays empty. The top-level keys must be fields, warnings, estimated.'},{role:'user',content:'今天散步后很放松。'}],response_format:{type:'json_object'},max_tokens:500}})});
 const answer=await ai.json();if(!ai.ok)throw Error(`Real AI failed ${ai.status}: ${answer.error}`);
 assert.equal(answer.provider,'deepseek');assert.ok(JSON.parse(answer.choices[0].message.content).fields.mood);results.push(`real text AI: ${answer.model}`);
 const runs=await a.from('journal_ai_runs').select('provider,model');assert.equal(runs.data.length,1);results.push('server AI provenance saved');
 await admin.from('profiles').update({ai_personalization_consent:false}).eq('id',ids[0]);
 const denied=await fetch(`${url}/functions/v1/journal-assistant`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${session.session.access_token}`,'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,400);results.push('consent revoked blocks AI');
 console.log(JSON.stringify({passed:results}));
 const out='Q:/NAVA-Workspace/Build/TestRuns/journal-integration';mkdirSync(out,{recursive:true});writeFileSync(`${out}/backend-results.json`,JSON.stringify({passed:results},null,2));
}finally{
 for(const id of ids){const result=await admin.auth.admin.deleteUser(id);if(result.error)throw Error('Disposable acceptance account cleanup failed');}
 console.log('Disposable acceptance accounts removed.');
}
