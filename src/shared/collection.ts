export function parseCollection(value: unknown, validIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 195).filter((id): id is string => typeof id === 'string' && validIds.has(id)))];
}
