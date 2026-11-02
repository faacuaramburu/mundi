import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';

// This command must never contact a deployed project or a non-loopback endpoint.
const endpoint = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? '');
if (!endpoint || Number(endpoint[1]) < 1 || Number(endpoint[1]) > 65535) throw new Error('Start the local Firestore emulator before running test:rules.');
const env = await initializeTestEnvironment({ projectId: 'demo-mundi-rules', firestore: {
  host: '127.0.0.1', port: Number(endpoint[1]), rules: await readFile('firestore.rules', 'utf8'),
} });
const verified = env.authenticatedContext('alice', { email: 'alice@example.test', email_verified: true }).firestore();
const pending = env.authenticatedContext('alice', { email: 'alice@example.test', email_verified: false }).firestore();
const other = env.authenticatedContext('bob', { email_verified: true }).firestore();
const profile = name => ({ name, nameUpdatedAt: Date.now(), createdAt: Timestamp.fromMillis(1000), lastSeenAt: serverTimestamp() });
const agreement = { version: '2026-11-01', acceptedAt: serverTimestamp() };
const progress = { discoveries: { BRA: null }, updatedAt: serverTimestamp() };
let checks = 0;
const allowed = async operation => { await assertSucceeds(operation); checks++; };
const denied = async operation => { await assertFails(operation); checks++; };
try {
  await env.clearFirestore();
  // Registration may record consent, but that alone cannot activate an email account.
  await allowed(setDoc(doc(pending, 'players/alice/agreements/2026-11-01'), agreement));
  await allowed(getDoc(doc(pending, 'players/alice/agreements/2026-11-01')));
  await denied(setDoc(doc(pending, 'players/alice'), profile('alice')));
  await denied(setDoc(doc(pending, 'players/alice/progress/collection'), progress));
  await denied(setDoc(doc(pending, 'players/alice/daily/2026-11-02'), { day: '2026-11-02', guesses: [], won: false, targetId: null, updatedAt: serverTimestamp() }));
  const pendingClaim = writeBatch(pending);
  pendingClaim.set(doc(pending, 'players/alice'), { ...profile('alice_name'), username: 'alice_name' });
  pendingClaim.set(doc(pending, 'usernames/alice_name'), { uid: 'alice', createdAt: serverTimestamp() });
  await denied(pendingClaim.commit());
  // A refreshed verified identity can activate the same UID, preserving its consent.
  await allowed(setDoc(doc(verified, 'players/alice'), profile('alice')));
  await allowed(setDoc(doc(verified, 'players/alice/progress/collection'), progress));
  await allowed(getDoc(doc(verified, 'players/alice/progress/collection')));
  await allowed(setDoc(doc(verified, 'players/alice/daily/2026-11-02'), { day: '2026-11-02', guesses: [], won: false, targetId: null, updatedAt: serverTimestamp() }));
  const claim = writeBatch(verified);
  claim.set(doc(verified, 'players/alice'), { ...profile('alice_name'), username: 'alice_name' });
  claim.set(doc(verified, 'usernames/alice_name'), { uid: 'alice', createdAt: serverTimestamp() });
  await allowed(claim.commit());
  for (const path of ['players/alice', 'players/alice/progress/collection', 'players/alice/daily/2026-11-02', 'usernames/alice_name']) {
    await denied(getDoc(doc(pending, path)));
  }
  await denied(getDoc(doc(other, 'players/alice')));
  await denied(setDoc(doc(other, 'players/alice/progress/collection'), progress));
  await denied(getDoc(doc(env.unauthenticatedContext().firestore(), 'players/alice')));
  // Verified Google access follows the same owner/consent rules and remains available.
  const google = env.authenticatedContext('google-player', { email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  await denied(setDoc(doc(google, 'players/google-player'), profile('google_player')));
  await allowed(setDoc(doc(google, 'players/google-player/agreements/2026-11-01'), agreement));
  await allowed(setDoc(doc(google, 'players/google-player'), profile('google_player')));
  await allowed(setDoc(doc(google, 'players/google-player/progress/collection'), progress));
  console.log(`Firestore rules: ${checks} checks passed (pending, verified, Google, consent and cross-account isolation).`);
} finally { await env.cleanup(); }
