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
import { useLocale } from "../i18n";
import {
  formatAuthError,
  isEmail,
  isOtpCodeValid,
  isPhone,
  otpLengthForAccount,
  type SocialAuthProvider,
} from "../services/auth";
import { isSmsRelayWarmupConfigured, warmSmsRelay } from "../services/smsRelayWarmup";
import { useAuth } from "../state/authContext";

type AuthMode = "signIn" | "signUp" | "reset";
type SignInMethod = "password" | "otp";
const socialProviders: SocialAuthProvider[] = ["wechat", "apple", "qq"];

function SocialBrandIcon({ provider }: { provider: SocialAuthProvider }) {
  const path = provider === "wechat"
    ? "M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"
    : provider === "apple"
      ? "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      : "M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673";

  return <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true"><path d={path} /></svg>;
}

export default function AuthScreen({
  transitionPending = false,
  onAuthenticated,
}: {
  transitionPending?: boolean;
  onAuthenticated?: () => void;
}) {
  const {
    signIn,
    signInWithSocial,
    sendLoginOtp,
    sendPasswordResetOtp,
    sendRegistrationOtp,
    verifyLoginOtp,
    verifyPasswordResetOtp,
    verifyRegistrationOtp,
    error,
    clearError,
  } = useAuth();
  const { locale, t } = useLocale();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("password");
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
  const [consentOpen, setConsentOpen] = useState(false);
  const [socialBusy, setSocialBusy] = useState<SocialAuthProvider | null>(null);
  const [smsRelayReady, setSmsRelayReady] = useState(() => !isSmsRelayWarmupConfigured());

  const normalizedAccount = account.trim();
  const accountIsEmail = isEmail(normalizedAccount);
  const accountIsPhone = isPhone(normalizedAccount);
  const accountIsValid = accountIsEmail || accountIsPhone;
  const otpLength = otpLengthForAccount(normalizedAccount);
  const otpIsValid = isOtpCodeValid(normalizedAccount, otp);
  const isOtpSignIn = mode === "signIn" && signInMethod === "otp";
  const requiresCode = mode === "reset" || mode === "signUp" || isOtpSignIn;
  const requiresPassword = mode === "reset" || mode === "signUp" || (mode === "signIn" && signInMethod === "password");
  const AccountIcon = accountIsPhone ? Phone : AtSign;
  const feedbackError = localError ?? error;
  const canSubmit =
    !busy &&
    !socialBusy &&
    !transitionPending &&
    accountIsValid &&
    (mode === "signIn"
      ? signInMethod === "password"
        ? Boolean(password)
        : otpSent && sentTo === normalizedAccount && otpIsValid
      : password.length >= 6 && Boolean(confirmPassword) && otpSent && sentTo === normalizedAccount && otpIsValid)
    && (mode !== "signUp" || acceptedTerms);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => setCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  useEffect(() => {
    if (!requiresCode || !isSmsRelayWarmupConfigured()) return;
    let active = true;
    setSmsRelayReady(false);
    void warmSmsRelay().then((ready) => {
      if (active) setSmsRelayReady(ready);
    });
    return () => {
      active = false;
    };
  }, [requiresCode]);

  function clearFeedback() {
    setNotice(null);
    setLocalError(null);
    clearError();
  }

  function switchMode(nextMode: AuthMode, nextSignInMethod: SignInMethod = "password") {
    if (nextMode === mode && nextSignInMethod === signInMethod) return;
    setMode(nextMode);
    setSignInMethod(nextSignInMethod);
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    setOtpSent(false);
    setSentTo("");
    setCodeCooldown(0);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAcceptedTerms(false);
    setConsentOpen(false);
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
    if (accountIsPhone && !smsRelayReady) return;
    clearFeedback();
    setCodeBusy(true);
    try {
      if (!accountIsValid) throw new Error(t("auth.error.invalidAccount"));
      if (accountIsPhone && !(await warmSmsRelay({ force: true }))) {
        throw new Error(t("auth.error.otpUnavailable"));
      }
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
        onAuthenticated?.();
        return;
      }

      if (password.length < 6) throw new Error(t("auth.error.passwordLength"));
      if (password !== confirmPassword) throw new Error(t("auth.error.passwordMismatch"));

      if (!otpSent || sentTo !== normalizedAccount) throw new Error(t("auth.error.codeFirst"));
      if (!otpIsValid) {
        throw new Error(t(accountIsPhone ? "auth.error.smsCodeFormat" : "auth.error.emailCodeFormat"));
      }
      if (mode === "signUp" && !acceptedTerms) {
        setConsentOpen(true);
        return;
      }
      if (mode === "reset") {
        await verifyPasswordResetOtp(normalizedAccount, otp, password);
        setNotice(t("auth.notice.passwordUpdated"));
      } else {
        await verifyRegistrationOtp(normalizedAccount, otp, password);
        onAuthenticated?.();
        setNotice(t("auth.notice.registered"));
      }
    } catch (authError) {
      setLocalError(formatAuthError(authError, t));
    } finally {
      setBusy(false);
    }
  }

  async function startSocialSignIn(provider: SocialAuthProvider) {
    if (socialBusy) return;
    clearFeedback();
    setSocialBusy(provider);
    try {
      await signInWithSocial(provider);
      onAuthenticated?.();
    } catch (authError) {
      setLocalError(formatAuthError(authError, t));
    } finally {
      setSocialBusy(null);
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
        <form className={["auth-form", `auth-form--${mode}`, isOtpSignIn ? "auth-form--signInOtp" : ""].filter(Boolean).join(" ")} key={`${mode}-${signInMethod}`} onSubmit={submit}>
          <header className="auth-form-head">
            <h1>{mode === "signIn" ? t("auth.signIn") : mode === "signUp" ? t("auth.signUp") : t("auth.setNewPassword")}</h1>
          </header>

          <div className="auth-fields">
            <div className="field">
              <div className="auth-field-heading">
                <label className="field-label" htmlFor="nava-auth-account">{t("auth.emailPhone")}</label>
                {(mode !== "signIn" || isOtpSignIn) && (
                  <button
                    className="auth-mode-icon auth-return-inline"
                    type="button"
                    onClick={() => switchMode("signIn")}
                    disabled={busy || transitionPending}
                  >
                    <ArrowLeft size={14} />
                    {t("auth.switchToSignIn")}
                  </button>
                )}
              </div>
              <div className="input-wrap">
                <AccountIcon size={19} />
                <input
                  id="nava-auth-account"
                  autoComplete="username"
                  inputMode={accountIsPhone ? "tel" : "email"}
                  value={account}
                  onChange={(event) => updateAccount(event.target.value)}
                  placeholder={t("auth.emailPhonePlaceholder")}
                />
              </div>
            </div>

            {requiresCode && (
              <label className="field">
                <span className="field-label">{t("auth.otp")}</span>
                <div className="input-wrap auth-code-wrap">
                  <KeyRound size={19} />
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={otpLength}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, otpLength))}
                    placeholder={t(accountIsPhone ? "auth.smsOtpPlaceholder" : "auth.emailOtpPlaceholder")}
                  />
                  <button
                    className="auth-code-button"
                    type="button"
                    onClick={sendCode}
                    disabled={codeBusy || codeCooldown > 0 || !accountIsValid || (accountIsPhone && !smsRelayReady)}
                  >
                    <Send size={15} />
                    <span>{codeButtonLabel}</span>
                  </button>
                </div>
              </label>
            )}

            {requiresPassword && (
              <div className="field">
                <div className="auth-field-heading">
                  <label className="field-label" htmlFor="nava-auth-password">
                    {mode === "reset" || mode === "signUp" ? t("auth.newPassword") : t("auth.password")}
                  </label>
                  {mode === "signIn" && signInMethod === "password" && (
                    <button className="auth-forgot" type="button" onClick={() => switchMode("reset")} disabled={busy || transitionPending}>
                      {t("auth.forgotPassword")}
                    </button>
                  )}
                </div>
                <div className="input-wrap">
                  <LockKeyhole size={19} />
                  <input
                    id="nava-auth-password"
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
              </div>
            )}

            {(mode === "reset" || mode === "signUp") && (
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
            <span>{busy || transitionPending ? t("auth.processing") : mode === "signIn" ? t("auth.enter") : mode === "signUp" ? t("auth.create") : t("auth.savePassword")}</span>
            <ArrowRight size={19} />
          </button>

          {mode === "signIn" && signInMethod === "password" && (
            <div className="auth-secondary-links">
              <button className="auth-method-switch" type="button" onClick={() => switchMode("signIn", "otp")} disabled={busy || transitionPending}>
                {t("auth.useOtp")}
              </button>
              <button
                className="auth-mode-icon"
                type="button"
                onClick={() => switchMode("signUp")}
                disabled={busy || transitionPending}
                aria-label={t("auth.switchToSignUp")}
                title={t("auth.switchToSignUp")}
              >
                {t("auth.switchToSignUp")}
              </button>
            </div>
          )}

          {mode === "signIn" && signInMethod === "password" && (
            <section className="auth-social" aria-label={t("auth.socialDivider")}>
              <div className="auth-social-divider"><span>{t("auth.socialDivider")}</span></div>
              <div className="auth-social-options">
                {socialProviders.map((provider) => (
                  <button
                    className={`auth-social-button auth-social-button--${provider}`}
                    type="button"
                    data-social-provider={provider}
                    key={provider}
                    disabled={Boolean(socialBusy) || busy || transitionPending}
                    aria-label={t(`auth.social.${provider}`)}
                    aria-busy={socialBusy === provider}
                    onClick={() => startSocialSignIn(provider)}
                  >
                    <span className="auth-social-icon"><SocialBrandIcon provider={provider} /></span>
                    <span>{t(`auth.social.${provider}`)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </form>
        {mode === "signUp" && (
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
      {consentOpen && <div className="auth-consent-dialog" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "协议确认" : "Agreement confirmation"}><div><header><strong>{locale === "zh" ? "请先确认协议" : "Review agreements"}</strong><button type="button" onClick={() => setConsentOpen(false)}>×</button></header><p>{locale === "zh" ? "继续注册即表示你已阅读并同意《用户协议》和《隐私政策》。" : "Continue only after reviewing the User Agreement and Privacy Policy."}</p><nav><a href="./terms.html" target="_blank" rel="noreferrer">{locale === "zh" ? "用户协议" : "User Agreement"}</a><a href="./privacy.html" target="_blank" rel="noreferrer">{locale === "zh" ? "隐私政策" : "Privacy Policy"}</a></nav><button type="button" onClick={() => { setAcceptedTerms(true); setConsentOpen(false); }}>{locale === "zh" ? "同意并继续" : "Agree and continue"}</button></div></div>}
    </main>
  );
}
