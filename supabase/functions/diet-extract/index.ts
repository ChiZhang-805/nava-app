import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { assertOwnedStoragePath } from "../_shared/storage-ownership.ts";

type FoodItem = {
  name: string;
  amount?: string;
  weight_g?: number;
  calories?: number;
  protein_g?: number;
  carbohydrate_g?: number;
  fat_g?: number;
  confidence?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient, adminClient } = await requireUser(req);
    const body = await readJson(req);
    const lang = stringValue(body.lang) ?? "zh";
    const imagePath = stringValue(body.imagePath);
    assertOwnedStoragePath(imagePath, user.id, "饮食照片");
    if (!imagePath) throw new Error("饮食照片必须先保存到当前账号的私有存储。");
    const imageUrl = await signedImageUrl(adminClient ?? userClient, imagePath);
    if (!imageUrl) throw new Error("没有可供分析的饮食图片；私密存储签名失败。");
    const providerResult = await callProvider({
      imageUrl,
      imagePath,
      lang,
      meal: stringValue(body.meal),
      date: stringValue(body.date),
    });
    return jsonResponse(providerResult);
  } catch (error) {
    return errorResponse(error);
  }
});

async function callProvider(input: { imageUrl: string; imagePath?: string; lang: string; meal?: string; date?: string }) {
  const endpoint = Deno.env.get("NAVA_DIET_EXTRACT_URL");
  const apiKey = Deno.env.get("NAVA_DIET_EXTRACT_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...input,
        prompt: dietRecognitionPrompt(input.lang, input.meal),
        response_schema: "nava.diet.v2",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`饮食识别服务返回 ${response.status}`);
    const data = await response.json();
    const normalized = normalizeProviderResult(data, "custom-provider", true);
    if (normalized.items.length === 0) throw new Error("真实饮食识别服务没有返回可确认的食物项目。");
    return normalized;
  }

  const visionKey = Deno.env.get("NAVA_DIET_VISION_KEY") ?? Deno.env.get("DASHSCOPE_API_KEY");
  if (!visionKey) {
    throw new Error(input.lang === "en"
      ? "Food-photo recognition requires a vision AI key. Configure DASHSCOPE_API_KEY in Supabase Edge Function secrets."
      : "照片识别必须使用视觉 AI。请先在 Supabase Edge Function Secrets 配置 DASHSCOPE_API_KEY。");
  }

  const visionEndpoint = Deno.env.get("NAVA_DIET_VISION_URL")
    ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  const visionModel = Deno.env.get("NAVA_DIET_VISION_MODEL") ?? "qwen3-vl-plus";
  return await callVisionProvider({ ...input, endpoint: visionEndpoint, apiKey: visionKey, model: visionModel });
}

