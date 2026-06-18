/**
 * Tests for src/admin/refresh.ts — the admin auth boundary.
 *
 * Covers the security-sensitive paths: fail-closed when no token is configured,
 * rejection of wrong/short tokens, success on a valid Bearer token, and that a
 * reload failure returns a generic message (no internal detail leaked).
 *
 * loadCache is mocked so these tests never touch GitHub.
 */

import type { Request, Response } from 'express'

jest.mock('../../src/cache/termCache')

import { loadCache } from '../../src/cache/termCache'
import { handleAdminRefresh } from '../../src/admin/refresh'

const mockLoadCache = loadCache as jest.MockedFunction<typeof loadCache>

const ORIGINAL_TOKEN = process.env.MCP_REFRESH_TOKEN

interface MockRes {
  statusCode: number
  body: unknown
  status: jest.Mock
  json: jest.Mock
}

function mockReq(authHeader?: string): Request {
  return { headers: authHeader ? { authorization: authHeader } : {} } as Request
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status: jest.fn(),
    json: jest.fn(),
  }
  res.status.mockImplementation((code: number) => {
    res.statusCode = code
    return res
  })
  res.json.mockImplementation((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

/** Run the handler with the mock response cast to the Express Response shape. */
function run(req: Request, res: MockRes): Promise<void> {
  return handleAdminRefresh(req, res as unknown as Response)
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.MCP_REFRESH_TOKEN
  else process.env.MCP_REFRESH_TOKEN = ORIGINAL_TOKEN
})

describe('handleAdminRefresh — auth', () => {
  test('fails closed (401) when no token is configured', async () => {
    delete process.env.MCP_REFRESH_TOKEN
    const res = mockRes()
    await run(mockReq('Bearer anything'), res)
    expect(res.statusCode).toBe(401)
    expect(mockLoadCache).not.toHaveBeenCalled()
  })

  test('401 when the Authorization header is missing', async () => {
    process.env.MCP_REFRESH_TOKEN = 'correct-horse-battery-staple'
    const res = mockRes()
    await run(mockReq(), res)
    expect(res.statusCode).toBe(401)
    expect(mockLoadCache).not.toHaveBeenCalled()
  })

  test('401 on a wrong token of equal length', async () => {
    process.env.MCP_REFRESH_TOKEN = 'aaaaaaaaaaaa'
    const res = mockRes()
    await run(mockReq('Bearer bbbbbbbbbbbb'), res)
    expect(res.statusCode).toBe(401)
    expect(mockLoadCache).not.toHaveBeenCalled()
  })

  test('401 on a token of the wrong length (length pre-check)', async () => {
    process.env.MCP_REFRESH_TOKEN = 'correct-horse-battery-staple'
    const res = mockRes()
    await run(mockReq('Bearer short'), res)
    expect(res.statusCode).toBe(401)
    expect(mockLoadCache).not.toHaveBeenCalled()
  })

  test('200 and reload on a valid Bearer token', async () => {
    process.env.MCP_REFRESH_TOKEN = 'correct-horse-battery-staple'
    mockLoadCache.mockResolvedValue({ termsLoaded: 42, durationMs: 1234 })
    const res = mockRes()
    await run(mockReq('Bearer correct-horse-battery-staple'), res)
    expect(res.statusCode).toBe(200)
    expect(mockLoadCache).toHaveBeenCalledTimes(1)
    expect(res.body).toEqual({ status: 'ok', terms_loaded: 42, duration_ms: 1234 })
  })
})

describe('handleAdminRefresh — error handling', () => {
  test('500 with a generic message (no internal detail) when reload fails', async () => {
    process.env.MCP_REFRESH_TOKEN = 'correct-horse-battery-staple'
    mockLoadCache.mockRejectedValue(new Error('GitHub 503: secret-internal-detail'))
    const res = mockRes()
    await run(mockReq('Bearer correct-horse-battery-staple'), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Cache reload failed' })
    expect(JSON.stringify(res.body)).not.toContain('secret-internal-detail')
  })
})
