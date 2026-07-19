import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MailCheck,
  Phone,
  Send,
  UserRoundPlus,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import LanguageToggle from "../components/LanguageToggle";
import NavaWordmark from "../components/NavaWordmark";
import { useT } from "../i18n";
import { formatAuthError, isEmail, isPhone } from "../services/auth";
import { useAuth } from "../state/authContext";

type AuthMode = "signIn" | "signUp";

export default function AuthScreen() {
  const {
    signIn,
    signUp,
    sendSmsOtp,
    verifySmsOtp,
    resetPassword,
    error,
    clearError,
  } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const normalizedAccount = account.trim();
  const accountIsEmail = isEmail(normalizedAccount);
  const accountIsPhone = isPhone(normalizedAccount);
  const accountIsValid = accountIsEmail || accountIsPhone;
  const requiresSmsCode = mode === "signUp" && accountIsPhone;
  const AccountIcon = isPhone(account) ? Phone : AtSign;
  const feedbackError = localError ?? error;
  const canSubmit =
    !busy &&
    accountIsValid &&
    (mode === "signIn"
      ? Boolean(password)
      : password.length >= 6 &&
        Boolean(confirmPassword) &&
        (!requiresSmsCode || (otpSent && sentTo === normalizedAccount && /^\d{6}$/.test(otp))));

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => setCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  function clearFeedback() {
    setNotice(null);
    setLocalError(null);
    clearError();
  }

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    setOtpSent(false);
    setSentTo("");
    setCodeCooldown(0);
    setShowPassword(false);
    setShowConfirmPassword(false);
    clearFeedback();
  }

  function updateAccount(value: string) {
    setAccount(value);
    if (sentTo && value.trim() !== sentTo) {
      setOtp("");
      setOtpSent(false);
      setSentTo("");
      setCodeCooldown(0);
      setNotice(null);
    }
  }

  async function sendRegistrationCode() {
    if (codeBusy || codeCooldown > 0) return;
    clearFeedback();
    setCodeBusy(true);
    try {
      if (isPhone(normalizedAccount)) {
        await sendSmsOtp(normalizedAccount);
      } else {
        throw new Error(t("auth.error.invalidAccount"));
      }
      setOtpSent(true);
      setSentTo(normalizedAccount);
      setCodeCooldown(60);
      setNotice(t("auth.notice.otpSent"));
    } catch (authError) {
      setLocalError(formatAuthError(authError));
    } finally {
      setCodeBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      if (!accountIsValid) {
        throw new Error(t("auth.error.invalidAccount"));
      }

      if (mode === "signIn") {
        await signIn(normalizedAccount, password);
        return;
      }

      if (password.length < 6) throw new Error(t("auth.error.passwordLength"));
      if (password !== confirmPassword) throw new Error(t("auth.error.passwordMismatch"));

      if (accountIsEmail) {
        const result = await signUp(normalizedAccount, password);
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        if (result.needsEmailConfirmation) {
          setMode("signIn");
          setNotice(t("auth.notice.signupSubmitted"));
        } else {
          setNotice(t("auth.notice.registered"));
        }
        return;
      }

      if (!otpSent || sentTo !== normalizedAccount) throw new Error(t("auth.error.codeFirst"));
      if (!/^\d{6}$/.test(otp)) throw new Error(t("auth.error.codeFormat"));
      await verifySmsOtp(normalizedAccount, otp, "register", password);
      setNotice(t("auth.notice.registered"));
    } catch (authError) {
      setLocalError(formatAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    clearFeedback();
    setBusy(true);
    try {
      if (!isEmail(normalizedAccount)) throw new Error(t("auth.error.resetRequiresEmail"));
      await resetPassword(normalizedAccount);
      setNotice(t("auth.notice.resetSent"));
    } catch (authError) {
      setLocalError(formatAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  const codeButtonLabel = codeBusy
    ? t("auth.processing")
    : codeCooldown > 0
      ? t("auth.resendIn", { seconds: codeCooldown })
      : otpSent
        ? t("auth.resend")
        : t("auth.getOtp");

  return (
    <main className={["auth-screen", `auth-screen--${mode}`].join(" ")}>
      <div className="auth-locale">
        <LanguageToggle />
      </div>

      <section className="auth-brand" aria-label="NAVA">
        <NavaWordmark tone="ink" />
      </section>

      <div className="auth-form-region">
        <form className={["auth-form", `auth-form--${mode}`].join(" ")} key={mode} onSubmit={submit}>
          <header className="auth-form-head">
            <h1>{mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}</h1>
            <button
              className="auth-mode-icon"
              type="button"
              onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
              aria-label={mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
              title={mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
            >
              {mode === "signIn" ? <UserRoundPlus size={26} /> : <ArrowLeft size={26} />}
            </button>
          </header>

          <div className="auth-fields">
            <label className="field">
              <span className="field-label">{t("auth.emailPhone")}</span>
              <div className="input-wrap">
                <AccountIcon size={19} />
                <input
                  autoComplete="username"
                  inputMode={isPhone(account) ? "tel" : "email"}
                  value={account}
                  onChange={(event) => updateAccount(event.target.value)}
                  placeholder={t("auth.emailPhonePlaceholder")}
                />
              </div>
            </label>

            {mode === "signUp" && requiresSmsCode && (
              <label className="field">
                <span className="field-label">{t("auth.otp")}</span>
                <div className="input-wrap auth-code-wrap">
                  <KeyRound size={19} />
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={t("auth.otpPlaceholder")}
                  />
                  <button
                    className="auth-code-button"
                    type="button"
                    onClick={sendRegistrationCode}
                    disabled={codeBusy || codeCooldown > 0 || !normalizedAccount}
                  >
                    <Send size={15} />
                    <span>{codeButtonLabel}</span>
                  </button>
                </div>
              </label>
            )}

            {mode === "signUp" && !requiresSmsCode && (
              <div className="field">
                <span className="field-label">{t("auth.emailConfirmation")}</span>
                <div className="input-wrap auth-email-confirmation" role="status">
                  <MailCheck size={19} />
                  <span>{t("auth.emailConfirmationAction")}</span>
                </div>
              </div>
            )}

            <label className="field">
              <span className="field-label">{t("auth.password")}</span>
              <div className="input-wrap">
                <LockKeyhole size={19} />
                <input
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                />
                <button
                  className="auth-input-icon-button"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  title={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {mode === "signUp" && (
              <label className="field">
                <span className="field-label">{t("auth.confirmPassword")}</span>
                <div className="input-wrap">
                  <LockKeyhole size={19} />
                  <input
                    autoComplete="new-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t("auth.confirmPasswordPlaceholder")}
                  />
                  <button
                    className="auth-input-icon-button"
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={showConfirmPassword ? t("auth.hideConfirmPassword") : t("auth.showConfirmPassword")}
                    title={showConfirmPassword ? t("auth.hideConfirmPassword") : t("auth.showConfirmPassword")}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            )}
          </div>

          <div className="auth-feedback-slot" aria-live="polite">
            {feedbackError && <p className="error-text">{feedbackError}</p>}
            {!feedbackError && notice && (
              <p className="success-text">
                <CheckCircle2 size={15} />
                <span>{notice}</span>
              </p>
            )}
          </div>

          <button className="auth-submit" type="submit" disabled={!canSubmit}>
            <span>{busy ? t("auth.processing") : mode === "signIn" ? t("auth.enter") : t("auth.create")}</span>
            <ArrowRight size={19} />
          </button>

          {mode === "signIn" && (
            <button className="auth-forgot" type="button" onClick={handleResetPassword} disabled={busy || !normalizedAccount}>
              {t("auth.forgotPassword")}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