async function callVisionProvider(input: {
  imageUrl: string;
  imagePath?: string;
  lang: string;
  meal?: string;
  date?: string;
  endpoint: string;
  apiKey: string;
  model: string;
}) {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: dietRecognitionPrompt(input.lang, input.meal),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: input.lang === "en"
                ? `Analyze this ${input.meal ?? "meal"} photo${input.date ? ` for ${input.date}` : ""}. Return JSON only.`
                : `分析这张${mealLabel(input.meal)}照片${input.date ? `，记录日期为 ${input.date}` : ""}。只返回 JSON。`,
            },
            { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`视觉识别服务返回 ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : undefined;
  const rawContent = message && typeof message === "object"
    ? (message as Record<string, unknown>).content
    : undefined;
  const content = typeof rawContent === "string" ? rawContent : "";
  if (!content.trim()) throw new Error("视觉识别服务没有返回可解析内容。");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  } catch {
    throw new Error("视觉识别结果不是有效 JSON，请检查模型或提示词配置。");
  }
  const normalized = normalizeProviderResult(parsed, input.model, true);
  if (normalized.items.length === 0) {
    throw new Error(input.lang === "en"
      ? "The vision AI could not identify any food in this photo. Try a clearer photo with the full meal visible."
      : "视觉 AI 没有从照片中可靠识别出食物，请重新拍摄一张光线充足、餐食完整可见的照片。");
  }
  return normalized;
}

function dietRecognitionPrompt(lang: string, meal?: string) {
  if (lang === "en") {
    return `You are NAVA's food-photo analyst. Inspect only visible food in this ${meal ?? "meal"} image. Identify every distinct dish or drink, use ordinary specific food names, estimate visible portion/weight and calories conservatively, and estimate protein, carbohydrate and fat. Never invent hidden ingredients. For enclosed foods such as dumplings, buns, pies, or rolls, never infer a filling that is not visibly exposed; use a neutral visible name and ask the user to confirm the filling in note. Likewise, do not guess whether an indistinguishable dark dipping liquid is soy sauce, vinegar, or another sauce; call it dark dipping sauce and request confirmation. If an item cannot be identified reliably, omit it and explain why in note. Return one JSON object only: {"items":[{"name":"","amount":"","weight_g":0,"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0,"confidence":0}],"totals":{"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0},"confidence":0,"note":""}. Confidence is 0..1; all other numbers are non-negative.`;
  }
  return `你是 NAVA 的饮食照片分析器。认真观察这张${mealLabel(meal)}照片，只识别画面中确实可见的食物和饮品。每一种菜品分别列一项，使用普通用户看得懂的具体中文名称；结合餐盘、餐具和食物体积保守估算份量、克重、热量、蛋白质、碳水和脂肪。不要把多个明显不同的菜合并为“待确认餐食”，不要虚构看不见的配料。对于饺子、包子、馅饼、卷物等封闭食物，馅料没有清楚露出时不得猜测具体肉类或蔬菜，只能使用“水饺”等中性可见名称，并在 note 提醒用户确认馅料。对于仅凭照片无法区分的深色蘸料，不得猜成酱油或醋，应写“深色蘸料”并提醒用户确认。无法可靠判断时宁可省略并在 note 说明。只返回一个 JSON 对象，不要 Markdown：{"items":[{"name":"","amount":"","weight_g":0,"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0,"confidence":0}],"totals":{"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0},"confidence":0,"note":""}。confidence 范围 0 到 1，其余数字不得为负数。`;
}

function mealLabel(meal?: string) {
  if (meal === "breakfast") return "早餐";
  if (meal === "dinner") return "晚餐";
  if (meal === "pantry") return "加餐";
  return "午餐";
}

function normalizeProviderResult(data: Record<string, unknown>, provider: string, analysisAvailable: boolean) {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: FoodItem[] = rawItems.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      name: String(value.name ?? "").trim(),
      amount: typeof value.amount === "string" ? value.amount : value.weight_g ? `${Math.round(Number(value.weight_g))}g` : undefined,
      weight_g: nonNegative(value.weight_g),
      calories: nonNegative(value.calories),
      protein_g: nonNegative(value.protein_g),
      carbohydrate_g: nonNegative(value.carbohydrate_g),
      fat_g: nonNegative(value.fat_g),
      confidence: boundedConfidence(value.confidence),
    };
  }).filter((item) => item.name && !/^(?:待确认餐食|meal item to confirm)$/i.test(item.name));

  const rawTotals = data.totals && typeof data.totals === "object" ? data.totals as Record<string, unknown> : {};
  const sum = (field: keyof FoodItem) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);

  return {
    schemaVersion: "2.0.0",
    modelVersion: String(data.modelVersion ?? data.model_version ?? `diet-${provider}-2026-07`),
    provider,
    analysisAvailable,
    confidence: boundedConfidence(data.confidence) ?? Math.max(...items.map((item) => item.confidence ?? 0), 0),
    items,
    totals: {
      calories: nonNegative(rawTotals.calories) ?? sum("calories"),
      protein_g: nonNegative(rawTotals.protein_g) ?? sum("protein_g"),
      carbohydrate_g: nonNegative(rawTotals.carbohydrate_g) ?? sum("carbohydrate_g"),
      fat_g: nonNegative(rawTotals.fat_g) ?? sum("fat_g"),
    },
    note: typeof data.note === "string" ? data.note : undefined,
  };
}

async function signedImageUrl(adminClient: unknown, imagePath?: string) {
  if (!imagePath || !adminClient) return undefined;
  const client = adminClient as {
    storage: { from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }> } };
  };
  const { data, error } = await client.storage.from("diet-photos").createSignedUrl(imagePath, 600);
  if (error || !data?.signedUrl) return undefined;
  return data.signedUrl;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function nonNegative(value: unknown) {
  const parsed = numeric(value);
  return parsed == null ? undefined : Math.max(0, parsed);
}

function boundedConfidence(value: unknown) {
  const parsed = numeric(value);
  return parsed == null ? undefined : Math.min(1, Math.max(0, parsed));
}
