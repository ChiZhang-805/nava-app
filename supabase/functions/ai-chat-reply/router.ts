import { describeChatSticker } from "../_shared/chat-stickers.ts";
import type { ChatToneEmotion, ChatToneIntent } from "./tone-catalog-types.ts";

export type AiDomain = "sleep" | "exercise" | "mood" | "nutrition" | "focus" | "face" | "rhythm";

export type AiIntent = "record" | "advice" | "question" | "emotional_support" | "smalltalk";

export type AiLookbackDays = 1 | 3 | 6 | 7 | 14 | 30;

export type AiRoute = {
  intent: AiIntent;
  domains: AiDomain[];
  lookbackDays: AiLookbackDays;
  complexity: "simple" | "complex";
  source: "deterministic" | "model" | "fallback";
  toneIntent?: ChatToneIntent;
  toneEmotion?: ChatToneEmotion;
};

const domains: AiDomain[] = ["sleep", "exercise", "mood", "nutrition", "focus", "face", "rhythm"];

const domainPatterns: Record<AiDomain, RegExp> = {
  sleep: /睡|醒|失眠|困|熬夜|起床|入睡|睡眠|sleep|slept|wake|bedtime|tired/i,
  exercise: /运动|跑|走路|步数|健身|训练|骑行|游泳|心率|exercise|workout|steps?|walk|run|heart\s*rate/i,
  mood: /情绪|心情|压力|焦虑|难过|低落|开心|烦|崩溃|mood|stress|anxious|sad|happy/i,
  nutrition: /吃|喝|饮食|早餐|午餐|晚餐|热量|卡路里|鸡蛋|面包|营养|food|meal|eat|ate|calorie|kcal/i,
  focus: /专注|番茄钟|注意力|效率|学习|复习|工作效率|focus|pomodoro|study|productivity/i,
  face: /面部|皮肤|气色|肤色|黑眼圈|痘|皱纹|face|skin|complexion/i,
  rhythm: /节律|综合状态|整体状态|状态怎么样|健康趋势|rhythm|overall health|overall state/i,
};

export function buildDeterministicRoute(message: string, dataType?: unknown, extractedData?: unknown): AiRoute | null {
  const normalized = message.trim();
  if (describeChatSticker(normalized) !== null || isSmalltalk(normalized)) {
    return { intent: "smalltalk", domains: [], lookbackDays: 1, complexity: "simple", source: "deterministic" };
  }

  const selected = new Set<AiDomain>();
  addExtractedDomains(selected, dataType, extractedData);
  for (const domain of domains) if (domainPatterns[domain].test(normalized)) selected.add(domain);

  if (selected.size === 0) return null;
  const routedDomains = prioritizeDomains([...selected]);
  const hasExtractedRecord = dataType !== "unknown" && dataType != null && extractedData != null;
  const intent: AiIntent = hasExtractedRecord
    ? "record"
    : routedDomains.includes("mood") && /难受|低落|焦虑|崩溃|撑不住|sad|anxious|overwhelmed/i.test(normalized)
      ? "emotional_support"
      : /怎么|如何|建议|应该|可以吗|怎么办|what|how|should|advice/i.test(normalized)
        ? "advice"
        : "question";
  const lookbackDays = inferLookbackDays(normalized);
  return {
    intent,
    domains: routedDomains,
    lookbackDays,
    complexity: routedDomains.length > 1 || needsExplanation(normalized) ? "complex" : "simple",
    source: "deterministic",
  };
}

export function normalizeModelRoute(value: unknown): AiRoute {
  const item = record(value);
  const routedDomains = Array.isArray(item?.domains)
    ? prioritizeDomains(item.domains.filter((domain): domain is AiDomain => typeof domain === "string" && domains.includes(domain as AiDomain)))
    : [];
  const intent = isIntent(item?.intent) ? item.intent : "question";
  const requestedDays = Number(item?.lookbackDays ?? item?.lookback_days);
  const lookbackDays: AiLookbackDays = requestedDays >= 30
    ? 30
    : requestedDays >= 14
      ? 14
      : requestedDays >= 7
        ? 7
        : requestedDays >= 6
          ? 6
          : requestedDays >= 3
            ? 3
            : requestedDays <= 1
              ? 1
              : 7;
  return {
    intent,
    domains: routedDomains,
    lookbackDays,
    complexity: item?.complexity === "complex" || routedDomains.length > 1 ? "complex" : "simple",
    source: "model",
    ...(["greeting", "acknowledgment", "celebration", "humor", "romance", "support", "apology", "casual", "explanation"].includes(String(item?.toneIntent)) ? { toneIntent: item!.toneIntent as ChatToneIntent } : {}),
    ...(["upbeat", "neutral", "low", "anxious"].includes(String(item?.toneEmotion)) ? { toneEmotion: item!.toneEmotion as ChatToneEmotion } : {}),
  };
}

export function fallbackRoute(message: string): AiRoute {
  return {
    intent: /怎么|如何|建议|应该|what|how|should/i.test(message) ? "advice" : "question",
    domains: [],
    lookbackDays: 7,
    complexity: needsExplanation(message) ? "complex" : "simple",
    source: "fallback",
  };
}

