/**
 * MCP server entry point.
 * Uses StreamableHTTPServerTransport (HTTP + SSE) — not stdio.
 * Express starts first so /health is available immediately.
 */

import express from 'express'
import rateLimit from 'express-rate-limit'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { SERVER_VERSION } from './version'
import { loadCache, getCache, getLastRefreshed, isCacheStale } from './cache/termCache'
import { handleAdminRefresh } from './admin/refresh'
import { buildServerCard } from './well-known/serverCard'
import { lookupTerm } from './tools/lookupTerm'
import { getRelatedTerms } from './tools/getRelatedTerms'
import { verifyAlignment } from './tools/verifyAlignment'
import { citeTerm } from './tools/citeTerm'
import { getSources } from './tools/getSources'
import { listTerms } from './tools/listTerms'
import { suggestTerms } from './tools/suggestTerms'

// ---------------------------------------------------------------------------
// Rate limiters — configured before deployment per CLAUDE.md hard constraint
// ---------------------------------------------------------------------------

const standardLimit  = rateLimit({ windowMs: 60_000, max: 300 })
const alignmentLimit = rateLimit({ windowMs: 60_000, max: 60 })

// ---------------------------------------------------------------------------
// MCP server factory
//
// One Server + Transport per request. The MCP SDK forbids reconnecting a
// Server to multiple transports (`Already connected to a transport`), and
// reusing a singleton across concurrent requests crashes the process.
// ---------------------------------------------------------------------------

function createMcpServer(): Server {
  const server = new Server(
    { name: 'arcoventure-lexicon', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'lookup_term',
        description: 'Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching — "autonomous company" resolves to "Autonomous Business". Use this tool when you need a precise definition. Use suggest_terms instead when you have a block of text and want to discover which terms apply.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            term: {
              type: 'string',
              description: 'The Lexicon term to look up. Accepts the canonical name, a slug, or a close variant. Fuzzy matching handles minor spelling differences and common synonyms.',
            },
          },
          required: ['term'],
        },
      },
      {
        name: 'get_related_terms',
        description: 'Returns the full relationship graph for a given Lexicon term. Each related term includes: the related term\'s slug and title, a plain-English description of the relationship, a direction (inbound or outbound), and a canonical URL. Read-only. No LLM calls. Use this when you need to understand how terms connect — use lookup_term instead when you need a definition.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            term: {
              type: 'string',
              description: 'The Lexicon term whose relationships to retrieve. Accepts canonical name, slug, or close variant.',
            },
          },
          required: ['term'],
        },
      },
      {
        name: 'verify_alignment',
        description: 'Analyses a block of text against the Arco Lexicon using deterministic scoring — no LLM calls. Returns a structured alignment report with a per-term verdict (ALIGNED, PARTIALLY_ALIGNED, NEEDS_CLARIFICATION, MISALIGNED, or NO_ARCO_TERMS_DETECTED), an alignment score, a suggested reframe, and recommended reading. Maximum 5,000 characters. Use this to score and audit text for correct Arco terminology. Use suggest_terms instead when you want to discover which terms apply to a text without scoring it.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            text: {
              type: 'string',
              description: 'The text to analyse. Plain text or markdown. Maximum 5,000 characters. Trim or chunk longer inputs before calling.',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'cite_term',
        description: 'Returns citation-ready references for a Lexicon term in Chicago, MLA, and BibTeX formats. Access dates are injected at call time — never hardcoded. Read-only. Use this when producing academic papers, blog posts, or any content that requires a formatted reference to an Arco term. Use get_sources instead when you need a list of reading references rather than a formatted citation.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            term: {
              type: 'string',
              description: 'The Lexicon term to cite. Accepts canonical name or slug.',
            },
            context: {
              type: 'string',
              description: 'The publication context for the citation — for example "academic paper", "blog post", or "investor memo". Used to tailor the citation format where applicable.',
            },
          },
          required: ['term', 'context'],
        },
      },
      {
        name: 'get_sources',
        description: 'Returns all published Arco sources for a term — Lexicon entries, blog articles, wiki pages, and podcast episodes — ordered by recommended reading sequence. Read-only. Use this when you need a reading list or reference list for a term. Use cite_term instead when you need a formatted citation for a specific publication type.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            term: {
              type: 'string',
              description: 'The Lexicon term whose sources to retrieve. Accepts canonical name or slug.',
            },
          },
          required: ['term'],
        },
      },
      {
        name: 'list_terms',
        description: 'Returns all published Arco Lexicon terms grouped by pillar, each with its slug and canonical short definition. Accepts an optional pillar filter. Use this tool first when you do not know which term to look up — it gives you the full vocabulary to orient from. Use lookup_term once you have identified the term you need.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            pillar: {
              type: 'string',
              description: 'Filter results to a single pillar. Valid values: "How We Think", "What We Observe", "What We\'ve Learned". Omit to return all pillars.',
            },
          },
          required: [],
        },
      },
      {
        name: 'suggest_terms',
        description: 'Scans a block of text against all published Arco Lexicon terms using deterministic string matching — no LLM calls. Returns two lists: terms whose canonical names appear explicitly in the text (detected), and terms whose concepts are present but whose canonical names are absent (suggested). Maximum 10,000 characters. Use this to audit an article or passage for correct and complete Arco terminology. Use verify_alignment instead when you want a scored alignment report rather than a term discovery list.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            text: {
              type: 'string',
              description: 'The article or text block to scan. Plain text or markdown. Maximum 10,000 characters.',
            },
          },
          required: ['text'],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    switch (name) {
      case 'lookup_term':
        return { content: [{ type: 'text', text: JSON.stringify(await lookupTerm(args as any)) }] }
      case 'get_related_terms':
        return { content: [{ type: 'text', text: JSON.stringify(await getRelatedTerms(args as any)) }] }
      case 'verify_alignment':
        return { content: [{ type: 'text', text: JSON.stringify(await verifyAlignment(args as any)) }] }
      case 'cite_term':
        return { content: [{ type: 'text', text: JSON.stringify(await citeTerm(args as any)) }] }
      case 'get_sources':
        return { content: [{ type: 'text', text: JSON.stringify(await getSources(args as any)) }] }
      case 'list_terms':
        return { content: [{ type: 'text', text: JSON.stringify(await listTerms(args as any)) }] }
      case 'suggest_terms':
        return { content: [{ type: 'text', text: JSON.stringify(await suggestTerms(args as any)) }] }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })

  return server
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

