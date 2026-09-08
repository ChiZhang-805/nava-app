import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Clock3,
  Dumbbell,
  EyeOff,
  Flame,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  Leaf,
  Mountain,
  MoonStar,
  Music2,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  Utensils,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale } from "../i18n";
import { completeOnboarding, type OnboardingAnswers } from "../services/onboarding";

type Copy = { zh: string; en: string };
type OptionIcon = ComponentType<{ size?: string | number; strokeWidth?: string | number }>;
type CardOption = { value: string; label: Copy; icon: OptionIcon };
type QuestionKey =
  | "gender"
  | "occupation"
  | "ageGroup"
  | "hobbies"
  | "sleepDuration"
  | "exerciseDuration"
  | "dietPreferences";
type Question = {
  key: QuestionKey;
  title: Copy;
  options: CardOption[];
  multi?: boolean;
  maxSelections?: number;
};
type Phase = "welcome" | "questions" | "privacy" | "complete";

const c = (zh: string, en: string): Copy => ({ zh, en });

function MaleIcon({ size = 24, strokeWidth = 2 }: { size?: string | number; strokeWidth?: string | number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="15" r="5" />
      <path d="m12.5 11.5 7-7M14 4.5h5.5V10" />
    </svg>
  );
}

function FemaleIcon({ size = 24, strokeWidth = 2 }: { size?: string | number; strokeWidth?: string | number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8M8.5 18h7" />
    </svg>
  );
}

const questions: Question[] = [
  {
    key: "gender",
    title: c("你的性别是？", "How do you identify?"),
    options: [
      { value: "male", label: c("男", "Male"), icon: MaleIcon },
      { value: "female", label: c("女", "Female"), icon: FemaleIcon },
      { value: "prefer_not", label: c("暂不透露", "Prefer not to say"), icon: EyeOff },
    ],
  },
  {
    key: "occupation",
    title: c("你目前的主要身份是？", "What is your main role?"),
    options: [
      { value: "student", label: c("学生", "Student"), icon: GraduationCap },
      { value: "employee", label: c("职场人士", "Employee"), icon: BriefcaseBusiness },
      { value: "freelance", label: c("自由职业", "Freelance"), icon: Laptop },
      { value: "caregiver", label: c("居家照护", "Home carer"), icon: Home },
      { value: "retired", label: c("退休人士", "Retired"), icon: Users },
      { value: "other", label: c("其他", "Other"), icon: Sparkles },
    ],
  },
  {
    key: "ageGroup",
    title: c("你的年龄段是？", "What is your age range?"),
    options: [
      { value: "18_24", label: c("18–24 岁", "18–24"), icon: Sparkles },
      { value: "25_34", label: c("25–34 岁", "25–34"), icon: GraduationCap },
      { value: "35_44", label: c("35–44 岁", "35–44"), icon: BriefcaseBusiness },
      { value: "45_54", label: c("45–54 岁", "45–54"), icon: Activity },
      { value: "55_64", label: c("55–64 岁", "55–64"), icon: HeartPulse },
      { value: "65_plus", label: c("65 岁以上", "65+"), icon: Users },
    ],
  },
  {
    key: "hobbies",
    title: c("你平时喜欢什么？", "What do you enjoy?"),
    multi: true,
    maxSelections: 3,
    options: [
      { value: "fitness", label: c("运动健身", "Fitness"), icon: Dumbbell },
      { value: "reading", label: c("阅读学习", "Reading"), icon: BookOpen },
      { value: "music_film", label: c("音乐影视", "Music & film"), icon: Music2 },
      { value: "gaming", label: c("游戏娱乐", "Gaming"), icon: Gamepad2 },
      { value: "outdoors", label: c("旅行户外", "Outdoors"), icon: Mountain },
      { value: "creative", label: c("社交创作", "Create & share"), icon: Palette },
    ],
  },
  {
    key: "sleepDuration",
    title: c("你通常每天睡多久？", "How long do you usually sleep?"),
    options: [
      { value: "under_5h", label: c("少于 5 小时", "Under 5h"), icon: MoonStar },
      { value: "5_6h", label: c("5–6 小时", "5–6h"), icon: Clock3 },
      { value: "6_7h", label: c("6–7 小时", "6–7h"), icon: Clock3 },
      { value: "7_8h", label: c("7–8 小时", "7–8h"), icon: Sparkles },
      { value: "8_9h", label: c("8–9 小时", "8–9h"), icon: MoonStar },
      { value: "over_9h", label: c("9 小时以上", "Over 9h"), icon: HeartPulse },
    ],
  },
  {
    key: "exerciseDuration",
    title: c("你每周通常运动多久？", "How long do you exercise each week?"),
    options: [
      { value: "almost_none", label: c("几乎不运动", "Almost none"), icon: Activity },
      { value: "under_1h", label: c("少于 1 小时", "Under 1h"), icon: Timer },
      { value: "1_2h", label: c("1–2 小时", "1–2h"), icon: Dumbbell },
      { value: "2_4h", label: c("2–4 小时", "2–4h"), icon: Activity },
      { value: "4_7h", label: c("4–7 小时", "4–7h"), icon: Flame },
      { value: "over_7h", label: c("7 小时以上", "Over 7h"), icon: Trophy },
    ],
  },
  {
    key: "dietPreferences",
    title: c("你的饮食偏好是？", "What are your food preferences?"),
    multi: true,
    maxSelections: 3,
    options: [
      { value: "none", label: c("无特殊偏好", "No preference"), icon: Utensils },
      { value: "light", label: c("清淡少油", "Light meals"), icon: Leaf },
      { value: "high_protein", label: c("高蛋白", "High protein"), icon: Activity },
      { value: "low_carb", label: c("低碳控糖", "Lower carb"), icon: HeartPulse },
      { value: "plant_based", label: c("素食植物性", "Plant based"), icon: Leaf },
      { value: "restrictions", label: c("过敏或忌口", "Restrictions"), icon: ShieldAlert },
    ],
  },
];

