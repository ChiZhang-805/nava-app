import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,unlinkSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
const scanner=path.resolve('scripts/verify-repository-files.mjs');
test('file audit permits only reviewed exact-version retirements and rejects live references',()=>{
 const fixtureRoot='Q:/NAVA-Workspace/Build/TestRuns/App-Checks/full-file-audit-fixtures';
 mkdirSync(fixtureRoot,{recursive:true});
 const root=mkdtempSync(path.join(fixtureRoot,'fixture-'));
 try {
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const write=(name,text)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),text);};
 write('src/assets/retired.svg','<svg/>');write('src/assets/required.svg','<svg/>');
 git('init','-q');git('add','.');git('-c','user.name=Audit Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 const blob=git('rev-parse','HEAD:src/assets/retired.svg');
 const manifest=hash=>write('scripts/retired-assets.json',JSON.stringify({files:[{path:'src/assets/retired.svg',gitBlob:hash}]}));
 manifest(blob);unlinkSync(path.join(root,'src/assets/retired.svg'));
 const run=()=>{const result=spawnSync(process.execPath,[scanner],{cwd:root,env:{...process.env,NAVA_FILE_AUDIT_OUTPUT:path.join(root,'evidence')},encoding:'utf8'});return {status:result.status,report:JSON.parse(readFileSync(path.join(root,'evidence/tracked-files-report.json'),'utf8'))};};
 write('.gitignore','evidence/\n');
 assert.equal(run().status,0);
 write('src/live.ts',"import icon from './assets/retired.svg';");
 assert.ok(run().report.failures.some(f=>f.check==='retired-reference'));
 unlinkSync(path.join(root,'src/live.ts'));manifest('wrong-version');
 assert.ok(run().report.failures.some(f=>f.check==='read'));
 manifest(blob);unlinkSync(path.join(root,'src/assets/required.svg'));
 assert.ok(run().report.failures.some(f=>f.file==='src/assets/required.svg'));
 write('native/bad.swift','<<<<<<< unresolved\n');
 assert.ok(run().report.failures.some(f=>f.file==='native/bad.swift'&&f.check==='merge-marker'));
 } finally {
  rmSync(root,{recursive:true,force:true});
 }
});
