import { describe, expect, it } from 'vitest';
import { normalizeUsername } from '../src/shared/username.js';
describe('unique usernames', () => {
  it('normalizes case and requires at least three letters, including when numbers are used', () => {
    expect(normalizeUsername('FaCu_123')).toBe('facu_123');
    expect(normalizeUsername(' KTR ')).toBe('ktr');
    expect(normalizeUsername('ab1')).toBeNull();
    expect(normalizeUsername('a_b_c')).toBe('a_b_c');
    for (const value of ['ab', '', '123abc', 'facu.ar', 'nombre con espacios', 'facú', 'a'.repeat(25), null]) expect(normalizeUsername(value)).toBeNull();
  });
});
