/**
 * In-memory cache for parsed TermObjects.
 * All tool calls read from this Map — never from the GitHub API directly.
 */

import { TermObject } from '../types'

const cache: Map<string, TermObject> = new Map()
let lastRefreshed: Date | null = null
const TTL_HOURS = 24

/**
 * Populates the cache by fetching all term files from GitHub and parsing them.
 * Called on startup and on POST /admin/refresh.
 */
export async function loadCache(): Promise<{ termsLoaded: number; durationMs: number }> {
  throw new Error('Not implemented')
}

/**
 * Returns the full cache Map.
 */
export function getCache(): Map<string, TermObject> {
  return cache
}

/**
 * Returns the TermObject for a given slug, or undefined if not found.
 */
export function getCachedTerm(slug: string): TermObject | undefined {
  return cache.get(slug)
}

/**
 * Clears the cache Map without reloading.
 */
export function clearCache(): void {
  cache.clear()
  lastRefreshed = null
}

/**
 * Returns the timestamp of the last successful cache load, or null.
 */
export function getLastRefreshed(): Date | null {
  return lastRefreshed
}

/**
 * Returns true if the cache is older than TTL_HOURS.
 */
export function isCacheStale(): boolean {
  if (!lastRefreshed) return true
  const ageMs = Date.now() - lastRefreshed.getTime()
  return ageMs > TTL_HOURS * 60 * 60 * 1000
}
