import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, X } from "lucide-react";
import { createReportShareImage, sharePreparedReportImage, type ReportCardOptions } from "../services/reportShareCard";
import "../styles/report-share-preview.css";

export default function ReportSharePreview({ options, onClose, onComplete }: {
  options: ReportCardOptions; onClose: () => void; onComplete: () => void;
}) {
  const [includeDates, setDates] = useState(false);
  const [includeInsights, setInsights] = useState(false);
  const [preview, setPreview] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const zh = options.locale === "zh";
  const key = `${includeDates}:${includeInsights}:${retry}`;
  const current = preview?.key === key ? preview : null;
  const host = document.querySelector(".phone-frame") ?? document.body;
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    const siblings = [...host.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root.current);
    const inert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    close.current?.focus();
    return () => {
      mounted.current = false;
      siblings.forEach((element, index) => { element.inert = inert[index]; });
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [host]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // Native share dialogs may return keyboard focus to body, outside this portal.
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
      if (event.key === "Tab") {
        const targets = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
        const index = targets.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); event.stopPropagation(); targets[targets.length - 1]?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === targets.length - 1)) { event.preventDefault(); event.stopPropagation(); targets[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [busy, onClose]);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setError(false);
    void createReportShareImage({ ...options, includeDates, includeInsights }).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ key, blob, url });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [options, includeDates, includeInsights, key]);
  const confirm = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError(false);
    try {
      await sharePreparedReportImage(current.blob, { ...options, includeDates, includeInsights });
      if (mounted.current) onComplete();
    } catch (cause) {
      if (mounted.current && (cause as DOMException)?.name !== "AbortError") setError(true);
    } finally { if (mounted.current) setBusy(false); }
  };
  return createPortal(<div ref={root} className="report-share-overlay" role="dialog" aria-modal="true" aria-labelledby="report-share-title" onKeyDown={(event) => event.stopPropagation()}>
    <div className="report-share-sheet">
      <header><h2 id="report-share-title">{zh ? "分享前确认" : "Review before sharing"}</h2><button ref={close} type="button" disabled={busy} onClick={onClose} aria-label={zh ? "关闭分享预览" : "Close share preview"}><X size={21} /></button></header>
      <div className="report-share-content">
        <p>{zh ? "图片含健康数值。不会加入账号、照片原图或日记；请确认愿意分享的内容。" : "The image contains health values, but no account details, original photos or journal. Review what you want to share."}</p>
        <label><input type="checkbox" checked={includeDates} disabled={busy} onChange={(event) => { setDates(event.target.checked); if (!event.target.checked) setInsights(false); }} />{zh ? "包含具体日期" : "Include calendar dates"}</label>
        <label><input type="checkbox" checked={includeInsights} disabled={busy || !options.insights.length} onChange={(event) => { setInsights(event.target.checked); if (event.target.checked) setDates(true); }} />{zh ? "包含洞察摘要" : "Include insights"}</label>
        <p className="report-share-privacy-note">{zh ? "摘要可能含日期和生活细节，开启时会包含日期；关闭日期也会移除摘要。" : "Insights may contain dates and personal details. Enabling them includes dates; hiding dates also removes insights."}</p>
        {current ? <img src={current.url} alt={zh ? "即将分享的完整海报" : "Exact image to be shared"} /> : !error && <p role="status">{zh ? "正在生成预览…" : "Preparing preview…"}</p>}
        {error && <div role="alert"><p>{zh ? "图片生成或分享失败，没有确认完成。请重试或关闭。" : "Image preparation or sharing failed. Retry or close."}</p><button type="button" disabled={busy} onClick={() => setRetry(retry + 1)}>{zh ? "重新生成" : "Retry preview"}</button></div>}
      </div>
      <footer><button type="button" disabled={!current || busy} onClick={() => void confirm()}><Share2 size={20} />{busy ? (zh ? "正在分享…" : "Sharing…") : (zh ? "确认并分享 / 保存" : "Confirm & share / save")}</button></footer>
    </div>
  </div>, host);
}
