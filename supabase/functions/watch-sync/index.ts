import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import {
  assertNoError,
  dateOnly,
  errorResponse,
  jsonResponse,
  normalizeDate,
  numberValue,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
  todayISO,
} from "../_shared/http.ts";
import { calculateRhythm, loadDailyInputs, saveRhythmScore } from "../_shared/rhythm.ts";
import { watchActionDate, watchActionLocalHour } from "../_shared/watch-action-time.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient, adminClient } = await requireUser(req);
    const body = await readJson(req);
    const mode = stringValue(body.type) ?? "snapshot";
    await upsertDevice(userClient, user.id, body);

    if (mode === "snapshot") {
      const date = normalizeDate(body.date ?? (body.snapshot as Record<string, unknown> | undefined)?.date);
      // Watch payloads are always reconstructed from the authenticated user's
      // persisted Supabase rows. Client-supplied scores are never promoted to a
      // server snapshot.
      const snapshot = await buildSnapshot(userClient, user.id, date);
      const { error } = await userClient.from("watch_snapshots").upsert(
        {
          user_id: user.id,
          record_date: date,
          payload: snapshot,
          pushed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,record_date" },
      );
      assertNoError(error);
      return jsonResponse({ ok: true, type: "snapshot", snapshot, syncedAt: new Date().toISOString() });
    }

    if (mode === "action") {
      if (!adminClient) throw new Error("watch-sync 缺少服务端幂等存储权限。");
      const action = (body.action ?? body) as Record<string, unknown>;
      const actionId = stringValue(action.actionId);
      const actionType = stringValue(action.type) ?? "unknown";
      if (!actionId || !/^[A-Za-z0-9_-]{8,128}$/.test(actionId)) throw new Error("手表动作缺少有效 actionId。");

      const claim = await adminClient
        .from("watch_action_receipts")
        .insert({ user_id: user.id, action_id: actionId, action_type: actionType, status: "processing" })
        .select("status,result,completed_at,created_at")
        .single();
      let ownsClaim = !claim.error;
      if (claim.error?.code === "23505") {
        const existing = await adminClient
          .from("watch_action_receipts")
          .select("status,result,completed_at,created_at")
          .eq("user_id", user.id)
          .eq("action_id", actionId)
          .single();
        assertNoError(existing.error);
        const existingReceipt = existing.data;
        if (!existingReceipt) throw new Error("无法读取手表动作幂等回执。");
        const staleProcessing = existingReceipt.status === "processing"
          && Date.parse(String(existingReceipt.created_at ?? "")) < Date.now() - 5 * 60_000;
        if (existingReceipt.status === "failed" || staleProcessing) {
          const reclaimedAt = new Date().toISOString();
          let reclaimRequest = adminClient
            .from("watch_action_receipts")
            .update({ status: "processing", error_message: null, result: null, completed_at: null, created_at: reclaimedAt })
            .eq("user_id", user.id)
            .eq("action_id", actionId)
            .eq("status", existingReceipt.status);
          if (staleProcessing) reclaimRequest = reclaimRequest.eq("created_at", existingReceipt.created_at);
          const reclaimed = await reclaimRequest.select("status").maybeSingle();
          assertNoError(reclaimed.error);
          ownsClaim = Boolean(reclaimed.data);
        }
        if (!ownsClaim) {
          return jsonResponse({
            ok: existingReceipt.status === "completed",
            type: "action",
            duplicate: true,
            status: existingReceipt.status,
            result: existingReceipt.result ?? null,
            syncedAt: existingReceipt.completed_at ?? null,
          });
        }
      }
      if (claim.error?.code !== "23505") assertNoError(claim.error);

      let result: unknown;
      try {
        result = await applyWatchAction(userClient, user.id, action);
      } catch (actionError) {
        await adminClient
          .from("watch_action_receipts")
          .update({ status: "failed", error_message: actionError instanceof Error ? actionError.message.slice(0, 500) : "watch action failed" })
          .eq("user_id", user.id)
          .eq("action_id", actionId);
        throw actionError;
      }

      const date = watchActionDate(action, dateOnly(body.date ?? todayISO()));
      let rhythm = null;
      try {
        rhythm = calculateRhythm(await loadDailyInputs(userClient, user.id, date));
        await saveRhythmScore(userClient, user.id, rhythm);
      } catch (rhythmError) {
        console.error("Watch action saved but rhythm refresh failed", rhythmError);
      }

      const syncedAt = new Date().toISOString();
      const receiptResult = { action: result, rhythm };
      const completed = await adminClient
        .from("watch_action_receipts")
        .update({ status: "completed", result: receiptResult, error_message: null, completed_at: syncedAt })
        .eq("user_id", user.id)
        .eq("action_id", actionId);
      assertNoError(completed.error);
      return jsonResponse({ ok: true, type: "action", result: receiptResult, rhythm, syncedAt });
    }

    return errorResponse(`未知 watch-sync 类型：${mode}`);
  } catch (error) {
    return errorResponse(error);
  }
});

