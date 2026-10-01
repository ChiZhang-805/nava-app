import { PawPrint, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import printerCatPressSprite from "../assets/shop/points-cards/printer-cat-press-sprite.png";
import { POINTS_CARD_SKINS, type PointsCardSkin, type PointsCardSkinId } from "../services/rewardCards";
import type { RewardCartLine, RewardCheckoutResult } from "../services/rewardShop";
import ShopPaymentTerminal from "./ShopPaymentTerminal";
import "./shop-checkout-experience.css";

type CheckoutPhase = "select" | "confirm" | "checking" | "card" | "placed" | "printing" | "receipt";
export type { PointsCardSkinId } from "../services/rewardCards";

// The reference clip contains two passes. Selection and confirmation remain
// user-paced; the terminal and receipt motion preserve about eight seconds of
// active animation within the roughly fifteen-second end-to-end story.
const CHECKOUT_TIMELINE_MS = {
  placed: 3200,
  receipt: 4700,
} as const;

const CHECKOUT_TEST_TIMELINE_MS = {
  placed: 720,
  receipt: 900,
} as const;

export default function ShopCheckoutExperience({
  locale,
  lines,
  expectedTotal,
  result,
  checkoutStarted,
  selectedCardId,
  availableCards,
  onConfirmCard,
  onDone,
}: {
  locale: "zh" | "en";
  lines: RewardCartLine[];
  expectedTotal: number;
  availablePoints: number | null;
  result: RewardCheckoutResult | null;
  checkoutStarted: boolean;
  selectedCardId: PointsCardSkinId | null;
  availableCards: PointsCardSkin[];
  onConfirmCard: (cardId: PointsCardSkinId) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<CheckoutPhase>(checkoutStarted ? "checking" : "select");
  const [chosenCardId, setChosenCardId] = useState<PointsCardSkinId>(selectedCardId ?? availableCards[0]?.id ?? "mint-growth");
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [checkoutTime, setCheckoutTime] = useState(() => new Date());
  const actionRef = useRef<HTMLButtonElement>(null);
  const cardTrackRef = useRef<HTMLDivElement>(null);
  const cardScrollFrameRef = useRef<number | null>(null);
  const cardTouchRef = useRef<{ x: number; y: number; index: number } | null>(null);
  const acceleratedTimeline = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get("qaCheckoutTiming") === "fast";

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!result) {
      if (checkoutStarted) setPhase("checking");
      return;
    }
    if (reducedMotion) {
      setPhase("placed");
      return;
    }
    const timeline = acceleratedTimeline ? CHECKOUT_TEST_TIMELINE_MS : CHECKOUT_TIMELINE_MS;
    setPhase("card");
    const placed = window.setTimeout(() => setPhase("placed"), timeline.placed);
    return () => window.clearTimeout(placed);
  }, [acceleratedTimeline, checkoutStarted, reducedMotion, result]);

  useEffect(() => {
    if (phase !== "printing") return;
    if (reducedMotion) {
      setPhase("receipt");
      return;
    }
    const timeline = acceleratedTimeline ? CHECKOUT_TEST_TIMELINE_MS : CHECKOUT_TIMELINE_MS;
    const receipt = window.setTimeout(() => setPhase("receipt"), timeline.receipt);
    return () => window.clearTimeout(receipt);
  }, [acceleratedTimeline, phase, reducedMotion]);

  useEffect(() => {
    if (selectedCardId) setChosenCardId(selectedCardId);
  }, [selectedCardId]);

  useEffect(() => {
    if (!availableCards.some((card) => card.id === chosenCardId)) setChosenCardId(availableCards[0]?.id ?? "mint-growth");
  }, [availableCards, chosenCardId]);

  useEffect(() => {
    if (phase !== "select") return;
    const frame = window.requestAnimationFrame(() => {
      const track = cardTrackRef.current;
      const index = Math.max(0, availableCards.findIndex((card) => card.id === (selectedCardId ?? availableCards[0]?.id)));
      const card = track?.querySelector<HTMLElement>(`[data-card-index="${index}"]`);
      if (!track || !card) return;
      track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [availableCards, phase, selectedCardId]);

  useEffect(() => () => {
    if (cardScrollFrameRef.current !== null) window.cancelAnimationFrame(cardScrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (phase !== "placed" && phase !== "receipt") return;
    const focus = window.setTimeout(() => actionRef.current?.focus({ preventScroll: true }), reducedMotion ? 0 : acceleratedTimeline ? 80 : 900);
    return () => window.clearTimeout(focus);
  }, [acceleratedTimeline, phase, reducedMotion]);

  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPoints = result?.totalPoints ?? expectedTotal;
  const chosenCard = availableCards.find((card) => card.id === chosenCardId) ?? availableCards[0] ?? POINTS_CARD_SKINS[0];
  const chosenCardIndex = Math.max(0, availableCards.findIndex((card) => card.id === chosenCard.id));
  const orderCode = result?.orderId.slice(0, 8).toUpperCase() ?? "";
  const productLabel = lines.map((line) => line.product.name).join(" · ");
  const timestamp = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(checkoutTime);

  const centerCard = (index: number, behavior: ScrollBehavior = "smooth") => {
    const track = cardTrackRef.current;
    const card = track?.querySelector<HTMLElement>(`[data-card-index="${index}"]`);
    if (!track || !card) return;
    track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior });
  };

  const finishCardSwipe = (clientX: number, clientY: number) => {
    const start = cardTouchRef.current;
    cardTouchRef.current = null;
    if (!start || phase !== "select") return;
    const deltaX = clientX - start.x;
    const deltaY = clientY - start.y;
    if (Math.abs(deltaX) < 38 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
    centerCard(start.index + (deltaX < 0 ? 1 : -1));
  };

  const syncCardFromScroll = () => {
    if (cardScrollFrameRef.current !== null) return;
    cardScrollFrameRef.current = window.requestAnimationFrame(() => {
      cardScrollFrameRef.current = null;
      const track = cardTrackRef.current;
      if (!track) return;
      const center = track.getBoundingClientRect().left + track.clientWidth / 2;
      const cards = [...track.querySelectorAll<HTMLElement>("[data-card-index]")];
      const nearest = cards.reduce<{ index: number; distance: number }>((best, card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY });
      const nextCard = availableCards[nearest.index];
      if (nextCard && nextCard.id !== chosenCardId) setChosenCardId(nextCard.id);
    });
  };

  return (
    <section
      className="shop-checkout-experience"
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-checkout-phase={phase}
      data-selected-card={chosenCard.id}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-checkout-timeline={acceleratedTimeline ? "test" : "production"}
      data-card-swipe-zone={phase === "select" ? "active" : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-checkout-title"
      onTouchStart={(event) => {
        if (phase !== "select" || event.touches.length !== 1) return;
        const touch = event.touches[0];
        cardTouchRef.current = { x: touch.clientX, y: touch.clientY, index: chosenCardIndex };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch) finishCardSwipe(touch.clientX, touch.clientY);
      }}
      onTouchCancel={() => { cardTouchRef.current = null; }}
    >
      <div className="shop-checkout-ambient" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <div className="shop-checkout-copy" aria-live="polite">
        <span>{phase === "select" ? "NAVA POINTS CARDS" : phase === "confirm" || phase === "checking" ? "NAVA CHECKOUT" : phase === "placed" ? "NAVA LITTLE SHOP" : locale === "zh" ? "积分兑换" : "POINTS REDEMPTION"}</span>
        <h1 id="shop-checkout-title">
          {phase === "select"
            ? (locale === "zh" ? "今天，想让哪张卡陪你？" : "Choose Card")
            : phase === "confirm" || phase === "checking"
              ? (locale === "zh" ? "确认订单" : "Confirm Order")
              : phase === "card"
                ? (locale === "zh" ? "正在刷积分卡" : "Processing Card")
                : phase === "placed"
                  ? (locale === "zh" ? "订单已完成" : "Order Placed")
                  : phase === "printing"
                    ? (locale === "zh" ? "正在打印兑换凭证" : "Printing Receipt")
                    : (locale === "zh" ? "兑换凭证已就绪" : "Receipt Ready")}
        </h1>

      </div>

      <div className="shop-exchange-illustration">
        <div className="shop-card-picker" aria-hidden="false">
          <div className="shop-card-picker-carousel">
            <div
              ref={cardTrackRef}
              className="shop-card-picker-list"
              role="radiogroup"
              aria-label={locale === "zh" ? "横向滑动选择积分卡卡面" : "Swipe horizontally to choose a points card design"}
              onScroll={syncCardFromScroll}
            >
            {availableCards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={chosenCardId === card.id}
                aria-label={card[locale]}
                data-selected={chosenCardId === card.id ? "true" : "false"}
                data-card-index={index}
                data-card-offset={Math.max(-2, Math.min(2, index - chosenCardIndex))}
                data-card-skin={card.id}
                tabIndex={chosenCardId === card.id ? 0 : -1}
                onClick={() => centerCard(index)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const next = Math.max(0, Math.min(availableCards.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
                  centerCard(next);
                }}
              >
                <img src={card.art} alt="" />
                <span className="shop-card-face">
                  <small>NAVA POINTS</small>
                  <i className="shop-card-chip" aria-hidden="true"><b /><b /><b /></i>
                  <strong>{card[locale]}</strong>
                  <em>•• {card.lastFour}</em>
                  <Wifi className="shop-card-contactless" size={32} strokeWidth={2.1} aria-hidden="true" />
                </span>
              </button>
            ))}
            </div>
          </div>
          <div className="shop-card-picker-pages" aria-label={locale === "zh" ? "积分卡位置" : "Points card position"}>
            {availableCards.map((card, index) => <button key={card.id} type="button" aria-label={locale === "zh" ? `滑到${card.zh}` : `Go to ${card.en}`} aria-current={index === chosenCardIndex ? "true" : undefined} onClick={() => centerCard(index)} />)}
          </div>
        </div>

        <article className="shop-order-confirmation" aria-hidden={phase !== "confirm" && phase !== "checking"}>
          <div className="shop-order-card" data-card-skin={chosenCard.id}>
            <img src={chosenCard.art} alt="" />
            <span className="shop-order-card-face">
              <small>NAVA POINTS</small>
              <i className="shop-card-chip" aria-hidden="true" />
              <strong>{chosenCard[locale]}</strong>
              <em>•• {chosenCard.lastFour}</em>
              <Wifi size={27} strokeWidth={2.1} aria-hidden="true" />
            </span>
          </div>
          <dl className="shop-order-details">
            <div><dt>{locale === "zh" ? "积分卡" : "Card"}</dt><dd>{chosenCard[locale]}</dd></div>
            <div><dt>{locale === "zh" ? "商品" : "Item"}</dt><dd>{lines.map((line) => <span className="shop-order-item" key={line.product.id}>{line.product.name}{lines.length > 1 && ` × ${line.quantity}`}</span>)}</dd></div>
            <div><dt>{locale === "zh" ? "数量" : "Quantity"}</dt><dd>{quantity}</dd></div>
            <div><dt>{locale === "zh" ? "时间" : "Time"}</dt><dd><time dateTime={checkoutTime.toISOString()}>{timestamp}</time></dd></div>
            <div className="shop-order-total"><dt>{locale === "zh" ? "总计" : "Total"}</dt><dd>{totalPoints.toLocaleString()} XP</dd></div>
          </dl>
        </article>

        <div className="shop-terminal-scene" aria-hidden={phase !== "card" && phase !== "placed"}>
          <ShopPaymentTerminal card={chosenCard} approved={Boolean(result)} />
          <div className="shop-terminal-summary">
            <div><span>{locale === "zh" ? "商品" : "Item"}</span><strong>{productLabel}</strong></div>
            <i />
            <div><span>{locale === "zh" ? "总计" : "Total"}</span><strong>{totalPoints.toLocaleString()} XP</strong></div>
          </div>
        </div>

        <div className="shop-printer-scene" aria-hidden={phase !== "printing" && phase !== "receipt"}>
          <div className="shop-receipt-printer">
            <span className="shop-printer-highlight" />
            <span className="shop-printer-slot" />
            <span className="shop-printer-status" />
            <span className="shop-printer-button"><i /></span>
          </div>
          <div className="shop-checkout-cat" aria-hidden="true">
            <span style={{ backgroundImage: `url(${printerCatPressSprite})` }} />
          </div>
          <div className="shop-receipt-feed" role="region" aria-label={locale === "zh" ? "兑换凭证明细" : "Receipt details"} tabIndex={phase === "receipt" ? 0 : -1}>
          <article className="shop-receipt">
            <div className="shop-receipt-teeth" />
            <header><PawPrint size={18} /><strong>NAVA</strong><small>{locale === "zh" ? "积分兑换凭证" : "POINTS RECEIPT"}</small></header>
            <div className="shop-receipt-rule" />
            <div className="shop-receipt-items">
              {lines.map((line) => (
                <dl key={line.product.id} className="shop-receipt-item">
                  <div><dt>{locale === "zh" ? "商品" : "Item"}</dt><dd>{line.product.name}</dd></div>
                  <div><dt>{locale === "zh" ? "单价" : "Unit price"}</dt><dd>{line.product.pointPrice == null ? "—" : `${line.product.pointPrice.toLocaleString()} ${locale === "zh" ? "积分/个" : "XP each"}`}</dd></div>
                  <div><dt>{locale === "zh" ? "数量" : "Quantity"}</dt><dd>{line.quantity}</dd></div>
                </dl>
              ))}
            </div>
            <dl className="shop-receipt-totals">
              <div><dt>{locale === "zh" ? "总计" : "Total"}</dt><dd>{totalPoints.toLocaleString()} XP</dd></div>
              <div><dt>{locale === "zh" ? "剩余" : "Balance"}</dt><dd>{result ? `${result.balance.toLocaleString()} XP` : "—"}</dd></div>
            </dl>
            <div className="shop-receipt-rule" />
            <footer>
              <div><time dateTime={checkoutTime.toISOString()}>{timestamp}</time><span>#{orderCode}</span></div>
              <div className="shop-receipt-stamp"><PawPrint size={19} /><b>{locale === "zh" ? "已兑换" : "REDEEMED"}</b></div>
            </footer>
          </article>
          </div>
        </div>

      </div>

      {phase === "select" && (
        <div className="shop-card-picker-actions">
          <button ref={actionRef} type="button" onClick={() => { setCheckoutTime(new Date()); setPhase("confirm"); }}>{locale === "zh" ? "使用这张卡片" : "Choose Card"}</button>
        </div>
      )}
      {phase === "confirm" && (
        <button ref={actionRef} className="shop-checkout-primary" type="button" onClick={() => {
          setPhase("checking");
          onConfirmCard(chosenCard.id);
        }}>
          {locale === "zh" ? "继续" : "Continue"}
        </button>
      )}
      {phase === "placed" && (
        <button ref={actionRef} className="shop-checkout-primary" type="button" onClick={() => setPhase("printing")}>
          {locale === "zh" ? "继续" : "Continue"}
        </button>
      )}
      {phase === "checking" && <button className="shop-checkout-primary shop-checkout-pending" type="button" disabled aria-label={locale === "zh" ? "正在确认订单" : "Confirming order"}><i /><i /><i /></button>}
      {phase === "receipt" && (
        <button ref={actionRef} className="shop-checkout-primary" type="button" onClick={onDone}>
          {locale === "zh" ? "完成" : "Done"}
        </button>
      )}
    </section>
  );
}
