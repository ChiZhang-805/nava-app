import type { ChatMessage } from "../types";
import { chatReplySegmentsText, decodeChatReplySegments, type ChatReplySegment } from "../../supabase/functions/_shared/chat-reply-segments.ts";
import { parseChatSticker } from "./chatStickers.ts";

export function chatMessageParts(message: ChatMessage): ChatReplySegment[] {
  if (message.role === "assistant") {
    const structured = decodeChatReplySegments(message.content);
    if (structured) return structured;
  }
  const sticker = parseChatSticker(message.content);
  return sticker ? [{ type: "sticker", id: sticker.id }] : [{ type: "text", text: message.content }];
}

export function spokenAssistantMessage(content: string) {
  const structured = decodeChatReplySegments(content);
  return structured ? chatReplySegmentsText(structured) : content;
}
