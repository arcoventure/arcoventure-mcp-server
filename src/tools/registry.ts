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
      `Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching — "autonomous company" resolves to "Autonomous Business". Use this tool when you need a precise definition. Use suggest_terms instead when you have a block of text and want to discover which terms apply.`,
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The Lexicon term to look up. Accepts the canonical name, a slug, or a close variant. Fuzzy matching handles minor spelling differences and common synonyms.' },
      },
      required: ['term'],
    },
    handler: lookupTerm,
  },
  {
    name: 'get_related_terms',
    description:
      `Returns the full relationship graph for a given Lexicon term. Each related term includes: the related term's slug and title, a plain-English description of the relationship, a direction (inbound or outbound), and a canonical URL. Read-only. No LLM calls. Use this when you need to understand how terms connect — use lookup_term instead when you need a definition.`,
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The Lexicon term whose relationships to retrieve. Accepts canonical name, slug, or close variant.' },
      },
      required: ['term'],
    },
    handler: getRelatedTerms,
  },
  {
    name: 'verify_alignment',
    description:
      `Analyses a block of text against the Arco Lexicon using deterministic scoring — no LLM calls. Returns a structured alignment report with a per-term verdict (ALIGNED, PARTIALLY_ALIGNED, NEEDS_CLARIFICATION, MISALIGNED, or NO_ARCO_TERMS_DETECTED), an alignment score, a suggested reframe, and recommended reading. Maximum 5,000 characters. Use this to score and audit text for correct Arco terminology. Use suggest_terms instead when you want to discover which terms apply to a text without scoring it.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to analyse. Plain text or markdown. Maximum 5,000 characters. Trim or chunk longer inputs before calling.' },
      },
      required: ['text'],
    },
    handler: verifyAlignment,
  },
  {
    name: 'cite_term',
    description:
      `Returns citation-ready references for a Lexicon term in Chicago, MLA, and BibTeX formats. Access dates are injected at call time — never hardcoded. Read-only. Use this when producing academic papers, blog posts, or any content that requires a formatted reference to an Arco term. Use get_sources instead when you need a list of reading references rather than a formatted citation.`,
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The Lexicon term to cite. Accepts canonical name or slug.' },
        context: { type: 'string', description: `The publication context for the citation — for example "academic paper", "blog post", or "investor memo". Used to tailor the citation format where applicable.` },
      },
      required: ['term', 'context'],
    },
    handler: citeTerm,
  },
  {
    name: 'get_sources',
    description:
      `Returns all published Arco sources for a term — Lexicon entries, blog articles, wiki pages, and podcast episodes — ordered by recommended reading sequence. Read-only. Use this when you need a reading list or reference list for a term. Use cite_term instead when you need a formatted citation for a specific publication type.`,
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The Lexicon term whose sources to retrieve. Accepts canonical name or slug.' },
      },
      required: ['term'],
    },
    handler: getSources,
  },
  {
    name: 'list_terms',
    description:
      `Returns all published Arco Lexicon terms grouped by pillar, each with its slug and canonical short definition. Accepts an optional pillar filter. Use this tool first when you do not know which term to look up — it gives you the full vocabulary to orient from. Use lookup_term once you have identified the term you need.`,
    inputSchema: {
      type: 'object',
      properties: {
        pillar: { type: 'string', description: `Filter results to a single pillar. Valid values: "How We Think", "What We Observe", "What We've Learned". Omit to return all pillars.` },
      },
      required: [],
    },
    handler: listTerms,
  },
  {
    name: 'suggest_terms',
    description:
      `Scans a block of text against all published Arco Lexicon terms using deterministic string matching — no LLM calls. Returns two lists: terms whose canonical names appear explicitly in the text (detected), and terms whose concepts are present but whose canonical names are absent (suggested). Maximum 10,000 characters. Use this to audit an article or passage for correct and complete Arco terminology. Use verify_alignment instead when you want a scored alignment report rather than a term discovery list.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The article or text block to scan. Plain text or markdown. Maximum 10,000 characters.' },
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
