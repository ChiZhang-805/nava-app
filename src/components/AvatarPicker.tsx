import { Camera, Images } from "lucide-react";
import { useLocale } from "../i18n";
import BottomSheet from "./BottomSheet";
import "./avatar-picker.css";

export default function AvatarPicker({ onClose, onCamera, onLibrary }: {
  onClose: () => void; onCamera: () => void; onLibrary: () => void;
}) {
  const { locale, t } = useLocale();
  return <BottomSheet className="avatar-sheet avatar-picker" label={t("profile.changeAvatar")} closeLabel={locale === "zh" ? "关闭弹窗，也可以向下拖动" : "Close sheet, or drag down"} onClose={onClose}>
      <h2 className="avatar-picker-title">{t("profile.changeAvatar")}</h2>
      <div className="avatar-sheet-actions">
        <button type="button" onClick={() => { onCamera(); onClose(); }}><Camera size={24} aria-hidden="true" /><span>{locale === "zh" ? "拍照" : "Take photo"}</span></button>
        <button type="button" onClick={() => { onLibrary(); onClose(); }}><Images size={24} aria-hidden="true" /><span>{locale === "zh" ? "从相册选择" : "Photo library"}</span></button>
      </div>
  </BottomSheet>;
}
