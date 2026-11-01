import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { normalizeUsername } from '../shared/username.js';
import type { UsernameResult } from './account-identity.js';

export async function claimUsername(db: Firestore, uid: string, value: string): Promise<UsernameResult> {
  const username = normalizeUsername(value); if (!username) return 'invalid';
  try {
    return await runTransaction(db, async tx => {
      const playerRef = doc(db, 'players', uid); const nameRef = doc(db, 'usernames', username);
      const player = await tx.get(playerRef); const reservation = await tx.get(nameRef);
      if (reservation.exists() && reservation.data().uid !== uid) return 'taken';
      const oldName = normalizeUsername(player.data()?.username);
      // All reads precede writes. Firestore retries concurrent reservations;
      // rules require the profile and reservation to change atomically.
      if (oldName && oldName !== username) tx.delete(doc(db, 'usernames', oldName));
      if (!reservation.exists()) tx.set(nameRef, { uid, createdAt: serverTimestamp() });
      tx.set(playerRef, { username, name: username, nameUpdatedAt: Date.now(),
        createdAt: player.data()?.createdAt ?? serverTimestamp(), lastSeenAt: serverTimestamp() }, { merge: true });
      return 'saved';
    });
  } catch { return 'unavailable'; }
}