const initialAnswers: OnboardingAnswers = {
  gender: "",
  ageGroup: "",
  occupation: "",
  hobbies: [],
  sleepDuration: "",
  exerciseDuration: "",
  dietPreferences: [],
  essentialConsent: false,
  healthDataConsent: true,
  aiPersonalizationConsent: true,
};

const welcomeText = "Hi! 很高兴认识你";

export default function OnboardingScreen({ user, onComplete }: { user: User; onComplete: () => void }) {
  const { locale } = useLocale();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [transitioning, setTransitioning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const question = questions[step];
  const progress = ((step + 1) / questions.length) * 100;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "welcome") return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase("questions"), reducedMotion ? 900 : 2800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const selectedValues = (key: QuestionKey) => {
    const value = answers[key];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  };

  const advance = () => {
    setError(null);
    if (step >= questions.length - 1) {
      setPhase("privacy");
      return;
    }
    setStep((value) => value + 1);
  };

  const selectOption = (value: string) => {
    if (transitioning) return;
    if (question.multi) {
      setAnswers((current) => {
        const currentValues = current[question.key] as string[];
        if (currentValues.includes(value)) {
          return { ...current, [question.key]: currentValues.filter((item) => item !== value) };
        }
        if (question.key === "dietPreferences" && value === "none") {
          return { ...current, dietPreferences: ["none"] };
        }
        const withoutExclusive = question.key === "dietPreferences"
          ? currentValues.filter((item) => item !== "none")
          : currentValues;
        if (withoutExclusive.length >= (question.maxSelections ?? 3)) return current;
        return { ...current, [question.key]: [...withoutExclusive, value] };
      });
      return;
    }

    setAnswers((current) => ({ ...current, [question.key]: value }));
    setTransitioning(true);
    transitionTimerRef.current = window.setTimeout(() => {
      advance();
      setTransitioning(false);
      transitionTimerRef.current = null;
    }, 320);
  };

  const save = async () => {
    if (!answers.essentialConsent || busy) return;
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(user.id, answers);
      if (!mountedRef.current) return;
      setPhase("complete");
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete();
      }, 1050);
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      setBusy(false);
    }
  };

  if (phase === "welcome") {
    return (
      <main className="onboarding-screen onboarding-screen--welcome">
        <section className="onboarding-welcome" aria-label={welcomeText}>
          <p className="onboarding-welcome__message" aria-hidden="true">
            {Array.from(welcomeText).map((character, index) => (
              <span
                className={/[\u4e00-\u9fff]/.test(character) ? "is-cjk" : "is-latin"}
                key={`${character}-${index}`}
                style={{ "--char-index": index } as CSSProperties}
              >
                {character === " " ? "\u00a0" : character}
              </span>
            ))}
          </p>
        </section>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <main className="onboarding-screen onboarding-screen--complete">
        <section className="onboarding-complete" role="status">
          <Check size={34} strokeWidth={1.8} />
          <p>{locale === "zh" ? "NAVA 已经认识你了" : "NAVA knows you now"}</p>
        </section>
      </main>
    );
  }

  const showQuestion = phase === "questions";
  const canContinue = showQuestion && question.multi && selectedValues(question.key).length > 0;

  return (
    <main className="onboarding-screen" data-onboarding-step={showQuestion ? question.key : "privacy"}>
      <header className="onboarding-header">
        <button
          type="button"
          aria-label={locale === "zh" ? "返回" : "Back"}
          disabled={(showQuestion && step === 0) || transitioning}
          onClick={() => {
            setError(null);
            if (phase === "privacy") {
              setPhase("questions");
              setStep(questions.length - 1);
            } else {
              setStep((value) => Math.max(0, value - 1));
            }
          }}
        >
          <ArrowLeft size={23} />
        </button>
        <strong>NAVA</strong>
        <i className="onboarding-header-spacer" aria-hidden="true" />
      </header>

      {showQuestion ? (
        <section
          className={["onboarding-question", question.options.length === 2 ? "onboarding-question--two" : "", question.key === "gender" ? "onboarding-question--gender" : ""].filter(Boolean).join(" ")}
          key={question.key}
        >
          <div className="onboarding-question-copy">
            <h1>{question.title[locale]}</h1>
          </div>
          <div className={["onboarding-option-grid", question.options.length === 2 ? "onboarding-option-grid--two" : "", question.key === "gender" ? "onboarding-option-grid--gender" : ""].filter(Boolean).join(" ")}>
            {question.options.map((option) => {
              const Icon = option.icon;
              const selected = selectedValues(question.key).includes(option.value);
              return (
                <button
                  className={selected ? "selected" : ""}
                  disabled={transitioning}
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectOption(option.value)}
                >
                  <span><Icon size={29} strokeWidth={1.75} /></span>
                  <strong>{option.label[locale]}</strong>
                  {selected && <i aria-hidden="true"><Check size={14} strokeWidth={3} /></i>}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="onboarding-privacy">
          <div className="onboarding-question-copy">
            <h1>{locale === "zh" ? "选择你的数据使用方式" : "Choose how your data is used"}</h1>
          </div>
          <div className="onboarding-consent-list">
            <ConsentRow icon={ShieldCheck} title={locale === "zh" ? "账号与核心记录" : "Account and core records"} detail={locale === "zh" ? "用于保存你主动提交的数据，必需" : "Required to save data you submit"} checked={answers.essentialConsent} onChange={(checked) => setAnswers((current) => ({ ...current, essentialConsent: checked }))} />
            <ConsentRow icon={HeartPulse} title={locale === "zh" ? "健康数据同步" : "Health data sync"} detail={locale === "zh" ? "允许读取经你授权的健康数据" : "Use health data you authorize"} checked={answers.healthDataConsent} onChange={(checked) => setAnswers((current) => ({ ...current, healthDataConsent: checked }))} />
            <ConsentRow icon={Sparkles} title={locale === "zh" ? "个性化 AI" : "Personalized AI"} detail={locale === "zh" ? "允许画像和健康记录共同生成反馈" : "Use your profile and logs for feedback"} checked={answers.aiPersonalizationConsent} onChange={(checked) => setAnswers((current) => ({ ...current, aiPersonalizationConsent: checked }))} />
          </div>
          <p className="onboarding-legal">{locale === "zh" ? "继续即表示你已阅读《用户协议》和《隐私政策》。只有第一项为使用产品所必需。" : "Continuing confirms you have read the Terms and Privacy Policy. Only the first item is required."}</p>
        </section>
      )}

      <footer className="onboarding-footer">
        {error && <p role="alert">{error}</p>}
        {showQuestion && question.multi && (
          <button className="onboarding-next" type="button" disabled={!canContinue} onClick={advance}>
            <span>{locale === "zh" ? "下一步" : "Next"}</span>
            <ArrowRight size={21} />
          </button>
        )}
        {!showQuestion && (
          <button className="onboarding-next" type="button" disabled={!answers.essentialConsent || busy} onClick={() => void save()}>
            <span>{busy ? (locale === "zh" ? "正在保存" : "Saving") : (locale === "zh" ? "保存并进入 NAVA" : "Save and enter NAVA")}</span>
            <Check size={21} />
          </button>
        )}
        <div className="onboarding-progress-meta">
          <span>{showQuestion ? (question.multi ? (locale === "zh" ? "选择后点击下一步" : "Choose, then tap Next") : (locale === "zh" ? "选择后自动进入下一题" : "Moves on after selection")) : (locale === "zh" ? "画像已完成" : "Profile complete")}</span>
          <small>{showQuestion ? `${step + 1}/${questions.length}` : `${questions.length}/${questions.length}`}</small>
        </div>
        <div className="onboarding-progress" aria-hidden="true"><i style={{ width: `${showQuestion ? progress : 100}%` }} /></div>
      </footer>
    </main>
  );
}

function ConsentRow({ icon: Icon, title, detail, checked, onChange }: { icon: LucideIcon; title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="onboarding-consent-row">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><Check size={14} /></i>
    </label>
  );
}
