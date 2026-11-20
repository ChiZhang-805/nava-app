export const CHAT_STICKER_IDS = ["like", "happy", "hug", "well-done", "ok", "rest", "hello", "touched", "thanks", "laugh", "love", "here"] as const;
export type ChatStickerId = typeof CHAT_STICKER_IDS[number];
export type ChatSticker = Readonly<{ id: ChatStickerId; label: string; labelEn: string; imageSrc: string }>;

const assetRoot = `${import.meta.env?.BASE_URL ?? "/"}stickers/fluent-flat/`;
const labels: Readonly<Record<ChatStickerId, readonly [string, string]>> = {
  like: ["赞呀", "Nice!"], happy: ["好开心", "So happy"], hug: ["抱抱", "A hug"],
  "well-done": ["辛苦啦", "Well done"], ok: ["收到啦", "Got it"], rest: ["歇一会儿", "Time to rest"],
  hello: ["嗨呀", "Hello!"], touched: ["有点感动", "Feeling touched"], thanks: ["谢谢你", "Thank you"],
  laugh: ["笑出声", "So funny"], love: ["好喜欢", "Love it"], here: ["我在呢", "I'm here"],
};

export const CHAT_STICKERS: readonly ChatSticker[] = CHAT_STICKER_IDS.map(id => ({ id, label: labels[id][0], labelEn: labels[id][1], imageSrc: `${assetRoot}${id}.svg` }));

export function getChatSticker(id: string): ChatSticker | null {
  return CHAT_STICKERS.find(sticker => sticker.id === id) ?? null;
}

/** Messages store only a small allowlisted identifier; remote URLs and HTML are never decoded. */
export function encodeChatSticker(id: ChatStickerId): string {
  return `[nava-sticker:${id}]`;
}

export function parseChatSticker(content: string): ChatSticker | null {
  const match = /^\[nava-sticker:([a-z-]+)\]$/.exec(content.trim());
  return match ? getChatSticker(match[1]) : null;
}

export function chatStickerLabel(sticker: ChatSticker, locale: "zh" | "en"): string {
  return locale === "en" ? sticker.labelEn : sticker.label;
}
