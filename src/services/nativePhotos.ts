import { Capacitor } from "@capacitor/core";
import { Camera, CameraDirection, CameraResultType, CameraSource, type CameraPlugin } from "@capacitor/camera";

export const usesNativePhotos = () => Capacitor.isNativePlatform();
export function photoPickerError(locale: "zh" | "en") {
  return locale === "zh" ? "无法打开照片，请检查相机或相册权限后重试。" : "Unable to open photos. Check camera or photo access and try again.";
}

const readNativePhoto = (url: string, signal?: AbortSignal) => fetch(url, { signal });

async function nativeJpeg(response: Response, filename: string, signal?: AbortSignal) {
  if (!response.ok) throw new Error("photo_read_failed");
  const blob = await response.blob();
  if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error("invalid_photo_size");
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("invalid_native_photo");
  return signal?.aborted ? null : new File([blob], filename, { type: "image/jpeg" });
}

/** One native picker at a time. No base64 bridge copies, gallery writes or uploads here. */
export function createNativePhotoPicker(driver: Pick<CameraPlugin, "getPhoto">, read = readNativePhoto) {
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
      return await nativeJpeg(await read(photo.webPath, signal), `nava-${source}-${Date.now()}.jpg`, signal);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && /cancelled|canceled/i.test(error.message))) return null;
      throw error;
    } finally { active = false; }
  };
}

export const pickNativePhoto = createNativePhotoPicker(Camera);

export async function pickNativeLibraryPhotos(limit: number, signal: AbortSignal): Promise<File[]> {
  if (limit < 1 || signal.aborted) return [];
  try {
    const { photos } = await Camera.pickImages({
      limit, quality: 90, width: 1600, height: 1600,
      correctOrientation: true, presentationStyle: "fullscreen",
    });
    if (signal.aborted) return [];
    const files = await Promise.all(photos.slice(0, limit).map(async (photo, index) => {
      const response = await readNativePhoto(photo.webPath, signal);
      return nativeJpeg(response, `nava-library-${Date.now()}-${index}.jpg`, signal);
    }));
    return files.filter(file => file !== null);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && /cancelled|canceled/i.test(error.message))) return [];
    throw error;
  }
}
