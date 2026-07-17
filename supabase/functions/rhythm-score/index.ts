import { errorResponse, jsonResponse, normalizeDate, optionsResponse, readJson, requireUser } from "../_shared/http.ts";
import { calculateRhythm, loadDailyInputs, saveRhythmScore } from "../_shared/rhythm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson(req);
    const date = normalizeDate(body.date);
    const inputs = await loadDailyInputs(userClient, user.id, date);
    const result = calculateRhythm(inputs);
    await saveRhythmScore(userClient, user.id, result);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});
