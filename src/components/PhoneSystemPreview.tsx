import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { AlarmClock, Camera, ContactRound, Flashlight, Grid3X3, LockKeyhole, MessageCircle, MicOff, Phone, Plus, Search, Volume2 } from "lucide-react";
import { initialPhoneState, phoneCommandEvent, phoneNotificationEvent, phoneNotificationOpenEvent, phonePreviewMedia, phoneTransition, type PhoneAction, type PhoneNotice } from "../services/previewPhoneSystem";
import { simulatePreviewInterruption } from "../services/previewEnvironment";
import navaIcon from "../../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
import cameraIcon from "../assets/preview-system/camera.png";
import messagesIcon from "../assets/preview-system/messages.png";
import clockIcon from "../assets/preview-system/clock.png";
import contactsIcon from "../assets/preview-system/contacts.png";
import mailIcon from "../assets/preview-system/mail.png";
import notesIcon from "../assets/preview-system/notes.png";
import phoneIcon from "../assets/preview-system/phone.png";
import settingsIcon from "../assets/preview-system/settings.png";
import weatherIcon from "../assets/preview-system/weather.png";
import "../styles/phone-system-preview.css";

const nowText = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateText = () => new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
// Auth bootstrap briefly mounts the incoming and outgoing shells together.
// An outgoing shell must never erase the incoming shell's document markers.
let activePreviewOwner: symbol | null = null;

