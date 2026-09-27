import { Gift, PawPrint, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import curiousCat from "../assets/mascot/animated/home-curious.webp";
import catStill from "../assets/figma/home-option2/home-mascot-v5.png";
import type { RewardCartLine, RewardCheckoutResult } from "../services/rewardShop";
import MascotImage from "./MascotImage";
import "./shop-checkout-experience.css";

type CheckoutPhase = "checking" | "card" | "printing" | "receipt" | "complete";

// The reference clip contains two passes. One complete redemption story should
// settle in roughly fifteen seconds, including the local fixture's 520ms server
// confirmation. Production never reads a query string to shorten this timing.
const CHECKOUT_TIMELINE_MS = {
  printing: 3300,
  receipt: 8100,
  complete: 14500,
} as const;

const CHECKOUT_TEST_TIMELINE_MS = {
  printing: 900,
  receipt: 2400,
  complete: 4800,
} as const;

export default function ShopCheckoutExperience({
  locale,
  lines,
  expectedTotal,
  result,
  onDone,
}: {
  locale: "zh" | "en";
  lines: RewardCartLine[];
  expectedTotal: number;
  result: RewardCheckoutResult | null;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<CheckoutPhase>("checking");
  const [settled, setSettled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const actionRef = useRef<HTMLButtonElement>(null);
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
      setSettled(false);
      setPhase("checking");
      return;
    }
    if (reducedMotion) {
      setSettled(true);
      setPhase("complete");
      return;
    }
    const timeline = acceleratedTimeline ? CHECKOUT_TEST_TIMELINE_MS : CHECKOUT_TIMELINE_MS;
    setPhase("card");
    const printing = window.setTimeout(() => setPhase("printing"), timeline.printing);
    const receipt = window.setTimeout(() => setPhase("receipt"), timeline.receipt);
    const complete = window.setTimeout(() => {
      setSettled(true);
      setPhase("complete");
    }, timeline.complete);
    return () => {
      window.clearTimeout(printing);
      window.clearTimeout(receipt);
      window.clearTimeout(complete);
    };
  }, [acceleratedTimeline, reducedMotion, result]);

  useEffect(() => {
    if (phase !== "complete" && !(phase === "receipt" && settled)) return;
    const focus = window.setTimeout(() => actionRef.current?.focus({ preventScroll: true }), reducedMotion ? 0 : acceleratedTimeline ? 80 : 900);
    return () => window.clearTimeout(focus);
  }, [acceleratedTimeline, phase, reducedMotion, settled]);

  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPoints = result?.totalPoints ?? expectedTotal;
  const orderCode = result?.orderId.slice(0, 8).toUpperCase() ?? "";
  const productLabel = lines.length === 1 && lines[0].quantity === 1
    ? lines[0].product.name
    : locale === "zh" ? `${quantity} 件小礼物` : `${quantity} little gifts`;
  const timestamp = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <section
      className="shop-checkout-experience"
      data-checkout-phase={phase}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-checkout-timeline={acceleratedTimeline ? "test" : "production"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-checkout-title"
    >
      <div className="shop-checkout-ambient" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <div className="shop-checkout-copy" aria-live="polite">
        <span>{phase === "complete" ? "NAVA LITTLE SHOP" : locale === "zh" ? "积分兑换" : "POINTS REDEMPTION"}</span>
        <h1 id="shop-checkout-title">
          {phase === "checking"
            ? (locale === "zh" ? "正在确认兑换" : "Confirming your order")
            : phase === "complete"
              ? (locale === "zh" ? "兑换完成" : "All yours")
              : (locale === "zh" ? "兑换成功" : "Redemption confirmed")}
        </h1>
        <p>
          {phase === "checking"
            ? (locale === "zh" ? "小猫正在核对积分和库存…" : "NAVA is checking your points and availability…")
            : phase === "complete"
              ? (locale === "zh" ? "这份小礼物，是你一点点努力换来的。" : "A little gift earned one step at a time.")
              : phase === "card"
                ? (locale === "zh" ? "和小猫一起刷下积分卡" : "Tap the points card with NAVA")
                : phase === "printing"
                  ? (locale === "zh" ? "机器正在慢慢打印兑换凭证…" : "The machine is printing your receipt…")
                  : (locale === "zh" ? "凭证出来啦，小猫正在接住它" : "Here it comes — NAVA is catching it")}
        </p>
      </div>

      <div className="shop-exchange-illustration" aria-hidden="true">
        <div className="shop-terminal-scene">
          <svg className="shop-payment-terminal" viewBox="0 0 280 230" role="presentation">
            <defs>
              <linearGradient id="terminal-top" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#527c86" /><stop offset=".5" stopColor="#234b58" /><stop offset="1" stopColor="#102f3c" /></linearGradient>
              <linearGradient id="terminal-side" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#183c48" /><stop offset="1" stopColor="#08232d" /></linearGradient>
              <linearGradient id="terminal-screen" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ebf9f3" /><stop offset="1" stopColor="#8dd3c1" /></linearGradient>
              <linearGradient id="receipt-roll" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset=".52" stopColor="#d9e3e3" /><stop offset="1" stopColor="#a9b9bb" /></linearGradient>
              <filter id="terminal-shadow" x="-30%" y="-30%" width="170%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="9" floodColor="#173943" floodOpacity=".28" /></filter>
            </defs>
            <ellipse cx="143" cy="195" rx="103" ry="18" fill="#326a74" opacity=".13" />
            <g className="shop-terminal-roll">
              <path d="M183 43c10-16 27-21 43-15l18 7-15 73-29-8 7-36c-6-8-15-10-24-8z" fill="url(#receipt-roll)" />
              <path d="M205 33c17-2 29 6 29 16l-2 15c-6-10-17-15-31-12z" fill="#f8fbfa" opacity=".9" />
              <path d="M219 38c9 2 14 7 13 13" fill="none" stroke="#9aabad" strokeWidth="2" strokeLinecap="round" />
            </g>
            <g filter="url(#terminal-shadow)">
              <path d="M76 66 194 77q15 2 12 16l-20 83q-3 14-18 12L55 170q-14-2-10-17l19-75q3-14 12-12z" fill="url(#terminal-side)" />
              <path d="M71 58 188 69q15 2 12 16l-19 77q-3 13-17 11L52 156q-13-2-10-16l18-70q3-13 11-12z" fill="url(#terminal-top)" stroke="#092936" strokeWidth="2" />
              <path d="m82 73 91 9q8 1 6 9l-7 27-105-13 7-25q2-8 8-7z" fill="#0c2732" />
              <path d="m89 80 78 8-5 20-79-9z" fill="url(#terminal-screen)" />
              <g className="shop-terminal-screen-mark">
                {phase === "checking"
                  ? <><circle cx="116" cy="94" r="3" fill="#2e7e78" /><circle cx="125" cy="95" r="3" fill="#2e7e78" opacity=".65" /><circle cx="134" cy="96" r="3" fill="#2e7e78" opacity=".35" /></>
                  : <path d="m113 94 9 8 19-16" fill="none" stroke="#269d7b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
              </g>
              <g fill="#edf4f2">
                <rect x="61" y="115" width="22" height="8" rx="4" transform="rotate(8 61 115)" /><rect x="89" y="119" width="22" height="8" rx="4" transform="rotate(8 89 119)" /><rect x="117" y="123" width="22" height="8" rx="4" transform="rotate(8 117 123)" />
                <rect x="57" y="129" width="22" height="8" rx="4" transform="rotate(8 57 129)" /><rect x="85" y="133" width="22" height="8" rx="4" transform="rotate(8 85 133)" /><rect x="113" y="137" width="22" height="8" rx="4" transform="rotate(8 113 137)" />
                <rect x="53" y="143" width="22" height="8" rx="4" transform="rotate(8 53 143)" /><rect x="81" y="147" width="22" height="8" rx="4" transform="rotate(8 81 147)" />
              </g>
              <rect x="109" y="151" width="27" height="9" rx="4.5" fill="#46b69a" transform="rotate(8 109 151)" />
              <rect x="140" y="155" width="27" height="9" rx="4.5" fill="#e5c96f" transform="rotate(8 140 155)" />
              <path d="M50 158 164 175" stroke="#78959b" strokeWidth="2" opacity=".45" />
            </g>
          </svg>

          <div className="shop-points-card">
            <span><PawPrint size={19} /></span>
            <b>NAVA</b>
            <strong>{totalPoints.toLocaleString()} XP</strong>
          </div>
          <div className="shop-terminal-summary">
            <div><span>{locale === "zh" ? "已使用" : "Redeemed"}</span><strong>{totalPoints.toLocaleString()} XP</strong></div>
            <i />
            <div><span>{locale === "zh" ? "剩余积分" : "Balance"}</span><strong>{result?.balance.toLocaleString() ?? "—"} XP</strong></div>
          </div>
        </div>

        <div className="shop-printer-scene">
          <div className="shop-receipt-printer">
            <span className="shop-printer-highlight" />
            <span className="shop-printer-slot" />
            <i />
          </div>
          <article className="shop-receipt">
            <div className="shop-receipt-teeth" />
            <header><PawPrint size={18} /><strong>NAVA</strong><small>{locale === "zh" ? "积分兑换凭证" : "POINTS RECEIPT"}</small></header>
            <div className="shop-receipt-rule" />
            <dl>
              <div><dt>{locale === "zh" ? "商品" : "Item"}</dt><dd>{productLabel}</dd></div>
              <div><dt>{locale === "zh" ? "数量" : "Quantity"}</dt><dd>{quantity}</dd></div>
              <div><dt>{locale === "zh" ? "已使用" : "Redeemed"}</dt><dd>{totalPoints.toLocaleString()} XP</dd></div>
              <div><dt>{locale === "zh" ? "剩余" : "Balance"}</dt><dd>{result ? `${result.balance.toLocaleString()} XP` : "—"}</dd></div>
            </dl>
            <div className="shop-receipt-rule" />
            <footer><span>{timestamp}</span><span>#{orderCode}</span></footer>
            <div className="shop-receipt-stamp"><PawPrint size={19} /><b>{locale === "zh" ? "已兑换" : "REDEEMED"}</b></div>
          </article>
        </div>

        <div className="shop-checkout-gift"><Gift size={46} strokeWidth={1.7} /><i /></div>
        <MascotImage className="shop-checkout-cat" animatedSrc={curiousCat} staticSrc={catStill} alt="" />
        <div className="shop-cat-receipt"><ReceiptText size={21} /><span>NAVA</span><PawPrint size={14} /></div>
      </div>

      {phase === "receipt" && settled && (
        <button ref={actionRef} className="shop-checkout-primary" type="button" onClick={() => setPhase("complete")}>
          {locale === "zh" ? "返回完成页" : "Back to completion"}
        </button>
      )}
      {phase === "complete" && (
        <div className="shop-checkout-actions">
          <button type="button" onClick={() => setPhase("receipt")}>{locale === "zh" ? "查看兑换凭证" : "View receipt"}</button>
          <button ref={actionRef} type="button" onClick={onDone}>{locale === "zh" ? "完成" : "Done"}</button>
        </div>
      )}
    </section>
  );
}
