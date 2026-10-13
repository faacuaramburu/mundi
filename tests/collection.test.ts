/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollection } from '../src/client/collection.js';
import type { Atlas } from '../src/shared/countries.js';

const atlas: Atlas = { version: 1, width: 1, height: 1, context: [], countries: ['ARG', 'BRA', 'FRA'].map(id => ({ id, name: id, nameEs: id, focus: [0, 0], path: '', neighbors: [] })) };
const key = 'mundi-collection-v1';
const datesKey = 'mundi-collection-dates-v1';
let saved: Map<string, string>;
let events: EventTarget;
beforeEach(() => {
  saved = new Map(); events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('collection discovery dates', () => {
  it('dates legacy discoveries only when won again and preserves that date afterward', () => {
    saved.set(key, JSON.stringify(['ARG']));
    const collection = createCollection(atlas);
    expect([...collection.ids]).toEqual(['ARG']); expect(collection.addedAt('ARG')).toBeUndefined();
    expect(collection.add('ARG')).toBe(false); expect(collection.addedAt('ARG')).toBe(1000);
    collection.add('BRA'); expect(collection.addedAt('BRA')).toBe(1000);
    vi.mocked(Date.now).mockReturnValue(2000);
    collection.add('ARG');
    expect(createCollection(atlas).addedAt('ARG')).toBe(1000);
  });
  it('persists the first discovery date across repeated wins and reloads', () => {
    const collection = createCollection(atlas); collection.add('ARG');
    vi.mocked(Date.now).mockReturnValue(2000);
    collection.add('BRA'); collection.add('ARG');
    const reloaded = createCollection(atlas);
    expect(reloaded.addedAt('ARG')).toBe(1000); expect(reloaded.addedAt('BRA')).toBe(2000);
    expect(reloaded.add('unknown')).toBe(false);
  });
  it('merges discoveries and dates saved in another tab before adding a country', () => {
    const collection = createCollection(atlas);
    saved.set(key, JSON.stringify(['ARG'])); saved.set(datesKey, JSON.stringify([['ARG', 500]]));
    collection.add('BRA');
    const reloaded = createCollection(atlas);
    expect([...reloaded.ids]).toEqual(['ARG', 'BRA']); expect(reloaded.addedAt('ARG')).toBe(500);
  });
  it('rejects invalid metadata and keeps play available when storage fails', () => {
    saved.set(key, JSON.stringify(['ARG', 'BRA']));
    saved.set(datesKey, JSON.stringify([['ARG', -1], ['BRA', '100'], ['FRA', 100], ['ARG', 999999], null]));
    const collection = createCollection(atlas);
    expect(collection.addedAt('ARG')).toBeUndefined(); expect(collection.addedAt('BRA')).toBeUndefined();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Unavailable'); }, setItem: () => { throw new Error('Unavailable'); } });
    expect(collection.add('FRA')).toBe(false); expect(collection.ids.has('FRA')).toBe(true);
    expect(collection.canSave).toBe(false); expect(collection.addedAt('FRA')).toBe(1000);
  });
});
