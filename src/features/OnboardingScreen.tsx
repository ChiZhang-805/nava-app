import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  MoonStar,
  Palette,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Utensils,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale } from "../i18n";
import { completeOnboarding, type OnboardingAnswers } from "../services/onboarding";

type Copy = { zh: string; en: string };
type CardOption = { value: string; label: Copy; detail: Copy; icon: LucideIcon };
type QuestionKey = "ageGroup" | "occupation" | "primaryGoal" | "sleepRhythm" | "activityLevel" | "dietPreference";
type Question = { key: QuestionKey; title: Copy; hint: Copy; options: CardOption[] };

const c = (zh: string, en: string): Copy => ({ zh, en });

const questions: Question[] = [
  {
    key: "ageGroup",
    title: c("你正处在哪个人生阶段？", "Which life stage are you in?"),
    hint: c("年龄阶段只用于调整节律基线。", "This only adjusts your rhythm baseline."),
    options: [
      { value: "under_18", label: c("18 岁以下", "Under 18"), detail: c("成长阶段", "Growing"), icon: Sparkles },
      { value: "18_24", label: c("18-24 岁", "18-24"), detail: c("学习与探索", "Study & explore"), icon: GraduationCap },
      { value: "25_34", label: c("25-34 岁", "25-34"), detail: c("工作与生活", "Work & life"), icon: BriefcaseBusiness },
      { value: "35_44", label: c("35-44 岁", "35-44"), detail: c("稳定与平衡", "Balance"), icon: Activity },
      { value: "45_59", label: c("45-59 岁", "45-59"), detail: c("恢复与维护", "Recovery"), icon: HeartPulse },
      { value: "60_plus", label: c("60 岁以上", "60+"), detail: c("健康与活力", "Health & vitality"), icon: Users },
    ],
  },
  {
    key: "occupation",
    title: c("哪种日常最接近你？", "Which routine fits you best?"),
    hint: c("工作节奏会影响建议出现的时间。", "Your routine changes when suggestions appear."),
    options: [
      { value: "学生", label: c("学生", "Student"), detail: c("课程与自习", "Classes & study"), icon: GraduationCap },
      { value: "办公室工作", label: c("办公室工作", "Desk work"), detail: c("久坐与会议", "Desk & meetings"), icon: BriefcaseBusiness },
      { value: "创意工作", label: c("创意工作", "Creative"), detail: c("灵活与专注", "Flexible focus"), icon: Palette },
      { value: "医疗服务", label: c("医疗服务", "Healthcare"), detail: c("高强度照护", "Care shifts"), icon: Stethoscope },
      { value: "轮班工作", label: c("轮班工作", "Shift work"), detail: c("作息常变化", "Changing hours"), icon: Clock3 },
      { value: "其他", label: c("其他", "Other"), detail: c("稍后可修改", "Edit later"), icon: Users },
    ],
  },
  {
    key: "primaryGoal",
    title: c("你最想先改善什么？", "What would you improve first?"),
    hint: c("NAVA 会优先展示与你目标相关的反馈。", "NAVA will prioritize feedback for this goal."),
    options: [
      { value: "改善睡眠", label: c("改善睡眠", "Sleep better"), detail: c("稳定入睡与醒来", "Steadier nights"), icon: MoonStar },
      { value: "提升精力", label: c("提升精力", "More energy"), detail: c("减少日间疲惫", "Less fatigue"), icon: Sparkles },
      { value: "稳定情绪", label: c("稳定情绪", "Steady mood"), detail: c("识别压力来源", "See stress patterns"), icon: HeartPulse },
      { value: "坚持运动", label: c("坚持运动", "Stay active"), detail: c("形成活动节律", "Build a routine"), icon: Dumbbell },
      { value: "提高专注", label: c("提高专注", "Focus better"), detail: c("找到高效时段", "Find focus windows"), icon: Clock3 },
      { value: "整体平衡", label: c("整体平衡", "Overall balance"), detail: c("综合六类数据", "Across all modules"), icon: Activity },
    ],
  },
  {
    key: "sleepRhythm",
    title: c("你的睡眠节奏更接近哪种？", "Which sleep rhythm fits you?"),
    hint: c("不需要精确，之后可根据记录自动校正。", "An estimate is enough; records will refine it."),
    options: [
      { value: "早睡早起", label: c("早睡早起", "Early"), detail: c("22 点前后入睡", "Around 22:00"), icon: MoonStar },
      { value: "规律作息", label: c("规律作息", "Regular"), detail: c("每天相对固定", "Mostly consistent"), icon: Clock3 },
      { value: "晚睡晚起", label: c("晚睡晚起", "Late"), detail: c("午夜后入睡", "After midnight"), icon: MoonStar },
      { value: "工作日补觉", label: c("周末补觉", "Weekend catch-up"), detail: c("周末明显更晚", "Later on weekends"), icon: Activity },
      { value: "轮班作息", label: c("轮班作息", "Shift pattern"), detail: c("时间经常变化", "Hours often change"), icon: BriefcaseBusiness },
      { value: "尚不确定", label: c("尚不确定", "Not sure"), detail: c("交给记录判断", "Learn from logs"), icon: Sparkles },
    ],
  },
  {
    key: "activityLevel",
    title: c("你通常每周运动几次？", "How often are you active?"),
    hint: c("日常步行和体力工作也计算在内。", "Walking and physical work also count."),
    options: [
      { value: "较少运动", label: c("较少运动", "Rarely"), detail: c("每周不足 1 次", "Less than weekly"), icon: Activity },
      { value: "每周 1-2 次", label: c("每周 1-2 次", "1-2 times"), detail: c("轻量活动", "Light activity"), icon: Dumbbell },
      { value: "每周 3-4 次", label: c("每周 3-4 次", "3-4 times"), detail: c("规律训练", "Regular training"), icon: Dumbbell },
      { value: "每周 5 次以上", label: c("每周 5 次以上", "5+ times"), detail: c("高频训练", "Frequent training"), icon: Activity },
      { value: "体力工作为主", label: c("体力工作", "Physical work"), detail: c("工作即活动", "Active at work"), icon: BriefcaseBusiness },
      { value: "恢复期", label: c("恢复期", "Recovery"), detail: c("暂不宜高强度", "Keeping it gentle"), icon: HeartPulse },
    ],
  },
  {
    key: "dietPreference",
    title: c("哪种饮食描述更接近你？", "Which diet sounds most like you?"),
    hint: c("用于判断饮食建议，不用于限制选择。", "This guides feedback; it does not restrict choices."),
    options: [
      { value: "均衡饮食", label: c("均衡饮食", "Balanced"), detail: c("没有特别限制", "No restrictions"), icon: Utensils },
      { value: "高蛋白", label: c("高蛋白", "High protein"), detail: c("重视蛋白摄入", "Protein focused"), icon: Activity },
      { value: "素食为主", label: c("素食为主", "Plant based"), detail: c("以植物食物为主", "Mostly plants"), icon: Sparkles },
      { value: "控糖饮食", label: c("控糖饮食", "Lower sugar"), detail: c("关注血糖波动", "Mindful of sugar"), icon: HeartPulse },
      { value: "经常外食", label: c("经常外食", "Often dining out"), detail: c("餐食选择变化大", "Meals vary"), icon: Utensils },
      { value: "尚不确定", label: c("尚不确定", "Not sure"), detail: c("从记录中学习", "Learn from logs"), icon: Sparkles },
    ],
  },
];

