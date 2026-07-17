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
    const { adminClient } = await requireUser(req);
    const body = await readJson(req);
    const imagePath = stringValue(body.imagePath);
    const imageUrl = stringValue(body.imageUrl) ?? await signedImageUrl(adminClient, imagePath);
    const image = stringValue(body.image);
    const result = await callProvider({
      image,
      imageUrl,
      imagePath,
      lang: stringValue(body.lang) ?? "zh",
      selfRatings: body.selfRatings ?? null,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function callProvider(input: {
  image?: string;
  imageUrl?: string;
  imagePath?: string;
  lang: string;
  selfRatings: unknown;
}) {
  const endpoint = Deno.env.get("NAVA_FACE_ANALYZE_URL");
  const apiKey = Deno.env.get("NAVA_FACE_ANALYZE_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`面部分析服务返回 ${response.status}`);
    const data = await response.json();
    return normalizeResult(data, "provider");
  }

  return normalizeResult(
    {
      overall_score: 72,
      feedback: input.lang === "en"
        ? "Baseline analysis is enabled. Connect the formal face model before using this as a medical or skincare conclusion."
        : "当前为基础分析结果。正式面部模型接入前，请只把它作为状态记录和提醒，不作为医疗或护肤诊断。",
      annotations: [
        { id: "eye", label: input.lang === "en" ? "Eye area" : "眼周", desc: input.lang === "en" ? "Needs model confirmation" : "等待模型确认", dot_x: 50, dot_y: 35 },
        { id: "skin", label: input.lang === "en" ? "Skin tone" : "肤色", desc: input.lang === "en" ? "Needs model confirmation" : "等待模型确认", dot_x: 45, dot_y: 58 },
      ],
      confidence: 0.25,
    },
    "fallback",
  );
}

function normalizeResult(data: Record<string, unknown>, provider: "provider" | "fallback") {
  const annotations = Array.isArray(data.annotations)
    ? data.annotations.map((item, index) => {
      const value = item as Record<string, unknown>;
      return {
        id: String(value.id ?? `item-${index}`),
        label: String(value.label ?? "状态"),
        desc: String(value.desc ?? value.description ?? ""),
        dot_x: numeric(value.dot_x) ?? numeric(value.x) ?? 50,
        dot_y: numeric(value.dot_y) ?? numeric(value.y) ?? 50,
      };
    })
    : [];

  return {
    schemaVersion: "1.0.0",
    modelVersion: String(data.modelVersion ?? data.model_version ?? `face-${provider}-2026-07`),
    provider,
    overall_score: numeric(data.overall_score) ?? numeric(data.score) ?? 70,
    skin_age: numeric(data.skin_age),
    feedback: String(data.feedback ?? data.summary ?? "已完成面部状态分析。"),
    confidence: numeric(data.confidence) ?? (provider === "fallback" ? 0.25 : 0.75),
    annotations,
  };
}

async function signedImageUrl(adminClient: unknown, imagePath?: string) {
  if (!imagePath || !adminClient) return undefined;
  const client = adminClient as {
    storage: { from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }> } };
  };
  const { data, error } = await client.storage.from("face-photos").createSignedUrl(imagePath, 600);
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
