import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({__fluffyModules:{}});
for(const name of ['model','sleep-time','catalog']) vm.runInContext(readFileSync(`public/journal/js/${name}.js`,'utf8'),context);
const rows=record=>JSON.parse(JSON.stringify(context.__fluffyModules['catalog.js'].rows(record)));

test('all six categories omit absent optional fields without altering real text',()=>{
 const cases=[
  ['face',{feeling:'有点疲惫',eyeArea:'黑眼圈很重',skinAppearance:'',notes:'   '},['有点疲惫','黑眼圈很重']],
  ['mood',{mood:'放松啦',reason:'',notes:null},['放松啦']],
  ['food',{meal:'午餐',foods:'米饭',portion:'',calories:null,protein:'',carbs:0,fat:0,notes:''},['米饭','0 g','0 g']],
  ['sport',{activity:'散步',durationMinutes:20,notes:''},['散步','20 min']],
  ['sleep',{hours:0,quality:'',notes:''},['0 h']],
  ['focus',{task:'读书',durationMinutes:15,notes:''},['读书','15 min']],
 ];
 for(const [category,data,expected] of cases) assert.deepEqual(rows({category,data}).map(row=>row.value),expected,category);
});

test('legacy record presentation also omits empty notes and preserves zero',()=>{
 const value=context.__fluffyModules['model.js'].displayRows({activity:'慢走',durationMinutes:0,distanceKm:0,notes:''});
 assert.deepEqual(JSON.parse(JSON.stringify(value)),[{label:'Activity',value:'慢走 · 0 km'},{label:'Time',value:'0 min'}]);
});
