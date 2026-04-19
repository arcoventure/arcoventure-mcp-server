export function buildServerCard() {
  const transportUrl = process.env.MCP_ENDPOINT_URL ?? 'https://mcp.arcoventure.studio/mcp'

  return {
    '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json',
    'name': 'io.arcoventure/lexicon-mcp-server',
    'title': 'Arco Lexicon MCP Server',
    'description': 'Exposes the Arco Lexicon as structured, queryable tools for AI assistants. Canonical terminology for autonomous business design — used by Claude, Perplexity, and other MCP-compatible agents.',
    'version': '1.0.0',
    'websiteUrl': 'https://arcoventure.studio/lexicon/query',
    'repository': {
      'url': 'https://github.com/arcoventure/arcoventure-mcp-server',
      'source': 'github',
    },
    'supportedProtocolVersions': ['2025-03-12', '2025-06-18'],
    'remotes': [
      {
        'transportType': 'streamable-http',
        'url': transportUrl,
      },
    ],
    'capabilities': {
      'tools': {},
    },
    'tools': [
      {
        'name': 'lookup_term',
        'description': 'Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching.',
        'inputSchema': {
          'type': 'object',
          'properties': {
            'term': { 'type': 'string', 'description': 'Term name or slug to look up' },
          },
          'required': ['term'],
        },
      },
      {
        'name': 'get_related_terms',
        'description': 'Returns graph-style relationships for a given term — which terms it connects to and the nature of each relationship.',
        'inputSchema': {
          'type': 'object',
          'properties': {
            'term': { 'type': 'string', 'description': 'Term name or slug' },
          },
          'required': ['term'],
        },
      },
      {
        'name': 'verify_alignment',
        'description': 'Analyses a block of text against the Arco Lexicon and returns a structured alignment report per detected term — verdict, explanation, and recommended reading.',
        'inputSchema': {
          'type': 'object',
          'properties': {
            'text': { 'type': 'string', 'description': 'Text to verify against Arco terminology (max 5,000 characters)' },
          },
          'required': ['text'],
        },
      },
      {
        'name': 'cite_term',
        'description': 'Returns citation-ready formatted references for a Lexicon term in Chicago, MLA, and BibTeX formats with usage guidance.',
        'inputSchema': {
          'type': 'object',
          'properties': {
            'term': { 'type': 'string', 'description': 'Term name or slug to cite' },
            'context': { 'type': 'string', 'description': 'Brief description of how the term is being used' },
          },
          'required': ['term', 'context'],
        },
      },
      {
        'name': 'get_sources',
        'description': 'Returns all published Arco sources for a term across all content types with recommended reading order.',
        'inputSchema': {
          'type': 'object',
          'properties': {
            'term': { 'type': 'string', 'description': 'Term name or slug' },
          },
          'required': ['term'],
        },
      },
    ],
  }
}
