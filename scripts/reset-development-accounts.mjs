import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Explicitly approved all-account reset. Dry-run by default; no secrets/records in stdout.
const project = 'wxteapvwagvhhtrjrbim';
const apply = process.argv.includes(`--delete-all-accounts=${project}`);
const resume=process.argv.includes(`--resume-backup=${project}`);
const finish=process.argv.includes(`--finish-reset=${project}`);
const root = path.resolve('Q:/NAVA-Workspace/Build/TestRuns/journal-integration/account-reset');
if(apply&&existsSync(root)&&!resume&&!finish)throw Error('Backup path already exists; refuse to overwrite recovery evidence');
function unseal(name){
 const code='Add-Type -AssemblyName System.Security; $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:NAVA_RESET_BACKUP),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($bytes))';
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,env:{...process.env,NAVA_RESET_BACKUP:path.join(root,`${name}.dpapi`)},maxBuffer:64*1024*1024,timeout:60000});if(r.status!==0)throw Error('Backup recovery validation failed');return Buffer.from(r.stdout,'base64');
}
function cli(args) {
  const r = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
  if (r.status !== 0) throw Error('Supabase operation failed (output withheld to protect private data).');
  return JSON.parse(r.stdout);
}
function query(sql) { return cli(['db','query','--linked',sql]).rows; }
function seal(name, bytes) {
  // Windows CurrentUser DPAPI; plaintext travels through hidden stdin only.
  const file = path.join(root, `${name}.dpapi`);
  if(existsSync(file)){if(!resume)throw Error('Refuse to overwrite backup');unseal(name);return;}
  const code = 'Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $sealed=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes($env:NAVA_RESET_BACKUP,$sealed); $check=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:NAVA_RESET_BACKUP),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $sha=[Security.Cryptography.SHA256]::Create(); if([Convert]::ToBase64String($sha.ComputeHash($bytes)) -ne [Convert]::ToBase64String($sha.ComputeHash($check))){throw "Backup verification failed"}';
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input:Buffer.from(bytes).toString('base64'),encoding:'utf8',windowsHide:true,env:{...process.env,NAVA_RESET_BACKUP:file},maxBuffer:1024*1024,timeout:60000});
  if(r.status!==0) throw Error('Encrypted backup failed; deletion refused.');
}
const linked=await import('node:fs/promises').then(fs=>fs.readFile('supabase/.temp/project-ref','utf8'));
if(linked.trim()!==project) throw Error('Unexpected linked project; stopped.');
const keys=cli(['projects','api-keys','--project-ref',project,'--output','json']);
const key=keys.find(k=>k.name==='service_role')?.api_key;
if(!key) throw Error('Admin API credential unavailable.');
const admin=createClient(`https://${project}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
let users=[];
for(let page=1;;page++){const r=await admin.auth.admin.listUsers({page,perPage:100});if(r.error)throw Error('Account inventory failed');users.push(...r.data.users);if(r.data.users.length<100)break;}
const ids=users.map(u=>u.id).sort();
if(finish){
 if(!apply)throw Error('Finalization requires the explicit deletion flag');
 const snapshot=JSON.parse(unseal('accounts')),original=snapshot.ids;
 if(ids.some(id=>!original.includes(id)))throw Error('New accounts exist; stop before deleting outside the approved snapshot');
 const manifest=JSON.parse(unseal('storage-manifest')),missing=JSON.parse(unseal('unavailable-storage-objects'));
 for(const o of manifest){if(!missing.some(m=>m.bucket_id===o.bucket_id&&m.name===o.name))unseal('object-'+createHash('sha256').update(o.bucket_id+'/'+o.name).digest('hex'));}
 for(const id of ids){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error(`Account cleanup failed: ${r.error.message}`);}
 query('begin; delete from public.nava_auth_account_checks; delete from public.nava_phone_otp_challenges; commit;');
 const result=query("select (select count(*) from auth.users) as accounts,(select count(*) from storage.objects) as objects,(select count(*) from public.journal_entries) as journal_records")[0];
 const tables=query("with recursive owned(oid) as (select 'auth.users'::regclass::oid union select c.conrelid from pg_constraint c join owned o on c.confrelid=o.oid where c.contype='f') select distinct cl.relname as name from owned o join pg_class cl on cl.oid=o.oid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relkind='r'").map(r=>r.name);
 if(tables.some(t=>!/^[a-z0-9_]+$/.test(t)))throw Error('Invalid table');
 const residual=query(tables.map(t=>`select '${t}' as name,count(*) as n from public.${t}`).join(' union all ')).filter(r=>Number(r.n)>0);
 const receipt={project,applied:true,originalAccounts:original.length,remainingAccounts:Number(result.accounts),remainingObjects:Number(result.objects),residualRows:residual,alreadyMissingObjects:missing.length,backup:'CurrentUser DPAPI; all recoverable private files and account tables verified decryptable',finishedAt:new Date().toISOString()};
 writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 if(Number(result.accounts)||residual.length)throw Error('Cleanup has residual account data');process.exit(0);
}
if(resume&&JSON.stringify(JSON.parse(unseal('accounts')).ids)!==JSON.stringify(ids))throw Error('Accounts changed; backup cannot be resumed');
const owned=query("with recursive owned(oid) as (select 'auth.users'::regclass::oid union select c.conrelid from pg_constraint c join owned o on c.confrelid=o.oid where c.contype='f') select distinct cl.relname as table_name from owned o join pg_class cl on cl.oid=o.oid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relkind='r' order by table_name").map(r=>r.table_name);
for(const table of owned) if(!/^[a-z0-9_]+$/.test(table))throw Error('Invalid table inventory');
const objects=query("select bucket_id,name,metadata->>'size' as size from storage.objects order by bucket_id,name").filter(o=>ids.includes(o.name.split('/')[0]));
const countAll=()=>Object.fromEntries(query(owned.map(table=>`select '${table}' as name,count(*)::integer as n from public.${table}`).join(' union all ')).map(r=>[r.name,Number(r.n)]));
const counts=countAll();
const summary={project,accounts:ids.length,ownedTables:owned.length,rows:counts,privateObjects:objects.length,privateBytes:objects.reduce((s,o)=>s+Number(o.size||0),0),applied:false};
console.log(JSON.stringify(summary));
if(!apply)process.exit(0);
if(!ids.length)throw Error('No accounts to delete; no destructive operation performed');
mkdirSync(root,{recursive:true});
seal('accounts',JSON.stringify({users,ids,createdAt:new Date().toISOString()}));
seal('auth-users',JSON.stringify(query('select * from auth.users')));
let tablesBackedUp=0;
for(const table of owned){
 if(resume&&existsSync(path.join(root,`table-${table}.dpapi`))){if(JSON.parse(unseal(`table-${table}`)).length!==counts[table])throw Error('Row counts changed; stopped before deletion');}
 else{const rows=query(`select * from public.${table}`);seal(`table-${table}`,JSON.stringify(rows));}
 tablesBackedUp++;if(tablesBackedUp%8===0)console.log(`Encrypted ${tablesBackedUp}/${owned.length} account tables; no deletion yet.`);
}
for(const table of ['nava_auth_account_checks','nava_phone_otp_challenges'])seal(`table-${table}`,JSON.stringify(query(`select * from public.${table}`)));
seal('storage-manifest',JSON.stringify(objects));
const unavailable=[];
for(const o of objects){
 const name='object-'+createHash('sha256').update(o.bucket_id+'/'+o.name).digest('hex');
 if(resume&&existsSync(path.join(root,`${name}.dpapi`))){unseal(name);continue;}
 let r=await admin.storage.from(o.bucket_id).download(o.name);
 if(r.error)r=await admin.storage.from(o.bucket_id).download(o.name);
 if(r.error){console.log(JSON.stringify({storageBackupError:{bucket:o.bucket_id,status:r.error.statusCode??r.error.status,error:r.error.message}}));
   if(String(r.error.statusCode??r.error.status)==='404'||/not found|does not exist/i.test(r.error.message)){unavailable.push(o);continue;}
   throw Error('Private-file backup failed; deletion refused');
 }
 seal(name,Buffer.from(await r.data.arrayBuffer()));
}
seal('unavailable-storage-objects',JSON.stringify(unavailable));
// Freeze exact targets. A new signup since the snapshot is not silently deleted.
const current=[];for(let page=1;;page++){const r=await admin.auth.admin.listUsers({page,perPage:100});if(r.error)throw Error('Recheck failed');current.push(...r.data.users.map(u=>u.id));if(r.data.users.length<100)break;}
if(JSON.stringify(current.sort())!==JSON.stringify(ids))throw Error('Accounts changed during backup; stopped before deletion');
for(const bucket of new Set(objects.map(o=>o.bucket_id))){const names=objects.filter(o=>o.bucket_id===bucket).map(o=>o.name);for(let i=0;i<names.length;i+=100){const r=await admin.storage.from(bucket).remove(names.slice(i,i+100));if(r.error)throw Error('Private-file deletion failed; backup retained');}}
let deleted=0;
for(const id of ids){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error('Account deletion failed; encrypted backup retained');deleted++;}
query('begin; delete from public.nava_auth_account_checks; delete from public.nava_phone_otp_challenges; commit;');
const remaining=Number(query('select count(*)::integer as n from auth.users')[0].n);
const residual=Object.fromEntries(Object.entries(countAll()).filter(([,n])=>n));
const remainingObjects=query('select bucket_id,name from storage.objects').filter(o=>ids.includes(o.name.split('/')[0])).length;
const receipt={...summary,applied:true,deleted,remainingAccounts:remaining,residualRows:residual,remainingObjects,alreadyMissingObjects:unavailable.length,backup:'CurrentUser DPAPI; verified decryptable, manual administrative restoration required; already missing blobs have metadata only',finishedAt:new Date().toISOString()};
writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
if(remaining||remainingObjects||Object.keys(residual).length)throw Error('Reset incomplete; inspect residual counts without deleting unrelated schema');
