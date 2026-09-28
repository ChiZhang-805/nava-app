import { Coins, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EXTRA_POINTS_CARD_COST, type PointsCardSkin, type PointsCardSkinId } from "../services/rewardCards";
import "./PointsCardGallery.css";

const stories: Partial<Record<PointsCardSkinId, { zh: string[]; en: string[] }>> = {
  "lavender-reading": {
    zh: ["月光绕过圆窗，落进柔软的紫色。", "小猫捧起一页故事，让夜晚慢下来。", "热茶的雾气与薰衣草的香轻轻相遇，", "把世界的喧闹，留在书页以外。", "风翻过旧纸，也翻过白日的匆忙。", "灯火守住一角，替心事留一把椅子。", "当最后一个句点落下，星光正好。", "愿每一次翻页，都留一点安静给自己。"],
    en: ["Moonlight rests in a violet window.", "A little cat opens a quiet chapter.", "Tea and lavender soften the evening.", "The world waits beyond the page.", "A breeze turns the old paper slowly.", "Lamplight saves a chair for every thought.", "The final full stop meets the stars.", "Keep a little of this quiet for yourself."],
  },
  "seaside-studio": {
    zh: ["海风掀起白帘，也掀开新的一页。", "小猫蘸一笔蔚蓝，把浪花留在纸上。", "贝壳收藏远方，阳光停在笔尖。", "平凡的午后，也有奔向大海的颜色。", "潮声在画布背后，一遍遍轻轻呼吸。", "未寄出的愿望，被海鸥带向天际。", "等蓝色晾干，心也变得辽阔。", "让心里的远方，在这一刻靠岸。"],
    en: ["Sea air lifts the linen curtain.", "A little cat paints a wave in blue.", "Shells hold the shore; brushes hold light.", "An afternoon becomes a small ocean.", "The tide breathes behind the canvas.", "A gull carries one wish to the horizon.", "As the blue dries, the heart opens wide.", "Let a faraway dream find its shore here."],
  },
  "sunset-garden": {
    zh: ["晚霞把屋顶花园染成温柔的金。", "小猫提起水壶，浇灌一株小小期待。", "花瓣与水珠，在余晖里闪闪发亮。", "认真照料的日常，终会悄悄开花。", "晚风经过叶尖，带走一天的疲惫。", "泥土记得每一次俯身与等待。", "等清晨再来，新芽会回答时光。", "把今天的温柔，种进明天的风里。"],
    en: ["Gold settles on a rooftop garden.", "A little cat waters tomorrow’s hopes.", "Petals catch the last warm light.", "Tender days quietly come into bloom.", "Evening wind lifts the day’s fatigue.", "The soil remembers each patient visit.", "New leaves will answer in the morning.", "Plant today’s kindness in tomorrow’s breeze."],
  },
};

