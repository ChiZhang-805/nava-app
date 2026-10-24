import { Activity } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import OnboardingScreen from "./features/OnboardingScreen";
import { LocaleProvider, useT } from "./i18n";
import { isDemoMode } from "./services/demo";
import type { OnboardingStatus } from "./services/onboarding";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import LoadingShell from "./components/LoadingShell";
import NavaLoadingScene from "./components/NavaLoadingScene";
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

function LoadingScreen() {
  return <LoadingShell />;
}

function AuthLoadingScreen() {
  return <main className="auth-screen auth-loading-screen"><NavaLoadingScene /></main>;
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

function BootstrapContent() {
  const configError = assertConfig();
  const { user, loading } = useAuth();
  const signedOutScreenSeen = useRef(false);
  const [freshAuthentication, setFreshAuthentication] = useState(false);
  const [firstLoginPreviewOpen, setFirstLoginPreviewOpen] = useState(false);
  const [firstLoginPreviewKey, setFirstLoginPreviewKey] = useState(0);
  const forceAuthSkeleton = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "auth-skeleton";

  if (!loading && !user) signedOutScreenSeen.current = true;

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

  if (forceAuthSkeleton) return <div className="nava-app-stage">{firstLoginPreview ?? <AuthLoadingScreen />}<DesktopDevicePreviewChrome onFirstLoginPreview={openFirstLoginPreview} /></div>;
  if (configError && !isDemoMode()) return <div className="nava-app-stage">{firstLoginPreview ?? <ConfigErrorScreen message={configError} />}<DesktopDevicePreviewChrome onFirstLoginPreview={openFirstLoginPreview} /></div>;
  if (loading) return <div className="nava-app-stage">{firstLoginPreview ?? <AuthLoadingScreen />}<DesktopDevicePreviewChrome onFirstLoginPreview={openFirstLoginPreview} /></div>;

  return (
    <>
      {!user && (
        <div className="nava-app-stage">
          {firstLoginPreview ?? <AuthScreen onAuthenticated={() => setFreshAuthentication(true)} />}
          <DesktopDevicePreviewChrome onFirstLoginPreview={openFirstLoginPreview} />
        </div>
      )}
      {user && (
        <Suspense fallback={<div className="nava-app-stage"><LoadingScreen /><DesktopDevicePreviewChrome onFirstLoginPreview={openFirstLoginPreview} /></div>}>
            <AuthenticatedApp
              signedOutScreenSeen={signedOutScreenSeen.current}
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
