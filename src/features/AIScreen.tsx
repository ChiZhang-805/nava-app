import { sumFoodItemNutrition } from "../services/dietPortion";
import type { User } from "@supabase/supabase-js";
import { Camera, Check, FileText, Image as ImageIcon, LoaderCircle, Mic, Pencil, PhoneCall, PhoneOff, Plus, SendHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { Fragment, FormEvent, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale } from "../i18n";
import PageSkeleton from "../components/PageSkeleton";
import CameraCapture from "../components/CameraCapture";
import PhotoInput from "../components/PhotoInput";
import { usePreviewActivity } from "../hooks/usePreviewActivity";
import { createConversationGreeting, deleteConversationMessages, generateConversationTitle, loadConversation, sendAiMessage } from "../services/ai";
import type { AiProcessingStep } from "../services/aiProcessing";
import { createStreamingAiSpeaker, isAiSpeechSupported, resolveAiSpeechStyle, type StreamingAiSpeaker } from "../services/aiSpeech";
import { todayISO } from "../services/date";
import { analyzeDietPhoto } from "../services/media";
import { loadProfileWithOnboarding } from "../services/onboarding";
import type { UserProfile } from "../services/profile";
import { startVoiceInput, type VoiceInputError, type VoiceInputSession } from "../services/voice";
import { voiceEndpointDelayMs } from "../services/voiceEndpoint";
import { confirmStructuredEntry, parseStructuredEntry, type StructuredEntry } from "../services/structuredEntry";
import { applyPhotoNutritionCorrection, updateStructuredEntryField } from "../services/structuredEntryParser";
import type { ChatMessage, DietExtractResult } from "../types";
import { isDemoMode } from "../services/demo";
import { deleteConversationArchive, loadConversationArchives, saveConversationArchive, type ConversationArchive } from "../services/userCloudState";
import { buildChatDocumentMessage, chatAttachmentAccept, readChatDocument, validateChatImage, type PendingChatDocument } from "../services/chatAttachments";
import {
  conversationArchiveId,
  conversationDayKey,
  conversationNeedsDailyRollover,
  fallbackConversationTitle,
  normalizeGeneratedConversationTitle,
  type ConversationSnapshot,
} from "../services/aiConversationSessions";

export type AiCommand = {
  id: number;
  type: "new" | "history" | "voice-call" | "clear" | "export";
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
  const totals = result.totals ?? sumFoodItemNutrition(result.items);
  const amountText = (value: number | null | undefined) => value == null ? "" : String(value);
  const fields: StructuredEntry["fields"] = result.items.flatMap((item, index) => [
    ...(Number(item.weight_grams) > 0 ? [{
      id: crypto.randomUUID(),
      label: `${item.name}${locale === "zh" ? " · 估算份量" : " · estimated portion"}`,
      value: String(item.weight_grams),
      unit: "g",
      path: `items.${index}.weight_grams`,
      valueType: "number" as const,
    }] : []),
    {
      id: crypto.randomUUID(),
      label: `${item.name}${locale === "zh" ? " · 估算热量" : " · estimated calories"}`,
      value: amountText(item.calories),
      unit: locale === "zh" ? "千卡" : "kcal",
      path: `items.${index}.calories`,
      valueType: "number" as const,
    },
  ]);
  fields.push(
    { id: crypto.randomUUID(), label: locale === "zh" ? "估算总热量" : "Estimated total calories", value: amountText(totals.calories), unit: locale === "zh" ? "千卡" : "kcal", path: "totalCalories", valueType: "number" as const, readOnly: true },
    { id: crypto.randomUUID(), label: locale === "zh" ? "蛋白质摄入量" : "Protein", value: amountText(totals.proteinGrams), unit: "g", path: "proteinGrams", valueType: "number" as const, readOnly: true },
    { id: crypto.randomUUID(), label: locale === "zh" ? "碳水摄入量" : "Carbohydrates", value: amountText(totals.carbohydrateGrams), unit: "g", path: "carbohydrateGrams", valueType: "number" as const, readOnly: true },
    { id: crypto.randomUUID(), label: locale === "zh" ? "脂肪摄入量" : "Fat", value: amountText(totals.fatGrams), unit: "g", path: "fatGrams", valueType: "number" as const, readOnly: true },
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
      totalCalories: totals.calories,
      calories: totals.calories,
      proteinGrams: totals.proteinGrams,
      carbohydrateGrams: totals.carbohydrateGrams,
      fatGrams: totals.fatGrams,
      photoUrl: result.imagePath,
      visionProvider: result.provider,
      visionModel: result.modelVersion,
      uncertaintyNote: result.note?.slice(0, 240) ?? "",
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
  initialPromptRequest = null,
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
  initialPromptRequest?: { id: number; text: string } | null;
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const voiceGeneration = useRef(0);
  const voiceInputAbort = useRef<AbortController | null>(null);
  const voiceCallAbort = useRef<AbortController | null>(null);
  const voiceStarting = useRef(false);
  const mediaActive = useRef(false);
  mediaActive.current = voiceState !== "idle" || audioPlaying;
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<PendingChatDocument | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [pendingEntry, setPendingEntry] = useState<StructuredEntry | null>(null);
  const [pendingEntryMessageId, setPendingEntryMessageId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streamingPreview, setStreamingPreview] = useState<StreamingPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationSnapshot[]>([]);
  const [viewingArchiveId, setViewingArchiveId] = useState<string | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);
  const [deviceDayKey, setDeviceDayKey] = useState(() => todayISO());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [voiceCallPhase, setVoiceCallPhase] = useState<VoiceCallPhase>("idle");
  const [voiceCallTranscript, setVoiceCallTranscript] = useState("");
  const [voiceCallError, setVoiceCallError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const handledVoiceRequestRef = useRef(0);
  const handledVoiceReleaseRef = useRef(0);
  const handledPromptRequestRef = useRef(0);
  const voiceStopIntentRef = useRef<"stop" | "cancel" | null>(null);
  const voiceInitialInputRef = useRef("");
  const voicePointerActiveRef = useRef(false);
  const voicePointerStartYRef = useRef(0);
  const attachmentControlRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
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
  const conversationLoadRequestRef = useRef(0);
  const historyKey = `nava-ai-history:${user.id}`;

  const normalizeHistory = useCallback((items: Array<ConversationSnapshot | ConversationArchive<ChatMessage>>) => {
    const normalized: ConversationSnapshot[] = [];
    for (const candidate of [...items].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))) {
      if (!candidate || !Array.isArray(candidate.messages) || candidate.messages.length === 0) continue;
      const createdAt = Number.isFinite(new Date(candidate.createdAt).getTime()) ? candidate.createdAt : candidate.messages[0].created_at;
      const dayKey = candidate.dayKey || conversationDayKey(candidate.messages, new Date(createdAt));
      normalized.push({
        id: candidate.id || conversationArchiveId(candidate.messages),
        createdAt,
        dayKey,
        title: candidate.title?.trim() || fallbackConversationTitle(dayKey, locale, normalized),
        messages: candidate.messages,
      });
    }
    return normalized.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 20);
  }, [locale]);

  const readHistory = useCallback(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(historyKey) ?? "[]") as ConversationSnapshot[];
      return Array.isArray(value) ? normalizeHistory(value) : [];
    } catch {
      return [];
    }
  }, [historyKey, normalizeHistory]);

  const writeHistory = useCallback((items: ConversationSnapshot[]) => {
    const normalized = normalizeHistory(items);
    window.localStorage.setItem(historyKey, JSON.stringify(normalized));
    return normalized;
  }, [historyKey, normalizeHistory]);

  const hydrateHistory = useCallback(async () => {
    const local = readHistory();
    const remote = await loadConversationArchives<ChatMessage>(user.id);
    const merged = new Map<string, ConversationSnapshot>();
    for (const snapshot of [...normalizeHistory(remote), ...local]) merged.set(snapshot.id, snapshot);
    const normalized = writeHistory([...merged.values()]);
    if (!isDemoMode() && local.length > 0) {
      await Promise.all(local.map((snapshot) => saveConversationArchive(user.id, snapshot)));
    }
    return normalized;
  }, [normalizeHistory, readHistory, user.id, writeHistory]);

  const archiveConversation = useCallback((current: ChatMessage[]) => {
    if (current.length === 0) return readHistory();
    const existing = readHistory();
    const dayKey = conversationDayKey(current);
    const snapshot: ConversationSnapshot = {
      id: conversationArchiveId(current),
      createdAt: current[0]?.created_at ?? new Date().toISOString(),
      dayKey,
      title: fallbackConversationTitle(dayKey, locale, existing),
      messages: current,
    };
    const next = writeHistory([snapshot, ...existing.filter((item) => item.id !== snapshot.id)]);
    void (async () => {
      try {
        await saveConversationArchive(user.id, snapshot);
        await deleteConversationMessages(user.id, current.map((message) => message.id));
      } catch (archiveError) {
        console.warn("AI conversation archive sync deferred", archiveError);
        return;
      }
      if (profile?.ai_personalization_consent !== true) return;
      try {
        const generated = await generateConversationTitle(current, locale);
        const title = generated ? normalizeGeneratedConversationTitle(generated, locale) : null;
        if (!title) return;
        const titledSnapshot = { ...snapshot, title };
        const titledHistory = writeHistory([titledSnapshot, ...readHistory().filter((item) => item.id !== snapshot.id)]);
        setHistory(titledHistory);
        await saveConversationArchive(user.id, titledSnapshot);
      } catch (titleError) {
        console.warn("AI conversation title generation deferred", titleError);
      }
    })();
    return next;
  }, [locale, profile?.ai_personalization_consent, readHistory, user.id, writeHistory]);

  const refresh = useCallback(async () => {
    const requestId = ++conversationLoadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const conversation = await loadConversation(user.id, locale);
      if (requestId === conversationLoadRequestRef.current) {
        if (conversationNeedsDailyRollover(conversation, deviceDayKey)) {
          setHistory(archiveConversation(conversation));
          const greeting = await createConversationGreeting(user.id, locale);
          if (requestId === conversationLoadRequestRef.current) setMessages([greeting]);
        } else if (conversation.length === 0) {
          const greeting = await createConversationGreeting(user.id, locale);
          if (requestId === conversationLoadRequestRef.current) setMessages([greeting]);
        } else {
          setMessages(conversation);
        }
        setViewingArchiveId(null);
      }
    } catch (e) {
      if (requestId === conversationLoadRequestRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId === conversationLoadRequestRef.current) setLoading(false);
    }
  }, [archiveConversation, deviceDayKey, locale, user.id]);

  const prepareConversationForMessage = useCallback(() => {
    const currentDay = todayISO();
    const rolledOver = conversationNeedsDailyRollover(messages, currentDay);
    if (!rolledOver) return { history: messages, rolledOver: false };
    setHistory(archiveConversation(messages));
    setMessages([]);
    setViewingArchiveId(null);
    setDeviceDayKey(currentDay);
    return { history: [] as ChatMessage[], rolledOver: true };
  }, [archiveConversation, messages]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typedMessage = input.trim();
    const document = pendingDocument;
    if (!typedMessage && !document) return;
    interruptMedia();
    const message = document ? buildChatDocumentMessage(document, typedMessage, locale) : typedMessage;
    const displayMessage = document
      ? [typedMessage, `📎 ${document.name}`].filter(Boolean).join("\n")
      : undefined;
    setInput("");
    setPendingDocument(null);
    setAttachmentMenuOpen(false);
    setSending(true);
    setError(null);
    speechRef.current?.start();
    const controller = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = controller;
    const conversation = prepareConversationForMessage();
    const photoEntry = pendingEntry?.type === "nutrition" && pendingEntry.payload.source === "vision"
      ? applyPhotoNutritionCorrection(pendingEntry, typedMessage)
      : null;
    setPendingEntry(null);
    setPendingEntryMessageId(null);
    setEditingEntry(false);
    let userCommitted = false;
    setStreamingPreview({ status: null, content: "", startedAt: new Date().toISOString() });
    try {
      const result = await sendAiMessage({
        userId: user.id,
        message,
        displayMessage,
        history: conversation.history,
        lang: locale,
        profile,
        ...(photoEntry
          ? { preExtracted: { dataType: "nutrition", extractedData: photoEntry.payload } }
          : {}),
        signal: controller.signal,
        onUserMessage: (userMessage) => {
          userCommitted = true;
          setMessages((current) => [...(conversation.rolledOver ? [] : current), userMessage]);
        },
        onStatus: (status) => setStreamingPreview((current) => current ? { ...current, status } : current),
        onDelta: (content) => {
          speechRef.current?.update(content);
          setStreamingPreview((current) => current ? { ...current, status: null, content } : current);
        },
      });
      speechRef.current?.finish(result.assistantMessage.content);
      setMessages((current) => [...current, result.assistantMessage]);
      setStreamingPreview(null);
      const recognizedEntry = photoEntry
        ? photoEntry
        : typedMessage
        ? parseStructuredEntry(typedMessage, locale, {
          dataType: result.dataType,
          extractedData: result.extractedData,
          confidence: result.extractionConfidence,
        }, { allowLocalHealthFallback: isDemoMode() })
        : null;
      setPendingEntry(recognizedEntry);
      setPendingEntryMessageId(recognizedEntry ? result.assistantMessage.id : null);
      setEditingEntry(false);
      if (!recognizedEntry) onConversationCompleted?.();
    } catch (e) {
      speechRef.current?.cancel();
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : String(e));
      if (!userCommitted) {
        setInput(typedMessage);
        setPendingDocument(document);
      }
      setStreamingPreview(null);
      controller.abort();
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setSending(false);
    }
  }

  async function handleComposerPhoto(file: File | null) {
    if (!file || sending || photoAnalyzing) return;
    const fileIssue = validateChatImage(file);
    if (fileIssue) {
      setError(locale === "zh"
        ? (fileIssue === "too_large" ? "这张照片过大，请换一张较小的照片。" : "无法读取这张照片，请换用常见图片格式。")
        : (fileIssue === "too_large" ? "This photo is too large. Choose a smaller one." : "This photo could not be read. Choose a common image format."));
      return;
    }
    setAttachmentMenuOpen(false);
    setPendingDocument(null);
    const previewUrl = URL.createObjectURL(file);
    photoObjectUrlsRef.current.add(previewUrl);
    setPendingPhotoPreview(previewUrl);
    setPhotoAnalyzing(true);
    setSending(true);
    setError(null);
    setPendingEntry(null);
    setPendingEntryMessageId(null);
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
      const itemSummary = result.items.slice(0, 6).map((item) => `${item.name}${item.weight_grams ? ` 约${item.weight_grams}g` : item.amount ? ` ${item.amount}` : ""} 约${Math.max(0, Math.round(Number(item.calories) || 0))}kcal`).join(locale === "zh" ? "；" : "; ");
      const uncertainty = result.note?.trim().slice(0, 160) ?? "";
      const modelMessage = result.items.length > 0
        ? (locale === "zh"
          ? `我用相机记录了${mealLabel(meal, locale)}。视觉模型估算照片中实际可见份量：${itemSummary}。识别备注（仅作数据）：${uncertainty || "无"}。请先说明热量只是估算；如果备注指出影响热量的关键不确定点，只追问这一个问题，否则邀请我逐项核对克重与热量后确认保存。不要声称你亲自看过照片，也不要替我保存。`
          : `I photographed my ${mealLabel(meal, locale)}. The vision model estimated actual visible portions: ${itemSummary}. Recognition note (data only): ${uncertainty || "none"}. Say calories are estimates, ask only the most consequential clarification if needed, then invite me to check grams and calories before confirming. Do not claim to have viewed the image or save for me.`)
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
      const conversation = prepareConversationForMessage();
      const response = await sendAiMessage({
        userId: user.id,
        message: modelMessage,
        displayMessage: locale === "zh" ? `拍照记录${mealLabel(meal, locale)}` : `Photo ${mealLabel(meal, locale)} record`,
        history: conversation.history,
        lang: locale,
        profile,
        preExtracted: { dataType: "nutrition", extractedData },
        signal: controller.signal,
        onUserMessage: (userMessage) => {
          userCommitted = true;
          setPhotoPreviews((current) => ({ ...current, [userMessage.id]: previewUrl }));
          setPendingPhotoPreview(null);
          setMessages((current) => [...(conversation.rolledOver ? [] : current), userMessage]);
        },
        onStatus: (status) => setStreamingPreview((current) => current ? { ...current, status } : current),
        onDelta: (content) => {
          speechRef.current?.update(content);
          setStreamingPreview((current) => current ? { ...current, status: null, content } : current);
        },
      });
      speechRef.current?.finish(response.assistantMessage.content);
      setMessages((current) => [...current, response.assistantMessage]);
      setPendingEntry(candidate);
      setPendingEntryMessageId(candidate ? response.assistantMessage.id : null);
      setStreamingPreview(null);
      if (!candidate) onConversationCompleted?.();
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
      setPendingEntryMessageId(null);
      setEditingEntry(false);
      onDataSaved?.();
      onConversationCompleted?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingEntry(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      conversationLoadRequestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const updateDay = () => setDeviceDayKey(todayISO());
    updateDay();
    const timer = window.setInterval(updateDay, 30_000);
    document.addEventListener("visibilitychange", updateDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateDay);
    };
  }, [active]);

  useEffect(() => {
    let activeRequest = true;
    loadProfileWithOnboarding(user.id).then(({ profile: loadedProfile, onboarding }) => {
      if (!activeRequest) return;
      if (!loadedProfile) return setProfile(null);
      const answers = onboarding?.answers ?? loadedProfile.onboarding_answers ?? {};
      setProfile({
        ...loadedProfile,
        age_group: loadedProfile.age_group ?? (typeof answers.ageGroup === "string" ? answers.ageGroup : null),
        ai_personalization_consent: loadedProfile.ai_personalization_consent ?? answers.aiPersonalizationConsent === true,
        onboarding_answers: answers,
      });
    }).catch(() => {
      if (activeRequest) setProfile(null);
    });
    setHistory(readHistory());
    void hydrateHistory()
      .then((items) => { if (activeRequest) setHistory(items); })
      .catch((historyError) => console.warn("AI conversation history restore deferred", historyError));
    return () => {
      activeRequest = false;
    };
  }, [hydrateHistory, profileRefreshKey, readHistory, user.id]);

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  useEffect(() => {
    if (!active || !initialPromptRequest || initialPromptRequest.id === handledPromptRequestRef.current) return;
    handledPromptRequestRef.current = initialPromptRequest.id;
    setInput(initialPromptRequest.text);
    setError(null);
  }, [active, initialPromptRequest]);

  const speechProfileRef = useRef(profile); speechProfileRef.current = profile;
  const speechStyleKey = JSON.stringify(resolveAiSpeechStyle(profile, locale));
  useEffect(() => {
    speechRef.current?.cancel();
    speechRef.current = speechEnabled && active
      ? createStreamingAiSpeaker(speechProfileRef.current, locale, setAudioPlaying)
      : null;
    return () => {
      speechRef.current?.cancel();
      speechRef.current = null;
    };
  }, [active, locale, speechStyleKey, speechEnabled]);

  useEffect(() => {
    if (!command || command.id === handledCommandRef.current) return;
    handledCommandRef.current = command.id;
    if (command.type === "new") {
      speechRef.current?.cancel();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (viewingArchiveId) {
        void loadConversation(user.id, locale)
          .then((current) => setHistory(archiveConversation(current)))
          .catch((archiveError) => console.warn("AI active conversation archive deferred", archiveError));
      } else {
        setHistory(archiveConversation(messages));
      }
      setMessages([]);
      setViewingArchiveId(null);
      setInput("");
      setPendingDocument(null);
      setAttachmentMenuOpen(false);
      setPendingEntry(null);
      setPendingEntryMessageId(null);
      setEditingEntry(false);
      setStreamingPreview(null);
      setSending(false);
      setError(null);
      setHistoryOpen(false);
      void createConversationGreeting(user.id, locale)
        .then((greeting) => setMessages([greeting]))
        .catch((greetingError) => setError(greetingError instanceof Error ? greetingError.message : String(greetingError)));
      return;
    }
    if (command.type === "history") {
      setHistory(readHistory());
      setHistoryOpen(true);
      void hydrateHistory().then(setHistory).catch((historyError) => console.warn("AI conversation history restore deferred", historyError));
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
      if (viewingArchiveId) {
        void loadConversation(user.id, locale)
          .then((current) => deleteConversationMessages(user.id, current.map((message) => message.id)))
          .catch((clearError) => console.warn("AI active conversation clear deferred", clearError));
      } else {
        void deleteConversationMessages(user.id, messages.map((message) => message.id))
          .catch((clearError) => console.warn("AI active conversation clear deferred", clearError));
      }
      setMessages([]);
      setViewingArchiveId(null);
      setInput("");
      setPendingDocument(null);
      setAttachmentMenuOpen(false);
      setPendingEntry(null);
      setPendingEntryMessageId(null);
      setEditingEntry(false);
      setStreamingPreview(null);
      setSending(false);
      setError(null);
      setHistoryOpen(false);
      void createConversationGreeting(user.id, locale)
        .then((greeting) => setMessages([greeting]))
        .catch((greetingError) => setError(greetingError instanceof Error ? greetingError.message : String(greetingError)));
      return;
    }
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), messages }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nava-conversation-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [archiveConversation, command, hydrateHistory, locale, messages, readHistory, user.id, viewingArchiveId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" });
  }, [messages.length, pendingEntry?.id, pendingPhotoPreview, streamingPreview?.content, streamingPreview?.status?.id]);

  async function removeArchivedConversation(snapshot: ConversationSnapshot) {
    if (deletingArchiveId) return;
    setDeletingArchiveId(snapshot.id);
    try {
      await deleteConversationArchive(user.id, snapshot.id);
      const next = writeHistory(readHistory().filter((item) => item.id !== snapshot.id));
      setHistory(next);
      if (viewingArchiveId === snapshot.id) await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingArchiveId(null);
    }
  }

  const voiceErrorText = useCallback((voiceError: VoiceInputError) => {
    if (voiceError.code === "permission_denied") return t("ai.voicePermissionDenied");
    if (voiceError.code === "audio_unavailable") return t("ai.voiceAudioUnavailable");
    if (voiceError.code === "voice_unavailable") return t("ai.voiceUnavailable");
    if (voiceError.code === "voice_interrupted") return locale === "zh" ? "录音已中断，文字保留，请手动重新开启。" : "Recording interrupted. Text kept; restart manually.";
    return t("ai.voiceFailed");
  }, [t, locale]);

  const clearVoiceCallSilenceTimer = useCallback(() => {
    if (voiceCallSilenceTimerRef.current === null) return;
    window.clearTimeout(voiceCallSilenceTimerRef.current);
    voiceCallSilenceTimerRef.current = null;
  }, []);

  const endVoiceCall = useCallback(() => {
    voiceCallOpenRef.current = false;
    voiceCallAbort.current?.abort(); voiceCallAbort.current = null;
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
    const controller = new AbortController();
    const previousController = voiceCallAbort.current;
    voiceCallAbort.current = controller;
    previousController?.abort();
    try {
      const session = await startVoiceInput({
        locale,
        signal: controller.signal,
        onTranscript: (transcript, isFinal) => {
          if (controller.signal.aborted || !voiceCallOpenRef.current || voiceCallSubmittingRef.current) return;
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
          if (controller.signal.aborted) return;
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
          if (controller.signal.aborted || !voiceCallOpenRef.current) return;
          voiceCallSubmittingRef.current = true;
          setVoiceCallError(voiceErrorText(voiceError));
          setVoiceCallPhase("error");
        },
      });
      if (controller.signal.aborted || !voiceCallOpenRef.current || voiceCallSubmittingRef.current) {
        await session.cancel();
        return;
      }
      voiceCallSessionRef.current = session;
    } catch (voiceError) {
      if (controller.signal.aborted || !voiceCallOpenRef.current) return;
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
      const conversation = prepareConversationForMessage();
      const result = await sendAiMessage({
        userId: user.id,
        message,
        history: conversation.history,
        lang: locale,
        profile,
        responseMode: "voice",
        signal: controller.signal,
        onUserMessage: (userMessage) => setMessages((current) => [...(conversation.rolledOver ? [] : current), userMessage]),
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
      const recognizedEntry = parseStructuredEntry(message, locale, {
        dataType: result.dataType,
        extractedData: result.extractedData,
        confidence: result.extractionConfidence,
      }, { allowLocalHealthFallback: isDemoMode() });
      setPendingEntry(recognizedEntry);
      setPendingEntryMessageId(recognizedEntry ? result.assistantMessage.id : null);
      setEditingEntry(false);
      if (!recognizedEntry) onConversationCompleted?.();
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
  }, [locale, onConversationCompleted, prepareConversationForMessage, profile, user.id]);
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
    voiceStopIntentRef.current = cancel ? "cancel" : "stop";
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    if (!session) {
      if (voiceStarting.current) {
        voiceGeneration.current++;
        voiceInputAbort.current?.abort();
        setVoiceState("idle");
        if (cancel) setInput(voiceInitialInputRef.current);
      }
      return;
    }
    try {
      await (cancel ? session.cancel() : session.stop());
    } finally {
      if (cancel) setInput(voiceInitialInputRef.current);
      setVoiceState("idle");
    }
  }, []);

  const beginVoiceInput = useCallback(async () => {
    if (!active || sending || voiceState !== "idle" || voiceStarting.current) return;
    voiceStarting.current = true;
    const generation = ++voiceGeneration.current;
    voiceInputAbort.current?.abort();
    const controller = new AbortController(); voiceInputAbort.current = controller;
    let ended = false;
    speechRef.current?.cancel();
    voiceInitialInputRef.current = input;
    voiceStopIntentRef.current = null;
    setError(null);
    setMediaNotice(null);
    setVoiceState("starting");
    try {
      const session = await startVoiceInput({
        locale,
        signal: controller.signal,
        onTranscript: (transcript) => { if (generation === voiceGeneration.current) setInput([voiceInitialInputRef.current.trim(), transcript].filter(Boolean).join(" ")); },
        onEnd: () => {
          ended = true;
          if (generation !== voiceGeneration.current) return;
          voiceSessionRef.current = null;
          setVoiceState("idle");
        },
        onError: (voiceError) => { if (generation === voiceGeneration.current) setError(voiceErrorText(voiceError)); },
      });
      if (generation !== voiceGeneration.current || ended) { await session.cancel(); return; }
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
      if (generation !== voiceGeneration.current) return;
      setVoiceState("idle");
      setError(voiceErrorText(voiceError as VoiceInputError));
    } finally { voiceStarting.current = false; }
  }, [active, input, locale, sending, voiceErrorText, voiceState]);

  useEffect(() => {
    if (voiceRequestId <= 0 || voiceRequestId === handledVoiceRequestRef.current) return;
    handledVoiceRequestRef.current = voiceRequestId;
    void beginVoiceInput();
  }, [beginVoiceInput, voiceRequestId]);

  useEffect(() => {
    if (voiceReleaseId <= 0 || voiceReleaseId === handledVoiceReleaseRef.current) return;
    handledVoiceReleaseRef.current = voiceReleaseId;
    void stopVoiceInput(voiceReleaseCancelled);
  }, [stopVoiceInput, voiceReleaseCancelled, voiceReleaseId]);

  const openComposerCamera = () => {
    setAttachmentMenuOpen(false);
    interruptMedia();
    setCameraOpen(true);
  };

  const openComposerPhotoLibrary = () => {
    setAttachmentMenuOpen(false);
    photoInputRef.current?.click();
  };

  const openComposerDocumentPicker = () => {
    setAttachmentMenuOpen(false);
    documentInputRef.current?.click();
  };

  const handleComposerDocument = async (file: File | null) => {
    if (!file || sending || photoAnalyzing) return;
    setAttachmentMenuOpen(false);
    setError(null);
    try {
      const document = await readChatDocument(file);
      setPendingDocument(document);
      setPendingPhotoPreview(null);
    } catch (documentError) {
      const code = documentError instanceof Error ? documentError.message : "unsupported";
      setError(locale === "zh"
        ? (code === "too_large" ? "这个文件过大，请换一个较小的文件。" : "无法读取这个文件，请换用文本、Markdown、CSV 或 JSON 文件。")
        : (code === "too_large" ? "This file is too large. Choose a smaller one." : "This file could not be read. Choose a text, Markdown, CSV, or JSON file."));
    }
  };

  const beginComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (sending || photoAnalyzing) return;
    voicePointerActiveRef.current = true;
    voicePointerStartYRef.current = event.clientY;
    setVoiceCancelArmed(false);
    setAttachmentMenuOpen(false);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void beginVoiceInput();
  };

  const moveComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!voicePointerActiveRef.current) return;
    const cancelArmed = voicePointerStartYRef.current - event.clientY >= 58;
    setVoiceCancelArmed((current) => {
      if (cancelArmed !== current) navigator.vibrate?.(cancelArmed ? 12 : 5);
      return cancelArmed;
    });
  };

  const finishComposerVoice = (event: ReactPointerEvent<HTMLButtonElement>, forceCancel = false) => {
    if (!voicePointerActiveRef.current) return;
    voicePointerActiveRef.current = false;
    const cancel = forceCancel || voicePointerStartYRef.current - event.clientY >= 58;
    void stopVoiceInput(cancel);
    setVoiceCancelArmed(false);
  };

  const interruptMedia = useCallback((simulated = false) => {
    const wasActive = mediaActive.current || voiceCallOpenRef.current;
    voiceGeneration.current++;
    voiceInputAbort.current?.abort(); voiceInputAbort.current = null;
    voiceStopIntentRef.current = "cancel";
    voicePointerActiveRef.current = false;
    const session = voiceSessionRef.current; voiceSessionRef.current = null;
    void session?.cancel().catch(() => undefined);
    speechRef.current?.cancel();
    if (voiceCallOpenRef.current) {
      const transcript = voiceCallTranscriptRef.current.trim();
      if (transcript && !voiceCallSubmittingRef.current) setInput((current) => [current.trim(), transcript].filter(Boolean).join(" "));
      endVoiceCall();
    }
    setVoiceState("idle"); setVoiceCancelArmed(false); setAudioPlaying(false);
    if (simulated) setMediaNotice("");
    else if (wasActive) setMediaNotice(locale === "zh" ? "录音与播放已停止，文字已保留。" : "Recording and playback stopped. Your text is kept.");
  }, [endVoiceCall, locale]);
  usePreviewActivity(voiceState !== "idle" || (voiceCallOpen && voiceCallPhase !== "speaking") ? "recording" : "playback", active && !cameraOpen && (voiceState !== "idle" || voiceCallOpen || audioPlaying) ? "running" : null, () => interruptMedia(true));
  useEffect(() => {
    if (!active) { interruptMedia(); setCameraOpen(false); }
    const hide = () => { if (document.hidden) interruptMedia(); };
    const leave = () => interruptMedia();
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", leave);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); };
  }, [active, interruptMedia]);

  useEffect(() => {
    if (!attachmentMenuOpen) return undefined;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && attachmentControlRef.current?.contains(event.target)) return;
      setAttachmentMenuOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => () => {
    voiceGeneration.current++;
    voiceInputAbort.current?.abort(); voiceCallAbort.current?.abort();
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

  const structuredConfirmation = pendingEntry ? (
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
                  {editingEntry && !field.readOnly ? (
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
      {pendingEntry.type === "nutrition" && pendingEntry.payload.source === "vision" && (
        <p className="structured-confirmation-note">{locale === "zh"
          ? "照片只提供估算。可逐项修改份量和热量；总量随之更新，确认后才保存。"
          : "Photo values are estimates. Edit each portion or calories; totals update before you confirm."}</p>
      )}
      <footer>
        <button type="button" className={editingEntry ? "active" : ""} onClick={() => setEditingEntry((current) => !current)} aria-label={locale === "zh" ? "逐项编辑" : "Edit fields"}>{editingEntry ? <Check size={18} /> : <Pencil size={18} />}</button>
        <button type="button" onClick={() => { setPendingEntry(null); setPendingEntryMessageId(null); setEditingEntry(false); }} aria-label={locale === "zh" ? "取消" : "Cancel"}><X size={18} /></button>
        <button type="button" data-confirm-structured onClick={() => void confirmPendingEntry()} disabled={savingEntry}><Check size={18} /><span>{locale === "zh" ? "确认保存" : "Confirm"}</span></button>
      </footer>
    </section>
  ) : null;
  const viewingSnapshot = viewingArchiveId ? history.find((snapshot) => snapshot.id === viewingArchiveId) ?? null : null;

  if (loading) return <div className="chat-layout"><PageSkeleton variant="ai" /></div>;

  return (
    <div className="chat-layout">
      {cameraOpen && <CameraCapture locale={locale} facing="environment" onClose={() => setCameraOpen(false)} onFallback={() => { setCameraOpen(false); cameraInputRef.current?.click(); }} onCapture={(file) => { setCameraOpen(false); void handleComposerPhoto(file); }} />}
      {mediaNotice && <p className="chat-media-notice" role="status">{mediaNotice}<button type="button" onClick={() => setMediaNotice(null)} aria-label={locale === "zh" ? "关闭中断提示" : "Dismiss interruption notice"}><X size={16} /></button></p>}
      <div className="chat-list" ref={listRef}>
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <Fragment key={message.id}>
              <div className={["chat-message-row", isUser ? "user" : "assistant"].join(" ")}>
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
              {!isUser && pendingEntryMessageId === message.id && structuredConfirmation}
            </Fragment>
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

      {viewingSnapshot ? <div className="chat-archive-return" role="status">
        <span><strong>{viewingSnapshot.title}</strong><small>{locale === "zh" ? "历史会话只读预览" : "Read-only history preview"}</small></span>
        <button type="button" onClick={() => void refresh()}>{locale === "zh" ? "返回今日对话" : "Back to today's chat"}</button>
      </div> : <form className={["chat-composer", voiceState !== "idle" ? "voice-active" : "", attachmentMenuOpen ? "attachment-open" : "", photoAnalyzing ? "photo-analyzing" : "", pendingDocument ? "has-document" : ""].filter(Boolean).join(" ")} onSubmit={submit}>
        {pendingDocument && (
          <div className="chat-pending-document" aria-live="polite">
            <FileText size={17} aria-hidden="true" />
            <span>{pendingDocument.name}</span>
            <button type="button" onClick={() => setPendingDocument(null)} aria-label={locale === "zh" ? "移除文件" : "Remove file"}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className="chat-attachment-control" ref={attachmentControlRef}>
          <button
            className="chat-attachment-trigger"
            type="button"
            disabled={sending || photoAnalyzing}
            aria-expanded={attachmentMenuOpen}
            aria-controls="chat-attachment-menu"
            aria-label={locale === "zh" ? "添加附件" : "Add attachment"}
            title={locale === "zh" ? "添加附件" : "Add attachment"}
            onClick={() => setAttachmentMenuOpen((open) => !open)}
          >
            <Plus size={22} />
          </button>
          {attachmentMenuOpen && (
            <div className="chat-attachment-menu" id="chat-attachment-menu" role="menu">
              <button type="button" role="menuitem" onClick={openComposerPhotoLibrary}>
                <ImageIcon size={19} aria-hidden="true" />
                <span>{locale === "zh" ? "上传照片" : "Photo library"}</span>
              </button>
              <button type="button" role="menuitem" onClick={openComposerDocumentPicker}>
                <FileText size={19} aria-hidden="true" />
                <span>{locale === "zh" ? "上传文件" : "Choose file"}</span>
              </button>
              <button type="button" role="menuitem" onClick={openComposerCamera}>
                <Camera size={19} aria-hidden="true" />
                <span>{locale === "zh" ? "拍照" : "Take photo"}</span>
              </button>
            </div>
          )}
          <PhotoInput locale={locale} onError={setError}
            ref={photoInputRef}
            className="chat-attachment-input chat-photo-input"
            type="file"
            accept={chatAttachmentAccept.images}
            onFile={(file) => { void handleComposerPhoto(file); }}
          />
          <input
            ref={documentInputRef}
            className="chat-attachment-input chat-document-input"
            type="file"
            accept={chatAttachmentAccept.documents}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              void handleComposerDocument(file);
            }}
          />
          <PhotoInput locale={locale} onError={setError}
            ref={cameraInputRef}
            className="chat-attachment-input chat-camera-input"
            type="file"
            accept={chatAttachmentAccept.images}
            capture="environment"
            onFile={(file) => { void handleComposerPhoto(file); }}
          />
        </div>
        <div className="chat-input-shell">
          <input
            value={input}
            onChange={(e) => { if (voiceState !== "idle") interruptMedia(); setInput(e.target.value); }}
            placeholder={(voiceCancelArmed || externalVoiceCancelArmed)
              ? t("ai.voiceCancelHint")
              : voiceState === "starting"
                ? t("ai.voiceStarting")
                : voiceState === "listening"
                  ? t("ai.voiceListening")
                  : t("ai.placeholder")}
          />
        </div>
        <div className="chat-voice-control">
          <button
            className={["chat-voice-button", voiceState !== "idle" ? "active" : "", (voiceCancelArmed || externalVoiceCancelArmed) ? "cancel-armed" : ""].filter(Boolean).join(" ")}
            type="button"
            disabled={sending || photoAnalyzing}
            onPointerDown={beginComposerVoice}
            onPointerMove={moveComposerVoice}
            onPointerUp={(event) => finishComposerVoice(event)}
            onPointerCancel={(event) => finishComposerVoice(event, true)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              if (event.detail !== 0) return;
              if (voiceState === "idle") void beginVoiceInput();
              else void stopVoiceInput();
            }}
            aria-pressed={voiceState !== "idle"}
            aria-label={t("ai.voiceReleaseHint")}
            title={locale === "zh" ? "按住说话，上滑取消" : "Hold to speak, slide up to cancel"}
          >
            {photoAnalyzing ? <LoaderCircle className="chat-photo-spinner" size={20} /> : <Mic size={20} />}
          </button>
        </div>
        <button
          className="chat-send-button"
          type="submit"
          disabled={sending || (!input.trim() && !pendingDocument)}
          aria-label={t("ai.send")}
          title={t("ai.send")}
        >
          <SendHorizontal size={21} />
        </button>
      </form>}

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
              <div className="ai-history-row" key={snapshot.id}>
                <button className="ai-history-open" type="button" onClick={() => { setMessages(snapshot.messages); setViewingArchiveId(snapshot.id); setHistoryOpen(false); }}>
                  <strong>{snapshot.title}</strong>
                  <span>{new Date(snapshot.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</span>
                </button>
                <button className="ai-history-delete" type="button" disabled={deletingArchiveId === snapshot.id} onClick={() => void removeArchivedConversation(snapshot)} aria-label={locale === "zh" ? `删除${snapshot.title}` : `Delete ${snapshot.title}`} title={locale === "zh" ? "删除历史会话" : "Delete conversation"}>
                  {deletingArchiveId === snapshot.id ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
