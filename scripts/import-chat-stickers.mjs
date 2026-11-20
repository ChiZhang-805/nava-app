import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Explicitly curated, pinned official Flat assets. Never import arbitrary search-result packs.
const revision='1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const source='https://github.com/microsoft/fluentui-emoji';
const output=new URL('../public/stickers/fluent-flat/',import.meta.url);
const files=[
 ['like','Thumbs up/Default/Flat/thumbs_up_flat_default.svg'],
 ['happy','Smiling face with hearts/Flat/smiling_face_with_hearts_flat.svg'],
 ['hug','Hugging face/Flat/hugging_face_flat.svg'],
 ['well-done','Clapping hands/Default/Flat/clapping_hands_flat_default.svg'],
 ['ok','Ok hand/Default/Flat/ok_hand_flat_default.svg'],
 ['rest','Sleeping face/Flat/sleeping_face_flat.svg'],
 ['hello','Waving hand/Default/Flat/waving_hand_flat_default.svg'],
 ['touched','Face holding back tears/Flat/face_holding_back_tears_flat.svg'],
 ['thanks','Face blowing a kiss/Flat/face_blowing_a_kiss_flat.svg'],
 ['laugh','Cat with tears of joy/Flat/cat_with_tears_of_joy_flat.svg'],
 ['love','Smiling cat with heart-eyes/Flat/smiling_cat_with_heart-eyes_flat.svg'],
 ['here','Cat face/Flat/cat_face_flat.svg'],
 ['surprised','Astonished face/Flat/astonished_face_flat.svg'],
 ['sad','Crying face/Flat/crying_face_flat.svg'],
 ['tired','Yawning face/Flat/yawning_face_flat.svg'],
 ['sleepy','Sleepy face/Flat/sleepy_face_flat.svg'],
 ['worried','Worried face/Flat/worried_face_flat.svg'],
 ['angry','Angry face/Flat/angry_face_flat.svg'],
 ['confused','Confused face/Flat/confused_face_flat.svg'],
 ['relieved','Relieved face/Flat/relieved_face_flat.svg'],
 ['celebrate','Party popper/Flat/party_popper_flat.svg'],
 ['cheer','Raising hands/Default/Flat/raising_hands_flat_default.svg'],
 ['water','Droplet/Flat/droplet_flat.svg'],
 ['meal','Bowl with spoon/Flat/bowl_with_spoon_flat.svg'],
 ['coffee','Hot beverage/Flat/hot_beverage_flat.svg'],
 ['relax','Person in lotus position/Default/Flat/person_in_lotus_position_flat_default.svg'],
 ['good-night','Crescent moon/Flat/crescent_moon_flat.svg'],
 ['think','Thinking face/Flat/thinking_face_flat.svg'],
 ['yes','Check mark button/Flat/check_mark_button_flat.svg'],
 ['sorry','Folded hands/Default/Flat/folded_hands_flat_default.svg'],
];
const raw=path=>`https://raw.githubusercontent.com/microsoft/fluentui-emoji/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
async function download(path){const response=await fetch(raw(path));if(!response.ok)throw Error(`${path}: ${response.status}`);return response.text();}
await mkdir(output,{recursive:true});
const license=await download('LICENSE');
if(!license.includes('MIT License')||!license.includes('Microsoft Corporation'))throw Error('Unexpected source license');
await writeFile(new URL('LICENSE.txt',output),license);
const assets=await Promise.all(files.map(async([id,path])=>{
 const content=await download(`assets/${path}`);
 if(!content.includes('<svg')||/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:)/i.test(content))throw Error(`Unexpected active or external SVG content: ${id}`);
 await writeFile(new URL(`${id}.svg`,output),content);
 return {id,file:`${id}.svg`,upstreamPath:`assets/${path}`,source:`${source}/blob/${revision}/assets/${path.split('/').map(encodeURIComponent).join('/')}`,sha256:createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content),modified:false};
}));
await writeFile(new URL('sources.json',output),JSON.stringify({name:'Microsoft Fluent Emoji — Flat',source,revision,license:'MIT',copyright:'Copyright (c) Microsoft Corporation.',licenseFile:'LICENSE.txt',licenseSource:`${source}/blob/${revision}/LICENSE`,usage:'Static 2D SVG assets redistributed without modification; NAVA labels are separate UI text.',assets},null,2)+'\n');
console.log(JSON.stringify({assets:assets.length,bytes:assets.reduce((sum,item)=>sum+item.bytes,0),revision,license:'MIT'}));
