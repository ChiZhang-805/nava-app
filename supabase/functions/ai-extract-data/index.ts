import {
  clamp,
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";

type ExtractedRecord = {
  dataType: "sleep" | "exercise" | "mood" | "focus" | "nutrition" | "profile";
  extractedData: Record<string, unknown>;
  confidence: number;
};

type TimeMention = {
  raw: string;
  value: string;
  index: number;
  context: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    await requireUser(req);
    const body = await readJson(req);
    const message = stringValue(body.message);
    if (!message) throw new Error("请先输入要记录的状态。");

    const lang = stringValue(body.lang) === "en" || stringValue(body.language) === "en" ? "en" : "zh";
    const result = await extractData({ message, lang });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function extractData(input: { message: string; lang: "zh" | "en" }) {
  const endpoint = Deno.env.get("NAVA_AI_EXTRACT_URL");
  const apiKey = Deno.env.get("NAVA_AI_EXTRACT_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`自然语言抽取服务返回 ${response.status}`);
    const data = await response.json();
    return normalizeProviderExtraction(data);
  }

  return localExtract(input.message, input.lang);
}

function localExtract(message: string, lang: "zh" | "en") {
  const records = [
    extractSleep(message),
    extractExercise(message),
    extractMood(message),
    extractFocus(message),
    extractNutrition(message),
    extractProfile(message),
  ].filter(Boolean) as ExtractedRecord[];

  if (records.length === 0) {
    return {
      schemaVersion: "1.0.0",
      modelVersion: "ai-extract-rules-v1-2026-07",
      provider: "rules",
      hasData: false,
      dataType: "unknown",
      extractedData: null,
      confidence: 0.18,
      reasons: [lang === "en" ? "No supported health record was detected." : "没有识别到可保存的健康记录。"],
    };
  }

  if (records.length === 1) {
    const [record] = records;
    return {
      schemaVersion: "1.0.0",
      modelVersion: "ai-extract-rules-v1-2026-07",
      provider: "rules",
      hasData: true,
      dataType: record.dataType,
      extractedData: record.extractedData,
      confidence: round(record.confidence),
      reasons: [reasonFor(record.dataType, lang)],
    };
  }

  return {
    schemaVersion: "1.0.0",
    modelVersion: "ai-extract-rules-v1-2026-07",
    provider: "rules",
    hasData: true,
    dataType: "multi",
    extractedData: {
      records: records.map((record) => ({
        dataType: record.dataType,
        extractedData: record.extractedData,
        confidence: round(record.confidence),
      })),
    },
    confidence: round(records.reduce((sum, record) => sum + record.confidence, 0) / records.length),
    reasons: [lang === "en" ? "Multiple health records were detected." : "识别到多项可保存记录。"],
  };
}

function extractSleep(message: string): ExtractedRecord | null {
  if (!/(睡|醒|起床|入睡|失眠|sleep|slept|wake|woke|bed)/i.test(message)) return null;
  const times = extractTimes(message);
  const startMention =
    times.find((time) => /(睡|入睡|上床|bed|slept|sleep)/i.test(time.context)) ?? times[0];
  const endMention =
    times.find((time) => /(醒|起床|起来|wake|woke|up)/i.test(time.context)) ?? times.find((time) => time !== startMention);
  if (!startMention && !endMention) return null;

  const start = startMention?.value;
  const end = endMention?.value;
  const durationMinutes = start && end ? estimateSleepMinutes(start, end) : undefined;
  const rating = extractScore(message, ["睡眠", "睡得", "sleep", "quality"]);
  const deepMinutes = extractMinutesByKeyword(message, /(深睡|deep)/i);
  const remMinutes = extractMinutesByKeyword(message, /(rem|快速眼动)/i);
  const lightMinutes = extractMinutesByKeyword(message, /(浅睡|light)/i);

  return {
    dataType: "sleep",
    extractedData: {
      sleepStart: start,
      sleepEnd: end,
      sleepDurationMinutes: durationMinutes,
      deepSleepMinutes: deepMinutes,
      lightSleepMinutes: lightMinutes,
      remMinutes,
      selfRating: rating,
    },
    confidence: start && end ? 0.86 : 0.56,
  };
}

function extractExercise(message: string): ExtractedRecord | null {
  if (!/(步|运动|跑|走|骑|训练|健身|卡|千卡|kcal|calorie|exercise|steps?|walk|run|workout)/i.test(message)) {
    return null;
  }
  const steps = matchNumber(message, /([\d,，]+)\s*(?:步|steps?)/i);
  const calories = matchNumber(message, /([\d,，]+)\s*(?:千卡|大卡|卡路里|kcal|calories?)/i);
  const minutes =
    matchNumber(message, /(?:运动|跑步|走路|步行|训练|健身|exercise|workout|walk|run)[^\d]{0,8}([\d,，]+)\s*(?:分钟|min|minutes?)/i) ??
    matchNumber(message, /([\d,，]+)\s*(?:分钟|min|minutes?)[^\n，。,.]{0,8}(?:运动|跑步|走路|步行|训练|健身|exercise|workout|walk|run)/i);
  const heartRate = matchNumber(message, /(?:心率|heart\s*rate|hr)[^\d]{0,8}([\d,，]+)/i);
  const spo2 = matchNumber(message, /(?:血氧|spo2|oxygen)[^\d]{0,8}([\d,，]+)\s*%?/i);

  if (steps == null && calories == null && minutes == null && heartRate == null && spo2 == null) return null;

  return {
    dataType: "exercise",
    extractedData: {
      steps,
      calories,
      exerciseMinutes: minutes,
      heartRate: heartRate == null ? undefined : String(Math.round(heartRate)),
      spo2: spo2 == null ? undefined : `${Math.round(spo2)}%`,
    },
    confidence: steps != null || calories != null || minutes != null ? 0.82 : 0.58,
  };
}

function extractMood(message: string): ExtractedRecord | null {
  if (!/(情绪|心情|压力|焦虑|开心|难受|低落|mood|stress|anxious|happy|sad)/i.test(message)) return null;
  const explicit = extractScore(message, ["情绪", "心情", "状态", "mood"]);
  const score =
    explicit ??
    (/(开心|不错|很好|放松|happy|good|great)/i.test(message)
      ? 78
      : /(焦虑|压力|难受|低落|崩溃|anxious|stress|sad|bad)/i.test(message)
        ? 42
        : 64);
  const factors = [
    /(压力|stress)/i.test(message) ? "压力" : null,
    /(睡|sleep)/i.test(message) ? "睡眠" : null,
    /(运动|跑|走|exercise|workout)/i.test(message) ? "运动" : null,
    /(工作|学习|work|study)/i.test(message) ? "工作" : null,
    /(社交|朋友|social|friend)/i.test(message) ? "社交" : null,
  ].filter(Boolean);

  return {
    dataType: "mood",
    extractedData: {
      moodScore: clamp(Math.round(score), 0, 100),
      factors,
      diary: message,
    },
    confidence: explicit == null ? 0.62 : 0.8,
  };
}

function extractFocus(message: string): ExtractedRecord | null {
  if (!/(专注|番茄钟|学习|工作|focus|pomodoro|study|deep work)/i.test(message)) return null;
  const minutes =
    matchNumber(message, /(?:专注|学习|工作|focus|study|deep work)[^\d]{0,10}([\d,，]+)\s*(?:分钟|min|minutes?)/i) ??
    matchNumber(message, /([\d,，]+)\s*(?:分钟|min|minutes?)[^\n，。,.]{0,10}(?:专注|学习|工作|focus|study|deep work)/i);
  if (minutes == null) return null;

  return {
    dataType: "focus",
    extractedData: {
      taskTitle: /(学习|study)/i.test(message) ? "学习" : /(工作|work)/i.test(message) ? "工作" : "专注",
      minutes,
    },
    confidence: 0.78,
  };
}

function extractNutrition(message: string): ExtractedRecord | null {
  if (!/(早餐|午餐|晚餐|加餐|饮食|吃了|喝了|kcal|千卡|大卡|calorie|breakfast|lunch|dinner|snack|ate|food)/i.test(message)) {
    return null;
  }
  const calories = matchNumber(message, /([\d,，]+)\s*(?:千卡|大卡|卡路里|kcal|calories?)/i);
  if (calories == null && !/(吃了|喝了|ate|food)/i.test(message)) return null;

  const meal = /早餐|breakfast/i.test(message)
    ? "breakfast"
    : /午餐|中午|lunch/i.test(message)
      ? "lunch"
      : /晚餐|晚上吃|dinner/i.test(message)
        ? "dinner"
        : "pantry";
  const name = extractFoodName(message) ?? "手动记录餐食";

  return {
    dataType: "nutrition",
    extractedData: {
      meal,
      name,
      amount: undefined,
      calories: calories ?? 0,
    },
    confidence: calories == null ? 0.48 : 0.72,
  };
}

function extractProfile(message: string): ExtractedRecord | null {
  const height = matchNumber(message, /(?:身高|height)[^\d]{0,8}([\d,，]+)\s*(?:cm|厘米)?/i);
  const weight = matchNumber(message, /(?:体重|weight)[^\d]{0,8}([\d,，]+)\s*(?:kg|公斤|斤)?/i);
  const mbti = message.match(/\b(?:INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)\b/i)?.[0]?.toUpperCase();
  if (height == null && weight == null && !mbti) return null;

  return {
    dataType: "profile",
    extractedData: { height, weight, mbti },
    confidence: 0.74,
  };
}

function normalizeProviderExtraction(data: Record<string, unknown>) {
  const hasData = Boolean(data.hasData ?? data.has_data ?? data.extractedData ?? data.extracted_data);
  const extractedData = data.extractedData ?? data.extracted_data ?? null;
  return {
    schemaVersion: String(data.schemaVersion ?? data.schema_version ?? "1.0.0"),
    modelVersion: String(data.modelVersion ?? data.model_version ?? "ai-extract-provider-2026-07"),
    provider: "provider",
    hasData,
    dataType: String(data.dataType ?? data.data_type ?? "unknown"),
    extractedData,
    confidence: typeof data.confidence === "number" ? clamp(data.confidence, 0, 1) : 0.7,
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
  };
}

function extractTimes(message: string): TimeMention[] {
  const mentions: TimeMention[] = [];
  const pattern = /(凌晨|早上|上午|中午|下午|晚上|夜里|昨晚|今晚|am|pm)?\s*(\d{1,2})(?:[:：点时]\s*(\d{1,2})?)?/gi;
  for (const match of message.matchAll(pattern)) {
    if (match.index == null) continue;
    const raw = match[0].trim();
    if (!raw || !/[:：点时]|am|pm|凌晨|早上|上午|中午|下午|晚上|夜里|昨晚|今晚/i.test(raw)) continue;
    const hour = Number(match[2]);
    const minute = match[3] == null || match[3] === "" ? 0 : Number(match[3]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 24 || minute > 59) continue;
    const value = normalizeTime(hour, minute, match[1] ?? "", message.slice(Math.max(0, match.index - 8), match.index + raw.length + 8));
    mentions.push({
      raw,
      value,
      index: match.index,
      context: message.slice(Math.max(0, match.index - 12), Math.min(message.length, match.index + raw.length + 12)),
    });
  }
  return mentions;
}

function normalizeTime(hour: number, minute: number, marker: string, context: string) {
  let h = hour === 24 ? 0 : hour;
  const text = `${marker} ${context}`.toLowerCase();
  if (/(下午|晚上|今晚|pm)/i.test(text) && h < 12) h += 12;
  if (/(中午)/i.test(text) && h < 11) h += 12;
  if (/(早上|上午|凌晨|昨晚|夜里|am)/i.test(text) && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function estimateSleepMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let endMinutes = eh * 60 + em;
  const startMinutes = sh * 60 + sm;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return Math.max(0, endMinutes - startMinutes);
}

function extractMinutesByKeyword(message: string, keyword: RegExp) {
  const match = message.match(new RegExp(`(?:${keyword.source})[^\\d]{0,8}([\\d,，]+)\\s*(?:分钟|min|minutes?)`, "i"));
  return match ? parseNumber(match[1]) : undefined;
}

function extractScore(message: string, labels: string[]) {
  for (const label of labels) {
    const match = message.match(new RegExp(`${label}[^\\d]{0,8}([\\d,，]{1,3})(?:\\s*/\\s*100|分)?`, "i"));
    const value = match ? parseNumber(match[1]) : undefined;
    if (value != null && value >= 0 && value <= 100) return value;
  }
  const generic = message.match(/([1-9]\d?|100)\s*分/);
  return generic ? parseNumber(generic[1]) : undefined;
}

function matchNumber(message: string, pattern: RegExp) {
  const match = message.match(pattern);
  return match ? parseNumber(match[1]) : undefined;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/[，,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractFoodName(message: string) {
  const match = message.match(/(?:早餐|午餐|晚餐|加餐|吃了|喝了|ate)\s*([^，。,.]{1,18})/i);
  return match?.[1]?.trim();
}

function reasonFor(dataType: string, lang: "zh" | "en") {
  if (lang === "en") return `Detected a ${dataType} record.`;
  const labels: Record<string, string> = {
    sleep: "识别到睡眠记录。",
    exercise: "识别到运动记录。",
    mood: "识别到情绪记录。",
    focus: "识别到专注记录。",
    nutrition: "识别到饮食记录。",
    profile: "识别到个人资料更新。",
  };
  return labels[dataType] ?? "识别到可保存记录。";
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
