import type { User } from "@supabase/supabase-js";
import { Bot, Camera, Check, LoaderCircle, Mic, Pencil, PhoneCall, PhoneOff, SendHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale } from "../i18n";
import { loadConversation, sendAiMessage } from "../services/ai";
import type { AiProcessingStep } from "../services/aiProcessing";
import { createStreamingAiSpeaker, isAiSpeechSupported, type StreamingAiSpeaker } from "../services/aiSpeech";
import { todayISO } from "../services/date";
import { analyzeDietPhoto } from "../services/media";
import { loadProfileWithOnboarding } from "../services/onboarding";
import type { UserProfile } from "../services/profile";
import { startVoiceInput, type VoiceInputError, type VoiceInputSession } from "../services/voice";
import { voiceEndpointDelayMs } from "../services/voiceEndpoint";
import { confirmStructuredEntry, parseStructuredEntry, type StructuredEntry } from "../services/structuredEntry";
import { updateStructuredEntryField } from "../services/structuredEntryParser";
import type { ChatMessage, DietExtractResult } from "../types";

export type AiCommand = {
  id: number;
  type: "new" | "history" | "voice-call" | "clear" | "export";
};

type ConversationSnapshot = {
  id: string;
  createdAt: string;
  messages: ChatMessage[];
};

type StreamingPreview = {
  status: AiProcessingStep | null;
  content: string;
  startedAt: string;
};

type VoiceCallPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

type MealType = "breakfast" | "lunch" | "dinner" | "pantry";

function currentMeal(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "pantry";
}

function mealLabel(meal: MealType, locale: "zh" | "en") {
  const labels = locale === "zh"
    ? { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", pantry: "加餐" }
    : { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", pantry: "snack" };
  return labels[meal];
}

function buildPhotoNutritionEntry(result: DietExtractResult, meal: MealType, date: string, locale: "zh" | "en"): StructuredEntry {
  const totals = result.totals ?? {
    calories: result.items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0),
    proteinGrams: result.items.reduce((sum, item) => sum + (Number(item.protein_grams) || 0), 0),
    carbohydrateGrams: result.items.reduce((sum, item) => sum + (Number(item.carbohydrate_grams) || 0), 0),
    fatGrams: result.items.reduce((sum, item) => sum + (Number(item.fat_grams) || 0), 0),
  };
  const fields = result.items.map((item, index) => ({
    id: crypto.randomUUID(),
    label: item.name,
    value: String(Math.max(0, Math.round(Number(item.calories) || 0))),
    unit: locale === "zh" ? "千卡" : "kcal",
    path: `items.${index}.calories`,
    valueType: "number" as const,
  }));
  fields.push(
    { id: crypto.randomUUID(), label: locale === "zh" ? "总热量" : "Total calories", value: String(Math.max(0, Math.round(totals.calories))), unit: locale === "zh" ? "千卡" : "kcal", path: "totalCalories", valueType: "number" as const },
    { id: crypto.randomUUID(), label: locale === "zh" ? "蛋白质摄入量" : "Protein", value: String(Math.max(0, totals.proteinGrams)), unit: "g", path: "proteinGrams", valueType: "number" as const },
    { id: crypto.randomUUID(), label: locale === "zh" ? "碳水摄入量" : "Carbohydrates", value: String(Math.max(0, totals.carbohydrateGrams)), unit: "g", path: "carbohydrateGrams", valueType: "number" as const },
    { id: crypto.randomUUID(), label: locale === "zh" ? "脂肪摄入量" : "Fat", value: String(Math.max(0, totals.fatGrams)), unit: "g", path: "fatGrams", valueType: "number" as const },
  );
  const names = result.items.map((item) => item.name).join(locale === "zh" ? "、" : ", ");
  return {
    id: crypto.randomUUID(),
    type: "nutrition",
    title: locale === "zh" ? "饮食记录" : "Meal record",
    summary: names,
    fields,
    payload: {
      source: "vision",
      date,
      meal,
      name: names,
      items: result.items,
      totalCalories: Math.max(0, Math.round(totals.calories)),
      calories: Math.max(0, Math.round(totals.calories)),
      proteinGrams: Math.max(0, totals.proteinGrams),
      carbohydrateGrams: Math.max(0, totals.carbohydrateGrams),
      fatGrams: Math.max(0, totals.fatGrams),
      photoUrl: result.imagePath,
      visionProvider: result.provider,
      visionModel: result.modelVersion,
    },
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.76)),
  };
}

