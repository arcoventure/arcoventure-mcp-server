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
  const res = await fetch(url, { headers: headers() })

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
  const res = await fetch(downloadUrl, { headers: headers() })

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} fetching ${downloadUrl}: ${await res.text()}`)
  }

  return res.text()
}
