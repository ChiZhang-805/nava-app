import { Activity } from "lucide-react";
import { lazy, Suspense, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import { LocaleProvider, useT } from "./i18n";
import { isDemoMode } from "./services/demo";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import LoadingShell from "./components/LoadingShell";
import PageSkeleton from "./components/PageSkeleton";

const AuthenticatedApp = lazy(() => import("./App"));

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
  const forceAuthSkeleton = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "auth-skeleton";

  if (!loading && !user) signedOutScreenSeen.current = true;

  if (forceAuthSkeleton) return <AuthLoadingScreen />;
  if (configError && !isDemoMode()) return <ConfigErrorScreen message={configError} />;
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <AuthScreen />;

  return (
    <Suspense fallback={signedOutScreenSeen.current ? <AuthScreen transitionPending /> : <LoadingScreen />}>
      <AuthenticatedApp signedOutScreenSeen={signedOutScreenSeen.current} />
    </Suspense>
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
