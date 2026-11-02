import { normalizeUsername } from './username.js';
import { parseCollection } from './collection.js';

/** Public by default; an explicit privacy choice always wins. */
export function publicIndexPreference(value: unknown): boolean { return value !== false; }

export function publicProfilePath(username: string): string | null {
  const name = normalizeUsername(username);
  return name ? `/?profile=${encodeURIComponent(name)}` : null;
}
export function publicCountries(value: unknown, validIds: ReadonlySet<string>): string[] {
  return [...new Set(parseCollection(value, validIds))].sort();
}
