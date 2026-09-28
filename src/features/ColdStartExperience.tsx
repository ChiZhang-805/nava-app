import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Check, Heart, Home, Moon, Timer, Sparkles } from 'lucide-react';
import MoreMenu from '../components/MoreMenu';
import { useLocale } from '../i18n';
import { firstGoals, firstChallenges, normalizeColdStart, normalizeColdStartDraft, recordedDays, firstRecordObservation, firstRecordNextStep, type ColdStartAnswers, type FirstGoal } from '../services/coldStart';
import { loadProfile } from '../services/profile';
import { getJournalRecords, type JournalRecord } from '../services/journal';
import useDeviceDate from '../hooks/useDeviceDate';
import cat from '../assets/shop/points-cards/printer-cat.webp';
import './cold-start.css';

const goalIcons = { sleep: Moon, focus: Timer, mood: Heart };
function Frame({ title, onBack, children, footer, home = false, menu }: { title: string; onBack: () => void; children: ReactNode; footer?: ReactNode; home?: boolean; menu?: ReactNode }) {
  const { locale } = useLocale(); const [open, setOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.focus({ preventScroll: true }); }, []);
  return <section className="cold-start-screen" ref={section} tabIndex={-1} aria-label={title}>
    <header className="cold-start-header"><button type="button" onClick={onBack} aria-label={home ? (locale === 'zh' ? '返回首页' : 'Home') : (locale === 'zh' ? '返回' : 'Back')}>{home ? <Home /> : <ArrowLeft />}</button><strong>{title}</strong><MoreMenu open={open} onOpenChange={setOpen} label={locale === 'zh' ? '更多选项' : 'More options'}>{menu}</MoreMenu></header>
    <div className="cold-start-content">{children}</div>{footer && <footer className="cold-start-footer">{footer}</footer>}
  </section>;
}
function CatNote({ children }: { children: ReactNode }) { return <div className="cold-cat-note"><img src={cat} alt="" className="cold-cat" /><div className="cold-paper">{children}</div></div>; }

export function ColdStartSetup({ initial, busy, error, onBack, onSave, onDraft }: { initial?: unknown; busy: boolean; error: string | null; onBack: () => void; onSave: (answers: ColdStartAnswers) => void; onDraft: (answers: ColdStartAnswers) => void }) {
  const { locale } = useLocale(), en = locale === 'en';
  const saved = normalizeColdStartDraft(initial);
  const [goal, setGoal] = useState<FirstGoal | null>(saved?.goal ?? null), [challenge, setChallenge] = useState(saved?.challenge ?? '');
  const [health, setHealth] = useState(saved?.healthConsent ?? false), [ai, setAI] = useState(saved?.aiConsent ?? false);
  const [step, setStep] = useState(0);
  useEffect(() => { if (goal) onDraft({ version: 1, goal, challenge, healthConsent: health, aiConsent: ai }); }, [goal, challenge, health, ai, onDraft]);
  const titles = en ? ['What would you like to care for?', 'What feels familiar lately?', 'Our first little plan'] : ['最近，最想照顾好哪一部分？', goal === 'sleep' ? '最近的夜晚，更像哪一种？' : goal === 'focus' ? '专注时，什么最困扰你？' : '最近的心情，更像哪一种？', '从这一件小事开始。'];
  return <Frame title={en ? 'First notes' : '初见手记'} onBack={() => { if (!busy) { if (step) setStep(step - 1); else onBack(); } }} footer={<><div className="cold-dots" aria-label={`${step + 1}/3`}>{[0, 1, 2].map(i => <i key={i} className={i === step ? 'active' : ''} />)}</div>{error && <p role="alert">{error}</p>}<button className="cold-primary" disabled={busy || !goal || (step > 0 && !challenge)} onClick={() => step < 2 ? setStep(step + 1) : onSave({ version: 1, goal: goal!, challenge, healthConsent: health, aiConsent: ai })}>{busy ? (en ? 'Saving…' : '正在保存…') : step === 2 ? (en ? 'Start together' : '一起开始') : (en ? 'Continue' : '继续')}</button></>}>
    <h1>{titles[step]}</h1><CatNote>
      {step === 0 && <div className="cold-options">{firstGoals.map(g => { const Icon = goalIcons[g.id]; return <button key={g.id} aria-pressed={goal === g.id} onClick={() => { setGoal(g.id); setChallenge(''); }}><Icon /><span>{en ? g.en : g.zh}</span>{goal === g.id && <Check />}</button>; })}<p>{en ? 'We can start with one small wish.' : '一个小小的心愿，就很好。'}</p></div>}
      {step === 1 && goal && <div className="cold-options">{[...firstChallenges[goal], ['unsure', '还不确定', 'Not sure yet']].map(c => <button key={c[0]} aria-pressed={challenge === c[0]} onClick={() => setChallenge(c[0])}><span>{c[en ? 2 : 1]}</span>{challenge === c[0] && <Check />}</button>)}</div>}
      {step === 2 && <><h2>{firstGoals.find(g => g.id === goal)?.[en ? 'en' : 'zh']}</h2><p>{en ? 'The cat will show you around your first record, one step at a time. You can pause or skip the guide whenever you like.' : '小猫会带你完成第一次记录，一步一步认识页面。随时都可以暂停或跳过引导。'}</p><div className="cold-consents"><label><input type="checkbox" checked={health} onChange={e => setHealth(e.target.checked)} /><span>{en ? 'Allow connected health data to inform my experience' : '允许结合已连接的健康数据'}<small>{en ? 'Optional. Device access is requested separately.' : '可选；连接设备时另行请求系统授权。'}</small></span></label><label><input type="checkbox" checked={ai} onChange={e => setAI(e.target.checked)} /><span>{en ? 'Personalize AI feedback using my saved records' : '允许 AI 结合历史记录提供个性化反馈'}<small>{en ? 'Optional. You can change this in your profile.' : '可选；之后可在个人资料中修改。'}</small></span></label></div></>}
    </CatNote>
  </Frame>;
}

