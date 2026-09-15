import { authenticatedFunctionHeaders, supabase } from "./supabaseClient";
import { isDemoMode } from "./demo";
import { optionalNonNegative, scaleKnown, sumKnown } from "./recordNumbers";
import type { DietExtractResult, FaceAnalysisResult, FoodItem } from "../types";

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function isMissingStorageBucket(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; message?: string; error?: string };
  const detail = `${candidate.message ?? ""} ${candidate.error ?? ""}`;
  return Number(candidate.statusCode) === 404 || /bucket not found|not found/i.test(detail);
}

export async function analyzeDietPhoto(input: {
  userId: string;
  date: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  file: File;
}): Promise<DietExtractResult> {
  const previewUrl = URL.createObjectURL(input.file);
  if (isDemoMode()) {
    return {
      imageUrl: previewUrl,
      imagePath: `demo/${input.userId}/${input.date}/${input.meal}.jpg`,
      items: [
        { name: "鸡胸肉沙拉", calories: 520, amount: "1 份" },
        { name: "蓝莓酸奶", calories: 180, amount: "1 杯" },
      ],
      modelVersion: "demo",
      confidence: 0.9,
    };
  }

  const ext = input.file.name.split(".").pop() || "jpg";
  const path = `${input.userId}/${input.date}/${input.meal}-${crypto.randomUUID()}.${ext}`;
  const upload = await supabase.storage.from("diet-photos").upload(path, input.file, { upsert: false });
  if (upload.error) {
    if (isMissingStorageBucket(upload.error)) throw new Error("共享后端尚未启用私有饮食照片存储，照片不会绕过私有存储直接发送给模型。");
    throw upload.error;
  }
  const imagePath = path;

  const extracted = await supabase.functions.invoke<{
    items: Array<{
      name: string;
      amount?: string;
      weight_g?: number;
      calories?: number;
      protein_g?: number;
      carbohydrate_g?: number;
      fat_g?: number;
      confidence?: number;
      nutrition_source?: "vision_estimate" | "usda_fdc";
      nutrition_source_id?: string;
    }>;
    modelVersion?: string;
    model_version?: string;
    confidence?: number;
    provider?: string;
    note?: string;
    analysisAvailable?: boolean;
    totals?: {
      calories?: number;
      protein_g?: number;
      carbohydrate_g?: number;
      fat_g?: number;
    };
  }>("diet-extract", {
    headers: await authenticatedFunctionHeaders(),
    body: { imagePath, meal: input.meal, date: input.date, lang: "zh" },
  });
  if (extracted.error) throw extracted.error;

  const items: FoodItem[] = (extracted.data?.items ?? []).map((item) => ({
    name: item.name,
    calories: scaleKnown(item.calories, 1, 0),
    amount: item.amount ?? (item.weight_g ? `${Math.round(Number(item.weight_g))}g` : undefined),
    weight_grams: Number(item.weight_g) || undefined,
    protein_grams: optionalNonNegative(item.protein_g),
    carbohydrate_grams: optionalNonNegative(item.carbohydrate_g),
    fat_grams: optionalNonNegative(item.fat_g),
    confidence: Number(item.confidence) || undefined,
    nutrition_source: item.nutrition_source ?? "vision_estimate",
    nutrition_source_id: item.nutrition_source_id,
  }));

  const sum = (field: "calories" | "protein_grams" | "carbohydrate_grams" | "fat_grams") =>
    sumKnown(items.map((item) => item[field]));
  const totals = extracted.data?.totals;

  return {
    imageUrl: previewUrl,
    imagePath,
    items,
    modelVersion: extracted.data?.modelVersion ?? extracted.data?.model_version,
    confidence: extracted.data?.confidence,
    provider: extracted.data?.provider,
    note: extracted.data?.note,
    analysisAvailable: extracted.data?.analysisAvailable ?? items.length > 0,
    totals: {
      calories: scaleKnown(optionalNonNegative(totals?.calories) ?? sum("calories"), 1, 0),
      proteinGrams: optionalNonNegative(totals?.protein_g) ?? sum("protein_grams"),
      carbohydrateGrams: optionalNonNegative(totals?.carbohydrate_g) ?? sum("carbohydrate_grams"),
      fatGrams: optionalNonNegative(totals?.fat_g) ?? sum("fat_grams"),
    },
  };
}

export async function resolveDietPhotoUrl(imagePath?: string | null) {
  if (!imagePath) return null;
  if (/^(?:blob:|data:|https?:\/\/)/i.test(imagePath)) return imagePath;
  const signed = await supabase.storage.from("diet-photos").createSignedUrl(imagePath, 60 * 30);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

export async function analyzeFacePhoto(input: {
  userId: string;
  date: string;
  file: File;
  captureMode: "bare_face" | "makeup";
  locale?: "zh" | "en";
}): Promise<{ image: string; imagePath?: string; result: FaceAnalysisResult }> {
  const image = await fileToDataUrl(input.file);
  if (isDemoMode()) {
    const english = input.locale === "en";
    return {
      image,
      imagePath: `demo/${input.userId}/${input.date}/face.jpg`,
      result: {
        overall_score: 82,
        feedback: english
          ? "Overall condition looks steady. Mild eye fatigue suggests an earlier night and a little more water."
          : "整体状态良好，眼周略疲劳，建议今晚提前休息并补充水分。",
        annotations: [
          { id: "eye", label: english ? "Eye fatigue" : "眼周疲劳", desc: english ? "Mild dark circles" : "轻微黑眼圈", dot_x: 52, dot_y: 36 },
          { id: "skin", label: english ? "Skin tone" : "肤色", desc: english ? "Generally even" : "整体均匀", dot_x: 42, dot_y: 58 },
          { id: "lip", label: english ? "Lips" : "唇部", desc: english ? "Slightly dry" : "轻微干燥", dot_x: 51, dot_y: 72 },
        ],
        modelVersion: "demo",
        confidence: 0.9,
        makeup_level: input.captureMode === "makeup" ? "light" : "bare",
        makeup_confidence: 0.92,
        capture_conditions: { light: true, position: true, expression: true },
      },
    };
  }

  const ext = input.file.name.split(".").pop() || "jpg";
  const path = `${input.userId}/${input.date}/face-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from("face-photos").upload(path, input.file, { upsert: true });
  if (upload.error) {
    if (isMissingStorageBucket(upload.error)) throw new Error("共享后端尚未启用私有面部照片存储，照片不会绕过私有存储直接发送给模型。");
    throw upload.error;
  }
  const imagePath = path;

  const response = await supabase.functions.invoke<FaceAnalysisResult>("face-analyze", {
    headers: await authenticatedFunctionHeaders(),
    body: { imagePath, captureMode: input.captureMode, lang: input.locale ?? "zh", selfRatings: null },
  });
  if (response.error) throw response.error;
  if (!response.data) throw new Error("面部分析没有返回结果。");
  return { image, imagePath, result: response.data };
}
