import BottomSheet from "./BottomSheet";
import { useLocale } from "../i18n";
import { CHAT_STICKERS, chatStickerLabel, type ChatSticker } from "../services/chatStickers";
import "./chat-sticker-picker.css";

type ChatStickerPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (sticker: ChatSticker) => void;
  disabled?: boolean;
};

/** Choosing a sticker only reports the selection; the chat owns message persistence and sending. */
export default function ChatStickerPicker({ open, onClose, onSelect, disabled = false }: ChatStickerPickerProps) {
  const { locale } = useLocale();
  if (!open) return null;
  const title = locale === "en" ? "Say it with a sticker" : "用表情说说吧";
  return <BottomSheet label={title} closeLabel={locale === "en" ? "Close stickers" : "关闭表情"} onClose={onClose} className="chat-sticker-picker">
    <header className="chat-sticker-picker-header">
      <h2>{title}</h2>
      <p>{locale === "en" ? "Pick one to send" : "点一下，就把心情送过去"}</p>
    </header>
    <div className="chat-sticker-grid" aria-label={locale === "en" ? "Stickers" : "表情"}>
      {CHAT_STICKERS.map(sticker => {
        const label = chatStickerLabel(sticker, locale);
        return <button key={sticker.id} type="button" className="chat-sticker-choice" disabled={disabled} aria-label={locale === "en" ? `Send ${label}` : `发送${label}表情`} onClick={() => onSelect(sticker)} data-sticker-id={sticker.id}>
          <img src={sticker.imageSrc} alt="" width="56" height="56" draggable={false} />
          <span>{label}</span>
        </button>;
      })}
    </div>
  </BottomSheet>;
}