const initialAnswers: OnboardingAnswers = {
  ageGroup: "",
  occupation: "",
  primaryGoal: "",
  sleepRhythm: "",
  activityLevel: "",
  dietPreference: "",
  essentialConsent: false,
  healthDataConsent: true,
  aiPersonalizationConsent: true,
};

export default function OnboardingScreen({ user, onComplete }: { user: User; onComplete: () => void }) {
  const { locale } = useLocale();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = step >= 0 ? questions[step] : null;
  const progress = step < 0 ? 0 : ((step + 1) / questions.length) * 100;
  const canContinue = step < 0 ? answers.essentialConsent : Boolean(question && answers[question.key]);
  const title = useMemo(() => question?.title[locale] ?? "", [locale, question]);

  const next = async () => {
    if (!canContinue || busy) return;
    if (step < questions.length - 1) {
      setStep((value) => value + 1);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(user.id, answers);
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding-screen" data-onboarding-step={step < 0 ? "privacy" : question?.key}>
      <header className="onboarding-header">
        <button type="button" aria-label={locale === "zh" ? "返回" : "Back"} disabled={step < 0} onClick={() => setStep((value) => Math.max(-1, value - 1))}>
          <ArrowLeft size={23} />
        </button>
        <span>NAVA</span>
        <small>{step < 0 ? "01" : String(step + 2).padStart(2, "0")}</small>
      </header>
      <div className="onboarding-progress" aria-hidden="true"><i style={{ width: `${step < 0 ? 8 : 8 + progress * 0.92}%` }} /></div>

      {step < 0 ? (
        <section className="onboarding-privacy">
          <div className="onboarding-question-copy">
            <span>{locale === "zh" ? "开始之前" : "Before we begin"}</span>
            <h1>{locale === "zh" ? "你的节律，只属于你。" : "Your rhythm stays yours."}</h1>
            <p>{locale === "zh" ? "你可以决定哪些数据用于同步与个性化，之后也能在设置中修改。" : "Choose what can be synchronized and personalized. You can change this later."}</p>
          </div>
          <div className="onboarding-consent-list">
            <ConsentRow icon={ShieldCheck} title={locale === "zh" ? "账号与核心记录" : "Account and core records"} detail={locale === "zh" ? "用于保存你主动提交的数据，必需" : "Required to save data you submit"} checked={answers.essentialConsent} onChange={(checked) => setAnswers((current) => ({ ...current, essentialConsent: checked }))} />
            <ConsentRow icon={HeartPulse} title={locale === "zh" ? "健康数据同步" : "Health data sync"} detail={locale === "zh" ? "允许读取经你授权的 Apple 健康数据" : "Use Apple Health data you authorize"} checked={answers.healthDataConsent} onChange={(checked) => setAnswers((current) => ({ ...current, healthDataConsent: checked }))} />
            <ConsentRow icon={Sparkles} title={locale === "zh" ? "个性化 AI" : "Personalized AI"} detail={locale === "zh" ? "允许画像和健康记录共同生成反馈" : "Use your profile and logs for feedback"} checked={answers.aiPersonalizationConsent} onChange={(checked) => setAnswers((current) => ({ ...current, aiPersonalizationConsent: checked }))} />
          </div>
          <p className="onboarding-legal">{locale === "zh" ? "继续即表示你已阅读《用户协议》和《隐私政策》。只有第一项为使用产品所必需。" : "Continuing confirms you have read the Terms and Privacy Policy. Only the first item is required."}</p>
        </section>
      ) : question ? (
        <section className="onboarding-question">
          <div className="onboarding-question-copy">
            <span>{locale === "zh" ? `画像 ${step + 1}/${questions.length}` : `Profile ${step + 1}/${questions.length}`}</span>
            <h1>{title}</h1>
            <p>{question.hint[locale]}</p>
          </div>
          <div className="onboarding-option-grid">
            {question.options.map((option) => {
              const Icon = option.icon;
              const selected = answers[question.key] === option.value;
              return (
                <button
                  className={selected ? "selected" : ""}
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
                >
                  <span><Icon size={24} strokeWidth={1.8} /></span>
                  <strong>{option.label[locale]}</strong>
                  <small>{option.detail[locale]}</small>
                  {selected && <i aria-hidden="true"><Check size={14} strokeWidth={3} /></i>}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <footer className="onboarding-footer">
        {error && <p role="alert">{error}</p>}
        <button className="onboarding-next" type="button" disabled={!canContinue || busy} onClick={() => void next()}>
          <span>{busy ? (locale === "zh" ? "正在保存" : "Saving") : step === questions.length - 1 ? (locale === "zh" ? "进入 NAVA" : "Enter NAVA") : (locale === "zh" ? "继续" : "Continue")}</span>
          {step === questions.length - 1 ? <Check size={21} /> : <ArrowRight size={21} />}
        </button>
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
