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
  if (isDemoMode()) {
    return {
      imageUrl: URL.createObjectURL(input.file),
      items: [
        { name: "鸡胸肉沙拉", calories: 520, amount: "1 份" },
        { name: "蓝莓酸奶", calories: 180, amount: "1 杯" },
      ],
    };
  }

  const ext = input.file.name.split(".").pop() || "jpg";
  const path = `${input.userId}/${input.date}/${input.meal}-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from("diet-photos").upload(path, input.file, { upsert: true });
  if (upload.error) throw upload.error;

  const { data: urlData } = supabase.storage.from("diet-photos").getPublicUrl(path);
  const imageUrl = urlData.publicUrl;
  const extracted = await supabase.functions.invoke<{ items: Array<{ name: string; weight_g?: number; calories?: number }> }>(
    "diet-extract",
    { body: { imageUrl, lang: "zh" } },
  );
  if (extracted.error) throw extracted.error;

  const items: FoodItem[] = (extracted.data?.items ?? []).map((item) => ({
    name: item.name,
    calories: Math.round(Number(item.calories) || 0),
    amount: item.weight_g ? `${Math.round(Number(item.weight_g))}g` : undefined,
  }));

  return { imageUrl, items };
}

export async function analyzeFacePhoto(file: File): Promise<{ image: string; result: FaceAnalysisResult }> {
  const image = await fileToDataUrl(file);
  if (isDemoMode()) {
    return {
      image,
      result: {
        overall_score: 82,
        feedback: "整体状态良好，眼周略疲劳，建议今晚提前休息并补充水分。",
        annotations: [
          { id: "eye", label: "眼周疲劳", desc: "轻微黑眼圈", dot_x: 52, dot_y: 36 },
          { id: "skin", label: "肤色", desc: "整体均匀", dot_x: 42, dot_y: 58 },
          { id: "lip", label: "唇部", desc: "轻微干燥", dot_x: 51, dot_y: 72 },
        ],
      },
    };
  }

  const response = await supabase.functions.invoke<FaceAnalysisResult>("face-analyze", {
    body: { image, lang: "zh", selfRatings: null },
  });
  if (response.error) throw response.error;
  if (!response.data) throw new Error("面部分析没有返回结果。");
  return { image, result: response.data };
}

