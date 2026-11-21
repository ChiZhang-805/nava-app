import { ArrowLeft, ChartNoAxesCombined, ChevronRight, Ellipsis, Plus, SendHorizontal, UserRoundPlus } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import BottomSheet from "../components/BottomSheet";
import "./friend-space-preview.css";

const people = {
  he: { zh: "小禾", en: "He", code: "MI-2601" },
  cheng: { zh: "阿澄", en: "Cheng", code: "MI-2602" },
} as const;

type Person = keyof typeof people;
type Message = { id: string; from: Person; content: string; kind: "text" | "snapshot"; sentAt: number };

const day = 86_400_000;
const messageLifetime = 21 * day;
const timestampGap = 5 * 60_000;

function calendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / day;
}

function timeLabel(sentAt: number, now: number, locale: "zh" | "en") {
  const date = new Date(sentAt);
  const daysAgo = calendarDay(new Date(now)) - calendarDay(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  if (daysAgo <= 0) return time;
  if (daysAgo <= 2) {
    const label = locale === "zh" ? (daysAgo === 1 ? "昨天" : "前天")
      : (daysAgo === 1 ? "Yesterday" : "Day before yesterday");
    return label + " " + time;
  }
  const olderDate = new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
  return olderDate.format(date) + " " + time;
}

function demoMessages(locale: "zh" | "en"): Message[] {
  const dayBefore = new Date();
  dayBefore.setDate(dayBefore.getDate() - 2);
  dayBefore.setHours(20, 5, 0, 0);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(21, 18, 0, 0);
  return [
    { id: "demo-earlier", from: "he", content: locale === "zh" ? "周末想去河边走走。" : "I’m thinking of a riverside walk this weekend.", kind: "text", sentAt: +dayBefore },
    { id: "demo-yesterday", from: "cheng", content: locale === "zh" ? "好呀，沿着河走一圈。" : "Sounds good. Let’s make a loop along the river.", kind: "text", sentAt: +yesterday },
  ];
}

export default function FriendSpacePreview({ locale, onBack }: { locale: "zh" | "en"; onBack: () => void }) {
  const zh = locale === "zh";
  const [identity, setIdentity] = useState<Person>("he");
  const [friends, setFriends] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<"invite" | "conversation" | "share" | null>(null);
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [now, setNow] = useState(Date.now);
  const list = useRef<HTMLUListElement>(null);
  const newestMessage = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [open, newestMessage]);
  useEffect(() => {
    const removeExpired = () => {
      const time = Date.now();
      setNow(time);
      setMessages(current => current.some(message => time - message.sentAt >= messageLifetime)
        ? current.filter(message => time - message.sentAt < messageLifetime) : current);
    };
    const nextExpiry = (messages[0]?.sentAt ?? Infinity) + messageLifetime;
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(removeExpired, Math.max(0, Math.min(nextExpiry, +midnight) - Date.now()));
    document.addEventListener("visibilitychange", removeExpired);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", removeExpired);
    };
  }, [messages, now]);
  const peer: Person = identity === "he" ? "cheng" : "he";
  const name = people[peer][locale];

  function send(content: string, kind: Message["kind"]) {
    if (!friends || !content.trim()) return;
    setMessages(current => [...current, { id: crypto.randomUUID(), from: identity, content: content.trim(), kind, sentAt: Date.now() }]);
  }

  function invite(event: FormEvent) {
    event.preventDefault();
    if (code.trim().toUpperCase() !== people[peer].code) {
      setFeedback(zh ? "请使用对方的演示邀请码。" : "Enter the other demo account’s code.");
      return;
    }
    setPendingFrom(identity);
    setCode("");
    setSheet(null);
  }

  return (
    <section className="friend-space-preview">
      <header className="friend-space-preview-header">
        <button type="button" aria-label={zh ? "返回" : "Back"} onClick={open ? () => setOpen(false) : onBack}><ArrowLeft size={21} /></button>
        <h1>{open ? name : zh ? "咪有空间" : "Miyou Space"}</h1>
        <button type="button" aria-label={open ? (zh ? "会话菜单" : "Conversation menu") : (zh ? "添加好友" : "Add friend")} onClick={() => { setFeedback(""); setSheet(open ? "conversation" : "invite"); }}>
          {open ? <Ellipsis size={22} /> : <Plus size={22} />}
        </button>
      </header>
      <div className="friend-space-preview-controls">
        <small>{zh ? "本地原型 · 演示账号" : "Local prototype · Demo accounts"}</small>
        <button type="button" onClick={() => { setIdentity(peer); setDraft(""); setFeedback(""); }}>
          {zh ? `切换为${name}` : `Switch to ${name}`}
        </button>
      </div>
      {!open ? (
        <div className="friend-space-preview-list">
          {pendingFrom === peer && <div className="friend-space-preview-invite">
            <p>{zh ? `${name} 想加你为好友` : `${name} sent you a friend request`}</p>
            <button type="button" onClick={() => { setFriends(true); setPendingFrom(null); setMessages(demoMessages(locale)); setOpen(true); }}>{zh ? "接受" : "Accept"}</button>
            <button type="button" onClick={() => setPendingFrom(null)}>{zh ? "忽略" : "Ignore"}</button>
          </div>}
          {pendingFrom === identity && <p role="status">{zh ? `已向 ${name} 发出邀请，等对方确认。` : `Invitation sent to ${name}. Waiting for acceptance.`}</p>}
          {friends ? <button className="friend-space-preview-friend" type="button" onClick={() => setOpen(true)}>
            <span aria-hidden="true">{name.slice(0, 1)}</span>
            <div><strong>{name}</strong><small>{messages[messages.length - 1]?.content ?? (zh ? "发第一条消息" : "Send the first message")}</small></div>
            <ChevronRight size={17} />
          </button> : !pendingFrom && <button className="friend-space-preview-friend" type="button" onClick={() => setSheet("invite")}>
            <span aria-hidden="true"><UserRoundPlus size={22} /></span>
            <strong>{zh ? "添加好友" : "Add a friend"}</strong>
            <ChevronRight size={17} />
          </button>}
        </div>
      ) : (
        <>
          <ul className="friend-space-preview-messages" ref={list} aria-live="polite">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const showTime = !previous || message.sentAt - previous.sentAt >= timestampGap
                || calendarDay(new Date(message.sentAt)) !== calendarDay(new Date(previous.sentAt));
              return <Fragment key={message.id}>
                {showTime && <li className="friend-space-preview-time"><time dateTime={new Date(message.sentAt).toISOString()}>{timeLabel(message.sentAt, now, locale)}</time></li>}
                <li className="friend-space-preview-message" data-own={message.from === identity}>
                  <span className="friend-space-preview-avatar" aria-hidden="true">{people[message.from][locale].slice(0, 1)}</span>
                  <div className="friend-space-preview-bubble">
                    {message.kind === "snapshot" && <ChartNoAxesCombined size={17} aria-hidden="true" />}
                    <span>{message.content}</span>
                  </div>
                </li>
              </Fragment>;
            })}
          </ul>
          <form className="friend-space-preview-compose" onSubmit={event => { event.preventDefault(); send(draft, "text"); setDraft(""); }}>
            <input value={draft} maxLength={600} onChange={event => setDraft(event.target.value)} aria-label={zh ? "消息" : "Message"} placeholder={zh ? "发条消息吧" : "Write a message"} />
            <button type="submit" disabled={!draft.trim()} aria-label={zh ? "发送" : "Send"}><SendHorizontal size={20} /></button>
          </form>
        </>
      )}
      {sheet === "invite" && (
        <BottomSheet label={zh ? "添加好友" : "Add friend"} closeLabel={zh ? "关闭" : "Close"} onClose={() => setSheet(null)}>
          <form className="friend-space-preview-sheet" onSubmit={invite}>
            <h2>{zh ? "用邀请码添加" : "Add with an invite code"}</h2>
            <label>{zh ? "对方的演示邀请码" : "Their demo invite code"}<input value={code} onChange={event => setCode(event.target.value)} placeholder={people[peer].code} autoCapitalize="characters" /></label>
            <p>{zh ? `你的演示邀请码 ${people[identity].code}` : `Your demo code ${people[identity].code}`}</p>
            {feedback && <p role="alert">{feedback}</p>}
            <button type="submit" disabled={!code.trim() || friends || Boolean(pendingFrom)}>{zh ? "发送邀请" : "Send invitation"}</button>
          </form>
        </BottomSheet>
      )}
      {sheet === "conversation" && (
        <BottomSheet label={zh ? "会话菜单" : "Conversation menu"} closeLabel={zh ? "关闭" : "Close"} onClose={() => setSheet(null)}>
          <div className="friend-space-preview-sheet">
            <button type="button" onClick={() => setSheet("share")}>{zh ? "分享节律摘要" : "Share rhythm summary"}</button>
          </div>
        </BottomSheet>
      )}
      {sheet === "share" && (
        <BottomSheet label={zh ? "分享摘要" : "Share summary"} closeLabel={zh ? "关闭" : "Close"} onClose={() => setSheet(null)}>
          <div className="friend-space-preview-sheet">
            <h2>{zh ? "分享一张节律摘要" : "Share a rhythm summary"}</h2>
            <p>{zh ? "演示数据 · 过去一周记录了 5 天" : "Demo data · 5 recorded days last week"}</p>
            <button type="button" onClick={() => {
              send(zh ? "演示节律摘要 · 过去一周记录 5 天" : "Demo rhythm summary · 5 logged days", "snapshot");
              setSheet(null);
            }}>{zh ? `发送给${name}` : `Send to ${name}`}</button>
          </div>
        </BottomSheet>
      )}
    </section>
  );
}
