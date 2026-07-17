import type { User } from "@supabase/supabase-js";
import { Apple, LogOut, RefreshCw, ShieldCheck, Watch } from "lucide-react";
import { useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { appConfig } from "../config";
import { isNativeHealthAvailable, requestHealthAuthorization, syncNativeHealthNow } from "../services/health";
import { readLastWatchSnapshot } from "../services/watch";
import { useAuth } from "../state/authContext";
import type { WatchUserSnapshot } from "../types";

export default function ProfileScreen({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchSnapshot, setWatchSnapshot] = useState<WatchUserSnapshot | null>(null);

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
  }, []);

  return (
    <div className="stack">
      <SectionCard title="账号" subtitle="Web、iPhone、Watch 共用同一个 Supabase 用户">
        <div className="profile-row">
          <div className="avatar large">{user.email?.slice(0, 1).toUpperCase() ?? "N"}</div>
          <div>
            <strong>{user.email}</strong>
            <p className="muted">User ID: {user.id}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Apple 健康"
        subtitle="真机上请求 HealthKit 权限并同步"
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

      <SectionCard title="Apple Watch" subtitle="第一版通过 iPhone companion 同步">
        <div className="watch-card">
          <Watch size={22} />
          <div>
            <strong>{watchSnapshot ? "Watch 快照已生成" : "等待今日页生成快照"}</strong>
            <p className="muted">
              {watchSnapshot
                ? `最近同步：${new Date(watchSnapshot.lastSyncedAt).toLocaleString("zh-CN")}`
                : "打开今日页后，App 会准备一份可发送给 Watch 的用户快照。"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="隐私与安全" subtitle="第一版必须保留这些入口">
        <div className="timeline-list">
          <div>
            <ShieldCheck size={18} />
            <span>模型密钥只允许存在服务端 Edge Functions</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>饮食和面部照片需要改成私有 Storage</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>上线前补充删除账号、导出数据、隐私政策</span>
          </div>
        </div>
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
