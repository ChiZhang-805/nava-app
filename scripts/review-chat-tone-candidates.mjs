import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
if(!process.argv.includes('--paid-run')) throw new Error('Explicit --paid-run required');
const key=process.env.DEEPSEEK_API_KEY_NAVA;
if(!key)throw new Error('DEEPSEEK_API_KEY_NAVA required; no fallback');
const dir='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/chat-tone-candidates';
const args=process.argv.slice(2).filter(x=>/^\d+$/.test(x)).map(Number);
const queue=args.length?args:Array.from({length:12},(_,i)=>i+1);let cursor=0;
async function worker(){while(cursor<queue.length){
 const group=queue[cursor++],file=resolve(dir,`group-${String(group).padStart(2,'0')}.json`),original=JSON.parse(await readFile(file,'utf8'));
 const target=resolve(dir,`reviewed-${String(group).padStart(2,'0')}.json`);
 try{const old=JSON.parse(await readFile(target,'utf8'));if(old.examples.length===original.examples.length)continue;}catch{}
 const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),body:JSON.stringify({model:'deepseek-v4-flash',thinking:{type:'disabled'},temperature:.85,max_tokens:8000,response_format:{type:'json_object'},messages:[
 {role:'system',content:`你是挑剔的中文聊天编辑。审核并重写这些原创候选，给虚拟猫瓦咪儿作语气参考。必须逐条处理并保持id和数量，JSON {examples:[{id,context,response,register,features}]}。所有条目都须修好，不要讨论审核。
 第一优先：response不得编造context没给出的天气、地点、成绩、共同往事，不得称自己有肉身能收衣服吃饭出门约会，不得自称已保存修改记录或已设置提醒。去掉猜动机诊断（手心出汗不等于在意），不教训（别光顾着乐/快点睡/记得…），不强行归因或承诺成功。将有问题的条目换成同意图新场景也可以。
 其次语气：要像真实中文消息，允许短促感叹+具体接话+可选一个问题，避免处处都冷淡干瘪的句号。轻松场景约一半2–3气泡，约三分之一可以1个emoji或颜文字在句尾；约三分之一少量网络表达例如okk～/okkk~/xswl/救命哈哈哈/绷不住/水灵灵地/班味/这波/好耶/啊啊啊啊/谁懂。不许一条塞多个梗，不许同套开头反复用，不许机械全部感叹号。涉及失落焦虑和用户不要表情时要温柔平常话，禁玩梗与emoji。助手认错要简洁具体，不推系统。
 不主动称宝宝宝贝或说爱你，不加方言。本批不是恋人角色扮演。普通浪漫情境是用户与现实对象，不是与助手恋爱。不替用户解读恋爱信号为确定意图。
 context 20–70中文字，response 1–3字符串，每条2–45字。register取plain/casual/playful/gentle，features取slang/emoji/kaomoji/pet-name/affection/dialect，必须真实标记。普通口语可以空数组。禁止复制知名长句或真实聊天。不把教程数字或健康建议写成语气示例。`},
 {role:'user',content:JSON.stringify(original.examples.map(({id,intent,emotion,context,response})=>({id,intent,emotion,context,response})))},
 ]})});
 if(!response.ok)throw new Error(`Review HTTP ${response.status}`);const data=await response.json();if(data.choices?.[0]?.finish_reason!=='stop')throw new Error(`Incomplete review ${group}`);
 const revised=JSON.parse(data.choices[0].message.content).examples;
 if(!Array.isArray(revised)||revised.length!==original.examples.length)throw new Error(`Missing IDs group ${group}`);
 const byId=new Map(revised.map(x=>[x.id,x]));
 const examples=original.examples.map(x=>{const r=byId.get(x.id);if(!r||!Array.isArray(r.response)||r.response.length<1||r.response.length>3||!r.response.every(t=>typeof t==='string'&&t.trim()&&t.length<=110))throw new Error(`Invalid review ${x.id}`);return {...x,...r};});
 await writeFile(target,JSON.stringify({group,model:data.model,usage:data.usage,reviewedAt:new Date().toISOString(),examples},null,2));console.log(JSON.stringify({group,count:examples.length,usage:data.usage}));
}}
await Promise.all([worker(),worker()]);
