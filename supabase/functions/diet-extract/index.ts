import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { assertOwnedStoragePath } from "../_shared/storage-ownership.ts";
import { dietRecognitionPrompt, dietRecognitionRequest } from "../_shared/diet-prompt.ts";

type FoodItem = {
  name: string;
  amount?: string;
  weight_g?: number;
  calories?: number;
  protein_g?: number;
  carbohydrate_g?: number;
  fat_g?: number;
  confidence?: number;
  nutrition_source: "vision_estimate";
};

type VisualPlan = {
  canonical_dish_name: string;
  visible_ingredients: string[];
  appearance: string;
  plating: string;
  confidence: number;
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

  const visionKey = Deno.env.get("NAVA_DIET_VISION_KEY") ?? Deno.env.get("DASHSCOPE_API_KEY_NAVA");
  if (!visionKey) {
    throw new Error(input.lang === "en"
      ? "Food-photo recognition requires a NAVA-scoped vision AI key. Configure NAVA_DIET_VISION_KEY or DASHSCOPE_API_KEY_NAVA in Supabase Edge Function secrets."
      : "照片识别必须使用 NAVA 专用视觉 AI。请在 Supabase Edge Function Secrets 配置 NAVA_DIET_VISION_KEY 或 DASHSCOPE_API_KEY_NAVA。");
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
              text: dietRecognitionRequest(input.lang, input.meal, input.date),
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
      nutrition_source: "vision_estimate" as const,
    };
  }).filter((item) => item.name && !/^(?:待确认餐食|meal item to confirm)$/i.test(item.name));

  const sum = (field: keyof FoodItem) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
  const rawPlan = data.visual_plan && typeof data.visual_plan === "object"
    ? data.visual_plan as Record<string, unknown>
    : {};
  const visibleIngredients = Array.isArray(rawPlan.visible_ingredients)
    ? rawPlan.visible_ingredients.map((value) => String(value).trim()).filter(Boolean).slice(0, 16)
    : [];
  const visualPlan: VisualPlan = {
    canonical_dish_name: String(rawPlan.canonical_dish_name ?? items.map((item) => item.name).join("、")).trim(),
    visible_ingredients: visibleIngredients,
    appearance: String(rawPlan.appearance ?? "").trim(),
    plating: String(rawPlan.plating ?? "").trim(),
    confidence: boundedConfidence(rawPlan.confidence) ?? 0,
  };

  return {
    schemaVersion: "2.0.0",
    modelVersion: String(data.modelVersion ?? data.model_version ?? `diet-${provider}-2026-07`),
    provider,
    analysisAvailable,
    confidence: boundedConfidence(data.confidence) ?? Math.max(...items.map((item) => item.confidence ?? 0), 0),
    items,
    totals: {
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbohydrate_g: sum("carbohydrate_g"),
      fat_g: sum("fat_g"),
    },
    note: typeof data.note === "string" ? data.note : undefined,
    visual_plan: visualPlan,
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
