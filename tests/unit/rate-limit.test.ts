import { describe, expect, it } from "vitest";

import { MemoryRateLimiter } from "@/lib/rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit within a window and blocks after", async () => {
    const limiter = new MemoryRateLimiter();
    const now = 1_700_000_000_000;

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await limiter.hit("k", 3, 60, now + i));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]?.remaining).toBe(0);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets when the window rolls over", async () => {
    const limiter = new MemoryRateLimiter();
    const windowMs = 60_000;
    const start = Math.floor(1_700_000_000_000 / windowMs) * windowMs;

    await limiter.hit("k", 1, 60, start);
    expect((await limiter.hit("k", 1, 60, start + 1)).allowed).toBe(false);
    expect((await limiter.hit("k", 1, 60, start + windowMs)).allowed).toBe(true);
  });

  it("isolates keys", async () => {
    const limiter = new MemoryRateLimiter();
    const now = 1_700_000_000_000;
    await limiter.hit("a", 1, 60, now);
    expect((await limiter.hit("a", 1, 60, now)).allowed).toBe(false);
    expect((await limiter.hit("b", 1, 60, now)).allowed).toBe(true);
  });
});
