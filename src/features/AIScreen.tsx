import type { User } from "@supabase/supabase-js";
import { Bot, Mic, SendHorizontal, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { loadConversation, sendAiMessage } from "../services/ai";
import { startVoiceInput, type VoiceInputError, type VoiceInputSession } from "../services/voice";
import type { ChatMessage } from "../types";

export default function AIScreen({
  user,
  voiceRequestId = 0,
  voiceReleaseId = 0,
  voiceReleaseCancelled = false,
  voiceCancelArmed = false,
}: {
  user: User;
  voiceRequestId?: number;
  voiceReleaseId?: number;
  voiceReleaseCancelled?: boolean;
  voiceCancelArmed?: boolean;
}) {
  const { locale, t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "starting" | "listening">("idle");
  const listRef = useRef<HTMLDivElement | null>(null);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const handledVoiceRequestRef = useRef(0);
  const handledVoiceReleaseRef = useRef(0);
  const voiceStopIntentRef = useRef<"stop" | "cancel" | null>(null);
  const voiceInitialInputRef = useRef("");

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
                  {user.email?.slice(0, 1).toUpperCase() ?? "N"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="error-text">{error}</p>}
      {applyNotice && <p className="success-text">{applyNotice}</p>}

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
    </div>
  );
}
