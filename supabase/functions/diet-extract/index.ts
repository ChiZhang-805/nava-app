import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";

type FoodItem = {
  name: string;
  amount?: string;
  weight_g?: number;
  calories?: number;
  confidence?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { userClient, adminClient } = await requireUser(req);
    const body = await readJson(req);
    const lang = stringValue(body.lang) ?? "zh";
    const imagePath = stringValue(body.imagePath);
    const imageUrl = stringValue(body.imageUrl) ?? await signedImageUrl(adminClient ?? userClient, imagePath);
    const providerResult = await callProvider({ imageUrl, imagePath, lang, meal: stringValue(body.meal) });
    return jsonResponse(providerResult);
  } catch (error) {
    return errorResponse(error);
  }
});

async function callProvider(input: { imageUrl?: string; imagePath?: string; lang: string; meal?: string }) {
  const endpoint = Deno.env.get("NAVA_DIET_EXTRACT_URL");
  const apiKey = Deno.env.get("NAVA_DIET_EXTRACT_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`饮食识别服务返回 ${response.status}`);
    const data = await response.json();
    return normalizeProviderResult(data, "provider");
  }

  return normalizeProviderResult(
    {
      items: [
        { name: input.lang === "en" ? "Meal item to confirm" : "待确认餐食", amount: "1 份", calories: 0, confidence: 0.2 },
      ],
      confidence: 0.2,
      note: "未配置 NAVA_DIET_EXTRACT_URL，当前返回保守占位识别结果。",
    },
    "fallback",
  );
}

function normalizeProviderResult(data: Record<string, unknown>, provider: "provider" | "fallback") {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: FoodItem[] = rawItems.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      name: String(value.name ?? "待确认餐食"),
      amount: typeof value.amount === "string" ? value.amount : value.weight_g ? `${Math.round(Number(value.weight_g))}g` : undefined,
      weight_g: numeric(value.weight_g),
      calories: numeric(value.calories),
      confidence: numeric(value.confidence),
    };
  });

  return {
    schemaVersion: "1.0.0",
    modelVersion: String(data.modelVersion ?? data.model_version ?? `diet-${provider}-2026-07`),
    provider,
    confidence: numeric(data.confidence) ?? Math.max(...items.map((item) => item.confidence ?? 0), 0),
    items,
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
