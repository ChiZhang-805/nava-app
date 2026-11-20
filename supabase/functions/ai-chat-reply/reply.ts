import { replyFitsBudget, type AiReplyLanguage, type AiReplyMode } from "./prompt.ts";
import type { AiRoute } from "./router.ts";

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
