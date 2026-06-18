/**
 * Tests for src/cache/termCache.ts — cache lifecycle hardening.
 *
 * Covers the reliability guarantees added in Phase 1:
 * - loading flag is always reset (try/finally), even when a load throws
 * - atomic swap: a failed reload retains the previous good data
 * - single-flight: concurrent loadCache() calls share one in-flight load
 * - readiness gate: isCacheUnavailable() during cold start / loading
 *
 * githubFetcher and markdownParser are mocked so the tests exercise cache
 * lifecycle logic in isolation, not network or parsing.
 */

import { GitHubFile } from '../src/cache/githubFetcher'
import { TermObject } from '../src/types'

jest.mock('../src/cache/githubFetcher')
jest.mock('../src/parser/markdownParser')

import { fetchTermFileList, fetchTermFileContent } from '../src/cache/githubFetcher'
import { parseTermMarkdown } from '../src/parser/markdownParser'
import {
  loadCache,
  clearCache,
  getCache,
  isCacheLoading,
  isCacheReady,
  isCacheUnavailable,
  getLastRefreshed,
} from '../src/cache/termCache'

const mockList = fetchTermFileList as jest.MockedFunction<typeof fetchTermFileList>
const mockContent = fetchTermFileContent as jest.MockedFunction<typeof fetchTermFileContent>
const mockParse = parseTermMarkdown as jest.MockedFunction<typeof parseTermMarkdown>

function file(name: string): GitHubFile {
  return {
    name,
    path: `terms/${name}`,
    sha: 'sha',
    url: `https://api.github.com/${name}`,
    download_url: `https://raw.githubusercontent.com/${name}`,
  }
}

function term(slug: string): TermObject {
  return {
    slug,
    title: slug,
    blockquote_definition: `def ${slug}`,
    extended_definition: '',
    related_terms: [],
    sources: [],
  }
}

/** Default happy-path mocks: each .md file parses into a term named after its slug. */
function seedHappyMocks(slugs: string[]): void {
  mockList.mockResolvedValue(slugs.map(s => file(`${s}.md`)))
  mockContent.mockImplementation(async (url: string) => `# markdown for ${url}`)
  mockParse.mockImplementation((slug: string) => ({ term: term(slug), warnings: [] }))
}

beforeEach(() => {
  jest.clearAllMocks()
  clearCache()
})

describe('termCache — readiness gate', () => {
  test('cold cache is unavailable and not ready', () => {
    expect(isCacheReady()).toBe(false)
    expect(isCacheUnavailable()).toBe(true)
    expect(isCacheLoading()).toBe(false)
  })

  test('after a successful load the cache is ready and available', async () => {
    seedHappyMocks(['autonomous-business', 'stewardship-model'])
    const result = await loadCache()

    expect(result.termsLoaded).toBe(2)
    expect(getCache().size).toBe(2)
    expect(isCacheReady()).toBe(true)
    expect(isCacheUnavailable()).toBe(false)
    expect(getLastRefreshed()).toBeInstanceOf(Date)
  })
})

describe('termCache — loading flag reset on failure', () => {
  test('loading is reset to false after the load throws', async () => {
    mockList.mockRejectedValue(new Error('GitHub down'))

    await expect(loadCache()).rejects.toThrow('GitHub down')

    // The flag must not stay stuck true — otherwise every tool would return
    // CACHE_UNAVAILABLE until process restart.
    expect(isCacheLoading()).toBe(false)
  })

  test('a failed load can be retried (in-flight promise cleared)', async () => {
    mockList.mockRejectedValueOnce(new Error('transient'))
    await expect(loadCache()).rejects.toThrow('transient')

    seedHappyMocks(['coordination-tax'])
    const result = await loadCache()
    expect(result.termsLoaded).toBe(1)
    expect(getCache().size).toBe(1)
  })
})

describe('termCache — atomic swap retains data on failed reload', () => {
  test('a failed reload keeps the previous good cache', async () => {
    seedHappyMocks(['autonomous-business', 'stewardship-model'])
    await loadCache()
    expect(getCache().size).toBe(2)

    // Reload fails before any swap happens.
    mockList.mockRejectedValueOnce(new Error('reload failed'))
    await expect(loadCache()).rejects.toThrow('reload failed')

    // Old data is intact; cache never went empty.
    expect(getCache().size).toBe(2)
    expect(isCacheReady()).toBe(true)
    expect(isCacheUnavailable()).toBe(false)
  })
})

describe('termCache — single-flight', () => {
  test('concurrent loadCache() calls share one in-flight load', async () => {
    let resolveList!: (files: GitHubFile[]) => void
    mockList.mockReturnValueOnce(new Promise<GitHubFile[]>(r => { resolveList = r }))
    mockContent.mockImplementation(async (url: string) => `# ${url}`)
    mockParse.mockImplementation((slug: string) => ({ term: term(slug), warnings: [] }))

    const p1 = loadCache()
    const p2 = loadCache()

    // Same promise instance — the second call did not start a second load.
    expect(p1).toBe(p2)

    resolveList([file('autonomous-business.md')])
    await Promise.all([p1, p2])

    expect(mockList).toHaveBeenCalledTimes(1)
    expect(getCache().size).toBe(1)
  })
})
