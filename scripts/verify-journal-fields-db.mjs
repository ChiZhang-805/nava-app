import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const runtime=process.env.NAVA_PGLITE||'Q:/NAVA-Workspace/NAVA-App/Tools/reward-db-check/node_modules/@electric-sql/pglite/dist/index.js';
const {PGlite}=await import(pathToFileURL(runtime));const db=new PGlite();
const old=(await readFile('supabase/migrations/202609230001_journal_workflow.sql','utf8')).split('create table public.journal_entries')[0];
await db.exec(old);
const migration=await readFile('supabase/migrations/202611201200_journal_optional_review_fields.sql','utf8');await db.exec(migration);
const ctx=vm.createContext({__fluffyModules:{}});for(const name of ['model','sleep-time','catalog'])vm.runInContext(await readFile(`public/journal/js/${name}.js`,'utf8'),ctx);
const C=ctx.__fluffyModules['catalog.js'];let checks=0;
async function check(category,fields,expected){const result=await db.query('select public.valid_journal_fields($1,$2::jsonb) as valid',[category,JSON.stringify(fields)]);assert.equal(result.rows[0].valid,expected,`${category}: ${JSON.stringify(fields)}`);checks++;}
const examples={mood:{mood:'平静',intensity:4,reasonTags:'工作、社交'},food:{foods:'米饭',mealTime:'12:15',selfAssessment:'一般',calories:0},sport:{activity:'走路',durationMinutes:20,intensity:'轻松',recovery:'精神不错',startTime:'11:30',endTime:'11:50',steps:0},sleep:{bedtime:'23:00',wakeTime:'07:00'},face:{feeling:'有点困',captureMode:'素颜'},focus:{task:'读书',durationMinutes:25}};
for(const [category,fields] of Object.entries(examples)){await check(category,fields,true);const normalized=C.validate(category,fields,true,{recordDate:'2026-11-20'});assert.ok(normalized.ok);await check(category,normalized.value,true);await check(category,{...fields,unknown:'x'},false);}
for(const [category,fields] of [['food',{foods:'饭',meal:'午餐'}],['sport',{activity:'跑步',durationMinutes:30,notes:'3公里'}],['sleep',{bedtime:'23:00',wakeTime:'07:00',quality:'还好'}]])await check(category,fields,true);
for(const [category,key,value] of [['mood','intensity',0],['mood','intensity',11],['mood','intensity','5'],['mood','reasonTags','工作、未知'],['food','mealTime','24:00'],['food','mealTime',true],['food','selfAssessment','超级健康'],['food','meal','夜宵'],['sport','steps',1.5],['sport','steps',200001],['sport','steps',-1],['sport','intensity',3],['sport','recovery','unknown'],['sport','endTime','8:30'],['face','captureMode','自动诊断'],['focus','durationMinutes',0]])await check(category,{...examples[category],[key]:value},false);
for(const category of Object.keys(examples)){await check(category,{},false);await check(category,[],false);await check(category,null,false);}
await check('mood',{mood:'开心',intensity:null,reasonTags:''},true);
const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-review-deck';await mkdir(output,{recursive:true});await writeFile(`${output}/database-validator.json`,JSON.stringify({checks,passed:true,runtime:'Local PGlite PostgreSQL',migration:'202611201200_journal_optional_review_fields.sql',deployed:false},null,2));
await db.close();console.log(`PostgreSQL validator: ${checks} checks passed; NOT deployed.`);
