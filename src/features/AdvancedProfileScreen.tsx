import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Brain,
  BriefcaseBusiness,
  Camera,
  Check,
  HeartPulse,
  Images,
  Loader2,
  MoreHorizontal,
  MoonStar,
  Save,
  ShieldCheck,
  Target,
  Utensils,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import PageSkeleton from "../components/PageSkeleton";
import { loadProfile, saveProfile, saveProfileAvatar, type UserProfile } from "../services/profile";

type Draft = {
  username: string;
  ageGroup: string;
  occupation: string;
  mbti: string;
  goal: string;
  sleepSchedule: string;
  exerciseFrequency: string;
  dietPreference: string;
  stressFactors: string;
  healthDataConsent: boolean;
  aiPersonalizationConsent: boolean;
};

const emptyDraft: Draft = {
  username: "",
  ageGroup: "",
  occupation: "",
  mbti: "",
  goal: "",
  sleepSchedule: "",
  exerciseFrequency: "",
  dietPreference: "",
  stressFactors: "",
  healthDataConsent: false,
  aiPersonalizationConsent: false,
};

function draftFromProfile(profile: UserProfile | null): Draft {
  if (!profile) return emptyDraft;
  return {
    username: profile.username ?? "",
    ageGroup: profile.age_group ?? "",
    occupation: profile.occupation ?? "",
    mbti: profile.mbti ?? "",
    goal: profile.goal ?? "",
    sleepSchedule: profile.sleep_schedule ?? "",
    exerciseFrequency: profile.exercise_frequency ?? "",
    dietPreference: profile.diet_preference ?? "",
    stressFactors: profile.stress_factors ?? "",
    healthDataConsent: Boolean(profile.health_data_consent),
    aiPersonalizationConsent: Boolean(profile.ai_personalization_consent),
  };
}

