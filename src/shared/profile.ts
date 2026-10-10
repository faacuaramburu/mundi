export const playerNameLimit = 24;

export function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > playerNameLimit) return null;
  const name = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if (name.length > playerNameLimit || (name && !/^[\p{L}\p{M}\p{N} ._-]+$/u.test(name))) return null;
  return name;
}
