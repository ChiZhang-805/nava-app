import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Phone,
  Send,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import LanguageToggle from "../components/LanguageToggle";
import NavaWordmark from "../components/NavaWordmark";
import { useT } from "../i18n";
import { formatAuthError, isEmail, isPhone } from "../services/auth";
import { useAuth } from "../state/authContext";

type AuthMode = "signIn" | "signUp" | "reset";
type SignInMethod = "password" | "otp";

export default function AuthScreen() {
  const {
    signIn,
    sendLoginOtp,
    sendPasswordResetOtp,
    sendRegistrationOtp,
    verifyLoginOtp,
    verifyPasswordResetOtp,
    verifyRegistrationOtp,
    error,
    clearError,
  } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("password");
  const [signUpStep, setSignUpStep] = useState<1 | 2>(1);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const normalizedAccount = account.trim();
  const accountIsEmail = isEmail(normalizedAccount);
  const accountIsPhone = isPhone(normalizedAccount);
  const accountIsValid = accountIsEmail || accountIsPhone;
  const isOtpSignIn = mode === "signIn" && signInMethod === "otp";
  const requiresCode = mode === "reset" || isOtpSignIn || (mode === "signUp" && signUpStep === 1);
  const requiresPassword = mode === "reset" || (mode === "signUp" && signUpStep === 2) || (mode === "signIn" && signInMethod === "password");
  const showsAccount = mode !== "signUp" || signUpStep === 1;
  const AccountIcon = accountIsPhone ? Phone : AtSign;
  const feedbackError = localError ?? error;
  const canSubmit =
    !busy &&
    accountIsValid &&
    (mode === "signIn"
      ? signInMethod === "password"
        ? Boolean(password)
        : otpSent && sentTo === normalizedAccount && /^\d{6}$/.test(otp)
      : mode === "signUp" && signUpStep === 1
        ? otpSent && sentTo === normalizedAccount && /^\d{6}$/.test(otp) && acceptedTerms
        : password.length >= 6 &&
          Boolean(confirmPassword) &&
          otpSent &&
          sentTo === normalizedAccount &&
          /^\d{6}$/.test(otp) &&
          (mode !== "signUp" || acceptedTerms));

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
    setSignInMethod("password");
    setSignUpStep(1);
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    setOtpSent(false);
    setSentTo("");
    setCodeCooldown(0);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAcceptedTerms(false);
    clearFeedback();
  }

  function switchSignInMethod() {
    setSignInMethod((current) => current === "password" ? "otp" : "password");
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setSentTo("");
    setCodeCooldown(0);
    setShowPassword(false);
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

  async function sendCode() {
    if (codeBusy || codeCooldown > 0) return;
    clearFeedback();
    setCodeBusy(true);
    try {
      if (!accountIsValid) throw new Error(t("auth.error.invalidAccount"));
      const channel = mode === "reset"
        ? await sendPasswordResetOtp(normalizedAccount)
        : isOtpSignIn
          ? await sendLoginOtp(normalizedAccount)
          : await sendRegistrationOtp(normalizedAccount);
      setOtpSent(true);
      setSentTo(normalizedAccount);
      setCodeCooldown(60);
      setNotice(t(channel === "email" ? "auth.notice.emailOtpSent" : "auth.notice.smsOtpSent"));
    } catch (authError) {
      setLocalError(formatAuthError(authError, t));
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
        if (signInMethod === "otp") await verifyLoginOtp(normalizedAccount, otp);
        else await signIn(normalizedAccount, password);
        return;
      }

      if (mode === "signUp" && signUpStep === 1) {
        if (!otpSent || sentTo !== normalizedAccount) throw new Error(t("auth.error.codeFirst"));
        if (!/^\d{6}$/.test(otp)) throw new Error(t("auth.error.codeFormat"));
        if (!acceptedTerms) throw new Error(t("auth.error.acceptAgreement"));
        setSignUpStep(2);
        return;
      }

      if (password.length < 6) throw new Error(t("auth.error.passwordLength"));
      if (password !== confirmPassword) throw new Error(t("auth.error.passwordMismatch"));

      if (!otpSent || sentTo !== normalizedAccount) throw new Error(t("auth.error.codeFirst"));
      if (!/^\d{6}$/.test(otp)) throw new Error(t("auth.error.codeFormat"));
      if (mode === "signUp" && !acceptedTerms) throw new Error(t("auth.error.acceptAgreement"));
      if (mode === "reset") {
        await verifyPasswordResetOtp(normalizedAccount, otp, password);
        setNotice(t("auth.notice.passwordUpdated"));
      } else {
        await verifyRegistrationOtp(normalizedAccount, otp, password);
        setNotice(t("auth.notice.registered"));
      }
    } catch (authError) {
      setLocalError(formatAuthError(authError, t));
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
        <form className={["auth-form", `auth-form--${mode}`, isOtpSignIn ? "auth-form--signInOtp" : "", mode === "signUp" ? `auth-form--signUpStep${signUpStep}` : ""].filter(Boolean).join(" ")} key={`${mode}-${signInMethod}-${signUpStep}`} onSubmit={submit}>
          <header className="auth-form-head">
            <h1>{mode === "signIn" ? t("auth.signIn") : mode === "signUp" ? t("auth.signUp") : t("auth.setNewPassword")}</h1>
          </header>

          <div className="auth-fields">
            {showsAccount && <label className="field">
              <span className="field-label">{t("auth.emailPhone")}</span>
              <div className="input-wrap">
                <AccountIcon size={19} />
                <input
                  autoComplete="username"
                  inputMode={accountIsPhone ? "tel" : "email"}
                  value={account}
                  onChange={(event) => updateAccount(event.target.value)}
                  placeholder={t("auth.emailPhonePlaceholder")}
                />
              </div>
            </label>}

            {requiresCode && (
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
                    onClick={sendCode}
                    disabled={codeBusy || codeCooldown > 0 || !accountIsValid}
                  >
                    <Send size={15} />
                    <span>{codeButtonLabel}</span>
                  </button>
                </div>
              </label>
            )}

            {requiresPassword && (
              <label className="field">
                <span className="field-label">{mode === "reset" ? t("auth.setNewPassword") : t("auth.password")}</span>
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
            )}

            {mode !== "signIn" && (mode !== "signUp" || signUpStep === 2) && (
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
            <span>{busy ? t("auth.processing") : mode === "signIn" ? t("auth.enter") : mode === "signUp" && signUpStep === 1 ? t("auth.next") : mode === "signUp" ? t("auth.create") : t("auth.savePassword")}</span>
            <ArrowRight size={19} />
          </button>

          <div className="auth-secondary-links">
            {mode === "signIn" && (
              <button className="auth-method-switch" type="button" onClick={switchSignInMethod} disabled={busy}>
                {t(signInMethod === "password" ? "auth.useOtp" : "auth.usePassword")}
              </button>
            )}
            <button
              className="auth-mode-icon"
              type="button"
              onClick={() => {
                if (mode === "signUp" && signUpStep === 2) setSignUpStep(1);
                else switchMode(mode === "signIn" ? "signUp" : "signIn");
              }}
              aria-label={mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
              title={mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
            >
              {mode === "signIn" ? t("auth.switchToSignUp") : <><ArrowLeft size={14} />{t("auth.switchToSignIn")}</>}
            </button>
          </div>

          {mode === "signIn" && (
            <button className="auth-forgot" type="button" onClick={() => switchMode("reset")} disabled={busy}>
              {t("auth.forgotPassword")}
            </button>
          )}
        </form>
        {mode === "signUp" && signUpStep === 1 && (
          <label className="auth-consent auth-consent--screen">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
            />
            <span>{t("auth.agreement")}</span>
          </label>
        )}
      </div>
    </main>
  );
}
