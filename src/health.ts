/**
 * Health payload builder, extracted so the readiness logic is unit-testable
 * without standing up the HTTP server.
 */

import { getCache, getLastRefreshed, isCacheReady, isCacheLoading } from './cache/termCache'

export interface HealthPayload {
  status: 'ok' | 'loading' | 'degraded'
  cache: {
    term_count: number
    last_refreshed: string | null
    ttl_remaining_hours: number | null
  }
  uptime_seconds: number
}

/**
 * Builds the /health response and the HTTP status that should accompany it.
 * Returns 503 until the cache is ready so an uptime check can detect a degraded
 * server; 200 with status 'ok' once terms are loaded.
 */
export function buildHealth(now: number = Date.now()): { httpStatus: number; body: HealthPayload } {
  const lastRefreshed = getLastRefreshed()
  const termCount = getCache().size
  const uptimeSeconds = Math.floor(process.uptime())

  let ttlRemainingHours: number | null = null
  if (lastRefreshed) {
    const ageMs = now - lastRefreshed.getTime()
    ttlRemainingHours = Math.max(0, Math.round(((24 * 3600_000 - ageMs) / 3600_000) * 10) / 10)
  }

  const ready = isCacheReady()
  const status: HealthPayload['status'] = ready ? 'ok' : isCacheLoading() ? 'loading' : 'degraded'

  return {
    httpStatus: ready ? 200 : 503,
    body: {
      status,
      cache: {
        term_count: termCount,
        last_refreshed: lastRefreshed?.toISOString() ?? null,
        ttl_remaining_hours: ttlRemainingHours,
      },
      uptime_seconds: uptimeSeconds,
    },
  }
}
