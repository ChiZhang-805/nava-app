import type { User } from "@supabase/supabase-js";
import { Apple, CalendarDays, Check, ChevronLeft, ChevronRight, CircleUserRound, Database, Eye, Grid3X3, KeyRound, LayoutGrid, LockKeyhole, LogOut, Mail, MessageCircle, Palette, Phone, RotateCcw, Save, ShieldCheck, UserRound, Watch, X } from "lucide-react";
import AvatarPicker from "../components/AvatarPicker";
import AppSkinPicker from "../components/AppSkinPicker";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ActionButton from "../components/ActionButton";
import PageSkeleton from "../components/PageSkeleton";
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
import { updateBackupContacts, updateCurrentPassword } from "../services/auth";

const occupationOptions = [
  { value: "student", zh: "学生", en: "Student" },
  { value: "employee", zh: "职场人士", en: "Employee" },
  { value: "freelance", zh: "自由职业", en: "Freelance" },
  { value: "caregiver", zh: "居家照护", en: "Home carer" },
  { value: "retired", zh: "退休人士", en: "Retired" },
  { value: "other", zh: "其他", en: "Other" },
] as const;

const ageGroupOptions = [
  { value: "under_18", zh: "18 岁以下", en: "Under 18" },
  { value: "18_24", zh: "18–24 岁", en: "18–24" },
  { value: "25_34", zh: "25–34 岁", en: "25–34" },
  { value: "35_44", zh: "35–44 岁", en: "35–44" },
  { value: "45_plus", zh: "45 岁及以上", en: "45+" },
] as const;

function daysSinceSignup(createdAt?: string) {
  const created = Date.parse(createdAt ?? "");
  if (!Number.isFinite(created)) return 1;
  return Math.max(1, Math.floor((Date.now() - created) / 86_400_000) + 1);
}

type ProfileView = "account" | "personal" | "skin" | "health" | "watch" | "privacy";
type DevicePhase = "idle" | "authorizing" | "checking" | "syncing" | "complete" | "error";
type SecurityEditor = "password" | "email" | "phone";

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

