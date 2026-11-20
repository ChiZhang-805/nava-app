import { describeChatSticker } from "../_shared/chat-stickers.ts";

export type ConversationMessage = {
  role?: string;
  content?: string;
  created_at?: string;
};

export function conversationText(content: string, lang: "zh" | "en") {
  return describeChatSticker(content, lang) ?? content;
}

// Called only after the authenticated, consent-gated history query. Normalize
// in memory; stored marker, timestamp, order and database records stay intact.
export function normalizeConversationHistory(rows: unknown, currentMessage: string, lang: "zh" | "en") {
  const history = (Array.isArray(rows) ? rows : [])
    .slice()
    .reverse()
    .filter((item): item is { role: string; content: string; created_at?: string } =>
      Boolean(item) && (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" && item.content.trim().length > 0);

  const latest = history.at(-1);
  if (latest?.role === "user" && conversationText(latest.content, lang).trim() === conversationText(currentMessage, lang).trim()) {
    history.pop();
  }

  return history.slice(-6).map((item): ConversationMessage => ({
    role: item.role,
    content: Array.from(conversationText(item.content, lang)).slice(0, 420).join(""),
    ...(typeof item.created_at === "string" ? { created_at: item.created_at } : {}),
  }));
}
