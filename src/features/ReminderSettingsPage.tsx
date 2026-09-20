import { ArrowLeft } from "lucide-react";
import ReminderSettings from "../components/ReminderSettings";

export default function ReminderSettingsPage({ userId, locale, onBack }: { userId: string; locale: "zh" | "en"; onBack: () => void }) {
  const zh = locale === "zh";
  return <section className="home-experience reminder-settings-page" data-reminder-page>
    <header className="home-experience-header"><button type="button" className="home-experience-back" onClick={onBack} aria-label={zh ? "返回通知中心" : "Back to notifications"}><ArrowLeft size={21} /></button><div><h1>{zh ? "提醒设置" : "Reminder settings"}</h1></div><span className="reminder-header-spacer" /></header>
    <ReminderSettings userId={userId} locale={locale} standalone />
  </section>;
}
