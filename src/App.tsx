import { Activity, ArrowLeft, Download, History, ListTodo, MessageSquarePlus, MoreHorizontal, PhoneCall, Share2, Trash2, Volume2, VolumeX } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import navDataIcon from "./assets/figma/option-two-icons/data.png";
import navHomeIcon from "./assets/figma/option-two-icons/home-glyph.svg";
import navProfileIcon from "./assets/figma/option-two-icons/profile.svg";
import navRecordIcon from "./assets/figma/option-two-icons/record.svg";
import lifeFigure from "./assets/figma/home-option2/raw-01.png";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import type { RecordModule } from "./features/RecordsScreen";
import OptionTwoHome from "./features/OptionTwoHome";
import type { AiCommand } from "./features/AIScreen";
import PasswordRecoveryScreen from "./features/PasswordRecoveryScreen";
import OnboardingScreen from "./features/OnboardingScreen";
import { useAuth } from "./state/authContext";
import { enqueueAndFlushWatchAction, flushPendingWatchActions, subscribeWatchActions } from "./services/watch";
import LanguageToggle from "./components/LanguageToggle";
import MascotMotionSlot from "./components/MascotMotionSlot";
import UtilityDrawer from "./components/UtilityDrawer";
import DevSeedPanel from "./components/DevSeedPanel";
import RewardCelebration from "./components/RewardCelebration";
import { useLocale, useT, type TranslationKey } from "./i18n";
import type { AppTab } from "./types";
import { isDemoMode } from "./services/demo";
import { loadOnboardingStatus } from "./services/onboarding";
import { recordGrowthActivity, reconcileGrowthRewards, resolveGrowthTasks, type GrowthActivityKind, type GrowthRewardGrant, type GrowthSummary } from "./services/productivity";
import useDeviceDate from "./hooks/useDeviceDate";
import { isAiSpeechSupported } from "./services/aiSpeech";
import {
  fallbackShellRoute,
  hasPreviousShellRoute,
  nextShellHistoryState,
  normalizeShellRoute,
  shellHistoryDepth,
  shellRoutesEqual,
  type ShellHistoryState,
  type ShellRoute,
} from "./services/shellHistory";

const aiLongPressDelayMs = 450;

const RecordsScreen = lazy(() => import("./features/RecordsScreen"));
const AIScreen = lazy(() => import("./features/AIScreen"));
const GrowthTasksScreen = lazy(() => import("./features/GrowthTasksScreen"));
const ProfileScreen = lazy(() => import("./features/ProfileScreen"));

const tabs: Array<{ id: AppTab; labelKey: TranslationKey; icon: string }> = [
  { id: "today", labelKey: "tabs.today", icon: navHomeIcon },
  { id: "record", labelKey: "tabs.record", icon: navRecordIcon },
  { id: "ai", labelKey: "tabs.ai", icon: lifeFigure },
  { id: "trends", labelKey: "tabs.trends", icon: navDataIcon },
  { id: "profile", labelKey: "tabs.profile", icon: navProfileIcon },
];

const appTabs = new Set<AppTab>(["today", "record", "ai", "trends", "profile"]);
const recordModules = new Set<RecordModule>(["mood", "sleep", "exercise", "diet", "focus", "face"]);

function readShellRoute(): ShellRoute {
  const query = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
  const candidateTab = query.get("tab") as AppTab | null;
  const tab = candidateTab && appTabs.has(candidateTab) ? candidateTab : "today";
  const candidateModule = query.get("module") as RecordModule | null;
  const module = tab === "record" && candidateModule && recordModules.has(candidateModule) ? candidateModule : null;
  return normalizeShellRoute(tab, module, tab === "today" || module ? query.get("view") : null);
}

