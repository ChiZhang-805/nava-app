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
