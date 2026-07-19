import type { User } from "@supabase/supabase-js";
import { Apple, Download, LogOut, RefreshCw, Save, ShieldCheck, Watch } from "lucide-react";
import { useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { useLocale } from "../i18n";
import { exportUserData, downloadJson } from "../services/exportData";
import { isNativeHealthAvailable, requestHealthAuthorization, syncNativeHealthNow } from "../services/health";
import { loadProfile, saveProfile, type UserProfile } from "../services/profile";
import { getWatchReachability, readLastWatchSnapshot } from "../services/watch";
import { useAuth } from "../state/authContext";
import type { WatchUserSnapshot } from "../types";

function daysSinceSignup(createdAt?: string) {
  const created = Date.parse(createdAt ?? "");
  if (!Number.isFinite(created)) return 1;
  return Math.max(1, Math.floor((Date.now() - created) / 86_400_000) + 1);
}

export default function ProfileScreen({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { signOut } = useAuth();
  const { locale, t } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchSnapshot, setWatchSnapshot] = useState<WatchUserSnapshot | null>(null);
  const [watchReachable, setWatchReachable] = useState<{ paired: boolean; reachable: boolean } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    height: "",
    weight: "",
    goal: "",
    occupation: "",
  });

  async function run(action: string, successMessage: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      await fn();
      setMessage(successMessage);
      onChanged();
      setWatchSnapshot(await readLastWatchSnapshot());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
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
    setProfileSaved(false);
    const savedSuccessfully = await run("profile", t("profile.saveSuccess"), async () => {
      const saved = await saveProfile({
        id: user.id,
        username: profileDraft.username.trim() || t("profile.defaultName"),
        height: profileDraft.height ? Number(profileDraft.height) : null,
        weight: profileDraft.weight ? Number(profileDraft.weight) : null,
        goal: profileDraft.goal.trim() || null,
        occupation: profileDraft.occupation.trim() || null,
      });
      setProfile(saved);
    });
    setProfileSaved(savedSuccessfully);
  }

  async function exportData() {
    await run("export", t("profile.exportSuccess"), async () => {
      const data = await exportUserData(user.id);
      downloadJson(`nava-export-${user.id}.json`, data);
    });
  }

  function updateDraft(key: keyof typeof profileDraft, value: string) {
    setProfileSaved(false);
    setProfileDraft((draft) => ({ ...draft, [key]: value }));
  }

  const displayName = profileDraft.username.trim() || profile?.username?.trim() || t("profile.defaultName");
  const memberDays = String(daysSinceSignup(user.created_at)).padStart(3, "0");

  return (
    <div className="stack">
      <SectionCard title={t("profile.account")}>
        <div className="profile-row">
          <div className="avatar large">{displayName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{displayName}</strong>
            <p className="muted">{t("profile.daysHere", { days: memberDays })}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("profile.personal")}
        action={(
          <button
            className={["section-icon-action", profileSaved ? "success" : ""].filter(Boolean).join(" ")}
            type="button"
            aria-label={t("profile.save")}
            title={t("profile.save")}
            onClick={submitProfile}
            disabled={busy === "profile"}
          >
            <Save size={21} />
          </button>
        )}
      >
        <div className={["profile-form", profileSaved ? "saved" : ""].filter(Boolean).join(" ")}>
          <label className="field">
            <span>{t("profile.nickname")}</span>
            <input value={profileDraft.username} onChange={(e) => updateDraft("username", e.target.value)} placeholder={profile?.username ?? t("profile.defaultName")} />
          </label>
          <div className="two-col">
            <label className="field">
              <span>{t("profile.height")}</span>
              <input inputMode="decimal" value={profileDraft.height} onChange={(e) => updateDraft("height", e.target.value)} />
            </label>
            <label className="field">
              <span>{t("profile.weight")}</span>
              <input inputMode="decimal" value={profileDraft.weight} onChange={(e) => updateDraft("weight", e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>{t("profile.goal")}</span>
            <input value={profileDraft.goal} onChange={(e) => updateDraft("goal", e.target.value)} placeholder={t("profile.goalPlaceholder")} />
          </label>
          <label className="field">
            <span>{t("profile.occupation")}</span>
            <input value={profileDraft.occupation} onChange={(e) => updateDraft("occupation", e.target.value)} />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title={t("profile.appleHealth")}
        action={<StatusPill tone={isNativeHealthAvailable() ? "good" : "warn"}>{isNativeHealthAvailable() ? t("profile.available") : t("profile.browserPreview")}</StatusPill>}
      >
        <div className="button-row">
          <ActionButton
            icon={<Apple size={18} />}
            variant="secondary"
            disabled={busy === "health-auth"}
            onClick={() => run("health-auth", t("profile.authorizationSuccess"), requestHealthAuthorization)}
          >
            {t("profile.requestAuth")}
          </ActionButton>
          <ActionButton
            icon={<RefreshCw size={18} />}
            disabled={busy === "health-sync"}
            onClick={() => run("health-sync", t("profile.syncSuccess"), () => syncNativeHealthNow(user.id))}
          >
            {t("profile.syncNow")}
          </ActionButton>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.appleWatch")}>
        <div className="watch-card">
          <span className="watch-device-icon" aria-hidden="true"><Watch size={30} /></span>
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

      <SectionCard
        title={t("profile.privacy")}
        action={(
          <button
            className="section-icon-action"
            type="button"
            aria-label={t("profile.export")}
            title={t("profile.export")}
            onClick={exportData}
            disabled={busy === "export"}
          >
            <Download size={21} />
          </button>
        )}
      >
        <div className="timeline-list privacy-list">
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
      </SectionCard>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>
        {t("profile.signOut")}
      </ActionButton>
    </div>
  );
}
