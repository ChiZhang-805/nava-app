import type { User } from "@supabase/supabase-js";
import { Apple, CalendarDays, Check, ChevronLeft, ChevronRight, Download, LayoutGrid, Link2, LogOut, RefreshCw, Save, ShieldCheck, Trash2, UserRound, Watch, X } from "lucide-react";
import AvatarPicker from "../components/AvatarPicker";
import AppSkinPicker from "../components/AppSkinPicker";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { APP_SKINS, type AppSkin } from "../services/appSkin";
import { buildYearHeatmap } from "../services/homeExperience";
import { getRecordCoverageRange, type RecordCoverage } from "../services/records";

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

type ProfileView = "account" | "personal" | "skin" | "health" | "watch" | "privacy";

const profileViews = new Set<ProfileView>(["account", "personal", "skin", "health", "watch", "privacy"]);

function ProfileQuarterCard({ userId, deviceDate }: { userId: string; deviceDate: string }) {
  const { locale } = useLocale();
  const currentYear = Number(deviceDate.slice(0, 4));
  const currentQuarter = Math.floor((Number(deviceDate.slice(5, 7)) - 1) / 3) + 1;
  const [displayYear, setDisplayYear] = useState(currentYear);
  const [displayQuarter, setDisplayQuarter] = useState(currentQuarter);
  const [coverage, setCoverage] = useState<RecordCoverage>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heatmap = useMemo(() => buildYearHeatmap(displayYear), [displayYear]);
  const quarterStartMonth = (displayQuarter - 1) * 3 + 1;
  const months = useMemo(() => [quarterStartMonth, quarterStartMonth + 1, quarterStartMonth + 2], [quarterStartMonth]);
  const weeks = useMemo(() => heatmap.weeks.filter((week) => week.some((cell) => {
    if (!cell.inYear) return false;
    const month = Number(cell.date.slice(5, 7));
    return month >= quarterStartMonth && month <= quarterStartMonth + 2;
  })), [heatmap.weeks, quarterStartMonth]);
  const monthColumns = useMemo(() => {
    const starts = months.map((month) => Math.max(0, weeks.findIndex((week) => week.some((cell) => cell.inYear && Number(cell.date.slice(5, 7)) === month))));
    return months.map((month, index) => ({
      month,
      start: starts[index],
      span: Math.max(1, (starts[index + 1] ?? weeks.length) - starts[index]),
    }));
  }, [months, weeks]);
  const weekdays = locale === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"];

  useEffect(() => {
    let active = true;
    const start = `${displayYear}-${String(quarterStartMonth).padStart(2, "0")}-01`;
    const endMonth = quarterStartMonth + 2;
    const end = `${displayYear}-${String(endMonth).padStart(2, "0")}-${String(new Date(displayYear, endMonth, 0).getDate()).padStart(2, "0")}`;
    setLoading(true);
    setError(null);
    getRecordCoverageRange(userId, start, end)
      .then((result) => { if (active) setCoverage(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [displayQuarter, displayYear, quarterStartMonth, userId]);

  const shiftQuarter = (offset: number) => {
    const absolute = displayYear * 4 + displayQuarter - 1 + offset;
    setDisplayYear(Math.floor(absolute / 4));
    setDisplayQuarter(absolute % 4 + 1);
  };
  const atCurrentQuarter = displayYear > currentYear || (displayYear === currentYear && displayQuarter >= currentQuarter);
  const recordedDays = Object.values(coverage).filter((domains) => domains.length > 0).length;

  return (
    <section className="section-card profile-quarter-card" aria-label={locale === "zh" ? `${displayYear} 年第 ${displayQuarter} 季度足迹` : `${displayYear} Q${displayQuarter} activity`} data-profile-quarter={`${displayYear}-Q${displayQuarter}`}>
      <header className="profile-quarter-header">
        <h2><CalendarDays size={19} aria-hidden="true" />{locale === "zh" ? "记录足迹" : "Activity history"}</h2>
        <nav aria-label={locale === "zh" ? "切换季度" : "Change quarter"}>
          <button type="button" onClick={() => shiftQuarter(-1)} aria-label={locale === "zh" ? "上一季度" : "Previous quarter"}><ChevronLeft size={19} /></button>
          <b>{displayYear} Q{displayQuarter}</b>
          <button type="button" disabled={atCurrentQuarter} onClick={() => shiftQuarter(1)} aria-label={locale === "zh" ? "下一季度" : "Next quarter"}><ChevronRight size={19} /></button>
        </nav>
      </header>
      {error
        ? <p className="profile-quarter-error" role="alert">{error}</p>
        : <div className={loading ? "profile-quarter-heatmap is-loading" : "profile-quarter-heatmap"} style={{ "--profile-quarter-week-count": weeks.length } as CSSProperties}>
            <div className="profile-quarter-months" aria-hidden="true">
              {monthColumns.map(({ month, start, span }) => <span key={month} style={{ gridColumn: `${start + 1} / span ${span}` }}>{locale === "zh" ? `${month}月` : new Date(2024, month - 1, 1).toLocaleDateString("en-US", { month: "short" })}</span>)}
            </div>
            <div className="profile-quarter-weekdays" aria-hidden="true">{weekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}</div>
            <div className="profile-quarter-weeks" role="img" aria-label={locale === "zh" ? `${displayYear} 年第 ${displayQuarter} 季度共 ${recordedDays} 天有记录` : `${recordedDays} recorded days in ${displayYear} Q${displayQuarter}`}>
              {weeks.map((week, weekIndex) => <div className="profile-quarter-week" key={weekIndex}>
                {week.map((cell) => {
                  const month = Number(cell.date.slice(5, 7));
                  const inQuarter = cell.inYear && month >= quarterStartMonth && month <= quarterStartMonth + 2;
                  const count = inQuarter ? (coverage[cell.date]?.length ?? 0) : 0;
                  const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
                  return <span className={inQuarter ? "profile-quarter-day" : "profile-quarter-day is-outside"} data-level={level} title={inQuarter ? `${cell.date} · ${count}${locale === "zh" ? " 项记录" : " records"}` : undefined} aria-hidden="true" key={cell.date} />;
                })}
              </div>)}
            </div>
          </div>}
    </section>
  );
}

export default function ProfileScreen({ user, refreshKey, onChanged, onOpenOnboarding, skin, onSkinChange, deviceDate, view, onViewChange }: { user: User; refreshKey?: number; onChanged: () => void; onOpenOnboarding?: () => void; skin: AppSkin; onSkinChange: (skin: AppSkin) => void; deviceDate: string; view?: string | null; onViewChange: (view: ProfileView | null) => void }) {
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
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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

  const activeView = view && profileViews.has(view as ProfileView) ? view as ProfileView : null;

  if (activeView === "skin") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="skin">
      <SectionCard className="profile-skin-card profile-subpage-card" title={locale === "zh" ? "界面皮肤" : "Interface skin"}>
        <AppSkinPicker value={skin} onChange={onSkinChange} compact />
      </SectionCard>
    </div>
  );

  if (activeView === "personal") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="personal">
      <SectionCard className="profile-personal-card profile-subpage-card" title={t("profile.personal")}>
        <div className="profile-form">
          <label className="field">
            <span>{t("profile.nickname")}</span>
            <input value={profileDraft.username} onChange={(event) => updateDraft("username", event.target.value)} placeholder={profile?.username ?? t("profile.defaultName")} />
          </label>
          <div className="two-col">
            <label className="field">
              <span>{t("profile.height")}</span>
              <div className="profile-measure-input"><input inputMode="decimal" value={profileDraft.height} onChange={(event) => updateDraft("height", event.target.value)} /><span className="profile-input-unit">cm</span></div>
            </label>
            <label className="field">
              <span>{t("profile.weight")}</span>
              <div className="profile-measure-input"><input inputMode="decimal" value={profileDraft.weight} onChange={(event) => updateDraft("weight", event.target.value)} /><span className="profile-input-unit">kg</span></div>
            </label>
          </div>
          <label className="field"><span>{t("profile.goal")}</span><input value={profileDraft.goal} onChange={(event) => updateDraft("goal", event.target.value)} placeholder={t("profile.goalPlaceholder")} /></label>
          <label className="field">
            <span>{t("profile.occupation")}</span>
            <select value={profileDraft.occupation} onChange={(event) => updateDraft("occupation", event.target.value)}>
              <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
              {!occupationOptions.some((option) => option.value === profileDraft.occupation) && profileDraft.occupation && <option value={profileDraft.occupation}>{profileDraft.occupation}</option>}
              {occupationOptions.map((option) => <option key={option.value} value={option.value}>{locale === "zh" ? option.zh : option.en}</option>)}
            </select>
          </label>
        </div>
        <ActionButton icon={profileSaved ? <Check size={18} /> : <Save size={18} />} onClick={submitProfile} disabled={busy === "profile"}>{profileSaved ? (locale === "zh" ? "已保存" : "Saved") : t("profile.save")}</ActionButton>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (activeView === "health") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="health">
      <SectionCard className="profile-device-card profile-subpage-card" title={t("profile.appleHealth")}>
        <div className="device-connection-row">
          <span className="device-connection-icon" aria-hidden="true"><Apple size={30} /></span>
          {devicesLoading ? <SkeletonLines count={2} compact /> : <div><strong>{healthStatus}</strong><p className="muted">{healthLastSync ? `${connectionTimestamp(healthLastSync)} · ${t(healthSyncIsRecent ? "profile.syncRecent" : "profile.syncStale")}` : t("profile.waitingSync")}</p></div>}
        </div>
        <div className="profile-subpage-actions">
          <ActionButton icon={<ShieldCheck size={18} />} variant="secondary" onClick={authorizeHealth} disabled={devicesLoading || busy === "health-auth"}>{t("profile.requestAuth")}</ActionButton>
          <ActionButton icon={<RefreshCw className={busy === "health-sync" ? "spin" : undefined} size={18} />} onClick={syncHealth} disabled={devicesLoading || busy === "health-sync"}>{t("profile.syncNow")}</ActionButton>
        </div>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (activeView === "watch") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="watch">
      <SectionCard className="profile-device-card profile-subpage-card" title={t("profile.appleWatch")}>
        <div className="device-connection-row">
          <span className="device-connection-icon" aria-hidden="true"><Watch size={30} /></span>
          {devicesLoading ? <SkeletonLines count={2} compact /> : <div><strong>{watchReachable?.paired ? t("profile.watchPaired") : watchSnapshot ? t("profile.watchSnapshot") : t("profile.watchWaiting")}</strong><p className="muted">{connectionMeta(watchSnapshot?.lastSyncedAt, Boolean(watchReachable?.reachable))}</p></div>}
        </div>
        <div className="profile-subpage-actions">
          <ActionButton icon={<Link2 size={18} />} variant="secondary" onClick={connectWatch} disabled={devicesLoading || busy === "watch-connect"}>{t("profile.watchConnect")}</ActionButton>
          <ActionButton icon={<RefreshCw className={busy === "watch-sync" ? "spin" : undefined} size={18} />} onClick={syncWatch} disabled={devicesLoading || busy === "watch-sync"}>{t("profile.watchSync")}</ActionButton>
        </div>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (activeView === "privacy") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="privacy">
      <SectionCard className="profile-privacy-card profile-subpage-card" title={t("profile.privacy")}>
        <div className="timeline-list privacy-list">
          <div><ShieldCheck size={18} /><span>{t("profile.privacyKey")}</span></div>
          <div><ShieldCheck size={18} /><span>{t("profile.privacyMedia")}</span></div>
          <div><ShieldCheck size={18} /><span>{t("profile.privacyExport")}</span></div>
        </div>
        <ActionButton icon={<Download size={18} />} onClick={exportData} disabled={busy === "export"}>{t("profile.export")}</ActionButton>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (activeView === "account") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="account">
      <SectionCard className="profile-account-card profile-subpage-card" title={t("profile.account")}>
        <div className="profile-row">
          <button className="avatar large avatar-button" type="button" aria-label={t("profile.changeAvatar")} title={t("profile.changeAvatar")} onClick={() => setAvatarSheetOpen(true)} disabled={busy === "avatar"}>
            {profile?.avatar_url && !avatarLoadFailed ? <img alt="" src={profile.avatar_url} onError={() => setAvatarLoadFailed(true)} /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </button>
          <div><strong>{displayName}</strong><p className="muted">{t("profile.daysHere", { days: memberDays })}</p></div>
        </div>
        <input ref={galleryInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { void handleAvatarFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="user" onChange={(event) => { void handleAvatarFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </SectionCard>
      <SectionCard className="profile-account-actions-card" title={locale === "zh" ? "账号操作" : "Account actions"}>
        <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>{t("profile.signOut")}</ActionButton>
        <ActionButton icon={<Trash2 size={18} />} variant="ghost" onClick={() => setDeleteDialogOpen(true)}>{locale === "zh" ? "删除账号与全部数据" : "Delete account and all data"}</ActionButton>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
      {avatarSheetOpen && <AvatarPicker onClose={() => setAvatarSheetOpen(false)} onCamera={() => cameraInputRef.current?.click()} onLibrary={() => galleryInputRef.current?.click()} />}
      {deleteDialogOpen && <div className="avatar-sheet-overlay" role="presentation" onClick={() => setDeleteDialogOpen(false)}><section className="avatar-sheet account-delete-sheet" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "删除账号" : "Delete account"} onClick={(event) => event.stopPropagation()}><header><strong>{locale === "zh" ? "永久删除账号" : "Permanently delete account"}</strong><button type="button" onClick={() => setDeleteDialogOpen(false)} aria-label={t("common.close")}><X size={20} /></button></header><p>{locale === "zh" ? "这会删除账号、健康记录、AI 对话、周报和私密照片，无法恢复。请输入 DELETE 确认。" : "This removes the account, health records, AI chats, reports, and private photos. Type DELETE to confirm."}</p><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" autoCapitalize="characters" /><button type="button" disabled={deleteConfirmation !== "DELETE" || busy === "delete-account"} onClick={() => void deleteAccount()}>{busy === "delete-account" ? (locale === "zh" ? "正在删除…" : "Deleting…") : (locale === "zh" ? "永久删除" : "Delete permanently")}</button></section></div>}
    </div>
  );

  const currentSkin = APP_SKINS.find((candidate) => candidate.id === skin);
  const overviewRows: Array<{ id: ProfileView | "onboarding"; zh: string; en: string; value?: string }> = [
    { id: "personal", zh: "个人资料", en: "Personal profile" },
    { id: "skin", zh: "界面皮肤", en: "Interface skin", value: locale === "zh" ? currentSkin?.name : currentSkin?.nameEn },
    { id: "onboarding", zh: "初见手记", en: "First notes" },
    { id: "health", zh: "Apple 健康", en: "Apple Health" },
    { id: "watch", zh: "Apple Watch", en: "Apple Watch" },
    { id: "privacy", zh: "隐私与数据", en: "Privacy & data" },
    { id: "account", zh: "账号与安全", en: "Account & security" },
  ];

  return (
    <div className="stack profile-stack profile-overview" data-profile-view="overview">
      <SectionCard className="profile-account-card profile-overview-account" title={<span className="profile-section-title"><UserRound size={19} aria-hidden="true" />{t("profile.account")}</span>}>
        <button className="profile-account-entry" type="button" onClick={() => onViewChange("account")}>
          <span className="avatar large" aria-hidden="true">
            {profile?.avatar_url && !avatarLoadFailed
              ? <img alt="" src={profile.avatar_url} onError={() => setAvatarLoadFailed(true)} />
              : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="profile-account-copy"><strong>{displayName}</strong><small>{t("profile.daysHere", { days: memberDays })}</small></span>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </SectionCard>

      <ProfileQuarterCard userId={user.id} deviceDate={deviceDate} />

      <section className="section-card profile-entry-card" aria-label={locale === "zh" ? "我的设置入口" : "Profile settings"}>
        <header className="profile-entry-header"><LayoutGrid size={19} aria-hidden="true" /><h2>{locale === "zh" ? "快捷入口" : "Quick access"}</h2></header>
        {overviewRows.map((row) => {
          if (row.id === "onboarding" && !onOpenOnboarding) return null;
          return (
            <button
              className="profile-nav-row"
              data-profile-target={row.id}
              key={row.id}
              type="button"
              onClick={() => row.id === "onboarding" ? onOpenOnboarding?.() : onViewChange(row.id)}
            >
              <strong>{locale === "zh" ? row.zh : row.en}</strong>
              <span>{row.value && <small>{row.value}</small>}<ChevronRight size={22} aria-hidden="true" /></span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
