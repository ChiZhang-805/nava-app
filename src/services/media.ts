import { supabase } from "./supabaseClient";
import { isDemoMode } from "./demo";
import type { DietExtractResult, FaceAnalysisResult, FoodItem } from "../types";

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
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
  const path = `${input.userId}/${input.date}/${input.meal}-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from("diet-photos").upload(path, input.file, { upsert: true });
  if (upload.error) throw upload.error;

  const extracted = await supabase.functions.invoke<{
    items: Array<{ name: string; amount?: string; weight_g?: number; calories?: number }>;
    modelVersion?: string;
    model_version?: string;
    confidence?: number;
  }>("diet-extract", { body: { imagePath: path, meal: input.meal, date: input.date, lang: "zh" } });
  if (extracted.error) throw extracted.error;

  const items: FoodItem[] = (extracted.data?.items ?? []).map((item) => ({
    name: item.name,
    calories: Math.round(Number(item.calories) || 0),
    amount: item.amount ?? (item.weight_g ? `${Math.round(Number(item.weight_g))}g` : undefined),
  }));

  return {
    imageUrl: previewUrl,
    imagePath: path,
    items,
    modelVersion: extracted.data?.modelVersion ?? extracted.data?.model_version,
    confidence: extracted.data?.confidence,
  };
}

export async function analyzeFacePhoto(input: {
  userId: string;
  date: string;
  file: File;
}): Promise<{ image: string; imagePath?: string; result: FaceAnalysisResult }> {
  const image = await fileToDataUrl(input.file);
  if (isDemoMode()) {
    return {
      image,
      imagePath: `demo/${input.userId}/${input.date}/face.jpg`,
      result: {
        overall_score: 82,
        feedback: "整体状态良好，眼周略疲劳，建议今晚提前休息并补充水分。",
        annotations: [
          { id: "eye", label: "眼周疲劳", desc: "轻微黑眼圈", dot_x: 52, dot_y: 36 },
          { id: "skin", label: "肤色", desc: "整体均匀", dot_x: 42, dot_y: 58 },
          { id: "lip", label: "唇部", desc: "轻微干燥", dot_x: 51, dot_y: 72 },
        ],
        modelVersion: "demo",
        confidence: 0.9,
      },
    };
  }

  const ext = input.file.name.split(".").pop() || "jpg";
  const path = `${input.userId}/${input.date}/face-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from("face-photos").upload(path, input.file, { upsert: true });
  if (upload.error) throw upload.error;

  const response = await supabase.functions.invoke<FaceAnalysisResult>("face-analyze", {
    body: { image, imagePath: path, lang: "zh", selfRatings: null },
  });
  if (response.error) throw response.error;
  if (!response.data) throw new Error("面部分析没有返回结果。");
  return { image, imagePath: path, result: response.data };
}
