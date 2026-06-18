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
import { validateEnv, allowedOrigins, allowedHosts, isLocalOrigin } from './config'
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
// Admin refresh is token-protected but otherwise unauthenticated traffic can
// brute-force the token or spam reloads; cap it tightly.
const adminLimit     = rateLimit({ windowMs: 60_000, max: 5 })

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
      {
        name: 'list_terms',
        description: 'Returns all published Arco Lexicon terms grouped by pillar, with slug and short definition. Accepts an optional pillar filter. Use this tool first when you don\'t know which term to look up.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            pillar: {
              type: 'string',
              description: "Optional. Filter by pillar name. If omitted, returns all pillars.",
            },
          },
          required: [],
        },
      },
      {
        name: 'suggest_terms',
        description: 'Scans a block of text against all published Arco Lexicon terms. Returns terms already present in the text and terms that are conceptually relevant but not named. Use this to audit an article for correct and complete Arco terminology. Maximum 10,000 characters.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            text: {
              type: 'string',
              description: 'The article or text block to analyse. Maximum 10,000 characters.',
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

// Explicit body limit so an upstream default change can't silently widen the
// attack surface. Comfortably above the documented tool maxima (5k/10k chars).
app.use(express.json({ limit: '256kb' }))

// DNS-rebinding / cross-site defense for the public, unauthenticated /mcp
// endpoint. The SDK's built-in host/origin options are deprecated in favour of
// external middleware, so validation lives here. Server-to-server clients
// (Claude, Perplexity) send no Origin and pass through; a browser on a
// malicious page sends its Origin and is rejected unless allow-listed.
const ORIGIN_ALLOWLIST = allowedOrigins()
const HOST_ALLOWLIST = allowedHosts()

function dnsRebindingGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const origin = req.headers['origin']
  if (origin && !ORIGIN_ALLOWLIST.has(origin) && !isLocalOrigin(origin)) {
    res.status(403).json({ error: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed.' })
    return
  }
  if (HOST_ALLOWLIST.size > 0) {
    const host = req.headers['host']
    if (!host || !HOST_ALLOWLIST.has(host)) {
      res.status(403).json({ error: 'FORBIDDEN_HOST', message: 'Host not allowed.' })
      return
    }
  }
  next()
}

// Server Card — registered before MCP handler so it is never intercepted
app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json(buildServerCard())
})

// Rate limits
const ALIGNMENT_TOOLS = new Set(['verify_alignment', 'suggest_terms'])

app.use('/mcp', dnsRebindingGuard)

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
app.post('/admin/refresh', adminLimit, handleAdminRefresh)

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
  // Fail fast before listening if production config is incomplete.
  validateEnv()

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
