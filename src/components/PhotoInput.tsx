import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from "react";
import { photoPickerError, pickNativeLibraryPhotos, pickNativePhoto, usesNativePhotos } from "../services/nativePhotos";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onClick" | "onError" | "multiple"> & {
  locale: "zh" | "en"; onError: (message: string) => void;
} & ({ onFile: (file: File | null) => void; onFiles?: never; limit?: never }
  | { onFile?: never; onFiles: (files: File[]) => void; limit: number });

/** Keep the real web file input; installed apps use the system photo/camera picker. */
const PhotoInput = forwardRef<HTMLInputElement, Props>(function PhotoInput({ locale, onFile, onFiles, limit, onError, ...props }, ref) {
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return <input {...props} ref={ref} type="file" multiple={Boolean(onFiles)} onChange={(event) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (onFiles) onFiles(files);
    else onFile?.(files[0] ?? null);
  }} onClick={(event) => {
    if (!usesNativePhotos()) return;
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const selection = limit !== undefined
      ? pickNativeLibraryPhotos(limit, controller.signal)
      : pickNativePhoto(props.capture ? "camera" : "library", props.capture === "user" ? "user" : "environment", controller.signal)
        .then((file) => file ? [file] : []);
    void selection
      .then((files) => {
        if (!files.length || controller.signal.aborted) return;
        if (onFiles) onFiles(files);
        else onFile?.(files[0]);
      })
      .catch(() => { if (!controller.signal.aborted) onError(photoPickerError(locale)); })
      .finally(() => { if (request.current === controller) request.current = null; });
  }} />;
});
export default PhotoInput;
