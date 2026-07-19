import type { User } from "@supabase/supabase-js";
import { Bot, SendHorizontal, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { loadConversation, sendAiMessage } from "../services/ai";
import type { ChatMessage } from "../types";

export default function AIScreen({ user }: { user: User }) {
  const { locale, t } = useLocale();
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
      setMessages(await loadConversation(user.id, locale));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [locale, user.id]);

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
        lang: locale,
      });
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      if (result.applied?.saved) {
        setApplyNotice(t("ai.saved", { type: result.applied.type }));
      } else if (result.applied && !result.applied.saved) {
        setApplyNotice(t("ai.pending", { type: result.applied.type }));
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
      <SectionCard title={t("ai.title")}>
        <div className="ai-prompt">
          <Sparkles size={18} />
          <span>{t("ai.prompt")}</span>
        </div>
      </SectionCard>

      <div className="chat-list" ref={listRef}>
        {loading && <p className="muted">{t("ai.loading")}</p>}
        {!loading && messages.length === 0 && (
          <div className="empty-chat">
            <Bot size={30} />
            <strong>{t("ai.emptyTitle")}</strong>
            <span>{t("ai.emptyText")}</span>
          </div>
        )}
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div className={["chat-message-row", isUser ? "user" : "assistant"].join(" ")} key={message.id}>
              {!isUser && (
                <span className="chat-avatar assistant" aria-hidden="true">
                  <Sparkles size={16} />
                </span>
              )}
              <article className={isUser ? "chat-bubble user" : "chat-bubble assistant"}>
                <p>{message.content}</p>
                <time>{new Date(message.created_at).toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
              </article>
              {isUser && (
                <span className="chat-avatar user" aria-hidden="true">
                  {user.email?.slice(0, 1).toUpperCase() ?? "N"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="error-text">{error}</p>}
      {applyNotice && <p className="success-text">{applyNotice}</p>}

      <form className="chat-composer" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("ai.placeholder")} />
        <ActionButton type="submit" icon={<SendHorizontal size={18} />} disabled={sending || !input.trim()}>
          {t("ai.send")}
        </ActionButton>
      </form>
    </div>
  );
}