function shellRouteHash(route: ShellRoute) {
  const query = new URLSearchParams({ tab: route.tab });
  if (route.tab === "record" && route.module) query.set("module", route.module);
  if (route.tab === "record" && route.module && route.view) query.set("view", route.view);
  if (route.tab === "today" && route.view) query.set("view", route.view);
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
  const deviceDate = useDeviceDate();
  const previousDeviceDateRef = useRef(deviceDate);
  const [voiceRequestId, setVoiceRequestId] = useState(0);
  const [voiceRelease, setVoiceRelease] = useState({ id: 0, cancelled: false });
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [aiPressing, setAiPressing] = useState(false);
  const [mascotPlayToken, setMascotPlayToken] = useState(0);
  const [aiCommand, setAiCommand] = useState<AiCommand | null>(null);
  const [aiPromptRequest, setAiPromptRequest] = useState<{ id: number; text: string } | null>(null);
  const [aiHasMounted, setAiHasMounted] = useState(initialRouteRef.current.tab === "ai");
  const aiSpeechStorageKey = `nava-ai-speech-enabled:${user?.id ?? "anonymous"}`;
  const [aiSpeechEnabled, setAiSpeechEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(aiSpeechStorageKey) !== "false";
    } catch {
      return true;
    }
  });
  const [rewardQueue, setRewardQueue] = useState<GrowthRewardGrant[][]>([]);
  const contentRef = useRef<HTMLElement | null>(null);
  const utilityButtonRef = useRef<HTMLButtonElement | null>(null);
  const utilityPopoverRef = useRef<HTMLDivElement | null>(null);
  const aiLongPressTimerRef = useRef<number | null>(null);
  const aiLongPressTriggeredRef = useRef(false);
  const aiGesturePointerActiveRef = useRef(false);
  const aiPressStartYRef = useRef(0);
  const aiLatestYRef = useRef(0);
  const voiceCancelArmedRef = useRef(false);
  const aiGestureCleanupRef = useRef<(() => void) | null>(null);
  const rewardClaimTailRef = useRef<Promise<GrowthSummary | null>>(Promise.resolve(null));
  const checkinUserRef = useRef<string | null>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTab);
  const aiSpeechSupported = isAiSpeechSupported();
  const recordTitles: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "情绪记录", en: "Mood Record" },
    sleep: { zh: "睡眠记录", en: "Sleep Record" },
    exercise: { zh: "运动记录", en: "Activity Record" },
    diet: { zh: "饮食记录", en: "Diet Record" },
    focus: { zh: "专注记录", en: "Focus Record" },
    face: { zh: "面部分析", en: "Face Analysis" },
  };
  const currentTitle = activeTab === "record" && recordModule
    ? recordTitles[recordModule][locale]
    : currentTab
      ? t(currentTab.labelKey)
      : "";

  const claimGrowthAfterChange = useCallback(() => {
    if (!user) return Promise.resolve(null);
    const next = rewardClaimTailRef.current
      .catch(() => null)
      .then(async () => {
        const tasks = await resolveGrowthTasks(user.id);
        const summary = await reconcileGrowthRewards(tasks);
        if (summary.awarded.length > 0) setRewardQueue((queue) => [...queue, summary.awarded]);
        return summary;
      })
      .catch((rewardError) => {
        console.warn("Growth reward reconciliation deferred", rewardError);
        return null;
      });
    rewardClaimTailRef.current = next;
    return next;
  }, [user]);

  const markChanged = useCallback(() => {
    setRefreshKey((value) => value + 1);
    void claimGrowthAfterChange();
  }, [claimGrowthAfterChange]);

  const markTodoCompleted = useCallback(() => {
    setRefreshKey((value) => value + 1);
    return claimGrowthAfterChange();
  }, [claimGrowthAfterChange]);

  const completeGrowthActivity = useCallback(async (activity: GrowthActivityKind) => {
    if (!user) return null;
    try {
      const reward = await recordGrowthActivity(user.id, activity);
      if (reward) setRewardQueue((queue) => [...queue, [reward]]);
      setRefreshKey((value) => value + 1);
      await claimGrowthAfterChange();
      return reward;
    } catch (rewardError) {
      console.warn("Growth activity could not be recorded", rewardError);
      return null;
    }
  }, [claimGrowthAfterChange, user]);

  const dismissReward = useCallback(() => setRewardQueue((queue) => queue.slice(1)), []);

  useEffect(() => {
    if (previousDeviceDateRef.current === deviceDate) return;
    previousDeviceDateRef.current = deviceDate;
    setRefreshKey((value) => value + 1);
  }, [deviceDate]);

  useEffect(() => {
    if (activeTab === "ai") setAiHasMounted(true);
  }, [activeTab]);

  useEffect(() => {
    if (!user || checkinUserRef.current === user.id) return;
    checkinUserRef.current = user.id;
    void completeGrowthActivity("checkin");
  }, [completeGrowthActivity, user]);

  const navigate = (tab: AppTab, module: RecordModule | null = null, view: string | null = null, replace = false) => {
    const next = normalizeShellRoute(tab, module, view);
    setActiveTab(next.tab);
    setRecordModule(next.module);
    setRecordView(next.view);
    const url = `${window.location.pathname}${window.location.search}${shellRouteHash(next)}`;
    const currentState = window.history.state;
    const currentDepth = shellHistoryDepth(currentState);
    if (shellRoutesEqual(readShellRoute(), next) && window.location.hash) {
      if (!currentState || (currentState as Partial<ShellHistoryState>).navaShell !== true) {
        window.history.replaceState({ navaShell: true, depth: currentDepth, route: next } satisfies ShellHistoryState, "", url);
      }
      return;
    }
    const nextState = nextShellHistoryState(currentState, next, replace);
    window.history[replace ? "replaceState" : "pushState"](nextState, "", url);
  };

  const navigateBack = (fallback: ShellRoute) => {
    if (hasPreviousShellRoute(window.history.state)) {
      window.history.back();
      return;
    }
    navigate(fallback.tab, fallback.module, fallback.view, true);
  };

  const runAiCommand = (type: AiCommand["type"]) => {
    setAiCommand((current) => ({ id: (current?.id ?? 0) + 1, type }));
    setUtilityOpen(false);
  };

  const toggleAiSpeech = () => {
    if (!aiSpeechSupported) return;
    setAiSpeechEnabled((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem(aiSpeechStorageKey, String(next));
      } catch {
        // The current session can still use the selected setting.
      }
      return next;
    });
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
    else {
      const currentState = window.history.state as Partial<ShellHistoryState> | null;
      if (currentState?.navaShell !== true) {
        window.history.replaceState({ navaShell: true, depth: 0, route: readShellRoute() } satisfies ShellHistoryState, "", window.location.href);
      }
    }
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
      if (alive) markChanged();
    }).catch((syncError) => console.warn("pending watch actions remain queued", syncError));
    subscribeWatchActions(async (action) => {
      if (!alive) return;
      try {
        await enqueueAndFlushWatchAction(user.id, action);
        markChanged();
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
  }, [markChanged, user]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setUtilityOpen(false);
    setDrawerOpen(false);
  }, [activeTab, recordModule, recordView]);

  useEffect(() => {
    if (!utilityOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (utilityButtonRef.current?.contains(target) || utilityPopoverRef.current?.contains(target)) return;
      setUtilityOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUtilityOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [utilityOpen]);

  useEffect(() => () => {
    if (aiLongPressTimerRef.current !== null) window.clearTimeout(aiLongPressTimerRef.current);
  }, []);

  if (!user) return null;

  const focusImmersive = activeTab === "record" && recordModule === "focus" && (recordView === "immersive" || recordView === "interruption");

  return (
    <div className={["phone-frame", activeTab === "today" ? "phone-frame--option2" : "", focusImmersive ? "phone-frame--focus-immersive" : ""].filter(Boolean).join(" ")}>
      <div className="safe-top" />
      {activeTab !== "today" && !focusImmersive && (
        <header className="app-header figma-app-header">
          <button
            className="figma-header-action"
            type="button"
            onClick={() => navigateBack(fallbackShellRoute(normalizeShellRoute(activeTab, recordModule, recordView)))}
            aria-label={t("records.back")}
            title={t("records.back")}
          >
            <ArrowLeft size={21} />
          </button>
          <h1>{currentTitle}</h1>
          <button
            ref={utilityButtonRef}
            className="figma-header-action"
            type="button"
            onClick={() => setUtilityOpen((open) => !open)}
            aria-label="More"
            aria-expanded={utilityOpen}
          >
            <MoreHorizontal size={23} />
          </button>
          {utilityOpen && (
            <div className="app-utility-popover" ref={utilityPopoverRef}>
              {activeTab === "ai" && <>
                <button type="button" onClick={() => runAiCommand("new")}><MessageSquarePlus size={17} />{locale === "zh" ? "新会话" : "New chat"}</button>
                <button type="button" onClick={() => runAiCommand("history")}><History size={17} />{locale === "zh" ? "历史" : "History"}</button>
                <button type="button" onClick={() => runAiCommand("voice-call")}><PhoneCall size={17} />{locale === "zh" ? "语音聊天" : "Voice chat"}</button>
                <button type="button" onClick={() => runAiCommand("clear")}><Trash2 size={17} />{locale === "zh" ? "清空" : "Clear"}</button>
                <button type="button" onClick={() => runAiCommand("export")}><Download size={17} />{locale === "zh" ? "导出" : "Export"}</button>
                <button
                  type="button"
                  onClick={toggleAiSpeech}
                  disabled={!aiSpeechSupported}
                  aria-pressed={aiSpeechEnabled}
                  title={!aiSpeechSupported ? (locale === "zh" ? "当前设备不支持系统朗读" : "System speech is unavailable") : undefined}
                >
                  {aiSpeechEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  {!aiSpeechSupported
                    ? (locale === "zh" ? "此设备不支持朗读" : "Voice unavailable")
                    : aiSpeechEnabled
                      ? (locale === "zh" ? "关闭朗读" : "Turn off voice")
                      : (locale === "zh" ? "开启朗读" : "Turn on voice")}
                </button>
              </>}
              {activeTab === "record" && recordModule && <>
                <button type="button" onClick={() => { setRecordView("history"); navigate("record", recordModule, "history"); setUtilityOpen(false); }}><History size={17} />{locale === "zh" ? "历史记录" : "History"}</button>
                <button type="button" onClick={() => void shareCurrentPage()}><Share2 size={17} />{locale === "zh" ? "分享页面" : "Share"}</button>
              </>}
              <button type="button" onClick={() => { setUtilityOpen(false); setDrawerOpen(true); }}><ListTodo size={17} />{locale === "zh" ? "功能导航" : "Utilities"}</button>
              <LanguageToggle />
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
              deviceDate={deviceDate}
              view={recordView}
              onOpenRecord={(module) => {
                navigate("record", module ?? null);
              }}
              onOpenUtility={() => setDrawerOpen(true)}
              onViewChange={(view, replace = false) => navigate("today", null, view, replace)}
              onBack={(fallbackView) => navigateBack(normalizeShellRoute("today", null, fallbackView))}
              onChanged={markChanged}
            />
          )}
          {activeTab === "record" && (
            <Suspense fallback={<LoadingScreen />}>
              <RecordsScreen
                user={user}
                deviceDate={deviceDate}
                onSaved={markChanged}
                onGrowthActivity={completeGrowthActivity}
                onOpenAi={(prompt) => {
                  setAiPromptRequest((current) => ({ id: (current?.id ?? 0) + 1, text: prompt }));
                  navigate("ai");
                }}
                initialModule={recordModule}
                initialView={recordView}
                onModuleChange={(module) => navigate("record", module)}
                onViewChange={(view, replace = false) => {
                  if (replace && recordView) {
                    navigateBack(normalizeShellRoute("record", recordModule, view));
                    return;
                  }
                  navigate("record", recordModule, view, replace);
                }}
              />
            </Suspense>
          )}
          {aiHasMounted && (
            <div
              className={["ai-screen-host", activeTab === "ai" ? "is-active" : "is-background"].join(" ")}
              aria-hidden={activeTab !== "ai"}
              {...(activeTab !== "ai" ? { inert: "" } : {})}
            >
              <Suspense fallback={activeTab === "ai" ? <LoadingScreen /> : null}>
                <AIScreen
                  user={user}
                  voiceRequestId={voiceRequestId}
                  voiceReleaseId={voiceRelease.id}
                  voiceReleaseCancelled={voiceRelease.cancelled}
                  externalVoiceCancelArmed={voiceCancelArmed}
                  command={aiCommand}
                  profileRefreshKey={refreshKey}
                  speechEnabled={aiSpeechEnabled}
                  active={activeTab === "ai"}
                  initialPromptRequest={aiPromptRequest}
                  onDataSaved={markChanged}
                  onConversationCompleted={() => void completeGrowthActivity("ai")}
                />
              </Suspense>
            </div>
          )}
          {activeTab === "trends" && (
            <Suspense fallback={<LoadingScreen />}>
              <GrowthTasksScreen
                key={deviceDate}
                user={user}
                onOpenTarget={(target) => {
                  if (target === "profile") {
                    navigate("profile");
                    return;
                  }
                  if (target === "today") {
                    navigate("today");
                    return;
                  }
                  if (target === "ai") {
                    navigate("ai");
                    return;
                  }
                  if (target === "share") {
                    navigate("record", "diet", "history");
                    return;
                  }
                  navigate("record", target === "nutrition" ? "diet" : target);
                }}
              />
            </Suspense>
          )}
          {activeTab === "profile" && <Suspense fallback={<LoadingScreen />}><ProfileScreen user={user} onChanged={markChanged} /></Suspense>}
        </div>
      </main>

      {!focusImmersive && <nav className="bottom-nav" aria-label="主导航">
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
      </nav>}
      <UtilityDrawer
        user={user}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onTaskCompleted={markTodoCompleted}
      />
      {rewardQueue[0] && <RewardCelebration rewards={rewardQueue[0]} locale={locale} onDismiss={dismissReward} />}
    </div>
  );
}

function AppContent({ signedOutScreenSeen: initialSignedOutScreenSeen = false }: { signedOutScreenSeen?: boolean }) {
  const configError = assertConfig();
  const { user, loading, passwordRecovery } = useAuth();
  const signedOutScreenSeen = useRef(initialSignedOutScreenSeen);
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

export default function AuthenticatedApp({ signedOutScreenSeen = false }: { signedOutScreenSeen?: boolean }) {
  return <AppContent signedOutScreenSeen={signedOutScreenSeen} />;
}
