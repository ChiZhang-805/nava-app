import type { ChatStickerId } from "../_shared/chat-stickers.ts";

export type ChatToneIntent = "greeting" | "acknowledgment" | "celebration" | "humor" | "romance" | "support" | "apology" | "casual" | "explanation";
export type ChatToneEmotion = "upbeat" | "neutral" | "low" | "anxious";
export type ChatToneFeature = "slang" | "emoji" | "kaomoji" | "pet-name" | "affection" | "dialect";
export type ChatToneExample = {
  id: string;
  locale: "zh" | "en";
  intent: ChatToneIntent;
  emotion: ChatToneEmotion;
  register: "plain" | "casual" | "playful" | "gentle";
  features: readonly ChatToneFeature[];
  /** Applicability scenario, not a fabricated fact about the current user. */
  context: string;
  response: readonly string[];
  stickerId?: ChatStickerId;
  source: { kind: "authored" | "user-preference" | "researched"; note?: string; url?: string; year?: number };
};
