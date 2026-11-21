import { ArrowLeft, CalendarDays, ChevronRight, Plus, SendHorizontal, UserRoundPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import BottomSheet from "../components/BottomSheet";
import "./friend-space-preview.css";

const people = {
  he: { zh: "小禾", en: "He", code: "MI-2601" },
  cheng: { zh: "阿澄", en: "Cheng", code: "MI-2602" },
} as const;

type Person = keyof typeof people;
type Message = { id: string; from: Person; content: string; kind: "text" | "snapshot" };

export default function FriendSpacePreview({ locale, onBack }: { locale: "zh" | "en"; onBack: () => void }) {
  const zh = locale === "zh";
  const [identity, setIdentity] = useState<Person>("he");
  const [friends, setFriends] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<"invite" | "share" | null>(null);
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const peer: Person = identity === "he" ? "cheng" : "he";
  const name = people[peer][locale];

  function send(content: string, kind: Message["kind"]) {
    if (!friends || !content.trim()) return;
    setMessages(current => [...current, { id: crypto.randomUUID(), from: identity, content: content.trim(), kind }]);
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
      <header className="home-experience-header">
        <button type="button" aria-label={zh ? "返回" : "Back"} onClick={open ? () => setOpen(false) : onBack}><ArrowLeft size={21} /></button>
        <h1>{open ? name : zh ? "咪有空间" : "Miyou Space"}</h1>
        <button type="button" aria-label={zh ? "添加好友" : "Add friend"} onClick={() => { setFeedback(""); setSheet("invite"); }}><Plus size={22} /></button>
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
            <button type="button" onClick={() => { setFriends(true); setPendingFrom(null); setOpen(true); }}>{zh ? "接受" : "Accept"}</button>
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
          <ul className="friend-space-preview-messages" aria-live="polite">
            {messages.map(message => <li key={message.id} data-own={message.from === identity}>
              {message.kind === "snapshot" && <CalendarDays size={18} aria-hidden="true" />}
              <span>{message.content}</span>
            </li>)}
          </ul>
          <form className="friend-space-preview-compose" onSubmit={event => { event.preventDefault(); send(draft, "text"); setDraft(""); }}>
            <button type="button" aria-label={zh ? "分享摘要" : "Share summary"} onClick={() => setSheet("share")}><CalendarDays size={20} /></button>
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
