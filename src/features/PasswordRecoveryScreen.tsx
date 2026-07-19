import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import LanguageToggle from "../components/LanguageToggle";
import NavaWordmark from "../components/NavaWordmark";
import { useT } from "../i18n";
import { formatAuthError } from "../services/auth";
import { useAuth } from "../state/authContext";

export default function PasswordRecoveryScreen() {
  const { clearError, error, finishPasswordRecovery } = useAuth();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    clearError();
    setBusy(true);
    try {
      if (password.length < 6) throw new Error(t("auth.error.passwordLength"));
      if (password !== confirmPassword) throw new Error(t("auth.error.passwordMismatch"));
      await finishPasswordRecovery(password);
      setNotice(t("auth.notice.passwordUpdated"));
    } catch (recoveryError) {
      setLocalError(formatAuthError(recoveryError, t));
    } finally {
      setBusy(false);
    }
  }

  const feedbackError = localError ?? error;
  const canSubmit = !busy && password.length >= 6 && Boolean(confirmPassword);

  return (
    <main className="auth-screen auth-screen--signIn">
      <div className="auth-locale">
        <LanguageToggle />
      </div>

      <section className="auth-brand" aria-label="NAVA">
        <NavaWordmark tone="ink" />
      </section>

      <div className="auth-form-region">
        <form className="auth-form auth-form--signIn" onSubmit={submit}>
          <header className="auth-form-head">
            <h1>{t("auth.setNewPassword")}</h1>
          </header>

          <div className="auth-fields">
            <label className="field">
              <span className="field-label">{t("auth.password")}</span>
              <div className="input-wrap">
                <LockKeyhole size={19} />
                <input
                  autoComplete="new-password"
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
            <span>{busy ? t("auth.processing") : t("auth.savePassword")}</span>
            <ArrowRight size={19} />
          </button>
        </form>
      </div>
    </main>
  );
}
