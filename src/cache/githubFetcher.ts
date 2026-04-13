/**
 * Fetches term Markdown files from the GitHub API.
 * Never called per-request — only during cache load or admin refresh.
 */

export interface GitHubFile {
  name: string
  path: string
  sha:  string
  url:  string
  download_url: string
}

/**
 * Returns the list of .md files in the configured terms directory.
 */
export async function fetchTermFileList(): Promise<GitHubFile[]> {
  throw new Error('Not implemented')
}

/**
 * Fetches the raw Markdown content for a single term file.
 */
export async function fetchTermFileContent(downloadUrl: string): Promise<string> {
  throw new Error('Not implemented')
}
