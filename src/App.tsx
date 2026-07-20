import { Activity, Bot, ChartNoAxesColumn, ClipboardPlus, Home, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
  const [voiceRequestId, setVoiceRequestId] = useState(0);
  const [voiceRelease, setVoiceRelease] = useState({ id: 0, cancelled: false });
  const [voiceGestureActive, setVoiceGestureActive] = useState(false);
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [aiPressing, setAiPressing] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const aiLongPressTimerRef = useRef<number | null>(null);
  const aiLongPressTriggeredRef = useRef(false);
  const aiGesturePointerActiveRef = useRef(false);
  const aiPressStartYRef = useRef(0);
  const aiLatestYRef = useRef(0);
  const voiceCancelArmedRef = useRef(false);
  const currentTab = tabs.find((tab) => tab.id === activeTab);

  const markChanged = () => setRefreshKey((value) => value + 1);

  const clearAiLongPressTimer = () => {
    if (aiLongPressTimerRef.current !== null) {
      window.clearTimeout(aiLongPressTimerRef.current);
      aiLongPressTimerRef.current = null;
    }
    setAiPressing(false);
  };

  const beginAiLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    aiLongPressTriggeredRef.current = false;
    aiGesturePointerActiveRef.current = true;
    aiPressStartYRef.current = event.clientY;
    aiLatestYRef.current = event.clientY;
    voiceCancelArmedRef.current = false;
    setVoiceCancelArmed(false);
    setAiPressing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    aiLongPressTimerRef.current = window.setTimeout(() => {
      aiLongPressTimerRef.current = null;
      aiLongPressTriggeredRef.current = true;
      const cancelArmed = aiPressStartYRef.current - aiLatestYRef.current >= 64;
      voiceCancelArmedRef.current = cancelArmed;
      setVoiceCancelArmed(cancelArmed);
      setVoiceGestureActive(true);
      setAiPressing(false);
      setActiveTab("ai");
      setVoiceRequestId((value) => value + 1);
      navigator.vibrate?.(20);
    }, 560);
  };

  const moveAiLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!aiGesturePointerActiveRef.current) return;
    aiLatestYRef.current = event.clientY;
    if (!aiLongPressTriggeredRef.current) return;
    const nextCancelArmed = aiPressStartYRef.current - event.clientY >= 64;
    if (nextCancelArmed === voiceCancelArmedRef.current) return;
    voiceCancelArmedRef.current = nextCancelArmed;
    setVoiceCancelArmed(nextCancelArmed);
    navigator.vibrate?.(nextCancelArmed ? 12 : 6);
  };

  const endAiLongPress = (forceCancel = false) => {
    if (!aiGesturePointerActiveRef.current) return;
    aiGesturePointerActiveRef.current = false;
    const completedVoiceGesture = aiLongPressTriggeredRef.current;
    clearAiLongPressTimer();
    if (completedVoiceGesture) {
      const cancelled = forceCancel || voiceCancelArmedRef.current;
      setVoiceRelease((current) => ({ id: current.id + 1, cancelled }));
      setVoiceGestureActive(false);
      setVoiceCancelArmed(false);
      voiceCancelArmedRef.current = false;
    }
  };

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let listenerHandle: Awaited<ReturnType<typeof subscribeWatchActions>> = null;
    void flushPendingWatchActions(user.id).then(() => {
      if (alive) setRefreshKey((value) => value + 1);
    }).catch((syncError) => console.warn("pending watch actions remain queued", syncError));
    subscribeWatchActions(async (action) => {
      if (!alive) return;
      try {
        await enqueueAndFlushWatchAction(user.id, action);
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
        className={[
          "app-content",
          activeTab === "today" ? "app-content--today" : "",
          activeTab === "ai" ? "app-content--chat" : "",
          activeTab === "record" ? "app-content--record" : "",
          activeTab === "trends" ? "app-content--trends" : "",
        ].filter(Boolean).join(" ")}
        ref={contentRef}
      >
        <div className="screen-panel" key={activeTab}>
          {activeTab === "today" && <TodayScreen user={user} refreshKey={refreshKey} onOpenRecord={() => setActiveTab("record")} />}
          {activeTab === "record" && <RecordsScreen user={user} onSaved={markChanged} />}
          {activeTab === "ai" && (
            <AIScreen
              user={user}
              voiceRequestId={voiceRequestId}
              voiceReleaseId={voiceRelease.id}
              voiceReleaseCancelled={voiceRelease.cancelled}
              voiceCancelArmed={voiceCancelArmed}
            />
          )}
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
              className={["nav-button", selected ? "selected" : "", isAiTab ? "ai-nav-button" : "", isAiTab && aiPressing ? "pressing" : "", isAiTab && voiceCancelArmed ? "cancel-armed" : ""].filter(Boolean).join(" ")}
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => {
                if (isAiTab && aiLongPressTriggeredRef.current) {
                  aiLongPressTriggeredRef.current = false;
                  return;
                }
                setActiveTab(tab.id);
              }}
              onPointerDown={isAiTab ? beginAiLongPress : undefined}
              onPointerMove={isAiTab ? moveAiLongPress : undefined}
              onPointerUp={isAiTab ? () => endAiLongPress(false) : undefined}
              onPointerCancel={isAiTab ? () => endAiLongPress(true) : undefined}
              onContextMenu={isAiTab ? (event) => event.preventDefault() : undefined}
              aria-label={isAiTab ? t("ai.longPressHint") : undefined}
              title={isAiTab ? t("ai.longPressHint") : undefined}
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

      {voiceGestureActive && (
        <div className={["voice-gesture-overlay", voiceCancelArmed ? "cancel-armed" : ""].filter(Boolean).join(" ")} aria-live="polite">
          <div className="voice-gesture-feedback">
            <strong>{t(voiceCancelArmed ? "ai.voiceCancelHint" : "ai.voiceReleaseHint")}</strong>
            <div className="voice-waveform" aria-hidden="true">
              {Array.from({ length: 34 }, (_, index) => <span key={index} style={{ "--wave-index": index } as CSSProperties} />)}
            </div>
          </div>
        </div>
      )}
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
