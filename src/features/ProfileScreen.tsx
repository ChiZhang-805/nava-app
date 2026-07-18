import type { User } from "@supabase/supabase-js";
import { Apple, Download, LogOut, RefreshCw, Save, ShieldCheck, Watch } from "lucide-react";
import { useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { appConfig } from "../config";
import { exportUserData, downloadJson } from "../services/exportData";
import { isNativeHealthAvailable, requestHealthAuthorization, syncNativeHealthNow } from "../services/health";
import { loadProfile, saveProfile, type UserProfile } from "../services/profile";
import { getWatchReachability, readLastWatchSnapshot } from "../services/watch";
import { useAuth } from "../state/authContext";
import type { WatchUserSnapshot } from "../types";

export default function ProfileScreen({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { signOut } = useAuth();
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
      <SectionCard title="账号" action={<StatusPill tone="good">同账号</StatusPill>}>
        <div className="profile-row">
          <div className="avatar large">{user.email?.slice(0, 1).toUpperCase() ?? "N"}</div>
          <div>
            <strong>{user.email}</strong>
            <p className="muted">Web · iPhone · Watch</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="个人资料">
        <label className="field">
          <span>昵称</span>
          <input value={profileDraft.username} onChange={(e) => setProfileDraft((draft) => ({ ...draft, username: e.target.value }))} placeholder={profile?.username ?? "NAVA 用户"} />
        </label>
        <div className="two-col">
          <label className="field">
            <span>身高 cm</span>
            <input inputMode="decimal" value={profileDraft.height} onChange={(e) => setProfileDraft((draft) => ({ ...draft, height: e.target.value }))} />
          </label>
          <label className="field">
            <span>体重 kg</span>
            <input inputMode="decimal" value={profileDraft.weight} onChange={(e) => setProfileDraft((draft) => ({ ...draft, weight: e.target.value }))} />
          </label>
        </div>
        <label className="field">
          <span>目标</span>
          <input value={profileDraft.goal} onChange={(e) => setProfileDraft((draft) => ({ ...draft, goal: e.target.value }))} placeholder="例如：改善睡眠和稳定节律" />
        </label>
        <label className="field">
          <span>职业</span>
          <input value={profileDraft.occupation} onChange={(e) => setProfileDraft((draft) => ({ ...draft, occupation: e.target.value }))} />
        </label>
        <ActionButton icon={<Save size={18} />} onClick={submitProfile} disabled={busy === "资料保存"}>
          保存资料
        </ActionButton>
      </SectionCard>

      <SectionCard
        title="Apple 健康"
        subtitle="HealthKit"
        action={<StatusPill tone={isNativeHealthAvailable() ? "good" : "warn"}>{isNativeHealthAvailable() ? "可用" : "浏览器预览"}</StatusPill>}
      >
        <div className="button-row">
          <ActionButton
            icon={<Apple size={18} />}
            variant="secondary"
            disabled={busy === "HealthKit 授权"}
            onClick={() => run("HealthKit 授权", requestHealthAuthorization)}
          >
            请求授权
          </ActionButton>
          <ActionButton
            icon={<RefreshCw size={18} />}
            disabled={busy === "健康同步"}
            onClick={() => run("健康同步", () => syncNativeHealthNow(user.id))}
          >
            立即同步
          </ActionButton>
        </div>
      </SectionCard>

      <SectionCard title="Apple Watch" subtitle="iPhone 同步">
        <div className="watch-card">
          <Watch size={22} />
          <div>
            <strong>{watchReachable?.paired ? "已检测到配对手表" : watchSnapshot ? "Watch 快照已生成" : "等待今日页生成快照"}</strong>
            <p className="muted">
              {watchSnapshot
                  ? `${new Date(watchSnapshot.lastSyncedAt).toLocaleString("zh-CN")} · ${watchReachable?.reachable ? "在线" : "离线"}`
                  : "等待快照"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="隐私与安全">
        <div className="timeline-list">
          <div>
            <ShieldCheck size={18} />
            <span>模型服务密钥不会保存在手机本地</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>饮食和面部照片会按账号隔离保存</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>导出、删除和隐私政策入口会持续保留</span>
          </div>
        </div>
        <ActionButton icon={<Download size={18} />} variant="secondary" onClick={exportData} disabled={busy === "数据导出"}>
          导出我的数据
        </ActionButton>
      </SectionCard>

      <SectionCard title="环境" subtitle={appConfig.appEnv}>
        <code className="code-card">{appConfig.supabaseUrl}</code>
        <code className="code-card">{appConfig.upstreamRepo}</code>
      </SectionCard>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <ActionButton icon={<LogOut size={18} />} variant="ghost" onClick={signOut}>
        退出登录
      </ActionButton>
    </div>
  );
}
