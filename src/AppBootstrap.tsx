import { Activity } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import { LocaleProvider, useT } from "./i18n";
import { isDemoMode } from "./services/demo";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import LoadingShell from "./components/LoadingShell";
import PageSkeleton from "./components/PageSkeleton";
import DesktopDevicePreviewChrome from "./components/DesktopDevicePreviewChrome";

const loadAuthenticatedApp = () => import("./App");
const AuthenticatedApp = lazy(loadAuthenticatedApp);

function LoadingScreen() {
  return <LoadingShell />;
}

function AuthLoadingScreen() {
  return <main className="auth-screen auth-loading-screen"><PageSkeleton variant="auth" /></main>;
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
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [freshAuthentication, setFreshAuthentication] = useState(false);
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
    if (!user) setReadyUserId(null);
  }, [user]);

  const markAuthenticatedAppReady = useCallback((userId: string) => {
    setReadyUserId((current) => current === userId ? current : userId);
  }, []);

  if (forceAuthSkeleton) return <div className="nava-app-stage"><AuthLoadingScreen /><DesktopDevicePreviewChrome /></div>;
  if (configError && !isDemoMode()) return <div className="nava-app-stage"><ConfigErrorScreen message={configError} /><DesktopDevicePreviewChrome /></div>;
  if (loading) return <div className="nava-app-stage"><AuthLoadingScreen /><DesktopDevicePreviewChrome /></div>;

  const authenticatedAppReady = Boolean(user && readyUserId === user.id);
  const preserveSubmittedAuthScreen = Boolean(user && !authenticatedAppReady && signedOutScreenSeen.current);
  const showSessionRestoreLoading = Boolean(user && !authenticatedAppReady && !signedOutScreenSeen.current);

  return (
    <>
      {(!user || preserveSubmittedAuthScreen) && (
        <div className="nava-app-stage">
          <AuthScreen transitionPending={preserveSubmittedAuthScreen} onAuthenticated={() => setFreshAuthentication(true)} />
          <DesktopDevicePreviewChrome />
        </div>
      )}
      {showSessionRestoreLoading && (
        <div className="nava-app-stage">
          <LoadingScreen />
          <DesktopDevicePreviewChrome />
        </div>
      )}
      {user && (
        <div
          className="authenticated-app-gate"
          hidden={!authenticatedAppReady}
          aria-hidden={!authenticatedAppReady}
        >
          <Suspense fallback={null}>
            <AuthenticatedApp
              signedOutScreenSeen={signedOutScreenSeen.current}
              showInitialHomeGuidance={freshAuthentication}
              onReady={markAuthenticatedAppReady}
            />
          </Suspense>
        </div>
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
