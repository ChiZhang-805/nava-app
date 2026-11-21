import type { TrendBundle } from '../types';

export type CalendarActivity = { id: string; title: string; detail: string; start: string | null; end: string | null; minutes: number | null };
const labels = { mood:['心情记录','Mood'], food:['饮食记录','Meal'], sleep:['睡眠','Sleep'], sport:['运动','Activity'], focus:['专注','Focus'], face:['面部记录','Face'] };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const minutes = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
export function activityTime(value: unknown): string | null {
  const s = text(value);
  if (/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s)) return s.slice(0,5);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
export function calendarWeek(date: string) {
  const [y,m,d] = date.split('-').map(Number);
  const current = new Date(y,m-1,d,12);
  const offset = (current.getDay()+6)%7;
  return Array.from({length:7},(_,i)=>{
    const day = new Date(y,m-1,d-offset+i,12);
    return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  });
}
/** Only explicit activity times are displayed. Save/update timestamps are not event times. */
export function calendarActivities(bundle: TrendBundle | null, date: string, locale: 'zh'|'en'): CalendarActivity[] {
  if (!bundle) return [];
  const zh = locale==='zh';
  const activities: CalendarActivity[] = (bundle.journal??[]).filter(r=>r.recordDate===date).map(r=>{
    const d=r.data;
    const title = text(d.task)||text(d.activity)||(r.category==='food'?text(d.meal):'')||labels[r.category][zh?0:1];
    const foods=Array.isArray(d.foods)?d.foods.map(item=>typeof item==='string'?item:text((item as {name?:unknown})?.name)).filter(Boolean).join('、'):text(d.foods);
    return {id:`journal-${r.id}`,title,detail:foods||text(d.notes)||text(d.reason)||text(d.feeling),
      start:activityTime(r.category==='sleep'?d.bedtime:r.category==='food'?d.mealTime:r.category==='focus'?r.focus?.startedAt??d.startedAt:d.startTime),
      end:activityTime(r.category==='sleep'?d.wakeTime:r.category==='focus'?r.focus?.endedAt??d.endedAt:d.endTime),
      minutes:minutes(d.durationMinutes)};
  });
  const add = (id:string,title:string,detail:string,start:unknown=null,end:unknown=null,duration:unknown=null) => activities.push({id,title,detail,start:activityTime(start),end:activityTime(end),minutes:minutes(duration)});
  for(const r of bundle.sleeps.filter(r=>r.record_date===date)) add(`sleep-${r.id}`,zh?'睡眠':'Sleep',r.self_note??'',r.sleep_start,r.sleep_end,r.sleep_duration_minutes);
  for(const r of bundle.focus.filter(r=>r.record_date===date)) add(`focus-${r.id}`,zh?'专注':'Focus',r.note??'',r.started_at,r.ended_at,r.total_minutes);
  for(const r of bundle.exercises.filter(r=>r.record_date===date)) add(`sport-${r.id}`,zh?'运动':'Activity',r.self_note??'',null,null,r.exercise_minutes);
  for(const r of bundle.moods.filter(r=>r.record_date===date)) add(`mood-${r.id}`,zh?'心情记录':'Mood',r.diary_content??'');
  for(const r of bundle.faces.filter(r=>r.record_date===date)) add(`face-${r.id}`,zh?'面部记录':'Face','');
  for(const r of bundle.nutritions.filter(r=>r.record_date===date)) {
    let added=false;
    for(const [key,zhName,enName] of [['breakfast','早餐','Breakfast'],['lunch','午餐','Lunch'],['dinner','晚餐','Dinner'],['pantry','加餐','Snack']] as const) {
      const items=r[`${key}_items`]??[];const at=r[`${key}_time`];
      if(items.length||at||(`${key}_photo_url` in r && r[`${key}_photo_url` as keyof typeof r])) {
        added=true;add(`food-${r.id}-${key}`,zh?zhName:enName,items.map(i=>i.name).join('、'),at);
      }
    }
    if(!added)add(`food-${r.id}`,zh?'饮食记录':'Meal','');
  }
  return activities.sort((a,b)=>(a.start??'99:99').localeCompare(b.start??'99:99')||a.id.localeCompare(b.id));
}
