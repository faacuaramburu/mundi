import type { Atlas } from '../shared/countries.js';
import type { FirebaseWebConfig } from '../shared/account.js';

export async function initializeAccount(atlas: Atlas): Promise<void> {
  try {
    const response = await fetch('/api/account/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const config = await response.json() as { enabled: boolean; firebase?: FirebaseWebConfig; customEmail?: boolean };
    if (!config.enabled || !config.firebase) return;
    const { startFirebaseAccount } = await import('./firebase-account.js');
    startFirebaseAccount(config.firebase, new Set(atlas.countries.map(country => country.id)), config.customEmail === true);
  } catch { /* An unavailable account service never blocks guest games. */ }
}
