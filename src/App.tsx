import { Activity, Bot, ChartNoAxesColumn, ClipboardPlus, Home, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import TodayScreen from "./features/TodayScreen";
import RecordsScreen from "./features/RecordsScreen";
import AIScreen from "./features/AIScreen";
import TrendsScreen from "./features/TrendsScreen";
import ProfileScreen from "./features/ProfileScreen";
import PasswordRecoveryScreen from "./features/PasswordRecoveryScreen";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import { enqueueAndFlushWatchAction, flushPendingWatchActions, subscribeWatchActions } from "./services/watch";
import ErrorBoundary from "./components/ErrorBoundary";
import LanguageToggle from "./components/LanguageToggle";
import LaunchSequence from "./components/LaunchSequence";
import LivingBackground from "./components/LivingBackground";
import NetworkBadge from "./components/NetworkBadge";
import { LocaleProvider, useT, type TranslationKey } from "./i18n";
import type { AppTab } from "./types";
import { isDemoMode } from "./services/demo";

const tabs: Array<{ id: AppTab; labelKey: TranslationKey; icon: typeof Home }> = [
  { id: "today", labelKey: "tabs.today", icon: Home },
  { id: "record", labelKey: "tabs.record", icon: ClipboardPlus },
  { id: "ai", labelKey: "tabs.ai", icon: Bot },
  { id: "trends", labelKey: "tabs.trends", icon: ChartNoAxesColumn },
  { id: "profile", labelKey: "tabs.profile", icon: UserRound },
];

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

function MobileShell() {
  const { user } = useAuth();
  const t = useT();
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const contentRef = useRef<HTMLElement | null>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTab);

  const markChanged = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let listenerHandle: Awaited<ReturnType<typeof subscribeWatchActions>> = null;
    void flushPendingWatchActions().then(() => {
      if (alive) setRefreshKey((value) => value + 1);
    }).catch((syncError) => console.warn("pending watch actions remain queued", syncError));
    subscribeWatchActions(async (action) => {
      if (!alive) return;
      try {
        await enqueueAndFlushWatchAction(action);
        setRefreshKey((value) => value + 1);
      } catch (e) {
        console.warn("watch action remains queued", e);
      }
    }).then((handle) => {
      if (!alive) void handle?.remove();
      else listenerHandle = handle;
    });
    return () => {
      alive = false;
      void listenerHandle?.remove();
    };
  }, [user]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  if (!user) return null;

  return (
    <div className="phone-frame">
      <div className="safe-top" />
      <header className="app-header">
        <div>
          <p className="eyebrow">NAVA</p>
          <h1>{currentTab ? t(currentTab.labelKey) : ""}</h1>
        </div>
        <div className="header-actions">
          <LanguageToggle />
          <NetworkBadge />
          <div className="avatar">{user.email?.slice(0, 1).toUpperCase() ?? "N"}</div>
        </div>
      </header>

      <main
        className={["app-content", activeTab === "ai" ? "app-content--chat" : ""].filter(Boolean).join(" ")}
        ref={contentRef}
      >
        <div className="screen-panel" key={activeTab}>
          {activeTab === "today" && <TodayScreen user={user} refreshKey={refreshKey} onOpenRecord={() => setActiveTab("record")} />}
          {activeTab === "record" && <RecordsScreen user={user} onSaved={markChanged} />}
          {activeTab === "ai" && <AIScreen user={user} />}
          {activeTab === "trends" && <TrendsScreen user={user} refreshKey={refreshKey} />}
          {activeTab === "profile" && <ProfileScreen user={user} onChanged={markChanged} />}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          const isAiTab = tab.id === "ai";
          return (
            <button
              className={["nav-button", selected ? "selected" : "", isAiTab ? "ai-nav-button" : ""].filter(Boolean).join(" ")}
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={selected ? "page" : undefined}
            >
              {isAiTab ? (
                <span className="ai-nav-orb" aria-hidden="true">
                  <span className="ai-nav-glow" />
                  <Sparkles size={22} />
                </span>
              ) : (
                <Icon size={20} />
              )}
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AppContent() {
  const configError = assertConfig();
  const { user, loading, passwordRecovery } = useAuth();

  let screen;
  if (configError && !isDemoMode()) screen = <ConfigErrorScreen message={configError} />;
  else if (loading) screen = <LoadingScreen />;
  else if (user && passwordRecovery) screen = <PasswordRecoveryScreen />;
  else if (!user) screen = <AuthScreen />;
  else screen = <MobileShell />;

  return (
    <div className="nava-app-stage">
      <LivingBackground />
      <LaunchSequence />
      {screen}
    </div>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
