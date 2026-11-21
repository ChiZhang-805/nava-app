import assert from 'node:assert/strict';
import test from 'node:test';
import { activityTime, calendarActivities, calendarWeek } from '../src/services/calendarTimeline.ts';
import type { TrendBundle } from '../src/types.ts';
const empty:TrendBundle={moods:[],sleeps:[],exercises:[],nutritions:[],faces:[],focus:[],focusDistributions:[],healthMetrics:[],rhythms:[]};
test('week is Monday to Sunday across year and leap-month boundaries',()=>{
 assert.deepEqual(calendarWeek('2026-01-01'),['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
 assert.equal(calendarWeek('2024-03-01')[3],'2024-02-29');
});
test('timeline uses recorded event times and never guesses from save timestamps',()=>{
 const journal=[
  {id:'late',category:'sport' as const,recordDate:'2026-11-22',data:{activity:'散步',startTime:'15:00',endTime:'15:35',durationMinutes:35},createdAt:'2026-11-22T08:00:00Z'},
  {id:'early',category:'food' as const,recordDate:'2026-11-22',data:{meal:'早餐',mealTime:'08:00',foods:['鸡蛋']},createdAt:'2026-11-22T12:00:00Z'},
  {id:'unknown',category:'mood' as const,recordDate:'2026-11-22',data:{mood:'平静'},createdAt:'2026-11-22T01:00:00Z'},
  {id:'other',category:'food' as const,recordDate:'2026-11-21',data:{mealTime:'07:00'},createdAt:'2026-11-22T01:00:00Z'},
 ];
 const rows=calendarActivities({...empty,journal},'2026-11-22','zh');
 assert.deepEqual(rows.map(r=>r.id),['journal-early','journal-late','journal-unknown']);
 assert.equal(rows[2].start,null);assert.equal(rows[0].end,null);
 assert.equal(rows[1].end,'15:35');assert.equal(rows[1].minutes,35);
 assert.equal(rows[0].detail,'鸡蛋');
 assert.equal(activityTime('25:30'),null);assert.equal(activityTime('invalid'),null);
 assert.deepEqual(calendarActivities(empty,'2026-11-22','zh'),[]);
});
test('legacy overnight sleep retains endpoints and missing duration stays missing',()=>{
 const rows=calendarActivities({...empty,sleeps:[{id:'sleep',record_date:'2026-11-22',sleep_start:'23:00',sleep_end:'07:00',sleep_duration_minutes:null} as TrendBundle['sleeps'][number]]},'2026-11-22','zh');
 assert.equal(rows[0].start,'23:00');assert.equal(rows[0].end,'07:00');assert.equal(rows[0].minutes,null);
});
