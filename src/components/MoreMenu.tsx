import { ArrowLeft, Check, ChevronRight, Languages, MoreHorizontal, Palette } from "lucide-react";
import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useLocale } from "../i18n";
import type { LocalePreference } from "../services/localePreference";
import type { AppSkin } from "../services/appSkin";
import AppSkinPicker from "./AppSkinPicker";

function menuItems(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return child;
    if (child.type === Fragment) return cloneElement(child, {}, menuItems(child.props.children));
    return child.type === "button" ? cloneElement(child as React.ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>, { role: "menuitem" }) : child;
  });
}

/** Every page-level ellipsis shares geometry, language settings and keyboard behavior. */
export default function MoreMenu({ open, onOpenChange, label, className = "", buttonClassName = "", skin, onSkinChange, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; label: string;
  className?: string; buttonClassName?: string; skin?: AppSkin; onSkinChange?: (skin: AppSkin) => void; children?: ReactNode;
}) {
  const { locale, preference, setPreference } = useLocale();
  const [view, setView] = useState<"main" | "language" | "skin">("main");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const change = useRef(onOpenChange); change.current = onOpenChange;
  const id = useId();
  const close = () => { change.current(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) { setView("main"); return; }
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) change.current(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, view]);

  const choices: { value: LocalePreference; label: string }[] = [
    { value: "system", label: locale === "zh" ? "跟随系统" : "System default" },
    { value: "zh", label: "简体中文" },
    { value: "en", label: "English" },
  ];

  return <div ref={root} className={`nava-more-menu ${className}`} onBlur={(event) => {
    // Safari can blur to no focused element when pressing a menu button.
    // Closing on that blur removes the button before its click is delivered.
    // Outside pointer presses are handled above; Tab still has a real target.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) change.current(false);
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
    {open && <div className="app-utility-popover" ref={menu} id={id} role="menu" aria-label={view === "language" ? (locale === "zh" ? "语言" : "Language") : view === "skin" ? (locale === "zh" ? "界面皮肤" : "Interface skin") : label} onClick={(event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (view === "main" && button && !button.classList.contains("more-menu-language") && !button.classList.contains("more-menu-skin")) close();
    }}>
      {view === "language" ? <>
        <button type="button" role="menuitem" onClick={() => setView("main")}><ArrowLeft /><span>{locale === "zh" ? "语言" : "Language"}</span></button>
        <div role="separator" className="more-menu-divider" />
        {choices.map((choice) => <button key={choice.value} type="button" role="menuitemradio" aria-checked={preference === choice.value}
          onClick={() => { setPreference(choice.value); close(); }}><span className="more-menu-choice">{choice.label}</span>{preference === choice.value && <Check className="more-menu-check" />}</button>)}
      </> : view === "skin" && skin && onSkinChange ? <>
        <button type="button" role="menuitem" onClick={() => setView("main")}><ArrowLeft /><span>{locale === "zh" ? "界面皮肤" : "Interface skin"}</span></button>
        <div role="separator" className="more-menu-divider" />
        <AppSkinPicker value={skin} onChange={(next) => { onSkinChange(next); close(); }} compact />
      </> : <>
        {menuItems(children)}
        <div role="separator" className="more-menu-divider" />
        {skin && onSkinChange && <button type="button" role="menuitem" className="more-menu-skin" onClick={() => setView("skin")}>
          <Palette /><span>{locale === "zh" ? "界面皮肤" : "Interface skin"}</span><small>{locale === "zh" ? "三款" : "3 skins"}</small><ChevronRight />
        </button>}
        <button type="button" role="menuitem" className="more-menu-language" onClick={() => setView("language")}>
          <Languages /><span>{locale === "zh" ? "语言" : "Language"}</span><small>{locale === "zh" ? "中文" : "English"}</small><ChevronRight />
        </button>
      </>}
    </div>}
  </div>;
}
