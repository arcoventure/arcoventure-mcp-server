/**
 * Tests for src/lib/normalise.ts — the unified normalisation used by both
 * fuzzyMatch (default) and suggestTerms (stripPunctuation).
 */

import { normalise } from '../src/lib/normalise'

describe('normalise — default (matching-friendly)', () => {
  test('lowercases, trims, and collapses whitespace', () => {
    expect(normalise('  Autonomous   Business  ')).toBe('autonomous business')
  })

  test('keeps hyphens and punctuation', () => {
    expect(normalise('Coordination-Tax!')).toBe('coordination-tax!')
  })
})

describe('normalise — stripPunctuation', () => {
  test('maps hyphens to spaces and removes punctuation', () => {
    expect(normalise('coordination-tax', { stripPunctuation: true })).toBe('coordination tax')
    expect(normalise('Human-to-Human handoffs.', { stripPunctuation: true })).toBe('human to human handoffs')
  })

  test('collapses the gaps left by removed characters', () => {
    expect(normalise('a, b; c', { stripPunctuation: true })).toBe('a b c')
  })
})
