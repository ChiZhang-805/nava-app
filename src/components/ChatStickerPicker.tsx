import { useState } from "react";
import BottomSheet from "./BottomSheet";
import { useLocale } from "../i18n";
import { CHAT_STICKERS, COMMON_CHAT_STICKER_IDS, chatStickerLabel, type ChatSticker, type ChatStickerCategory } from "../services/chatStickers";
import "./chat-sticker-picker.css";

type ChatStickerPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (sticker: ChatSticker) => void;
  disabled?: boolean;
};

const categories: readonly { id: ChatStickerCategory | "common"; zh: string; en: string }[] = [
  { id: "common", zh: "常用", en: "Common" },
  { id: "mood", zh: "心情", en: "Moods" },
  { id: "company", zh: "陪伴", en: "Care" },
  { id: "daily", zh: "日常", en: "Daily" },
  { id: "reply", zh: "回应", en: "Replies" },
];

/** Choosing a sticker only reports the selection; the chat owns message persistence and sending. */
export default function ChatStickerPicker({ open, onClose, onSelect, disabled = false }: ChatStickerPickerProps) {
  const { locale } = useLocale();
  const [category, setCategory] = useState<ChatStickerCategory | "common">("common");
  if (!open) return null;
  const title = locale === "en" ? "Say it with a sticker" : "用表情说说吧";
  const visible = CHAT_STICKERS.filter(sticker => category === "common" ? COMMON_CHAT_STICKER_IDS.includes(sticker.id) : sticker.category === category);
  return <BottomSheet label={title} closeLabel={locale === "en" ? "Close stickers" : "关闭表情"} onClose={onClose} className="chat-sticker-picker">
    <header className="chat-sticker-picker-header">
      <h2>{title}</h2>
      <p>{locale === "en" ? "Pick one to send" : "点一下，就把心情送过去"}</p>
    </header>
    <div className="chat-sticker-categories" role="group" aria-label={locale === "en" ? "Sticker categories" : "表情分类"}>
      {categories.map(item => <button key={item.id} type="button" data-sticker-category={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{locale === "en" ? item.en : item.zh}</button>)}
    </div>
    <div className="chat-sticker-grid" aria-label={locale === "en" ? "Stickers" : "表情"}>
      {visible.map(sticker => {
        const label = chatStickerLabel(sticker, locale);
        return <button key={sticker.id} type="button" className="chat-sticker-choice" disabled={disabled} aria-label={locale === "en" ? `Send ${label}` : `发送${label}表情`} onClick={() => onSelect(sticker)} data-sticker-id={sticker.id}>
          <img src={sticker.imageSrc} alt="" width="56" height="56" draggable={false} />
          <span>{label}</span>
        </button>;
      })}
    </div>
  </BottomSheet>;
}
