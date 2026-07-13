export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) throw new Error("maxRequests must be a positive integer.");
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error("windowMs must be a positive integer.");
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    this.sweep(now);
    const normalizedKey = key || "anonymous";
    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(normalizedKey, bucket);
    }
    if (bucket.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        resetAt: bucket.resetAt,
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - bucket.count),
      retryAfterSeconds: 0,
      resetAt: bucket.resetAt,
    };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    this.lastSweep = now;
  }
}
