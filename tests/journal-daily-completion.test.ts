import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { claimJournalDailyCompletion as claim } from '../src/services/journalDailyCompletion.ts';

const now = new Date(2026, 10, 20, 12);
const saved = (category = 'mood', id = 'new', date = now, version = 1) => ({ id, category, createdAt: date.toISOString(), version });
function store() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test('each of six categories can be the first acknowledged entry', () => {
  for (const category of ['mood', 'food', 'sport', 'focus', 'sleep', 'face']) assert.equal(claim('user', saved(category), [], now, store()), true);
});
test('one receipt across categories, repeated callbacks, navigation and a new service instance', () => {
  const storage = store();
  assert.equal(claim('user', saved(), [], now, storage), true);
  for (const category of ['mood', 'food', 'sport', 'focus', 'sleep', 'face']) assert.equal(claim('user', saved(category, category), [], now, storage), false);
  const restartedStorage = { getItem: storage.getItem, setItem: storage.setItem };
  assert.equal(claim('user', saved('sleep', 'restart'), [], now, restartedStorage), false);
  const tomorrow = new Date(2026, 10, 21, 0, 1);
  assert.equal(claim('user', saved('sleep', 'tomorrow', tomorrow), [], tomorrow, restartedStorage), true);
  assert.equal(claim('other-user', saved(), [], now, storage), true);
});
test('existing same-day server entries suppress replay even with empty local storage', () => {
  assert.equal(claim('user', saved(), [saved('food', 'previous')], now, store()), false);
  assert.equal(claim('user', saved(), [saved()], now, store()), false);
  const yesterday = new Date(2026, 10, 19, 23, 59);
  assert.equal(claim('user', saved(), [saved('food', 'old', yesterday)], now, store()), true);
  assert.equal(claim('user', saved('mood', 'edited', yesterday, 2), [], now, store()), false);
});
test('non-journal, edits, absent server acknowledgement and unpersisted claims do not present', () => {
  const storage = store();
  for (const category of ['checkin', 'ai', 'task', 'share', 'goal', 'nutrition', 'exercise', '']) assert.equal(claim('user', saved(category), [], now, storage), false);
  for (const version of [0, 2, 3]) assert.equal(claim('user', saved('mood', 'edit', now, version), [], now, storage), false);
  assert.equal(claim('user', { ...saved(), version: undefined }, [], now, storage), false);
  assert.equal(claim('user', { ...saved(), createdAt: 'invalid' }, [], now, storage), false);
  assert.equal(claim('', saved(), [], now, storage), false);
  assert.equal(claim('user', saved(), [], now, { getItem: () => null, setItem: () => { throw Error('Storage blocked'); } }), false);
  assert.equal(claim('user', saved(), [], now, { getItem: () => null, setItem: () => {} }), false);
  assert.equal(claim('user', saved(), [], now, storage), true, 'invalid attempts did not consume the receipt');
});
test('parent claims only after persistence; all three record paths consume explicit receipts', () => {
  const bridge = readFileSync('src/features/JournalExperience.tsx', 'utf8');
  assert.match(bridge, /const saved=await saveJournal[\s\S]*?showDailyCompletion:[^\n]*claimJournalDailyCompletion/);
  const app = readFileSync('public/journal/js/app.js', 'utf8');
  assert.equal((app.match(/finishSavedRecord\(state.record\)/g) ?? []).length, 3);
  assert.equal((app.match(/navigate\("celebrate"\)/g) ?? []).length, 1);
  assert.match(app, /const celebrate = record.showDailyCompletion === true;\s*delete record.showDailyCompletion;\s*if \(!celebrate\) \{ openReview/);
  assert.doesNotMatch(readFileSync('src/App.tsx', 'utf8'), /rewardQueue|setRewardQueue/);
});
