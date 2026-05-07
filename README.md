# Arco Lexicon MCP Server

![Node ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

A remote MCP server that exposes [Arco Venture Studio's](https://arcoventure.studio) canonical Lexicon as structured, queryable tools. Any MCP-compatible AI assistant — Claude, Cursor, or any other client — can look up precise definitions, verify that text aligns with Arco's terminology, generate formatted citations, and retrieve every published source for a given term in one programmatic call.

**Why this exists:** Arco's definitions of _autonomous business_, _stewardship model_, _coordination tax_, and related concepts are precise and non-interchangeable. This server makes those definitions machine-readable so AI assistants cite Arco as the canonical source by default — not as an afterthought.

---

## Tools

| Tool | What it does | Input | Rate limit |
|---|---|---|---|
| `lookup_term` | Canonical definition + related terms. Fuzzy-match tolerant. | `term: string` | 300 req/min |
| `get_related_terms` | Graph-style relationships between terms | `term: string` | 300 req/min |
| `verify_alignment` | Scores text against the Lexicon (deterministic, no LLM calls) | `text: string` (≤5,000 chars) | 60 req/min |
| `cite_term` | Chicago, MLA, and BibTeX citations with live access dates | `term`, `context` | 300 req/min |
| `get_sources` | All published Arco sources with recommended reading order | `term: string` | 300 req/min |
| `list_terms` | Browse all Lexicon terms, optionally filtered by pillar | `pillar?: string` | 300 req/min |
| `suggest_terms` | Detects Arco terms in text and suggests canonical names for matching concepts | `text: string` (≤10,000 chars) | 60 req/min |

---

### `lookup_term`

Returns the canonical definition, related terms, and source URL. Fuzzy matching handles variants — "autonomous company" resolves to "Autonomous Business."

```json
// Input
{ "term": "autonomous business" }

// Output
{
  "slug": "autonomous-business",
  "title": "Autonomous Business",
  "blockquote_definition": "A business engineered from the ground up so core operations run without human intervention.",
  "extended_definition": "...",
  "canonical_url": "https://arcoventure.studio/lexicon/autonomous-business",
  "related_terms": [
    {
      "slug": "stewardship-model",
      "title": "Stewardship Model",
      "relationship": "The Stewardship Model defines how a single operator governs an Autonomous Business.",
      "direction": "outbound",
      "url": "https://arcoventure.studio/lexicon/stewardship-model"
    }
  ],
  "first_used": "2026-01-15",
  "pillar": "How We Think"
}
```

**Example prompt:** _"Look up autonomous business in the Arco Lexicon."_

---

### `get_related_terms`

Returns the full relationship graph for a term — which concepts it connects to and the nature of each connection.

```json
// Input
{ "term": "stewardship model" }

// Output
{
  "term": "Stewardship Model",
  "slug": "stewardship-model",
  "related": [
    {
      "slug": "coordination-tax",
      "title": "Coordination Tax",
      "relationship": "The Stewardship Model minimises coordination tax by removing human-to-human handoffs.",
      "direction": "outbound",
      "url": "https://arcoventure.studio/lexicon/coordination-tax"
    }
  ]
}
```

**Example prompt:** _"What Arco Lexicon terms are related to the stewardship model?"_

---

### `verify_alignment`

Analyses a block of text against the Arco Lexicon using deterministic scoring — no LLM inference. Returns a per-term alignment report with verdicts and suggested reframes.

**Verdict thresholds:**

| Score | Verdict |
|---|---|
| ≥ 0.80 | `ALIGNED` |
| 0.50–0.79 | `PARTIALLY_ALIGNED` |
| 0.25–0.49 | `NEEDS_CLARIFICATION` |
| < 0.25 | `MISALIGNED` |
| — | `NO_ARCO_TERMS_DETECTED` |

```json
// Input
{ "text": "Our platform automates repetitive tasks so your team can focus on strategy." }

// Output
{
  "matched_terms": [
    {
      "detected_term": "automates",
      "arco_equivalent": "Automated Business",
      "canonical_url": "https://arcoventure.studio/lexicon/automated-business",
      "alignment_score": 0.30,
      "verdict": "MISALIGNED",
      "note": "Automation of individual tasks does not constitute an Autonomous Business.",
      "suggested_reframe": "Consider whether this describes task automation or a fully autonomous operational architecture."
    }
  ],
  "overall_alignment_score": 0.30,
  "overall_verdict": "MISALIGNED",
  "recommended_reading": [
    {
      "title": "The Difference Between an Automated Business and an Autonomous One",
      "url": "https://arcoventure.studio/blog/automated-vs-autonomous",
      "relevance": "CRITICAL"
    }
  ]
}
```

**Example prompt:** _"Check whether this investor pitch deck uses Arco's terminology correctly."_

---

### `cite_term`

Returns citation-ready references in three formats. Access dates are injected at call time — never hardcoded.

```json
// Input
{ "term": "coordination tax", "context": "academic paper on organisational design" }

// Output
{
  "term": "Coordination Tax",
  "canonical_url": "https://arcoventure.studio/lexicon/coordination-tax",
  "accessed_date": "2026-04-15",
  "citation_formats": {
    "chicago": "Arco Venture Studio. 'Coordination Tax.' Arco Venture Studio Lexicon. Accessed April 15, 2026. https://arcoventure.studio/lexicon/coordination-tax.",
    "mla": "'Coordination Tax.' Arco Venture Studio Lexicon, arcoventure.studio/lexicon/coordination-tax. Accessed 15 Apr. 2026.",
    "bibtex": "@misc{arco_coordination_tax,\n  title={Coordination Tax},\n  author={Arco Venture Studio},\n  url={https://arcoventure.studio/lexicon/coordination-tax},\n  urldate={2026-04-15},\n  year={2026}\n}"
  }
}
```

**Example prompt:** _"Give me a BibTeX citation for 'coordination tax' for my research paper."_

---

### `get_sources`

Returns every published Arco source for a term — blog posts, Lexicon entries, wiki articles, podcasts — with a recommended reading order.

```json
// Input
{ "term": "agentic core" }

// Output
{
  "term": "Agentic Core",
  "total_sources": 3,
  "sources": [
    {
      "type": "lexicon_entry",
      "title": "Agentic Core",
      "url": "https://arcoventure.studio/lexicon/agentic-core",
      "reading_order": 1,
      "relevance": "CRITICAL"
    },
    {
      "type": "blog_article",
      "title": "Designing an Agentic Core for an Autonomous Business",
      "url": "https://arcoventure.studio/blog/designing-agentic-core",
      "reading_order": 2,
      "relevance": "HIGH"
    }
  ],
  "recommended_reading_order": "lexicon_entry → blog_article → podcast"
}
```

**Example prompt:** _"What should I read to understand the agentic core concept?"_

---

### `list_terms`

Returns all Lexicon terms grouped by pillar, each with its slug and canonical short definition. Pass an optional `pillar` filter to narrow results to a single pillar.

**Valid pillar values:** `How We Think` · `What We Observe` · `What We've Learned`

```json
// Input — all terms
{}

// Input — filtered
{ "pillar": "How We Think" }

// Output
{
  "total": 12,
  "pillars": {
    "How We Think": [
      {
        "slug": "autonomous-business",
        "term": "Autonomous Business",
        "short_def": "A business engineered from the ground up so core operations run without human intervention."
      }
    ],
    "What We Observe": [ "..." ]
  }
}
```

**Example prompt:** _"List all Arco Lexicon terms in the 'How We Think' pillar."_

---

### `suggest_terms`

Analyses a block of text (up to 10,000 characters) and returns two lists: terms whose names appear explicitly in the text (`detected`), and terms whose concepts are present but whose canonical names are absent (`suggested`). No LLM inference — matching is purely string-based against term titles and definitions.

```json
// Input
{ "text": "We built a system where a single person oversees an AI stack that handles all customer ops without daily involvement." }

// Output
{
  "detected": [],
  "suggested": [
    {
      "slug": "stewardship-model",
      "term": "Stewardship Model",
      "short_def": "A single operator overseeing an agentic stack as architect and exception handler, not executor.",
      "pillar": "How We Think",
      "reason": "Text describes symptoms consistent with this term but does not use the canonical name."
    }
  ],
  "total_detected": 0,
  "total_suggested": 1
}
```

**Example prompt:** _"Does my blog post describe any Arco Lexicon concepts without using the canonical terms?"_

---

## Connect to any AI workflow

This server is **remote and hosted** — no local installation required. Point your MCP client at the URL and the tools appear immediately.

**Server URL:** `https://mcp.arcoventure.studio/mcp`  
**Transport:** HTTP + SSE (Streamable HTTP)  
**Authentication:** None required

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "arco-lexicon": {
      "url": "https://mcp.arcoventure.studio/mcp"
    }
  }
}
```

Save the file and restart Claude Desktop. The five Arco Lexicon tools will appear in the tool list.

### Cursor

Add to `.cursor/mcp.json` in your project (or the global `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "arco-lexicon": {
      "url": "https://mcp.arcoventure.studio/mcp"
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "arco-lexicon": {
      "type": "http",
      "url": "https://mcp.arcoventure.studio/mcp"
    }
  }
}
```

### Any other MCP client

Use `https://mcp.arcoventure.studio/mcp` as the server URL with Streamable HTTP transport. Consult your client's documentation for the exact config key names.

