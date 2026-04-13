/**
 * Tests for src/parser/markdownParser.ts
 *
 * Coverage matrix (from CLAUDE.md):
 * - Missing sections (blockquote, metadata)
 * - Malformed blockquotes
 * - Missing metadata
 * - Extra whitespace
 * - Empty files
 * - Terms with no related terms
 * - Terms with no sources
 * - Metadata on same line (must be separate lines)
 * - Invalid pillar values
 */

import { parseTermMarkdown } from '../src/parser/markdownParser'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MARKDOWN = `# Autonomous Business

> A business engineered from the ground up so core operations run without human intervention.

An Autonomous Business delegates decision-making to an agentic core, with a single human steward handling exceptions.

## Related Terms
- [Stewardship Model](https://arcoventure.studio/lexicon/stewardship-model) — governance layer for the autonomous business

## Articles
- [How to Build an Autonomous Business](https://arcoventure.studio/blog/build-autonomous-business)

## References
- [Lexicon](https://arcoventure.studio/lexicon/autonomous-business) — canonical definition
- [Wiki](https://wiki.arcoventure.studio/docs/autonomous-business) — extended entry

## Metadata

**First used:** 2025-01-15
**Pillar:** How We Think
`

// ---------------------------------------------------------------------------
// Valid parse
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — valid input', () => {
  test('parses title correctly', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term).not.toBeNull()
    expect(term!.title).toBe('Autonomous Business')
  })

  test('parses blockquote definition', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.blockquote_definition).toMatch(/engineered from the ground up/)
  })

  test('parses extended definition', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.extended_definition).toMatch(/agentic core/)
  })

  test('parses first_used metadata', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.first_used).toBe('2025-01-15')
  })

  test('parses pillar metadata', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.pillar).toBe('How We Think')
  })

  test('parses related terms', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.related_terms).toHaveLength(1)
    expect(term!.related_terms[0].slug).toBe('stewardship-model')
  })

  test('parses sources from References section', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    const types = term!.sources.map(s => s.type)
    expect(types).toContain('lexicon_entry')
    expect(types).toContain('wiki')
  })

  test('returns no warnings for valid input', () => {
    const { warnings } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(warnings).toHaveLength(0)
  })

  test('preserves slug from argument', () => {
    const { term } = parseTermMarkdown('autonomous-business', VALID_MARKDOWN)
    expect(term!.slug).toBe('autonomous-business')
  })
})

// ---------------------------------------------------------------------------
// Missing required sections
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — missing blockquote', () => {
  const noBlockquote = VALID_MARKDOWN.replace(/^> .+$/m, '')

  test('returns null term', () => {
    const { term } = parseTermMarkdown('autonomous-business', noBlockquote)
    expect(term).toBeNull()
  })

  test('includes warning', () => {
    const { warnings } = parseTermMarkdown('autonomous-business', noBlockquote)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('parseTermMarkdown — missing ## Metadata section', () => {
  const noMetadata = VALID_MARKDOWN.replace(/## Metadata[\s\S]*$/, '')

  test('returns null term', () => {
    const { term } = parseTermMarkdown('autonomous-business', noMetadata)
    expect(term).toBeNull()
  })

  test('includes warning', () => {
    const { warnings } = parseTermMarkdown('autonomous-business', noMetadata)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Edge cases — still parses (warnings only)
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — missing ## Related Terms', () => {
  const noRelated = VALID_MARKDOWN.replace(/## Related Terms[\s\S]*?(?=## Articles)/, '')

  test('returns term (not null)', () => {
    const { term } = parseTermMarkdown('autonomous-business', noRelated)
    expect(term).not.toBeNull()
  })

  test('related_terms is empty array', () => {
    const { term } = parseTermMarkdown('autonomous-business', noRelated)
    expect(term!.related_terms).toEqual([])
  })
})

describe('parseTermMarkdown — missing ## Articles', () => {
  const noArticles = VALID_MARKDOWN.replace(/## Articles[\s\S]*?(?=## References)/, '')

  test('returns term (not null)', () => {
    const { term } = parseTermMarkdown('autonomous-business', noArticles)
    expect(term).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Empty file
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — empty file', () => {
  test('returns null term', () => {
    const { term } = parseTermMarkdown('empty-term', '')
    expect(term).toBeNull()
  })

  test('includes warning', () => {
    const { warnings } = parseTermMarkdown('empty-term', '')
    expect(warnings.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Whitespace variations
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — extra whitespace in metadata', () => {
  const extraSpaces = VALID_MARKDOWN
    .replace('**First used:** 2025-01-15', '**First used:**   2025-01-15  ')
    .replace('**Pillar:** How We Think', '**Pillar:**   How We Think  ')

  test('still parses first_used correctly', () => {
    const { term } = parseTermMarkdown('autonomous-business', extraSpaces)
    expect(term!.first_used).toBe('2025-01-15')
  })

  test('still parses pillar correctly', () => {
    const { term } = parseTermMarkdown('autonomous-business', extraSpaces)
    expect(term!.pillar).toBe('How We Think')
  })
})

// ---------------------------------------------------------------------------
// Metadata on same line (must fail — fields must be on separate lines)
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — metadata on same line', () => {
  const sameLine = VALID_MARKDOWN
    .replace('**First used:** 2025-01-15\n**Pillar:** How We Think', '**First used:** 2025-01-15  **Pillar:** How We Think')

  test('returns null or missing pillar (same-line not supported)', () => {
    const { term } = parseTermMarkdown('autonomous-business', sameLine)
    // Either the whole term fails or pillar is not parsed
    if (term !== null) {
      expect(term.pillar).toBeUndefined()
    } else {
      expect(term).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Invalid pillar value
// ---------------------------------------------------------------------------

describe('parseTermMarkdown — invalid pillar value', () => {
  const invalidPillar = VALID_MARKDOWN.replace('**Pillar:** How We Think', '**Pillar:** Invalid Value')

  test('pillar field is undefined (not set to invalid value)', () => {
    const { term } = parseTermMarkdown('autonomous-business', invalidPillar)
    // Term may still parse; pillar should be undefined if value is not canonical
    if (term !== null) {
      expect(term.pillar).toBeUndefined()
    }
  })
})
