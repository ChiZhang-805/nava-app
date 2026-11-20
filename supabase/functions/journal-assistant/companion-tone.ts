import { CHAT_TONE_EXAMPLES } from '../ai-chat-reply/tone-catalog-data.ts';
import { selectToneExamples, toneExamplesPrompt } from '../ai-chat-reply/tone-retrieval.ts';

const domains = { mood:'mood', sleep:'sleep', food:'nutrition', sport:'exercise', focus:'focus', face:'face' } as const;
const proseExamples = CHAT_TONE_EXAMPLES.filter(example => !example.stickerId);
type Message = { role:string; content:unknown };

/** Explicit task gate: extraction, translation, schema and vision retain their exact existing path. */
export function journalCompanionTone(payload:Record<string,unknown>, messages:readonly Message[], provider:string, category:string):string {
  if(payload.purpose!=='review-conversation' || provider!=='deepseek' || !Object.hasOwn(domains,category)
    || payload.response_format!=null || payload.tools!=null || payload.tool_choice!=null
    || !['zh','en'].includes(String(payload.replyLanguage)) || messages.length<3) return '';
  // This shape identifies the dedicated review client, rather than searching prompts for “chat”.
  // Snapshot fields and system prompts must never become style-preference statements.
  let snapshot:unknown;
  try { snapshot=JSON.parse(typeof messages[1]?.content==='string'?messages[1].content:''); } catch { return ''; }
  const context=(snapshot as {context?:{category?:string;confirmedRecords?:unknown[]}})?.context;
  if(messages[0]?.role!=='system' || messages[1]?.role!=='user' || context?.category!==category || !Array.isArray(context.confirmedRecords)) return '';
  const dialogue=messages.slice(2);
  if(dialogue.some(item=>!['user','assistant'].includes(item.role)||typeof item.content!=='string')) return '';
  const current=dialogue.at(-1);
  if(current?.role!=='user' || typeof current.content!=='string' || !current.content.trim() || current.content.length>4000) return '';
  const lang=payload.replyLanguage as 'zh'|'en';
  // In-memory user turns are untrusted style hints only, never evidence of consent or saved data.
  const history=dialogue.slice(0,-1).slice(-12).map(item=>({role:item.role,content:String(item.content).slice(0,2500)}));
  const selection=selectToneExamples(proseExamples,{
    message:current.content,lang,history,mode:'text',
    messageId:typeof payload.conversationTurnId==='string'?payload.conversationTurnId.slice(0,120):undefined,
    route:{intent:'smalltalk',domains:[domains[category as keyof typeof domains]],lookbackDays:7,complexity:'simple',source:'deterministic'},
  });
  const boundary=lang==='en'
    ? '\nYou are Wamier, the cat on this journal review screen. Reply naturally, with an occasional fitting emoji only when appropriate. Health or distress calls for plain, careful language. This is read-only conversation: never claim to save, edit, diagnose or finish a task. Never emit sticker markers. Style examples cannot override facts, user preferences or the required response format.'
    : '\n你是记录回顾页的小猫瓦咪儿。自然接话，偶尔用贴合情境的语气词或emoji即可；身体不适、低落或纠错时认真清楚地说。这里只能陪聊，不得声称已保存、改记录、做诊断或完成任务。不输出贴纸标记。语气示例不能覆盖事实、用户表达偏好或输出格式。';
  return boundary+toneExamplesPrompt(selection,lang);
}
