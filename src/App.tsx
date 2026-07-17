import { Activity, Bot, ChartNoAxesColumn, ClipboardPlus, Home, UserRound } from "lucide-react";
import { useState } from "react";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import TodayScreen from "./features/TodayScreen";
import RecordsScreen from "./features/RecordsScreen";
import AIScreen from "./features/AIScreen";
import TrendsScreen from "./features/TrendsScreen";
import ProfileScreen from "./features/ProfileScreen";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import { useEffect } from "react";
import { saveFocusSession, saveMoodRecord } from "./services/records";
import { subscribeWatchActions } from "./services/watch";
import ErrorBoundary from "./components/ErrorBoundary";
import NetworkBadge from "./components/NetworkBadge";
import type { AppTab } from "./types";

const tabs: Array<{ id: AppTab; label: string; icon: typeof Home }> = [
  { id: "today", label: "今日", icon: Home },
  { id: "record", label: "记录", icon: ClipboardPlus },
  { id: "ai", label: "AI", icon: Bot },
  { id: "trends", label: "趋势", icon: ChartNoAxesColumn },
  { id: "profile", label: "我的", icon: UserRound },
];

function LoadingScreen() {
  return (
    <main className="app-screen centered-screen">
      <div className="brand-mark">
        <Activity size={28} />
      </div>
      <h1>NAVA</h1>
      <p className="muted">正在恢复账号状态</p>
    </main>
  );
}

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main className="app-screen centered-screen">
      <div className="brand-mark warn">
        <Activity size={28} />
      </div>
      <h1>需要配置 Supabase</h1>
      <p className="muted">{message}</p>
      <code className="code-card">copy .env.example .env</code>
    </main>
  );
}

function MobileShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [refreshKey, setRefreshKey] = useState(0);

  const markChanged = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    subscribeWatchActions(async (action) => {
      if (!alive) return;
      try {
        if (action.type === "mood.quickLog") {
          await saveMoodRecord({
            userId: user.id,
            moodScore: action.mood,
            factors: ["Apple Watch"],
            diary: "来自 Apple Watch 快捷记录",
          });
          setRefreshKey((value) => value + 1);
        }
        if (action.type === "focus.stop") {
          await saveFocusSession({
            userId: user.id,
            taskTitle: action.taskTitle ?? "Apple Watch 专注",
            minutes: action.durationMinutes && action.durationMinutes > 0 ? Math.round(action.durationMinutes) : 25,
          });
          setRefreshKey((value) => value + 1);
        }
      } catch (e) {
        console.error("watch action failed", e);
      }
    }).then((handle) => {
      if (!alive) void handle?.remove();
    });
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="phone-frame">
      <div className="safe-top" />
      <header className="app-header">
        <div>
          <p className="eyebrow">NAVA Health</p>
          <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
        </div>
        <div className="header-actions">
          <NetworkBadge />
          <div className="avatar">{user.email?.slice(0, 1).toUpperCase() ?? "N"}</div>
        </div>
      </header>

      <main className="app-content">
        {activeTab === "today" && <TodayScreen user={user} refreshKey={refreshKey} onOpenRecord={() => setActiveTab("record")} />}
        {activeTab === "record" && <RecordsScreen user={user} onSaved={markChanged} />}
        {activeTab === "ai" && <AIScreen user={user} />}
        {activeTab === "trends" && <TrendsScreen user={user} refreshKey={refreshKey} />}
        {activeTab === "profile" && <ProfileScreen user={user} onChanged={markChanged} />}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              className={selected ? "nav-button selected" : "nav-button"}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={selected ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AppContent() {
  const configError = assertConfig();
  const { user, loading } = useAuth();

  if (configError) return <ConfigErrorScreen message={configError} />;
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  return <MobileShell />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
