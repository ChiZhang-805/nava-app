import { Activity, ArrowLeft, Download, History, Home, ListTodo, MessageSquarePlus, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import navDataIcon from "./assets/figma/option-two-icons/data.png";
import navHomeIcon from "./assets/figma/option-two-icons/home-glyph.svg";
import navProfileIcon from "./assets/figma/option-two-icons/profile.svg";
import navRecordIcon from "./assets/figma/option-two-icons/record.svg";
import lifeFigure from "./assets/figma/home-option2/raw-01.png";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import RecordsScreen from "./features/RecordsScreen";
import type { RecordModule } from "./features/RecordsScreen";
import OptionTwoHome from "./features/OptionTwoHome";
import AIScreen, { type AiCommand } from "./features/AIScreen";
import GrowthTasksScreen from "./features/GrowthTasksScreen";
import ProfileScreen from "./features/ProfileScreen";
import PasswordRecoveryScreen from "./features/PasswordRecoveryScreen";
import OnboardingScreen from "./features/OnboardingScreen";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/authContext";
import { enqueueAndFlushWatchAction, flushPendingWatchActions, subscribeWatchActions } from "./services/watch";
import ErrorBoundary from "./components/ErrorBoundary";
import LanguageToggle from "./components/LanguageToggle";
import MascotMotionSlot from "./components/MascotMotionSlot";
import UtilityDrawer from "./components/UtilityDrawer";
import DevSeedPanel from "./components/DevSeedPanel";
import { LocaleProvider, useLocale, useT, type TranslationKey } from "./i18n";
import type { AppTab } from "./types";
import { isDemoMode } from "./services/demo";
import { loadOnboardingStatus } from "./services/onboarding";

const aiLongPressDelayMs = 450;

const tabs: Array<{ id: AppTab; labelKey: TranslationKey; icon: string }> = [
  { id: "today", labelKey: "tabs.today", icon: navHomeIcon },
  { id: "record", labelKey: "tabs.record", icon: navRecordIcon },
  { id: "ai", labelKey: "tabs.ai", icon: lifeFigure },
  { id: "trends", labelKey: "tabs.trends", icon: navDataIcon },
  { id: "profile", labelKey: "tabs.profile", icon: navProfileIcon },
];

type ShellRoute = { tab: AppTab; module: RecordModule | null; view: string | null };
const appTabs = new Set<AppTab>(["today", "record", "ai", "trends", "profile"]);
const recordModules = new Set<RecordModule>(["mood", "sleep", "exercise", "diet", "focus", "face"]);

function readShellRoute(): ShellRoute {
  const query = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
  const candidateTab = query.get("tab") as AppTab | null;
  const tab = candidateTab && appTabs.has(candidateTab) ? candidateTab : "today";
  const candidateModule = query.get("module") as RecordModule | null;
  const module = tab === "record" && candidateModule && recordModules.has(candidateModule) ? candidateModule : null;
  return { tab, module, view: module ? query.get("view") : null };
}

function shellRouteHash(route: ShellRoute) {
  const query = new URLSearchParams({ tab: route.tab });
  if (route.tab === "record" && route.module) query.set("module", route.module);
  if (route.tab === "record" && route.module && route.view) query.set("view", route.view);
  return `#${query.toString()}`;
}

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
  const { locale } = useLocale();
  const initialRouteRef = useRef<ShellRoute>(readShellRoute());
  const [activeTab, setActiveTab] = useState<AppTab>(initialRouteRef.current.tab);
  const [recordModule, setRecordModule] = useState<RecordModule | null>(initialRouteRef.current.module);
  const [recordView, setRecordView] = useState<string | null>(initialRouteRef.current.view);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [voiceRequestId, setVoiceRequestId] = useState(0);
  const [voiceRelease, setVoiceRelease] = useState({ id: 0, cancelled: false });
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [aiPressing, setAiPressing] = useState(false);
  const [mascotPlayToken, setMascotPlayToken] = useState(0);
  const [aiCommand, setAiCommand] = useState<AiCommand | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const aiLongPressTimerRef = useRef<number | null>(null);
  const aiLongPressTriggeredRef = useRef(false);
  const aiGesturePointerActiveRef = useRef(false);
  const aiPressStartYRef = useRef(0);
  const aiLatestYRef = useRef(0);
  const voiceCancelArmedRef = useRef(false);
  const aiGestureCleanupRef = useRef<(() => void) | null>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTab);
  const recordTitles: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "今日情绪", en: "Today's Mood" },
    sleep: { zh: "今日睡眠记录", en: "Today's Sleep" },
    exercise: { zh: "今日运动", en: "Today's Activity" },
    diet: { zh: "今日饮食", en: "Today's Diet" },
    focus: { zh: "今日专注记录", en: "Today's Focus" },
    face: { zh: "今日面部分析", en: "Face Analysis" },
  };
  const currentTitle = activeTab === "record" && recordModule
    ? recordTitles[recordModule][locale]
    : currentTab
      ? t(currentTab.labelKey)
      : "";

  const markChanged = () => setRefreshKey((value) => value + 1);

  const navigate = (tab: AppTab, module: RecordModule | null = null, view: string | null = null, replace = false) => {
    const next: ShellRoute = { tab, module: tab === "record" ? module : null, view: tab === "record" && module ? view : null };
    setActiveTab(next.tab);
    setRecordModule(next.module);
    setRecordView(next.view);
    const url = `${window.location.pathname}${window.location.search}${shellRouteHash(next)}`;
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };

  const runAiCommand = (type: AiCommand["type"]) => {
    setAiCommand((current) => ({ id: (current?.id ?? 0) + 1, type }));
    setUtilityOpen(false);
  };

  const shareCurrentPage = async () => {
    const shareData = { title: `NAVA · ${currentTitle}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(shareData.url);
    } catch (shareError) {
      if ((shareError as DOMException)?.name !== "AbortError") console.warn("share failed", shareError);
    }
    setUtilityOpen(false);
  };

  const clearAiLongPressTimer = () => {
    if (aiLongPressTimerRef.current !== null) {
      window.clearTimeout(aiLongPressTimerRef.current);
      aiLongPressTimerRef.current = null;
    }
    setAiPressing(false);
  };

  const updateAiLongPress = (clientY: number) => {
    if (!aiGesturePointerActiveRef.current) return;
    aiLatestYRef.current = clientY;
    if (!aiLongPressTriggeredRef.current) return;
    const nextCancelArmed = aiPressStartYRef.current - clientY >= 64;
    if (nextCancelArmed === voiceCancelArmedRef.current) return;
    voiceCancelArmedRef.current = nextCancelArmed;
    setVoiceCancelArmed(nextCancelArmed);
    navigator.vibrate?.(nextCancelArmed ? 12 : 6);
  };

  const endAiLongPress = (forceCancel = false) => {
    if (!aiGesturePointerActiveRef.current) return;
    aiGesturePointerActiveRef.current = false;
    aiGestureCleanupRef.current?.();
    aiGestureCleanupRef.current = null;
    const completedVoiceGesture = aiLongPressTriggeredRef.current;
    clearAiLongPressTimer();
    if (completedVoiceGesture) {
      const cancelled = forceCancel || voiceCancelArmedRef.current;
      setVoiceRelease((current) => ({ id: current.id + 1, cancelled }));
      setVoiceCancelArmed(false);
      voiceCancelArmedRef.current = false;
    }
  };

  const beginAiLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    aiGestureCleanupRef.current?.();
    aiLongPressTriggeredRef.current = false;
    aiGesturePointerActiveRef.current = true;
    aiPressStartYRef.current = event.clientY;
    aiLatestYRef.current = event.clientY;
    voiceCancelArmedRef.current = false;
    setVoiceCancelArmed(false);
    setAiPressing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const pointerId = event.pointerId;
    const onWindowPointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) updateAiLongPress(pointerEvent.clientY);
    };
    const onWindowPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) endAiLongPress(false);
    };
    const onWindowPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) endAiLongPress(true);
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    aiGestureCleanupRef.current = () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
    };

    aiLongPressTimerRef.current = window.setTimeout(() => {
      aiLongPressTimerRef.current = null;
      aiLongPressTriggeredRef.current = true;
      const cancelArmed = aiPressStartYRef.current - aiLatestYRef.current >= 64;
      voiceCancelArmedRef.current = cancelArmed;
      setVoiceCancelArmed(cancelArmed);
      setAiPressing(false);
      setMascotPlayToken((value) => value + 1);
      navigate("ai");
      setVoiceRequestId((value) => value + 1);
      navigator.vibrate?.(20);
    }, aiLongPressDelayMs);
  };

  const moveAiLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    updateAiLongPress(event.clientY);
  };

  useEffect(() => () => {
    aiGestureCleanupRef.current?.();
    if (aiLongPressTimerRef.current !== null) window.clearTimeout(aiLongPressTimerRef.current);
  }, []);

  useEffect(() => {
    if (!window.location.hash) navigate(initialRouteRef.current.tab, initialRouteRef.current.module, initialRouteRef.current.view, true);
    const restoreRoute = () => {
      const route = readShellRoute();
      setActiveTab(route.tab);
      setRecordModule(route.module);
      setRecordView(route.view);
    };
    window.addEventListener("popstate", restoreRoute);
    window.addEventListener("hashchange", restoreRoute);
    return () => {
      window.removeEventListener("popstate", restoreRoute);
      window.removeEventListener("hashchange", restoreRoute);
    };
  }, []);

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
    setUtilityOpen(false);
    setDrawerOpen(false);
  }, [activeTab, recordModule, recordView]);

  useEffect(() => () => {
    if (aiLongPressTimerRef.current !== null) window.clearTimeout(aiLongPressTimerRef.current);
  }, []);

  if (!user) return null;

  return (
    <div className={["phone-frame", activeTab === "today" ? "phone-frame--option2" : ""].filter(Boolean).join(" ")}>
      <div className="safe-top" />
      {activeTab !== "today" && (
        <header className="app-header figma-app-header">
          <button
            className="figma-header-action"
            type="button"
            onClick={() => {
              if (activeTab === "record" && recordModule) {
                if (recordView && recordView !== "overview") navigate("record", recordModule);
                else navigate("record");
                return;
              }
              navigate("today");
            }}
            aria-label={activeTab === "record" && recordModule ? t("records.back") : t("tabs.today")}
            title={activeTab === "record" && recordModule ? t("records.back") : t("tabs.today")}
          >
            {activeTab === "record" && recordModule ? <ArrowLeft size={21} /> : <Home size={21} />}
          </button>
          <h1>{currentTitle}</h1>
          <button
            className="figma-header-action"
            type="button"
            onClick={() => setUtilityOpen((open) => !open)}
            aria-label="More"
            aria-expanded={utilityOpen}
          >
            <MoreHorizontal size={23} />
          </button>
          {utilityOpen && (
            <div className="app-utility-popover">
              {activeTab === "ai" && <>
                <button type="button" onClick={() => runAiCommand("new")}><MessageSquarePlus size={17} />{locale === "zh" ? "新会话" : "New chat"}</button>
                <button type="button" onClick={() => runAiCommand("history")}><History size={17} />{locale === "zh" ? "历史" : "History"}</button>
                <button type="button" onClick={() => runAiCommand("clear")}><Trash2 size={17} />{locale === "zh" ? "清空" : "Clear"}</button>
                <button type="button" onClick={() => runAiCommand("export")}><Download size={17} />{locale === "zh" ? "导出" : "Export"}</button>
              </>}
              {activeTab === "record" && recordModule && <>
                <button type="button" onClick={() => { setRecordView("history"); navigate("record", recordModule, "history"); setUtilityOpen(false); }}><History size={17} />{locale === "zh" ? "历史记录" : "History"}</button>
                <button type="button" onClick={() => void shareCurrentPage()}><Share2 size={17} />{locale === "zh" ? "分享页面" : "Share"}</button>
              </>}
              <button type="button" onClick={() => { setUtilityOpen(false); setDrawerOpen(true); }}><ListTodo size={17} />{locale === "zh" ? "功能导航" : "Utilities"}</button>
              <LanguageToggle onToggle={() => setUtilityOpen(false)} />
            </div>
          )}
        </header>
      )}

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
        <div className="screen-panel">
          {activeTab === "today" && (
            <OptionTwoHome
              user={user}
              refreshKey={refreshKey}
              onOpenRecord={(module) => {
                navigate("record", module ?? null);
              }}
              onOpenAi={() => navigate("ai")}
              onOpenUtility={() => setDrawerOpen(true)}
            />
          )}
          {activeTab === "record" && (
            <RecordsScreen
              user={user}
              onSaved={markChanged}
              initialModule={recordModule}
              initialView={recordView}
              onModuleChange={(module) => navigate("record", module)}
              onViewChange={(view) => navigate("record", recordModule, view)}
            />
          )}
          <div
            className={["ai-screen-host", activeTab === "ai" ? "is-active" : "is-background"].join(" ")}
            aria-hidden={activeTab !== "ai"}
            {...(activeTab !== "ai" ? { inert: "" } : {})}
          >
            <AIScreen
              user={user}
              voiceRequestId={voiceRequestId}
              voiceReleaseId={voiceRelease.id}
              voiceReleaseCancelled={voiceRelease.cancelled}
              externalVoiceCancelArmed={voiceCancelArmed}
              command={aiCommand}
              onDataSaved={markChanged}
            />
          </div>
          {activeTab === "trends" && <GrowthTasksScreen user={user} />}
          {activeTab === "profile" && <ProfileScreen user={user} onChanged={markChanged} />}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map((tab) => {
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
                if (isAiTab) setMascotPlayToken((value) => value + 1);
                navigate(tab.id);
              }}
              onPointerDown={isAiTab ? beginAiLongPress : undefined}
              onPointerMove={isAiTab ? moveAiLongPress : undefined}
              onPointerUp={isAiTab ? () => endAiLongPress(false) : undefined}
              onPointerCancel={isAiTab ? () => endAiLongPress(true) : undefined}
              onContextMenu={isAiTab ? (event) => event.preventDefault() : undefined}
              aria-label={isAiTab ? t("ai.longPressHint") : t(tab.labelKey)}
              title={isAiTab ? t("ai.longPressHint") : undefined}
              aria-current={selected ? "page" : undefined}
              aria-pressed={selected}
            >
              {isAiTab ? (
                <span className="ai-nav-orb" aria-hidden="true">
                   <span className="ai-nav-glow" />
                   <MascotMotionSlot
                     staticSrc={lifeFigure}
                     playToken={mascotPlayToken}
                   />
                </span>
              ) : (
                <img
                  className={`figma-nav-icon figma-nav-icon--${tab.id}`}
                  src={tab.icon}
                  alt=""
                  aria-hidden="true"
                />
              )}
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>
      <UtilityDrawer user={user} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function AppContent() {
  const configError = assertConfig();
  const { user, loading, passwordRecovery } = useAuth();
  const signedOutScreenSeen = useRef(false);
  const userId = user?.id ?? null;
  const forceOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";
  const [onboardingRoute, setOnboardingRoute] = useState<{ userId: string; required: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!userId) {
      setOnboardingRoute(null);
      return () => {
        alive = false;
      };
    }

    loadOnboardingStatus(userId)
      .then((status) => {
        if (alive) setOnboardingRoute({ userId, required: forceOnboarding || !status.completed });
      })
      .catch((error) => {
        console.warn("Unable to determine onboarding state", error);
        if (alive) setOnboardingRoute({ userId, required: forceOnboarding });
      });

    return () => {
      alive = false;
    };
  }, [forceOnboarding, userId]);

  if (!loading && !user) signedOutScreenSeen.current = true;
  const checkingOnboarding = Boolean(userId && onboardingRoute?.userId !== userId);

  let screen;
  if (configError && !isDemoMode()) screen = <ConfigErrorScreen message={configError} />;
  else if (loading) screen = <LoadingScreen />;
  else if (user && passwordRecovery) screen = <PasswordRecoveryScreen />;
  else if (!user) screen = <AuthScreen />;
  else if (checkingOnboarding) {
    screen = signedOutScreenSeen.current ? <AuthScreen transitionPending /> : <LoadingScreen />;
  } else if (onboardingRoute?.required) {
    screen = <OnboardingScreen user={user} onComplete={() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setOnboardingRoute({ userId: user.id, required: false });
    }} />;
  } else screen = <MobileShell />;

  return (
    <div className="nava-app-stage">
      {screen}
      {user && <DevSeedPanel user={user} />}
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
