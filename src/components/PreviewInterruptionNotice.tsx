import { Bell, PhoneIncoming, Smartphone } from "lucide-react";
import type { PreviewReason } from "../services/previewEnvironment";

export default function PreviewInterruptionNotice({ reason, locale, children }: {
  reason: PreviewReason; locale: "zh" | "en"; children: React.ReactNode;
}) {
  const Icon = reason === "call" ? PhoneIncoming : reason === "message" ? Bell : Smartphone;
  const title = locale === "zh"
    ? ({ call: "模拟来电", message: "模拟消息通知", distraction: "模拟分心", other: "模拟切到后台" })[reason]
    : ({ call: "Simulated call", message: "Simulated notification", distraction: "Simulated distraction", other: "Simulated backgrounding" })[reason];
  return <section className="preview-interruption-notice" data-preview-interruption={reason} role="status">
    <header><Icon size={22} /><strong>{title}</strong></header>
    {children}
  </section>;
}
