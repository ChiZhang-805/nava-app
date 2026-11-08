import { errorResponse, jsonResponse, optionsResponse, readJson, requireUser, stringValue } from "../_shared/http.ts";
import { assertOwnedStoragePath } from "../_shared/storage-ownership.ts";
import {
  foodVisualPrompt,
  foodVisualPromptVersion,
  foodVisualQualityThresholds,
  foodVisualSpecification,
} from "../_shared/food-visual-prompt.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

type VisualPlan = {
  canonical_dish_name: string;
  visible_ingredients: string[];
  appearance: string;
  plating: string;
  confidence: number;
};

type QualityResult = {
  dishIdentityScore: number;
  visibleIngredientRecall: number;
  unexpectedIngredientScore: number;
  artifactScore: number;
  plateCompositionPass: boolean;
  hasTextOrWatermark: boolean;
  hasHandsOrUtensils: boolean;
  feedback?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, adminClient } = await requireUser(req);
    if (!adminClient) throw new Error("盘装图服务缺少私有存储管理员配置。");
    if (!Deno.env.get("NAVA_FOOD_RENDER_QA_URL") && !Deno.env.get("DASHSCOPE_API_KEY_NAVA")) {
      throw new Error("NAVA 食物生成质量检查尚未配置；需要 NAVA_FOOD_RENDER_QA_URL 或 NAVA 专用 DASHSCOPE_API_KEY_NAVA。");
    }

    const body = await readJson(req);
    const imagePath = stringValue(body.imagePath);
    assertOwnedStoragePath(imagePath, user.id, "饮食照片");
    if (!imagePath) throw new Error("必须提供当前账号拥有的原始饮食照片。");
    const plan = normalizePlan(body.visualPlan);
    if (plan.confidence < 0.78) throw new Error("菜品身份置信度不足，请先让用户确认菜名和可见食材。");

    const sourceUrl = await signedUrl(adminClient, "diet-photos", imagePath, 900);
    let feedback: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const generated = await generateCandidate(sourceUrl, plan, feedback, attempt);
      const png = inspectPNGHeader(generated.bytes);
      if (png.width !== 1024 || png.height !== 1024 || !png.hasAlpha) {
        feedback = "Output must be an exact 1024x1024 PNG with a real alpha channel.";
        continue;
      }
      const assetPath = `${user.id}/generated/${crypto.randomUUID()}.png`;
      const uploaded = await adminClient.storage.from("diet-renders").upload(assetPath, generated.bytes, {
        contentType: "image/png",
        upsert: false,
        cacheControl: "31536000",
      });
      if (uploaded.error) throw uploaded.error;

      const assetUrl = await signedUrl(adminClient, "diet-renders", assetPath, 900);
      let quality: QualityResult;
      try {
        quality = await callQualityCritic({ sourceUrl, assetUrl, plan, userId: user.id });
      } catch (error) {
        await adminClient.storage.from("diet-renders").remove([assetPath]);
        throw error;
      }
      if (passesQualityGate(quality)) {
        return jsonResponse({
          schemaVersion: "1.0.0",
          assetUrl,
          assetPath,
          modelVersion: generated.modelVersion,
          promptVersion: foodVisualPromptVersion,
          quality,
          disclosure: "AI reconstructed display asset; original photo remains the recognition evidence.",
        });
      }

      await adminClient.storage.from("diet-renders").remove([assetPath]);
      feedback = quality.feedback ?? "The candidate failed one or more strict identity, ingredient, composition, or artifact thresholds.";
    }
    throw new Error("生成图连续两次未通过菜品一致性或画面质量检查，已阻止展示。");
  } catch (error) {
    return errorResponse(error);
  }
});

function normalizePlan(value: unknown): VisualPlan {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ingredients = Array.isArray(raw.visibleIngredients)
    ? raw.visibleIngredients.map((item) => String(item).trim()).filter(Boolean).slice(0, 16)
    : [];
  const plan = {
    canonical_dish_name: limited(raw.canonicalDishName, 120),
    visible_ingredients: ingredients,
    appearance: limited(raw.appearanceNotes, 600),
    plating: limited(raw.platingNotes, 600),
    confidence: bounded(raw.confidence),
  };
  if (!plan.canonical_dish_name) throw new Error("缺少可确认的菜品名称。");
  return plan;
}