async function upsertDevice(client: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const device = (body.device ?? {}) as Record<string, unknown>;
  const { error } = await client.from("device_connections").upsert(
    {
      user_id: userId,
      platform: "watchos",
      device_name: stringValue(device.name) ?? stringValue(body.deviceName) ?? "Apple Watch",
      device_model: stringValue(device.model) ?? null,
      os_version: stringValue(device.osVersion) ?? null,
      app_version: stringValue(device.appVersion) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform,device_name" },
  );
  assertNoError(error);
}

async function applyWatchAction(client: SupabaseClient, userId: string, action: Record<string, unknown>) {
  const actionType = stringValue(action.type);
  const date = watchActionDate(action, todayISO());

  if (actionType === "mood.quickLog") {
    const mood = numberValue(action.mood);
    if (mood == null) throw new Error("手表情绪记录缺少 mood。");
    const existing = await client
      .from("mood_records")
      .select("id")
      .eq("user_id", userId)
      .eq("record_date", date)
      .maybeSingle();
    assertNoError(existing.error);
    const payload = existing.data
      ? { mood_score: Math.round(Math.min(100, Math.max(0, mood))) }
      : {
        user_id: userId,
        record_date: date,
        mood_score: Math.round(Math.min(100, Math.max(0, mood))),
        factors: ["Apple Watch"],
        diary_content: null,
      };
    const response = existing.data
      ? await client.from("mood_records").update(payload).eq("id", existing.data.id)
      : await client.from("mood_records").insert(payload);
    assertNoError(response.error);
    return { saved: true, table: "mood_records" };
  }

  if (actionType === "focus.stop") {
    const minutes = numberValue(action.durationMinutes);
    if (!minutes || minutes <= 0) throw new Error("手表专注记录缺少 durationMinutes。");
    const task = await ensureTask(client, userId, stringValue(action.taskTitle) ?? "Apple Watch 专注", date);
    const response = await client.rpc("record_focus_session", {
      p_source_action_id: stringValue(action.actionId),
      p_task_id: task.id,
      p_record_date: date,
      p_minutes: Math.round(minutes),
      p_interruptions: 0,
      p_category: "watch",
      p_started_at: stringValue(action.startedAt),
      p_ended_at: stringValue(action.endedAt) ?? new Date().toISOString(),
      p_local_hour: watchActionLocalHour(action),
      p_note: null,
      p_source: "watch",
    });
    assertNoError(response.error);
    const result = response.data as { applied?: boolean } | null;
    return { saved: result?.applied === true, duplicate: result?.applied === false, table: "focus_records" };
  }

  if (actionType === "focus.start") {
    const sessionId = stringValue(action.sessionId);
    const startedAt = stringValue(action.startedAt);
    if (!sessionId || !startedAt || Number.isNaN(Date.parse(startedAt))) throw new Error("手表专注开始动作缺少有效会话信息。");
    return { saved: false, accepted: true, reason: "focus timer remains authoritative on Apple Watch until focus.stop" };
  }

  if (actionType === "sync.requestSnapshot") {
    return { saved: false, snapshot: await buildSnapshot(client, userId, date) };
  }

  throw new Error(`暂不支持的手表动作：${actionType ?? "unknown"}`);
}

async function ensureTask(client: SupabaseClient, userId: string, title: string, date: string) {
  const existing = await client
    .from("tasks")
    .select("id,title")
    .eq("user_id", userId)
    .eq("scheduled_date", date)
    .eq("title", title)
    .limit(1)
    .maybeSingle();
  assertNoError(existing.error);
  if (existing.data) return existing.data as { id: string; title: string };

  const created = await client
    .from("tasks")
    .insert({ user_id: userId, title, scheduled_date: date, completed: false })
    .select("id,title")
    .single();
  assertNoError(created.error);
  return created.data as { id: string; title: string };
}

async function buildSnapshot(client: SupabaseClient, userId: string, date: string) {
  const inputs = await loadDailyInputs(client, userId, date);
  const rhythm = calculateRhythm(inputs);
  const profile = await client.from("profiles").select("username").eq("id", userId).maybeSingle();
  assertNoError(profile.error);
  const today = inputs.today;
  return {
    userId,
    displayName: stringValue(profile.data?.username),
    today: {
      rhythmScore: rhythm.score,
      sleepScore: numberValue(today.sleep?.rhythm_score),
      steps: numberValue(today.exercise?.steps),
      activeCalories: numberValue(today.exercise?.calories),
      mood: numberValue(today.mood?.mood_score),
      focusMinutes: today.focusMinutes,
    },
    lastSyncedAt: new Date().toISOString(),
  };
}
