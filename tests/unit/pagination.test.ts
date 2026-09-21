import { describe, expect, it } from "vitest";
import { z } from "zod";

import { decodeCursor, encodeCursor, paginationQuerySchema, toPage } from "@/lib/api/pagination";
import { ValidationError } from "@/lib/errors";

describe("pagination", () => {
  it("round-trips cursors and rejects tampered ones", () => {
    const schema = z.object({ createdAt: z.string(), id: z.string() });
    const cursor = encodeCursor({ createdAt: "2026-01-01T00:00:00.000Z", id: "abc" });
    expect(decodeCursor(cursor, schema)).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
    expect(() => decodeCursor("not-base64-json", schema)).toThrow(ValidationError);
    expect(decodeCursor(undefined, schema)).toBeUndefined();
  });

  it("applies limit defaults and bounds", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(paginationQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(paginationQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
  });

  it("derives nextCursor only when an extra row was fetched", () => {
    const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const full = toPage(rows, 2, (r) => ({ id: r.id }));
    expect(full.items).toHaveLength(2);
    expect(full.nextCursor).toBe(encodeCursor({ id: "2" }));

    const last = toPage(rows.slice(0, 2), 2, (r) => ({ id: r.id }));
    expect(last.nextCursor).toBeNull();
  });
});
