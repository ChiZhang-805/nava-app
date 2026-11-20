import { replyFitsBudget, type AiReplyLanguage, type AiReplyMode } from "./prompt.ts";
import type { AiRoute } from "./router.ts";
import { chatReplySegmentsText, validateChatReplySegments, type ChatReplySegment } from "../_shared/chat-reply-segments.ts";

export type ModelReply = { text: string; finishReason?: unknown };

export function completeModelText(reply: ModelReply): string {
  const text = reply.text.trim();
  if (!text) throw new Error("真实 AI 服务没有返回有效内容，请重试。");
  // The provider's terminal state is authoritative; punctuation cannot turn a
  // token-limited fragment into a complete answer. Custom providers may omit it.
  if (reply.finishReason != null && reply.finishReason !== "stop") {
    throw new Error("这次回复没有完整生成，请再试一次。");
  }
  return text;
}

export async function resolveCompleteReply(
  original: ModelReply,
  lang: AiReplyLanguage,
  route: AiRoute,
  mode: AiReplyMode,
  rewrite: () => Promise<ModelReply>,
): Promise<string> {
  const text = completeModelText(original);
  if (replyFitsBudget(text, lang, route, mode)) return text;
  try {
    const revised = completeModelText(await rewrite());
    if (replyFitsBudget(revised, lang, route, mode)) return revised;
  } catch {
    // A failed optional shortening pass must not lose the complete original,
    // especially its final caveat or safety guidance. Never take an excerpt.
  }
  return text;
}

export function parseSegmentedModelReply(reply: ModelReply): ChatReplySegment[] {
  const text = completeModelText(reply);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("回复格式不完整，请再试一次。"); }
  const segments = validateChatReplySegments(value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).segments : null);
  if (!segments) throw new Error("回复格式不完整，请再试一次。");
  return segments;
}

export async function resolveSegmentedReply(
  original: ModelReply, lang: AiReplyLanguage, route: AiRoute,
  rewrite: () => Promise<ModelReply>,
): Promise<ChatReplySegment[]> {
  // Reject incomplete provider output before considering a format repair.
  completeModelText(original);
  let segments: ChatReplySegment[];
  try { segments = parseSegmentedModelReply(original); }
  catch {
    // One bounded repair; no raw JSON, partial prose or fixed fallback reaches UI.
    return parseSegmentedModelReply(await rewrite());
  }
  if (replyFitsBudget(chatReplySegmentsText(segments), lang, route, "text")) return segments;
  try {
    const revised = parseSegmentedModelReply(await rewrite());
    if (replyFitsBudget(chatReplySegmentsText(revised), lang, route, "text")) return revised;
  } catch { /* Preserve every part of the complete original if shortening fails. */ }
  return segments;
}
