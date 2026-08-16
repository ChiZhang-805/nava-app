import type { User } from "@supabase/supabase-js";
import { Apple, Camera, Check, Download, Images, Link2, LogOut, RefreshCw, Save, ShieldCheck, Watch, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { exportUserData, downloadJson } from "../services/exportData";
import {
  getHealthAuthorizationStatus,
  getLastHealthSyncAt,
  readLastHealthSyncAt,
  requestHealthAuthorization,
  syncNativeHealthNow,
  type HealthAuthorizationStatus,
} from "../services/health";
import { loadProfile, saveProfile, saveProfileAvatar, type UserProfile } from "../services/profile";
import { flushPendingWatchActions, getWatchReachability, publishWatchSnapshot, readLastWatchSnapshot } from "../services/watch";
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
  const [healthAuthorization, setHealthAuthorization] = useState<HealthAuthorizationStatus | null>(null);
  const [healthLastSync, setHealthLastSync] = useState<string | null>(() => readLastHealthSyncAt(user.id));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    height: "",
    weight: "",
    goal: "",
    occupation: "",
  });

  async function run(action: string, successMessage: string | null, fn: () => Promise<unknown>) {
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      await fn();
      setMessage(successMessage);
      onChanged();
      setWatchSnapshot(await readLastWatchSnapshot(user.id));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    readLastWatchSnapshot(user.id).then(setWatchSnapshot);
    getWatchReachability().then(setWatchReachable);
    getHealthAuthorizationStatus().then(setHealthAuthorization);
    getLastHealthSyncAt(user.id).then(setHealthLastSync);
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

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  async function submitProfile() {
    setProfileSaved(false);
    const savedSuccessfully = await run("profile", null, async () => {
      const updates: Partial<UserProfile> & { id: string } = { id: user.id };
      if (profileDraft.username.trim()) updates.username = profileDraft.username.trim();
      if (profileDraft.height.trim()) updates.height = Number(profileDraft.height);
      if (profileDraft.weight.trim()) updates.weight = Number(profileDraft.weight);
      if (profileDraft.goal.trim()) updates.goal = profileDraft.goal.trim();
      if (profileDraft.occupation.trim()) updates.occupation = profileDraft.occupation.trim();

      const saved = Object.keys(updates).length > 1 ? await saveProfile(updates) : profile;
      if (!saved) return;
      setProfile(saved);
      setProfileDraft({
        username: saved.username ?? "",
        height: saved.height != null ? String(saved.height) : "",
        weight: saved.weight != null ? String(saved.weight) : "",
        goal: saved.goal ?? "",
        occupation: saved.occupation ?? "",
      });
    });
    setProfileSaved(savedSuccessfully);
  }

  async function exportData() {
    await run("export", t("profile.exportSuccess"), async () => {
      const data = await exportUserData(user.id);
      downloadJson(`nava-export-${user.id}.json`, data);
    });
  }

  async function handleAvatarFile(file: File | null) {
    setAvatarSheetOpen(false);
    if (!file) return;
    await run("avatar", null, async () => {
      const avatarUrl = await saveProfileAvatar(user.id, file);
      setProfile((current) => current ? { ...current, avatar_url: avatarUrl } : {
        id: user.id,
        username: profileDraft.username || null,
        height: profileDraft.height ? Number(profileDraft.height) : null,
        weight: profileDraft.weight ? Number(profileDraft.weight) : null,
        occupation: profileDraft.occupation || null,
        goal: profileDraft.goal || null,
        mbti: null,
        exercise_frequency: null,
        sleep_schedule: null,
        diet_preference: null,
        stress_factors: null,
        avatar_url: avatarUrl,
      });
    });
  }

  async function authorizeHealth() {
    await run("health-auth", null, async () => {
      await requestHealthAuthorization();
      setHealthAuthorization(await getHealthAuthorizationStatus());
    });
  }

  async function syncHealth() {
    await run("health-sync", null, async () => {
      const result = await syncNativeHealthNow(user.id);
      if (!("skipped" in result) || !result.skipped) setHealthLastSync(result.lastSyncDate);
      setHealthAuthorization(await getHealthAuthorizationStatus());
    });
  }

  async function connectWatch() {
    await run("watch-connect", null, async () => {
      setWatchReachable(await getWatchReachability());
    });
  }

  async function syncWatch() {
    await run("watch-sync", null, async () => {
      await flushPendingWatchActions(user.id);
      const now = new Date().toISOString();
      const nextSnapshot: WatchUserSnapshot = watchSnapshot
        ? { ...watchSnapshot, lastSyncedAt: now }
        : { userId: user.id, displayName, today: {}, lastSyncedAt: now };
      setWatchSnapshot(await publishWatchSnapshot(nextSnapshot));
      setWatchReachable(await getWatchReachability());
    });
  }

  function updateDraft(key: keyof typeof profileDraft, value: string) {
    setProfileSaved(false);
    setProfileDraft((draft) => ({ ...draft, [key]: value }));
  }

  const displayName = profile?.username?.trim() || t("profile.defaultName");
  const memberDays = String(daysSinceSignup(user.created_at)).padStart(3, "0");
  const connectionMeta = (lastSyncAt: string | null | undefined, online: boolean) => {
    const timestamp = lastSyncAt
      ? new Date(lastSyncAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("profile.waitingSync");
    return `${timestamp} · ${t(online ? "profile.online" : "profile.offline")}`;
  };
  const healthConnected = Boolean(healthLastSync);
  const healthOnline = Boolean(healthAuthorization?.available && healthAuthorization.requested);
  const healthStatus = !healthAuthorization?.available
    ? t("profile.healthUnavailable")
    : healthConnected
      ? t("profile.healthConnected")
      : healthAuthorization.requested
        ? t("profile.healthAuthorizationRequested")
        : t("profile.healthNeedsAuthorization");

  return (
    <div className="stack profile-stack">
      <SectionCard className="profile-account-card" title={t("profile.account")}>
        <div className="profile-row">
          <button
            className="avatar large avatar-button"
            type="button"
            aria-label={t("profile.changeAvatar")}
            title={t("profile.changeAvatar")}
            onClick={() => setAvatarSheetOpen(true)}
            disabled={busy === "avatar"}
          >
            {profile?.avatar_url && !avatarLoadFailed
              ? <img alt="" src={profile.avatar_url} onError={() => setAvatarLoadFailed(true)} />
              : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </button>
          <div>
            <strong>{displayName}</strong>
            <p className="muted">{t("profile.daysHere", { days: memberDays })}</p>
          </div>
        </div>
        <input
          ref={galleryInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => {
            void handleAvatarFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="user"
          onChange={(event) => {
            void handleAvatarFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </SectionCard>

      <SectionCard
        className="profile-personal-card"
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
            {profileSaved ? <Check size={22} /> : <Save size={21} />}
          </button>
        )}
      >
        <div className="profile-form">
          <label className="field">
            <span>{t("profile.nickname")}</span>
            <input value={profileDraft.username} onChange={(e) => updateDraft("username", e.target.value)} placeholder={profile?.username ?? t("profile.defaultName")} />
          </label>
          <div className="two-col">
            <label className="field">
              <span>{t("profile.height")}</span>
              <div className="profile-measure-input">
                <input inputMode="decimal" value={profileDraft.height} onChange={(e) => updateDraft("height", e.target.value)} />
                <span className="profile-input-unit">cm</span>
              </div>
            </label>
            <label className="field">
              <span>{t("profile.weight")}</span>
              <div className="profile-measure-input">
                <input inputMode="decimal" value={profileDraft.weight} onChange={(e) => updateDraft("weight", e.target.value)} />
                <span className="profile-input-unit">kg</span>
              </div>
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

      <div className="profile-device-stack">
        <SectionCard
          className="profile-device-card"
          title={t("profile.appleHealth")}
          action={(
            <div className="section-icon-actions">
              <button className="section-icon-action" type="button" aria-label={t("profile.requestAuth")} title={t("profile.requestAuth")} onClick={authorizeHealth} disabled={busy === "health-auth"}>
                <ShieldCheck size={21} />
              </button>
              <button className="section-icon-action" type="button" aria-label={t("profile.syncNow")} title={t("profile.syncNow")} onClick={syncHealth} disabled={busy === "health-sync"}>
                <RefreshCw className={busy === "health-sync" ? "spin" : undefined} size={21} />
              </button>
            </div>
          )}
        >
          <div className="device-connection-row">
            <span className="device-connection-icon" aria-hidden="true"><Apple size={30} /></span>
            <div>
              <strong>{healthStatus}</strong>
              <p className="muted">{connectionMeta(healthLastSync, healthOnline)}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          className="profile-device-card"
          title={t("profile.appleWatch")}
          action={(
            <div className="section-icon-actions">
              <button className="section-icon-action" type="button" aria-label={t("profile.watchConnect")} title={t("profile.watchConnect")} onClick={connectWatch} disabled={busy === "watch-connect"}>
                <Link2 size={21} />
              </button>
              <button className="section-icon-action" type="button" aria-label={t("profile.watchSync")} title={t("profile.watchSync")} onClick={syncWatch} disabled={busy === "watch-sync"}>
                <RefreshCw className={busy === "watch-sync" ? "spin" : undefined} size={21} />
              </button>
            </div>
          )}
        >
          <div className="device-connection-row">
            <span className="device-connection-icon" aria-hidden="true"><Watch size={30} /></span>
            <div>
              <strong>{watchReachable?.paired ? t("profile.watchPaired") : watchSnapshot ? t("profile.watchSnapshot") : t("profile.watchWaiting")}</strong>
              <p className="muted">{connectionMeta(watchSnapshot?.lastSyncedAt, Boolean(watchReachable?.reachable))}</p>
            </div>
          </div>
        </SectionCard>
      </div>

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

      {avatarSheetOpen && (
        <div className="avatar-sheet-overlay" role="presentation" onClick={() => setAvatarSheetOpen(false)}>
          <section className="avatar-sheet" role="dialog" aria-modal="true" aria-label={t("profile.changeAvatar")} onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <h2>{t("profile.changeAvatar")}</h2>
              </div>
              <button className="section-icon-action" type="button" aria-label={t("common.close")} title={t("common.close")} onClick={() => setAvatarSheetOpen(false)}>
                <X size={21} />
              </button>
            </div>
            <div className="avatar-sheet-actions">
              <button type="button" onClick={() => galleryInputRef.current?.click()}>
                <Images size={22} />
                <span>{t("profile.choosePhoto")}</span>
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()}>
                <Camera size={22} />
                <span>{t("profile.takePhoto")}</span>
              </button>
            </div>
          </section>
        </div>
      )}

      <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>
        {t("profile.signOut")}
      </ActionButton>
    </div>
  );
}