// Railway terminates TLS at its edge proxy and forwards X-Forwarded-For.
// Without trust proxy=1, express-rate-limit cannot identify clients and
// throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR for every request — silently
// degrading to a single shared bucket and spamming the logs.
app.set('trust proxy', 1)

app.use(express.json())

// Server Card — registered before MCP handler so it is never intercepted
app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json(buildServerCard())
})

// Rate limits
const ALIGNMENT_TOOLS = new Set(['verify_alignment', 'suggest_terms'])

app.use('/mcp', (req, _res, next) => {
  if (req.body?.method === 'tools/call' &&
      ALIGNMENT_TOOLS.has(req.body?.params?.name)) {
    return alignmentLimit(req, _res, next)
  }
  return standardLimit(req, _res, next)
})

// MCP endpoint — handles all MCP traffic (GET for SSE, POST for messages)
//
// One Server + Transport per request. Errors are caught here so an uncaught
// exception inside the SDK can never bring the process down.
app.all('/mcp', async (req, res) => {
  const server = createMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  // Tear both down whenever the client disconnects, the response finishes,
  // or an error short-circuits the chain. 'close' covers all three.
  const cleanup = (): void => {
    Promise.resolve(transport.close()).catch(() => { /* swallow */ })
    Promise.resolve(server.close()).catch(() => { /* swallow */ })
  }
  res.on('close', cleanup)

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('[mcp] request failed:', err)
    if (!res.headersSent) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP error' },
        id: req.body?.id ?? null,
      })
    }
    cleanup()
  }
})

// Admin
app.post('/admin/refresh', handleAdminRefresh)

// Health
app.get('/health', (_req, res) => {
  const lastRefreshed = getLastRefreshed()
  const termCount     = getCache().size
  const uptimeSeconds = Math.floor(process.uptime())

  let ttlRemainingHours: number | null = null
  if (lastRefreshed) {
    const ageMs = Date.now() - lastRefreshed.getTime()
    ttlRemainingHours = Math.max(0, Math.round((24 * 3600_000 - ageMs) / 3600_000 * 10) / 10)
  }

  res.json({
    status: 'ok',
    cache: {
      term_count:          termCount,
      last_refreshed:      lastRefreshed?.toISOString() ?? null,
      ttl_remaining_hours: ttlRemainingHours,
    },
    uptime_seconds: uptimeSeconds,
  })
})

// ---------------------------------------------------------------------------
// TTL watchdog — reloads cache every 24 hours as a safety net
// ---------------------------------------------------------------------------

function startTtlWatchdog(): void {
  setInterval(() => {
    if (isCacheStale()) {
      console.log('[watchdog] Cache is stale — reloading')
      loadCache().catch((err) => console.error('[watchdog] Cache reload failed:', err))
    }
  }, 60 * 60 * 1000).unref()
}

// ---------------------------------------------------------------------------
// Startup — Express listens first, then cache loads, then MCP is ready
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const port = process.env.PORT ?? 3000

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`arcoventure-mcp-server listening on port ${port}`)
      resolve()
    })
  })

  try {
    await loadCache()
    console.log(`Cache loaded — ${getCache().size} terms ready`)
  } catch (err) {
    console.error('[startup] Cache load failed — server will keep running, retry via POST /admin/refresh:', err)
  }
  startTtlWatchdog()
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
