/**
 * MCP server entry point.
 * Registers all tools, sets up Express routes, starts the HTTP server.
 * Calls loadCache() on startup. Starts TTL watchdog for 24-hour reload.
 */

import express from 'express'
import rateLimit from 'express-rate-limit'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { loadCache, getCache, getLastRefreshed, isCacheStale } from './cache/termCache'
import { handleAdminRefresh } from './admin/refresh'
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

const server = new Server(
  { name: 'arcoventure-lexicon', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// ---------------------------------------------------------------------------
// Express app — admin + health endpoints
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())

// Rate-limit MCP tool endpoints via Express middleware on known paths
app.use('/tools/verify_alignment', alignmentLimit)
app.use('/tools', standardLimit)

app.post('/admin/refresh', handleAdminRefresh)

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
      term_count:           termCount,
      last_refreshed:       lastRefreshed?.toISOString() ?? null,
      ttl_remaining_hours:  ttlRemainingHours,
    },
    uptime_seconds: uptimeSeconds,
  })
})

// ---------------------------------------------------------------------------
// TTL watchdog — reloads cache every 24 hours as a safety net
// ---------------------------------------------------------------------------

function startTtlWatchdog(): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check every hour

  setInterval(() => {
    if (isCacheStale()) {
      console.log('[watchdog] Cache is stale — reloading')
      loadCache().catch((err) => console.error('[watchdog] Cache reload failed:', err))
    }
  }, CHECK_INTERVAL_MS).unref() // unref so the interval does not prevent process exit
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await loadCache()

  startTtlWatchdog()

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const port = process.env.PORT ?? 3000
  app.listen(port, () => {
    console.log(`arcoventure-mcp-server listening on port ${port}`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
