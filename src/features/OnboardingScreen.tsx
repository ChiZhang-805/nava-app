import { CheckCircle2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { completeOnboarding, type OnboardingStatus } from "../services/onboarding";
import {
  answersFromFirstNotesProfile,
  blankFirstNotesProfile,
  clearFirstNotesDraft,
  firstNotesFromAnswers,
  isFirstNotesComplete,
  normalizeFirstNotesDraft,
  normalizeFirstNotesProfile,
  readFirstNotesDraft,
  writeFirstNotesDraft,
  type FirstNotesDraft,
  type FirstNotesLanguage,
  type FirstNotesProfile,
} from "../services/onboardingFirstNotes";

type OnboardingMode = "first" | "review";

type Props = {
  user: { id: string };
  status?: OnboardingStatus | null;
  mode?: OnboardingMode;
  previewOnly?: boolean;
  onComplete: (status: OnboardingStatus) => void;
};

type HostMessage =
  | { channel?: unknown; type?: "ready" }
  | { channel?: unknown; type?: "draft"; draft?: unknown }
  | { channel?: unknown; type?: "complete"; profile?: unknown };

const iframePath = `${import.meta.env.BASE_URL}journal/onboarding.html?v=nava-first-run-20260923-v17`;

function createChannel() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(4);
    window.crypto.getRandomValues(buffer);
    return `nava-first-run-${Array.from(buffer, (part) => part.toString(36)).join("-")}`;
  }
  return `nava-first-run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function initialDraftFor(
  userId: string,
  status: OnboardingStatus | null | undefined,
  locale: FirstNotesLanguage,
  mode: OnboardingMode,
): FirstNotesDraft {
  const savedProfile = firstNotesFromAnswers(status?.answers, locale, status?.completedAt);
  if (mode === "review" && savedProfile) {
    return {
      version: 1,
      profile: savedProfile,
      step: isFirstNotesComplete(savedProfile) ? "summary" : "welcome",
    };
  }
  const draft = readFirstNotesDraft(userId, locale);
  if (draft && (mode !== "first" || !status?.completed)) return draft;
  if (savedProfile && !status?.completed) return { version: 1, profile: savedProfile, step: "welcome" };
  return { version: 1, profile: blankFirstNotesProfile(locale), step: "welcome" };
}

export default function OnboardingScreen({ user, status = null, mode = "first", previewOnly = false, onComplete }: Props) {
  const { locale, setLocale } = useLocale();
  const normalizedLocale: FirstNotesLanguage = locale === "en" ? "en" : "zh";
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channel = useMemo(createChannel, [attempt]);
  const initialDraft = useMemo(
    () => previewOnly
      ? { version: 1, profile: blankFirstNotesProfile(normalizedLocale), step: "welcome" } satisfies FirstNotesDraft
      : initialDraftFor(user.id, status, normalizedLocale, mode),
    [mode, normalizedLocale, previewOnly, status, user.id],
  );
  const latestStatusRef = useRef(status);
  latestStatusRef.current = status;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({ channel, ...message }, window.location.origin);
  }, [channel]);

  const handleSave = useCallback(async (profileCandidate: FirstNotesProfile) => {
    if (saving) return;
    const profile = normalizeFirstNotesProfile(profileCandidate, { fallbackLanguage: normalizedLocale });
    if (!profile) {
      postToFrame({ type: "save-error" });
      setError(locale === "zh" ? "这份初见手记还没写完整。" : "These first notes are not complete yet.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const answers = answersFromFirstNotesProfile(profile, latestStatusRef.current?.answers);
      if (!previewOnly) {
        await completeOnboarding(user.id, answers);
        clearFirstNotesDraft(user.id);
      }
      if (!mountedRef.current) return;
      if (profile.language !== locale) setLocale(profile.language);
      postToFrame({ type: "saved" });
      setSaved(true);
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        onComplete({
          completed: true,
          completedAt: answers.firstNotesProfile && typeof answers.firstNotesProfile === "object" && "completedAt" in answers.firstNotesProfile
            ? String((answers.firstNotesProfile as { completedAt?: unknown }).completedAt)
            : new Date().toISOString(),
          version: 3,
          answers,
          source: previewOnly ? "none" : "remote",
        });
      }, 420);
    } catch (saveError) {
      if (!mountedRef.current) return;
      postToFrame({ type: "save-error" });
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [locale, normalizedLocale, onComplete, postToFrame, previewOnly, saving, setLocale, user.id]);

  useEffect(() => {
    setReady(false);
    setSaving(false);
    setSaved(false);
    setError(null);
  }, [attempt, channel]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.channel !== channel) return;
      if (event.data.type === "ready") {
        setReady(true);
        postToFrame({
          type: "init",
          profile: initialDraft.profile,
          step: initialDraft.step,
        });
      } else if (event.data.type === "draft") {
        const draft = normalizeFirstNotesDraft(event.data.draft, normalizedLocale);
        if (draft && !previewOnly) writeFirstNotesDraft(user.id, draft);
      } else if (event.data.type === "complete") {
        const profile = normalizeFirstNotesProfile(event.data.profile, { fallbackLanguage: normalizedLocale });
        if (profile) void handleSave(profile);
        else {
          postToFrame({ type: "save-error" });
          setError(locale === "zh" ? "这份初见手记还没写完整。" : "These first notes are not complete yet.");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [channel, handleSave, initialDraft.profile, initialDraft.step, locale, normalizedLocale, postToFrame, previewOnly, user.id]);

  return (
    <main className="onboarding-screen onboarding-screen--first-notes" data-mode={mode}>
      <iframe
        key={`${channel}-${attempt}`}
        ref={frameRef}
        name={channel}
        src={iframePath}
        title={locale === "zh" ? "初见手记" : "First notes"}
        sandbox="allow-scripts allow-same-origin"
      />
      {(!ready || saving || saved || error) && (
        <div className={["onboarding-frame-status", error ? "is-error" : "", saved ? "is-saved" : ""].filter(Boolean).join(" ")} role={error ? "alert" : "status"}>
          {error ? (
            <>
              <p>{error}</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw size={15} />
                <span>{locale === "zh" ? "重试" : "Retry"}</span>
              </button>
            </>
          ) : saved ? (
            <>
              <CheckCircle2 size={18} />
              <p>{locale === "zh" ? "初见手记已保存" : "First notes saved"}</p>
            </>
          ) : (
            <>
              <RefreshCw className={saving ? "spin" : undefined} size={18} />
              <p>{saving ? (locale === "zh" ? "正在保存初见手记…" : "Saving first notes…") : (locale === "zh" ? "正在准备初见手记…" : "Preparing first notes…")}</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
