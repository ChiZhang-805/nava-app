import type { User } from "@supabase/supabase-js";
import { Bot, Mic, SendHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { loadConversation, sendAiMessage } from "../services/ai";
import { loadProfile } from "../services/profile";
import { startVoiceInput, type VoiceInputError, type VoiceInputSession } from "../services/voice";
import type { ChatMessage } from "../types";

export type AiCommand = {
  id: number;
  type: "new" | "history" | "clear" | "export";
};

type ConversationSnapshot = {
  id: string;
  createdAt: string;
  messages: ChatMessage[];
};

export default function AIScreen({
  user,
  voiceRequestId = 0,
  voiceReleaseId = 0,
  voiceReleaseCancelled = false,
  voiceCancelArmed = false,
  command = null,
}: {
  user: User;
  voiceRequestId?: number;
  voiceReleaseId?: number;
  voiceReleaseCancelled?: boolean;
  voiceCancelArmed?: boolean;
  command?: AiCommand | null;
}) {
  const { locale, t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "starting" | "listening">("idle");
  const [profile, setProfile] = useState<{ username: string | null; avatar_url?: string | null } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationSnapshot[]>([]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const handledVoiceRequestRef = useRef(0);
  const handledVoiceReleaseRef = useRef(0);
  const voiceStopIntentRef = useRef<"stop" | "cancel" | null>(null);
  const voiceInitialInputRef = useRef("");
  const handledCommandRef = useRef(0);
  const historyKey = `nava-ai-history:${user.id}`;

  const readHistory = useCallback(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(historyKey) ?? "[]") as ConversationSnapshot[];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }, [historyKey]);

  const archiveConversation = useCallback((current: ChatMessage[]) => {
    if (current.length === 0) return readHistory();
    const snapshot: ConversationSnapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      messages: current,
    };
    const next = [snapshot, ...readHistory()].slice(0, 20);
    window.localStorage.setItem(historyKey, JSON.stringify(next));
    return next;
  }, [historyKey, readHistory]);

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
    try {
      const result = await sendAiMessage({
        userId: user.id,
        message,
        history: messages,
        lang: locale,
      });
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
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
    loadProfile(user.id).then(setProfile).catch(() => setProfile(null));
    setHistory(readHistory());
  }, [readHistory, user.id]);

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  useEffect(() => {
    if (!command || command.id === handledCommandRef.current) return;
    handledCommandRef.current = command.id;
    if (command.type === "new") {
      setHistory(archiveConversation(messages));
      setMessages([]);
      setInput("");
      setHistoryOpen(false);
      return;
    }
    if (command.type === "history") {
      setHistory(readHistory());
      setHistoryOpen(true);
      return;
    }
    if (command.type === "clear") {
      setMessages([]);
      setInput("");
      setHistoryOpen(false);
      return;
    }
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), messages }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nava-conversation-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [archiveConversation, command, messages, readHistory]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" });
  }, [messages.length]);

  const voiceErrorText = useCallback((voiceError: VoiceInputError) => {
    if (voiceError.code === "permission_denied") return t("ai.voicePermissionDenied");
    if (voiceError.code === "audio_unavailable") return t("ai.voiceAudioUnavailable");
    if (voiceError.code === "voice_unavailable") return t("ai.voiceUnavailable");
    return t("ai.voiceFailed");
  }, [t]);

  const stopVoiceInput = useCallback(async (cancel = false) => {
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    if (!session) return;
    try {
      await (cancel ? session.cancel() : session.stop());
    } finally {
      if (cancel) setInput(voiceInitialInputRef.current);
      setVoiceState("idle");
    }
  }, []);

  const beginVoiceInput = useCallback(async () => {
    if (sending || voiceState !== "idle") return;
    voiceInitialInputRef.current = input;
    voiceStopIntentRef.current = null;
    setError(null);
    setVoiceState("starting");
    try {
      const session = await startVoiceInput({
        locale,
        onTranscript: (transcript) => setInput(transcript),
        onEnd: () => {
          voiceSessionRef.current = null;
          setVoiceState("idle");
        },
        onError: (voiceError) => setError(voiceErrorText(voiceError)),
      });
      const stopIntent = voiceStopIntentRef.current;
      if (stopIntent) {
        await (stopIntent === "cancel" ? session.cancel() : session.stop());
        if (stopIntent === "cancel") setInput(voiceInitialInputRef.current);
        setVoiceState("idle");
        return;
      }
      voiceSessionRef.current = session;
      setVoiceState("listening");
    } catch (voiceError) {
      setVoiceState("idle");
      setError(voiceErrorText(voiceError as VoiceInputError));
    }
  }, [input, locale, sending, voiceErrorText, voiceState]);

  useEffect(() => {
    if (voiceRequestId <= 0 || voiceRequestId === handledVoiceRequestRef.current) return;
    handledVoiceRequestRef.current = voiceRequestId;
    void beginVoiceInput();
  }, [beginVoiceInput, voiceRequestId]);

  useEffect(() => {
    if (voiceReleaseId <= 0 || voiceReleaseId === handledVoiceReleaseRef.current) return;
    handledVoiceReleaseRef.current = voiceReleaseId;
    voiceStopIntentRef.current = voiceReleaseCancelled ? "cancel" : "stop";
    if (voiceSessionRef.current) void stopVoiceInput(voiceReleaseCancelled);
  }, [stopVoiceInput, voiceReleaseCancelled, voiceReleaseId]);

  useEffect(() => () => {
    void voiceSessionRef.current?.cancel();
    voiceSessionRef.current = null;
  }, []);

  return (
    <div className="chat-layout">
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
                  {profile?.avatar_url && !avatarLoadFailed
                    ? <img src={profile.avatar_url} alt="" onError={() => setAvatarLoadFailed(true)} />
                    : (profile?.username?.trim().slice(0, 1).toUpperCase() || user.email?.slice(0, 1).toUpperCase() || "N")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="error-text">{error}</p>}

      <form className={["chat-composer", voiceState !== "idle" ? "voice-active" : ""].filter(Boolean).join(" ")} onSubmit={submit}>
        <div className="chat-input-shell">
          {voiceState !== "idle" && <Mic className="chat-voice-indicator" size={18} aria-hidden="true" />}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voiceCancelArmed ? t("ai.voiceCancelHint") : voiceState === "starting" ? t("ai.voiceStarting") : voiceState === "listening" ? t("ai.voiceListening") : t("ai.placeholder")}
          />
        </div>
        <button
          className="chat-send-button"
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t("ai.send")}
          title={t("ai.send")}
        >
          <SendHorizontal size={21} />
        </button>
      </form>

      {historyOpen && (
        <div className="ai-history-sheet" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "历史会话" : "Conversation history"}>
          <header>
            <strong>{locale === "zh" ? "历史会话" : "Conversation history"}</strong>
            <button type="button" onClick={() => setHistoryOpen(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={20} /></button>
          </header>
          <div>
            {history.length === 0 && <p className="muted">{locale === "zh" ? "还没有历史会话" : "No archived conversations"}</p>}
            {history.map((snapshot) => (
              <button key={snapshot.id} type="button" onClick={() => { setMessages(snapshot.messages); setHistoryOpen(false); }}>
                <strong>{snapshot.messages.find((item) => item.role === "user")?.content || (locale === "zh" ? "未命名会话" : "Untitled conversation")}</strong>
                <span>{new Date(snapshot.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