export default function AdvancedProfileScreen({ user, onBack, onChanged }: { user: User; onBack: () => void; onChanged: () => void }) {
  const { locale } = useLocale();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const preferencesRef = useRef<HTMLElement | null>(null);
  const copy = <T,>(zh: T, en: T) => locale === "zh" ? zh : en;

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadProfile(user.id)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setDraft(draftFromProfile(result));
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => setAvatarLoadFailed(false), [profile?.avatar_url]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const completeness = useMemo(() => {
    const values = [draft.username, draft.ageGroup, draft.occupation, draft.mbti, draft.goal, draft.sleepSchedule, draft.exerciseFrequency, draft.dietPreference, draft.stressFactors];
    return Math.round(values.filter((value) => value.trim()).length / values.length * 100);
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setAvatarSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setAvatarSaved(false);
    setError(null);
    try {
      const result = await saveProfile({
        id: user.id,
        username: draft.username.trim() || null,
        age_group: draft.ageGroup || null,
        occupation: draft.occupation || null,
        mbti: draft.mbti || null,
        goal: draft.goal.trim() || null,
        sleep_schedule: draft.sleepSchedule.trim() || null,
        exercise_frequency: draft.exerciseFrequency || null,
        diet_preference: draft.dietPreference.trim() || null,
        stress_factors: draft.stressFactors.trim() || null,
        health_data_consent: draft.healthDataConsent,
        ai_personalization_consent: draft.aiPersonalizationConsent,
      });
      setProfile(result);
      setDraft(draftFromProfile(result));
      setSaved(true);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarFile(file: File | null) {
    setAvatarSheetOpen(false);
    if (!file) return;
    setAvatarSaving(true);
    setAvatarSaved(false);
    setSaved(false);
    setError(null);
    try {
      const avatarUrl = await saveProfileAvatar(user.id, file);
      setProfile((current) => current ? { ...current, avatar_url: avatarUrl } : {
        id: user.id,
        username: draft.username.trim() || null,
        height: null,
        weight: null,
        occupation: draft.occupation || null,
        goal: draft.goal.trim() || null,
        mbti: draft.mbti || null,
        exercise_frequency: draft.exerciseFrequency || null,
        sleep_schedule: draft.sleepSchedule.trim() || null,
        diet_preference: draft.dietPreference.trim() || null,
        stress_factors: draft.stressFactors.trim() || null,
        avatar_url: avatarUrl,
      });
      setAvatarSaved(true);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAvatarSaving(false);
    }
  }

  return (
    <section className="home-experience advanced-profile-screen" data-home-view="profile-details">
      <header className="home-experience-header">
        <button className="home-experience-back" type="button" onClick={onBack} aria-label={copy("返回首页", "Back home")}><ArrowLeft size={22} /></button>
        <div><h1>{copy("详细资料设置", "Detailed profile")}</h1></div>
        <div className="advanced-profile-header-menu-wrap" ref={menuRef}>
          <button className="advanced-profile-header-icon" type="button" aria-label={copy("更多资料操作", "More profile actions")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={23} /></button>
          {menuOpen && <div className="app-utility-popover advanced-profile-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setAvatarSheetOpen(true); }}><Camera size={17} />{copy("更换头像", "Change avatar")}</button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); preferencesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><ShieldCheck size={17} />{copy("数据与 AI 偏好", "Data & AI preferences")}</button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); formRef.current?.requestSubmit(); }}><Save size={17} />{copy("保存详细资料", "Save profile")}</button>
          </div>}
        </div>
      </header>

      {loading ? <PageSkeleton variant="advanced-profile" /> : (
        <>
          <section className="advanced-profile-identity">
            <button className="advanced-profile-avatar" data-profile-details-avatar type="button" aria-label={copy("更换头像", "Change avatar")} title={copy("更换头像", "Change avatar")} onClick={() => setAvatarSheetOpen(true)} disabled={avatarSaving}>
              {avatarSaving ? <Loader2 className="spin" size={21} /> : profile?.avatar_url && !avatarLoadFailed ? <img src={profile.avatar_url} alt="" onError={() => setAvatarLoadFailed(true)} /> : <span>{(profile?.username || user.email || "N").slice(0, 1).toUpperCase()}</span>}
            </button>
            <div><strong>{profile?.username || copy("NAVA 用户", "NAVA user")}</strong><small>{user.email || user.phone || copy("已登录账号", "Signed-in account")}</small></div>
            <div className="advanced-profile-completeness"><b>{completeness}%</b><span>{copy("资料完整度", "Complete")}</span></div>
          </section>

          <form className="advanced-profile-form" ref={formRef} onSubmit={submit}>
          <section className="advanced-profile-section">
            <header><span><BriefcaseBusiness size={20} /></span><div><strong>{copy("身份与阶段", "Identity & stage")}</strong><small>{copy("帮助 NAVA 调整表达方式与建议强度", "Shapes NAVA's tone and recommendations")}</small></div></header>
            <label><span>{copy("昵称", "Nickname")}</span><input value={draft.username} onChange={(event) => update("username", event.target.value)} placeholder={copy("你希望 NAVA 如何称呼你", "How should NAVA address you?")} /></label>
            <div className="advanced-profile-two-col">
              <label><span>{copy("年龄阶段", "Age group")}</span><select value={draft.ageGroup} onChange={(event) => update("ageGroup", event.target.value)}><option value="">{copy("请选择", "Choose")}</option><option value="under_18">{copy("18 岁以下", "Under 18")}</option><option value="18_24">18–24</option><option value="25_34">25–34</option><option value="35_44">35–44</option><option value="45_plus">45+</option></select></label>
              <label><span>{copy("主要身份", "Primary role")}</span><select value={draft.occupation} onChange={(event) => update("occupation", event.target.value)}><option value="">{copy("请选择", "Choose")}</option><option value="student">{copy("学生", "Student")}</option><option value="employee">{copy("职场人士", "Employee")}</option><option value="freelance">{copy("自由职业", "Freelance")}</option><option value="caregiver">{copy("居家照护", "Home carer")}</option><option value="retired">{copy("退休人士", "Retired")}</option><option value="other">{copy("其他", "Other")}</option></select></label>
            </div>
            <label><span>MBTI</span><input value={draft.mbti} maxLength={4} onChange={(event) => update("mbti", event.target.value.toUpperCase())} placeholder="INFJ / ENTP" /></label>
          </section>

          <section className="advanced-profile-section">
            <header><span><HeartPulse size={20} /></span><div><strong>{copy("节律与生活方式", "Rhythm & lifestyle")}</strong><small>{copy("这些资料会参与个性化分析", "Used for personalized analysis")}</small></div></header>
            <label><span><MoonStar size={15} />{copy("常规作息", "Usual sleep schedule")}</span><input value={draft.sleepSchedule} onChange={(event) => update("sleepSchedule", event.target.value)} placeholder={copy("例如：23:30 入睡，07:10 起床", "e.g. 23:30–07:10")} /></label>
            <label><span><Target size={15} />{copy("运动频率", "Exercise frequency")}</span><select value={draft.exerciseFrequency} onChange={(event) => update("exerciseFrequency", event.target.value)}><option value="">{copy("请选择", "Choose")}</option><option value="rare">{copy("很少运动", "Rarely")}</option><option value="1_2_week">{copy("每周 1–2 次", "1–2 times/week")}</option><option value="3_4_week">{copy("每周 3–4 次", "3–4 times/week")}</option><option value="5_plus_week">{copy("每周 5 次以上", "5+ times/week")}</option></select></label>
            <label><span><Utensils size={15} />{copy("饮食偏好", "Diet preferences")}</span><textarea rows={2} value={draft.dietPreference} onChange={(event) => update("dietPreference", event.target.value)} placeholder={copy("忌口、过敏、饮食习惯", "Allergies, restrictions, preferences")} /></label>
          </section>

          <section className="advanced-profile-section">
            <header><span><Brain size={20} /></span><div><strong>{copy("目标与压力画像", "Goals & stress profile")}</strong><small>{copy("让建议更贴近你的真实生活", "Keeps recommendations grounded in your life")}</small></div></header>
            <label><span>{copy("当前最重要的健康目标", "Main health goal")}</span><textarea rows={2} value={draft.goal} onChange={(event) => update("goal", event.target.value)} placeholder={copy("例如：稳定作息、减少疲劳、保持专注", "e.g. stabilize sleep and improve focus")} /></label>
            <label><span>{copy("主要压力来源", "Main stressors")}</span><textarea rows={2} value={draft.stressFactors} onChange={(event) => update("stressFactors", event.target.value)} placeholder={copy("学业、工作、家庭、睡眠等", "Study, work, family, sleep, etc.")} /></label>
          </section>

          <section className="advanced-profile-section advanced-profile-consents" ref={preferencesRef}>
            <header><span><ShieldCheck size={20} /></span><div><strong>{copy("数据与 AI 偏好", "Data & AI preferences")}</strong><small>{copy("随时可以修改，不影响账号登录", "Change anytime without affecting sign-in")}</small></div></header>
            <label className="advanced-profile-switch"><span><b>{copy("健康数据分析", "Health data analysis")}</b><small>{copy("允许使用已保存的健康记录生成趋势", "Use saved health records for trends")}</small></span><span className={`advanced-profile-switch-control${draft.healthDataConsent ? " is-checked" : ""}`}><input type="checkbox" checked={draft.healthDataConsent} onChange={(event) => update("healthDataConsent", event.target.checked)} /><i aria-hidden="true" /></span></label>
            <label className="advanced-profile-switch"><span><b>{copy("AI 个性化", "AI personalization")}</b><small>{copy("结合身份、目标和近况调整回复", "Tailor replies using your profile and recent data")}</small></span><span className={`advanced-profile-switch-control${draft.aiPersonalizationConsent ? " is-checked" : ""}`}><input type="checkbox" checked={draft.aiPersonalizationConsent} onChange={(event) => update("aiPersonalizationConsent", event.target.checked)} /><i aria-hidden="true" /></span></label>
          </section>

          {error && <p className="home-experience-error" role="alert">{error}</p>}
          {avatarSaved && <p className="advanced-profile-saved" role="status"><Check size={17} />{copy("头像已更新", "Avatar updated")}</p>}
          {saved && <p className="advanced-profile-saved" role="status"><Check size={17} />{copy("详细资料已保存", "Detailed profile saved")}</p>}
          <button className="advanced-profile-save" type="submit" disabled={saving}>{saved ? <Check size={20} /> : <Save size={20} />}{saving ? copy("正在保存…", "Saving…") : copy("保存详细资料", "Save detailed profile")}</button>
          </form>

          <input ref={galleryInputRef} data-profile-avatar-input="gallery" className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void handleAvatarFile(file); }} />
          <input ref={cameraInputRef} data-profile-avatar-input="camera" className="visually-hidden" type="file" accept="image/*" capture="user" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void handleAvatarFile(file); }} />
          {avatarSheetOpen && <div className="avatar-sheet-overlay" role="presentation" onClick={() => setAvatarSheetOpen(false)}>
            <section className="avatar-sheet" role="dialog" aria-modal="true" aria-label={copy("更换头像", "Change avatar")} onClick={(event) => event.stopPropagation()}>
              <div className="section-heading"><h2>{copy("更换头像", "Change avatar")}</h2><button className="section-icon-action" type="button" aria-label={copy("关闭", "Close")} onClick={() => setAvatarSheetOpen(false)}><X size={21} /></button></div>
              <div className="avatar-sheet-actions">
                <button type="button" onClick={() => cameraInputRef.current?.click()}><Camera size={22} /><span>{copy("调用摄像头拍摄", "Take a photo")}</span></button>
                <button type="button" onClick={() => galleryInputRef.current?.click()}><Images size={22} /><span>{copy("从相册选择", "Choose from library")}</span></button>
              </div>
            </section>
          </div>}
        </>
      )}
    </section>
  );
}
