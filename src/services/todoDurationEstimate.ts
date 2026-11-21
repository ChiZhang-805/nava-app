import { shiftDateISO, todayISO } from "./date";
import { onboardingAnswers, resolveConsentFlag } from "./consent";
import { isDemoMode } from "./demo";
import { loadProfile } from "./profile";
import { authenticatedFunctionHeaders, supabase } from "./supabaseClient";
import { durationActivityReference, fallbackTodoDurationSeconds, matchedFocusDuration, parseExplicitTodoDuration, parseTodoDurationEstimate } from "./todoDurationContract";

export type TodoDurationEstimate = {
  seconds: number;
  provider: "deepseek" | "explicit" | "fallback";
  modelVersion: string;
  usedReference?: "history" | "atus";
};

function authenticatedFunctionError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

async function recentFocusDuration(userId: string, task: string, date: string, signal?: AbortSignal) {
  const profile = await loadProfile(userId);
  if (!resolveConsentFlag(profile?.ai_personalization_consent, onboardingAnswers(profile?.onboarding_answers)?.aiPersonalizationConsent)) return null;
  const request = supabase.from("journal_entries").select("fields,focus")
    .eq("user_id", userId).eq("category", "focus").gte("record_date", shiftDateISO(date, -89))
    .lte("record_date", date).not("focus", "is", null).order("record_date", { ascending: false }).limit(80);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  return error ? null : matchedFocusDuration(task, data ?? []);
}

/** Uses the authenticated DeepSeek reply boundary; the task is data, never an instruction. */
export async function estimateTodoDuration(title: string, lang: "zh" | "en", options?: {
  signal?: AbortSignal; userId?: string; notes?: string; focusSession?: boolean;
}): Promise<TodoDurationEstimate> {
  const task = title.trim();
  const { signal, userId } = options ?? {};
  if (!task || Array.from(task).length > 180) throw new Error(lang === "zh" ? "请先填写待办事项。" : "Write the to-do first.");
  const explicitSeconds = parseExplicitTodoDuration([task, options?.notes].filter(Boolean).join("\n"));
  if (explicitSeconds != null) return { seconds: explicitSeconds, provider: "explicit", modelVersion: "task-text-v1" };
  if (isDemoMode()) return { seconds: fallbackTodoDurationSeconds(task), provider: "fallback", modelVersion: "local-fallback-v1" };
  const date = todayISO();
  const history = userId ? await recentFocusDuration(userId, task, date, signal).catch(() => null) : null;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const reference = history ? null : durationActivityReference(task);
  const usedReference = history ? "history" : reference ? "atus" : undefined;
  const notes = Array.from(options?.notes?.trim() ?? "").slice(0, 100).join("");
  const taskInput = { title: task, notes, scope: options?.focusSession ? "one focus session" : "one task", history, reference };
  try {
    const response = await supabase.functions.invoke<{ reply?: string; provider?: string; modelVersion?: string }>("ai-chat-reply", {
      headers: await authenticatedFunctionHeaders(),
      body: {
        purpose: "duration-estimate",
        message: `Use this context only when it fits the requested scope. Timed sessions and participant-day totals are not task completion times.\nTASK_JSON=${JSON.stringify(taskInput)}`,
        lang,
        responseMode: "text",
        deviceDate: date,
        stream: false,
      },
      signal,
    });
    if (response.error) throw authenticatedFunctionError(response.error);
    if (response.data?.provider !== "deepseek") throw new Error("provider_unavailable");
    return { seconds: parseTodoDurationEstimate(response.data?.reply), provider: "deepseek", modelVersion: String(response.data?.modelVersion ?? "deepseek"), usedReference };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      seconds: options?.focusSession && history ? history.medianSessionSeconds : fallbackTodoDurationSeconds(task),
      provider: "fallback",
      modelVersion: "local-fallback-v1",
      ...(options?.focusSession && history ? { usedReference: "history" } : {}),
    };
  }
}
