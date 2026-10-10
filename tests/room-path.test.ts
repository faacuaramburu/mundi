import { describe, expect, it } from 'vitest';
import { roomApiPath } from '../src/client/room-path.js';

describe('room API paths', () => {
  it('keeps valid invitation IDs inside the room endpoint on the current origin', () => {
    const id = 'AbCdEfGhIjKlMnOpQrStUv_-';
    for (const action of ['join', 'socket']) {
      const url = new URL(`${roomApiPath(id)}/${action}`, 'https://mundi.top');
      expect(url.origin).toBe('https://mundi.top');
      expect(url.pathname).toBe(`/api/rooms/${id}/${action}`);
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
  });

  it.each([
    null, undefined, 123, {}, '', 'a'.repeat(23), 'a'.repeat(25),
    '../'.repeat(8), '//evil.example/abcdefghij',
    'a'.repeat(23) + '/', 'a'.repeat(23) + '\\', 'a'.repeat(23) + '?',
    'a'.repeat(23) + '#', 'a'.repeat(23) + '\n', 'a'.repeat(24) + '\n', '%2e%2e%2f'.repeat(3),
  ])('rejects invalid IDs before creating a request path: %j', id => {
    expect(() => roomApiPath(id)).toThrow('Invalid room ID');
  });
});
