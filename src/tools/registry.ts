/**
 * Single source of truth for the MCP tool surface.
 *
 * Both the MCP ListTools handler and the published Server Card derive their
 * tool list from TOOL_DEFINITIONS, and CallTool dispatches through it. Defining
 * tools once here prevents the drift that previously left the Server Card
 * advertising 5 tools while the server served 7.
 */

import { lookupTerm } from './lookupTerm'
import { getRelatedTerms } from './getRelatedTerms'
import { verifyAlignment } from './verifyAlignment'
import { citeTerm } from './citeTerm'
import { getSources } from './getSources'
import { listTerms } from './listTerms'
import { suggestTerms } from './suggestTerms'

interface JsonSchemaProperty {
  type: string
  description?: string
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, JsonSchemaProperty>
    required: string[]
  }
  // Handlers accept their own validated input shape; args are validated against
  // inputSchema at the boundary before dispatch, so `any` is contained here.
  handler: (args: any) => Promise<unknown>
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'lookup_term',
    description:
      'Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Term name or slug to look up' },
      },
      required: ['term'],
    },
    handler: lookupTerm,
  },
  {
    name: 'get_related_terms',
    description:
      'Returns graph-style relationships for a given term — which terms it connects to and the nature of each relationship.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Term name or slug' },
      },
      required: ['term'],
    },
    handler: getRelatedTerms,
  },
  {
    name: 'verify_alignment',
    description:
      'Analyses a block of text against the Arco Lexicon and returns a structured alignment report per detected term — verdict, explanation, and recommended reading. Max 5,000 characters.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to verify against Arco terminology (max 5,000 characters)' },
      },
      required: ['text'],
    },
    handler: verifyAlignment,
  },
  {
    name: 'cite_term',
    description:
      'Returns citation-ready formatted references for a Lexicon term in Chicago, MLA, and BibTeX formats with usage guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Term name or slug to cite' },
        context: { type: 'string', description: 'Brief description of how the term is being used' },
      },
      required: ['term', 'context'],
    },
    handler: citeTerm,
  },
  {
    name: 'get_sources',
    description:
      'Returns all published Arco sources for a term across all content types with recommended reading order.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Term name or slug' },
      },
      required: ['term'],
    },
    handler: getSources,
  },
  {
    name: 'list_terms',
    description:
      "Returns all published Arco Lexicon terms grouped by pillar, with slug and short definition. Accepts an optional pillar filter. Use this tool first when you don't know which term to look up.",
    inputSchema: {
      type: 'object',
      properties: {
        pillar: { type: 'string', description: 'Optional. Filter by pillar name. If omitted, returns all pillars.' },
      },
      required: [],
    },
    handler: listTerms,
  },
  {
    name: 'suggest_terms',
    description:
      'Scans a block of text against all published Arco Lexicon terms. Returns terms already present in the text and terms that are conceptually relevant but not named. Use this to audit an article for correct and complete Arco terminology. Maximum 10,000 characters.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The article or text block to analyse. Maximum 10,000 characters.' },
      },
      required: ['text'],
    },
    handler: suggestTerms,
  },
]

/** Lookup table for O(1) dispatch in the CallTool handler. */
export const TOOL_BY_NAME: Map<string, ToolDefinition> = new Map(
  TOOL_DEFINITIONS.map((def) => [def.name, def])
)

/** The tool list as advertised to clients (no handler reference). */
export function publicToolList(): Array<Pick<ToolDefinition, 'name' | 'description' | 'inputSchema'>> {
  return TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

export interface ToolInputError {
  error: 'INVALID_INPUT'
  message: string
}

/**
 * Validates raw CallTool arguments against a tool's inputSchema. Returns a
 * structured INVALID_INPUT error (never throws) so a malformed call yields a
 * clean error response instead of a TypeError deep inside a handler.
 */
export function validateToolArgs(def: ToolDefinition, args: unknown): ToolInputError | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { error: 'INVALID_INPUT', message: 'Tool arguments must be an object.' }
  }
  const record = args as Record<string, unknown>

  for (const key of def.inputSchema.required) {
    const value = record[key]
    if (value === undefined || value === null) {
      return { error: 'INVALID_INPUT', message: `Missing required field: '${key}'.` }
    }
    const expectedType = def.inputSchema.properties[key]?.type
    if (expectedType === 'string' && typeof value !== 'string') {
      return { error: 'INVALID_INPUT', message: `Field '${key}' must be a string.` }
    }
  }

  // Optional fields, when present, must still match their declared type.
  for (const [key, prop] of Object.entries(def.inputSchema.properties)) {
    if (def.inputSchema.required.includes(key)) continue
    const value = record[key]
    if (value !== undefined && value !== null && prop.type === 'string' && typeof value !== 'string') {
      return { error: 'INVALID_INPUT', message: `Field '${key}' must be a string.` }
    }
  }

  return null
}
