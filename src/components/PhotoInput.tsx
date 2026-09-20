import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from "react";
import { photoPickerError, pickNativePhoto, usesNativePhotos } from "../services/nativePhotos";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onClick" | "onError" | "multiple"> & {
  locale: "zh" | "en"; onFile: (file: File | null) => void; onError: (message: string) => void;
};

/** Keep the real web file input; installed apps use the system photo/camera picker. */
const PhotoInput = forwardRef<HTMLInputElement, Props>(function PhotoInput({ locale, onFile, onError, ...props }, ref) {
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return <input {...props} ref={ref} type="file" onChange={(event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    onFile(file);
  }} onClick={(event) => {
    if (!usesNativePhotos()) return;
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    void pickNativePhoto(props.capture ? "camera" : "library", props.capture === "user" ? "user" : "environment", controller.signal)
      .then((file) => { if (file && !controller.signal.aborted) onFile(file); })
      .catch(() => { if (!controller.signal.aborted) onError(photoPickerError(locale)); })
      .finally(() => { if (request.current === controller) request.current = null; });
  }} />;
});
export default PhotoInput;
