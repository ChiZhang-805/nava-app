import { Check, CircleCheckBig, Coins, Shirt, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import {
  equipMascotWardrobeItem,
  loadMascotWardrobeState,
  unlockMascotWardrobeItem,
  wardrobeItem,
  wardrobeItems,
  type MascotWardrobeItem,
  type MascotWardrobeState,
  type WardrobeCategory,
  type WardrobeItemId,
  type WardrobeSelection,
} from "../services/mascotWardrobe";
import "./mascot-wardrobe.css";

const categoryCopy: Record<WardrobeCategory, { zh: string; en: string }> = {
  skin: { zh: "皮肤", en: "Skins" },
  accessory: { zh: "饰品", en: "Accessories" },
  background: { zh: "背景", en: "Scenes" },
};

function selectionKey(category: WardrobeCategory): keyof WardrobeSelection {
  if (category === "skin") return "skinId";
  if (category === "accessory") return "accessoryId";
  return "backgroundId";
}

function isSelectionEqual(left: WardrobeSelection, right: WardrobeSelection) {
  return left.skinId === right.skinId && left.accessoryId === right.accessoryId && left.backgroundId === right.backgroundId;
}

function DisplayName({ item, locale }: { item: MascotWardrobeItem; locale: "zh" | "en" }) {
  return <>{locale === "zh" ? item.zh : item.en}</>;
}

function ItemArtwork({ item }: { item: MascotWardrobeItem }) {
  if (item.category === "background") return <span className={`mascot-wardrobe-scene-swatch is-${item.previewClass}`} aria-hidden="true" />;
  if (!item.art) return <span className="mascot-wardrobe-no-accessory" aria-hidden="true"><X size={25} /></span>;
  return <img src={item.art} alt="" draggable={false} />;
}

async function decodeSelection(selection: WardrobeSelection) {
  const sources = [wardrobeItem(selection.skinId).art, wardrobeItem(selection.accessoryId).art].filter((source): source is string => Boolean(source));
  await Promise.all(sources.map((source) => new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = source;
    if (image.complete) resolve();
  })));
}

