/**
 * Tests for src/cache/githubFetcher.ts — SSRF host allow-list.
 *
 * fetchTermFileContent validates the URL before any network call, so these
 * tests assert rejection without mocking fetch.
 */

import { fetchTermFileContent } from '../src/cache/githubFetcher'

describe('fetchTermFileContent — SSRF guard', () => {
  test('rejects a non-GitHub host (e.g. cloud metadata endpoint)', async () => {
    await expect(
      fetchTermFileContent('http://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow(/Blocked non-GitHub fetch/)
  })

  test('rejects a non-https GitHub URL', async () => {
    await expect(
      fetchTermFileContent('http://raw.githubusercontent.com/x.md')
    ).rejects.toThrow(/Blocked non-GitHub fetch/)
  })

  test('rejects a malformed URL', async () => {
    await expect(fetchTermFileContent('not a url')).rejects.toThrow(/Invalid download URL/)
  })

  test('rejects a look-alike host', async () => {
    await expect(
      fetchTermFileContent('https://raw.githubusercontent.com.evil.com/x.md')
    ).rejects.toThrow(/Blocked non-GitHub fetch/)
  })
})
