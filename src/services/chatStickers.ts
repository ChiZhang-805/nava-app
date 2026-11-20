import { CHAT_STICKER_DEFINITIONS, parseChatStickerDefinition, type ChatStickerId, type ChatStickerCategory } from "../../supabase/functions/_shared/chat-stickers.ts";
export type { ChatStickerId, ChatStickerCategory };
export { describeChatSticker } from "../../supabase/functions/_shared/chat-stickers.ts";
export const CHAT_STICKER_IDS: readonly ChatStickerId[] = CHAT_STICKER_DEFINITIONS.map(sticker => sticker.id);
export const COMMON_CHAT_STICKER_IDS: readonly ChatStickerId[] = ["like", "happy", "hug", "well-done", "ok", "rest", "hello", "touched", "thanks", "laugh", "love", "here"];
export type ChatSticker = Readonly<{ id: ChatStickerId; label: string; labelEn: string; category: ChatStickerCategory; imageSrc: string }>;

const assetRoot = `${import.meta.env?.BASE_URL ?? "/"}stickers/fluent-flat/`;
export const CHAT_STICKERS: readonly ChatSticker[] = CHAT_STICKER_DEFINITIONS.map(sticker => ({ ...sticker, imageSrc: `${assetRoot}${sticker.id}.svg` }));

export function getChatSticker(id: string): ChatSticker | null {
  return CHAT_STICKERS.find(sticker => sticker.id === id) ?? null;
}

/** Messages store only a small allowlisted identifier; remote URLs and HTML are never decoded. */
export function encodeChatSticker(id: ChatStickerId): string {
  return `[nava-sticker:${id}]`;
}

export function parseChatSticker(content: string): ChatSticker | null {
  const sticker = parseChatStickerDefinition(content);
  return sticker ? getChatSticker(sticker.id) : null;
}

export function chatStickerLabel(sticker: ChatSticker, locale: "zh" | "en"): string {
  return locale === "en" ? sticker.labelEn : sticker.label;
}
