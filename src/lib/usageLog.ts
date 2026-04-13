/**
 * Fire-and-forget Supabase write for mcp_usage_log.
 * A failed write never blocks a tool response.
 */

import { createClient } from '@supabase/supabase-js'

export interface UsageLogEntry {
  tool:            string
  term_slug?:      string
  input_summary?:  string   // first 200 chars of input (verify_alignment only)
  verdict?:        string   // alignment verdict (verify_alignment only)
  caller_agent?:   string   // claude | perplexity | unknown
  referer_domain?: string
}

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Logs a tool call to mcp_usage_log in Supabase.
 * Always fire-and-forget — never awaited in the hot path.
 * Wraps the write in try/catch; logs a warning and continues on failure.
 *
 * Usage: void usageLog(entry)
 */
export async function usageLog(entry: UsageLogEntry): Promise<void> {
  try {
    const client = getClient()
    if (!client) {
      // Supabase not configured — skip silently in dev, warn in prod
      if (process.env.NODE_ENV === 'production') {
        console.warn('[usageLog] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — skipping log')
      }
      return
    }

    const { error } = await client.from('mcp_usage_log').insert({
      tool:           entry.tool,
      term_slug:      entry.term_slug      ?? null,
      input_summary:  entry.input_summary  ?? null,
      verdict:        entry.verdict        ?? null,
      caller_agent:   entry.caller_agent   ?? null,
      referer_domain: entry.referer_domain ?? null,
    })

    if (error) {
      console.warn('[usageLog] Supabase write failed:', error.message)
    }
  } catch (err) {
    console.warn('[usageLog] Unexpected error:', err)
  }
}
