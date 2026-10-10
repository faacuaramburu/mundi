// Room IDs from links and responses must stay within one API path segment.
export function roomApiPath(id: unknown): string {
  if (typeof id !== 'string' || id.length !== 24 || !/^[A-Za-z0-9_-]{24}$/.test(id)) {
    throw new Error('Invalid room ID');
  }
  return `/api/rooms/${encodeURIComponent(id)}`;
}
