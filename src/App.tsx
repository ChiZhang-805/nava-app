import { Activity, ArrowLeft, Download, History, MessageSquarePlus, PhoneCall, ScanFace, Share2, Trash2, Volume2, VolumeX } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import navChatIcon from "./assets/figma/option-two-icons/chat.svg";
import navHomeIcon from "./assets/figma/option-two-icons/home-glyph.svg";
import navProfileIcon from "./assets/figma/option-two-icons/profile.svg";
import navRecordIcon from "./assets/figma/option-two-icons/record.svg";
import navTasksIcon from "./assets/figma/option-two-icons/tasks.svg";
import { assertConfig } from "./config";
import AuthScreen from "./features/AuthScreen";
import type { FocusTodoPrefill, RecordModule } from "./features/RecordsScreen";
import OptionTwoHome from "./features/OptionTwoHome";
import { ColdStartHub } from './features/ColdStartExperience';
import type { AiCommand } from "./features/AIScreen";
import PasswordRecoveryScreen from "./features/PasswordRecoveryScreen";
import OnboardingScreen from "./features/OnboardingScreen";
import ProfileScreen from "./features/ProfileScreen";
import { useAuth } from "./state/authContext";
import { flushPendingWatchActions, subscribeWatchActions } from "./services/watch";
import MoreMenu from "./components/MoreMenu";
import DevSeedPanel from "./components/DevSeedPanel";
import RewardCelebration from "./components/RewardCelebration";
import NotificationBanner from "./components/NotificationBanner";
import LinkSharePreview from "./components/LinkSharePreview";
import DesktopDevicePreviewChrome from "./components/DesktopDevicePreviewChrome";
import { presentPhonePreviewNotification, phoneNotificationOpenEvent } from "./services/previewPhoneSystem";
import PageSkeleton, { SkeletonBlock } from "./components/PageSkeleton";
import LoadingShell from "./components/LoadingShell";
import { currentSkeletonVariant, recordSkeletonVariant } from "./services/loadingRoute";
import { useLocale, useT, type TranslationKey } from "./i18n";
import type { AppTab } from "./types";
import { isDemoMode } from "./services/demo";
import { loadOnboardingStatus, type OnboardingStatus } from "./services/onboarding";
import { recordGrowthActivity, reconcileGrowthRewards, resolveGrowthTasks, saveTodoFocusPlan, type GrowthActivityKind, type GrowthRewardGrant, type GrowthSummary, type TodoItem } from "./services/productivity";
import { resolveTodoFocusPlan } from "./services/focusPlanning.ts";
import useDeviceDate from "./hooks/useDeviceDate";
import useIndependentReminders from "./hooks/useIndependentReminders";
import useNativeHealthAutoSync from "./hooks/useNativeHealthAutoSync";
import { subscribeHealthSyncCompletion } from "./services/health";
import { isAiSpeechSupported } from "./services/aiSpeech";
import {
  ensureNotificationQaState,
  hydrateNavaNotifications,
  listNavaNotifications,
  markNavaNotification,
  notifyRecordSaved,
  subscribeNavaNotifications,
  subscribeNativeNotificationActions,
  type NavaNotificationItem,
  type NavaNotificationTarget,
} from "./services/notifications";
import { loadUserAppPreferences, saveUserAppPreferences } from "./services/userCloudState";
import { registerRemotePush, subscribeRemoteNotificationActions } from "./services/remotePush";
import { loadAdminAccess } from "./services/adminConsole";
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
import { readAppSkin, writeAppSkin, type AppSkin } from "./services/appSkin";
import { integratedShellPage } from "./services/integratedShell";

const aiLongPressDelayMs = 450;
const firstLoginPreviewStatus: OnboardingStatus = {
  completed: false,
  completedAt: null,
  version: 3,
  answers: {},
  source: "none",
};

const RecordsScreen = lazy(() => import("./features/RecordsScreen"));
const JournalExperience = lazy(() => import("./features/JournalExperience"));
const AIScreen = lazy(() => import("./features/AIScreen"));
const GrowthTasksScreen = lazy(() => import("./features/GrowthTasksScreen"));

