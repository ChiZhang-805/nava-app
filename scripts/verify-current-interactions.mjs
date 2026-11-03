import {spawnSync} from 'node:child_process';
// Keep historical React record-editor selectors out of the current journal gate.
for(const args of [
 ['scripts/verify-interactions.mjs','--auth-only'],
 ['scripts/verify-navigation-regression.mjs'],
 ['scripts/verify-current-overlays.mjs'],
 ['scripts/verify-secure-draft-runtime.mjs'],
 ['scripts/verify-text-resize.mjs'],
]) {
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status??1);
}
console.log('Current authentication, navigation, overlays and secure draft interaction gate passed.');
