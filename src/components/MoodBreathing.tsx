import { useEffect, useRef, useState } from "react";
import { MessageCircle, Pause, Play, Wind } from "lucide-react";
import MascotImage from "./MascotImage";
import animatedCat from "../assets/mascot/animated/module-mood.webp";
import stillCat from "../assets/mascot/nava-journal-v1.webp";
import "../styles/wellbeing-tools.css";

export default function MoodBreathing({ locale, active = true, savedScore, onOpenAi }: { locale: "zh" | "en"; active?: boolean; savedScore?: number | null; onOpenAi?: (prompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const elapsed = useRef(0);
  const [notice, setNotice] = useState(false);
  const zh = locale === "zh";
  const finished = seconds >= 60;
  useEffect(() => { if (!active) setRunning(false); }, [active]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      elapsed.current = Math.min(60, elapsed.current + (now - last) / 1000);
      last = now;
      setSeconds(Math.floor(elapsed.current));
      if (elapsed.current >= 60) setRunning(false);
    };
    const timer = window.setInterval(tick, 200);
    const hide = () => {
      if (document.hidden) { tick(); setRunning(false); setNotice(true); }
    };
    document.addEventListener("visibilitychange", hide);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", hide); };
  }, [running]);
  const inhale = seconds % 10 < 5;
  return <section className="figma-module-card wellbeing-tool breathing-tool" data-breathing>
    <button type="button" className="wellbeing-heading" aria-expanded={open} onClick={() => { setOpen(!open); setRunning(false); }}><Wind size={20} /><strong>{zh ? "和 NAVA 缓一缓" : "Take a moment with NAVA"}</strong><span>{open ? "−" : "+"}</span></button>
    {open && <div className="wellbeing-body">
      <p>{savedScore != null && savedScore <= 40
        ? (zh ? "今天记录的感受有些低落，不用急着变开心。我在这里陪你缓一缓。" : "Your saved mood is low today. You don't have to feel better right away. I'm here.")
        : (zh ? "先把肩膀放松，把这一分钟留给自己。我在这里陪你。" : "Let your shoulders soften and take a minute for yourself. I'm here with you.")}</p>
      <div className={`breathing-orbit ${running ? (inhale ? "inhale" : "exhale") : ""}`}>
        <MascotImage animatedSrc={running ? animatedCat : stillCat} staticSrc={stillCat} alt="" />
        <strong role="status">{finished ? (zh ? "这一分钟，留给自己" : "A minute for yourself") : running ? (inhale ? (zh ? "轻轻吸气" : "Breathe in gently") : (zh ? "慢慢呼气" : "Breathe out gently")) : (zh ? "按舒服的节奏呼吸" : "Breathe at your own pace")}</strong>
        <span>{seconds} / 60 {zh ? "秒" : "sec"}</span>
      </div>
      <p className="wellbeing-note">{zh ? "圆环只是节奏参考；不憋气、不强求深呼吸。不舒服就停止，恢复自然呼吸。" : "The circle is only a guide. No breath holding or forcing deep breaths. Stop if uncomfortable and breathe naturally."}</p>
      {notice && <p role="status">{zh ? "离开页面时已暂停，准备好后再继续。" : "Paused while away. Resume when ready."}</p>}
      <div className="wellbeing-actions"><button type="button" onClick={() => { if (finished) { elapsed.current = 0; setSeconds(0); } setNotice(false); setRunning(!running); }}>{running ? <Pause size={18} /> : <Play size={18} />}{running ? (zh ? "暂停" : "Pause") : finished ? (zh ? "再来一分钟" : "Another minute") : seconds ? (zh ? "继续" : "Resume") : (zh ? "开始一分钟" : "Start one minute")}</button>
        {onOpenAi && <button type="button" onClick={() => { setRunning(false); onOpenAi(zh ? "我想聊聊现在的感受。请先温和地问我一个问题，不用急着给建议。" : "I'd like to talk about how I feel. Please ask one gentle question before offering advice."); }}><MessageCircle size={18} />{zh ? "聊聊此刻" : "Talk about it"}</button>}</div>
      <a className="wellbeing-source" href="https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/" target="_blank" rel="noreferrer">{zh ? "呼吸练习参考 · NHS" : "Breathing guidance · NHS"}</a>
    </div>}
  </section>;
}