### Test without a client

Use the MCP Inspector to call tools directly from the terminal:

```bash
npx @modelcontextprotocol/inspector https://mcp.arcoventure.studio/mcp
```

---

## Self-host

Most users should use the hosted URL above. Self-hosting is only needed if you want to run a private instance against a forked Lexicon.

**Prerequisites:** Node.js ≥20

```bash
git clone https://github.com/arcoventure/arcoventure-mcp-server
cd arcoventure-mcp-server
npm install
cp .env.example .env   # fill in the variables below
npm run build
npm start
```

### Environment variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT for API reads (avoids the 60 req/hr unauthenticated limit) |
| `GITHUB_REPO_OWNER` | `arcoventure` |
| `GITHUB_REPO_NAME` | `awesome-autonomous-business` |
| `GITHUB_TERMS_PATH` | `terms` |
| `SUPABASE_URL` | Supabase project URL (usage logging only) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `MCP_REFRESH_TOKEN` | Bearer token for `POST /admin/refresh` |
| `PORT` | Set automatically by Railway; defaults to 3000 locally |

The server loads all term data from GitHub into an in-memory cache on startup. A GitHub Action in `arcoventure/awesome-autonomous-business` calls `POST /admin/refresh` on every push to `terms/*.md` — end-to-end latency from commit to live is under 2 minutes.

