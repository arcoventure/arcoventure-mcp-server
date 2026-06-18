/**
 * Tests for src/tools/registry.ts — the single tool source of truth and the
 * boundary input validation.
 */

import { TOOL_DEFINITIONS, TOOL_BY_NAME, publicToolList, validateToolArgs } from '../src/tools/registry'

describe('tool registry', () => {
  test('defines exactly the seven served tools', () => {
    const names = TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toEqual([
      'lookup_term',
      'get_related_terms',
      'verify_alignment',
      'cite_term',
      'get_sources',
      'list_terms',
      'suggest_terms',
    ])
  })

  test('every definition has a handler and a well-formed schema', () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(typeof def.handler).toBe('function')
      expect(def.inputSchema.type).toBe('object')
      expect(Array.isArray(def.inputSchema.required)).toBe(true)
    }
  })

  test('publicToolList omits the handler', () => {
    for (const tool of publicToolList()) {
      expect('handler' in tool).toBe(false)
      expect(tool.name).toBeDefined()
      expect(tool.inputSchema).toBeDefined()
    }
  })

  test('TOOL_BY_NAME resolves each tool', () => {
    expect(TOOL_BY_NAME.get('lookup_term')?.name).toBe('lookup_term')
    expect(TOOL_BY_NAME.get('nope')).toBeUndefined()
  })
})

describe('validateToolArgs', () => {
  const lookup = TOOL_BY_NAME.get('lookup_term')!
  const listTerms = TOOL_BY_NAME.get('list_terms')!
  const cite = TOOL_BY_NAME.get('cite_term')!

  test('rejects non-object args', () => {
    expect(validateToolArgs(lookup, null)?.error).toBe('INVALID_INPUT')
    expect(validateToolArgs(lookup, 'string')?.error).toBe('INVALID_INPUT')
    expect(validateToolArgs(lookup, [])?.error).toBe('INVALID_INPUT')
  })

  test('rejects a missing required field', () => {
    expect(validateToolArgs(lookup, {})?.message).toMatch(/Missing required field: 'term'/)
  })

  test('rejects a wrongly-typed required field', () => {
    expect(validateToolArgs(lookup, { term: 42 })?.message).toMatch(/must be a string/)
  })

  test('accepts a valid call', () => {
    expect(validateToolArgs(lookup, { term: 'autonomous business' })).toBeNull()
    expect(validateToolArgs(cite, { term: 'x', context: 'y' })).toBeNull()
  })

  test('allows omitted optional fields but type-checks present ones', () => {
    expect(validateToolArgs(listTerms, {})).toBeNull()
    expect(validateToolArgs(listTerms, { pillar: 'How We Think' })).toBeNull()
    expect(validateToolArgs(listTerms, { pillar: 5 })?.error).toBe('INVALID_INPUT')
  })
})
