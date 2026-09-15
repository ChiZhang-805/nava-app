import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Share2, X } from "lucide-react";
import { publicShareUrl } from "../services/publicShareUrl";
import "../styles/report-share-preview.css";

export default function LinkSharePreview({ locale, onClose }: { locale: "zh" | "en"; onClose: () => void }) {
  const zh = locale === "zh";
  const [url] = useState(() => publicShareUrl(window.location.href));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const closeAction = useRef(onClose); closeAction.current = onClose;
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const host = document.querySelector(".phone-frame") ?? document.body;
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    const siblings = [...host.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root.current);
    const inert = siblings.map((node) => node.inert); siblings.forEach((node) => { node.inert = true; });
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busyRef.current) closeAction.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === buttons.length - 1))) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { mounted.current = false; siblings.forEach((node, index) => { node.inert = inert[index]; }); document.removeEventListener("keydown", key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [host]);
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setStatus("");
    try {
      if (navigator.share) { await navigator.share({ title: "NAVA", url }); if (mounted.current) onClose(); }
      else { await navigator.clipboard.writeText(url); if (mounted.current) setStatus(zh ? "公开入口链接已复制。" : "Public app link copied."); }
    } catch (cause) { if (mounted.current && (cause as DOMException)?.name !== "AbortError") setStatus(zh ? "未能分享，请重试。" : "Sharing failed. Please retry."); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  return createPortal(<div ref={root} className="report-share-overlay link-share-overlay" role="dialog" aria-modal="true" aria-labelledby="link-share-title">
    <section className="report-share-sheet"><header><h2 id="link-share-title">{zh ? "分享 NAVA" : "Share NAVA"}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={zh ? "关闭分享预览" : "Close share preview"}><X size={21} /></button></header>
      <div className="report-share-content"><p>{zh ? "仅分享公开 APP 入口，不包含当前页面、账号、日期、记录或 AI 对话。" : "Only the public app link is shared, without your page, account, dates, records or conversations."}</p><p className="link-share-url"><Link size={18} />{url}</p>{status && <p role="status">{status}</p>}</div>
      <footer><button type="button" disabled={busy} onClick={() => void confirm()}><Share2 size={20} />{zh ? "确认分享链接" : "Confirm share link"}</button></footer>
    </section></div>, host);
}
