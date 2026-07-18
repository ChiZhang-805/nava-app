import type { User } from "@supabase/supabase-js";
import { Apple, Download, LogOut, RefreshCw, Save, ShieldCheck, Watch } from "lucide-react";
import { useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { useLocale } from "../i18n";
import { appConfig } from "../config";
import { exportUserData, downloadJson } from "../services/exportData";
import { isNativeHealthAvailable, requestHealthAuthorization, syncNativeHealthNow } from "../services/health";
import { loadProfile, saveProfile, type UserProfile } from "../services/profile";
import { getWatchReachability, readLastWatchSnapshot } from "../services/watch";
import { useAuth } from "../state/authContext";
import type { WatchUserSnapshot } from "../types";

export default function ProfileScreen({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { signOut } = useAuth();
  const { locale, t } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchSnapshot, setWatchSnapshot] = useState<WatchUserSnapshot | null>(null);
  const [watchReachable, setWatchReachable] = useState<{ paired: boolean; reachable: boolean } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    height: "",
    weight: "",
    goal: "",
    occupation: "",
  });

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMessage(null);
    setError(null);
    try {
      await fn();
      setMessage(`${label}完成`);
      onChanged();
      setWatchSnapshot(await readLastWatchSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    readLastWatchSnapshot().then(setWatchSnapshot);
    getWatchReachability().then(setWatchReachable);
    loadProfile(user.id)
      .then((data) => {
        setProfile(data);
        setProfileDraft({
          username: data?.username ?? "",
          height: data?.height != null ? String(data.height) : "",
          weight: data?.weight != null ? String(data.weight) : "",
          goal: data?.goal ?? "",
          occupation: data?.occupation ?? "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [user.id]);

  async function submitProfile() {
    await run("资料保存", async () => {
      const saved = await saveProfile({
        id: user.id,
        username: profileDraft.username.trim() || user.email || "NAVA 用户",
        height: profileDraft.height ? Number(profileDraft.height) : null,
        weight: profileDraft.weight ? Number(profileDraft.weight) : null,
        goal: profileDraft.goal.trim() || null,
        occupation: profileDraft.occupation.trim() || null,
      });
      setProfile(saved);
    });
  }

  async function exportData() {
    await run("数据导出", async () => {
      const data = await exportUserData(user.id);
      downloadJson(`nava-export-${user.id}.json`, data);
    });
  }

  return (
    <div className="stack">
      <SectionCard title={t("profile.account")} action={<StatusPill tone="good">{t("profile.sameAccount")}</StatusPill>}>
        <div className="profile-row">
          <div className="avatar large">{user.email?.slice(0, 1).toUpperCase() ?? "N"}</div>
          <div>
            <strong>{user.email}</strong>
            <p className="muted">{t("profile.webIphoneWatch")}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.personal")}>
        <label className="field">
          <span>{t("profile.nickname")}</span>
          <input value={profileDraft.username} onChange={(e) => setProfileDraft((draft) => ({ ...draft, username: e.target.value }))} placeholder={profile?.username ?? t("profile.defaultName")} />
        </label>
        <div className="two-col">
          <label className="field">
            <span>{t("profile.height")}</span>
            <input inputMode="decimal" value={profileDraft.height} onChange={(e) => setProfileDraft((draft) => ({ ...draft, height: e.target.value }))} />
          </label>
          <label className="field">
            <span>{t("profile.weight")}</span>
            <input inputMode="decimal" value={profileDraft.weight} onChange={(e) => setProfileDraft((draft) => ({ ...draft, weight: e.target.value }))} />
          </label>
        </div>
        <label className="field">
          <span>{t("profile.goal")}</span>
          <input value={profileDraft.goal} onChange={(e) => setProfileDraft((draft) => ({ ...draft, goal: e.target.value }))} placeholder={t("profile.goalPlaceholder")} />
        </label>
        <label className="field">
          <span>{t("profile.occupation")}</span>
          <input value={profileDraft.occupation} onChange={(e) => setProfileDraft((draft) => ({ ...draft, occupation: e.target.value }))} />
        </label>
        <ActionButton icon={<Save size={18} />} onClick={submitProfile} disabled={busy === "资料保存"}>
          {t("profile.save")}
        </ActionButton>
      </SectionCard>

      <SectionCard
        title={t("profile.appleHealth")}
        subtitle="HealthKit"
        action={<StatusPill tone={isNativeHealthAvailable() ? "good" : "warn"}>{isNativeHealthAvailable() ? t("profile.available") : t("profile.browserPreview")}</StatusPill>}
      >
        <div className="button-row">
          <ActionButton
            icon={<Apple size={18} />}
            variant="secondary"
            disabled={busy === "HealthKit 授权"}
            onClick={() => run("HealthKit 授权", requestHealthAuthorization)}
          >
            {t("profile.requestAuth")}
          </ActionButton>
          <ActionButton
            icon={<RefreshCw size={18} />}
            disabled={busy === "健康同步"}
            onClick={() => run("健康同步", () => syncNativeHealthNow(user.id))}
          >
            {t("profile.syncNow")}
          </ActionButton>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.appleWatch")} subtitle={t("profile.iphoneSync")}>
        <div className="watch-card">
          <Watch size={22} />
          <div>
            <strong>{watchReachable?.paired ? t("profile.watchPaired") : watchSnapshot ? t("profile.watchSnapshot") : t("profile.watchWaiting")}</strong>
            <p className="muted">
              {watchSnapshot
                  ? `${new Date(watchSnapshot.lastSyncedAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN")} · ${watchReachable?.reachable ? t("profile.online") : t("profile.offline")}`
                  : t("profile.waitingSnapshot")}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.privacy")}>
        <div className="timeline-list">
          <div>
            <ShieldCheck size={18} />
            <span>{t("profile.privacyKey")}</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>{t("profile.privacyMedia")}</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>{t("profile.privacyExport")}</span>
          </div>
        </div>
        <ActionButton icon={<Download size={18} />} variant="secondary" onClick={exportData} disabled={busy === "数据导出"}>
          {t("profile.export")}
        </ActionButton>
      </SectionCard>

      <SectionCard title={t("profile.environment")} subtitle={appConfig.appEnv}>
        <code className="code-card">{appConfig.supabaseUrl}</code>
        <code className="code-card">{appConfig.upstreamRepo}</code>
      </SectionCard>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>
        {t("profile.signOut")}
      </ActionButton>
    </div>
  );
}
