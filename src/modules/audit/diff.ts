import type { AuditSnapshot } from "@/modules/audit";

/**
 * Builds `before`/`after` snapshots containing only the keys whose value
 * changed, so audit rows stay small and readable.
 */
export function diffSnapshots<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly (keyof T & string)[],
): { before: AuditSnapshot; after: AuditSnapshot; changed: string[] } {
  const b: AuditSnapshot = {};
  const a: AuditSnapshot = {};
  const changed: string[] = [];
  for (const key of keys) {
    const prev = normalize(before[key]);
    const next = normalize(after[key]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
      changed.push(key);
    }
  }
  return { before: b, after: a, changed };
}

function normalize(value: unknown): AuditSnapshot[string] {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value as AuditSnapshot[string];
}
