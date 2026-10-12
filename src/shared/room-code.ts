export const roomCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCodeLength = 8;

export function normalizeRoomCode(value: string): string | null {
  if (value.length > 17) return null;
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  return code.length === roomCodeLength && [...code].every(character => roomCodeAlphabet.includes(character)) ? code : null;
}

export function formatRoomCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
