import { supabase, authenticatedFunctionHeaders } from './supabaseClient';
import { appConfig } from '../config';
import { emitReminderRecordSaved } from './independentReminders';
import { growthRewardRpc } from './growthRewardRpc';
import { isDemoMode } from './demo';

export type JournalCategory = 'mood' | 'food' | 'focus' | 'sport' | 'sleep' | 'face';
export type JournalRecord = { id: string; category: JournalCategory; recordDate: string; data: Record<string, unknown>; createdAt: string; updatedAt?: string; version?: number; expectedUpdatedAt?: string; source?: string; estimated?: boolean; focus?: Record<string, unknown> | null; mediaPath?: string | null };
type Row = { id: string; category: JournalCategory; record_date: string; fields: Record<string, unknown>; created_at: string; updated_at: string; version: number; source: string; estimated: boolean; focus: Record<string, unknown> | null; media_path: string | null };
const fromRow = (r: Row): JournalRecord => ({ id:r.id, category:r.category, recordDate:r.record_date, data:r.fields, createdAt:r.created_at, updatedAt:r.updated_at, version:r.version, source:r.source, estimated:r.estimated, focus:r.focus, mediaPath:r.media_path });
const DEMO_JOURNAL_KEY='nava.review.demo.journal.v1';
const DEMO_JOURNAL_SETTINGS_KEY='nava.review.demo.journal-settings.v1';
const DEMO_JOURNAL_DEFAULT_SETTINGS:Record<string,unknown>={
  'fluffy-first-guide-sleep':true,'fluffy-first-guide-sport':true,'fluffy-first-guide-mood':true,
  'fluffy-first-guide-focus':true,'fluffy-first-guide-food':true,'fluffy-first-guide-face':true,
};

function readDemoRecords(){
  if(typeof window==='undefined')return [] as JournalRecord[];
  try{
    const parsed=JSON.parse(window.localStorage.getItem(DEMO_JOURNAL_KEY)??'[]');
    return Array.isArray(parsed)?parsed as JournalRecord[]:[];
  }catch{return [];}
}
function writeDemoRecords(records:JournalRecord[]){
  if(typeof window!=='undefined')window.localStorage.setItem(DEMO_JOURNAL_KEY,JSON.stringify(records));
}
function readDemoSettings(){
  if(typeof window==='undefined')return {...DEMO_JOURNAL_DEFAULT_SETTINGS};
  try{
    const parsed=JSON.parse(window.localStorage.getItem(DEMO_JOURNAL_SETTINGS_KEY)??'{}');
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?{...DEMO_JOURNAL_DEFAULT_SETTINGS,...parsed}:{...DEMO_JOURNAL_DEFAULT_SETTINGS};
  }catch{return {...DEMO_JOURNAL_DEFAULT_SETTINGS};}
}

/** Page through all confirmed records. RLS remains authoritative, including after logout. */
export async function loadJournal(userId: string) {
  if(isDemoMode())return {records:readDemoRecords(),settings:readDemoSettings()};
  const records=await getJournalRecords(userId);
  const {data,error}=await supabase.from('journal_preferences').select('settings').eq('user_id',userId).maybeSingle();
  if(error) throw error;
  return {records, settings:(data?.settings ?? {}) as Record<string,unknown>};
}
export async function getJournalRecords(userId:string,startDate?:string,endDate?:string){
  if(isDemoMode())return readDemoRecords()
    .filter(record=>(!startDate||record.recordDate>=startDate)&&(!endDate||record.recordDate<=endDate))
    .sort((a,b)=>b.recordDate.localeCompare(a.recordDate)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const records: JournalRecord[] = [];
  for (let offset=0;;offset+=500) {
    let query=supabase.from('journal_entries').select('*').eq('user_id',userId);
    if(startDate)query=query.gte('record_date',startDate);
    if(endDate)query=query.lte('record_date',endDate);
    const {data,error}=await query.order('record_date',{ascending:false}).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
    if(error) throw error;
    records.push(...(data as Row[]).map(fromRow));
    if(data.length<500) break;
  }
  return records;
}

/** The server owns timestamps, account identity and optimistic concurrency. */
export async function saveJournal(record: JournalRecord, expectedVersion: number | null) {
  if(isDemoMode()){
    const records=readDemoRecords(),index=records.findIndex(item=>item.id===record.id),existing=index>=0?records[index]:null;
    if(existing&&expectedVersion!==null&&(existing.version??1)!==expectedVersion)throw Error('Record was updated elsewhere');
    const now=new Date().toISOString();
    const saved:JournalRecord={...record,createdAt:existing?.createdAt??record.createdAt??now,updatedAt:now,version:(existing?.version??0)+1,source:record.source??'manual',estimated:record.estimated??false};
    if(index>=0)records[index]=saved;else records.push(saved);
    writeDemoRecords(records);
    return saved;
  }
  const {data,error}=await growthRewardRpc('save_journal_entry',{p_record:record,p_expected_version:expectedVersion});
  if(error) throw error;
  const saved=fromRow(data as Row);
  const meal=saved.category==='food'?({早餐:'breakfast',午餐:'lunch',晚餐:'dinner'} as const)[String(saved.data.meal) as '早餐'|'午餐'|'晚餐']:null;
  const kind=saved.category==='sport'?'exercise':saved.category==='food'?meal:saved.category;
  if(kind)emitReminderRecordSaved((data as Row & {user_id:string}).user_id,saved.recordDate,kind);
  return saved;
}
export async function deleteJournal(userId:string,id:string) {
  if(isDemoMode()){
    const records=readDemoRecords(),next=records.filter(record=>record.id!==id);
    if(next.length===records.length)throw Error('Record no longer exists');
    writeDemoRecords(next);return;
  }
  const {data,error}=await supabase.from('journal_entries').delete().eq('user_id',userId).eq('id',id).select('id');
  if(error) throw error;
  if(data.length!==1) throw Error('Record no longer exists');
}
export async function saveJournalSettings(userId:string,settings:Record<string,unknown>) {
  if(isDemoMode()){
    if(typeof window!=='undefined')window.localStorage.setItem(DEMO_JOURNAL_SETTINGS_KEY,JSON.stringify(settings));
    return;
  }
  const {error}=await supabase.from('journal_preferences').upsert({user_id:userId,settings,updated_at:new Date().toISOString()});
  if(error) throw error;
}

/** No provider credential leaves Supabase. Abort is passed to the real HTTP boundary. */
export async function journalAI(body:unknown,signal:AbortSignal) {
  const response=await fetch(`${appConfig.supabaseUrl}/functions/v1/journal-assistant`,{
    method:'POST', headers:{...await authenticatedFunctionHeaders(),apikey:appConfig.supabaseKey,'Content-Type':'application/json'}, body:JSON.stringify(body), signal,
  });
  const data=await response.json();
  if(!response.ok) throw Error(data.error || 'AI 暂时不可用，请重试。');
  return data;
}
