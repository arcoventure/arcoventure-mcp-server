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
import { publicToolList, TOOL_BY_NAME, validateToolArgs } from './tools/registry'

// ---------------------------------------------------------------------------
// Rate limiters — configured before deployment per CLAUDE.md hard constraint
// ---------------------------------------------------------------------------

// Emit the structured 429 shape documented in CLAUDE.md instead of
// express-rate-limit's default plaintext body.
function rateLimitHandler(_req: express.Request, res: express.Response): void {
  res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', retry_after: 60 })
}

const standardLimit  = rateLimit({ windowMs: 60_000, max: 300, handler: rateLimitHandler })
const alignmentLimit = rateLimit({ windowMs: 60_000, max: 60, handler: rateLimitHandler })
// Admin refresh is token-protected but otherwise unauthenticated traffic can
// brute-force the token or spam reloads; cap it tightly.
const adminLimit     = rateLimit({ windowMs: 60_000, max: 5, handler: rateLimitHandler })

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
    tools: publicToolList(),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const def = TOOL_BY_NAME.get(name)
    if (!def) {
      // Structured error rather than a throw, so an unknown tool returns a
      // clean MCP error instead of a 503.
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` }) }],
        isError: true,
      }
    }

    const invalid = validateToolArgs(def, args)
    if (invalid) {
      return {
        content: [{ type: 'text', text: JSON.stringify(invalid) }],
        isError: true,
      }
    }

    const result = await def.handler(args)
    // Surface tool-level structured errors as MCP errors too.
    const isError = typeof result === 'object' && result !== null && 'error' in result
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      ...(isError ? { isError: true } : {}),
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