export default function MascotWardrobe() {
  const { locale } = useLocale();
  const [activeCategory, setActiveCategory] = useState<WardrobeCategory>("skin");
  const [state, setState] = useState<MascotWardrobeState | null>(null);
  const [preview, setPreview] = useState<WardrobeSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"unlock" | "equip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"confirm" | "success" | "insufficient" | null>(null);
  const requestRef = useRef<{ itemId: WardrobeItemId; key: string } | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    loadMascotWardrobeState()
      .then((next) => {
        setState(next);
        setPreview(next.equipped);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const selectedId = preview?.[selectionKey(activeCategory)] ?? null;
  const selectedItem = selectedId ? wardrobeItem(selectedId) : null;
  const owned = selectedItem ? Boolean(state?.unlockedItemIds.includes(selectedItem.id)) : false;
  const equipped = selectedItem && state ? state.equipped[selectionKey(activeCategory)] === selectedItem.id : false;
  const exactCurrentLook = Boolean(preview && state && isSelectionEqual(preview, state.equipped));
  const skin = preview ? wardrobeItem(preview.skinId) : null;
  const accessory = preview ? wardrobeItem(preview.accessoryId) : null;
  const background = preview ? wardrobeItem(preview.backgroundId) : null;
  const currentItems = useMemo(() => wardrobeItems(activeCategory), [activeCategory]);

  const chooseItem = (item: MascotWardrobeItem) => {
    if (!preview) return;
    const key = selectionKey(item.category);
    setPreview({ ...preview, [key]: item.id });
    setError(null);
    setSheet(null);
    requestRef.current = null;
  };

  const equipSelected = async () => {
    if (!selectedItem || !owned || busy) return;
    setBusy("equip");
    setError(null);
    try {
      const next = await equipMascotWardrobeItem(selectedItem.id);
      await decodeSelection(next.equipped);
      setState(next);
      setPreview(next.equipped);
      setSheet(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const beginUnlock = () => {
    if (!selectedItem || owned || !state) return;
    setSheet(state.balance < selectedItem.price ? "insufficient" : "confirm");
  };

  const confirmUnlock = async () => {
    if (!selectedItem || !state || busy) return;
    setBusy("unlock");
    setError(null);
    try {
      const request = requestRef.current?.itemId === selectedItem.id
        ? requestRef.current
        : { itemId: selectedItem.id, key: crypto.randomUUID() };
      requestRef.current = request;
      const next = await unlockMascotWardrobeItem(selectedItem.id, request.key);
      setState(next);
      setSheet("success");
      requestRef.current = null;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/insufficient points/i.test(message)) setSheet("insufficient");
      else {
        setSheet(null);
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="mascot-wardrobe-loading" aria-label={locale === "zh" ? "正在打开小猫衣橱" : "Opening the wardrobe"}><span /><span /><span /></div>;

  if (!state || !preview || !skin || !accessory || !background || !selectedItem) return (
    <section className="mascot-wardrobe-unavailable" role="alert">
      <Shirt size={34} aria-hidden="true" />
      <h2>{locale === "zh" ? "衣橱暂时没有打开" : "The wardrobe did not open"}</h2>
      <p>{error ?? (locale === "zh" ? "请稍后再试。" : "Please try again shortly.")}</p>
      <button type="button" onClick={refresh}>{locale === "zh" ? "重新加载" : "Try again"}</button>
    </section>
  );

  const summary = [skin, accessory, background].map((item) => locale === "zh" ? item.zh : item.en).join(" · ");
  const shortfall = Math.max(0, selectedItem.price - state.balance);

  return (
    <section className="mascot-wardrobe" aria-label={locale === "zh" ? "小猫衣橱" : "Cat wardrobe"}>
      <div className={`mascot-wardrobe-preview is-${background.previewClass}`}>
        <div className="mascot-wardrobe-preview-lines" aria-hidden="true" />
        <div className="mascot-wardrobe-status">
          <div><span>{exactCurrentLook ? (locale === "zh" ? "当前搭配" : "Current look") : (locale === "zh" ? "正在试穿" : "Trying on")}</span><span>{owned ? (locale === "zh" ? "已拥有" : "Owned") : (locale === "zh" ? "未拥有" : "Locked")}</span></div>
          <strong aria-label={locale === "zh" ? `当前有 ${state.balance} 积分` : `${state.balance} points`}><Coins size={14} aria-hidden="true" />{state.balance}</strong>
        </div>
        <div className="mascot-wardrobe-character" aria-label={summary}>
          <img className="mascot-wardrobe-skin" src={skin.art} alt="" draggable={false} />
          {accessory.art && <img className="mascot-wardrobe-accessory" src={accessory.art} alt="" draggable={false} />}
        </div>
        <div className="mascot-wardrobe-look-summary">
          <strong>{summary}</strong>
          <span>{exactCurrentLook ? (locale === "zh" ? "当前穿戴" : "Wearing") : (locale === "zh" ? "试穿预览" : "Preview")}</span>
        </div>
      </div>

      <div className="mascot-wardrobe-tabs" role="tablist" aria-label={locale === "zh" ? "衣橱分类" : "Wardrobe categories"}>
        {(Object.keys(categoryCopy) as WardrobeCategory[]).map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}>{locale === "zh" ? categoryCopy[category].zh : categoryCopy[category].en}</button>)}
      </div>

      <div className="mascot-wardrobe-grid" role="region" aria-label={locale === "zh" ? `左右滑动查看更多${categoryCopy[activeCategory].zh}` : `Swipe for more ${categoryCopy[activeCategory].en.toLowerCase()}`} tabIndex={0}>
        {currentItems.map((item) => {
          const itemOwned = state.unlockedItemIds.includes(item.id);
          const itemEquipped = state.equipped[selectionKey(item.category)] === item.id;
          const itemSelected = selectedItem.id === item.id;
          return <button className="mascot-wardrobe-item" data-selected={itemSelected ? "true" : undefined} type="button" key={item.id} onClick={() => chooseItem(item)}>
            <span className="mascot-wardrobe-item-art"><ItemArtwork item={item} /></span>
            <span className="mascot-wardrobe-item-copy">
              <strong><DisplayName item={item} locale={locale} /></strong>
              <small>{itemEquipped ? (locale === "zh" ? "穿戴中" : "Wearing") : itemOwned ? (locale === "zh" ? "已拥有" : "Owned") : <><Coins size={12} aria-hidden="true" />{item.price}</>}</small>
            </span>
            {itemSelected && <Check className="mascot-wardrobe-item-check" size={15} aria-hidden="true" />}
          </button>;
        })}
      </div>

      <footer className="mascot-wardrobe-action">
        <button type="button" disabled={busy !== null || equipped} onClick={() => void (owned ? equipSelected() : beginUnlock())}>
          {busy ? (locale === "zh" ? "处理中…" : "Working…") : equipped ? (locale === "zh" ? "穿戴中" : "Wearing") : owned ? (locale === "zh" ? "穿戴" : "Wear") : (locale === "zh" ? "兑换" : "Unlock")}
        </button>
      </footer>

      {error && <p className="mascot-wardrobe-error" role="alert">{error}</p>}

      {sheet && <div className="mascot-wardrobe-sheet-backdrop" role="presentation" onClick={() => !busy && setSheet(null)}>
        <section className="mascot-wardrobe-sheet" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "小猫衣橱操作" : "Wardrobe action"} onClick={(event) => event.stopPropagation()}>
          <button className="mascot-wardrobe-sheet-close" type="button" disabled={busy !== null} onClick={() => setSheet(null)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={22} /></button>
          {sheet === "confirm" && <>
            <div className="mascot-wardrobe-sheet-heading"><Sparkles size={28} aria-hidden="true" /><div><h2>{locale === "zh" ? `确认兑换${selectedItem.zh}？` : `Unlock ${selectedItem.en}?`}</h2><p>{locale === "zh" ? selectedItem.rarityZh : selectedItem.rarityEn}</p></div></div>
            <dl className="mascot-wardrobe-receipt">
              <div><dt>{locale === "zh" ? "本次兑换" : "Cost"}</dt><dd>{selectedItem.price}</dd></div>
              <div><dt>{locale === "zh" ? "当前余额" : "Current balance"}</dt><dd>{state.balance}</dd></div>
              <div><dt>{locale === "zh" ? "兑换后余额" : "After unlock"}</dt><dd>{state.balance - selectedItem.price}</dd></div>
            </dl>
            <div className="mascot-wardrobe-sheet-actions"><button type="button" onClick={() => setSheet(null)}>{locale === "zh" ? "取消" : "Cancel"}</button><button type="button" disabled={busy !== null} onClick={() => void confirmUnlock()}>{busy ? (locale === "zh" ? "兑换中…" : "Unlocking…") : (locale === "zh" ? "确认兑换" : "Confirm")}</button></div>
          </>}
          {sheet === "success" && <>
            <div className="mascot-wardrobe-sheet-result"><CircleCheckBig size={42} aria-hidden="true" /><h2>{locale === "zh" ? "已经是你的啦" : "It is yours"}</h2><div className="mascot-wardrobe-unlocked-item"><span><ItemArtwork item={selectedItem} /></span><strong><DisplayName item={selectedItem} locale={locale} /></strong></div></div>
            <button className="mascot-wardrobe-sheet-primary" type="button" disabled={busy !== null} onClick={() => void equipSelected()}>{busy ? (locale === "zh" ? "穿戴中…" : "Equipping…") : (locale === "zh" ? "立即穿戴" : "Wear now")}</button>
            <button className="mascot-wardrobe-sheet-secondary" type="button" onClick={() => setSheet(null)}>{locale === "zh" ? "继续看看" : "Keep browsing"}</button>
          </>}
          {sheet === "insufficient" && <>
            <div className="mascot-wardrobe-sheet-result is-warning"><TriangleAlert size={42} aria-hidden="true" /><h2>{locale === "zh" ? "代币还差一点" : "Not enough points"}</h2></div>
            <dl className="mascot-wardrobe-receipt">
              <div><dt>{locale === "zh" ? selectedItem.zh : selectedItem.en}</dt><dd>{selectedItem.price}</dd></div>
              <div><dt>{locale === "zh" ? "当前拥有" : "Current balance"}</dt><dd>{state.balance}</dd></div>
              <div><dt>{locale === "zh" ? "还差" : "Short by"}</dt><dd>{shortfall}</dd></div>
            </dl>
            <button className="mascot-wardrobe-sheet-primary" type="button" onClick={() => setSheet(null)}>{locale === "zh" ? "知道了" : "Got it"}</button>
          </>}
        </section>
      </div>}
    </section>
  );
}