export function routeSystemPrompt(lang: "zh" | "en") {
  if (lang === "en") {
    return `Classify one NAVA user message for context retrieval. Return JSON only.
Allowed domains: sleep, exercise, mood, nutrition, focus, face, rhythm. Choose at most 3 and only when relevant.
Allowed intent: record, advice, question, emotional_support, smalltalk.
lookbackDays must be 1, 3, 6, 7, 14, or 30. Use 7 for health records by default, 3/6 when explicitly requested, 1 only when the user explicitly asks to exclude historical comparison, and 14/30 only for explicit longer trend questions.
Use complex when the user explicitly requests an explanation, comparison, or step-by-step plan; ordinary emotional support and casual chat are simple. Do not invent a health domain for a greeting or sticker.
Romance/crush updates, jokes, OKK and XSWL are ordinary chat unless the message actually concerns health. Do not treat these words as health measurements or a saved record; select no health domains for that casual context.
Optional toneIntent: greeting, acknowledgment, celebration, humor, romance, support, apology, casual, explanation; toneEmotion: upbeat, neutral, low, anxious. Choose only from the actual context; an unknown expression or ambiguous scream is casual/neutral, not evidence of romance or distress. These hints never override safety or explicit style preferences.
JSON example: {"intent":"advice","domains":["sleep"],"lookbackDays":7,"complexity":"simple"}`;
  }
  return `对一条 NAVA 用户消息做上下文检索分类，只返回 JSON。
可选领域：sleep、exercise、mood、nutrition、focus、face、rhythm。最多选 3 个，只有相关时才选。
可选意图：record、advice、question、emotional_support、smalltalk。
lookbackDays 只能是 1、3、6、7、14、30；健康记录默认用 7，明确要求近 3 天或 6 天时使用对应天数，只有用户明确说不做历史比较时才用 1，明确询问更长趋势时才用 14/30。
明确要求解释、比较或分步骤计划时选 complex；普通情绪接话、闲聊选 simple，不为寒暄或贴纸凭空添加健康领域。
恋爱分享、crush、玩笑、OKK、XSWL 本身属于闲聊，不是健康指标或已保存的记录；没有实际健康内容时不选健康领域。有明确症状或健康问题时仍按实际内容分类。
可同时给 toneIntent：greeting、acknowledgment、celebration、humor、romance、support、apology、casual、explanation；toneEmotion：upbeat、neutral、low、anxious。只依据实际语境；陌生词或单独尖叫选 casual/neutral，不猜成恋爱或痛苦。这些风格提示不能覆盖安全边界或用户明确偏好。
JSON 示例：{"intent":"advice","domains":["sleep"],"lookbackDays":7,"complexity":"simple"}`;
}

function addExtractedDomains(selected: Set<AiDomain>, dataType: unknown, extractedData: unknown) {
  if (typeof dataType === "string" && domains.includes(dataType as AiDomain)) selected.add(dataType as AiDomain);
  if (dataType !== "multi") return;
  const records = record(extractedData)?.records;
  if (!Array.isArray(records)) return;
  for (const item of records) {
    const type = record(item)?.dataType ?? record(item)?.data_type;
    if (typeof type === "string" && domains.includes(type as AiDomain)) selected.add(type as AiDomain);
  }
}

function prioritizeDomains(values: AiDomain[]) {
  const unique = [...new Set(values)];
  if (unique.includes("rhythm") && unique.length > 1) unique.splice(unique.indexOf("rhythm"), 1);
  return unique.slice(0, 3);
}

function inferLookbackDays(message: string): AiLookbackDays {
  if (/一个月|30\s*天|近月|monthly|month/i.test(message)) return 30;
  if (/两周|14\s*天|半个月|fortnight|two weeks/i.test(message)) return 14;
  if (/(?:近|过去|最近)?\s*(?:七|7)\s*天|一周|week/i.test(message)) return 7;
  if (/(?:近|过去|最近)?\s*(?:六|6)\s*天/i.test(message)) return 6;
  if (/(?:近|过去|最近)?\s*(?:三|3)\s*天|three days/i.test(message)) return 3;
  if (/只看今天|只说今天|不要对比历史|不看历史|today only|no history/i.test(message)) return 1;
  if (/最近|这几天|一周|趋势|总是|一直|recent|week|trend|lately|often/i.test(message)) return 7;
  return 7;
}

function isSmalltalk(message: string) {
  return /^(hi|hello|hey|ok+k?|xswl|你好|嗨|哈喽|谢谢|谢啦|晚安|早安|在吗)[!！。.，,\s]*$/i.test(message);
}

export function needsExplanation(message: string) {
  return Array.from(message).length > 120 || /详细|展开|解释|分析|比较|区别|原理|步骤|为什么|explain|in detail|step.by.step|compare|difference|why\b/i.test(message);
}

function isIntent(value: unknown): value is AiIntent {
  return typeof value === "string" && ["record", "advice", "question", "emotional_support", "smalltalk"].includes(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
