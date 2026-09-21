/**
 * Rate limiting behind an interface (docs/architecture.md §8).
 *
 * v1 ships a fixed-window in-memory limiter, adequate for a single web
 * replica and for tests. A Postgres-backed adapter (shared across replicas)
 * is added once the `RateLimitBucket` table exists; Redis can follow later.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
};

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number, now?: number): Promise<RateLimitResult>;
}

type Bucket = { count: number; windowStart: number };

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
    now = Date.now(),
  ): Promise<RateLimitResult> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    this.sweep(now, windowMs);

    const existing = this.buckets.get(key);
    const bucket: Bucket =
      existing && existing.windowStart === windowStart ? existing : { count: 0, windowStart };
    bucket.count += 1;
    this.buckets.set(key, bucket);

    const resetAt = windowStart + windowMs;
    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  /** Drop buckets from old windows at most once per window to bound memory. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= windowMs * 2) this.buckets.delete(key);
    }
  }

  clear(): void {
    this.buckets.clear();
  }
}

/** Always allows; used when rate limiting is disabled in tests. */
export class NoopRateLimiter implements RateLimiter {
  async hit(_key: string, limit: number): Promise<RateLimitResult> {
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  }
}

const globalForRateLimit = globalThis as unknown as { __rateLimiter?: RateLimiter };

export function getRateLimiter(): RateLimiter {
  if (!globalForRateLimit.__rateLimiter) {
    globalForRateLimit.__rateLimiter = new MemoryRateLimiter();
  }
  return globalForRateLimit.__rateLimiter;
}

/** Test helper / provider swap. */
export function setRateLimiter(limiter: RateLimiter | undefined): void {
  globalForRateLimit.__rateLimiter = limiter;
}
