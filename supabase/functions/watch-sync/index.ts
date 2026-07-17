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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson(req);
    const mode = stringValue(body.type) ?? "snapshot";
    await upsertDevice(userClient, user.id, body);

    if (mode === "snapshot") {
      const date = normalizeDate(body.date ?? (body.snapshot as Record<string, unknown> | undefined)?.date);
      const snapshot = body.snapshot ?? await buildSnapshot(userClient, user.id, date);
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
      const action = (body.action ?? body) as Record<string, unknown>;
      const result = await applyWatchAction(userClient, user.id, action);
      const date = dateOnly(action.recordedAt ?? action.endedAt ?? body.date ?? todayISO());
      const rhythm = calculateRhythm(await loadDailyInputs(userClient, user.id, date));
      await saveRhythmScore(userClient, user.id, rhythm);
      return jsonResponse({ ok: true, type: "action", result, rhythm, syncedAt: new Date().toISOString() });
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
  const date = dateOnly(action.recordedAt ?? action.startedAt ?? action.endedAt ?? todayISO());

  if (actionType === "mood.quickLog") {
    const mood = numberValue(action.mood);
    if (mood == null) throw new Error("手表情绪记录缺少 mood。");
    const { error } = await client.from("mood_records").upsert(
      {
        user_id: userId,
        record_date: date,
        mood_score: Math.round(Math.min(100, Math.max(0, mood))),
        factors: ["Apple Watch"],
        diary_content: "Apple Watch 快速记录",
      },
      { onConflict: "user_id,record_date" },
    );
    assertNoError(error);
    return { saved: true, table: "mood_records" };
  }

  if (actionType === "focus.stop") {
    const minutes = numberValue(action.durationMinutes);
    if (!minutes || minutes <= 0) throw new Error("手表专注记录缺少 durationMinutes。");
    const task = await ensureTask(client, userId, stringValue(action.taskTitle) ?? "Apple Watch 专注", date);
    const existing = await client
      .from("focus_records")
      .select("*")
      .eq("user_id", userId)
      .eq("record_date", date)
      .eq("task_id", task.id)
      .maybeSingle();
    assertNoError(existing.error);
    const payload = {
      user_id: userId,
      task_id: task.id,
      record_date: date,
      completed_sessions: (existing.data?.completed_sessions ?? 0) + 1,
      total_minutes: (existing.data?.total_minutes ?? 0) + Math.round(minutes),
    };
    const response = existing.data
      ? await client.from("focus_records").update(payload).eq("id", existing.data.id)
      : await client.from("focus_records").insert(payload);
    assertNoError(response.error);
    await upsertFocusDistribution(client, userId, date, Math.round(minutes));
    return { saved: true, table: "focus_records" };
  }

  if (actionType === "sync.requestSnapshot") {
    return { saved: false, snapshot: await buildSnapshot(client, userId, date) };
  }

  return { saved: false, reason: `暂不支持的手表动作：${actionType ?? "unknown"}` };
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

async function upsertFocusDistribution(client: SupabaseClient, userId: string, date: string, minutes: number) {
  const hour = new Date().getHours();
  const period = hour < 6 ? "period_0_6" : hour < 12 ? "period_6_12" : hour < 18 ? "period_12_18" : "period_18_24";
  const existing = await client
    .from("focus_time_distribution")
    .select("*")
    .eq("user_id", userId)
    .eq("record_date", date)
    .maybeSingle();
  assertNoError(existing.error);
  const base = existing.data ?? {
    user_id: userId,
    record_date: date,
    period_0_6: 0,
    period_6_12: 0,
    period_12_18: 0,
    period_18_24: 0,
  };
  const response = existing.data
    ? await client.from("focus_time_distribution").update({ ...base, [period]: (base[period] ?? 0) + minutes }).eq("id", existing.data.id)
    : await client.from("focus_time_distribution").insert({ ...base, [period]: minutes });
  assertNoError(response.error);
}

async function buildSnapshot(client: SupabaseClient, userId: string, date: string) {
  const rhythm = calculateRhythm(await loadDailyInputs(client, userId, date));
  return {
    userId,
    date,
    today: {
      rhythmScore: rhythm.score,
      nextAction: rhythm.actions[0] ?? "保持当前节奏。",
    },
    lastSyncedAt: new Date().toISOString(),
  };
}
