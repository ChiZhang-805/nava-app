import { Camera, Images, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../i18n";

export default function AvatarPicker({ onClose, onCamera, onLibrary }: {
  onClose: () => void; onCamera: () => void; onLibrary: () => void;
}) {
  const { locale, t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const id = useId();
  const host = document.querySelector(".phone-frame") ?? document.body;
  useEffect(() => {
    const previous = document.activeElement;
    const siblings = [...host.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root.current);
    const inert = siblings.map((node) => node.inert);
    siblings.forEach((node) => { node.inert = true; });
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === buttons.length - 1)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      siblings.forEach((node, index) => { node.inert = inert[index]; });
      document.removeEventListener("keydown", key);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [host]);
  return createPortal(<div ref={root} className="avatar-sheet-overlay avatar-picker-overlay" onClick={onClose}>
    <section className="avatar-sheet avatar-picker" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(event) => event.stopPropagation()}>
      <header><h2 id={id}>{t("profile.changeAvatar")}</h2><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={20} /></button></header>
      <div className="avatar-sheet-actions">
        <button type="button" onClick={() => { onCamera(); onClose(); }}><Camera size={24} /><span>{locale === "zh" ? "拍照" : "Take photo"}</span></button>
        <button type="button" onClick={() => { onLibrary(); onClose(); }}><Images size={24} /><span>{locale === "zh" ? "从相册选择" : "Photo library"}</span></button>
      </div>
    </section>
  </div>, host);
}
