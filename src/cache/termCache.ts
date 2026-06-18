/**
 * In-memory cache for parsed TermObjects.
 * All tool calls read from this Map — never from the GitHub API directly.
 */

import { TermObject } from '../types'
import { fetchTermFileList, fetchTermFileContent } from './githubFetcher'
import { parseTermMarkdown } from '../parser/markdownParser'

type LoadResult = { termsLoaded: number; durationMs: number }

const cache: Map<string, TermObject> = new Map()
let lastRefreshed: Date | null = null
let loading = false
let inflightLoad: Promise<LoadResult> | null = null
const TTL_HOURS = 24

/**
 * Returns true only while a loadCache() call is in progress.
 * Tools return CACHE_UNAVAILABLE only in this window, not when the cache
 * is simply empty (e.g. in tests or before first startup load).
 */
export function isCacheLoading(): boolean {
  return loading
}

/**
 * Returns true once the cache holds at least one term. Used as the readiness
 * signal: a non-empty cache means a load has succeeded (or a test has seeded
 * it), so tools may serve from it.
 */
export function isCacheReady(): boolean {
  return cache.size > 0
}

/**
 * True when tools should refuse to serve: either a load is in flight, or the
 * cache has not yet been populated (cold start / failed first load). Closes the
 * startup window where an empty cache returned TERM_NOT_FOUND instead of
 * CACHE_UNAVAILABLE.
 */
export function isCacheUnavailable(): boolean {
  return loading || cache.size === 0
}

/**
 * Populates the cache by fetching all term files from GitHub and parsing them.
 * Called on startup, on POST /admin/refresh, and by the TTL watchdog.
 *
 * Guarantees:
 * - Single-flight: concurrent callers share one in-flight load rather than
 *   racing destructive clears.
 * - Atomic swap: the live cache is replaced only after a new snapshot builds
 *   successfully. A failed load leaves the previous data intact.
 * - The `loading` flag is always reset (try/finally), so a failed load can
 *   never wedge the server into permanent CACHE_UNAVAILABLE.
 */
export function loadCache(): Promise<LoadResult> {
  if (inflightLoad) return inflightLoad
  inflightLoad = doLoadCache().finally(() => {
    inflightLoad = null
  })
  return inflightLoad
}

async function doLoadCache(): Promise<LoadResult> {
  loading = true
  const start = Date.now()

  try {
    const files = await fetchTermFileList()

    // Build into a temporary Map; never touch the live cache until the build
    // completes, so a mid-load failure cannot empty or corrupt it.
    const next = new Map<string, TermObject>()

    for (const file of files) {
      const slug = file.name.replace(/\.md$/, '')
      let markdown: string
      try {
        markdown = await fetchTermFileContent(file.download_url)
      } catch (err) {
        console.warn(`[termCache] Failed to fetch ${file.name}:`, err)
        continue
      }

      const { term, warnings } = parseTermMarkdown(slug, markdown)

      for (const w of warnings) {
        console.warn(`[termCache] ${w}`)
      }

      if (term) {
        next.set(slug, term)
      }
    }

    // Atomic swap — synchronous, so no other task observes a half-built cache.
    cache.clear()
    for (const [slug, term] of next) {
      cache.set(slug, term)
    }

    lastRefreshed = new Date()
    return { termsLoaded: cache.size, durationMs: Date.now() - start }
  } finally {
    loading = false
  }
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
 * Clears the cache Map without reloading. Intended for tests; production
 * refresh goes through loadCache()'s atomic swap rather than a bare clear.
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
 * Returns true if the cache is older than TTL_HOURS or has never been loaded.
 */
export function isCacheStale(): boolean {
  if (!lastRefreshed) return true
  const ageMs = Date.now() - lastRefreshed.getTime()
  return ageMs > TTL_HOURS * 60 * 60 * 1000
}
