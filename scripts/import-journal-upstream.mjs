import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Mechanical, pinned import of user-approved artwork and page sources. No execution of upstream scripts.
const source = 'Q:/NAVA-Workspace/Build/TestRuns/journal-integration/upstream-v16';
const target = path.resolve('public/journal');
const expected = 'fb7045d611dc0eab40818b3d6d494f6dfa12a9c6';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== expected) throw Error('Unexpected upstream revision');
if (existsSync(target)) throw Error('Import target exists; refuse to overwrite integration changes');
mkdirSync(target, { recursive: true });
for (const name of ['assets', 'css', 'js', 'licenses', 'index.html']) cpSync(path.join(source, name), path.join(target, name), { recursive: true, errorOnExist: true, force: false });
writeFileSync(path.join(target, 'upstream.json'), JSON.stringify({ repository: 'https://github.com/ChiZhang-805/fluffy-cat-journal', commit: expected, version: 16, integration: 'NAVA authenticated four-page workflow' }, null, 2) + '\n');
console.log('Imported pinned v16 page sources and original artwork. Integration changes remain in this source repository.');
