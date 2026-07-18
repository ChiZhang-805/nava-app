import { ArrowRight, CheckCircle2, Laptop, LockKeyhole, Mail, MessageCircle, Phone, Smartphone, Watch } from "lucide-react";
import { FormEvent, useState } from "react";
import ActionButton from "../components/ActionButton";
import LanguageToggle from "../components/LanguageToggle";
import { useT } from "../i18n";
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
  const t = useT();
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
  const AccountIcon = isPhone(account) ? Phone : Mail;
  const MethodIcon = method === "password" ? LockKeyhole : MessageCircle;
  const actionLabel = busy ? t("auth.processing") : method === "otp" && !otpSent ? t("auth.getOtp") : mode === "signIn" ? t("auth.enter") : t("auth.create");
  const canSubmit = !busy && Boolean(account) && !(method === "password" && !password) && !(method === "otp" && otpSent && !otp);
  const methodLabel = method === "password" ? t("auth.password") : t("auth.otp");
  const modeSwitchLabel = mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn");
  const methodSwitchLabel = method === "password" ? t("auth.useOtp") : t("auth.usePassword");

  function switchMode() {
    setMode((value) => (value === "signIn" ? "signUp" : "signIn"));
    setOtpSent(false);
    setNotice(null);
    setLocalError(null);
    clearError();
  }

  function switchMethod() {
    setMethod((value) => (value === "password" ? "otp" : "password"));
    setOtpSent(false);
    setNotice(null);
    setLocalError(null);
    clearError();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setLocalError(null);
    clearError();
    try {
      if (method === "password") {
        if (mode === "signUp" && isPhone(account)) {
          throw new Error(t("auth.error.phoneSignupOtp"));
        }
        if (mode === "signIn") {
          await signIn(account.trim(), password);
        } else {
          await signUp(account.trim(), password);
          setNotice(t("auth.notice.signupSubmitted"));
        }
      } else if (!otpSent) {
        if (isEmail(account)) {
          await sendEmailOtp(account.trim());
        } else if (isPhone(account)) {
          await sendSmsOtp(account.trim());
        } else {
          throw new Error(t("auth.error.invalidAccount"));
        }
        setOtpSent(true);
        setNotice(t("auth.notice.otpSent"));
      } else {
        if (isEmail(account)) {
          await verifyEmailOtp(account.trim(), otp);
          if (mode === "signUp" && otpPassword) await updateCurrentPassword(otpPassword);
        } else if (isPhone(account)) {
          await verifySmsOtp(account.trim(), otp, mode === "signIn" ? "login" : "register", otpPassword || undefined);
        } else {
          throw new Error(t("auth.error.accountFormat"));
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
      if (!isEmail(account)) throw new Error(t("auth.error.resetRequiresEmail"));
      await resetPassword(account.trim());
      setNotice(t("auth.notice.resetSent"));
    } catch (e) {
      setLocalError(formatAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-locale">
        <LanguageToggle />
      </div>
      <section className="auth-brand" aria-label="NAVA">
        <span className="auth-watermark">NAVA</span>
        <div className="auth-kicker">{t("auth.kicker")}</div>
        <h1>NAVA</h1>
        <div className="auth-greeting">
          <span>{t("auth.greeting.one")}</span>
          <span>{t("auth.greeting.two")}</span>
        </div>
      </section>

      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form-head">
          <div>
            <span>{t("auth.account")}</span>
            <h2>{mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}</h2>
          </div>
          <button className="auth-text-switch" type="button" onClick={switchMode}>
            {modeSwitchLabel}
          </button>
        </div>

        <div className="auth-method-line">
          <span>
            <MethodIcon size={16} />
            {methodLabel}
          </span>
          <button type="button" onClick={switchMethod}>
            {methodSwitchLabel}
          </button>
        </div>

        <div className="auth-field-stage">
          <label className="field">
            <span>{t("auth.emailPhone")}</span>
            <div className="input-wrap">
              <AccountIcon size={18} />
              <input autoComplete="email" inputMode="email" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t("auth.emailPhonePlaceholder")} />
            </div>
          </label>

          {method === "password" && (
            <label className="field">
              <span>{t("auth.password")}</span>
              <div className="input-wrap">
                <LockKeyhole size={18} />
                <input autoComplete={mode === "signIn" ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} />
              </div>
            </label>
          )}

          {method === "otp" && !otpSent && (
            <div className="auth-assist-panel" aria-live="polite">
              <div className="auth-assist-icon">
                <MessageCircle size={22} />
              </div>
              <div className="auth-assist-chips">
                <span>{t("auth.email")}</span>
                <span>{t("auth.sms")}</span>
                <span>{t("auth.sameAccount")}</span>
              </div>
            </div>
          )}

          {method === "otp" && otpSent && (
            <>
              <label className="field">
                <span>{t("auth.otp")}</span>
                <div className="input-wrap">
                  <MessageCircle size={18} />
                  <input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder={t("auth.otpPlaceholder")} />
                </div>
              </label>
              {mode === "signUp" && (
                <label className="field">
                  <span>{t("auth.setPassword")}</span>
                  <div className="input-wrap">
                    <LockKeyhole size={18} />
                    <input type="password" value={otpPassword} onChange={(e) => setOtpPassword(e.target.value)} placeholder={t("auth.optionalPassword")} />
                  </div>
                </label>
              )}
            </>
          )}

          {!(method === "otp" && !otpSent) && !(method === "otp" && otpSent && mode === "signUp") && (
            <div className="auth-sync-row" aria-label="Web iPhone Apple Watch">
              <span>
                <Laptop size={17} />
              </span>
              <span>
                <Smartphone size={17} />
              </span>
              <span>
                <Watch size={17} />
              </span>
            </div>
          )}
        </div>

        <div className="auth-feedback-slot" aria-live="polite">
          {error && <p className="error-text">{error}</p>}
          {localError && <p className="error-text">{localError}</p>}
          {notice && (
            <p className="success-text">
              <CheckCircle2 size={15} />
              <span>{notice}</span>
            </p>
          )}
        </div>

        <div className="auth-actions">
          <ActionButton type="submit" className="full-width" disabled={!canSubmit}>
            {actionLabel}
            <ArrowRight size={18} />
          </ActionButton>

          {mode === "signIn" && method === "password" && (
            <button className="text-button" type="button" onClick={handleResetPassword} disabled={busy || !account}>
              {t("auth.forgotPassword")}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
