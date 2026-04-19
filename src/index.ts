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

import { loadCache, getCache, getLastRefreshed, isCacheStale } from './cache/termCache'
import { handleAdminRefresh } from './admin/refresh'
import { buildServerCard } from './well-known/serverCard'
import { lookupTerm } from './tools/lookupTerm'
import { getRelatedTerms } from './tools/getRelatedTerms'
import { verifyAlignment } from './tools/verifyAlignment'
import { citeTerm } from './tools/citeTerm'
import { getSources } from './tools/getSources'

// ---------------------------------------------------------------------------
// Rate limiters — configured before deployment per CLAUDE.md hard constraint
// ---------------------------------------------------------------------------

const standardLimit  = rateLimit({ windowMs: 60_000, max: 300 })
const alignmentLimit = rateLimit({ windowMs: 60_000, max: 60 })

// ---------------------------------------------------------------------------
// MCP server + tool registration
// ---------------------------------------------------------------------------

const mcpServer = new Server(
  { name: 'arcoventure-lexicon', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'lookup_term',
      description: 'Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching.',
      inputSchema: {
        type: 'object' as const,
        properties: { term: { type: 'string' } },
        required: ['term'],
      },
    },
    {
      name: 'get_related_terms',
      description: 'Returns graph-style relationships for a given term.',
      inputSchema: {
        type: 'object' as const,
        properties: { term: { type: 'string' } },
        required: ['term'],
      },
    },
    {
      name: 'verify_alignment',
      description: 'Analyses a block of text against the Arco Lexicon and returns a structured alignment report. Max 5,000 characters.',
      inputSchema: {
        type: 'object' as const,
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    {
      name: 'cite_term',
      description: 'Returns citation-ready formatted references in Chicago, MLA, and BibTeX formats.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          term:    { type: 'string' },
          context: { type: 'string' },
        },
        required: ['term', 'context'],
      },
    },
    {
      name: 'get_sources',
      description: 'Returns all published Arco sources for a term with recommended reading order.',
      inputSchema: {
        type: 'object' as const,
        properties: { term: { type: 'string' } },
        required: ['term'],
      },
    },
  ],
}))

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())

// Server Card — registered before MCP handler so it is never intercepted
app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json(buildServerCard())
})

// Rate limits
app.use('/mcp', (req, _res, next) => {
  if (req.body?.method === 'tools/call' &&
      req.body?.params?.name === 'verify_alignment') {
    return alignmentLimit(req, _res, next)
  }
  return standardLimit(req, _res, next)
})

// MCP endpoint — handles all MCP traffic (GET for SSE, POST for messages)
app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, req.body)
  res.on('finish', () => transport.close())
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
