import { Activity } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import OnboardingScreen from "./features/OnboardingScreen";
import { LocaleProvider, useT } from "./i18n";
import { isDemoMode } from "./services/demo";
import { SOCIAL_AUTH_RETURN_KEY } from "./services/auth";
import type { OnboardingStatus } from "./services/onboarding";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import DesktopDevicePreviewChrome from "./components/DesktopDevicePreviewChrome";

const loadAuthenticatedApp = () => import("./App");
const AuthenticatedApp = lazy(loadAuthenticatedApp);
const firstLoginPreviewStatus: OnboardingStatus = {
  completed: false,
  completedAt: null,
  version: 3,
  answers: {},
  source: "none",
};

type NavaNativeAuthMessageWindow = Window & {
  webkit?: {
    messageHandlers?: {
      navaAuthState?: {
        postMessage: (message: { authenticated: boolean; loading: boolean }) => void;
      };
    };
  };
};

function hasRecentSocialAuthReturn() {
  const startedAt = Number(window.sessionStorage.getItem(SOCIAL_AUTH_RETURN_KEY));
  return Number.isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000;
}

function ConfigErrorScreen({ message }: { message: string }) {
  const t = useT();

  return (
    <main className="app-screen centered-screen">
      <div className="brand-mark warn">
        <Activity size={28} />
      </div>
      <h1>{t("app.configTitle")}</h1>
      <p className="muted">{message}</p>
      <code className="code-card">copy .env.example .env</code>
    </main>
  );
}

function BootstrapStage({
  children,
  onFirstLoginPreview,
}: {
  children: ReactNode;
  onFirstLoginPreview: () => void;
}) {
  return (
    <div className="nava-app-stage">
      {children}
      <DesktopDevicePreviewChrome onFirstLoginPreview={onFirstLoginPreview} />
    </div>
  );
}

function BootstrapContent() {
  const configError = assertConfig();
  const { user, loading } = useAuth();
  const isNativePlatform = Capacitor.isNativePlatform();
  const [freshAuthentication, setFreshAuthentication] = useState(false);
  const [preparedUserId, setPreparedUserId] = useState<string | null>(null);
  const [sessionUnlocked, setSessionUnlocked] = useState(() => !isNativePlatform || hasRecentSocialAuthReturn());
  const [firstLoginPreviewOpen, setFirstLoginPreviewOpen] = useState(false);
  const [firstLoginPreviewKey, setFirstLoginPreviewKey] = useState(0);
  const authenticated = Boolean(user && sessionUnlocked);
  const appUser = !loading && sessionUnlocked ? user : null;
  const appUserId = appUser?.id;
  const preparingApp = appUser !== null && preparedUserId !== appUser.id;

  useEffect(() => {
    if (!appUserId) setPreparedUserId(null);
  }, [appUserId]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const lockSession = () => {
      setPreparedUserId(null);
      setSessionUnlocked(false);
    };
    const unlockSocialSession = () => {
      setFreshAuthentication(true);
      setSessionUnlocked(true);
    };
    window.addEventListener("nava:native-lock", lockSession);
    window.addEventListener("nava:social-auth-complete", unlockSocialSession);
    // iOS can temporarily resign active while a system picker is open.
    const pauseListener = CapacitorApp.addListener("pause", lockSession);
    return () => {
      window.removeEventListener("nava:native-lock", lockSession);
      window.removeEventListener("nava:social-auth-complete", unlockSocialSession);
      void pauseListener.then((listener) => listener.remove());
    };
  }, [isNativePlatform]);

  useEffect(() => {
    if (!isNativePlatform || loading || !window.sessionStorage.getItem(SOCIAL_AUTH_RETURN_KEY)) return;
    window.sessionStorage.removeItem(SOCIAL_AUTH_RETURN_KEY);
    if (!user) setSessionUnlocked(false);
  }, [isNativePlatform, loading, user]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const handler = (window as NavaNativeAuthMessageWindow).webkit?.messageHandlers?.navaAuthState;
    handler?.postMessage({ authenticated, loading });
  }, [authenticated, isNativePlatform, loading]);

  useEffect(() => {
    if (loading || user) return;
    const preloadTimer = window.setTimeout(() => {
      void loadAuthenticatedApp().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(preloadTimer);
  }, [loading, user]);

  useEffect(() => {
    if (user) setFirstLoginPreviewOpen(false);
  }, [user]);

  const openFirstLoginPreview = useCallback(() => {
    setFirstLoginPreviewKey((value) => value + 1);
    setFirstLoginPreviewOpen(true);
  }, []);
  const firstLoginPreview = firstLoginPreviewOpen ? (
    <OnboardingScreen
      key={`signed-out-first-login-preview-${firstLoginPreviewKey}`}
      user={{ id: "desktop-first-login-preview" }}
      status={firstLoginPreviewStatus}
      mode="first"
      previewOnly
      onComplete={() => setFirstLoginPreviewOpen(false)}
    />
  ) : null;

  if (configError && !isDemoMode()) return <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>{firstLoginPreview ?? <ConfigErrorScreen message={configError} />}</BootstrapStage>;

  return (
    <>
      {(!appUser || preparingApp) && (
        <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>
          {firstLoginPreview ?? <AuthScreen transitionPending={preparingApp} onAuthenticated={() => {
            setFreshAuthentication(true);
            setSessionUnlocked(true);
          }} />}
        </BootstrapStage>
      )}
      {appUser && (
        <Suspense fallback={null}>
          <AuthenticatedApp
            key={appUser.id}
            preparing={preparingApp}
            onReady={setPreparedUserId}
            showInitialHomeGuidance={freshAuthentication}
          />
        </Suspense>
      )}
    </>
  );
}

export default function AppBootstrap() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        <AuthProvider>
          <BootstrapContent />
        </AuthProvider>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
