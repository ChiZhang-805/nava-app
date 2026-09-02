import type { UserProfile } from "./profile";
import { onboardingAnswers, resolveConsentFlag } from "./consent.ts";

export type AiSpeechStyle = {
  lang: "zh-CN" | "en-US";
  rate: number;
  pitch: number;
  volume: number;
};

type SpeechProfile = Pick<
  UserProfile,
  "occupation" | "age_group" | "ai_personalization_consent" | "onboarding_answers"
>;

export type SpeechChunkResult = {
  chunks: string[];
  remainder: string;
};

export type StreamingAiSpeaker = {
  start: () => void;
  update: (content: string) => void;
  finish: (content?: string) => void;
  cancel: () => void;
  whenDone: () => Promise<void>;
};

const strongBoundaries = new Set(["。", "！", "？", "!", "?", "\n"]);
const softBoundaries = new Set(["，", ",", "；", ";", "：", ":"]);
const closingMarks = new Set(["”", "’", "\"", "'", "）", ")", "】", "]", "》", "〉"]);
const preferredClauseLength = 42;
const hardChunkLength = 96;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveAiSpeechStyle(
  profile: SpeechProfile | null | undefined,
  locale: "zh" | "en",
): AiSpeechStyle {
  const neutral: AiSpeechStyle = {
    lang: locale === "zh" ? "zh-CN" : "en-US",
    rate: locale === "zh" ? 0.98 : 1,
    pitch: 1,
    volume: 1,
  };
  const answers = onboardingAnswers(profile?.onboarding_answers);
  const personalized = resolveConsentFlag(profile?.ai_personalization_consent, answers?.aiPersonalizationConsent);
  if (!personalized) return neutral;

  const occupation = text(profile?.occupation ?? answers?.occupation);
  const ageGroup = text(profile?.age_group ?? answers?.ageGroup);

  if (occupation === "retired" || ageGroup === "55_64" || ageGroup === "65_plus") {
    return { ...neutral, rate: locale === "zh" ? 0.9 : 0.92, pitch: 0.97 };
  }
  if (occupation === "student" || ageGroup === "18_24") {
    return { ...neutral, rate: locale === "zh" ? 1.04 : 1.06, pitch: 1.05 };
  }
  if (occupation === "employee") {
    return { ...neutral, rate: locale === "zh" ? 1 : 1.02, pitch: 0.99 };
  }
  if (occupation === "caregiver") {
    return { ...neutral, rate: locale === "zh" ? 0.94 : 0.96, pitch: 1.02 };
  }
  if (occupation === "freelance") {
    return { ...neutral, rate: locale === "zh" ? 1.01 : 1.03, pitch: 1.02 };
  }
  return neutral;
}

export function sanitizeSpeechText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+] |\d+[.)] )/gm, "")
    .replace(/[>*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushChunk(chunks: string[], value: string) {
  const cleaned = sanitizeSpeechText(value);
  if (cleaned) chunks.push(cleaned);
}

export function takeSpeakableChunks(value: string, flush = false): SpeechChunkResult {
  const chunks: string[] = [];
  let start = 0;
  let index = 0;

  while (index < value.length) {
    if (!strongBoundaries.has(value[index])) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < value.length && closingMarks.has(value[end])) end += 1;
    pushChunk(chunks, value.slice(start, end));
    start = end;
    index = end;
  }

  let remainder = value.slice(start);
  while (!flush && remainder.length >= preferredClauseLength) {
    const searchEnd = Math.min(remainder.length, hardChunkLength);
    let boundary = -1;
    for (let cursor = preferredClauseLength - 1; cursor < searchEnd; cursor += 1) {
      if (softBoundaries.has(remainder[cursor])) {
        boundary = cursor + 1;
        break;
      }
    }
    if (boundary < 0 && remainder.length >= hardChunkLength) {
      const window = remainder.slice(0, hardChunkLength);
      const whitespace = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\t"));
      boundary = whitespace >= preferredClauseLength / 2 ? whitespace + 1 : hardChunkLength;
    }
    if (boundary < 0) break;
    pushChunk(chunks, remainder.slice(0, boundary));
    remainder = remainder.slice(boundary);
  }

  if (flush) {
    pushChunk(chunks, remainder);
    remainder = "";
  }
  return { chunks, remainder };
}

function chooseVoice(voices: SpeechSynthesisVoice[], lang: AiSpeechStyle["lang"]) {
  const exact = voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.slice(0, 2).toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ?? null;
}

export function isAiSpeechSupported() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance !== "undefined";
}

export function createStreamingAiSpeaker(
  profile: SpeechProfile | null | undefined,
  locale: "zh" | "en",
): StreamingAiSpeaker {
  if (!isAiSpeechSupported()) {
    return { start() {}, update() {}, finish() {}, cancel() {}, whenDone: async () => {} };
  }

  const synthesis = window.speechSynthesis;
  const style = resolveAiSpeechStyle(profile, locale);
  let lastContent = "";
  let pending = "";
  let generation = 0;
  let pendingUtterances = 0;
  let idleResolvers: Array<() => void> = [];

  const resolveIdle = () => {
    if (pendingUtterances > 0) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  };

  const speakChunks = (chunks: string[]) => {
    for (const chunk of chunks) {
      const utteranceGeneration = generation;
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = style.lang;
      utterance.rate = style.rate;
      utterance.pitch = style.pitch;
      utterance.volume = style.volume;
      const voice = chooseVoice(synthesis.getVoices(), style.lang);
      if (voice) utterance.voice = voice;
      pendingUtterances += 1;
      const settle = () => {
        if (utteranceGeneration !== generation) return;
        pendingUtterances = Math.max(0, pendingUtterances - 1);
        resolveIdle();
      };
      utterance.onend = settle;
      utterance.onerror = settle;
      synthesis.speak(utterance);
    }
  };

  const start = () => {
    generation += 1;
    synthesis.cancel();
    pendingUtterances = 0;
    resolveIdle();
    lastContent = "";
    pending = "";
  };

  const update = (content: string) => {
    if (!content) return;
    if (lastContent && !content.startsWith(lastContent)) {
      if (lastContent.trim() === content.trim()) return;
      start();
    }
    const delta = content.slice(lastContent.length);
    lastContent = content;
    if (!delta) return;
    const next = takeSpeakableChunks(pending + delta);
    pending = next.remainder;
    speakChunks(next.chunks);
  };

  const finish = (content?: string) => {
    if (content) update(content);
    const final = takeSpeakableChunks(pending, true);
    pending = "";
    speakChunks(final.chunks);
  };

  const cancel = () => {
    generation += 1;
    synthesis.cancel();
    pendingUtterances = 0;
    resolveIdle();
    lastContent = "";
    pending = "";
  };

  const whenDone = () => pendingUtterances === 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => idleResolvers.push(resolve));

  return { start, update, finish, cancel, whenDone };
}
