/**
 * In-memory cache for parsed TermObjects.
 * All tool calls read from this Map — never from the GitHub API directly.
 */

import { TermObject } from '../types'
import { fetchTermFileList, fetchTermFileContent } from './githubFetcher'
import { parseTermMarkdown } from '../parser/markdownParser'

const cache: Map<string, TermObject> = new Map()
let lastRefreshed: Date | null = null
let loading = false
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
 * Populates the cache by fetching all term files from GitHub and parsing them.
 * Called on startup and on POST /admin/refresh.
 * Clears existing cache before loading.
 */
export async function loadCache(): Promise<{ termsLoaded: number; durationMs: number }> {
  loading = true
  const start = Date.now()
  cache.clear()

  const files = await fetchTermFileList()

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
      cache.set(slug, term)
    }
  }

  lastRefreshed = new Date()
  loading = false
  return { termsLoaded: cache.size, durationMs: Date.now() - start }
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
 * Returns true if the cache is older than TTL_HOURS or has never been loaded.
 */
export function isCacheStale(): boolean {
  if (!lastRefreshed) return true
  const ageMs = Date.now() - lastRefreshed.getTime()
  return ageMs > TTL_HOURS * 60 * 60 * 1000
}