export function SampleWeeklyReport({ onBack }: { onBack: () => void }) {
  const { locale } = useLocale(), en = locale === 'en';
  return <Frame title={en ? 'Weekly preview' : '周报预览'} onBack={onBack} footer={<button className="cold-primary" onClick={onBack}>{en ? 'Back' : '返回'}</button>}>
    <span className="cold-example">{en ? 'EXAMPLE · NOT YOUR DATA' : '示例周报 · 非本人数据'}</span><h1>{en ? 'Little days, a bigger picture.' : '日常，会慢慢连成线。'}</h1>
    <div className="cold-paper cold-report"><h2>{en ? 'A week of small observations' : '一周的小小观察'}</h2><svg viewBox="0 0 320 155" role="img" aria-label={en ? 'Illustrative trend, not real records' : '示例趋势，不是真实记录'}><path d="M10 125H310M10 85H310M10 45H310" stroke="#d2e6ee" fill="none" /><path d="M10 105L60 80L110 90L160 48L210 68L260 40L310 57" stroke="#3c9cb9" strokeWidth="4" fill="none" strokeLinejoin="round" />{[10, 60, 110, 160, 210, 260, 310].map((x, i) => <text key={x} x={x} y="149" textAnchor="middle" fontSize="12" fill="#527486">{en ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i] : ['一', '二', '三', '四', '五', '六', '日'][i]}</text>)}</svg><h3>{en ? 'What changed?' : '看见变化'}</h3><p>{en ? 'Review sleep, mood and focus across the days you recorded.' : '把记录过的睡眠、情绪和专注放在一起，回看这一周。'}</p><h3>{en ? 'What might be connected?' : '寻找可能的关联'}</h3><p>{en ? 'Explore patterns when enough records exist. A connection is not a cause.' : '数据足够时，再寻找可能的联系。相关不等于因果。'}</p><h3>{en ? 'One small next step' : '下一步，小一点也可以'}</h3><p>{en ? 'A manageable action, grounded in your own records.' : '根据自己的真实记录，挑一个容易做到的小行动。'}</p></div><p className="cold-muted">{en ? 'Your real report depends on available records. This preview is not saved to your history.' : '真实报告取决于已有记录；此示例不会写入你的历史。'}</p>
  </Frame>;
}

