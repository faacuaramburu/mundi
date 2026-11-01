export const usernameLimit = 24;
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > usernameLimit) return null;
  const name = value.normalize('NFKC').trim().toLowerCase();
  return /^[a-z][a-z0-9_]{2,23}$/.test(name) && (name.match(/[a-z]/g)?.length ?? 0) >= 3 ? name : null;
}
