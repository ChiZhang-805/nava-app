import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColdStart, normalizeColdStartDraft, recordedDays, firstRecordObservation } from '../src/services/coldStart.ts';
import type { JournalRecord } from '../src/services/journal.ts';
import { blankFirstNotesProfile, normalizeFirstNotesDraft, isFirstNotesComplete } from '../src/services/onboardingFirstNotes.ts';

test('original notebook restores the added pages without completing an unfinished profile', () => {
  for (const step of ['goal', 'challenge', 'permissions', 'summary']) {
    const draft = normalizeFirstNotesDraft({ profile: blankFirstNotesProfile('en'), step }, 'zh');
    assert.equal(draft?.step, step);
    assert.equal(draft?.profile.language, 'en');
    assert.equal(isFirstNotesComplete(draft?.profile), false);
  }
  assert.equal(normalizeFirstNotesDraft({ profile: blankFirstNotesProfile('zh'), step: 'unknown' }, 'zh')?.step, 'welcome');
});
test('goal-specific answers are validated and permissions require explicit true', () => {
  assert.equal(normalizeColdStart({goal:'sleep',challenge:'stress'}),null);
  assert.equal(normalizeColdStart({goal:'admin',challenge:'unsure'}),null);
  assert.deepEqual(normalizeColdStart({goal:'sleep',challenge:'routine',healthConsent:'true'}),{version:1,goal:'sleep',challenge:'routine',healthConsent:false,aiConsent:false});
});
test('an unfinished goal is restorable but cannot be submitted as complete', () => {
  const draft = normalizeColdStartDraft({goal:'focus',challenge:'routine'});
  assert.equal(draft?.goal,'focus');
  assert.equal(draft?.challenge,'');
  assert.equal(normalizeColdStart(draft),null);
});
const record = (date: string): JournalRecord => ({id:date,category:'sleep',data:{bedtime:'23:30',wakeTime:'07:00',quality:'一般'},recordDate:date,createdAt:new Date().toISOString()});
test('progress counts distinct actual days, excluding future dates', () => {
  assert.equal(recordedDays([record('2026-09-27'),record('2026-09-27'),record('2026-09-28'),record('2026-09-29')],'2026-09-28'),2);
  assert.equal(recordedDays([],'2026-09-28'),0);
});
test('first feedback quotes recorded fields and never invents durations or focus completion', () => {
  assert.deepEqual(firstRecordObservation(record('2026-09-28'),false),['23:30 → 07:00','一般']);
  assert.deepEqual(firstRecordObservation({...record('2026-09-28'),category:'focus',data:{task:'Read',durationMinutes:60},focus:{elapsedMs:120000}},true),['Read','2 minutes recorded']);
  assert.deepEqual(firstRecordObservation({...record('2026-09-28'),data:{}},true),[]);
});
