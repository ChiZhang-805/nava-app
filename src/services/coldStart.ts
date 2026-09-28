import type { JournalRecord } from './journal';

export type FirstGoal = 'sleep' | 'focus' | 'mood';
export type ColdStartAnswers = { version: 1; goal: FirstGoal; challenge: string; healthConsent: boolean; aiConsent: boolean };
export const firstGoals = [
  { id: 'sleep', zh: '睡得更好', en: 'Sleep better' },
  { id: 'focus', zh: '更容易专注', en: 'Find my focus' },
  { id: 'mood', zh: '心情更安稳', en: 'Feel more settled' },
] as const;
export const firstChallenges = {
  sleep: [['falling', '很难入睡', 'Getting to sleep'], ['waking', '夜里容易醒', 'Waking during the night'], ['tired', '睡醒还是累', 'Waking up tired'], ['routine', '作息不太规律', 'An irregular routine']],
  focus: [['starting', '开始一件事有点难', 'Getting started'], ['distracted', '容易分心', 'Getting distracted'], ['energy', '很快就累了', 'Running out of energy'], ['planning', '不太知道怎么安排', 'Planning my time']],
  mood: [['stress', '最近压力有点大', 'Feeling under pressure'], ['upsdown', '心情起伏比较多', 'Ups and downs'], ['words', '不太容易说清感受', 'Finding words for feelings'], ['understand', '想更了解自己', 'Understanding myself']],
} as const;
export function normalizeColdStartDraft(value: unknown): ColdStartAnswers | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ColdStartAnswers>;
  if (!firstGoals.some(g => g.id === v.goal)) return null;
  const challenge = firstChallenges[v.goal!].some(c => c[0] === v.challenge) || v.challenge === 'unsure' ? v.challenge! : '';
  return { version: 1, goal: v.goal!, challenge, healthConsent: v.healthConsent === true, aiConsent: v.aiConsent === true };
}
export function normalizeColdStart(value: unknown): ColdStartAnswers | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ColdStartAnswers>;
  if (!firstGoals.some(g => g.id === v.goal)) return null;
  if (!firstChallenges[v.goal!].some(c => c[0] === v.challenge) && v.challenge !== 'unsure') return null;
  return { version: 1, goal: v.goal!, challenge: v.challenge!, healthConsent: v.healthConsent === true, aiConsent: v.aiConsent === true };
}
/** Count real distinct record dates, never visits or questionnaire answers. */
export function recordedDays(records: JournalRecord[], today: string) {
  return new Set(records.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.recordDate) && r.recordDate <= today).map(r => r.recordDate)).size;
}
/** A factual receipt, not a fabricated AI response or a health assessment. */
export function firstRecordObservation(record: JournalRecord, en: boolean) {
  const data = record.data;
  const text = (key: string) => typeof data[key] === 'string' || typeof data[key] === 'number' ? String(data[key]).slice(0, 180) : '';
  const lines: Record<JournalRecord['category'], string[]> = {
    sleep: [text('bedtime') && text('wakeTime') ? `${text('bedtime')} → ${text('wakeTime')}` : '', text('quality')],
    mood: [text('mood'), text('reason')],
    food: [text('meal'), text('foods'), text('portion')],
    sport: [text('activity'), text('durationMinutes') ? `${text('durationMinutes')} ${en ? 'minutes' : '分钟'}` : '', text('notes')],
    focus: [text('task'), record.focus && typeof record.focus.elapsedMs === 'number' ? `${Math.round(record.focus.elapsedMs / 60000)} ${en ? 'minutes recorded' : '分钟已记录'}` : ''],
    face: [text('feeling'), text('eyeArea'), text('skinAppearance')],
  };
  return lines[record.category].filter(Boolean);
}
/** Descriptive next steps, not inferred diagnoses or an invented model answer. */
export function firstRecordNextStep(category: JournalRecord['category'], en: boolean) {
  const copy = {
    sleep: ['入睡、醒来时间和醒后的感受，能一起作为下次比较的起点。', '下次醒来时，再记一下精神如何；若夜里醒过，也可以补一句。', 'Bedtime, wake time and how you felt provide a starting point for your next comparison.', 'Next time you wake, note how refreshed you feel and any time spent awake during the night.'],
    focus: ['实际专注时长记录了投入的时间，并不等同于效率。', '给这次专注留一句感受：顺畅、费力，或中途分心了？', 'Recorded focus time describes time spent, not productivity.', 'Add one reflection: did the session feel smooth, difficult or interrupted?'],
    mood: ['这是一张此刻心情的快照，不需要用它概括一整天。', '愿意的话，补一句当时发生了什么；也可以先停在这里。', 'This is a snapshot of one moment, not a label for your whole day.', 'If you like, note what was happening. It is also fine to leave it here.'],
    food: ['餐次、食物与份量，为之后回看用餐结构留下了线索。', '下次尽量补上大概份量；不确定时保留“不确定”，不用猜出营养数值。', 'The meal, foods and portions leave clues for a later look at your eating patterns.', 'Next time, add an approximate portion if you know it. Do not guess nutrition values.'],
    sport: ['运动项目和时长描述了这次活动，不能单独判断训练负荷。', '稍后留意身体感受，下次把疲劳或酸痛也记在备注中。', 'The activity and duration describe this session, but do not establish training load.', 'Notice how you feel afterwards, and include fatigue or soreness in your next notes.'],
    face: ['这次观察保留了当下的感受；照片受光线和角度影响，不用于诊断。', '下次尽量在相近的光线、角度下记录，才更方便自己比较。', 'This check-in captures your observations. Lighting and angle affect photos; they are not diagnostic.', 'Use similar lighting and angles next time to make your own comparison easier.'],
  }[category];
  return { meaning: copy[en ? 2 : 0], action: copy[en ? 3 : 1] };
}
