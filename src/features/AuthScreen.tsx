import { Activity, LockKeyhole, Mail, MessageCircle, Phone } from "lucide-react";
import { FormEvent, useState } from "react";
import ActionButton from "../components/ActionButton";
import { formatAuthError, isEmail, isPhone } from "../services/auth";
import { useAuth } from "../state/authContext";

export default function AuthScreen() {
  const {
    signIn,
    signUp,
    sendEmailOtp,
    verifyEmailOtp,
    sendSmsOtp,
    verifySmsOtp,
    resetPassword,
    updateCurrentPassword,
    error,
    clearError,
  } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [otpPassword, setOtpPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setLocalError(null);
    clearError();
    try {
      if (method === "password") {
        if (mode === "signUp" && isPhone(account)) {
          throw new Error("手机号注册请使用验证码方式，和 Web 端保持一致。");
        }
        if (mode === "signIn") {
          await signIn(account.trim(), password);
        } else {
          await signUp(account.trim(), password);
          setNotice("注册已提交。如果项目开启了邮箱确认，请先完成邮箱验证。");
        }
      } else if (!otpSent) {
        if (isEmail(account)) {
          await sendEmailOtp(account.trim());
        } else if (isPhone(account)) {
          await sendSmsOtp(account.trim());
        } else {
          throw new Error("请输入有效邮箱或中国大陆手机号。");
        }
        setOtpSent(true);
        setNotice("验证码已发送，请查看邮箱或短信。");
      } else {
        if (isEmail(account)) {
          await verifyEmailOtp(account.trim(), otp);
          if (mode === "signUp" && otpPassword) await updateCurrentPassword(otpPassword);
        } else if (isPhone(account)) {
          await verifySmsOtp(account.trim(), otp, mode === "signIn" ? "login" : "register", otpPassword || undefined);
        } else {
          throw new Error("账号格式不正确。");
        }
      }
    } catch (e) {
      setLocalError(formatAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setBusy(true);
    setNotice(null);
    setLocalError(null);
    clearError();
    try {
      if (!isEmail(account)) throw new Error("找回密码需要输入邮箱；手机号请用短信验证码登录。");
      await resetPassword(account.trim());
      setNotice("重置密码邮件已发送。");
    } catch (e) {
      setLocalError(formatAuthError(e));
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

        <div className="segmented compact">
          <button
            type="button"
            className={method === "password" ? "active" : ""}
            onClick={() => {
              setMethod("password");
              setOtpSent(false);
            }}
          >
            密码
          </button>
          <button
            type="button"
            className={method === "otp" ? "active" : ""}
            onClick={() => {
              setMethod("otp");
              setOtpSent(false);
            }}
          >
            验证码
          </button>
        </div>

        <label className="field">
          <span>邮箱 / 手机号</span>
          <div className="input-wrap">
            {isPhone(account) ? <Phone size={18} /> : <Mail size={18} />}
            <input autoComplete="email" inputMode="email" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="you@example.com / 138..." />
          </div>
        </label>

        {method === "password" && (
          <label className="field">
            <span>密码</span>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input autoComplete={mode === "signIn" ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
            </div>
          </label>
        )}

        {method === "otp" && otpSent && (
          <>
            <label className="field">
              <span>验证码</span>
              <div className="input-wrap">
                <MessageCircle size={18} />
                <input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6 位验证码" />
              </div>
            </label>
            {mode === "signUp" && (
              <label className="field">
                <span>设置密码</span>
                <div className="input-wrap">
                  <LockKeyhole size={18} />
                  <input type="password" value={otpPassword} onChange={(e) => setOtpPassword(e.target.value)} placeholder="可选，至少 6 位" />
                </div>
              </label>
            )}
          </>
        )}

        {error && <p className="error-text">{error}</p>}
        {localError && <p className="error-text">{localError}</p>}
        {notice && <p className="success-text">{notice}</p>}

        <ActionButton type="submit" className="full-width" disabled={busy || !account || (method === "password" && !password) || (method === "otp" && otpSent && !otp)}>
          {busy ? "处理中" : method === "otp" && !otpSent ? "获取验证码" : mode === "signIn" ? "进入 NAVA" : "创建账号"}
        </ActionButton>

        {mode === "signIn" && method === "password" && (
          <button className="text-button" type="button" onClick={handleResetPassword} disabled={busy || !account}>
            找回密码
          </button>
        )}
      </form>
    </main>
  );
}
