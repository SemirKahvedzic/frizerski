import { z } from "zod";

import { ValidationError } from "@/lib/errors";

/**
 * Cursor pagination helpers (docs/api.md §1). Cursors are opaque base64url
 * JSON so clients never depend on their shape.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const result = schema.safeParse(parsed);
    if (!result.success) throw new Error("shape");
    return result.data;
  } catch {
    throw new ValidationError("Invalid cursor.", { where: "query", field: "cursor" });
  }
}

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Turns a `take = limit + 1` result set into a page: drops the extra row and
 * derives the next cursor from the last returned item.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => Record<string, unknown>,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null };
}
