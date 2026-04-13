/**
 * POST /admin/refresh
 *
 * Clears the in-memory cache and triggers a full reload from the GitHub API.
 * Protected by Bearer token (MCP_REFRESH_TOKEN env var).
 * Called by the GitHub Action in awesome-autonomous-business on every push to terms/*.md.
 */

import { Request, Response } from 'express'

export interface RefreshResponse {
  status:       'ok'
  terms_loaded: number
  duration_ms:  number
}

/**
 * Express route handler for POST /admin/refresh.
 * Validates the Authorization header, clears the cache, and reloads from GitHub.
 */
export async function handleAdminRefresh(req: Request, res: Response): Promise<void> {
  throw new Error('Not implemented')
}
