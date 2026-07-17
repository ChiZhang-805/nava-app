import { Activity, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import ActionButton from "../components/ActionButton";
import { useAuth } from "../state/authContext";

export default function AuthScreen() {
  const { signIn, signUp, error, clearError } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    clearError();
    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setNotice("注册已提交。如果项目开启了邮箱确认，请先完成邮箱验证。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-hero">
        <div className="brand-mark">
          <Activity size={30} />
        </div>
        <p className="eyebrow">NAVA Health</p>
        <h1>同一个账号连接 Web、iPhone 和 Apple Watch</h1>
        <p>先登录同一个 Supabase 账号，App 写入的数据会进入现有 Web 仓库正在使用的表。</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "signIn" ? "active" : ""} onClick={() => setMode("signIn")}>
            登录
          </button>
          <button type="button" className={mode === "signUp" ? "active" : ""} onClick={() => setMode("signUp")}>
            注册
          </button>
        </div>

        <label className="field">
          <span>邮箱</span>
          <div className="input-wrap">
            <Mail size={18} />
            <input autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </label>

        <label className="field">
          <span>密码</span>
          <div className="input-wrap">
            <LockKeyhole size={18} />
            <input autoComplete={mode === "signIn" ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
          </div>
        </label>

        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        <ActionButton type="submit" className="full-width" disabled={busy || !email || !password}>
          {busy ? "处理中" : mode === "signIn" ? "进入 NAVA" : "创建账号"}
        </ActionButton>
      </form>
    </main>
  );
}