export default function PointsCardGallery({ cards, locale, balance, busy, onAdd, onBack }: {
  cards: readonly PointsCardSkin[];
  locale: "zh" | "en";
  balance: number | null;
  busy: boolean;
  onAdd: (id: PointsCardSkinId) => void;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [moving, setMoving] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ id: number; x: number; scroll: number } | null>(null);
  const cardIds = cards.map((card) => card.id).join(",");
  const card = cards[Math.min(index, Math.max(0, cards.length - 1))];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Preserve the selected design across viewport/safe-area size changes.
    const observer = new ResizeObserver(() => {
      track.scrollTo({ left: Math.min(indexRef.current, cards.length - 1) * track.clientWidth, behavior: "instant" });
    });
    observer.observe(track);
    return () => {
      observer.disconnect();
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [cardIds, cards.length]);

  function goTo(next: number) {
    const track = trackRef.current;
    if (!track || busy) return;
    const target = Math.max(0, Math.min(cards.length - 1, next));
    track.scrollTo({ left: target * track.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function finishDrag() {
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!track || !drag) return;
    dragRef.current = null;
    track.removeAttribute("data-dragging");
    if (track.hasPointerCapture(drag.id)) track.releasePointerCapture(drag.id);
    goTo(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
    setMoving(false);
  }

  if (!card) return <div className="points-shop-empty"><Coins size={32} /><p>{locale === "zh" ? "当前卡面已全部收入卡包" : "Every available design is in your collection"}</p><button type="button" onClick={onBack}>{locale === "zh" ? "返回我的积分卡" : "Back to my cards"}</button></div>;

  return <div className="points-card-gallery" data-card-id={card.id} lang={locale === "zh" ? "zh-CN" : "en"} aria-busy={busy}>
    <div className="points-card-gallery-track" ref={trackRef} tabIndex={0} role="region"
      aria-roledescription={locale === "zh" ? "卡片轮播" : "carousel"}
      aria-label={locale === "zh" ? "左右滑动查看卡面，也可使用方向键" : "Swipe to explore card designs, or use arrow keys"}
      data-busy={busy || undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); goTo(index + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
      onPointerDown={(event) => {
        if (busy || event.pointerType !== "mouse" || event.button !== 0) return;
        event.preventDefault();
        dragRef.current = { id: event.pointerId, x: event.clientX, scroll: event.currentTarget.scrollLeft };
        event.currentTarget.setAttribute("data-dragging", "true");
        event.currentTarget.setPointerCapture(event.pointerId);
        setMoving(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag?.id === event.pointerId) event.currentTarget.scrollLeft = drag.scroll + drag.x - event.clientX;
      }}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
      onScroll={(event) => {
        const track = event.currentTarget;
        const next = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
        indexRef.current = next;
        setIndex(next);
        setMoving(true);
        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = setTimeout(() => { if (!dragRef.current) setMoving(false); }, 160);
      }}>
      {cards.map((design, position) => <div className="points-card-gallery-slide" key={design.id} role="group" aria-label={design[locale]} aria-hidden={position !== index}>
        <div className="points-card-gallery-art">
          <img src={design.art} alt="" draggable={false} />
          <span className="points-card-gallery-brand">NAVA <small>POINTS</small></span>
          <span className="points-card-gallery-number">•• {design.lastFour}</span>
        </div>
      </div>)}
    </div>
    <nav className="points-card-gallery-dots" aria-label={locale === "zh" ? "卡面分页" : "Card designs"}>
      {cards.map((design, position) => <button key={design.id} type="button" disabled={busy} aria-label={design[locale]} aria-current={position === index ? "true" : undefined} onClick={() => goTo(position)}><span /></button>)}
    </nav>
    <section className="points-card-gallery-details" aria-live="polite" aria-atomic="true">
      <h2>{card[locale]}</h2>
      <p className="points-card-gallery-creator">{locale === "zh" ? "主题创作 · 张驰" : "Designed by 张驰"}</p>
      <p className="points-card-gallery-story">{stories[card.id]?.[locale].map((line) => <span key={line}>{line}</span>)}</p>
    </section>
    <footer className="points-card-gallery-footer">
      {balance !== null && balance < EXTRA_POINTS_CARD_COST && <p role="status">{locale === "zh" ? `当前 ${balance} 积分，还差 ${EXTRA_POINTS_CARD_COST - balance} 积分` : `${balance} XP available · ${EXTRA_POINTS_CARD_COST - balance} more needed`}</p>}
      <div className="points-card-gallery-price"><span>{locale === "zh" ? "卡片价格" : "Card price"}</span><strong>{EXTRA_POINTS_CARD_COST}<small> XP</small></strong></div>
      <button type="button" disabled={busy || moving || balance === null || balance < EXTRA_POINTS_CARD_COST} onClick={() => onAdd(card.id)}>
        {busy ? <LoaderCircle size={20} /> : <Plus size={20} />}{busy ? (locale === "zh" ? "正在添加" : "Adding") : (locale === "zh" ? "添加卡片" : "Add card")}
      </button>
    </footer>
  </div>;
}