export default function ProfileScreen({ user, refreshKey, onChanged, onOpenOnboarding, skin, onSkinChange, deviceDate, view, onViewChange, exportRequestId = 0 }: { user: User; refreshKey?: number; onChanged: () => void; onOpenOnboarding?: () => void; skin: AppSkin; onSkinChange: (skin: AppSkin) => void; deviceDate: string; view?: string | null; onViewChange: (view: ProfileView | null) => void; exportRequestId?: number }) {
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
  const [healthPhase, setHealthPhase] = useState<DevicePhase>("idle");
  const [watchPhase, setWatchPhase] = useState<DevicePhase>("idle");
  const [securityEditor, setSecurityEditor] = useState<SecurityEditor | null>(null);
  const [securityDraft, setSecurityDraft] = useState({
    password: "",
    confirmPassword: "",
    email: typeof user.user_metadata.backup_email === "string" ? user.user_metadata.backup_email : "",
    phone: typeof user.user_metadata.backup_phone === "string" ? user.user_metadata.backup_phone : "",
  });
  const exportRequestRef = useRef(exportRequestId);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    height: "",
    weight: "",
    ageGroup: "",
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
          ageGroup: data?.age_group ?? "",
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

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [view]);

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
      updates.age_group = profileDraft.ageGroup.trim() || null;

      const saved = Object.keys(updates).length > 1 ? await saveProfile(updates) : profile;
      if (!saved) return;
      setProfile(saved);
      setProfileDraft({
        username: saved.username ?? "",
        height: saved.height != null ? String(saved.height) : "",
        weight: saved.weight != null ? String(saved.weight) : "",
        ageGroup: saved.age_group ?? "",
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

  const exportDataRef = useRef(exportData);
  exportDataRef.current = exportData;

  useEffect(() => {
    if (exportRequestId === exportRequestRef.current) return;
    exportRequestRef.current = exportRequestId;
    if (view === "privacy") void exportDataRef.current();
  }, [exportRequestId, view]);

  async function saveSecurityEditor() {
    if (!securityEditor) return;
    if (securityEditor === "password") {
      if (securityDraft.password.length < 6) {
        setError(locale === "zh" ? "新密码至少需要 6 位。" : "The new password must contain at least 6 characters.");
        return;
      }
      if (securityDraft.password !== securityDraft.confirmPassword) {
        setError(locale === "zh" ? "两次输入的新密码不一致。" : "The two new passwords do not match.");
        return;
      }
      const completed = await run("security-password", locale === "zh" ? "密码已更新。" : "Password updated.", () => updateCurrentPassword(securityDraft.password, true));
      if (completed) {
        setSecurityDraft((draft) => ({ ...draft, password: "", confirmPassword: "" }));
        setSecurityEditor(null);
      }
      return;
    }

    if (securityEditor !== "email" && securityEditor !== "phone") return;

    const completed = await run(`security-${securityEditor}`, locale === "zh" ? "安全联系方式已保存。" : "Security contact saved.", async () => {
      const next = await updateBackupContacts({
        email: securityDraft.email,
        phone: securityDraft.phone,
      });
      setSecurityDraft((draft) => ({ ...draft, email: next.email ?? "", phone: next.phone ?? "" }));
    });
    if (completed) setSecurityEditor(null);
  }

  function openSecurityEditor(editor: SecurityEditor) {
    setError(null);
    setMessage(null);
    setSecurityEditor(editor);
  }

  function closeSecurityEditor() {
    setError(null);
    setSecurityEditor(null);
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
    setHealthPhase("authorizing");
    const completed = await run("health-auth", null, async () => {
      const authorization = await requestHealthAuthorization();
      if (!authorization.granted) throw new Error("reason" in authorization ? authorization.reason : (locale === "zh" ? "Apple 健康授权未完成。" : "Apple Health authorization was not completed."));
      setHealthPhase("checking");
      setHealthAuthorization(await getHealthAuthorizationStatus());
      setHealthPhase("syncing");
      const syncResult = await syncNativeHealthNow(user.id);
      if (!("skipped" in syncResult && syncResult.skipped) && syncResult.uploaded > 0) {
        uploaded = syncResult.uploaded;
        setHealthLastSync(syncResult.lastSyncDate);
      }
    });
    setHealthPhase(completed ? "complete" : "error");
    if (completed) {
      setMessage(uploaded > 0
        ? t("profile.syncSuccess")
        : (locale === "zh" ? "授权已更新；当前没有可同步的健康记录。" : "Authorization updated; no health records are currently available."));
      window.setTimeout(() => setHealthPhase("idle"), 1600);
    }
  }

  async function syncHealth() {
    setHealthPhase("syncing");
    const completed = await run("health-sync", null, async () => {
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
    setHealthPhase(completed ? "complete" : "error");
    if (completed) window.setTimeout(() => setHealthPhase("idle"), 1600);
  }

  async function connectWatch() {
    setWatchPhase("checking");
    const completed = await run("watch-connect", null, async () => {
      if (!isNativeHealthAvailable()) throw new Error(locale === "zh" ? "Apple Watch 连接仅能在 iPhone App 中完成。" : "Apple Watch can only connect through the iPhone app.");
      const reachability = await getWatchReachability();
      setWatchReachable(reachability);
      if (!reachability.paired) throw new Error(locale === "zh" ? "尚未检测到已配对的 Apple Watch，请先在系统 Watch App 中配对。" : "No paired Apple Watch was found. Pair it in the system Watch app first.");
    });
    setWatchPhase(completed ? "complete" : "error");
    if (completed) window.setTimeout(() => setWatchPhase("idle"), 1600);
  }

  async function syncWatch() {
    setWatchPhase("syncing");
    const completed = await run("watch-sync", null, async () => {
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
    setWatchPhase(completed ? "complete" : "error");
    if (completed) window.setTimeout(() => setWatchPhase("idle"), 1600);
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
  const healthCanSync = healthConnected || Boolean(healthAuthorization?.requested);
  const healthPhaseText = devicesLoading
    ? (locale === "zh" ? "正在读取设备状态" : "Reading device status")
    : healthPhase === "authorizing" ? (locale === "zh" ? "正在请求 Apple 健康授权" : "Requesting Apple Health access")
      : healthPhase === "checking" ? (locale === "zh" ? "正在检查授权范围" : "Checking authorized data")
        : healthPhase === "syncing" ? (locale === "zh" ? "正在同步最新健康记录" : "Syncing the latest health records")
          : healthPhase === "complete" ? (locale === "zh" ? "同步完成" : "Sync complete")
            : healthPhase === "error" ? (locale === "zh" ? "本次操作未完成，请查看下方提示" : "Not completed; see the message below")
              : healthCanSync ? (locale === "zh" ? "轻点同步最新数据" : "Tap to sync the latest data") : (locale === "zh" ? "轻点连接 Apple 健康" : "Tap to connect Apple Health");
  const watchConnected = Boolean(watchReachable?.paired || watchSnapshot);
  const watchPhaseText = devicesLoading
    ? (locale === "zh" ? "正在读取手表状态" : "Reading Watch status")
    : watchPhase === "checking" ? (locale === "zh" ? "正在检查配对与连接" : "Checking pairing and reachability")
      : watchPhase === "syncing" ? (locale === "zh" ? "正在生成并同步今日快照" : "Building and syncing today's snapshot")
        : watchPhase === "complete" ? (locale === "zh" ? "手表快照已更新" : "Watch snapshot updated")
          : watchPhase === "error" ? (locale === "zh" ? "本次操作未完成，请查看下方提示" : "Not completed; see the message below")
            : watchConnected ? (locale === "zh" ? "轻点同步 Apple Watch" : "Tap to sync Apple Watch") : (locale === "zh" ? "轻点检查 Apple Watch" : "Tap to check Apple Watch");
  const heightCm = Number(profileDraft.height);
  const weightKg = Number(profileDraft.weight);
  const bmi = Number.isFinite(heightCm) && heightCm > 0 && Number.isFinite(weightKg) && weightKg > 0
    ? weightKg / ((heightCm / 100) ** 2)
    : null;
  const bmiLabel = bmi == null
    ? (locale === "zh" ? "填写身高与体重后自动计算" : "Add height and weight to calculate")
    : locale === "zh"
      ? bmi < 18.5 ? "偏轻参考" : bmi < 24 ? "常见范围" : bmi < 28 ? "偏高参考" : "较高参考"
      : bmi < 18.5 ? "Lower range" : bmi < 25 ? "Common range" : bmi < 30 ? "Higher range" : "High range";
  const securityEditorTitle = securityEditor === "password" ? (locale === "zh" ? "修改密码" : "Change password")
    : securityEditor === "email" ? (locale === "zh" ? "备用邮箱" : "Backup email")
      : (locale === "zh" ? "备用手机号" : "Backup phone");
  const securityEditorIcon = securityEditor === "password" ? <KeyRound size={21} aria-hidden="true" />
    : securityEditor === "email" ? <Mail size={21} aria-hidden="true" />
      : <Phone size={21} aria-hidden="true" />;

  const activeView = view && profileViews.has(view as ProfileView) ? view as ProfileView : null;

  if (profileLoading && (!activeView || activeView === "personal")) return <PageSkeleton variant="profile" />;

  if (activeView === "skin") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="skin">
      <SectionCard className="profile-skin-card profile-subpage-card profile-one-screen-card" title={<span className="profile-section-title"><Palette size={19} aria-hidden="true" />{locale === "zh" ? "界面皮肤" : "Interface skin"}</span>}>
        <AppSkinPicker value={skin} onChange={onSkinChange} compact detailed />
      </SectionCard>
    </div>
  );

  if (activeView === "personal") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="personal">
      <SectionCard className="profile-personal-card profile-subpage-card profile-one-screen-card" title={<span className="profile-section-title"><UserRound size={19} aria-hidden="true" />{t("profile.personal")}</span>}>
        <div className="profile-form">
          <label className="field profile-personal-field">
            <span>{t("profile.nickname")}</span>
            <input value={profileDraft.username} onChange={(event) => updateDraft("username", event.target.value)} placeholder={profile?.username ?? t("profile.defaultName")} />
          </label>
          <label className="field profile-personal-field">
            <span>{t("profile.height")}</span>
            <div className="profile-measure-input"><input inputMode="decimal" value={profileDraft.height} onChange={(event) => updateDraft("height", event.target.value)} placeholder={locale === "zh" ? "例如：172" : "e.g. 172"} /><span className="profile-input-unit">cm</span></div>
          </label>
          <label className="field profile-personal-field">
            <span>{t("profile.weight")}</span>
            <div className="profile-measure-input"><input inputMode="decimal" value={profileDraft.weight} onChange={(event) => updateDraft("weight", event.target.value)} placeholder={locale === "zh" ? "例如：64" : "e.g. 64"} /><span className="profile-input-unit">kg</span></div>
          </label>
          <div className="field profile-personal-field">
            <span id="profile-bmi-label">{locale === "zh" ? "BMI 参考" : "BMI reference"}</span>
            <div className="profile-bmi-summary" data-bmi-ready={bmi == null ? "false" : "true"} aria-labelledby="profile-bmi-label" aria-live="polite">
            <strong>{bmi == null ? "—" : bmi.toFixed(1)}</strong>
            <small>{bmiLabel}</small>
            </div>
          </div>
          <label className="field profile-personal-field">
            <span>{locale === "zh" ? "年龄阶段" : "Age group"}</span>
            <select value={profileDraft.ageGroup} onChange={(event) => updateDraft("ageGroup", event.target.value)}>
              <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
              {!ageGroupOptions.some((option) => option.value === profileDraft.ageGroup) && profileDraft.ageGroup && <option value={profileDraft.ageGroup}>{profileDraft.ageGroup}</option>}
              {ageGroupOptions.map((option) => <option key={option.value} value={option.value}>{locale === "zh" ? option.zh : option.en}</option>)}
            </select>
          </label>
          <label className="field profile-personal-field"><span>{t("profile.goal")}</span><input value={profileDraft.goal} onChange={(event) => updateDraft("goal", event.target.value)} placeholder={t("profile.goalPlaceholder")} /></label>
          <label className="field profile-personal-field">
            <span>{t("profile.occupation")}</span>
            <select value={profileDraft.occupation} onChange={(event) => updateDraft("occupation", event.target.value)}>
              <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
              {!occupationOptions.some((option) => option.value === profileDraft.occupation) && profileDraft.occupation && <option value={profileDraft.occupation}>{profileDraft.occupation}</option>}
              {occupationOptions.map((option) => <option key={option.value} value={option.value}>{locale === "zh" ? option.zh : option.en}</option>)}
            </select>
          </label>
        </div>
        <ActionButton className="profile-personal-save" icon={profileSaved ? <Check size={18} /> : <Save size={18} />} onClick={submitProfile} disabled={busy === "profile"}>{profileSaved ? (locale === "zh" ? "已保存" : "Saved") : t("profile.save")}</ActionButton>
      </SectionCard>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (activeView === "health") return (
    <div className="stack profile-stack profile-subpage profile-device-experience" data-profile-view="health">
      <SectionCard className="profile-device-card profile-subpage-card profile-one-screen-card" title={<span className="profile-section-title"><Apple size={19} aria-hidden="true" />{t("profile.appleHealth")}</span>}>
        <div className="profile-device-stage" data-phase={devicesLoading ? "checking" : healthPhase} data-connected={healthCanSync ? "true" : "false"}>
          <button className="profile-device-orb" type="button" onClick={() => void (healthCanSync ? syncHealth() : authorizeHealth())} disabled={devicesLoading || busy === "health-auth" || busy === "health-sync"} aria-label={healthCanSync ? t("profile.syncNow") : t("profile.requestAuth")}>
            <span className="profile-device-orbit profile-device-orbit-one" aria-hidden="true" />
            <span className="profile-device-orbit profile-device-orbit-two" aria-hidden="true" />
            {healthPhase === "complete" ? <Check size={54} aria-hidden="true" /> : <Apple size={58} aria-hidden="true" />}
          </button>
          <p className="profile-device-status" aria-live="polite" title={error ?? message ?? undefined}>{error ?? message ?? healthPhaseText}</p>
        </div>
        <div className="profile-device-facts">
          <div><span>{locale === "zh" ? "连接状态" : "Connection"}</span><strong>{devicesLoading ? "—" : healthStatus}</strong></div>
          <div><span>{locale === "zh" ? "自动同步" : "Automatic sync"}</span><strong>{locale === "zh" ? "授权后自动运行" : "Runs after authorization"}</strong></div>
          <div><span>{locale === "zh" ? "上次同步" : "Last sync"}</span><strong>{healthLastSync ? `${connectionTimestamp(healthLastSync)} · ${t(healthSyncIsRecent ? "profile.syncRecent" : "profile.syncStale")}` : t("profile.waitingSync")}</strong></div>
        </div>
      </SectionCard>
    </div>
  );

  if (activeView === "watch") return (
    <div className="stack profile-stack profile-subpage profile-device-experience" data-profile-view="watch">
      <SectionCard className="profile-device-card profile-subpage-card profile-one-screen-card" title={<span className="profile-section-title"><Watch size={19} aria-hidden="true" />{t("profile.appleWatch")}</span>}>
        <div className="profile-device-stage" data-phase={devicesLoading ? "checking" : watchPhase} data-connected={watchConnected ? "true" : "false"}>
          <button className="profile-device-orb" type="button" onClick={() => void (watchConnected ? syncWatch() : connectWatch())} disabled={devicesLoading || busy === "watch-connect" || busy === "watch-sync"} aria-label={watchConnected ? t("profile.watchSync") : t("profile.watchConnect")}>
            <span className="profile-device-orbit profile-device-orbit-one" aria-hidden="true" />
            <span className="profile-device-orbit profile-device-orbit-two" aria-hidden="true" />
            {watchPhase === "complete" ? <Check size={54} aria-hidden="true" /> : <Watch size={58} aria-hidden="true" />}
          </button>
          <p className="profile-device-status" aria-live="polite" title={error ?? message ?? undefined}>{error ?? message ?? watchPhaseText}</p>
        </div>
        <div className="profile-device-facts">
          <div><span>{locale === "zh" ? "配对状态" : "Pairing"}</span><strong>{devicesLoading ? "—" : `${watchReachable?.paired ? t("profile.watchPaired") : watchSnapshot ? t("profile.watchSnapshot") : t("profile.watchWaiting")} · ${t(watchReachable?.reachable ? "profile.online" : "profile.offline")}`}</strong></div>
          <div><span>{locale === "zh" ? "自动同步" : "Automatic sync"}</span><strong>{locale === "zh" ? "已启用手表操作队列" : "Watch action queue enabled"}</strong></div>
          <div><span>{locale === "zh" ? "上次同步" : "Last sync"}</span><strong>{connectionTimestamp(watchSnapshot?.lastSyncedAt)}</strong></div>
        </div>
      </SectionCard>
    </div>
  );

  if (activeView === "privacy") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="privacy">
      <SectionCard className="profile-privacy-card profile-subpage-card profile-one-screen-card" title={<span className="profile-section-title"><ShieldCheck size={19} aria-hidden="true" />{locale === "zh" ? "隐私与安全" : "Privacy & security"}</span>}>
        <div className="profile-policy-list">
          <article><Database size={19} aria-hidden="true" /><div><h3>{locale === "zh" ? "数据如何保存" : "How data is stored"}</h3><p>{locale === "zh" ? "健康记录、日记和设置与当前登录账号绑定；私密照片按用户路径隔离保存。服务密钥不会写入手机本地或前端代码。" : "Health records, journals, and settings are bound to the signed-in account. Private images use user-isolated paths. Service secrets are never stored in the browser or frontend bundle."}</p></div></article>
          <article><Eye size={19} aria-hidden="true" /><div><h3>{locale === "zh" ? "数据如何使用" : "How data is used"}</h3><p>{locale === "zh" ? "仅在你授权的范围内用于记录、统计与 AI 辅助。NAVA 不将个人健康数据出售或用于广告画像，健康与面部结果不构成医疗诊断。" : "Data is used only within your consent for records, summaries, and AI assistance. NAVA does not sell health data or use it for ad profiling. Health and face outputs are not medical diagnoses."}</p></div></article>
          <article><LockKeyhole size={19} aria-hidden="true" /><div><h3>{locale === "zh" ? "传输与权限" : "Transport & access"}</h3><p>{locale === "zh" ? "网络请求通过 HTTPS 传输，数据访问按登录身份和最小必要权限限制。Apple 健康只在系统授权后读取，撤回权限后停止新的采集。" : "Network requests use HTTPS and access is restricted by the signed-in identity and least privilege. Apple Health is read only after system authorization; revoking permission stops new collection."}</p></div></article>
          <article><UserRound size={19} aria-hidden="true" /><div><h3>{locale === "zh" ? "你的选择与控制" : "Your choices & control"}</h3><p>{locale === "zh" ? "你可随时更正资料、关闭系统权限、在右上角导出副本，或在账号与安全中申请删除账号及关联数据。删除操作会要求二次确认。" : "You can correct profile data, revoke system permissions, export a copy from the top-right menu, or request deletion of the account and associated data. Deletion requires explicit confirmation."}</p></div></article>
        </div>
        <p className="profile-policy-feedback" data-kind={error ? "error" : message ? "success" : "idle"} aria-live="polite">{error ?? message ?? (locale === "zh" ? "数据导出位于右上角菜单" : "Data export is in the top-right menu")}</p>
      </SectionCard>
    </div>
  );

  if (activeView === "account") return (
    <div className="stack profile-stack profile-subpage" data-profile-view="account">
      <SectionCard className="profile-account-card profile-subpage-card profile-account-security-card">
        <div className="profile-row">
          <button className="avatar large avatar-button" type="button" aria-label={t("profile.changeAvatar")} title={t("profile.changeAvatar")} onClick={() => setAvatarSheetOpen(true)} disabled={busy === "avatar"}>
            {profile?.avatar_url && !avatarLoadFailed ? <img alt="" src={profile.avatar_url} onError={() => setAvatarLoadFailed(true)} /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </button>
          <div><strong>{displayName}</strong><p className="muted">{t("profile.daysHere", { days: memberDays })}</p></div>
        </div>
        <input ref={galleryInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { void handleAvatarFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="user" onChange={(event) => { void handleAvatarFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        <div className="profile-security-entries">
          <button type="button" onClick={() => openSecurityEditor("password")}><KeyRound size={19} /><span><strong>{locale === "zh" ? "修改密码" : "Change password"}</strong><small>{locale === "zh" ? "更新当前登录密码" : "Update the current sign-in password"}</small></span><ChevronRight size={21} /></button>
          <button type="button" disabled aria-disabled="true"><RotateCcw size={19} /><span><strong>{locale === "zh" ? "找回密码" : "Recover password"}</strong><small>{locale === "zh" ? "验证码重设" : "Reset with a verification code"}</small></span></button>
          <button type="button" onClick={() => openSecurityEditor("email")}><Mail size={19} /><span><strong>{locale === "zh" ? "备用邮箱" : "Backup email"}</strong><small>{securityDraft.email || (locale === "zh" ? "未设置" : "Not set")}</small></span><ChevronRight size={21} /></button>
          <button type="button" onClick={() => openSecurityEditor("phone")}><Phone size={19} /><span><strong>{locale === "zh" ? "备用手机号" : "Backup phone"}</strong><small>{securityDraft.phone || (locale === "zh" ? "未设置" : "Not set")}</small></span><ChevronRight size={21} /></button>
          <button type="button" disabled aria-disabled="true"><MessageCircle size={19} /><span><strong>{locale === "zh" ? "关联微信" : "Connect WeChat"}</strong><small>{locale === "zh" ? "未关联" : "Not connected"}</small></span></button>
          <button type="button" disabled aria-disabled="true"><CircleUserRound size={19} /><span><strong>{locale === "zh" ? "关联 QQ" : "Connect QQ"}</strong><small>{locale === "zh" ? "未关联" : "Not connected"}</small></span></button>
          <button type="button" disabled aria-disabled="true"><Grid3X3 size={19} /><span><strong>{locale === "zh" ? "APP 手势密码" : "App gesture lock"}</strong><small>{locale === "zh" ? "待接入系统安全存储" : "Requires secure device storage"}</small></span></button>
        </div>
        {(error || message) && <p className="profile-security-note" data-kind={error ? "error" : "success"} aria-live="polite">{error ?? message}</p>}
      </SectionCard>
      <div className="profile-account-danger-actions" aria-label={locale === "zh" ? "账号操作" : "Account actions"}>
        <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>{t("profile.signOut")}</ActionButton>
        <ActionButton variant="ghost" onClick={() => setDeleteDialogOpen(true)}>{locale === "zh" ? "注销账号" : "Delete account"}</ActionButton>
      </div>
      {avatarSheetOpen && <AvatarPicker onClose={() => setAvatarSheetOpen(false)} onCamera={() => cameraInputRef.current?.click()} onLibrary={() => galleryInputRef.current?.click()} />}
      {securityEditor && <div className="avatar-sheet-overlay profile-security-overlay" role="presentation" onClick={closeSecurityEditor}>
        <section className="avatar-sheet profile-security-sheet" role="dialog" aria-modal="true" aria-label={securityEditorTitle} onClick={(event) => event.stopPropagation()}>
          <header><span className="profile-security-sheet-title">{securityEditorIcon}<strong>{securityEditorTitle}</strong></span><button type="button" onClick={closeSecurityEditor} aria-label={t("common.close")}><X size={21} /></button></header>
          {securityEditor === "password" ? <>
            <label><span>{locale === "zh" ? "新密码" : "New password"}</span><input type="password" autoComplete="new-password" value={securityDraft.password} onChange={(event) => setSecurityDraft((draft) => ({ ...draft, password: event.target.value }))} /></label>
            <label><span>{locale === "zh" ? "再次输入" : "Confirm password"}</span><input type="password" autoComplete="new-password" value={securityDraft.confirmPassword} onChange={(event) => setSecurityDraft((draft) => ({ ...draft, confirmPassword: event.target.value }))} /></label>
          </> : securityEditor === "email" ? <label><span>{locale === "zh" ? "邮箱地址" : "Email address"}</span><input type="email" autoComplete="email" value={securityDraft.email} onChange={(event) => setSecurityDraft((draft) => ({ ...draft, email: event.target.value }))} placeholder="name@example.com" /></label>
            : <label><span>{locale === "zh" ? "中国大陆手机号" : "Mainland China phone"}</span><input inputMode="tel" autoComplete="tel" value={securityDraft.phone} onChange={(event) => setSecurityDraft((draft) => ({ ...draft, phone: event.target.value }))} placeholder="13800000000" /></label>}
          {error && <p className="error-text">{error}</p>}
          <button className="profile-security-save" type="button" disabled={Boolean(busy?.startsWith("security-"))} onClick={() => void saveSecurityEditor()}>{busy?.startsWith("security-") ? (locale === "zh" ? "正在保存…" : "Saving…") : (locale === "zh" ? "保存" : "Save")}</button>
        </section>
      </div>}
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