async function generateCandidate(
  sourceUrl: string,
  plan: VisualPlan,
  feedback: string | undefined,
  attempt: number,
) {
  const customEndpoint = Deno.env.get("NAVA_FOOD_RENDER_URL");
  if (customEndpoint) return await callCustomGenerator(customEndpoint, sourceUrl, plan, feedback);

  const apiKey = Deno.env.get("DASHSCOPE_API_KEY_NAVA");
  if (!apiKey) {
    throw new Error("缺少 NAVA 专用 DASHSCOPE_API_KEY_NAVA；不会回退到其他项目或通用密钥。");
  }
  const model = attempt === 1
    ? Deno.env.get("NAVA_FOOD_RENDER_MODEL") ?? "wan2.7-image"
    : Deno.env.get("NAVA_FOOD_RENDER_FALLBACK_MODEL") ?? "wan2.7-image-pro";
  const response = await fetch(dashScopeImageEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: { messages: [{ role: "user", content: [
        { image: sourceUrl },
        { text: foodVisualPrompt(plan, feedback) },
      ] }] },
      parameters: { size: "1K", n: 1, watermark: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`通义万相盘装图生成服务返回 ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const resultUrl = extractDashScopeImageUrl(payload);
  if (!resultUrl) throw new Error("通义万相没有返回可下载的盘装图。");
  const result = await fetch(resultUrl, { signal: AbortSignal.timeout(60_000) });
  if (!result.ok) throw new Error(`通义万相盘装图下载返回 ${result.status}`);
  const generated = new Uint8Array(await result.arrayBuffer());
  if (isExactTransparentPNG(generated)) return { bytes: generated, modelVersion: model };
  return await callMattingNormalizer(resultUrl, plan, model);
}

function dashScopeImageEndpoint() {
  const explicit = Deno.env.get("NAVA_DASHSCOPE_IMAGE_URL");
  if (explicit) return explicit;
  const workspaceId = Deno.env.get("NAVA_DASHSCOPE_WORKSPACE_ID")?.trim();
  if (workspaceId) {
    if (!/^[A-Za-z0-9_-]+$/.test(workspaceId)) throw new Error("NAVA_DASHSCOPE_WORKSPACE_ID 格式无效。");
    return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;
  }
  return "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
}

function extractDashScopeImageUrl(payload: Record<string, unknown>) {
  const output = payload.output && typeof payload.output === "object" ? payload.output as Record<string, unknown> : {};
  const choices = Array.isArray(output.choices) ? output.choices : [];
  for (const choice of choices) {
    const message = choice && typeof choice === "object" ? (choice as Record<string, unknown>).message : undefined;
    const content = message && typeof message === "object" && Array.isArray((message as Record<string, unknown>).content)
      ? (message as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).image === "string") {
        return (part as Record<string, unknown>).image as string;
      }
    }
  }
  return "";
}

async function callMattingNormalizer(sourceImageUrl: string, plan: VisualPlan, generatorModel: string) {
  const endpoint = Deno.env.get("NAVA_FOOD_MATTING_URL");
  if (!endpoint) {
    throw new Error("国内生图模型已返回盘装图，但还需配置 NAVA_FOOD_MATTING_URL 才能产出严格 1024×1024 透明 PNG。");
  }
  const key = Deno.env.get("NAVA_FOOD_MATTING_KEY");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      sourceImageUrl,
      purpose: "generated-food-plate-postprocess",
      plan,
      specification: foodVisualSpecification,
      output: { format: "png", width: 1024, height: 1024, transparentBackground: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`国内盘装图抠图与规格化服务返回 ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const base64 = stringValue(payload.imageBase64);
  if (!base64) throw new Error("国内盘装图抠图服务没有返回 imageBase64。");
  const bytes = decodePNG(base64);
  if (!isExactTransparentPNG(bytes)) throw new Error("抠图服务返回的文件不是严格 1024×1024 透明 PNG。");
  return {
    bytes,
    modelVersion: `${generatorModel}+${stringValue(payload.modelVersion) ?? "aliyun-matting"}`,
  };
}

async function callCustomGenerator(endpoint: string, sourceUrl: string, plan: VisualPlan, feedback?: string) {
  const key = Deno.env.get("NAVA_FOOD_RENDER_KEY");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ sourceUrl, plan, prompt: foodVisualPrompt(plan, feedback), specification: foodVisualSpecification }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`自定义盘装图生成器返回 ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const base64 = stringValue(payload.imageBase64);
  if (!base64) throw new Error("自定义盘装图生成器没有返回 imageBase64。");
  return { bytes: decodePNG(base64), modelVersion: stringValue(payload.modelVersion) ?? "custom-food-renderer" };
}

type QualityCriticInput = { sourceUrl: string; assetUrl: string; plan: VisualPlan; userId: string };

async function callQualityCritic(input: QualityCriticInput): Promise<QualityResult> {
  const endpoint = Deno.env.get("NAVA_FOOD_RENDER_QA_URL");
  if (!endpoint) return await callDashScopeQualityCritic(input);
  const key = Deno.env.get("NAVA_FOOD_RENDER_QA_KEY");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      sourceUrl: input.sourceUrl,
      assetUrl: input.assetUrl,
      plan: input.plan,
      specification: foodVisualSpecification,
      thresholds: foodVisualQualityThresholds,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`盘装图质量检查服务返回 ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  return {
    dishIdentityScore: bounded(data.dishIdentityScore),
    visibleIngredientRecall: bounded(data.visibleIngredientRecall),
    unexpectedIngredientScore: bounded(data.unexpectedIngredientScore),
    artifactScore: bounded(data.artifactScore),
    plateCompositionPass: data.plateCompositionPass === true,
    hasTextOrWatermark: data.hasTextOrWatermark === true,
    hasHandsOrUtensils: data.hasHandsOrUtensils === true,
    feedback: stringValue(data.feedback),
  };
}

async function callDashScopeQualityCritic(input: QualityCriticInput): Promise<QualityResult> {
  const apiKey = Deno.env.get("DASHSCOPE_API_KEY_NAVA");
  if (!apiKey) throw new Error("缺少 NAVA 专用 DASHSCOPE_API_KEY_NAVA，无法执行生成图语义复核。");
  const response = await fetch(
    Deno.env.get("NAVA_FOOD_RENDER_QA_COMPATIBLE_URL") ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: Deno.env.get("NAVA_FOOD_RENDER_QA_MODEL") ?? "qwen3-vl-plus",
      temperature: 0.1,
      messages: [{ role: "user", content: [
        { type: "text", text: `${qualityCriticPrompt(input.plan)}\nReturn JSON only. Required schema: ${JSON.stringify(qualitySchema)}.` },
        { type: "image_url", image_url: { url: input.sourceUrl, detail: "high" } },
        { type: "image_url", image_url: { url: input.assetUrl, detail: "high" } },
      ] }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`通义千问生成图语义复核返回 ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const text = extractChatOutputText(payload);
  if (!text) throw new Error("通义千问生成图语义复核没有返回结构化结果。");
  const data = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
  return {
    dishIdentityScore: bounded(data.dishIdentityScore),
    visibleIngredientRecall: bounded(data.visibleIngredientRecall),
    unexpectedIngredientScore: bounded(data.unexpectedIngredientScore),
    artifactScore: bounded(data.artifactScore),
    plateCompositionPass: data.plateCompositionPass === true,
    hasTextOrWatermark: data.hasTextOrWatermark === true,
    hasHandsOrUtensils: data.hasHandsOrUtensils === true,
    feedback: stringValue(data.feedback),
  };
}

const qualitySchema = {
  type: "json_schema",
  name: "nava_food_render_quality",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      dishIdentityScore: { type: "number", minimum: 0, maximum: 1 },
      visibleIngredientRecall: { type: "number", minimum: 0, maximum: 1 },
      unexpectedIngredientScore: { type: "number", minimum: 0, maximum: 1 },
      artifactScore: { type: "number", minimum: 0, maximum: 1 },
      plateCompositionPass: { type: "boolean" },
      hasTextOrWatermark: { type: "boolean" },
      hasHandsOrUtensils: { type: "boolean" },
      feedback: { type: "string" },
    },
    required: [
      "dishIdentityScore", "visibleIngredientRecall", "unexpectedIngredientScore", "artifactScore",
      "plateCompositionPass", "hasTextOrWatermark", "hasHandsOrUtensils", "feedback",
    ],
  },
};

function qualityCriticPrompt(plan: VisualPlan) {
  return `You are NAVA's strict two-image food rendering critic. Image 1 is the user's evidence photo; image 2 is an AI-reconstructed display asset.\n
Expected dish: ${plan.canonical_dish_name}\n
Expected visible ingredients: ${plan.visible_ingredients.join(", ") || "not enumerated"}\n
Score whether image 2 preserves the dish identity and visible ingredients from image 1, invents ingredients, contains visual artifacts, and follows a centered top-down clean white plate composition on transparent canvas. Reject text, labels, watermarks, hands, cutlery, table, napkins, and extra props. Be conservative: uncertainty lowers scores. The generated image is decorative and must never be treated as nutrition evidence.`;
}

function extractChatOutputText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : undefined;
  if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") {
    return (message as Record<string, unknown>).content as string;
  }
  return "";
}

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function passesQualityGate(quality: QualityResult) {
  return quality.dishIdentityScore >= foodVisualQualityThresholds.dishIdentityScore &&
    quality.visibleIngredientRecall >= foodVisualQualityThresholds.visibleIngredientRecall &&
    quality.unexpectedIngredientScore <= foodVisualQualityThresholds.unexpectedIngredientScore &&
    quality.artifactScore <= foodVisualQualityThresholds.artifactScore &&
    quality.plateCompositionPass && !quality.hasTextOrWatermark && !quality.hasHandsOrUtensils;
}

async function signedUrl(client: SupabaseClient, bucket: string, path: string, seconds: number) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw error ?? new Error(`无法签发 ${bucket} 私有资源。`);
  return data.signedUrl as string;
}

function inspectPNGHeader(bytes: Uint8Array) {
  if (bytes.length < 33) throw new Error("生成 PNG 头部不完整。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const colorType = bytes[25];
  return { width, height, hasAlpha: colorType === 4 || colorType === 6 };
}

function isExactTransparentPNG(bytes: Uint8Array) {
  try {
    const png = inspectPNGHeader(bytes);
    return png.width === 1024 && png.height === 1024 && png.hasAlpha;
  } catch {
    return false;
  }
}

function decodePNG(value: string) {
  const clean = value.replace(/^data:image\/png;base64,/, "");
  const binary = atob(clean);
  if (binary.length > 8 * 1024 * 1024) throw new Error("生成 PNG 超过 8MB 限制。");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!png.every((byte, index) => bytes[index] === byte)) throw new Error("生成器没有返回有效 PNG。");
  return bytes;
}

function limited(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bounded(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}
