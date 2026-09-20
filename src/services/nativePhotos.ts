import { Capacitor } from "@capacitor/core";
import { Camera, CameraDirection, CameraResultType, CameraSource, type CameraPlugin } from "@capacitor/camera";

export const usesNativePhotos = () => Capacitor.isNativePlatform();
export function photoPickerError(locale: "zh" | "en") {
  return locale === "zh" ? "无法打开照片，请检查相机或相册权限后重试。" : "Unable to open photos. Check camera or photo access and try again.";
}

/** One native picker at a time. No base64 bridge copies, gallery writes or uploads here. */
export function createNativePhotoPicker(driver: Pick<CameraPlugin, "getPhoto">, read = (url: string, signal?: AbortSignal) => fetch(url, { signal })) {
  let active = false;
  return async (source: "camera" | "library", facing: "user" | "environment" = "environment", signal?: AbortSignal): Promise<File | null> => {
    if (signal?.aborted) return null;
    if (active) throw new Error("photo_picker_busy");
    active = true;
    try {
      // Defer opening until React's effect cleanup has had a chance to cancel it.
      await Promise.resolve();
      if (signal?.aborted) return null;
      const photo = await driver.getPhoto({
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        direction: facing === "user" ? CameraDirection.Front : CameraDirection.Rear,
        resultType: CameraResultType.Uri, quality: 90, width: 1600, height: 1600,
        correctOrientation: true, allowEditing: false, saveToGallery: false, presentationStyle: "fullscreen",
      });
      if (signal?.aborted) return null;
      if (!photo.webPath || !/^jpe?g$/i.test(photo.format)) throw new Error("invalid_native_photo");
      const response = await read(photo.webPath, signal);
      if (!response.ok) throw new Error("photo_read_failed");
      const blob = await response.blob();
      if (signal?.aborted) return null;
      if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error("invalid_photo_size");
      // Validate the native result, rather than renaming an arbitrary file to JPEG.
      const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("invalid_native_photo");
      if (signal?.aborted) return null;
      return new File([blob], `nava-${source}-${Date.now()}.jpg`, { type: "image/jpeg" });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && /cancelled|canceled/i.test(error.message))) return null;
      throw error;
    } finally { active = false; }
  };
}

export const pickNativePhoto = createNativePhotoPicker(Camera);
