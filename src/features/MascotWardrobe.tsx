import { Check, CircleCheckBig, Coins, Shirt, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import WardrobeMascotEffect from "../components/WardrobeMascotEffect";
import WardrobeTurntable, { type WardrobeTurntableHandle } from "../components/WardrobeTurntable";
import { wardrobeDragAngle } from "../services/wardrobeTurntable";
import { toggleWardrobeAccessory } from "../services/wardrobeAccessorySlots";
import { useLocale } from "../i18n";
import { sampleWardrobeMascotMotion, wardrobeMascotMotions, wardrobeMascotTransform, type WardrobeMascotMotion } from "../services/wardrobeMascotMotion";
import {
  equipMascotWardrobeLook,
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
  if (category === "accessory") return "accessoryIds";
  return "backgroundId";
}

function isSelectionEqual(left: WardrobeSelection, right: WardrobeSelection) {
  return left.skinId === right.skinId
    && left.backgroundId === right.backgroundId
    && left.accessoryIds.length === right.accessoryIds.length
    && left.accessoryIds.every((itemId) => right.accessoryIds.includes(itemId));
}

function DisplayName({ item, locale }: { item: MascotWardrobeItem; locale: "zh" | "en" }) {
  return <>{locale === "zh" ? item.zh : item.en}</>;
}

function ItemArtwork({ item }: { item: MascotWardrobeItem }) {
  if (item.category === "background") return <span className={`mascot-wardrobe-scene-swatch is-${item.previewClass}`} aria-hidden="true">{item.art && <img src={item.art} alt="" draggable={false} />}</span>;
  if (!item.art) return <span className="mascot-wardrobe-no-accessory" aria-hidden="true"><X size={25} /></span>;
  return <img src={item.art} alt="" draggable={false} />;
}

async function decodeSelection(selection: WardrobeSelection) {
  const sources = [wardrobeItem(selection.skinId).art, ...selection.accessoryIds.map((itemId) => wardrobeItem(itemId).art), wardrobeItem(selection.backgroundId).art].filter((source): source is string => Boolean(source));
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
  const [focusedItemId, setFocusedItemId] = useState<WardrobeItemId | null>(null);
  const [sheetItemId, setSheetItemId] = useState<WardrobeItemId | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [playingMotion, setPlayingMotion] = useState<WardrobeMascotMotion | null>(null);
  const [nextMotionIndex, setNextMotionIndex] = useState(0);
  const [turntableStatus, setTurntableStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const characterRef = useRef<HTMLButtonElement | null>(null);
  const turntableRef = useRef<WardrobeTurntableHandle | null>(null);
  const motionFrameRef = useRef(0);
  const motionLockedRef = useRef(false);
  const pointerStartRef = useRef<{ id: number; x: number; y: number; angle: number; width: number; dragged: boolean; vertical: boolean } | null>(null);
  const suppressClickRef = useRef(false);
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

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        cancelAnimationFrame(motionFrameRef.current);
        characterRef.current?.style.setProperty("transform", "translate3d(0, 0, 0)");
        previewRef.current?.style.setProperty("--wardrobe-effect-opacity", "0");
        previewRef.current?.style.setProperty("--wardrobe-effect-rise", "0px");
        turntableRef.current?.setMotion(null);
        motionLockedRef.current = false;
        setPlayingMotion(null);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const cancel = () => {
      if (!document.hidden && turntableStatus !== "unavailable") return;
      cancelAnimationFrame(motionFrameRef.current);
      turntableRef.current?.setMotion(null);
      motionLockedRef.current = false;
      setPlayingMotion(null);
    };
    document.addEventListener("visibilitychange", cancel);
    cancel();
    return () => document.removeEventListener("visibilitychange", cancel);
  }, [turntableStatus]);

  const exactCurrentLook = Boolean(preview && state && isSelectionEqual(preview, state.equipped));
  const skin = preview ? wardrobeItem(preview.skinId) : null;
  const accessories = preview ? preview.accessoryIds.map(wardrobeItem) : [];
  const background = preview ? wardrobeItem(preview.backgroundId) : null;
  const currentItems = useMemo(() => wardrobeItems(activeCategory), [activeCategory]);
  const itemPages = useMemo(() => Array.from({ length: Math.ceil(currentItems.length / 6) }, (_, index) => currentItems.slice(index * 6, index * 6 + 6)), [currentItems]);
  const previewItemIds = preview ? [preview.skinId, ...preview.accessoryIds, preview.backgroundId] : [];
  const lockedPreviewItems = state ? previewItemIds.filter((itemId) => !state.unlockedItemIds.includes(itemId)).map(wardrobeItem) : [];
  const focusedItem = focusedItemId ? wardrobeItem(focusedItemId) : null;
  const actionItem = lockedPreviewItems[0] ?? focusedItem ?? skin;
  const sheetItem = sheetItemId ? wardrobeItem(sheetItemId) : actionItem;
  const previewOwned = lockedPreviewItems.length === 0;

  useEffect(() => {
    setActivePage(0);
    gridRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [activeCategory]);

  useEffect(() => {
    if (!playingMotion) return;
    const character = characterRef.current;
    const stage = previewRef.current;
    if (!character || !stage) return;
    const duration = wardrobeMascotMotions.find((motion) => motion.id === playingMotion)!.durationMs;
    let started: number | null = null;
    const reset = () => {
      turntableRef.current?.setMotion(null);
      character.style.transform = "translate3d(0, 0, 0)";
      stage.style.setProperty("--wardrobe-effect-opacity", "0");
      stage.style.setProperty("--wardrobe-effect-rise", "0px");
    };
    const tick = (now: number) => {
      if (started === null) started = now;
      const progress = Math.min(1, (now - started) / duration);
      const pose = sampleWardrobeMascotMotion(playingMotion, progress);
      if (turntableStatus === "ready") {
        character.style.transform = "translate3d(0, 0, 0)";
        turntableRef.current?.setMotion(playingMotion, progress);
      } else character.style.transform = wardrobeMascotTransform(pose);
      stage.style.setProperty("--wardrobe-effect-opacity", String(pose.effectOpacity));
      stage.style.setProperty("--wardrobe-effect-rise", `${pose.effectRise}px`);
      if (progress < 1) motionFrameRef.current = requestAnimationFrame(tick);
      else { reset(); motionLockedRef.current = false; setPlayingMotion(null); }
    };
    motionFrameRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(motionFrameRef.current); reset(); motionLockedRef.current = false; };
  }, [playingMotion, turntableStatus]);

  const playMascotMotion = () => {
    if (turntableStatus === "loading" || motionLockedRef.current || playingMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    motionLockedRef.current = true;
    const next = wardrobeMascotMotions[nextMotionIndex];
    setPlayingMotion(next.id);
    setNextMotionIndex((value) => (value + 1) % wardrobeMascotMotions.length);
  };

  const scrollToPage = (pageIndex: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const page = grid.children.item(pageIndex) as HTMLElement | null;
    grid.scrollTo({ left: page?.offsetLeft ?? grid.clientWidth * pageIndex, behavior: "smooth" });
  };

  const chooseItem = (item: MascotWardrobeItem) => {
    if (!preview) return;
    if (item.category === "accessory") {
      const accessoryId = item.id as WardrobeSelection["accessoryIds"][number];
      setPreview({
        ...preview,
        accessoryIds: toggleWardrobeAccessory(preview.accessoryIds, accessoryId),
      });
    } else {
      const key = selectionKey(item.category);
      setPreview({ ...preview, [key]: item.id });
    }
    setFocusedItemId(item.id);
    setError(null);
    setSheet(null);
    requestRef.current = null;
  };

  const equipSelected = async () => {
    if (!preview || !previewOwned || busy) return;
    setBusy("equip");
    setError(null);
    try {
      const next = await equipMascotWardrobeLook(preview);
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
    if (!actionItem || state?.unlockedItemIds.includes(actionItem.id) || !state) return;
    setSheetItemId(actionItem.id);
    setSheet(state.balance < actionItem.price ? "insufficient" : "confirm");
  };

  const confirmUnlock = async () => {
    if (!sheetItem || !state || busy) return;
    setBusy("unlock");
    setError(null);
    try {
      const request = requestRef.current?.itemId === sheetItem.id
        ? requestRef.current
        : { itemId: sheetItem.id, key: crypto.randomUUID() };
      requestRef.current = request;
      const next = await unlockMascotWardrobeItem(sheetItem.id, request.key);
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

  if (!state || !preview || !skin || !background || !actionItem || !sheetItem) return (
    <section className="mascot-wardrobe-unavailable" role="alert">
      <Shirt size={34} aria-hidden="true" />
      <h2>{locale === "zh" ? "衣橱暂时没有打开" : "The wardrobe did not open"}</h2>
      <p>{error ?? (locale === "zh" ? "请稍后再试。" : "Please try again shortly.")}</p>
      <button type="button" onClick={refresh}>{locale === "zh" ? "重新加载" : "Try again"}</button>
    </section>
  );

  const summary = [skin, ...accessories, background].map((item) => locale === "zh" ? item.zh : item.en).join(" · ");
  const shortfall = Math.max(0, sheetItem.price - state.balance);

  return (
    <section className="mascot-wardrobe" aria-label={locale === "zh" ? "小猫衣橱" : "Cat wardrobe"}>
      <div className={`mascot-wardrobe-preview is-${background.previewClass}`} ref={previewRef}>
        {background.art && <img className="mascot-wardrobe-background" src={background.art} alt="" draggable={false} />}
        <div className="mascot-wardrobe-preview-lines" aria-hidden="true" />
        <div className="mascot-wardrobe-status">
          <div><span>{exactCurrentLook ? (locale === "zh" ? "当前搭配" : "Current look") : (locale === "zh" ? "正在试穿" : "Trying on")}</span><span>{previewOwned ? (locale === "zh" ? "已拥有" : "Owned") : (locale === "zh" ? "未拥有" : "Locked")}</span></div>
          <strong aria-label={locale === "zh" ? `当前有 ${state.balance} 积分` : `${state.balance} points`}><Coins size={14} aria-hidden="true" />{state.balance}</strong>
        </div>
        <button className="mascot-wardrobe-character" ref={characterRef} type="button" disabled={reducedMotion || turntableStatus === "loading"} aria-disabled={playingMotion ? true : undefined} data-renderer={turntableStatus}
          onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } playMascotMotion(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") suppressClickRef.current = false;
            if (turntableStatus === "ready" && ["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
              event.preventDefault();
              turntableRef.current?.setAngle(event.key === "Home" ? 0 : (turntableRef.current?.getAngle() ?? 0) + (event.key === "ArrowLeft" ? -15 : 15));
            }
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary) return;
            suppressClickRef.current = false;
            pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, angle: turntableRef.current?.getAngle() ?? 0, width: event.currentTarget.clientWidth, dragged: false, vertical: false };
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* A cancelled platform gesture may already have released this pointer. */ }
          }}
          onPointerMove={(event) => {
            const start = pointerStartRef.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!start.dragged && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) start.vertical = true;
            if (!start.vertical && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) start.dragged = true;
            if (start.dragged && turntableStatus === "ready") turntableRef.current?.setAngle(wardrobeDragAngle(start.angle, dx, start.width));
          }}
          onPointerUp={(event) => {
            if (pointerStartRef.current?.id !== event.pointerId) return;
            suppressClickRef.current = pointerStartRef.current.dragged || pointerStartRef.current.vertical;
            pointerStartRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (pointerStartRef.current?.id !== event.pointerId) return;
            pointerStartRef.current = null;
            suppressClickRef.current = true;
          }}
          aria-label={reducedMotion
            ? (locale === "zh" ? `小猫静态预览，已开启减少动态效果。当前搭配：${summary}` : `Still cat preview; reduced motion is on. Current look: ${summary}`)
            : playingMotion
              ? (locale === "zh" ? `小猫正在${wardrobeMascotMotions.find((motion) => motion.id === playingMotion)!.label.zh}` : `The cat is playing ${wardrobeMascotMotions.find((motion) => motion.id === playingMotion)!.label.en}`)
              : (locale === "zh" ? `${turntableStatus === "ready" ? "左右滑动或方向键转身，Home回正面。" : ""}点按小猫播放${wardrobeMascotMotions[nextMotionIndex].label.zh}，当前搭配：${summary}` : `${turntableStatus === "ready" ? "Swipe or use arrow keys to turn; Home faces forward. " : ""}Tap the cat to ${wardrobeMascotMotions[nextMotionIndex].label.en}. Current look: ${summary}`)}
          data-motion={playingMotion ?? "rest"}>
          <WardrobeTurntable ref={turntableRef} skinId={preview.skinId} accessoryIds={preview.accessoryIds} onStatus={setTurntableStatus} />
          {turntableStatus === "unavailable" && <>
            <img className="mascot-wardrobe-skin" src={skin.art} alt="" draggable={false} />
            {accessories.map((accessory) => accessory.art && <img key={accessory.id} className="mascot-wardrobe-accessory" src={accessory.art} alt="" draggable={false} />)}
          </>}
        </button>
        <WardrobeMascotEffect motion={turntableStatus === "ready" ? null : playingMotion} />
        {turntableStatus === "loading" && <span className="mascot-wardrobe-model-loading" role="status">
          {locale === "zh" ? "小猫准备中…" : "Getting your cat ready…"}
        </span>}
        <div className="mascot-wardrobe-look-summary">
          <strong>{summary}</strong>
          <span>{exactCurrentLook ? (locale === "zh" ? "当前穿戴" : "Wearing") : (locale === "zh" ? "试穿预览" : "Preview")}</span>
        </div>
      </div>

      <div className="mascot-wardrobe-tabs" role="tablist" aria-label={locale === "zh" ? "衣橱分类" : "Wardrobe categories"}>
        {(Object.keys(categoryCopy) as WardrobeCategory[]).map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}>{locale === "zh" ? categoryCopy[category].zh : categoryCopy[category].en}</button>)}
      </div>

      <div
        className="mascot-wardrobe-grid"
        ref={gridRef}
        role="region"
        aria-label={locale === "zh" ? `左右滑动查看更多${categoryCopy[activeCategory].zh}` : `Swipe for more ${categoryCopy[activeCategory].en.toLowerCase()}`}
        tabIndex={0}
        onScroll={(event) => {
          const grid = event.currentTarget;
          const pages = Array.from(grid.children) as HTMLElement[];
          const nextPage = pages.reduce((nearest, page, index) => Math.abs(page.offsetLeft - grid.scrollLeft) < Math.abs(pages[nearest].offsetLeft - grid.scrollLeft) ? index : nearest, 0);
          setActivePage(nextPage);
        }}
      >
        {itemPages.map((items, pageIndex) => <div className="mascot-wardrobe-page" key={`${activeCategory}-${pageIndex}`}>
        {items.map((item) => {
          const itemOwned = state.unlockedItemIds.includes(item.id);
          const itemEquipped = item.category === "accessory"
            ? state.equipped.accessoryIds.includes(item.id as WardrobeSelection["accessoryIds"][number])
            : state.equipped[selectionKey(item.category)] === item.id;
          const itemSelected = item.category === "accessory"
            ? preview.accessoryIds.includes(item.id as WardrobeSelection["accessoryIds"][number])
            : preview[selectionKey(item.category)] === item.id;
          return <button className="mascot-wardrobe-item" data-selected={itemSelected ? "true" : undefined} type="button" key={item.id} onClick={() => chooseItem(item)}>
            <span className="mascot-wardrobe-item-art"><ItemArtwork item={item} /></span>
            <span className="mascot-wardrobe-item-copy">
              <strong><DisplayName item={item} locale={locale} /></strong>
              <small>{itemEquipped ? (locale === "zh" ? "穿戴中" : "Wearing") : itemOwned ? (locale === "zh" ? "已拥有" : "Owned") : <><Coins size={12} aria-hidden="true" />{item.price}</>}</small>
            </span>
            {itemSelected && <Check className="mascot-wardrobe-item-check" size={15} aria-hidden="true" />}
          </button>;
        })}
        </div>)}
      </div>

      <div className="mascot-wardrobe-pagination" role="group" aria-label={locale === "zh" ? `${categoryCopy[activeCategory].zh}分页` : `${categoryCopy[activeCategory].en} pages`}>
        {itemPages.map((_, pageIndex) => <button
          key={`${activeCategory}-page-${pageIndex}`}
          type="button"
          className={pageIndex === activePage ? "is-active" : undefined}
          aria-label={locale === "zh" ? `第 ${pageIndex + 1} 页，共 ${itemPages.length} 页` : `Page ${pageIndex + 1} of ${itemPages.length}`}
          aria-current={pageIndex === activePage ? "page" : undefined}
          onClick={() => scrollToPage(pageIndex)}
        />)}
      </div>

      {error && <p className="mascot-wardrobe-error" role="alert">{error}</p>}

      <footer className="mascot-wardrobe-action">
        <button type="button" disabled={busy !== null || exactCurrentLook} onClick={() => void (previewOwned ? equipSelected() : beginUnlock())}>
          {busy ? (locale === "zh" ? "处理中…" : "Working…") : exactCurrentLook ? (locale === "zh" ? "穿戴中" : "Wearing") : previewOwned ? (locale === "zh" ? "穿戴" : "Wear") : (locale === "zh" ? "兑换" : "Unlock")}
        </button>
      </footer>

      {sheet && <div className="mascot-wardrobe-sheet-backdrop" role="presentation" onClick={() => !busy && setSheet(null)}>
        <section className="mascot-wardrobe-sheet" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "小猫衣橱操作" : "Wardrobe action"} onClick={(event) => event.stopPropagation()}>
          <button className="mascot-wardrobe-sheet-close" type="button" disabled={busy !== null} onClick={() => setSheet(null)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={22} /></button>
          {sheet === "confirm" && <>
            <div className="mascot-wardrobe-sheet-heading"><Sparkles size={28} aria-hidden="true" /><div><h2>{locale === "zh" ? `确认兑换${sheetItem.zh}？` : `Unlock ${sheetItem.en}?`}</h2><p>{locale === "zh" ? sheetItem.rarityZh : sheetItem.rarityEn}</p></div></div>
            <dl className="mascot-wardrobe-receipt">
              <div><dt>{locale === "zh" ? "本次兑换" : "Cost"}</dt><dd>{sheetItem.price}</dd></div>
              <div><dt>{locale === "zh" ? "当前余额" : "Current balance"}</dt><dd>{state.balance}</dd></div>
              <div><dt>{locale === "zh" ? "兑换后余额" : "After unlock"}</dt><dd>{state.balance - sheetItem.price}</dd></div>
            </dl>
            <div className="mascot-wardrobe-sheet-actions"><button type="button" onClick={() => setSheet(null)}>{locale === "zh" ? "取消" : "Cancel"}</button><button type="button" disabled={busy !== null} onClick={() => void confirmUnlock()}>{busy ? (locale === "zh" ? "兑换中…" : "Unlocking…") : (locale === "zh" ? "确认兑换" : "Confirm")}</button></div>
          </>}
          {sheet === "success" && <>
            <div className="mascot-wardrobe-sheet-result"><CircleCheckBig size={42} aria-hidden="true" /><h2>{locale === "zh" ? "已经是你的啦" : "It is yours"}</h2><div className="mascot-wardrobe-unlocked-item"><span><ItemArtwork item={sheetItem} /></span><strong><DisplayName item={sheetItem} locale={locale} /></strong></div></div>
            <button className="mascot-wardrobe-sheet-primary" type="button" disabled={busy !== null} onClick={() => lockedPreviewItems.length > 0 ? setSheet(null) : void equipSelected()}>{busy ? (locale === "zh" ? "穿戴中…" : "Equipping…") : lockedPreviewItems.length > 0 ? (locale === "zh" ? "继续兑换" : "Continue unlocking") : (locale === "zh" ? "立即穿戴" : "Wear now")}</button>
            <button className="mascot-wardrobe-sheet-secondary" type="button" onClick={() => setSheet(null)}>{locale === "zh" ? "继续看看" : "Keep browsing"}</button>
          </>}
          {sheet === "insufficient" && <>
            <div className="mascot-wardrobe-sheet-result is-warning"><TriangleAlert size={42} aria-hidden="true" /><h2>{locale === "zh" ? "代币还差一点" : "Not enough points"}</h2></div>
            <dl className="mascot-wardrobe-receipt">
              <div><dt>{locale === "zh" ? sheetItem.zh : sheetItem.en}</dt><dd>{sheetItem.price}</dd></div>
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
