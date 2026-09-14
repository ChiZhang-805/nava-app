import type { FocusLanguage, FocusRequest } from "../_shared/focus-contract.ts";

type Phase =
  | "evidence"
  | "provider_headers"
  | "provider_body"
  | "provider_switch"
  | "retry_wait"
  | "validation"
  | "complete";
type Outcome = "running" | "success" | "deadline" | "cancelled" | "failed";
type FocusModel = "deepseek-v4-flash" | "deepseek-v4-pro";
type Event = {
  phase: Phase;
  elapsedMs: number;
  attempt: number;
  status?: number;
  valid?: boolean;
  finish?: "stop" | "length" | "other";
};

/** One generation deadline, at most three format attempts plus ONE transport retry.
 * Diagnostics deliberately contain only enums, timings and counts, never model/user text.
 */
export function createFocusRun(
  kind: FocusRequest["kind"],
  lang: FocusLanguage,
  caller: AbortSignal,
  options: {
    timeoutMs?: number;
    fetch?: typeof fetch;
    retryDelayMs?: number;
    primaryTimeoutMs?: number;
    primaryModel?: FocusModel;
  } = {},
) {
  const started = Date.now();
  const deadline = started + (options.timeoutMs ?? 60_000);
  const controller = new AbortController();
  const requestId = crypto.randomUUID();
  const events: Event[] = [];
  let phase: Phase = "evidence";
  let outcome: Outcome = "running";
  let calls = 0;
  let retryUsed = false;
  // Real dual-site checks found flash accepting headers without completing a
  // body, while pro completed all tested task contracts. Ordinary chat is unchanged.
  let model: FocusModel = options.primaryModel ?? "deepseek-v4-pro";
  let switched = false;
  const primaryDeadline = started + (options.primaryTimeoutMs ?? 30_000);
  const transfers: { model: string; bytes: number; nonWhitespace: boolean }[] =
    [];
  const cancel = () => {
    if (controller.signal.aborted) return;
    outcome = "cancelled";
    controller.abort(new DOMException("Request cancelled", "AbortError"));
  };
  caller.addEventListener("abort", cancel, { once: true });
  if (caller.aborted) cancel();
  const expire = () => {
    if (controller.signal.aborted) return;
    outcome = "deadline";
    const error = new Error(
      lang === "zh"
        ? "AI 响应超时，请稍后重试。你的记录没有被修改。"
        : "AI response timed out. Please retry; your records have not been changed.",
    );
    error.name = "FocusTimeoutError";
    controller.abort(error);
  };
  const timer = setTimeout(expire, Math.max(0, deadline - Date.now()));
  const mark = (
    next: Phase,
    detail: Omit<Event, "phase" | "elapsedMs" | "attempt"> = {},
  ) => {
    phase = next;
    events.push({
      phase,
      elapsedMs: Date.now() - started,
      attempt: calls,
      ...detail,
    });
  };
  const bounded = async <T>(
    work: () => PromiseLike<T>,
    signal = controller.signal,
  ): Promise<T> => {
    signal.throwIfAborted();
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return work();
        }),
        cancelled,
      ]);
      signal.throwIfAborted();
      return value;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
  const retry = async () => {
    const delayMs = options.retryDelayMs ?? 350;
    // Do not dispatch a retry that has no useful remaining budget.
    if (retryUsed || calls >= 4 || deadline - Date.now() < delayMs + 1_000) {
      return false;
    }
    retryUsed = true;
    mark("retry_wait");
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await bounded(() =>
        new Promise<void>((resolve) => {
          delayTimer = setTimeout(resolve, delayMs);
        })
      );
    } finally {
      clearTimeout(delayTimer);
    }
    return true;
  };
  return {
    signal: controller.signal,
    bounded,
    mark,
    model: () => model,
    async complete(apiKey: string, body: Record<string, unknown>) {
      while (calls < 4) {
        controller.signal.throwIfAborted();
        calls++;
        const attemptController = new AbortController();
        const signal = AbortSignal.any([
          controller.signal,
          attemptController.signal,
        ]);
        // A measured primary body stall must not consume the entire budget: leave
        // the remainder for ONE sequential same-provider alternate, never race paid calls.
        const primaryTimer = !switched
          ? setTimeout(() => {
            const error = new Error("Primary model response deadline");
            error.name = "FocusPrimaryTimeoutError";
            attemptController.abort(error);
          }, Math.max(0, primaryDeadline - Date.now()))
          : undefined;
        const transfer = { model, bytes: 0, nonWhitespace: false };
        transfers.push(transfer);
        try {
          mark("provider_headers");
          let response: Response;
          try {
            response = await bounded(
              () =>
                (options.fetch ?? fetch)(
                  "https://api.deepseek.com/chat/completions",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ ...body, model }),
                    signal,
                  },
                ),
              signal,
            );
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            if (
              !controller.signal.aborted && error instanceof TypeError &&
              await retry()
            ) continue;
            if (controller.signal.aborted) throw controller.signal.reason;
            throw new Error(
              lang === "zh"
                ? "AI 网络连接失败，请稍后重试。"
                : "AI connection failed. Please retry.",
            );
          }
          mark("provider_body", { status: response.status });
          if (!response.ok) {
            // No provider error body is logged or reflected to the user.
            await bounded(
              () => response.body?.cancel() ?? Promise.resolve(),
              signal,
            );
            if (
              [429, 502, 503, 504].includes(response.status) && await retry()
            ) continue;
            throw new Error(
              lang === "zh"
                ? `AI 服务暂时无法完成请求（${response.status}），请稍后重试。`
                : `AI service could not complete the request (${response.status}). Please retry.`,
            );
          }
          let data;
          try {
            if (!response.body) throw new Error("Missing provider body");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let raw = "";
            try {
              while (true) {
                const chunk = await bounded(() => reader.read(), signal);
                if (chunk.done) break;
                transfer.bytes += chunk.value.byteLength;
                if (transfer.bytes > 65_536) {
                  throw new Error("Oversized provider body");
                }
                const part = decoder.decode(chunk.value, { stream: true });
                transfer.nonWhitespace ||= /\S/u.test(part);
                raw += part;
              }
              raw += decoder.decode();
              data = JSON.parse(raw);
            } finally {
              // Native fetch abort cancels IO; also release custom stream adapters.
              void reader.cancel().catch(() => {});
              reader.releaseLock();
            }
          } catch {
            if (signal.aborted) throw signal.reason;
            throw new Error(
              lang === "zh"
                ? "AI 服务返回了无效响应，请重试。"
                : "AI service returned an invalid response. Please retry.",
            );
          }
          const choice = data?.choices?.[0];
          mark("validation", {
            finish: choice?.finish_reason === "stop"
              ? "stop"
              : choice?.finish_reason === "length"
              ? "length"
              : "other",
          });
          // Empty/truncated content still goes through the normal bounded schema repair.
          return choice?.finish_reason !== "length" &&
              typeof choice?.message?.content === "string"
            ? choice.message.content.trim()
            : "";
        } catch (error) {
          if (
            !controller.signal.aborted && error instanceof Error &&
            error.name === "FocusPrimaryTimeoutError"
          ) {
            if (!switched && calls < 4 && deadline - Date.now() >= 1_000) {
              model = model === "deepseek-v4-pro" ? "deepseek-v4-flash" : "deepseek-v4-pro";
              switched = true;
              mark("provider_switch");
              continue;
            }
            expire();
            throw controller.signal.reason;
          }
          if (controller.signal.aborted) throw controller.signal.reason;
          throw error;
        } finally {
          clearTimeout(primaryTimer);
        }
      }
      throw new Error(
        lang === "zh"
          ? "AI 请求重试次数已达上限，请稍后重试。"
          : "AI retry limit reached. Please retry later.",
      );
    },
    finish(success: boolean) {
      if (outcome === "running") outcome = success ? "success" : "failed";
      if (success) mark("complete");
    },
    diagnostics() {
      return {
        requestId,
        kind,
        outcome,
        phase,
        model,
        switched,
        elapsedMs: Date.now() - started,
        calls,
        retryUsed,
        transfers: transfers.map((entry) => ({ ...entry })),
        events: events.slice(),
      };
    },
    dispose() {
      clearTimeout(timer);
      caller.removeEventListener("abort", cancel);
    },
  };
}
