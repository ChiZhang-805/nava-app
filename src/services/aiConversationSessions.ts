import type { ChatMessage } from "../types";

export type ConversationSnapshot = {
  id: string;
  createdAt: string;
  dayKey: string;
  title: string;
  messages: ChatMessage[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function conversationDayKey(messages: ChatMessage[], fallback = new Date()) {
  const timestamp = messages.find((message) => Number.isFinite(new Date(message.created_at).getTime()))?.created_at;
  return timestamp ? localDayKey(new Date(timestamp)) : localDayKey(fallback);
}

export function conversationArchiveId(messages: ChatMessage[]) {
  const stableId = messages.find((message) => uuidPattern.test(message.id))?.id;
  return stableId ?? crypto.randomUUID();
}

export function fallbackConversationTitle(
  dayKey: string,
  locale: "zh" | "en",
  existing: Array<Pick<ConversationSnapshot, "dayKey">>,
) {
  const sameDayCount = existing.filter((snapshot) => snapshot.dayKey === dayKey).length;
  const [, month = "", day = ""] = dayKey.split("-");
  if (locale === "zh") {
    const suffix = sameDayCount === 0 ? "" : sameDayCount === 1 ? "之二" : `之${sameDayCount + 1}`;
    return `${Number(month)}月${Number(day)}日 AI 对话${suffix}`;
  }
  return `${Number(month)}/${Number(day)} AI chat${sameDayCount === 0 ? "" : ` ${sameDayCount + 1}`}`;
}

export function normalizeGeneratedConversationTitle(value: string, locale: "zh" | "en") {
  const cleaned = value
    .replace(/^(?:标题|会话标题|title|conversation title)\s*[:：-]?\s*/i, "")
    .replace(/[“”"'‘’`《》<>【】[\]（）()。！!？?，,：:；;、]/g, "")
    .replace(/\s+/g, locale === "zh" ? "" : " ")
    .trim();
  if (locale === "zh") {
    const characters = Array.from(cleaned).filter((character) => /[\p{Script=Han}A-Za-z0-9]/u.test(character));
    return characters.length >= 6 ? characters.slice(0, 10).join("") : null;
  }
  const words = cleaned.split(" ").filter(Boolean);
  return words.length >= 2 ? words.slice(0, 6).join(" ") : null;
}

export function conversationNeedsDailyRollover(messages: ChatMessage[], currentDay = localDayKey()) {
  if (messages.length === 0) return false;
  return conversationDayKey(messages) !== currentDay;
}

const conversationGreetings = {
  zh: [
    "嗨，很高兴今天又见到你。昨晚睡得怎么样，有没有哪一点想先聊聊？",
    "你好呀，今天想先从哪件事开始？吃饭、运动，还是现在的心情？",
    "嗨，我在这儿陪你看看今天的状态。现在最想改善的是精力、专注还是休息？",
    "你好，新的对话开始啦。今天吃得怎么样，有没有一餐想让我帮你一起梳理？",
    "嗨，今天身体和心情各打几分？你也可以先说最明显的感受。",
  ],
  en: [
    "Hi, it is good to see you today. How did you sleep, and what would you like to talk through first?",
    "Hello! Where should we begin today: food, movement, or how you are feeling?",
    "Hi, I am here to check in with you. Would you most like to improve energy, focus, or rest today?",
    "Welcome to a fresh chat. How has eating felt today, and is there a meal you want to review together?",
    "Hi! What score would you give your body and mood today, and what feels most noticeable?",
  ],
} as const;

export function buildConversationGreeting(locale: "zh" | "en", seed = Date.now()) {
  const options = conversationGreetings[locale];
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return options[safeSeed % options.length];
}