export default function AIScreen({
  user,
  voiceRequestId = 0,
  voiceReleaseId = 0,
  voiceReleaseCancelled = false,
  externalVoiceCancelArmed = false,
  command = null,
  profileRefreshKey = 0,
  speechEnabled = true,
  active = true,
  onDataSaved,
  onConversationCompleted,
}: {
  user: User;
  voiceRequestId?: number;
  voiceReleaseId?: number;
  voiceReleaseCancelled?: boolean;
  externalVoiceCancelArmed?: boolean;
  command?: AiCommand | null;
  profileRefreshKey?: number;
  speechEnabled?: boolean;
  active?: boolean;
  onDataSaved?: () => void;
  onConversationCompleted?: () => void;
}) {
  const { locale, t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "starting" | "listening">("idle");
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [composerToolOpen, setComposerToolOpen] = useState(false);
  const [composerCameraArmed, setComposerCameraArmed] = useState(false);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [pendingEntry, setPendingEntry] = useState<StructuredEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streamingPreview, setStreamingPreview] = useState<StreamingPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationSnapshot[]>([]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [voiceCallPhase, setVoiceCallPhase] = useState<VoiceCallPhase>("idle");
  const [voiceCallTranscript, setVoiceCallTranscript] = useState("");
  const [voiceCallError, setVoiceCallError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const handledVoiceRequestRef = useRef(0);
  const handledVoiceReleaseRef = useRef(0);
  const voiceStopIntentRef = useRef<"stop" | "cancel" | null>(null);
  const voiceInitialInputRef = useRef("");
  const voicePointerActiveRef = useRef(false);
  const voicePointerStartYRef = useRef(0);
  const voiceToolTimerRef = useRef<number | null>(null);
  const voiceCameraArmedRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photoObjectUrlsRef = useRef(new Set<string>());
  const handledCommandRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<StreamingAiSpeaker | null>(null);
  const voiceCallSpeakerRef = useRef<StreamingAiSpeaker | null>(null);
  const voiceCallSessionRef = useRef<VoiceInputSession | null>(null);
  const voiceCallOpenRef = useRef(false);
  const voiceCallTranscriptRef = useRef("");
  const voiceCallSilenceTimerRef = useRef<number | null>(null);
  const voiceCallSubmittingRef = useRef(false);
  const beginVoiceCallListeningRef = useRef<() => void>(() => {});
  const submitVoiceCallTurnRef = useRef<(message: string) => void>(() => {});
  const finalizeVoiceCallInputRef = useRef<() => void>(() => {});
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
    speechRef.current?.start();
    const controller = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = controller;
    let userCommitted = false;
    setStreamingPreview({ status: null, content: "", startedAt: new Date().toISOString() });
    try {
      const result = await sendAiMessage({
        userId: user.id,
        message,
        history: messages,
        lang: locale,
        profile,
        signal: controller.signal,
        onUserMessage: (userMessage) => {
          userCommitted = true;
          setMessages((current) => [...current, userMessage]);
        },
        onStatus: (status) => setStreamingPreview((current) => current ? { ...current, status } : current),
        onDelta: (content) => {
          speechRef.current?.update(content);
          setStreamingPreview((current) => current ? { ...current, status: null, content } : current);
        },
      });
      speechRef.current?.finish(result.assistantMessage.content);
      setMessages((current) => [...current, result.assistantMessage]);
      onConversationCompleted?.();
      setStreamingPreview(null);
      setPendingEntry(parseStructuredEntry(message, locale));
      setEditingEntry(false);
    } catch (e) {
      speechRef.current?.cancel();
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : String(e));
      if (!userCommitted) setInput(message);
      setStreamingPreview(null);
      controller.abort();
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setSending(false);
    }
  }

  async function handleComposerPhoto(file: File | null) {
    if (!file || sending || photoAnalyzing) return;
    const previewUrl = URL.createObjectURL(file);
    photoObjectUrlsRef.current.add(previewUrl);
    setPendingPhotoPreview(previewUrl);
    setPhotoAnalyzing(true);
    setSending(true);
    setError(null);
    setPendingEntry(null);
    setEditingEntry(false);
    setStreamingPreview({
      status: {
        id: "vision-food",
        label: locale === "zh" ? "正在认真辨认照片里的食物…" : "Carefully identifying the food…",
        tone: profile?.occupation === "student" ? "cute" : "practical",
      },
      content: "",
      startedAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = controller;
    let userCommitted = false;
    try {
      const meal = currentMeal();
      const date = todayISO();
      const result = await analyzeDietPhoto({ userId: user.id, date, meal, file });
      if (result.imageUrl !== previewUrl && result.imageUrl.startsWith("blob:")) URL.revokeObjectURL(result.imageUrl);
      const candidate = result.items.length > 0 ? buildPhotoNutritionEntry(result, meal, date, locale) : null;
      const itemSummary = result.items.slice(0, 6).map((item) => `${item.name}${item.amount ? ` ${item.amount}` : ""} ${Math.max(0, Math.round(Number(item.calories) || 0))}kcal`).join(locale === "zh" ? "；" : "; ");
      const modelMessage = result.items.length > 0
        ? (locale === "zh"
          ? `我用相机记录了${mealLabel(meal, locale)}。视觉模型识别为：${itemSummary}。请结合这些结构化结果与我近期的饮食数据，简短评价并提醒我核对后确认保存；不要声称你亲自看过照片。`
          : `I photographed my ${mealLabel(meal, locale)}. The vision model identified: ${itemSummary}. Briefly assess it with my recent diet data, ask me to verify before saving, and do not claim that you viewed the image yourself.`)
        : (locale === "zh"
          ? "我上传了一张准备记录饮食的照片，但视觉模型没有可靠识别出食物。请简短告诉我如何重新拍摄或补充说明，不要猜测食物和热量。"
          : "I uploaded a photo for a meal record, but the vision model could not reliably identify food. Briefly explain how to retake it or add details without guessing food or calories.");
      const extractedData = candidate?.payload ?? {
        source: "vision",
        date,
        meal,
        analysisAvailable: result.analysisAvailable ?? false,
        note: result.note,
        items: [],
      };
      speechRef.current?.start();
      const response = await sendAiMessage({
        userId: user.id,
        message: modelMessage,
        displayMessage: locale === "zh" ? `拍照记录${mealLabel(meal, locale)}` : `Photo ${mealLabel(meal, locale)} record`,
        history: messages,
        lang: locale,
        profile,
        preExtracted: { dataType: "nutrition", extractedData },
        signal: controller.signal,
        onUserMessage: (userMessage) => {
          userCommitted = true;
          setPhotoPreviews((current) => ({ ...current, [userMessage.id]: previewUrl }));
          setPendingPhotoPreview(null);
          setMessages((current) => [...current, userMessage]);
        },
        onStatus: (status) => setStreamingPreview((current) => current ? { ...current, status } : current),
        onDelta: (content) => {
          speechRef.current?.update(content);
          setStreamingPreview((current) => current ? { ...current, status: null, content } : current);
        },
      });
      speechRef.current?.finish(response.assistantMessage.content);
      setMessages((current) => [...current, response.assistantMessage]);
      onConversationCompleted?.();
      setPendingEntry(candidate);
      setStreamingPreview(null);
    } catch (photoError) {
      speechRef.current?.cancel();
      if (!(photoError instanceof DOMException && photoError.name === "AbortError")) setError(photoError instanceof Error ? photoError.message : String(photoError));
      if (!userCommitted) {
        setPendingPhotoPreview(null);
        photoObjectUrlsRef.current.delete(previewUrl);
        URL.revokeObjectURL(previewUrl);
      }
      setStreamingPreview(null);
      controller.abort();
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setPhotoAnalyzing(false);
      setSending(false);
    }
  }

  async function confirmPendingEntry() {
    if (!pendingEntry || savingEntry) return;
    setSavingEntry(true);
    setError(null);
    try {
      await confirmStructuredEntry(user.id, pendingEntry);
      const savedMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: locale === "zh" ? `${pendingEntry.title}已确认保存。` : `${pendingEntry.title} was confirmed and saved.`,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, savedMessage]);
      setPendingEntry(null);
      setEditingEntry(false);
      onDataSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingEntry(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    loadProfileWithOnboarding(user.id).then(({ profile: loadedProfile, onboarding }) => {
      if (!loadedProfile) return setProfile(null);
      const answers = onboarding?.answers ?? loadedProfile.onboarding_answers ?? {};
      setProfile({
        ...loadedProfile,
        age_group: loadedProfile.age_group ?? (typeof answers.ageGroup === "string" ? answers.ageGroup : null),
        ai_personalization_consent: loadedProfile.ai_personalization_consent ?? answers.aiPersonalizationConsent === true,
        onboarding_answers: answers,
      });
    }).catch(() => setProfile(null));
    setHistory(readHistory());
  }, [profileRefreshKey, readHistory, user.id]);

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  useEffect(() => {
    speechRef.current?.cancel();
    speechRef.current = speechEnabled && active
      ? createStreamingAiSpeaker(profile, locale)
      : null;
    return () => {
      speechRef.current?.cancel();
      speechRef.current = null;
    };
  }, [active, locale, profile, speechEnabled]);

  useEffect(() => {
    if (!command || command.id === handledCommandRef.current) return;
    handledCommandRef.current = command.id;
    if (command.type === "new") {
      speechRef.current?.cancel();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setHistory(archiveConversation(messages));
      setMessages([]);
      setInput("");
      setPendingEntry(null);
      setEditingEntry(false);
      setStreamingPreview(null);
      setSending(false);
      setError(null);
      setHistoryOpen(false);
      return;
    }
    if (command.type === "history") {
      setHistory(readHistory());
      setHistoryOpen(true);
      return;
    }
    if (command.type === "voice-call") {
      if (voiceCallOpenRef.current) return;
      speechRef.current?.cancel();
      void voiceSessionRef.current?.cancel();
      voiceSessionRef.current = null;
      setVoiceState("idle");
      voiceCallOpenRef.current = true;
      voiceCallSubmittingRef.current = false;
      voiceCallTranscriptRef.current = "";
      setVoiceCallTranscript("");
      setVoiceCallError(null);
      setVoiceCallPhase("connecting");
      setVoiceCallOpen(true);
      return;
    }
    if (command.type === "clear") {
      speechRef.current?.cancel();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setMessages([]);
      setInput("");
      setPendingEntry(null);
      setEditingEntry(false);
      setStreamingPreview(null);
      setSending(false);
      setError(null);
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
  }, [messages.length, pendingPhotoPreview, streamingPreview?.content, streamingPreview?.status?.id]);

  const voiceErrorText = useCallback((voiceError: VoiceInputError) => {
    if (voiceError.code === "permission_denied") return t("ai.voicePermissionDenied");
    if (voiceError.code === "audio_unavailable") return t("ai.voiceAudioUnavailable");
    if (voiceError.code === "voice_unavailable") return t("ai.voiceUnavailable");
    return t("ai.voiceFailed");
  }, [t]);

  const clearVoiceCallSilenceTimer = useCallback(() => {
    if (voiceCallSilenceTimerRef.current === null) return;
    window.clearTimeout(voiceCallSilenceTimerRef.current);
    voiceCallSilenceTimerRef.current = null;
  }, []);

  const endVoiceCall = useCallback(() => {
    voiceCallOpenRef.current = false;
    voiceCallSubmittingRef.current = false;
    clearVoiceCallSilenceTimer();
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    void voiceCallSessionRef.current?.cancel();
    voiceCallSessionRef.current = null;
    voiceCallSpeakerRef.current?.cancel();
    voiceCallSpeakerRef.current = null;
    setVoiceCallOpen(false);
    setVoiceCallPhase("idle");
    setVoiceCallTranscript("");
    setVoiceCallError(null);
    setSending(false);
  }, [clearVoiceCallSilenceTimer]);

  const beginVoiceCallListening = useCallback(async () => {
    if (!voiceCallOpenRef.current || voiceCallSessionRef.current || voiceCallSubmittingRef.current) return;
    clearVoiceCallSilenceTimer();
    voiceCallTranscriptRef.current = "";
    setVoiceCallTranscript("");
    setVoiceCallError(null);
    setVoiceCallPhase("listening");
    try {
      const session = await startVoiceInput({
        locale,
        onTranscript: (transcript, isFinal) => {
          if (!voiceCallOpenRef.current || voiceCallSubmittingRef.current) return;
          const normalized = transcript.trim();
          if (!normalized) return;
          voiceCallTranscriptRef.current = normalized;
          setVoiceCallTranscript(normalized);
          clearVoiceCallSilenceTimer();
          voiceCallSilenceTimerRef.current = window.setTimeout(
            () => finalizeVoiceCallInputRef.current(),
            voiceEndpointDelayMs(normalized, isFinal),
          );
        },
        onEnd: () => {
          voiceCallSessionRef.current = null;
          if (!voiceCallOpenRef.current || voiceCallSubmittingRef.current) return;
          clearVoiceCallSilenceTimer();
          voiceCallSilenceTimerRef.current = window.setTimeout(
            () => voiceCallTranscriptRef.current.trim()
              ? finalizeVoiceCallInputRef.current()
              : beginVoiceCallListeningRef.current(),
            voiceCallTranscriptRef.current.trim()
              ? voiceEndpointDelayMs(voiceCallTranscriptRef.current, true)
              : 300,
          );
        },
        onError: (voiceError) => {
          if (!voiceCallOpenRef.current) return;
          voiceCallSubmittingRef.current = true;
          setVoiceCallError(voiceErrorText(voiceError));
          setVoiceCallPhase("error");
        },
      });
      if (!voiceCallOpenRef.current || voiceCallSubmittingRef.current) {
        await session.cancel();
        return;
      }
      voiceCallSessionRef.current = session;
    } catch (voiceError) {
      if (!voiceCallOpenRef.current) return;
      voiceCallSubmittingRef.current = true;
      setVoiceCallError(voiceErrorText(voiceError as VoiceInputError));
      setVoiceCallPhase("error");
    }
  }, [clearVoiceCallSilenceTimer, locale, voiceErrorText]);
  beginVoiceCallListeningRef.current = () => void beginVoiceCallListening();

  const submitVoiceCallTurn = useCallback(async (message: string) => {
    if (!voiceCallOpenRef.current || !message.trim()) return;
    if (!isAiSpeechSupported()) {
      setVoiceCallError(locale === "zh" ? "当前设备不支持语音播放。" : "Speech playback is unavailable on this device.");
      setVoiceCallPhase("error");
      voiceCallSubmittingRef.current = false;
      return;
    }

    setSending(true);
    setVoiceCallError(null);
    setVoiceCallPhase("thinking");
    const controller = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = controller;
    const speaker = createStreamingAiSpeaker(profile, locale);
    voiceCallSpeakerRef.current?.cancel();
    voiceCallSpeakerRef.current = speaker;
    speaker.start();
    try {
      const result = await sendAiMessage({
        userId: user.id,
        message,
        history: messages,
        lang: locale,
        profile,
        responseMode: "voice",
        signal: controller.signal,
        onUserMessage: (userMessage) => setMessages((current) => [...current, userMessage]),
        onStatus: () => {
          if (voiceCallOpenRef.current) setVoiceCallPhase("thinking");
        },
        onDelta: (content) => {
          if (!voiceCallOpenRef.current) return;
          setVoiceCallPhase("speaking");
          speaker.update(content);
        },
      });
      speaker.finish(result.assistantMessage.content);
      setMessages((current) => [...current, result.assistantMessage]);
      onConversationCompleted?.();
      setPendingEntry(parseStructuredEntry(message, locale));
      setEditingEntry(false);
      await speaker.whenDone();
      if (!voiceCallOpenRef.current) return;
      voiceCallSubmittingRef.current = false;
      setVoiceCallPhase("connecting");
      window.setTimeout(() => beginVoiceCallListeningRef.current(), 360);
    } catch (callError) {
      speaker.cancel();
      if (!voiceCallOpenRef.current) return;
      voiceCallSubmittingRef.current = false;
      if (!(callError instanceof DOMException && callError.name === "AbortError")) {
        setVoiceCallError(callError instanceof Error ? callError.message : String(callError));
        setVoiceCallPhase("error");
      }
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      if (voiceCallSpeakerRef.current === speaker) voiceCallSpeakerRef.current = null;
      setSending(false);
    }
  }, [locale, messages, onConversationCompleted, profile, user.id]);
  submitVoiceCallTurnRef.current = (message) => void submitVoiceCallTurn(message);

  const finalizeVoiceCallInput = useCallback(async () => {
    if (!voiceCallOpenRef.current || voiceCallSubmittingRef.current) return;
    clearVoiceCallSilenceTimer();
    const message = voiceCallTranscriptRef.current.trim();
    if (!message) {
      beginVoiceCallListeningRef.current();
      return;
    }
    voiceCallSubmittingRef.current = true;
    const session = voiceCallSessionRef.current;
    voiceCallSessionRef.current = null;
    if (session) await session.stop();
    if (!voiceCallOpenRef.current) return;
    submitVoiceCallTurnRef.current(message);
  }, [clearVoiceCallSilenceTimer]);
  finalizeVoiceCallInputRef.current = () => void finalizeVoiceCallInput();

  useEffect(() => {
    if (!voiceCallOpen || voiceCallPhase !== "connecting") return undefined;
    const timer = window.setTimeout(() => beginVoiceCallListeningRef.current(), 420);
    return () => window.clearTimeout(timer);
  }, [voiceCallOpen, voiceCallPhase]);

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
    speechRef.current?.cancel();
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

  const clearComposerToolTimer = () => {
    if (voiceToolTimerRef.current === null) return;
    window.clearTimeout(voiceToolTimerRef.current);
    voiceToolTimerRef.current = null;
  };

  const closeComposerTools = () => {
    clearComposerToolTimer();
    voiceCameraArmedRef.current = false;
    setComposerCameraArmed(false);
    setComposerToolOpen(false);
  };

  const openComposerCamera = () => {
    voicePointerActiveRef.current = false;
    voiceStopIntentRef.current = "cancel";
    if (voiceSessionRef.current) void stopVoiceInput(true);
    closeComposerTools();
    cameraInputRef.current?.click();
  };

  const beginComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (sending || photoAnalyzing) return;
    voicePointerActiveRef.current = true;
    voicePointerStartYRef.current = event.clientY;
    setVoiceCancelArmed(false);
    voiceCameraArmedRef.current = false;
    setComposerCameraArmed(false);
    setComposerToolOpen(false);
    clearComposerToolTimer();
    voiceToolTimerRef.current = window.setTimeout(() => {
      voiceToolTimerRef.current = null;
      if (!voicePointerActiveRef.current) return;
      setComposerToolOpen(true);
      navigator.vibrate?.(8);
    }, 320);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void beginVoiceInput();
  };

  const moveComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!voicePointerActiveRef.current) return;
    const cameraArmed = voicePointerStartYRef.current - event.clientY >= 58;
    if (cameraArmed === voiceCameraArmedRef.current) return;
    voiceCameraArmedRef.current = cameraArmed;
    setComposerCameraArmed(cameraArmed);
    setComposerToolOpen(true);
    navigator.vibrate?.(cameraArmed ? 12 : 5);
  };

  const finishComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>, forceCancel = false) => {
    if (!voicePointerActiveRef.current) return;
    voicePointerActiveRef.current = false;
    clearComposerToolTimer();
    const cameraSelected = !forceCancel && (voiceCameraArmedRef.current || voicePointerStartYRef.current - event.clientY >= 58);
    if (cameraSelected) {
      openComposerCamera();
      return;
    }
    voiceStopIntentRef.current = forceCancel ? "cancel" : "stop";
    if (voiceSessionRef.current) void stopVoiceInput(forceCancel);
    setVoiceCancelArmed(false);
    closeComposerTools();
  };

  useEffect(() => {
    if (!active && voiceCallOpen) endVoiceCall();
  }, [active, endVoiceCall, voiceCallOpen]);

  useEffect(() => () => {
    if (voiceToolTimerRef.current !== null) window.clearTimeout(voiceToolTimerRef.current);
    photoObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrlsRef.current.clear();
    voiceCallOpenRef.current = false;
    voiceCallSubmittingRef.current = false;
    clearVoiceCallSilenceTimer();
    void voiceCallSessionRef.current?.cancel();
    voiceCallSessionRef.current = null;
    voiceCallSpeakerRef.current?.cancel();
    voiceCallSpeakerRef.current = null;
    speechRef.current?.cancel();
    speechRef.current = null;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    void voiceSessionRef.current?.cancel();
    voiceSessionRef.current = null;
  }, [clearVoiceCallSilenceTimer]);

  const voiceCallStatus = voiceCallPhase === "listening"
    ? (locale === "zh" ? "我在听，说完后会自动回应" : "Listening — I will respond when you finish")
    : voiceCallPhase === "thinking"
      ? (locale === "zh" ? "正在理解你的话" : "Understanding what you said")
      : voiceCallPhase === "speaking"
        ? (locale === "zh" ? "NAVA 正在回答" : "NAVA is speaking")
        : voiceCallPhase === "error"
          ? (locale === "zh" ? "通话暂时中断" : "The call was interrupted")
          : (locale === "zh" ? "正在接通…" : "Connecting…");

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
                {isUser && photoPreviews[message.id] && (
                  <img className="chat-photo-preview" src={photoPreviews[message.id]} alt={locale === "zh" ? "刚刚拍摄的饮食照片" : "New meal photo"} data-chat-photo="saved" />
                )}
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
        {pendingPhotoPreview && (
          <div className="chat-message-row user chat-photo-pending" aria-live="polite">
            <article className="chat-bubble user">
              <img className="chat-photo-preview" src={pendingPhotoPreview} alt={locale === "zh" ? "正在识别的饮食照片" : "Meal photo being analyzed"} data-chat-photo="analyzing" />
              <p><LoaderCircle size={14} aria-hidden="true" />{locale === "zh" ? "正在识别餐食…" : "Identifying meal…"}</p>
              <time>{new Date().toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
            </article>
            <span className="chat-avatar user" aria-hidden="true">
              {profile?.avatar_url && !avatarLoadFailed
                ? <img src={profile.avatar_url} alt="" onError={() => setAvatarLoadFailed(true)} />
                : (profile?.username?.trim().slice(0, 1).toUpperCase() || user.email?.slice(0, 1).toUpperCase() || "N")}
            </span>
          </div>
        )}
        {streamingPreview && (
          <div className="chat-message-row assistant ai-streaming-row" data-ai-streaming="true" aria-live="polite">
            <span className="chat-avatar assistant" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <article className="chat-bubble assistant streaming">
              {streamingPreview.status ? (
                <p
                  className={`ai-processing-status tone-${streamingPreview.status.tone}`}
                  data-ai-processing-step={streamingPreview.status.id}
                  data-ai-processing-tone={streamingPreview.status.tone}
                  key={streamingPreview.status.id}
                >
                  <span aria-hidden="true" />
                  {streamingPreview.status.label}
                </p>
              ) : (
                <p className="ai-streaming-content">
                  {streamingPreview.content}
                  <span className="ai-streaming-cursor" aria-hidden="true" />
                </p>
              )}
              {streamingPreview.content && (
                <time>{new Date(streamingPreview.startedAt).toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
              )}
            </article>
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {pendingEntry && (
        <section className="structured-confirmation" data-structured-confirmation={pendingEntry.type}>
          <header className="structured-confirmation-title">
            <h2>{locale === "zh" ? "识别结果" : "Recognized data"}</h2>
          </header>
          <div className="structured-record-list">
            {(pendingEntry.entries ?? [pendingEntry]).map((record) => (
              <section className="structured-record" key={record.id} data-structured-record={record.type}>
                <h3>{record.title}</h3>
                <div className="structured-field-list">
                  {record.fields.map((field) => (
                    <label className="structured-field-row" key={field.id}>
                      <span>{field.label}</span>
                      {editingEntry ? (
                        <span className="structured-field-editor">
                          <input
                            aria-label={`${field.label}${locale === "zh" ? "数值" : " value"}`}
                            inputMode={field.valueType === "number" ? "decimal" : "text"}
                            value={field.value}
                            onChange={(event) => setPendingEntry((current) => current ? updateStructuredEntryField(current, field.id, event.target.value) : current)}
                          />
                          {field.unit && <em>{field.unit}</em>}
                        </span>
                      ) : (
                        <strong>{field.value}{field.unit ? ` ${field.unit}` : ""}</strong>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <footer>
            <button type="button" className={editingEntry ? "active" : ""} onClick={() => setEditingEntry((current) => !current)} aria-label={locale === "zh" ? "逐项编辑" : "Edit fields"}>{editingEntry ? <Check size={18} /> : <Pencil size={18} />}</button>
            <button type="button" onClick={() => { setPendingEntry(null); setEditingEntry(false); }} aria-label={locale === "zh" ? "取消" : "Cancel"}><X size={18} /></button>
            <button type="button" data-confirm-structured onClick={() => void confirmPendingEntry()} disabled={savingEntry}><Check size={18} /><span>{locale === "zh" ? "确认保存" : "Confirm"}</span></button>
          </footer>
        </section>
      )}

      <form className={["chat-composer", voiceState !== "idle" ? "voice-active" : "", composerToolOpen ? "tool-open" : "", photoAnalyzing ? "photo-analyzing" : ""].filter(Boolean).join(" ")} onSubmit={submit}>
        <div className="chat-input-shell">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={composerCameraArmed
              ? (locale === "zh" ? "松手拍照识别" : "Release to take a photo")
              : (voiceCancelArmed || externalVoiceCancelArmed)
                ? t("ai.voiceCancelHint")
                : voiceState === "starting"
                  ? t("ai.voiceStarting")
                  : voiceState === "listening"
                    ? (composerToolOpen ? (locale === "zh" ? "上滑到相机，松手拍照" : "Slide up to the camera") : t("ai.voiceListening"))
                    : t("ai.placeholder")}
          />
        </div>
        <div className="chat-voice-control" data-composer-camera-armed={composerCameraArmed ? "true" : "false"}>
          {composerToolOpen && (
            <button
              className={["chat-camera-shortcut", composerCameraArmed ? "selected" : ""].filter(Boolean).join(" ")}
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openComposerCamera}
              aria-label={locale === "zh" ? "拍照识别并记录" : "Take a photo to identify and record"}
            >
              <Camera size={21} />
              <span>{locale === "zh" ? "拍照" : "Photo"}</span>
            </button>
          )}
          <input
            ref={cameraInputRef}
            className="chat-camera-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              void handleComposerPhoto(file);
            }}
          />
          <button
            className={["chat-voice-button", voiceState !== "idle" ? "active" : "", (voiceCancelArmed || externalVoiceCancelArmed) ? "cancel-armed" : "", composerCameraArmed ? "camera-armed" : ""].filter(Boolean).join(" ")}
            type="button"
            disabled={sending || photoAnalyzing}
            onPointerDown={beginComposerVoice}
            onPointerMove={moveComposerVoice}
            onPointerUp={(event) => finishComposerVoice(event)}
            onPointerCancel={(event) => finishComposerVoice(event, true)}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={composerCameraArmed ? (locale === "zh" ? "松手拍照" : "Release for photo") : t("ai.voiceReleaseHint")}
            title={locale === "zh" ? "按住说话，上滑拍照" : "Hold to speak, slide up for a photo"}
          >
            {photoAnalyzing ? <LoaderCircle className="chat-photo-spinner" size={20} /> : <Mic size={20} />}
          </button>
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

      {voiceCallOpen && (
        <section
          className={`ai-voice-call phase-${voiceCallPhase}`}
          role="dialog"
          aria-modal="true"
          aria-label={locale === "zh" ? "与 NAVA 语音聊天" : "Voice chat with NAVA"}
          data-voice-call-phase={voiceCallPhase}
        >
          <div className="ai-voice-call-heading">
            <span>{locale === "zh" ? "与 NAVA 通话中" : "NAVA voice chat"}</span>
            <small>{locale === "zh" ? "自动识别说话结束" : "Automatic turn detection"}</small>
          </div>
          <div className="ai-voice-call-stage" aria-live="polite">
            <span className="voice-ripple ripple-one" aria-hidden="true" />
            <span className="voice-ripple ripple-two" aria-hidden="true" />
            <span className="voice-ripple ripple-three" aria-hidden="true" />
            <div className="voice-call-orb" aria-hidden="true">
              <PhoneCall size={48} strokeWidth={1.7} />
            </div>
          </div>
          <div className="ai-voice-call-copy">
            <strong>{voiceCallStatus}</strong>
            {voiceCallPhase === "listening" && voiceCallTranscript && (
              <span>{voiceCallTranscript.length > 42 ? `${voiceCallTranscript.slice(0, 42)}…` : voiceCallTranscript}</span>
            )}
            {voiceCallError && <span className="voice-call-error">{voiceCallError}</span>}
            {voiceCallPhase === "error" && (
              <button type="button" onClick={() => {
                voiceCallSubmittingRef.current = false;
                setVoiceCallError(null);
                setVoiceCallPhase("connecting");
              }}>
                {locale === "zh" ? "重新连接" : "Reconnect"}
              </button>
            )}
          </div>
          <button className="voice-call-end" type="button" onClick={endVoiceCall} aria-label={locale === "zh" ? "结束通话" : "End call"}>
            <PhoneOff size={25} />
          </button>
        </section>
      )}

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
