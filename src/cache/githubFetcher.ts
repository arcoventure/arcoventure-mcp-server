/**
 * Fetches term Markdown files from the GitHub API.
 * Never called per-request — only during cache load or admin refresh.
 */

export interface GitHubFile {
  name:         string
  path:         string
  sha:          string
  url:          string
  download_url: string
}

const GITHUB_API_BASE = 'https://api.github.com'

// Abort any single GitHub request that hangs, so a stalled connection can't
// block loadCache() indefinitely (which would otherwise hold the cache in a
// loading state forever).
const FETCH_TIMEOUT_MS = 10_000

// download_url comes from the GitHub API response. Restrict outbound fetches to
// known GitHub hosts so a compromised/MITM'd response cannot turn this into an
// SSRF primitive pointing at arbitrary internal services.
const ALLOWED_FETCH_HOSTS = new Set([
  'raw.githubusercontent.com',
  'api.github.com',
  'github.com',
])

function assertAllowedUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid download URL: ${rawUrl}`)
  }
  if (url.protocol !== 'https:' || !ALLOWED_FETCH_HOSTS.has(url.hostname)) {
    throw new Error(`Blocked non-GitHub fetch: ${url.protocol}//${url.hostname}`)
  }
  return url
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'Accept':     'application/vnd.github+json',
    'User-Agent': 'arcoventure-mcp-server',
  }
  if (process.env.GITHUB_TOKEN) {
    h['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return h
}

/**
 * Returns the list of .md files in the configured terms directory.
 * Uses GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TERMS_PATH env vars.
 */
export async function fetchTermFileList(): Promise<GitHubFile[]> {
  const owner = process.env.GITHUB_REPO_OWNER
  const repo  = process.env.GITHUB_REPO_NAME
  const path  = process.env.GITHUB_TERMS_PATH ?? 'terms'

  if (!owner || !repo) {
    throw new Error('GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be set')
  }

  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} fetching file list: ${await res.text()}`)
  }

  const data = await res.json() as GitHubFile[]

  return data.filter((f) => f.name.endsWith('.md'))
}

/**
 * Fetches the raw Markdown content for a single term file.
 */
export async function fetchTermFileContent(downloadUrl: string): Promise<string> {
  const url = assertAllowedUrl(downloadUrl)
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} fetching ${downloadUrl}: ${await res.text()}`)
  }

  return res.text()
}
