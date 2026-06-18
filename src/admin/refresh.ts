/**
 * POST /admin/refresh
 *
 * Clears the in-memory cache and triggers a full reload from the GitHub API.
 * Protected by Bearer token (MCP_REFRESH_TOKEN env var).
 * Called by the GitHub Action in awesome-autonomous-business on every push to terms/*.md.
 */

import { timingSafeEqual } from 'crypto'
import { Request, Response } from 'express'
import { loadCache } from '../cache/termCache'

export interface RefreshResponse {
  status:       'ok'
  terms_loaded: number
  duration_ms:  number
}

export async function handleAdminRefresh(req: Request, res: Response): Promise<void> {
  const token = process.env.MCP_REFRESH_TOKEN
  const authHeader = req.headers['authorization'] ?? ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  const tokenMatch = token && provided.length === token.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(token))

  if (!tokenMatch) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    // loadCache() builds a new snapshot and swaps it in atomically; it must not
    // be preceded by clearCache(), which would empty the live cache during the
    // reload and lose all data if the reload then fails.
    const { termsLoaded, durationMs } = await loadCache()
    const body: RefreshResponse = { status: 'ok', terms_loaded: termsLoaded, duration_ms: durationMs }
    res.json(body)
  } catch (err) {
    // Log the detail server-side; return a generic message so GitHub API
    // bodies or internal paths are never echoed to the client.
    console.error('[admin/refresh] Cache reload failed:', err)
    res.status(500).json({ error: 'Cache reload failed' })
  }
}
