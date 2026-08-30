import { Activity } from "lucide-react";
import { lazy, Suspense, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import { LocaleProvider, useT } from "./i18n";
import { isDemoMode } from "./services/demo";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";

const AuthenticatedApp = lazy(() => import("./App"));

function LoadingScreen() {
  const t = useT();

  return (
    <main className="app-screen centered-screen">
      <div className="brand-mark">
        <Activity size={28} />
      </div>
      <h1>NAVA</h1>
      <p className="muted">{t("app.loading")}</p>
    </main>
  );
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

  if (!loading && !user) signedOutScreenSeen.current = true;

  if (configError && !isDemoMode()) return <ConfigErrorScreen message={configError} />;
  if (loading) return <LoadingScreen />;
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
