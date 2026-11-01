import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeDaily, mergeDiscoveries, normalizeDaily, parseDiscoveries } from '../src/shared/account.js';
import type { DailyProgress } from '../src/shared/daily.js';
import type { Atlas } from '../src/shared/countries.js';

const day = new Date().toISOString().slice(0, 10);
const ids = new Set(['BRA', 'ARG', 'CHE']);
const guess = { countryId: 'BRA', distance: 500, correct: false, border: false, band: 'cold' as const };
const empty: DailyProgress = { day, guesses: [], targetId: null, won: false };
const partial: DailyProgress = { ...empty, guesses: [guess] };
const won: DailyProgress = { day, guesses: [guess, { ...guess, countryId: 'CHE', distance: 0, correct: true, band: 'correct' }], targetId: 'CHE', won: true };
class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()].at(index) ?? null; }
  clear() { this.values.clear(); }
}
beforeEach(() => {
  vi.resetModules(); vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('localStorage', new MemoryStorage());
});
describe('account progress merging', () => {
  it('unites discoveries and retains the earliest known date without erasing unknown-date discoveries', () => {
    expect(mergeDiscoveries({ BRA: 1000, CHE: null }, { BRA: 2000, ARG: 1500, CHE: 1200 }))
      .toEqual({ ARG: 1500, BRA: 1000, CHE: 1200 });
    expect(parseDiscoveries({ BRA: null, ARG: -1, CHE: Date.now() + 60000, unknown: 10 }, ids)).toEqual({ BRA: null });
  });
  it('does not reset a completed daily or concatenate conflicting histories', () => {
    const lost = { ...partial, targetId: 'CHE' };
    expect(mergeDaily(partial, won)).toEqual(won); expect(mergeDaily(won, lost)).toEqual(won);
    expect(mergeDaily(won, partial)).toEqual(won);
    const other = { ...partial, guesses: [{ ...guess, countryId: 'ARG' }] };
    expect(mergeDaily(partial, other)).toEqual(mergeDaily(other, partial));
    expect(mergeDaily(partial, other).guesses).toHaveLength(1);
    expect(() => mergeDaily(partial, { ...partial, day: '1999-01-01' })).toThrow();
  });
  it('rejects corrupt daily data and normalizes equivalent data consistently', () => {
    expect(normalizeDaily({ ...won, targetId: null }, day, ids)).toEqual(empty);
    expect(normalizeDaily(won, day, ids)).toEqual(won);
  });
  it('imports guest progress once and keeps different accounts and signed-out play separate', async () => {
    const storage = await import('../src/client/progress-storage.js');
    const account = await import('../src/client/account-progress.js');
    storage.progressSet('mundi-collection-v1', JSON.stringify(['BRA']));
    storage.progressSet(`mundi-daily-v1:${day}`, JSON.stringify(won));
    account.importGuestProgress('alice', ids); storage.setProgressOwner('alice');
    expect(account.readAccountProgress('alice', ids).discoveries).toEqual({ BRA: null });
    expect(account.readAccountProgress('alice', ids).daily.get(day)?.won).toBe(true);
    storage.setProgressOwner(null);
    expect(account.readAccountProgress(null, ids).discoveries).toEqual({});
    account.importGuestProgress('bob', ids); storage.setProgressOwner('bob');
    expect(account.readAccountProgress('bob', ids).discoveries).toEqual({});
    storage.progressSet('mundi-collection-v1', JSON.stringify(['ARG']));
    storage.setProgressOwner('alice');
    expect(account.readAccountProgress('alice', ids).discoveries).toEqual({ BRA: null });
    storage.setProgressOwner(null); storage.progressSet('mundi-collection-v1', JSON.stringify(['CHE']));
    account.importGuestProgress('alice', ids); storage.setProgressOwner('alice');
    expect(account.readAccountProgress('alice', ids).discoveries).toEqual({ BRA: null, CHE: null });
    expect(account.readAccountProgress('bob', ids).discoveries).toEqual({ ARG: null });
  });
  it('refreshes an existing collection when switching account scopes', async () => {
    const storage = await import('../src/client/progress-storage.js');
    const { createCollection } = await import('../src/client/collection.js');
    const atlas = { countries: [...ids].map(id => ({ id })) } as unknown as Atlas;
    storage.progressSet('mundi-collection-v1', JSON.stringify(['BRA']));
    const collection = createCollection(atlas);
    expect([...collection.ids]).toEqual(['BRA']);
    storage.setProgressOwner('bob'); expect([...collection.ids]).toEqual([]);
    collection.add('ARG'); expect([...collection.ids]).toEqual(['ARG']);
    storage.setProgressOwner(null); expect([...collection.ids]).toEqual(['BRA']);
    storage.setProgressOwner('bob'); expect([...collection.ids]).toEqual(['ARG']);
  });
  it('preserves guest discoveries even when optional date metadata is corrupt', async () => {
    const storage = await import('../src/client/progress-storage.js');
    const account = await import('../src/client/account-progress.js');
    storage.progressSet('mundi-collection-v1', JSON.stringify(['BRA', 'ARG', 'CHE']));
    storage.progressSet('mundi-collection-dates-v1', JSON.stringify([['BRA', -1], ['ARG', 'broken'], ['CHE', Date.now() + 60000]]));
    account.importGuestProgress('alice', ids);
    expect(account.readAccountProgress('alice', ids).discoveries).toEqual({ ARG: null, BRA: null, CHE: null });
  });
  it('keeps the guest copy after repeated migration failures with full browser storage', async () => {
    const storage = await import('../src/client/progress-storage.js');
    const account = await import('../src/client/account-progress.js');
    storage.progressSet('mundi-collection-v1', JSON.stringify(['BRA']));
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect(() => account.importGuestProgress('alice', ids)).toThrow();
    expect(() => account.importGuestProgress('alice', ids)).toThrow();
    expect(localStorage.getItem('mundi-collection-v1')).toBe('["BRA"]');
  });
  it('does not emit redundant restore events that would reset the game camera', async () => {
    const account = await import('../src/client/account-progress.js');
    const listener = vi.fn(); window.addEventListener('mundi-progress-restored', listener);
    const progress = { discoveries: { BRA: null }, daily: new Map(), name: '', nameUpdatedAt: 0 };
    account.storeAccountProgress('alice', progress); listener.mockClear();
    account.storeAccountProgress('alice', progress); expect(listener).not.toHaveBeenCalled();
  });
});

