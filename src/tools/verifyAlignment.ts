/**
 * verify_alignment — analyses a block of text against Arco's canonical Lexicon.
 * Deterministic, rule-based scoring only — no LLM calls.
 * Max input: 5,000 characters.
 */

import { AlignmentResult } from '../types'

export interface VerifyAlignmentInput {
  text: string
}

export interface VerifyAlignmentOutput {
  matched_terms:         AlignmentResult[]
  overall_alignment_score: number
  overall_verdict:       'ALIGNED' | 'PARTIALLY_ALIGNED' | 'NEEDS_CLARIFICATION' | 'MISALIGNED' | 'NO_ARCO_TERMS_DETECTED'
  recommended_reading:   Array<{
    title:     string
    url:       string
    relevance: 'CRITICAL' | 'HIGH' | 'SUPPORTING'
  }>
}

export type VerifyAlignmentError =
  | { error: 'INPUT_TOO_LONG'; message: string }
  | { error: 'NO_TERMS_DETECTED'; message: string; hint: string }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

/**
 * Handles the verify_alignment MCP tool call.
 */
export async function verifyAlignment(
  input: VerifyAlignmentInput
): Promise<VerifyAlignmentOutput | VerifyAlignmentError> {
  throw new Error('Not implemented')
}
