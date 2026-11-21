// Selective schema/data deployment; never creates accounts or writes journals.
// Prepare the official archive with prepare-food-references.py first.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const project = 'wxteapvwagvhhtrjrbim';
const version = '202611220005';
const name = 'food_composition_reference';
const out = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/food-reference';
const importFile = 'Q:/NAVA-Workspace/NAVA-App/Caches/nutrition/import-fndds.sql';
const sql = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replace(/\r\n/g, '\n');
const checksum = createHash('md5').update(sql).digest('hex');
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(), project);
await mkdir(out, {recursive:true});
function cli(args) {
  const r = spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
  if (r.status !== 0) throw Error(`Supabase operation failed: ${r.stderr.replace(/Bearer\s+\S+/g,'Bearer [redacted]').slice(0,1500)}`);
  return JSON.parse(r.stdout);
}
const query = text => cli(['db','query','--linked',text]).rows;
const receipts = () => query(`select version,md5(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n')) as checksum from supabase_migrations.schema_migrations where version='${version}'`);
let existing = receipts();
if (existing.length) assert.equal(existing[0].checksum, checksum, 'Applied schema differs');
console.log(JSON.stringify({project,version,alreadyApplied:!!existing.length,apply:process.argv.includes('--apply')}));
if (!process.argv.includes('--apply')) process.exit(0);
if (!existing.length) {
  assert.equal(query("select to_regclass('public.food_composition_references')::text as table_name")[0].table_name,null);
  const body=sql.replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
  const tag='$food_reference_migration$';
  const transaction=`begin; set local lock_timeout='10s'; set local statement_timeout='90s';\n${body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',ARRAY[${tag}${sql}${tag}]);\nnotify pgrst, 'reload schema'; commit;`;
  await writeFile(`${out}/schema.sql`,transaction);
  cli(['db','query','--linked','--file',`${out}/schema.sql`]);
}
assert.equal(receipts()[0].checksum,checksum);
cli(['db','query','--linked','--file',importFile]);
const counts=query("select count(*)::int as total,count(*) filter(where vision_priority>0)::int as default_references from public.food_composition_references")[0];
assert.equal(counts.total,5431); assert.equal(counts.default_references,32);
const permissions=query("select has_table_privilege('authenticated','public.food_composition_references','INSERT') as can_insert,has_table_privilege('anon','public.food_composition_references','SELECT') as anon_select,has_function_privilege('anon','public.nava_food_reference_search(text[],integer)','EXECUTE') as anon_rpc,(select relrowsecurity from pg_class where oid='public.food_composition_references'::regclass) as rls")[0];
assert.deepEqual(permissions,{can_insert:false,anon_select:false,anon_rpc:false,rls:true});
const matches=query("select fdc_id,description,calories_kcal,protein_g from public.nava_food_reference_search(ARRAY['pork ribs'],3)");
assert.ok(matches.some(r=>r.description==='Pork, ribs'));
// The same role used by food endpoints can search the readonly reference data.
const authenticated=query("begin; set local role authenticated; select count(*)::int as total from public.nava_food_reference_search(ARRAY['chicken drumstick fried coated'],5);");
assert.equal(authenticated[0].total,5);
await writeFile(`${out}/receipt.json`,JSON.stringify({project,version,checksum,counts,permissions,matches,authenticated,at:new Date().toISOString()},null,2));
console.log(JSON.stringify({applied:true,...counts,readonlyForUsers:true}));
