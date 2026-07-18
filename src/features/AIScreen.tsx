import type { User } from "@supabase/supabase-js";
import { Bot, SendHorizontal, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import { loadConversation, sendAiMessage } from "../services/ai";
import type { ChatMessage } from "../types";

export default function AIScreen({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await loadConversation(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;
    setInput("");
    setSending(true);
    setError(null);
    setApplyNotice(null);
    try {
      const result = await sendAiMessage({
        userId: user.id,
        message,
        history: messages,
        lang: "zh",
      });
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      if (result.applied?.saved) {
        setApplyNotice(`已自动保存 ${result.applied.type} 数据。`);
      } else if (result.applied && !result.applied.saved) {
        setApplyNotice(`AI 识别到 ${result.applied.type} 数据，但还需要手动确认。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInput(message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="chat-layout">
      <SectionCard title="NAVA AI" subtitle="描述今天的状态，NAVA 会帮你整理">
        <div className="ai-prompt">
          <Sparkles size={18} />
          <span>可以说：我昨晚 1 点睡，7 点醒，今天状态一般。</span>
        </div>
      </SectionCard>

      <div className="chat-list" ref={listRef}>
        {loading && <p className="muted">正在加载对话</p>}
        {!loading && messages.length === 0 && (
          <div className="empty-chat">
            <Bot size={30} />
            <strong>还没有对话</strong>
            <span>发一条消息，AI 会尝试抽取健康数据并给出建议。</span>
          </div>
        )}
        {messages.map((message) => (
          <article className={message.role === "user" ? "chat-bubble user" : "chat-bubble assistant"} key={message.id}>
            <p>{message.content}</p>
            <time>{new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
          </article>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
      {applyNotice && <p className="success-text">{applyNotice}</p>}

      <form className="chat-composer" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="告诉 NAVA 你的状态" />
        <ActionButton type="submit" icon={<SendHorizontal size={18} />} disabled={sending || !input.trim()}>
          发送
        </ActionButton>
      </form>
    </div>
  );
}
