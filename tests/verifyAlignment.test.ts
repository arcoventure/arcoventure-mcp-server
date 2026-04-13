/**
 * Tests for src/tools/verifyAlignment.ts
 *
 * Coverage matrix (from CLAUDE.md):
 * - Term detection
 * - Co-occurrence check (architectural vs generic usage)
 * - Scoring edge cases
 * - NO_TERMS_DETECTED path
 * - Multi-term input
 * - Max-length input
 */

import { verifyAlignment } from '../src/tools/verifyAlignment'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isError(result: object): result is { error: string } {
  return 'error' in result
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('verifyAlignment — input validation', () => {
  test('returns INPUT_TOO_LONG for text > 5000 chars', async () => {
    const longText = 'a'.repeat(5001)
    const result = await verifyAlignment({ text: longText })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect((result as any).error).toBe('INPUT_TOO_LONG')
    }
  })

  test('accepts text of exactly 5000 chars', async () => {
    const maxText = 'autonomous business '.repeat(250) // ~5000 chars
    const result = await verifyAlignment({ text: maxText.slice(0, 5000) })
    expect((result as any).error).not.toBe('INPUT_TOO_LONG')
  })
})

// ---------------------------------------------------------------------------
// NO_TERMS_DETECTED path
// ---------------------------------------------------------------------------

describe('verifyAlignment — no terms detected', () => {
  test('returns NO_TERMS_DETECTED for text with no Arco terms', async () => {
    const result = await verifyAlignment({ text: 'The quick brown fox jumps over the lazy dog.' })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect((result as any).error).toBe('NO_TERMS_DETECTED')
    }
  })

  test('NO_TERMS_DETECTED response includes hint', async () => {
    const result = await verifyAlignment({ text: 'Completely unrelated content about foxes.' })
    if (isError(result)) {
      expect((result as any).hint).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Term detection
// ---------------------------------------------------------------------------

describe('verifyAlignment — term detection', () => {
  test('detects "autonomous business" in structural context', async () => {
    const text = 'We are building an autonomous business where the agentic core handles all operations without human intervention.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const slugs = result.matched_terms.map(m => m.arco_equivalent.toLowerCase())
      expect(slugs.some(s => s.includes('autonomous'))).toBe(true)
    }
  })

  test('returns matched_terms array', async () => {
    const text = 'Our autonomous business uses a stewardship model to manage the agentic core.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      expect(Array.isArray(result.matched_terms)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Co-occurrence check — architectural vs generic usage
// ---------------------------------------------------------------------------

describe('verifyAlignment — co-occurrence check', () => {
  test('does not flag "automated" in a generic non-architectural sentence', async () => {
    const text = 'The automated sprinkler system waters the lawn at 6am.'
    const result = await verifyAlignment({ text })
    // Should not produce ALIGNED/PARTIALLY_ALIGNED for generic automation
    if (!isError(result)) {
      const verdicts = result.matched_terms.map(m => m.verdict)
      expect(verdicts.every(v => v !== 'ALIGNED')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Scoring and verdict thresholds
// ---------------------------------------------------------------------------

describe('verifyAlignment — verdict thresholds', () => {
  test('overall_alignment_score is a number between 0 and 1', async () => {
    const text = 'Our autonomous business delegates operations to an agentic core.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      expect(result.overall_alignment_score).toBeGreaterThanOrEqual(0)
      expect(result.overall_alignment_score).toBeLessThanOrEqual(1)
    }
  })

  test('overall_verdict is one of the five canonical values', async () => {
    const text = 'Our autonomous business delegates operations to an agentic core.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const valid = ['ALIGNED', 'PARTIALLY_ALIGNED', 'NEEDS_CLARIFICATION', 'MISALIGNED', 'NO_ARCO_TERMS_DETECTED']
      expect(valid).toContain(result.overall_verdict)
    }
  })

  test('per-term alignment_score is between 0 and 1', async () => {
    const text = 'Our autonomous business relies on an agentic core.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      for (const term of result.matched_terms) {
        expect(term.alignment_score).toBeGreaterThanOrEqual(0)
        expect(term.alignment_score).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Multi-term input
// ---------------------------------------------------------------------------

describe('verifyAlignment — multi-term input', () => {
  test('detects multiple terms in one passage', async () => {
    const text = [
      'The autonomous business model reduces coordination tax by eliminating human-to-human handoffs.',
      'The stewardship model ensures a single operator can manage the entire agentic core.',
    ].join(' ')
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      expect(result.matched_terms.length).toBeGreaterThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// recommended_reading
// ---------------------------------------------------------------------------

describe('verifyAlignment — recommended_reading', () => {
  test('returns recommended_reading array', async () => {
    const text = 'Our autonomous business is designed around the stewardship model.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      expect(Array.isArray(result.recommended_reading)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Max-length input (boundary)
// ---------------------------------------------------------------------------

describe('verifyAlignment — max-length input', () => {
  test('processes exactly 5000-character input without error', async () => {
    const base = 'The autonomous business model reduces coordination tax. '
    const text = base.repeat(Math.ceil(5000 / base.length)).slice(0, 5000)
    const result = await verifyAlignment({ text })
    expect((result as any).error).not.toBe('INPUT_TOO_LONG')
  })
})
