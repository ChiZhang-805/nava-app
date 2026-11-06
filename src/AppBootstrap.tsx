import { Activity } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import LivingBackground from "./components/LivingBackground";
import PageSkeleton from "./components/PageSkeleton";
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

function BootstrapStage({
  children,
  onFirstLoginPreview,
}: {
  children: ReactNode;
  onFirstLoginPreview: () => void;
}) {
  return (
    <div className="nava-app-stage">
      <LivingBackground />
      {children}
      <DesktopDevicePreviewChrome onFirstLoginPreview={onFirstLoginPreview} />
    </div>
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

  if (forceAuthSkeleton) return <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>{firstLoginPreview ?? <AuthLoadingScreen />}</BootstrapStage>;
  if (configError && !isDemoMode()) return <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>{firstLoginPreview ?? <ConfigErrorScreen message={configError} />}</BootstrapStage>;
  if (loading) return <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>{firstLoginPreview ?? <AuthLoadingScreen />}</BootstrapStage>;

  return (
    <>
      {!user && (
        <BootstrapStage onFirstLoginPreview={openFirstLoginPreview}>
          {firstLoginPreview ?? <AuthScreen onAuthenticated={() => setFreshAuthentication(true)} />}
        </BootstrapStage>
      )}
      {user && (
        <Suspense fallback={<BootstrapStage onFirstLoginPreview={openFirstLoginPreview}><LoadingScreen /></BootstrapStage>}>
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
