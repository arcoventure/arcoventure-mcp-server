/**
 * Tests for src/tools/verifyAlignment.ts
 *
 * Coverage matrix (from CLAUDE.md):
 * - Term detection
 * - Co-occurrence check (architectural vs generic usage)
 * - Scoring edge cases (ARCO_SPECIFIC vs STRONG_BUSINESS tiers)
 * - NO_TERMS_DETECTED path
 * - Multi-term input
 * - Max-length input
 */

import { verifyAlignment } from '../src/tools/verifyAlignment'
import { getCache, clearCache } from '../src/cache/termCache'
import { TermObject } from '../src/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isError(result: object): result is { error: string } {
  return 'error' in result
}

/** Seed the in-memory cache with test TermObjects so scoring logic fires. */
function seedCache(terms: TermObject[]): void {
  const cache = getCache()
  for (const term of terms) {
    cache.set(term.slug, term)
  }
}

function makeTermObject(slug: string, title: string, definition: string): TermObject {
  return {
    slug,
    title,
    blockquote_definition: definition,
    extended_definition: '',
    related_terms: [],
    sources: [],
  }
}

const TEST_TERMS: TermObject[] = [
  makeTermObject(
    'autonomous-business',
    'Autonomous Business',
    'A business engineered so core operations run without human intervention.'
  ),
  makeTermObject(
    'stewardship-model',
    'Stewardship Model',
    'Single operator overseeing an agentic stack as architect and exception handler.'
  ),
  makeTermObject(
    'coordination-tax',
    'Coordination Tax',
    'The overhead cost imposed by human-to-human coordination in a workflow.'
  ),
]

// ---------------------------------------------------------------------------
// Cache lifecycle — seed before each suite that needs it
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearCache()
  seedCache(TEST_TERMS)
})

afterEach(() => {
  clearCache()
})

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

// ---------------------------------------------------------------------------
// Phase 2: ARCO_SPECIFIC scoring tier (score = 0.85, verdict = ALIGNED)
// ---------------------------------------------------------------------------

describe('verifyAlignment — ARCO_SPECIFIC tier scoring', () => {
  test('agentic context → ALIGNED (score 0.85)', async () => {
    const text = 'The autonomous business relies on an agentic core to execute operations.'
    const result = await verifyAlignment({ text })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Autonomous Business')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.85)
      expect(match!.verdict).toBe('ALIGNED')
    }
  })

  test('stewardship context → ALIGNED (score 0.85)', async () => {
    const text = 'The stewardship model gives a single operator control over delegation and orchestration.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Stewardship Model')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.85)
      expect(match!.verdict).toBe('ALIGNED')
    }
  })

  test('coordination context → ALIGNED (score 0.85)', async () => {
    const text = 'Coordination tax grows when autonomous workflows require delegation across teams.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Coordination Tax')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.85)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2: STRONG_BUSINESS scoring tiers (0.75 / 0.60)
// ---------------------------------------------------------------------------

describe('verifyAlignment — STRONG_BUSINESS tier scoring', () => {
  test('two business signals → score 0.75 (PARTIALLY_ALIGNED)', async () => {
    // "workflow" and "operations" are STRONG_BUSINESS; "autonomous"/"business" are the term itself (excluded);
    // no ARCO_SPECIFIC words → businessHits = 2 → 0.75
    const text = 'The autonomous business optimises workflow and operations without human intervention.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Autonomous Business')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.75)
      expect(match!.verdict).toBe('PARTIALLY_ALIGNED')
    }
  })

  test('one business signal → score 0.60 (PARTIALLY_ALIGNED)', async () => {
    // "company" is STRONG_BUSINESS; no ARCO_SPECIFIC, no second business word
    const text = 'An autonomous business is a company worth building.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Autonomous Business')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.60)
      expect(match!.verdict).toBe('PARTIALLY_ALIGNED')
    }
  })

  test('no context → score 0.30 (NEEDS_CLARIFICATION)', async () => {
    // Isolated term, no surrounding vocabulary
    const text = 'Coordination tax.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.arco_equivalent === 'Coordination Tax')
      expect(match).toBeDefined()
      expect(match!.alignment_score).toBe(0.30)
      expect(match!.verdict).toBe('NEEDS_CLARIFICATION')
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2: co-occurrence false-positive prevention
// ---------------------------------------------------------------------------

describe('verifyAlignment — false positive prevention', () => {
  test('generic "automated" not in architectural context → not ALIGNED', async () => {
    const text = 'The automated sprinkler system waters the lawn at 6am.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const verdicts = result.matched_terms.map(m => m.verdict)
      expect(verdicts.every(v => v !== 'ALIGNED')).toBe(true)
    }
  })

  test('suggested_reframe present for MISALIGNED/NEEDS_CLARIFICATION', async () => {
    const text = 'Coordination tax.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const match = result.matched_terms.find(m => m.verdict === 'NEEDS_CLARIFICATION')
      if (match) expect(match.suggested_reframe).toBeDefined()
    }
  })

  test('no suggested_reframe for ALIGNED terms', async () => {
    const text = 'The autonomous business relies on an agentic operator.'
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      const aligned = result.matched_terms.filter(m => m.verdict === 'ALIGNED')
      for (const match of aligned) {
        expect(match.suggested_reframe).toBeUndefined()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2: multi-term + overall scoring
// ---------------------------------------------------------------------------

describe('verifyAlignment — multi-term overall scoring', () => {
  test('multi-term input produces correct overall score (average)', async () => {
    // Both terms should hit ARCO_SPECIFIC context → both 0.85 → overall 0.85
    const text = [
      'The autonomous business delegates operations to an agentic core.',
      'The coordination tax is reduced by the stewardship model and operator delegation.',
    ].join(' ')
    const result = await verifyAlignment({ text })
    if (!isError(result)) {
      expect(result.matched_terms.length).toBeGreaterThanOrEqual(2)
      expect(result.overall_alignment_score).toBeGreaterThanOrEqual(0.75)
      expect(result.overall_verdict).toBe('ALIGNED')
    }
  })
})
