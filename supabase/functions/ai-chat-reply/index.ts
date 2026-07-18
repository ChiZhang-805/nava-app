import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    await requireUser(req);
    const body = await readJson(req);
    const message = stringValue(body.message);
    if (!message) throw new Error("请先输入要发送的内容。");

    const lang = stringValue(body.lang) === "en" || stringValue(body.language) === "en" ? "en" : "zh";
    const reply = await buildReply({
      message,
      dataType: stringValue(body.dataType) ?? stringValue(body.data_type),
      extractedData: body.extractedData ?? body.extracted_data ?? null,
      lang,
    });
    return jsonResponse(reply);
  } catch (error) {
    return errorResponse(error);
  }
});

async function buildReply(input: { message: string; dataType?: string; extractedData: unknown; lang: "zh" | "en" }) {
  const endpoint = Deno.env.get("NAVA_AI_CHAT_URL");
  const apiKey = Deno.env.get("NAVA_AI_CHAT_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AI 回复服务返回 ${response.status}`);
    const data = await response.json();
    return normalizeProviderReply(data);
  }

  return localReply(input);
}

function localReply(input: { message: string; dataType?: string; extractedData: unknown; lang: "zh" | "en" }) {
  const records = flattenRecords(input.extractedData, input.dataType);
  const types = new Set(records.map((record) => record.dataType));
  const zh = input.lang !== "en";
  const suggestions: string[] = [];

  if (types.has("sleep")) suggestions.push(zh ? "今晚尽量固定入睡窗口，减少睡前强光和高刺激内容。" : "Keep a consistent sleep window tonight and reduce bright-screen stimulation before bed.");
  if (types.has("exercise")) suggestions.push(zh ? "运动记录已纳入今日节律，后续会和恢复指标一起判断强度是否合适。" : "Your activity will be compared with recovery signals before suggesting intensity changes.");
  if (types.has("mood")) suggestions.push(zh ? "主观状态会帮助算法识别 Apple Watch 看不到的压力变化。" : "Your subjective state helps detect stress patterns that wearables cannot observe directly.");
  if (types.has("focus")) suggestions.push(zh ? "专注块会进入行为节律维度，建议保留固定的深度工作时段。" : "Focus blocks feed the behavior rhythm dimension; keep a stable deep-work window when possible.");
  if (types.has("nutrition")) suggestions.push(zh ? "这餐会用于估计能量节律，后续可以和运动消耗一起看。" : "This meal will be used for energy-rhythm estimation alongside activity expenditure.");
  if (types.has("profile")) suggestions.push(zh ? "个人资料会用于个体化基线，后续评分会更贴近你自己的状态。" : "Profile updates improve the personal baseline behind your score.");

  if (suggestions.length === 0) {
    return {
      reply: zh
        ? "我已经收到。你可以补充睡眠起止、步数、运动分钟、情绪分数或饮食热量，NAVA 会自动整理成记录。"
        : "Received. Add sleep times, steps, active minutes, mood score, or meal calories and NAVA will organize them into records.",
      provider: "rules",
      modelVersion: "ai-chat-rules-v1-2026-07",
      actions: [],
    };
  }

  return {
    reply: zh ? `已整理 ${records.length} 项记录。${suggestions.join("")}` : `Organized ${records.length} record(s). ${suggestions.join(" ")}`,
    provider: "rules",
    modelVersion: "ai-chat-rules-v1-2026-07",
    actions: suggestions,
  };
}

function flattenRecords(extractedData: unknown, dataType?: string): Array<{ dataType: string; extractedData: Record<string, unknown> }> {
  if (!extractedData || typeof extractedData !== "object") return [];
  const data = extractedData as Record<string, unknown>;
  if (Array.isArray(data.records)) {
    return data.records
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const payload = record.extractedData ?? record.extracted_data ?? record.data;
        if (!payload || typeof payload !== "object") return null;
        return {
          dataType: String(record.dataType ?? record.data_type ?? record.type ?? "unknown"),
          extractedData: payload as Record<string, unknown>,
        };
      })
      .filter(Boolean) as Array<{ dataType: string; extractedData: Record<string, unknown> }>;
  }
  return [{ dataType: dataType ?? "record", extractedData: data }];
}

function normalizeProviderReply(data: Record<string, unknown>) {
  return {
    reply: String(data.reply ?? data.message ?? data.content ?? "已收到。"),
    provider: "provider",
    modelVersion: String(data.modelVersion ?? data.model_version ?? "ai-chat-provider-2026-07"),
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}
