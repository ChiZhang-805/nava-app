import { describeChatSticker } from "../_shared/chat-stickers.ts";
import { decodeChatReplySegments, describeChatReplySegments } from "../_shared/chat-reply-segments.ts";

export type ConversationMessage = {
  id?: string;
  role?: string;
  content?: string;
  created_at?: string;
};

export function optionalConversationId(value: unknown, field: "archiveId" | "messageId") {
  if (value == null) return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

export function conversationText(content: string, lang: "zh" | "en", role: "user" | "assistant" = "user") {
  const segments = role === "assistant" ? decodeChatReplySegments(content) : null;
  if (segments) return describeChatReplySegments(segments, lang);
  return describeChatSticker(content, lang) ?? content;
}

// Called only after the authenticated, consent-gated history query. Normalize
// in memory; stored marker, timestamp, order and database records stay intact.
export function normalizeConversationHistory(
  rows: unknown, currentMessage: string, lang: "zh" | "en",
  options: { oldestFirst?: boolean; currentMessageId?: string } = {},
) {
  const history = (Array.isArray(rows) ? rows : [])
    .slice()
    .filter((item): item is { id?: string; role: string; content: string; created_at?: string } =>
      Boolean(item) && (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" && item.content.trim().length > 0);
  if (!options.oldestFirst) history.reverse();

  const currentText = conversationText(currentMessage, lang).trim();
  if (options.currentMessageId) {
    // The authenticated query already scopes these IDs. Attachment/photo
    // display text can legitimately differ from the model's current message.
    const index = history.findIndex((item) => item.id === options.currentMessageId && item.role === "user");
    if (index >= 0) history.splice(index, 1);
  } else {
    const latest = history.at(-1);
    if (latest?.role === "user" && conversationText(latest.content, lang).trim() === currentText) history.pop();
  }

  return history.slice(-6).map((item): ConversationMessage => ({
    role: item.role,
    content: Array.from(conversationText(item.content, lang, item.role as "user" | "assistant")).slice(0, 420).join(""),
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    ...(typeof item.created_at === "string" ? { created_at: item.created_at } : {}),
  }));
}
