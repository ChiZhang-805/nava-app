import { ArrowLeft, Check, ChevronRight, Languages, MoreHorizontal } from "lucide-react";
import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useLocale } from "../i18n";
import type { LocalePreference } from "../services/localePreference";

function menuItems(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return child;
    if (child.type === Fragment) return cloneElement(child, {}, menuItems(child.props.children));
    return child.type === "button" ? cloneElement(child as React.ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>, { role: "menuitem" }) : child;
  });
}

/** Every page-level ellipsis shares geometry, language settings and keyboard behavior. */
export default function MoreMenu({ open, onOpenChange, label, className = "", buttonClassName = "", children }: {
  open: boolean; onOpenChange: (open: boolean) => void; label: string;
  className?: string; buttonClassName?: string; children?: ReactNode;
}) {
  const { locale, preference, setPreference } = useLocale();
  const [languageView, setLanguageView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const change = useRef(onOpenChange); change.current = onOpenChange;
  const id = useId();
  const close = () => { change.current(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) { setLanguageView(false); return; }
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) change.current(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, languageView]);

  const choices: { value: LocalePreference; label: string }[] = [
    { value: "system", label: locale === "zh" ? "跟随系统" : "System default" },
    { value: "zh", label: "简体中文" },
    { value: "en", label: "English" },
  ];

  return <div ref={root} className={`nava-more-menu ${className}`} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) change.current(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!open) return;
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (index + 1) % buttons.length
      : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length
        : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
    if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
  }}>
    <button ref={trigger} className={`nava-more-trigger ${buttonClassName}`} type="button" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => onOpenChange(!open)} onKeyDown={(event) => {
        if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); onOpenChange(true); }
      }}><MoreHorizontal size={23} aria-hidden="true" /></button>
    {open && <div className="app-utility-popover" ref={menu} id={id} role="menu" aria-label={languageView ? (locale === "zh" ? "语言" : "Language") : label} onClick={(event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!languageView && button && !button.classList.contains("more-menu-language")) close();
    }}>
      {languageView ? <>
        <button type="button" role="menuitem" onClick={() => setLanguageView(false)}><ArrowLeft /><span>{locale === "zh" ? "语言" : "Language"}</span></button>
        <div role="separator" className="more-menu-divider" />
        {choices.map((choice) => <button key={choice.value} type="button" role="menuitemradio" aria-checked={preference === choice.value}
          onClick={() => { setPreference(choice.value); close(); }}><span className="more-menu-choice">{choice.label}</span>{preference === choice.value && <Check className="more-menu-check" />}</button>)}
      </> : <>
        {menuItems(children)}
        <div role="separator" className="more-menu-divider" />
        <button type="button" role="menuitem" className="more-menu-language" onClick={() => setLanguageView(true)}>
          <Languages /><span>{locale === "zh" ? "语言" : "Language"}</span><small>{locale === "zh" ? "中文" : "English"}</small><ChevronRight />
        </button>
      </>}
    </div>}
  </div>;
}
