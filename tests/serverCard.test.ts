import { buildServerCard } from '../src/well-known/serverCard'

describe('buildServerCard', () => {
  const card = buildServerCard()

  test('has required name field', () => {
    expect(card.name).toBeDefined()
    expect(typeof card.name).toBe('string')
  })

  test('has required version field', () => {
    expect(card.version).toBeDefined()
  })

  test('has remotes with transport endpoint', () => {
    expect(card.remotes).toBeDefined()
    expect(card.remotes.length).toBeGreaterThan(0)
    expect(card.remotes[0].url).toBe('https://mcp.arcoventure.studio/mcp')
    expect(card.remotes[0].transportType).toBe('streamable-http')
  })

  test('has capabilities', () => {
    expect(card.capabilities).toBeDefined()
  })

  test('lists all seven tools (matching the server tool registry)', () => {
    const toolNames = card.tools.map((t: any) => t.name)
    expect(toolNames).toContain('lookup_term')
    expect(toolNames).toContain('get_related_terms')
    expect(toolNames).toContain('verify_alignment')
    expect(toolNames).toContain('cite_term')
    expect(toolNames).toContain('get_sources')
    expect(toolNames).toContain('list_terms')
    expect(toolNames).toContain('suggest_terms')
    expect(toolNames).toHaveLength(7)
  })

  test('supports a valid published MCP protocol version', () => {
    expect(card.supportedProtocolVersions).toContain('2025-03-26')
    expect(card.supportedProtocolVersions).not.toContain('2025-03-12')
  })

  test('all tools have inputSchema', () => {
    card.tools.forEach((tool: any) => {
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.required).toBeDefined()
    })
  })

  test('respects MCP_ENDPOINT_URL env variable', () => {
    process.env.MCP_ENDPOINT_URL = 'https://custom.example.com/mcp'
    const customCard = buildServerCard()
    expect(customCard.remotes[0].url).toBe('https://custom.example.com/mcp')
    delete process.env.MCP_ENDPOINT_URL
  })
})