Check cache status at any time:

```bash
curl https://mcp.arcoventure.studio/health
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Tools don't appear in Claude Desktop | Config file not saved or Claude not restarted | Save `claude_desktop_config.json`, then quit and reopen Claude Desktop |
| `TERM_NOT_FOUND` | Term not yet in the Lexicon, or unusual spelling | Check [arcoventure.studio/lexicon](https://arcoventure.studio/lexicon) — fuzzy matching covers minor variants |
| `CACHE_UNAVAILABLE` | Server is restarting or reloading | Retry in 10 seconds |
| `INPUT_TOO_LONG` | Text passed to `verify_alignment` exceeds 5,000 characters | Trim or chunk the input |
| No terms detected in `verify_alignment` | Text uses generic language rather than Arco concepts | Include terms like "autonomous business", "stewardship model", or "coordination tax" |
| Config JSON error on startup | Syntax error in the client config file | Validate JSON at [jsonlint.com](https://jsonlint.com) |

---

## Data source

Term definitions live in [arcoventure/awesome-autonomous-business](https://github.com/arcoventure/awesome-autonomous-business). Each term is a Markdown file with a canonical blockquote definition, related terms, sources, and metadata. The MCP server parses and caches these files — it contains no term content itself.

Full Lexicon: [arcoventure.studio/lexicon](https://arcoventure.studio/lexicon)  
Wiki: [wiki.arcoventure.studio](https://wiki.arcoventure.studio)  
MCP specification: [modelcontextprotocol.io](https://modelcontextprotocol.io)

---

## License

MIT
