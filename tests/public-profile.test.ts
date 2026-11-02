import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { publicCountries, publicProfilePath } from '../src/shared/public-profile.js';

const fixture = vi.hoisted(() => ({ records: new Map<string, unknown>(), writes: [] as unknown[], deletes: [] as string[] }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  runTransaction: async (_db: unknown, action: (tx: unknown) => unknown) => action({
    get: async (path: string) => ({ exists: () => fixture.records.has(path), data: () => fixture.records.get(path) }),
    set: (...args: unknown[]) => fixture.writes.push(args),
    delete: (path: string) => fixture.deletes.push(path),
  }),
}));
import { publishPublicIndex } from '../src/client/public-profile.js';
const db = {} as Firestore, ids = new Set(['BRA', 'ARG', 'CHE']);
beforeEach(() => {
  fixture.records.clear(); fixture.writes.length = 0; fixture.deletes.length = 0;
  fixture.records.set('players/alice', { username: 'alice_name', email: 'private@example.test' });
  fixture.records.set('players/alice/progress/collection', { discoveries: { BRA: 123456, ARG: null } });
});
describe('public index boundaries', () => {
  it('normalizes public links and rejects invalid names', () => {
    expect(publicProfilePath('Alice_Name')).toBe('/?profile=alice_name');
    expect(publicProfilePath('../x')).toBeNull();
    expect(publicCountries(['CHE', 'BRA', 'BRA', 'BAD'], ids)).toEqual(['BRA', 'CHE']);
  });
  it('keeps old profiles private when their sharing flag is absent', async () => {
    await publishPublicIndex(db, 'alice', ids);
    expect(fixture.writes).toEqual([]);
  });
  it('publishes only username, country IDs and a server timestamp when enabled', async () => {
    await publishPublicIndex(db, 'alice', ids, true);
    expect(fixture.writes).toEqual([
      ['players/alice', { publicIndex: true, lastSeenAt: 'SERVER_TIMESTAMP' }, { merge: true }],
      ['publicProfiles/alice', { username: 'alice_name', countries: ['ARG', 'BRA'], updatedAt: 'SERVER_TIMESTAMP' }],
    ]);
  });
  it('revokes canonical visibility and deletes the snapshot in the same transaction', async () => {
    fixture.records.set('publicProfiles/alice', { username: 'alice_name', countries: ['BRA'] });
    await publishPublicIndex(db, 'alice', ids, false);
    expect(fixture.writes).toEqual([['players/alice', { publicIndex: false, lastSeenAt: 'SERVER_TIMESTAMP' }, { merge: true }]]);
    expect(fixture.deletes).toEqual(['publicProfiles/alice']);
  });
  it('does not rewrite identical public snapshots on every private sync', async () => {
    fixture.records.set('players/alice', { username: 'alice_name', publicIndex: true });
    fixture.records.set('publicProfiles/alice', { username: 'alice_name', countries: ['ARG', 'BRA'] });
    await publishPublicIndex(db, 'alice', ids);
    expect(fixture.writes).toEqual([]);
  });
});
