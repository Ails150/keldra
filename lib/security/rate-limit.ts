import "server-only";

// Minimal in-process sliding-window limiter for the AI routes (L2).
//
// Scope + honesty about what this is: Keldra runs as a single Next.js server, so
// one in-memory map is a real limit today. It is per-instance, so if the app is
// ever scaled horizontally each instance gets its own budget — at that point
// this needs to move to Postgres or Redis. It exists to cap GEMINI_API_KEY spend
// and stop a single caller looping an expensive multimodal request, NOT to be a
// security boundary. The security boundary is the auth check that runs first.

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Keep the map from growing without bound on a long-lived server.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

// Test seam — the audit harness resets between probe groups.
export function __resetRateLimits() {
  buckets.clear();
}
