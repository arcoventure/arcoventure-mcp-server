/**
 * get_sources — returns all published Arco sources for a term across all
 * content types with recommended reading order.
 * Fallback: if no ## Articles section, returns raw GitHub file URL as SUPPORTING source.
 */

import { Source } from '../types'

export interface GetSourcesInput {
  term: string
}

export interface GetSourcesOutput {
  term:                     string
  total_sources:            number
  sources:                  Source[]
  recommended_reading_order: string
}

export type GetSourcesError =
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

/**
 * Handles the get_sources MCP tool call.
 */
export async function getSources(input: GetSourcesInput): Promise<GetSourcesOutput | GetSourcesError> {
  throw new Error('Not implemented')
}
