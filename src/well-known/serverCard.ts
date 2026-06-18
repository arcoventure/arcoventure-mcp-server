import { SERVER_VERSION } from '../version'
import { publicToolList } from '../tools/registry'

export function buildServerCard() {
  const transportUrl = process.env.MCP_ENDPOINT_URL ?? 'https://mcp.arcoventure.studio/mcp'

  return {
    '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json',
    'name': 'io.arcoventure/lexicon-mcp-server',
    'title': 'Arco Lexicon MCP Server',
    'description': 'Exposes the Arco Lexicon as structured, queryable tools for AI assistants. Canonical terminology for autonomous business design — used by Claude, Perplexity, and other MCP-compatible agents.',
    'version': SERVER_VERSION,
    'websiteUrl': 'https://arcoventure.studio/lexicon/query',
    'repository': {
      'url': 'https://github.com/arcoventure/arcoventure-mcp-server',
      'source': 'github',
    },
    'supportedProtocolVersions': ['2025-03-26', '2025-06-18'],
    'remotes': [
      {
        'transportType': 'streamable-http',
        'url': transportUrl,
      },
    ],
    'capabilities': {
      'tools': {},
    },
    // Derived from the single tool registry so the card never drifts from the
    // tools the server actually serves.
    'tools': publicToolList(),
  }
}