export function ColdStartHub({ userId, onHome, onStart, onHealth }: { userId: string; onHome: () => void; onStart: (goal: FirstGoal) => void; onHealth: () => void }) {
  const { locale } = useLocale(), en = locale === 'en', today = useDeviceDate();
  const [goal, setGoal] = useState<FirstGoal>('sleep'), [count, setCount] = useState<number | null>(null), [sample, setSample] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { let alive = true; setError(false); void Promise.all([loadProfile(userId), getJournalRecords(userId)]).then(([p, records]) => { if (alive) { setGoal(normalizeColdStart(p?.onboarding_answers?.coldStart)?.goal ?? 'sleep'); setCount(recordedDays(records, today)); } }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, [userId, today, retry]);
  if (sample) return <SampleWeeklyReport onBack={() => setSample(false)} />;
  return <Frame title={en ? 'A little beginning' : '一起开始'} onBack={onHome} home menu={<><button onClick={() => setSample(true)}><BookOpen /><span>{en ? 'Example report' : '示例周报'}</span></button><button onClick={onHealth}><Heart /><span>{en ? 'Connect health data' : '连接健康数据'}</span></button></>} footer={<><button className="cold-primary" onClick={() => onStart(goal)}>{en ? 'Show me around' : '带我记录一次'}</button><button className="cold-text" onClick={onHome}>{en ? 'Explore on my own' : '我想先自己逛逛'}</button></>}>
    <h1>{en ? 'One little thing, together.' : '先记一件小事，我陪你。'}</h1><CatNote><h2>{en ? 'Where shall we begin?' : '今天，从哪里开始？'}</h2><div className="cold-options">{firstGoals.map(g => { const Icon = goalIcons[g.id]; return <button key={g.id} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}><Icon /><span>{en ? g.en : g.zh}</span>{goal === g.id && <Check />}</button>; })}</div><p>{en ? 'Follow a few gentle pointers on the real record page. Only your final confirmation saves a record.' : '跟着小猫的提示，认识记录页上的操作。最后确认，才会保存记录。'}</p></CatNote>
    {error ? <button className="cold-text" onClick={() => setRetry(v => v + 1)}>{en ? 'Could not load progress. Retry' : '进度暂未加载，点击重试'}</button> : <div className="cold-progress"><span>{count === null ? (en ? 'Loading progress…' : '正在读取进度…') : en ? `${count} days with records` : `已经留下 ${count} 天的记录`}</span><progress max="7" value={Math.min(count ?? 0, 7)} /><small>{en ? 'No need to fill in everything every day.' : '不用每天都很完整，想到就记一点。'}</small></div>}
    <button className="cold-text" onClick={() => setSample(true)}><BookOpen size={18} />{en ? 'See an example weekly report' : '看看未来的周报'}</button>
  </Frame>;
}

export function FirstRecordFeedback({ record, onClose }: { record: JournalRecord; onClose: () => void }) {
  const { locale } = useLocale(), en = locale === 'en'; const [sample, setSample] = useState(false);
  const next = firstRecordNextStep(record.category, en);
  if (sample) return <SampleWeeklyReport onBack={() => setSample(false)} />;
  return <Frame title={en ? 'Our first record' : '第一笔记录'} onBack={onClose} menu={<button onClick={() => setSample(true)}><BookOpen /><span>{en ? 'Example report' : '示例周报'}</span></button>} footer={<button className="cold-primary" onClick={onClose}>{en ? 'View my record' : '看看我的记录'}</button>}>
    <h1>{en ? 'A little more about you.' : '第一笔，记下了。'}</h1><CatNote><h2>{en ? 'You just recorded' : '刚刚留下的小事'}</h2><time>{record.recordDate}</time>{firstRecordObservation(record, en).map((line, i) => <p className="cold-fact" key={i}>{line}</p>)}<p>{next.meaning}</p><div className="cold-next"><Sparkles size={20} /><p>{next.action}</p></div><p className="cold-muted">{en ? 'One record is a beginning; it does not establish a pattern. This is an observation, not a diagnosis.' : '一条记录是开始，还不能用来判断规律。这是一份观察，不是诊断。'}</p></CatNote><button className="cold-text" onClick={() => setSample(true)}>{en ? 'Preview a weekly report' : '看看未来的周报'}</button>
  </Frame>;
}
