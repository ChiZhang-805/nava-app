// Selective, reviewed Miyou deployment. Does not push unrelated migrations or
// create/sign in as any account. Run without --apply for a read-only plan.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const project='wxteapvwagvhhtrjrbim';
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/miyou';
const versions=['202611220001','202611220002'];
const files=['202611220001_miyou_space.sql','202611220002_miyou_retention.sql'];
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),project,'Unexpected linked project');
await mkdir(out,{recursive:true});
function cli(args){
  const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
  if(r.status!==0)throw new Error('Supabase operation failed; no account data or credentials are included in this error. Recheck migration receipts before retrying.');
  return JSON.parse(r.stdout);
}
function query(sql){return cli(['db','query','--linked',sql]).rows;}
const sources=await Promise.all(files.map(file=>readFile(`supabase/migrations/${file}`,'utf8')));
const receipts=()=>query(`select version,name,md5(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n')) as checksum from supabase_migrations.schema_migrations where version in ('${versions.join("','")}') order by version`);
const existing=receipts();
const targets=query("select to_regclass('public.miyou_people')::text as people, exists(select 1 from pg_available_extensions where name='pg_cron') as cron_available");
const plan={project,migrations:files,alreadyApplied:existing.map(r=>r.version),createAccounts:false,apply:process.argv.includes('--apply')};
console.log(JSON.stringify(plan));
if(process.argv.includes('--apply')&&existing.length===0){
  assert.equal(targets[0].people,null,'Unrecorded Miyou schema already exists; stop for inspection');
  assert.equal(targets[0].cron_available,true,'pg_cron is unavailable');
  const statements=sources.map((sql,i)=>{
    const body=sql.replace(/^begin;\s*$/m,'').replace(/commit;\s*$/,'');
    const tag=`$miyou_${createHash('sha256').update(sql).digest('hex').slice(0,12)}$`;
    const name=files[i].slice(13,-4);
    return `${body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${versions[i]}','${name}',ARRAY[${tag}${sql}${tag}]);`;
  }).join('\n');
  const transaction=`begin; set local lock_timeout='10s'; set local statement_timeout='90s'; select pg_advisory_xact_lock(hashtextextended('nava-miyou-deployment',0));\n${statements}\nnotify pgrst, 'reload schema';\ncommit;`;
  const path=`${out}/apply-miyou.sql`;await writeFile(path,transaction,'utf8');
  cli(['db','query','--linked','--file',path]);
}else if(existing.length!==0&&existing.length!==2){throw new Error('Partial migration state; inspect before continuing');}
const after=receipts();
if(process.argv.includes('--apply')){
  assert.equal(after.length,2);
  for(let i=0;i<2;i++)assert.equal(after[i].checksum,createHash('md5').update(sources[i].replace(/\r\n/g,'\n')).digest('hex'),'Migration receipt differs from reviewed source');
  const tables=query("select c.relname as name,c.relrowsecurity as rls,has_table_privilege('authenticated',c.oid,'SELECT') as direct_authenticated_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('miyou_people','miyou_links','miyou_messages','miyou_pets','miyou_care_catalog','miyou_care_events','miyou_reports') order by c.relname");
  assert.equal(tables.length,7);assert.ok(tables.every(t=>t.rls&&!t.direct_authenticated_read));
  const catalog=query('select kind,count(*)::int as count from public.miyou_care_catalog group by kind order by kind');
  assert.deepEqual(catalog,[{count:6,kind:'exercise'},{count:8,kind:'food'},{count:3,kind:'rest'}]);
  const cron=query("select jobname,schedule,active,command from cron.job where jobname='nava-miyou-retention'");
  assert.equal(cron.length,1);assert.equal(cron[0].active,true);assert.equal(cron[0].schedule,'17 * * * *');
  const privileges=query("select has_function_privilege('anon','public.nava_miyou(text,jsonb)','EXECUTE') as anonymous_rpc,has_function_privilege('authenticated','public.nava_miyou(text,jsonb)','EXECUTE') as authenticated_rpc,has_function_privilege('authenticated','public.nava_miyou_export(text,integer)','EXECUTE') as account_export,has_function_privilege('authenticated','public.nava_miyou_avatar_ref(uuid)','EXECUTE') as private_avatar_helper,(select public from storage.buckets where id='profile-avatars') as public_avatar_bucket");
  assert.deepEqual(privileges,[{account_export:true,anonymous_rpc:false,authenticated_rpc:true,private_avatar_helper:false,public_avatar_bucket:false}]);
  const columns=query("select c.table_name,c.column_name,c.data_type,c.is_nullable,c.column_default,col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass,c.ordinal_position) as description from information_schema.columns c where c.table_schema='public' and c.table_name like 'miyou_%' order by c.table_name,c.ordinal_position");
  await writeFile(`${out}/production-schema.json`,JSON.stringify({project,applied:true,migrations:after,tables,catalog,cron,privileges,columns,createdAccounts:false,accountRecordsWritten:false,at:new Date().toISOString()},null,2));
  console.log(JSON.stringify({applied:true,tables:tables.length,catalog:17,cron:cron[0].schedule,columns:columns.length,createdAccounts:false}));
}
