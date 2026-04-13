/**
 * Fire-and-forget Supabase write for mcp_usage_log.
 * A failed write never blocks a tool response.
 */

export interface UsageLogEntry {
  tool:           string
  term_slug?:     string
  input_summary?: string   // first 200 chars of input (verify_alignment only)
  verdict?:       string   // alignment verdict (verify_alignment only)
  caller_agent?:  string   // claude | perplexity | unknown
  referer_domain?: string
}

/**
 * Logs a tool call to mcp_usage_log in Supabase.
 * Always fire-and-forget — never awaited in the hot path.
 * Wraps the write in try/catch; logs a warning and continues on failure.
 *
 * Usage: void usageLog(entry)
 */
export async function usageLog(entry: UsageLogEntry): Promise<void> {
  throw new Error('Not implemented')
}
