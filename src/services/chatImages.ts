import { authenticatedFunctionHeaders, supabase } from "./supabaseClient";
import { isDemoMode } from "./demo";
import { validateChatImage } from "./chatAttachments";
import {
  CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_MAX_COUNT, CHAT_IMAGE_TOTAL_MAX_BYTES,
  validateChatImageAnalysis, validateChatImageInputs, type ChatImageAnalysis, type ChatImageInput,
} from "../../supabase/functions/_shared/chat-image-contract.ts";

export type ChatPhotoInput = { id: string; file: File };
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); };

/** Rasterization strips metadata; bytes exist only for this request, never storage. */
export async function prepareChatImages(photos: ChatPhotoInput[], signal?: AbortSignal): Promise<ChatImageInput[]> {
  if (!photos.length || photos.length > CHAT_IMAGE_MAX_COUNT) throw new Error("每次请选择 1 至 4 张图片 / Select 1–4 images.");
  const budget = Math.min(CHAT_IMAGE_MAX_BYTES, Math.floor(CHAT_IMAGE_TOTAL_MAX_BYTES / photos.length));
  const prepared: ChatImageInput[] = [];
  for (const photo of photos) {
    checkAbort(signal);
    if (validateChatImage(photo.file)) throw new Error("无法读取这张图片，请选择不超过 10 MB 的 JPEG、PNG 或 WebP。 / Choose a JPEG, PNG or WebP image under 10 MB.");
    const url = URL.createObjectURL(photo.file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener("abort", abort); };
        const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
        image.onload = () => { cleanup(); resolve(); };
        image.onerror = () => { cleanup(); reject(new Error("这张图片无法解码，请换一张试试。 / This image could not be decoded.")); };
        signal?.addEventListener("abort", abort, { once: true });
        image.src = url;
      });
      checkAbort(signal);
      let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      let dataUrl = "";
      for (let attempt = 0; attempt < 6 && !dataUrl; attempt++) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("暂时无法处理图片 / Image processing unavailable.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [.88, .72, .56, .42]) {
          checkAbort(signal);
          const candidate = canvas.toDataURL("image/jpeg", quality);
          if ((candidate.length - candidate.indexOf(",") - 1) * 3 / 4 <= budget) { dataUrl = candidate; break; }
        }
        scale *= .75;
      }
      canvas.width = canvas.height = 0;
      if (!dataUrl) throw new Error("这张图片过大，压缩后仍无法发送。 / This image is still too large after compression.");
      prepared.push({ id: photo.id, dataUrl });
    } finally { URL.revokeObjectURL(url); }
  }
  return validateChatImageInputs(prepared);
}

export async function analyzeChatImages(input: { photos: ChatPhotoInput[]; message: string; locale: "zh" | "en"; signal?: AbortSignal }): Promise<ChatImageAnalysis> {
  if (isDemoMode()) return {
    schemaVersion: "nava.chat-images.v1", provider: "demo", modelVersion: "no-vision-model", canAutoSave: false,
    images: input.photos.map(photo => ({ id: photo.id, kinds: ["uncertain"], summary: input.locale === "zh" ? "演示图片，未调用真实视觉识别。" : "Demo image; no vision model was called.", observations: [], uncertainties: [input.locale === "zh" ? "图片内容尚未识别。" : "Image contents have not been identified."], confidence: 0 })),
  };
  const images = await prepareChatImages(input.photos, input.signal);
  checkAbort(input.signal);
  const response = await supabase.functions.invoke("ai-chat-reply", {
    headers: await authenticatedFunctionHeaders(),
    body: { purpose: "chat-images", images, message: input.message, lang: input.locale },
    signal: input.signal,
  });
  if (response.error) {
    const context = "context" in response.error ? response.error.context : null;
    let message = input.locale === "zh" ? "暂时没能看清这些图片，请稍后再试。" : "Could not analyze these images. Please try again.";
    if (context instanceof Response) {
      const detail = await context.clone().json().catch(() => null);
      if (typeof detail?.error === "string") message = detail.error;
    }
    throw new Error(message);
  }
  checkAbort(input.signal);
  return validateChatImageAnalysis(response.data, input.photos.map(photo => photo.id));
}