/** An isolated web test shell; never navigates/unmounts NAVA or impersonates OS APIs. */
export default function PhoneSystemPreview({ userId, report }: { userId?: string; report: (text: string) => void }) {
  const [state, dispatch] = useReducer(phoneTransition, initialPhoneState);
  const [notices, setNotices] = useState<PhoneNotice[]>([]);
  const [bannerId, setBannerId] = useState<string | null>(null);
  const [clock, setClock] = useState(nowText);
  const [elapsed, setElapsed] = useState(0);
  const [speaker, setSpeaker] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const [digits, setDigits] = useState("");
  const [sheet, setSheet] = useState<"message" | "reminder" | null>(null);
  const [slide, setSlide] = useState(0);
  const [desktop, setDesktop] = useState(() => window.matchMedia(phonePreviewMedia).matches);
  const reportRef = useRef(report); reportRef.current = report;
  const gesture = useRef<{ x: number; y: number; scale: number } | null>(null);
  const sidePress = useRef(0);
  const pendingNotice = useRef<PhoneNotice | null>(null);
  const noticeSwiped = useRef(false);
  const previewOwner = useRef(Symbol("phone-preview"));
  const cover = state.surface !== "app" || state.call === "full" || state.call === "active";

  useEffect(() => {
    const media = window.matchMedia(phonePreviewMedia);
    const changed = () => { setDesktop(media.matches); if (!media.matches) { dispatch("end-call"); dispatch("unlock"); dispatch("app"); } };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => { setNotices([]); setBannerId(null); pendingNotice.current = null; dispatch("end-call"); }, [userId]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowText()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setElapsed(0); setKeypad(false); setDigits(""); setSpeaker(false); setMicrophoneMuted(false); setSheet(null); setSlide(0);
    if (state.call !== "active") return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state.call]);
  useEffect(() => {
    if (state.call !== "banner" && state.call !== "full") return;
    const timer = window.setTimeout(() => { dispatch("end-call"); reportRef.current("来电已超时，未建立真实通话。"); }, 45_000);
    return () => window.clearTimeout(timer);
  }, [state.call]);
  useEffect(() => {
    if (state.call === "full" || state.call === "active") document.querySelector<HTMLButtonElement>(".ios-call-full button")?.focus({ preventScroll: true });
  }, [state.call]);
  useEffect(() => {
    if (!bannerId || state.surface === "locked" || state.surface === "off" || state.call !== "none") return;
    const timer = window.setTimeout(() => setBannerId(null), 8500);
    return () => window.clearTimeout(timer);
  }, [bannerId, state.surface, state.call]);

  useEffect(() => {
    if (!desktop) return;
    const receive = (notice: PhoneNotice) => {
      setNotices((current) => [notice, ...current.filter((value) => value.item.id !== notice.item.id)].slice(0, 12));
      setBannerId(notice.item.id);
      dispatch("wake");
    };
    const command = (event: Event) => {
      const action = (event as CustomEvent<PhoneAction | "message">).detail;
      if (action === "message") {
        receive({ item: { id: `preview:message:${Date.now()}`, title: "给今天留一条记录吧", body: "忙碌之余，花一点时间看看自己的状态。", category: "system", source: "system", createdAt: new Date().toISOString(), target: { tab: "today", view: "notifications" } }, open: () => window.dispatchEvent(new CustomEvent(phoneNotificationOpenEvent, { detail: { tab: "today", view: "notifications" } })) });
      } else if (action === "unlock" && pendingNotice.current) {
        dispatch("unlock"); dispatch("app"); const next = pendingNotice.current; pendingNotice.current = null; next.open();
      } else {
        dispatch(action);
      }
    };
    const notification = (event: Event) => receive((event as CustomEvent<PhoneNotice>).detail);
    window.addEventListener(phoneCommandEvent, command);
    window.addEventListener(phoneNotificationEvent, notification);
    return () => { window.removeEventListener(phoneCommandEvent, command); window.removeEventListener(phoneNotificationEvent, notification); };
  }, [desktop]);

  // Keep the real app mounted (drafts, timer state and auth survive), but make
  // its DOM and body-portalled dialogs non-interactive behind system surfaces.
  useLayoutEffect(() => {
    if (!desktop) return;
    const owner = previewOwner.current;
    activePreviewOwner = owner;
    document.documentElement.dataset.phonePreview = state.surface;
    document.documentElement.dataset.phoneCall = state.call;
    const saved = new Map<HTMLElement, boolean>();
    const hide = () => {
      if (!cover) return;
      document.querySelectorAll<HTMLElement>(".nava-app-stage > .phone-frame, .nava-app-stage > .auth-screen, .nava-app-stage > .app-screen, .nava-app-stage > .onboarding-screen, body > .focus-immersive, body > .camera-capture-overlay, body > .module-modal").forEach((node) => {
        if (!saved.has(node)) saved.set(node, node.inert);
        node.inert = true;
      });
    };
    hide();
    const observer = new MutationObserver(hide);
    if (cover) observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect(); for (const [node, inert] of saved) node.inert = inert;
      if (activePreviewOwner === owner) {
        activePreviewOwner = null;
        delete document.documentElement.dataset.phonePreview; delete document.documentElement.dataset.phoneCall;
      }
    };
  }, [cover, desktop, state.surface, state.call]);

  const goHome = () => { simulatePreviewInterruption("other"); dispatch("home"); };
  const unlock = () => {
    dispatch("unlock");
    if (pendingNotice.current) { const next = pendingNotice.current; pendingNotice.current = null; dispatch("app"); next.open(); }
  };
  const openNotice = (notice: PhoneNotice) => {
    if (state.surface === "locked") { pendingNotice.current = notice; unlockNotice(notice); }
    else { dispatch("app"); notice.open(); }
    setNotices((current) => current.filter((entry) => entry !== notice)); setBannerId(null);
  };
  const unlockNotice = (notice: PhoneNotice) => {
    // Unlock is an explicit test-shell transition, never a fake Face ID success.
    pendingNotice.current = notice;
    reportRef.current("通知已选中；请上滑解锁，进入对应页面（此处不模拟生物认证）。");
  };
  const side = () => {
    if (state.call !== "none" && state.call !== "active" && Date.now() - sidePress.current < 500) dispatch("end-call");
    else { if (state.call === "none" && state.surface !== "off") simulatePreviewInterruption("other"); dispatch("side"); }
    sidePress.current = Date.now();
  };
  const begin = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, scale: event.currentTarget.getBoundingClientRect().width / event.currentTarget.offsetWidth || 1 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endSwipe = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current; gesture.current = null;
    if (start && (start.y - event.clientY) / start.scale > 38) {
      if (state.surface === "locked") unlock(); else goHome();
    }
  };
  const endCall = () => { dispatch("end-call"); reportRef.current("通话已结束；原页面与草稿保留，活动不会自动恢复。"); };
  const currentNotice = notices.find((notice) => notice.item.id === bannerId);
  if (!desktop) return null;
  const noticeCard = (notice: PhoneNotice) => <button key={notice.item.id} type="button" className="ios-notice" onClick={() => { if (!noticeSwiped.current) openNotice(notice); }} onPointerDown={(event) => { noticeSwiped.current = false; gesture.current = { x: event.clientX, y: event.clientY, scale: 1 }; }} onPointerUp={(event) => {
    if (gesture.current && gesture.current.y - event.clientY > 35) { noticeSwiped.current = true; setBannerId(null); event.preventDefault(); gesture.current = null; }
  }}><img src={navaIcon} alt="" /><span><span className="ios-notice-meta"><b>NAVA</b><time>现在</time></span><strong>{notice.item.title}</strong><span>{notice.item.body}</span></span></button>;

  return <>
    <div className="ios-system-layer" data-preview-only="phone-system" data-surface={state.surface} data-call={state.call}>
      {state.surface === "off" && state.call === "none" && <button className="ios-screen-off" aria-label="轻点唤醒屏幕" onClick={() => dispatch("wake")} />}
      {(state.surface === "home" || state.surface === "locked") && <div className={`ios-wallpaper ios-${state.surface}`} aria-hidden={state.call === "full" || state.call === "active"} {...(state.call === "full" || state.call === "active" ? { inert: "" } : {})}>
        {state.surface === "home" ? <>
          <div className="ios-app-grid">
            <button className="ios-app"><span className="ios-app-icon ios-calendar"><small>{new Date().toLocaleDateString("zh-CN", { weekday: "long" })}</small><b>{new Date().getDate()}</b></span><span>日历</span></button>
            {[["时钟", clockIcon], ["备忘录", notesIcon], ["天气", weatherIcon], ["邮件", mailIcon], ["通讯录", contactsIcon], ["设置", settingsIcon]].map(([name, icon]) => <button key={name} className="ios-app"><span className="ios-app-icon"><img src={icon} alt="" /></span><span>{name}</span></button>)}
            <button className="ios-app" aria-label="打开 NAVA" onClick={() => dispatch("app")}><span className="ios-app-icon"><img src={navaIcon} alt="" />{notices.length > 0 && <i className="ios-app-badge">{notices.length}</i>}</span><span>NAVA</span></button>
          </div>
          <button className="ios-search"><Search size={14} />搜索</button>
          <div className="ios-dock">{[["电话", phoneIcon], ["信息", messagesIcon], ["相机", cameraIcon], ["邮件", mailIcon]].map(([name, icon]) => <button key={name} className="ios-app-icon" aria-label={name}><img src={icon} alt="" /></button>)}</div>
        </> : <>
          <div className="ios-lock-clock"><LockKeyhole size={22} /><p>{dateText()}</p><time>{clock}</time></div>
          <div className="ios-lock-notices">{notices.slice(0, 3).map(noticeCard)}</div>
          <div className="ios-lock-tools"><button aria-label="手电筒"><Flashlight /></button><button aria-label="锁屏相机"><Camera /></button></div>
          <p className="ios-unlock-label">向上轻扫以解锁</p>
        </>}
      </div>}
      {state.call === "none" && state.surface !== "off" && state.surface !== "locked" && currentNotice && <div className="ios-notice-banner">{noticeCard(currentNotice)}</div>}
      {state.call === "banner" && <div className="ios-call-banner" onPointerDown={(event) => { gesture.current = { x: event.clientX, y: event.clientY, scale: 1 }; }} onPointerUp={(event) => { if (gesture.current && gesture.current.y - event.clientY > 35) endCall(); gesture.current = null; }}>
        <button className="ios-caller-summary" onClick={() => dispatch("expand-call")} aria-label="展开 NAVA 来电"><span className="ios-contact-avatar">N</span><span><small>iPhone</small><strong>NAVA</strong></span></button>
        <button className="ios-call-round ios-decline" aria-label="拒接" onClick={endCall}><Phone /></button><button className="ios-call-round ios-accept" aria-label="接听" onClick={() => dispatch("answer")}><Phone /></button>
      </div>}
      {(state.call === "full" || state.call === "active") && <div className="ios-call-full" role="dialog" aria-modal="true" aria-label={state.call === "active" ? "与 NAVA 通话" : "NAVA 来电"}>
        <div className="ios-call-title"><h2>NAVA</h2><p>{state.call === "active" ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}` : "手机"}</p></div>
        {state.call === "active" ? <>
          {keypad ? <div className="ios-keypad"><output>{digits || "\u00a0"}</output><div>{["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => <button key={digit} onClick={() => setDigits((value) => (value + digit).slice(-18))}>{digit}</button>)}</div><button className="ios-hide-keypad" onClick={() => setKeypad(false)}>隐藏</button></div> : <div className="ios-call-options">
            <button aria-pressed={microphoneMuted} onClick={() => setMicrophoneMuted(!microphoneMuted)}><span><MicOff /></span>静音</button><button onClick={() => setKeypad(true)}><span><Grid3X3 /></span>拨号键盘</button><button aria-pressed={speaker} onClick={() => setSpeaker(!speaker)}><span><Volume2 /></span>扬声器</button>
            <button><span><Plus /></span>添加通话</button><button><span><Camera /></span>FaceTime</button><button><span><ContactRound /></span>通讯录</button>
          </div>}
          <button className="ios-call-round ios-decline ios-hangup" aria-label="挂断" onClick={endCall}><Phone /></button>
        </> : <div className="ios-incoming-actions"><div className="ios-call-secondary"><button onClick={() => setSheet("reminder")}><AlarmClock />提醒我</button><button onClick={() => setSheet("message")}><MessageCircle />信息</button></div>
          {state.callLocked ? <div className="ios-answer-slider" style={{ "--slide": `${slide}px` } as CSSProperties}>
            <span>滑动来接听</span><button aria-label="滑动来接听" onKeyDown={(event) => { if (["Enter", " ", "ArrowRight"].includes(event.key)) { event.preventDefault(); dispatch("answer"); } }} onPointerDown={begin} onPointerMove={(event) => { if (!gesture.current) return; const track = event.currentTarget.parentElement!; setSlide(Math.max(0, Math.min(track.clientWidth - 64, (event.clientX - gesture.current.x) / gesture.current.scale))); }} onPointerUp={(event) => { const start = gesture.current; gesture.current = null; if (start && (event.clientX - start.x) / start.scale > (event.currentTarget.parentElement!.clientWidth - 64) * .8) dispatch("answer"); setSlide(0); }} onPointerCancel={() => { gesture.current = null; setSlide(0); }}><Phone /></button>
          </div> : <div className="ios-answer-pair"><button onClick={endCall}><span className="ios-call-round ios-decline"><Phone /></span>拒绝</button><button onClick={() => dispatch("answer")}><span className="ios-call-round ios-accept"><Phone /></span>接听</button></div>}
        </div>}
        {sheet && <div className="ios-call-sheet"><div>{(sheet === "message" ? ["现在不方便接听。", "我马上给你回电话。", "我稍后给你回电话。"] : ["1 小时后"]).map((text) => <button key={text} onClick={() => { endCall(); reportRef.current(`已完成${sheet === "message" ? "短信回复" : "回电提醒"}的模拟选择；未发送真实短信或创建系统提醒。`); }}>{text}</button>)}</div><button onClick={() => setSheet(null)}>取消</button></div>}
      </div>}
      {state.surface !== "off" && state.call === "none" && <button className="ios-home-gesture" aria-label={state.surface === "locked" ? "上滑解锁" : "上滑返回主屏幕"} onPointerDown={begin} onPointerUp={endSwipe} onPointerCancel={() => { gesture.current = null; }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (state.surface === "locked") unlock(); else goHome(); } }}><span /></button>}
    </div>
    <button className="ios-side-key" aria-label="侧边按钮" onClick={side} />
  </>;
}
