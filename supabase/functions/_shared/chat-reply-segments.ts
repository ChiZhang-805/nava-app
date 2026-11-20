import { CHAT_STICKER_DEFINITIONS, type ChatStickerId } from "./chat-stickers.ts";

export type ChatReplySegment = { type: "text"; text: string } | { type: "sticker"; id: ChatStickerId };
const prefix = "[nava-reply:v1]";

/** Transport/storage validation only; segment text remains untrusted text. */
export function validateChatReplySegments(value: unknown): ChatReplySegment[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const segments: ChatReplySegment[] = [];
  let stickers = 0;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (item.type === "text" && typeof item.text === "string" && item.text.trim() && item.text.length <= 6000) {
      segments.push({ type: "text", text: item.text.trim() });
    } else if (item.type === "sticker" && typeof item.id === "string") {
      const known = CHAT_STICKER_DEFINITIONS.find((sticker) => sticker.id === item.id);
      if (!known || ++stickers > 1) return null;
      segments.push({ type: "sticker", id: known.id });
    } else return null;
  }
  return segments.some((segment) => segment.type === "text") ? segments : null;
}

export function encodeChatReplySegments(value: ChatReplySegment[]): string {
  const segments = validateChatReplySegments(value);
  if (!segments) throw new Error("Invalid chat reply segments.");
  return `${prefix}${JSON.stringify(segments)}`;
}

export function decodeChatReplySegments(content: string): ChatReplySegment[] | null {
  if (!content.startsWith(prefix) || content.length > 25000) return null;
  try { return validateChatReplySegments(JSON.parse(content.slice(prefix.length))); }
  catch { return null; }
}

/** Old clients and spoken output receive complete text, never JSON or markers. */
export function chatReplySegmentsText(segments: ChatReplySegment[]): string {
  return segments.filter((segment) => segment.type === "text").map((segment) => segment.text).join("\n\n");
}

/** For authenticated assistant history only, never to execute user input. */
export function describeChatReplySegments(segments: ChatReplySegment[], locale: "zh" | "en" = "zh"): string {
  return segments.map((segment) => {
    if (segment.type === "text") return segment.text;
    const sticker = CHAT_STICKER_DEFINITIONS.find((item) => item.id === segment.id)!;
    return locale === "zh" ? `（助手发了表达「${sticker.label}」的表情。）` : `(The assistant sent a sticker expressing “${sticker.labelEn}”.)`;
  }).join("\n\n");
}