const tabs: Array<{ id: AppTab; labelKey: TranslationKey; icon: string }> = [
  { id: "today", labelKey: "tabs.today", icon: navHomeIcon },
  { id: "record", labelKey: "tabs.record", icon: navRecordIcon },
  { id: "ai", labelKey: "tabs.ai", icon: navChatIcon },
  { id: "trends", labelKey: "tabs.trends", icon: navTasksIcon },
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
  return normalizeShellRoute(tab, module, tab === "today" || tab === "profile" || module ? query.get("view") : null);
}

function shellRouteHash(route: ShellRoute) {
  const query = new URLSearchParams({ tab: route.tab });
  if (route.tab === "record" && route.module) query.set("module", route.module);
  if (route.tab === "record" && route.module && route.view) query.set("view", route.view);
  if (route.tab === "today" && route.view) query.set("view", route.view);
  if (route.tab === "profile" && route.view) query.set("view", route.view);
  return `#${query.toString()}`;
}

function LoadingScreen() {
  return <LoadingShell />;
}

function DelayedLoadingScreen({ delay = 180 }: { delay?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return visible ? <LoadingScreen /> : null;
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

function MobileShell({
  showInitialHomeGuidance,
  onOpenOnboarding,
  guidePreviewRequest,
  onGuidePreviewConsumed,
  completionPreviewScene,
  onCompletionPreviewDismiss,
}: {
  showInitialHomeGuidance: boolean;
  onOpenOnboarding: () => void;
  guidePreviewRequest: { id: number; module: RecordModule } | null;
  onGuidePreviewConsumed: () => void;
  completionPreviewScene: string | null;
  onCompletionPreviewDismiss: () => void;
}) {
  const { user } = useAuth();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const forcePageSkeleton = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "skeleton";
  const forcedSkeletonVariant = currentSkeletonVariant();
  const initialRouteRef = useRef<ShellRoute>(readShellRoute());
  const [activeTab, setActiveTab] = useState<AppTab>(initialRouteRef.current.tab);
  const [recordModule, setRecordModule] = useState<RecordModule | null>(initialRouteRef.current.module);
  const [recordView, setRecordView] = useState<string | null>(initialRouteRef.current.view);
  const [activeGuidePreview, setActiveGuidePreview] = useState<{ id: number; module: RecordModule } | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [appSkin, setAppSkin] = useState<AppSkin>(() => readAppSkin(user?.id));
  const [linkShareOpen, setLinkShareOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [focusTodoPrefill, setFocusTodoPrefill] = useState<FocusTodoPrefill | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const deviceDate = useDeviceDate();
  const previousDeviceDateRef = useRef(deviceDate);
  const [voiceRequestId, setVoiceRequestId] = useState(0);
  const [voiceRelease, setVoiceRelease] = useState({ id: 0, cancelled: false });
  const [voiceCancelArmed, setVoiceCancelArmed] = useState(false);
  const [aiPressing, setAiPressing] = useState(false);
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
  const rewardUserRef = useRef(user?.id);
  rewardUserRef.current = user?.id;
  useEffect(() => setRewardQueue([]), [user?.id]);
  useEffect(() => setAppSkin(readAppSkin(user?.id)), [user?.id]);

  const changeAppSkin = useCallback((skin: AppSkin) => {
    setAppSkin(skin);
    writeAppSkin(skin, user?.id);
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      return () => { active = false; };
    }
    const qaAdmin = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "admin-console";
    if (qaAdmin) {
      setIsAdmin(true);
      return () => { active = false; };
    }
    void loadAdminAccess()
      .then((allowed) => { if (active) setIsAdmin(allowed); })
      .catch((roleError) => {
        console.warn("Admin role check deferred", roleError);
        if (active) setIsAdmin(false);
      });
    return () => { active = false; };
  }, [user]);
  const [notificationItems, setNotificationItems] = useState<NavaNotificationItem[]>(() => user ? listNavaNotifications(user.id) : []);
  const [notificationBanner, setNotificationBanner] = useState<NavaNotificationItem | null>(null);
  const [cloudBootstrapReady, setCloudBootstrapReady] = useState(() => isDemoMode());
  const [profileExportRequestId, setProfileExportRequestId] = useState(0);
  const contentRef = useRef<HTMLElement | null>(null);
  const aiLongPressTimerRef = useRef<number | null>(null);
  const aiLongPressTriggeredRef = useRef(false);
  const aiGesturePointerActiveRef = useRef(false);
  const aiPressStartYRef = useRef(0);
  const aiLatestYRef = useRef(0);
  const voiceCancelArmedRef = useRef(false);
  const aiGestureCleanupRef = useRef<(() => void) | null>(null);
  const rewardClaimTailRef = useRef<Promise<GrowthSummary | null>>(Promise.resolve(null));
  const checkinUserRef = useRef<string | null>(null);
  const initialHomeGuidanceShownRef = useRef(false);
  const preferencesHydratedUserRef = useRef<string | null>(null);
  const bootstrapLocaleRef = useRef(locale);
  const bootstrapAiSpeechRef = useRef(aiSpeechEnabled);
  const setLocaleRef = useRef(setLocale);
  bootstrapLocaleRef.current = locale;
  bootstrapAiSpeechRef.current = aiSpeechEnabled;
  setLocaleRef.current = setLocale;
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
  const profileTitles: Record<string, { zh: string; en: string }> = {
    account: { zh: "账号与安全", en: "Account & security" },
    personal: { zh: "个人资料", en: "Personal profile" },
    skin: { zh: "界面皮肤", en: "Interface skin" },
    health: { zh: "Apple 健康", en: "Apple Health" },
    watch: { zh: "Apple Watch", en: "Apple Watch" },
    privacy: { zh: "隐私与数据", en: "Privacy & data" },
  };
  const currentTitle = activeTab === "record" && recordModule
    ? recordTitles[recordModule][locale]
    : activeTab === "profile" && recordView && profileTitles[recordView]
      ? profileTitles[recordView][locale]
    : currentTab
      ? t(currentTab.labelKey)
      : "";

  const claimGrowthAfterChange = useCallback((present = true) => {
    if (!user) return Promise.resolve(null);
    const next = rewardClaimTailRef.current
      .catch(() => null)
      .then(async () => {
        const tasks = await resolveGrowthTasks(user.id);
        const summary = await reconcileGrowthRewards(tasks);
        if (rewardUserRef.current === user.id && present && summary.awarded.length > 0) setRewardQueue((queue) => [...queue, summary.awarded]);
        return summary;
      })
      .catch((rewardError) => {
        console.warn("Growth reward reconciliation deferred", rewardError);
        return null;
      });
    rewardClaimTailRef.current = next;
    return next;
  }, [user]);

  const markChanged = useCallback((module?: RecordModule) => {
    setRefreshKey((value) => value + 1);
    void claimGrowthAfterChange();
    if (user && module) notifyRecordSaved(user.id, module, deviceDate, locale);
  }, [claimGrowthAfterChange, deviceDate, locale, user]);

  // A journal save already leads to the category's full-screen completion scene.
  // Reconcile silently so it cannot be covered by a second celebration.
  const markJournalChanged = useCallback(() => {
    setRefreshKey((value) => value + 1);
    void claimGrowthAfterChange(false);
  }, [claimGrowthAfterChange]);

  const refreshHealthViews = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useNativeHealthAutoSync(user?.id ?? null, refreshHealthViews, refreshKey);

  useEffect(() => {
    if (!user) return;
    return subscribeHealthSyncCompletion(user.id, refreshHealthViews);
  }, [refreshHealthViews, user]);

  const completeGrowthActivity = useCallback(async (activity: GrowthActivityKind) => {
    if (!user) return null;
    try {
      const reward = await recordGrowthActivity(user.id, activity);
      if (rewardUserRef.current !== user.id) return null;
      setRefreshKey((value) => value + 1);
      const summary = await claimGrowthAfterChange(false);
      const grants = [...(reward ? [reward] : []), ...(summary?.awarded ?? [])];
      if (rewardUserRef.current === user.id && grants.length) setRewardQueue((queue) => [...queue, grants]);
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
    if (!user || checkinUserRef.current === `${user.id}:${deviceDate}`) return;
    checkinUserRef.current = `${user.id}:${deviceDate}`;
    void completeGrowthActivity("checkin");
  }, [completeGrowthActivity, user, deviceDate]);

  const navigate = useCallback((tab: AppTab, module: RecordModule | null = null, view: string | null = null, replace = false) => {
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
  }, []);

  useEffect(() => {
    if (!guidePreviewRequest) return;
    setActiveGuidePreview(guidePreviewRequest);
    onGuidePreviewConsumed();
    navigate("record", guidePreviewRequest.module, "guide");
  }, [guidePreviewRequest, navigate, onGuidePreviewConsumed]);

  useEffect(() => {
    if (!activeGuidePreview) return;
    if (activeTab !== "record" || recordView !== "guide" || recordModule !== activeGuidePreview.module) setActiveGuidePreview(null);
  }, [activeGuidePreview, activeTab, recordModule, recordView]);

  const openTodoFocus = (todo: TodoItem) => {
    if (!user) return;
    const plan = resolveTodoFocusPlan(todo);
    setFocusTodoPrefill((current) => ({
      requestId: (current?.requestId ?? 0) + 1,
      todoId: todo.id,
      title: todo.title,
      focusMinutes: plan.focusMinutes,
      focusSessions: plan.focusSessions,
      suggested: plan.suggested,
    }));
    setUtilityOpen(false);
    navigate("record", "focus", "editor");
    if (plan.suggested) {
      void saveTodoFocusPlan(user.id, todo.id, plan)
        .catch((error) => console.warn("Todo focus estimate sync deferred", error));
    }
  };

  const navigateBack = (fallback: ShellRoute) => {
    if (hasPreviousShellRoute(window.history.state)) {
      window.history.back();
      return;
    }
    navigate(fallback.tab, fallback.module, fallback.view, true);
  };

  const openNotificationTarget = useCallback((target?: NavaNotificationTarget) => {
    if (!target) {
      navigate("today", null, "notifications");
      return;
    }
    navigate(target.tab, target.module ?? null, target.view ?? null);
  }, [navigate]);

  const openNotificationItem = useCallback((item: NavaNotificationItem) => {
    if (user && !item.id.startsWith("preview:")) markNavaNotification(user.id, item.id, true);
    setNotificationBanner(null);
    openNotificationTarget(item.target);
  }, [openNotificationTarget, user]);

  const dismissNotificationBanner = useCallback(() => setNotificationBanner(null), []);
  const presentNotification = useCallback((item: NavaNotificationItem) => {
    if (!presentPhonePreviewNotification(item, () => openNotificationItem(item))) setNotificationBanner(item);
  }, [openNotificationItem]);
  useIndependentReminders(cloudBootstrapReady ? user?.id ?? null : null, deviceDate, refreshKey, locale, presentNotification);
  useEffect(() => {
    if (import.meta.env.MODE === "native") return;
    const open = (event: Event) => openNotificationTarget((event as CustomEvent<NavaNotificationTarget>).detail);
    window.addEventListener(phoneNotificationOpenEvent, open);
    return () => window.removeEventListener(phoneNotificationOpenEvent, open);
  }, [openNotificationTarget]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let active = true;
    setCloudBootstrapReady(isDemoMode());
    const localNotifications = listNavaNotifications(userId);
    setNotificationItems(localNotifications);
    void Promise.allSettled([
      hydrateNavaNotifications(userId),
      loadUserAppPreferences(userId),
    ]).then(async ([notificationResult, preferenceResult]) => {
      if (!active) return;
      if (notificationResult.status === "fulfilled") setNotificationItems(notificationResult.value);
      else console.warn("Notification cloud restore deferred", notificationResult.reason);
      let effectiveLocale = bootstrapLocaleRef.current;
      if (preferenceResult.status === "fulfilled" && preferenceResult.value) {
        const preferences = preferenceResult.value;
        setAiSpeechEnabled(preferences.aiSpeechEnabled);
        window.localStorage.setItem(`nava-ai-speech-enabled:${userId}`, String(preferences.aiSpeechEnabled));
        setLocaleRef.current(preferences.locale);
        effectiveLocale = preferences.locale;
      } else if (preferenceResult.status === "rejected") {
        console.warn("Preference cloud restore deferred", preferenceResult.reason);
      } else {
        void saveUserAppPreferences(userId, {
          locale: bootstrapLocaleRef.current,
          aiSpeechEnabled: bootstrapAiSpeechRef.current,
        })
          .catch((error) => console.warn("Preference cloud bootstrap deferred", error));
      }
      preferencesHydratedUserRef.current = userId;
      setCloudBootstrapReady(true);
      ensureNotificationQaState(userId, effectiveLocale);
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !cloudBootstrapReady) return;
    const unsubscribe = subscribeNavaNotifications(user.id, (change) => {
      setNotificationItems(change.items);
      if (change.presented) presentNotification(change.presented);
      if (change.opened) openNotificationItem(change.opened);
    });
    const refreshFromCloud = () => {
      void hydrateNavaNotifications(user.id)
        .then(setNotificationItems)
        .catch((error) => console.warn("Notification foreground restore deferred", error));
    };
    window.addEventListener("focus", refreshFromCloud);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshFromCloud);
    };
  }, [cloudBootstrapReady, openNotificationItem, presentNotification, user]);

  useEffect(() => {
    if (!user || preferencesHydratedUserRef.current !== user.id) return;
    void saveUserAppPreferences(user.id, { locale })
      .catch((error) => console.warn("Locale cloud sync deferred", error));
  }, [locale, user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let listenerHandle: Awaited<ReturnType<typeof subscribeNativeNotificationActions>> = null;
    void subscribeNativeNotificationActions(user.id, (item) => {
      if (alive) openNotificationItem(item);
    }).then((handle) => {
      if (!alive) void handle?.remove();
      else listenerHandle = handle;
    });
    return () => {
      alive = false;
      void listenerHandle?.remove();
    };
  }, [openNotificationItem, user]);

  useEffect(() => {
    if (!user) return;
    void registerRemotePush(user.id, false)
      .catch((error) => console.warn("Remote push restore deferred", error));
    return subscribeRemoteNotificationActions((target) => openNotificationTarget(target));
  }, [openNotificationTarget, user]);

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
      if (user) void saveUserAppPreferences(user.id, { aiSpeechEnabled: next })
        .catch((error) => console.warn("AI speech preference cloud sync deferred", error));
      return next;
    });
  };

  const shareCurrentPage = async () => {
    setUtilityOpen(false);
    setLinkShareOpen(true);
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
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let listenerHandle: Awaited<ReturnType<typeof subscribeWatchActions>> = null;
    void flushPendingWatchActions(user.id).then(() => {
      if (alive) markChanged();
    }).catch((syncError) => console.warn("pending watch actions remain queued", syncError));
    subscribeWatchActions(user.id, () => {
      if (!alive) return;
      markChanged();
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
  }, [activeTab, recordModule, recordView]);

  useEffect(() => () => {
    if (aiLongPressTimerRef.current !== null) window.clearTimeout(aiLongPressTimerRef.current);
  }, []);

  if (!user) return null;

  const focusImmersive = activeTab === "record" && recordModule === "focus" && (recordView === "immersive" || recordView === "interruption");
  const profileSubpage = activeTab === "profile" && Boolean(recordView);
  const profileDetailsSubpage = activeTab === "today" && recordView === "profile-details";
  const todayFullSubpage = activeTab === "today" && (profileDetailsSubpage || recordView === "home-widgets" || recordView === "admin-console" || recordView === "getting-started");
  const journalOpen = activeTab === "record" && Boolean(recordModule);
  const hideBottomNavigation = focusImmersive || todayFullSubpage || journalOpen || profileSubpage;
  const integratedPage = integratedShellPage(activeTab, recordModule, recordView);

  return (
    <div
      data-app-skin={appSkin}
      data-app-tab={activeTab}
      data-app-view={recordView ?? "root"}
      data-shell-integrated={integratedPage ? "true" : undefined}
      data-shell-page={integratedPage ?? undefined}
      className={["phone-frame", journalOpen ? "phone-frame--journal" : "", activeTab === "today" ? "phone-frame--option2" : "", focusImmersive ? "phone-frame--focus-immersive" : "", profileDetailsSubpage || profileSubpage ? "phone-frame--subpage-no-nav" : ""].filter(Boolean).join(" ")}
    >
      <div className="safe-top" />
      {linkShareOpen && <LinkSharePreview locale={locale} onClose={() => setLinkShareOpen(false)} />}
      {notificationBanner && <NotificationBanner item={notificationBanner} locale={locale} onOpen={() => openNotificationItem(notificationBanner)} onDismiss={dismissNotificationBanner} />}
      {activeTab !== "today" && !focusImmersive && !journalOpen && (
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
          <MoreMenu open={utilityOpen} onOpenChange={setUtilityOpen} label={locale === "zh" ? "更多操作" : "More"} buttonClassName="figma-header-action" skin={appSkin} onSkinChange={changeAppSkin}>
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
                {recordModule === "face" && <button type="button" onClick={() => { setRecordView("conditions"); navigate("record", "face", "conditions"); setUtilityOpen(false); }}><ScanFace size={17} />{locale === "zh" ? "条件检验" : "Condition check"}</button>}
              </>}
              {activeTab === "profile" && recordView === "privacy" && <button type="button" onClick={() => setProfileExportRequestId((current) => current + 1)}><Download size={17} />{locale === "zh" ? "导出我的数据" : "Export my data"}</button>}
          </MoreMenu>
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
          {forcePageSkeleton
            ? activeTab === "today" && forcedSkeletonVariant !== "today"
              ? <section className={["home-experience", "page-loading-home-experience", forcedSkeletonVariant === "advanced-profile" ? "advanced-profile-screen" : "", forcedSkeletonVariant === "calendar" ? "home-calendar-screen" : ""].filter(Boolean).join(" ")} data-month-week-count={forcedSkeletonVariant === "calendar" ? 5 : undefined}><header className="home-experience-header page-loading-subheader" aria-hidden="true"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></header><PageSkeleton variant={forcedSkeletonVariant} calendarWeekCount={forcedSkeletonVariant === "calendar" ? 5 : undefined} /></section>
              : <PageSkeleton variant={forcedSkeletonVariant} />
            : <>
          {activeTab === "today" && (
            recordView === 'getting-started' ? <ColdStartHub userId={user.id} onHome={() => navigate('today', null, null, true)} onStart={goal => navigate('record', goal, 'guide')} onHealth={() => navigate('profile')} /> : <OptionTwoHome
              user={user}
              refreshKey={refreshKey}
              deviceDate={deviceDate}
              view={recordView}
              onOpenRecord={(module, view = null) => {
                navigate("record", module ?? null, view);
              }}
              onStartTodoFocus={openTodoFocus}
              onViewChange={(view, replace = false) => navigate("today", null, view, replace)}
              onBack={(fallbackView) => navigateBack(normalizeShellRoute("today", null, fallbackView))}
              onChanged={markChanged}
              notifications={notificationItems}
              onOpenNotificationTarget={openNotificationTarget}
              showInitialGuidance={showInitialHomeGuidance && !initialHomeGuidanceShownRef.current}
              onInitialGuidanceShown={() => { initialHomeGuidanceShownRef.current = true; }}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === "record" && (
            <Suspense fallback={<PageSkeleton variant={recordSkeletonVariant(recordModule, recordView)} />}>
              {recordModule ? <JournalExperience
                key={recordView === "guide" && activeGuidePreview?.module === recordModule ? `journal-guide-preview-${activeGuidePreview.id}` : `journal-${recordModule}-${recordView ?? "default"}`}
                user={user}
                module={recordModule}
                locale={locale}
                skin={appSkin}
                forceGuide={recordView === 'guide'}
                guidePreview={recordView === "guide" && activeGuidePreview?.module === recordModule}
                onSaved={markJournalChanged}
                onExit={() => { setActiveGuidePreview(null); navigate("today"); }}
              /> : <RecordsScreen
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
                focusTodoPrefill={focusTodoPrefill}
                onFocusTodoPrefillApplied={(requestId) => setFocusTodoPrefill((current) => current?.requestId === requestId ? null : current)}
                onModuleChange={(module, view = null) => navigate("record", module, view)}
                onViewChange={(view, replace = false) => {
                  if (replace && recordView) {
                    navigateBack(normalizeShellRoute("record", recordModule, view));
                    return;
                  }
                  navigate("record", recordModule, view, replace);
                }}
              />}
            </Suspense>
          )}
          {aiHasMounted && (
            <div
              className={["ai-screen-host", activeTab === "ai" ? "is-active" : "is-background"].join(" ")}
              aria-hidden={activeTab !== "ai"}
              {...(activeTab !== "ai" ? { inert: "" } : {})}
            >
              <Suspense fallback={activeTab === "ai" ? <PageSkeleton variant="ai" /> : null}>
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
            <Suspense fallback={<PageSkeleton variant="growth" />}>
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
          {activeTab === "profile" && <ProfileScreen user={user} refreshKey={refreshKey} onChanged={markChanged} onOpenOnboarding={onOpenOnboarding} skin={appSkin} onSkinChange={changeAppSkin} deviceDate={deviceDate} view={recordView} onViewChange={(view) => navigate("profile", null, view)} exportRequestId={profileExportRequestId} />}
          </>}
        </div>
      </main>

      {!hideBottomNavigation && <nav className="bottom-nav" aria-label="主导航">
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
                   <img className="figma-nav-ai-chat" src={tab.icon} alt="" draggable={false} />
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
      {rewardQueue[0] && <RewardCelebration rewards={rewardQueue[0]} locale={locale} onDismiss={dismissReward} />}
      {completionPreviewScene && <RewardCelebration sceneOverride={completionPreviewScene} locale={locale} onDismiss={onCompletionPreviewDismiss} />}
    </div>
  );
}

function AppContent({
  signedOutScreenSeen: initialSignedOutScreenSeen = false,
  showInitialHomeGuidance = false,
  onReady,
}: {
  signedOutScreenSeen?: boolean;
  showInitialHomeGuidance?: boolean;
  onReady?: (userId: string) => void;
}) {
  const configError = assertConfig();
  const { user, loading, passwordRecovery } = useAuth();
  const { locale } = useLocale();
  const signedOutScreenSeen = useRef(initialSignedOutScreenSeen);
  const userId = user?.id ?? null;
  const forceOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";
  const [onboardingRoute, setOnboardingRoute] = useState<{ userId: string; required: boolean; status?: OnboardingStatus | null; mode?: "first" | "review" } | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingRetryKey, setOnboardingRetryKey] = useState(0);
  const [firstLoginPreviewOpen, setFirstLoginPreviewOpen] = useState(false);
  const [firstLoginPreviewKey, setFirstLoginPreviewKey] = useState(0);
  const [journalGuidePreview, setJournalGuidePreview] = useState<{ id: number; module: RecordModule } | null>(null);
  const [completionPreviewScene, setCompletionPreviewScene] = useState<string | null>(null);
  const journalGuidePreviewIdRef = useRef(0);

  useEffect(() => {
    let alive = true;
    if (!userId) {
      setOnboardingRoute(null);
      setOnboardingError(null);
      return () => {
        alive = false;
      };
    }

    setOnboardingError(null);
    loadOnboardingStatus(userId)
      .then((status) => {
        if (alive) setOnboardingRoute({
          userId,
          required: forceOnboarding || !status.completed,
          status,
          mode: forceOnboarding && status.completed ? "review" : "first",
        });
      })
      .catch((error) => {
        console.warn("Unable to determine onboarding state", error);
        if (alive) {
          setOnboardingRoute(null);
          setOnboardingError(locale === "zh"
            ? "无法安全确认隐私同意状态，请检查网络后重试。"
            : "Your privacy-consent status could not be verified. Check the connection and retry.");
        }
      });

    return () => {
      alive = false;
    };
  }, [forceOnboarding, locale, onboardingRetryKey, userId]);

  if (!loading && !user) signedOutScreenSeen.current = true;
  const checkingOnboarding = Boolean(userId && onboardingRoute?.userId !== userId);

  useEffect(() => {
    if (!loading && userId && (passwordRecovery || Boolean(onboardingError) || !checkingOnboarding)) onReady?.(userId);
  }, [checkingOnboarding, loading, onReady, onboardingError, passwordRecovery, userId]);

  const openOnboarding = useCallback(() => {
    if (!user) return;
    setOnboardingError(null);
    loadOnboardingStatus(user.id)
      .then((status) => {
        setOnboardingRoute({ userId: user.id, required: true, status, mode: "review" });
      })
      .catch((error) => {
        console.warn("Unable to load onboarding for review", error);
        setOnboardingRoute({ userId: user.id, required: true, status: onboardingRoute?.status ?? null, mode: "review" });
      });
  }, [onboardingRoute?.status, user]);
  const openFirstLoginPreview = useCallback(() => {
    setJournalGuidePreview(null);
    setCompletionPreviewScene(null);
    setFirstLoginPreviewKey((value) => value + 1);
    setFirstLoginPreviewOpen(true);
  }, []);
  const closeFirstLoginPreview = useCallback(() => setFirstLoginPreviewOpen(false), []);
  const openJournalGuidePreview = useCallback((module: RecordModule) => {
    setFirstLoginPreviewOpen(false);
    setCompletionPreviewScene(null);
    journalGuidePreviewIdRef.current += 1;
    setJournalGuidePreview({ id: journalGuidePreviewIdRef.current, module });
  }, []);
  const consumeJournalGuidePreview = useCallback(() => setJournalGuidePreview(null), []);
  const openCompletionPreview = useCallback((scene: string) => {
    setFirstLoginPreviewOpen(false);
    setJournalGuidePreview(null);
    setCompletionPreviewScene(scene);
  }, []);
  const closeCompletionPreview = useCallback(() => setCompletionPreviewScene(null), []);

  let screen;
  if (configError && !isDemoMode()) screen = <ConfigErrorScreen message={configError} />;
  else if (loading) screen = <DelayedLoadingScreen />;
  else if (user && passwordRecovery) screen = <PasswordRecoveryScreen />;
  else if (!user) screen = <AuthScreen />;
  else if (firstLoginPreviewOpen) {
    screen = (
      <OnboardingScreen
        key={`authenticated-first-login-preview-${firstLoginPreviewKey}`}
        user={{ id: `desktop-first-login-preview-${user.id}` }}
        status={firstLoginPreviewStatus}
        mode="first"
        previewOnly
        onComplete={closeFirstLoginPreview}
      />
    );
  }
  else if (onboardingError) {
    screen = <main className="app-screen centered-screen"><div className="brand-mark warn"><Activity size={28} /></div><h1>{locale === "zh" ? "暂时无法进入" : "Unable to continue"}</h1><p className="muted">{onboardingError}</p><button className="primary" type="button" onClick={() => setOnboardingRetryKey((value) => value + 1)}>{locale === "zh" ? "重新检查" : "Retry"}</button></main>;
  } else if (checkingOnboarding) {
    screen = signedOutScreenSeen.current ? <AuthScreen transitionPending /> : <DelayedLoadingScreen />;
  } else if (onboardingRoute?.required) {
    screen = <OnboardingScreen user={user} status={onboardingRoute.status} mode={onboardingRoute.mode} onComplete={(status) => {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      if (onboardingRoute.mode !== 'review') url.hash = 'tab=today&view=getting-started';
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setOnboardingRoute({ userId: user.id, required: false, status, mode: "first" });
    }} />;
  } else screen = <MobileShell
    showInitialHomeGuidance={showInitialHomeGuidance}
    onOpenOnboarding={openOnboarding}
    guidePreviewRequest={journalGuidePreview}
    onGuidePreviewConsumed={consumeJournalGuidePreview}
    completionPreviewScene={completionPreviewScene}
    onCompletionPreviewDismiss={closeCompletionPreview}
  />;

  const journalGuidePreviewAvailable = Boolean(user && !checkingOnboarding && !onboardingError && !onboardingRoute?.required && !passwordRecovery);

  return (
    <div className="nava-app-stage">
      {screen}
      <DesktopDevicePreviewChrome
        reminderUserId={user?.id}
        onFirstLoginPreview={openFirstLoginPreview}
        onJournalGuidePreview={journalGuidePreviewAvailable ? openJournalGuidePreview : undefined}
        onCompletionPreview={journalGuidePreviewAvailable ? openCompletionPreview : undefined}
      />
      {user && <DevSeedPanel user={user} />}
    </div>
  );
}

export default function AuthenticatedApp({
  signedOutScreenSeen = false,
  showInitialHomeGuidance = false,
  onReady,
}: {
  signedOutScreenSeen?: boolean;
  showInitialHomeGuidance?: boolean;
  onReady?: (userId: string) => void;
}) {
  return <AppContent signedOutScreenSeen={signedOutScreenSeen} showInitialHomeGuidance={showInitialHomeGuidance} onReady={onReady} />;
}
