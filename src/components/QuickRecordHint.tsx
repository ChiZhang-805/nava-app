import { useEffect, useState } from 'react';

/** A short invitation; the swipe gesture remains available after it fades. */
export default function QuickRecordHint({ open, locale, onToggle }: { open: boolean; locale: 'zh' | 'en'; onToggle: () => void }) {
  const [expired, setExpired] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  const hidden = expired && !open && !focused;
  return <button className="home-record-shortcut-hint" type="button"
    data-expired={hidden} data-open={open} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}
    aria-expanded={open} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={onToggle}>
    {open ? (locale === 'zh' ? '收起记录入口' : 'Hide shortcuts') : (locale === 'zh' ? '向上轻滑 · 快速记录' : 'Swipe up · Quick record')}
  </button>;
}
