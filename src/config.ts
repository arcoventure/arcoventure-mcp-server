/**
 * Centralised configuration: environment validation and the host/origin
 * allow-lists used to defend the /mcp endpoint against DNS-rebinding.
 */

/** Variables without which the server cannot function correctly in production. */
export const REQUIRED_IN_PRODUCTION = [
  'MCP_REFRESH_TOKEN',
  'GITHUB_REPO_OWNER',
  'GITHUB_REPO_NAME',
] as const

/**
 * Fail fast in production when a critical variable is missing, rather than
 * booting a server that 401s every refresh or cannot reach GitHub. No-op
 * outside production so local dev and tests are unaffected.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !env[key]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`
    )
  }
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Origins explicitly allowed to drive the /mcp endpoint from a browser. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const configured = parseList(env.MCP_ALLOWED_ORIGINS)
  const fromEndpoint: string[] = []
  try {
    fromEndpoint.push(new URL(env.MCP_ENDPOINT_URL ?? 'https://mcp.arcoventure.studio/mcp').origin)
  } catch {
    /* ignore malformed endpoint URL */
  }
  return new Set([...configured, ...fromEndpoint])
}

/**
 * Host header values allowed for /mcp. Empty set means the Host check is
 * disabled (the default) — set MCP_ALLOWED_HOSTS to enable it.
 */
export function allowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(parseList(env.MCP_ALLOWED_HOSTS))
}

/** Localhost origins are always allowed so local dev clients keep working. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
