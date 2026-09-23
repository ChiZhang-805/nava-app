import type { User } from "@supabase/supabase-js";
import { Apple, BookOpen, Check, ChevronDown, Download, Link2, LogOut, RefreshCw, Save, ShieldCheck, Trash2, Watch, X } from "lucide-react";
import AvatarPicker from "../components/AvatarPicker";
import { useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import PageSkeleton, { SkeletonLines } from "../components/PageSkeleton";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { downloadUserArchive, exportUserData } from "../services/exportData";
import {
  getHealthAuthorizationStatus,
  getLastHealthSyncAt,
  isNativeHealthAvailable,
  readLastHealthSyncAt,
  requestHealthAuthorization,
  syncNativeHealthNow,
  type HealthAuthorizationStatus,
} from "../services/health";
import { loadProfile, saveProfile, saveProfileAvatar, type UserProfile } from "../services/profile";
import { flushPendingWatchActions, getWatchReachability, publishWatchSnapshot, readLastWatchSnapshot } from "../services/watch";
import { useAuth } from "../state/authContext";
import type { WatchUserSnapshot } from "../types";
import { deleteCurrentAccount } from "../services/account";

const occupationOptions = [
  { value: "student", zh: "学生", en: "Student" },
  { value: "employee", zh: "职场人士", en: "Employee" },
  { value: "freelance", zh: "自由职业", en: "Freelance" },
  { value: "caregiver", zh: "居家照护", en: "Home carer" },
  { value: "retired", zh: "退休人士", en: "Retired" },
  { value: "other", zh: "其他", en: "Other" },
] as const;

function daysSinceSignup(createdAt?: string) {
  const created = Date.parse(createdAt ?? "");
  if (!Number.isFinite(created)) return 1;
  return Math.max(1, Math.floor((Date.now() - created) / 86_400_000) + 1);
}

export default function ProfileScreen({ user, refreshKey, onChanged, onOpenOnboarding }: { user: User; refreshKey?: number; onChanged: () => void; onOpenOnboarding?: () => void }) {
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
  const [profileLoading, setProfileLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileDetailsExpanded, setProfileDetailsExpanded] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const deviceStackRef = useRef<HTMLDivElement | null>(null);
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
    let active = true;
    setDevicesLoading(true);
    void Promise.allSettled([
      readLastWatchSnapshot(user.id),
      getWatchReachability(),
      getHealthAuthorizationStatus(),
      getLastHealthSyncAt(user.id),
    ]).then(([watch, reachability, authorization, lastSync]) => {
      if (!active) return;
      if (watch.status === "fulfilled") setWatchSnapshot(watch.value);
      if (reachability.status === "fulfilled") setWatchReachable(reachability.value);
      if (authorization.status === "fulfilled") setHealthAuthorization(authorization.value);
      if (lastSync.status === "fulfilled") setHealthLastSync(lastSync.value);
    }).finally(() => { if (active) setDevicesLoading(false); });
    return () => {
      active = false;
    };
  }, [refreshKey, user.id]);

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    loadProfile(user.id)
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setProfileDraft({
          username: data?.username ?? "",
          height: data?.height != null ? String(data.height) : "",
          weight: data?.weight != null ? String(data.weight) : "",
          goal: data?.goal ?? "",
          occupation: data?.occupation ?? "",
        });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  async function submitProfile() {
    setProfileSaved(false);
    const savedSuccessfully = await run("profile", null, async () => {
      const updates: Partial<UserProfile> & { id: string } = { id: user.id };
      if (profileDraft.username.trim()) updates.username = profileDraft.username.trim();
      if (profileDraft.height.trim()) updates.height = Number(profileDraft.height);
      if (profileDraft.weight.trim()) updates.weight = Number(profileDraft.weight);
      // Empty optional fields are intentional edits too; persist them as null so
      // users can remove a previously saved goal or occupation.
      updates.goal = profileDraft.goal.trim() || null;
      updates.occupation = profileDraft.occupation.trim() || null;

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
      await downloadUserArchive(`nava-export-${user.id}`, data);
    });
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    setBusy("delete-account");
    setError(null);
    try {
      await deleteCurrentAccount(user.id);
      await signOut();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      setBusy(null);
    }
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
    let uploaded = 0;
    const completed = await run("health-auth", null, async () => {
      const authorization = await requestHealthAuthorization();
      if (!authorization.granted) throw new Error("reason" in authorization ? authorization.reason : (locale === "zh" ? "Apple 健康授权未完成。" : "Apple Health authorization was not completed."));
      setHealthAuthorization(await getHealthAuthorizationStatus());
      const syncResult = await syncNativeHealthNow(user.id);
      if (!("skipped" in syncResult && syncResult.skipped) && syncResult.uploaded > 0) {
        uploaded = syncResult.uploaded;
        setHealthLastSync(syncResult.lastSyncDate);
      }
    });
    if (completed) setMessage(uploaded > 0
      ? t("profile.syncSuccess")
      : (locale === "zh" ? "授权已更新；当前没有可同步的健康记录。" : "Authorization updated; no health records are currently available."));
  }

  async function syncHealth() {
    await run("health-sync", null, async () => {
      const result = await syncNativeHealthNow(user.id);
      if ("skipped" in result && result.skipped) {
        const consentDisabled = "reason" in result && result.reason === "health_sync_consent_disabled";
        throw new Error(consentDisabled
          ? (locale === "zh" ? "健康数据同步已在隐私设置中关闭。" : "Health data sync is disabled in Privacy settings.")
          : (locale === "zh" ? "网页不能直接访问 HealthKit，请在 iPhone App 中授权后同步。" : "Web pages cannot access HealthKit. Authorize and sync in the iPhone app."));
      }
      if (result.uploaded === 0) throw new Error(locale === "zh"
        ? "本次没有读取到已授权的 Apple 健康记录，既有真实数据未被零值覆盖。请检查健康权限和手表同步状态。"
        : "No authorized Apple Health records were available. Existing data was not overwritten with zeros; check Health permissions and Watch sync.");
      setHealthLastSync(result.lastSyncDate);
      setHealthAuthorization(await getHealthAuthorizationStatus());
    });
  }

  async function connectWatch() {
    await run("watch-connect", null, async () => {
      if (!isNativeHealthAvailable()) throw new Error(locale === "zh" ? "Apple Watch 连接仅能在 iPhone App 中完成。" : "Apple Watch can only connect through the iPhone app.");
      const reachability = await getWatchReachability();
      setWatchReachable(reachability);
      if (!reachability.paired) throw new Error(locale === "zh" ? "尚未检测到已配对的 Apple Watch，请先在系统 Watch App 中配对。" : "No paired Apple Watch was found. Pair it in the system Watch app first.");
    });
  }

  async function syncWatch() {
    await run("watch-sync", null, async () => {
      const reachability = await getWatchReachability();
      if (!reachability.paired) throw new Error(locale === "zh" ? "没有已配对的 Apple Watch，无法同步。" : "No paired Apple Watch is available to sync.");
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
  const connectionTimestamp = (lastSyncAt: string | null | undefined) => lastSyncAt
      ? new Date(lastSyncAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("profile.waitingSync");
  const connectionMeta = (lastSyncAt: string | null | undefined, online: boolean) =>
    `${connectionTimestamp(lastSyncAt)} · ${t(online ? "profile.online" : "profile.offline")}`;
  const healthConnected = Boolean(healthLastSync);
  const healthLastSyncTime = Date.parse(healthLastSync ?? "");
  const healthSyncIsRecent = Number.isFinite(healthLastSyncTime) && Date.now() - healthLastSyncTime < 24 * 60 * 60 * 1000;
  const healthStatus = healthConnected
    ? healthAuthorization?.available
      ? t("profile.healthConnected")
      : t("profile.healthCloudSynced")
    : !healthAuthorization?.available
      ? t("profile.healthUnavailable")
      : healthAuthorization.requested
        ? t("profile.healthAuthorizationRequested")
        : t("profile.healthNeedsAuthorization");

  if (profileLoading) return <PageSkeleton variant="profile" />;

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

      {onOpenOnboarding && (
        <SectionCard
          className="profile-first-notes-card"
          title={locale === "zh" ? "初见手记" : "First notes"}
          action={(
            <button
              className="section-icon-action"
              type="button"
              aria-label={locale === "zh" ? "查看初见手记" : "Open first notes"}
              title={locale === "zh" ? "查看初见手记" : "Open first notes"}
              onClick={onOpenOnboarding}
            >
              <BookOpen size={20} />
            </button>
          )}
        >
          <button className="profile-first-notes-button" type="button" onClick={onOpenOnboarding}>
            <span aria-hidden="true"><BookOpen size={22} /></span>
            <strong>{locale === "zh" ? "回看 / 修改七项初见资料" : "Review / edit the seven first notes"}</strong>
          </button>
        </SectionCard>
      )}

      <SectionCard
        className={["profile-personal-card", profileDetailsExpanded ? "is-expanded" : ""].filter(Boolean).join(" ")}
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
          <label className="field profile-extended-field">
            <span>{t("profile.goal")}</span>
            <input value={profileDraft.goal} onChange={(e) => updateDraft("goal", e.target.value)} placeholder={t("profile.goalPlaceholder")} />
          </label>
          <label className="field profile-extended-field">
            <span>{t("profile.occupation")}</span>
            <select value={profileDraft.occupation} onChange={(e) => updateDraft("occupation", e.target.value)}>
              <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
              {!occupationOptions.some((option) => option.value === profileDraft.occupation) && profileDraft.occupation && (
                <option value={profileDraft.occupation}>{profileDraft.occupation}</option>
              )}
              {occupationOptions.map((option) => <option key={option.value} value={option.value}>{locale === "zh" ? option.zh : option.en}</option>)}
            </select>
          </label>
        </div>
        <button
          className="profile-details-toggle"
          type="button"
          aria-expanded={profileDetailsExpanded}
          onClick={() => setProfileDetailsExpanded((expanded) => !expanded)}
        >
          <span>{profileDetailsExpanded ? (locale === "zh" ? "收起资料" : "Show less") : (locale === "zh" ? "更多资料" : "More profile fields")}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        <button
          className="profile-next-section-button"
          type="button"
          onClick={() => deviceStackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span>{locale === "zh" ? "设备与隐私" : "Devices & privacy"}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </SectionCard>

      <div className="profile-device-stack" ref={deviceStackRef}>
        <SectionCard
          className="profile-device-card"
          title={t("profile.appleHealth")}
          action={(
            <div className="section-icon-actions">
              <button className="section-icon-action" type="button" aria-label={t("profile.requestAuth")} title={t("profile.requestAuth")} onClick={authorizeHealth} disabled={devicesLoading || busy === "health-auth"}>
                <ShieldCheck size={21} />
              </button>
              <button className="section-icon-action" type="button" aria-label={t("profile.syncNow")} title={t("profile.syncNow")} onClick={syncHealth} disabled={devicesLoading || busy === "health-sync"}>
                <RefreshCw className={busy === "health-sync" ? "spin" : undefined} size={21} />
              </button>
            </div>
          )}
        >
          <div className="device-connection-row">
            <span className="device-connection-icon" aria-hidden="true"><Apple size={30} /></span>
            {devicesLoading ? <SkeletonLines count={2} compact /> : <div>
              <strong>{healthStatus}</strong>
              <p className="muted">{healthLastSync
                ? `${connectionTimestamp(healthLastSync)} · ${t(healthSyncIsRecent ? "profile.syncRecent" : "profile.syncStale")}`
                : t("profile.waitingSync")}</p>
            </div>}
          </div>
        </SectionCard>

        <SectionCard
          className="profile-device-card"
          title={t("profile.appleWatch")}
          action={(
            <div className="section-icon-actions">
              <button className="section-icon-action" type="button" aria-label={t("profile.watchConnect")} title={t("profile.watchConnect")} onClick={connectWatch} disabled={devicesLoading || busy === "watch-connect"}>
                <Link2 size={21} />
              </button>
              <button className="section-icon-action" type="button" aria-label={t("profile.watchSync")} title={t("profile.watchSync")} onClick={syncWatch} disabled={devicesLoading || busy === "watch-sync"}>
                <RefreshCw className={busy === "watch-sync" ? "spin" : undefined} size={21} />
              </button>
            </div>
          )}
        >
          <div className="device-connection-row">
            <span className="device-connection-icon" aria-hidden="true"><Watch size={30} /></span>
            {devicesLoading ? <SkeletonLines count={2} compact /> : <div>
              <strong>{watchReachable?.paired ? t("profile.watchPaired") : watchSnapshot ? t("profile.watchSnapshot") : t("profile.watchWaiting")}</strong>
              <p className="muted">{connectionMeta(watchSnapshot?.lastSyncedAt, Boolean(watchReachable?.reachable))}</p>
            </div>}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        className="profile-privacy-card"
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

      {avatarSheetOpen && <AvatarPicker onClose={() => setAvatarSheetOpen(false)} onCamera={() => cameraInputRef.current?.click()} onLibrary={() => galleryInputRef.current?.click()} />}

      <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>
        {t("profile.signOut")}
      </ActionButton>
      <ActionButton icon={<Trash2 size={18} />} variant="ghost" onClick={() => setDeleteDialogOpen(true)}>
        {locale === "zh" ? "删除账号与全部数据" : "Delete account and all data"}
      </ActionButton>

      {deleteDialogOpen && <div className="avatar-sheet-overlay" role="presentation" onClick={() => setDeleteDialogOpen(false)}><section className="avatar-sheet account-delete-sheet" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "删除账号" : "Delete account"} onClick={(event) => event.stopPropagation()}><header><strong>{locale === "zh" ? "永久删除账号" : "Permanently delete account"}</strong><button type="button" onClick={() => setDeleteDialogOpen(false)} aria-label={t("common.close")}><X size={20} /></button></header><p>{locale === "zh" ? "这会删除账号、健康记录、AI 对话、周报和私密照片，无法恢复。请输入 DELETE 确认。" : "This removes the account, health records, AI chats, reports, and private photos. Type DELETE to confirm."}</p><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" autoCapitalize="characters" /><button type="button" disabled={deleteConfirmation !== "DELETE" || busy === "delete-account"} onClick={() => void deleteAccount()}>{busy === "delete-account" ? (locale === "zh" ? "正在删除…" : "Deleting…") : (locale === "zh" ? "永久删除" : "Delete permanently")}</button></section></div>}
    </div>
  );
}
