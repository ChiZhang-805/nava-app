/** One allowlist for the bundled picker, persisted markers, and model-facing descriptions. */
export const CHAT_STICKER_DEFINITIONS = [
  { id: "like", label: "赞呀", labelEn: "Nice!", category: "reply" },
  { id: "happy", label: "好开心", labelEn: "So happy", category: "mood" },
  { id: "hug", label: "抱抱", labelEn: "A hug", category: "company" },
  { id: "well-done", label: "辛苦啦", labelEn: "Well done", category: "company" },
  { id: "ok", label: "收到啦", labelEn: "Got it", category: "reply" },
  { id: "rest", label: "歇一会儿", labelEn: "Time to rest", category: "daily" },
  { id: "hello", label: "嗨呀", labelEn: "Hello!", category: "company" },
  { id: "touched", label: "有点感动", labelEn: "Feeling touched", category: "mood" },
  { id: "thanks", label: "谢谢你", labelEn: "Thank you", category: "company" },
  { id: "laugh", label: "笑出声", labelEn: "So funny", category: "mood" },
  { id: "love", label: "好喜欢", labelEn: "Love it", category: "mood" },
  { id: "here", label: "我在呢", labelEn: "I'm here", category: "company" },
  { id: "surprised", label: "哇呀", labelEn: "Wow!", category: "mood" },
  { id: "sad", label: "有点难过", labelEn: "Feeling sad", category: "mood" },
  { id: "tired", label: "累啦", labelEn: "So tired", category: "daily" },
  { id: "sleepy", label: "困困的", labelEn: "Sleepy", category: "daily" },
  { id: "worried", label: "有点担心", labelEn: "A little worried", category: "mood" },
  { id: "angry", label: "有点生气", labelEn: "A little angry", category: "mood" },
  { id: "confused", label: "有点懵", labelEn: "Confused", category: "mood" },
  { id: "relieved", label: "松口气", labelEn: "What a relief", category: "mood" },
  { id: "celebrate", label: "庆祝一下", labelEn: "Let's celebrate", category: "reply" },
  { id: "cheer", label: "加油呀", labelEn: "You can do it", category: "company" },
  { id: "water", label: "喝口水", labelEn: "Drink some water", category: "daily" },
  { id: "meal", label: "好好吃饭", labelEn: "Time to eat", category: "daily" },
  { id: "coffee", label: "来杯热饮", labelEn: "A warm drink", category: "daily" },
  { id: "relax", label: "放松一下", labelEn: "Relax", category: "daily" },
  { id: "good-night", label: "晚安啦", labelEn: "Good night", category: "daily" },
  { id: "think", label: "想一想", labelEn: "Thinking", category: "reply" },
  { id: "yes", label: "好呀", labelEn: "Yes", category: "reply" },
  { id: "sorry", label: "抱歉啦", labelEn: "Sorry", category: "company" },
] as const;

export type ChatStickerDefinition = typeof CHAT_STICKER_DEFINITIONS[number];
export type ChatStickerId = ChatStickerDefinition["id"];
export type ChatStickerCategory = ChatStickerDefinition["category"];

/** Only a complete known marker is media; unknown or mixed text remains ordinary user text. */
export function parseChatStickerDefinition(content: string): ChatStickerDefinition | null {
  const match = /^\[nava-sticker:([a-z-]+)\]$/.exec(content.trim());
  return match ? CHAT_STICKER_DEFINITIONS.find(sticker => sticker.id === match[1]) ?? null : null;
}

/** Static semantic data, not instructions; never echo unknown ids into the model description. */
export function describeChatSticker(content: string, locale: "zh" | "en" = "zh"): string | null {
  const sticker = parseChatStickerDefinition(content);
  if (!sticker) return null;
  return locale === "en" ? `The user sent a sticker expressing “${sticker.labelEn}”.` : `用户发了一个表达「${sticker.label}」的表情。`;
}
