/**
 * Tests for src/config.ts — production env validation and the host/origin
 * allow-lists used by the DNS-rebinding guard.
 */

import { validateEnv, allowedOrigins, allowedHosts, isLocalOrigin } from '../src/config'

describe('validateEnv', () => {
  test('is a no-op outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow()
    expect(() => validateEnv({} as NodeJS.ProcessEnv)).not.toThrow()
  })

  test('throws in production when required vars are missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /Missing required environment variables/
    )
  })

  test('names every missing variable', () => {
    try {
      validateEnv({ NODE_ENV: 'production', MCP_REFRESH_TOKEN: 'x' } as NodeJS.ProcessEnv)
      throw new Error('expected validateEnv to throw')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('GITHUB_REPO_OWNER')
      expect(message).toContain('GITHUB_REPO_NAME')
      expect(message).not.toContain('MCP_REFRESH_TOKEN')
    }
  })

  test('passes in production when all required vars are present', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        MCP_REFRESH_TOKEN: 'token',
        GITHUB_REPO_OWNER: 'arcoventure',
        GITHUB_REPO_NAME: 'awesome-autonomous-business',
      } as NodeJS.ProcessEnv)
    ).not.toThrow()
  })
})

describe('origin / host allow-lists', () => {
  test('allowedOrigins derives the origin from MCP_ENDPOINT_URL', () => {
    const origins = allowedOrigins({
      MCP_ENDPOINT_URL: 'https://mcp.arcoventure.studio/mcp',
    } as NodeJS.ProcessEnv)
    expect(origins.has('https://mcp.arcoventure.studio')).toBe(true)
  })

  test('allowedOrigins includes explicitly configured origins', () => {
    const origins = allowedOrigins({
      MCP_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
    } as NodeJS.ProcessEnv)
    expect(origins.has('https://a.example')).toBe(true)
    expect(origins.has('https://b.example')).toBe(true)
  })

  test('allowedHosts is empty (host check disabled) unless configured', () => {
    expect(allowedHosts({} as NodeJS.ProcessEnv).size).toBe(0)
    expect(allowedHosts({ MCP_ALLOWED_HOSTS: 'mcp.arcoventure.studio' } as NodeJS.ProcessEnv).has('mcp.arcoventure.studio')).toBe(true)
  })

  test('isLocalOrigin accepts localhost variants and rejects others', () => {
    expect(isLocalOrigin('http://localhost:3000')).toBe(true)
    expect(isLocalOrigin('http://127.0.0.1')).toBe(true)
    expect(isLocalOrigin('https://evil.example')).toBe(false)
    expect(isLocalOrigin('garbage')).toBe(false)
  })
})
