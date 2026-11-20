// Opt-in, bounded NAVA-only provider use. Generated examples are candidates,
// never scraped conversations and never automatically installed into production.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (!process.argv.includes('--paid-run')) throw new Error('Explicit --paid-run required');
const apiKey = process.env.DEEPSEEK_API_KEY_NAVA;
if (!apiKey) throw new Error('DEEPSEEK_API_KEY_NAVA missing; no account fallback');
const output = resolve('Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/chat-tone-candidates');
await mkdir(output, { recursive: true });
const groups = [
  ['greeting','neutral','早安、晚上回来、出门、睡前道别、间隔很久回来；自然不过度关心，不假装等待了一整天'],
  ['acknowledgment','neutral','答应、知道啦、暂停、改天聊、让对方继续、纠正理解。小写okk/okkk/okkkk～仅占约四分之一，其他用自然中文'],
  ['celebration','upbeat','考试过关、拿offer、完成一件小事、做饭成功、突破运动纪录、早睡达成；具体回应细节，不夸大'],
  ['humor','upbeat','用户讲清楚是好笑的日常尴尬、宠物、闹钟、打工小插曲；允许xswl/笑鼠/绷不住/显眼包/离谱，约三分之一不玩梗'],
  ['romance','upbeat','用户和现实中的crush恋爱、约会、收到表白、暧昧好消息；可啊啊啊啊/哇塞再问一件具体事，不称用户宝宝，不把自己当对象'],
  ['support','low','失落、累、失约、面试失败、被误会、只想吐槽；不强行建议，不鸡汤，不玩梗，不假定抑郁，不自称有类似经历'],
  ['support','anxious','普通紧张、面试前、消息没回、怕迟到、任务太多；温柔具体，避免保证结果和诊断，不玩梗'],
  ['apology','neutral','助手听错、误解、忘了用户刚说的偏好、话太多、太正式；承认具体错误并改，不推卸给系统'],
  ['casual','neutral','午饭、天气、散步、通勤、周末、电影、游戏、打扫、兴趣；接住细节，不把每件事变成健康课'],
  ['casual','upbeat','猫咪语气的玩笑、下班去班味、给自己买礼物、松弛一下、手搓小作品、水灵灵出门；虚拟猫不声称真有身体生活'],
  ['explanation','neutral','用户想弄懂一个生活问题、比较两种选择、做一个简单计划；清楚回答再小补充，不以语气牺牲事实，不做医疗建议'],
  ['casual','neutral','用户明确说不喜欢表情、不喜欢网络词、不喜欢亲昵称呼，希望普通话；所有回复plain/casual，不带emoji缩写颜文字'],
];
const features = new Set(['slang','emoji','kaomoji','pet-name','affection','dialect']);
const registers = new Set(['plain','casual','playful','gentle']);
let cursor = 0;
const summaries = [];
async function worker() {
  while (cursor < groups.length) {
    const index = cursor++, [intent, emotion, theme] = groups[index];
    const file = resolve(output, `group-${String(index+1).padStart(2,'0')}.json`);
    try { const old=JSON.parse(await readFile(file,'utf8')); if(old.examples?.length>=30){summaries.push({group:index+1,cached:true,count:old.examples.length});continue;} } catch {}
    const start = performance.now();
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(180000),
      body:JSON.stringify({model:'deepseek-v4-flash',thinking:{type:'disabled'},temperature:1.0,max_tokens:7200,response_format:{type:'json_object'},messages:[
        {role:'system',content:'你是中文对话编辑，为虚拟猫伴侣瓦咪儿编写原创语气参考，不是抓取真人聊天。返回JSON对象examples数组，正好36条，每条{context:string,response:string[],register:plain|casual|playful|gentle,features:string[]}。context写明确具体的用户消息与必要前提，20–60字。response为1–3个独立自然聊天气泡，每条2–40字。至少一半含2–3气泡。情绪可以鲜活，但不是每条都追问、祝福、说教、叠字或表情。不允许重复模板换名词，不逐字搬任何网上聊天。禁止链接/手机号/医疗诊断/伪造保存记录/冒充真人/编造共同经历。features必须准确标出slang/emoji/kaomoji/pet-name/affection/dialect，没有则[]。不要使用亲昵称呼或方言，本批不需要。不要解释JSON。'},
        {role:'user',content:`本批意图${intent}，情绪${emotion}。36个不同场景：${theme}。只要可审核的原创例子，不能宣称为流行语调查结论。`},
      ]}),
    });
    if(!response.ok) throw new Error(`NAVA model HTTP ${response.status} in group ${index+1}`);
    const payload=await response.json();
    if(payload.choices?.[0]?.finish_reason!=='stop') throw new Error(`Incomplete group ${index+1}`);
    const raw=JSON.parse(payload.choices[0].message.content).examples;
    if(!Array.isArray(raw)||raw.length<30||raw.length>40)throw new Error(`Wrong candidate count for ${index+1}`);
    const examples=raw.map((x,i)=>{
      if(typeof x.context!=='string'||x.context.length>180||!Array.isArray(x.response)||x.response.length<1||x.response.length>3||!x.response.every(s=>typeof s==='string'&&s.trim()&&s.length<=110)||!registers.has(x.register)||!Array.isArray(x.features)||!x.features.every(f=>features.has(f)))throw new Error(`Invalid candidate ${index+1}:${i}`);
      return {id:`zh-${intent}-${String(index+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,locale:'zh',intent,emotion,register:x.register,features:x.features,context:x.context,response:x.response,source:{kind:'authored',note:'模型辅助原创语境例句，非真实用户聊天；经规则校验与抽样审读。',year:2026}};
    });
    const result={group:index+1,generatedAt:new Date().toISOString(),model:payload.model,usage:payload.usage,latencyMs:Math.round(performance.now()-start),examples};
    await writeFile(file,JSON.stringify(result,null,2));
    summaries.push({group:index+1,count:examples.length,usage:payload.usage,latencyMs:result.latencyMs});
    console.log(JSON.stringify(summaries.at(-1)));
  }
}
await Promise.all([worker(),worker()]);
await writeFile(resolve(output,'generation-summary.json'),JSON.stringify(summaries,null,2));
