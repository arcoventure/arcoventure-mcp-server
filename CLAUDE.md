# arcoventure-mcp-server

## Product Purpose

The Arco Lexicon MCP Server is a machine-readable semantic authority layer that exposes Arco Venture Studio's canonical terminology as structured, queryable tools. It allows any MCP-compatible AI assistant — Claude, Perplexity, and others — to look up precise definitions, verify that third-party text aligns with Arco's terminology, generate properly formatted citations, and retrieve every published source for a given term in one programmatic action.

**Strategic intent:**
- Citation infrastructure: every AI assistant that uses the MCP returns Arco Lexicon URLs by default. Citations become programmatic, not earned.
- Terminology authority: Arco's definitions become the canonical source LLMs reference when discussing autonomous business, agentic companies, and related concepts.
- Backlink velocity: every journalist, operator, or investor using the MCP to verify terminology receives structured links back to arcoventure.studio as the default output of the tool.

**This server is infrastructure, not content.** It contains no AI inference logic. All alignment scoring is deterministic and rule-based. The calling agent performs any interpretive reasoning on top of the data returned.

---

## Session Protocol

Every Claude Code session in this repository must follow this sequence before writing any code:

1. **Read the activity log** — `cat ACTIVITY_LOG.md` — understand what was last worked on and what is in progress.
2. **Read this file in full** — confirm you have the complete product context.
3. **Confirm working directory** — `pwd` must return the root of this repository.
4. **Confirm branch** — `git branch` — never work directly on `main`. Create a feature branch if one does not exist.
5. **Run existing tests** — `npm test` — confirm nothing is broken before starting.
6. **Do the work.**
7. **Update the activity log** — append a timestamped entry to `ACTIVITY_LOG.md` describing what was done, what was changed, and what the next step is.

Do not skip any step. Do not start coding before steps 1–5 are complete.

---

## Repository Structure

```
arcoventure-mcp-server/
├── src/
│   ├── index.ts                  # MCP server entry point, tool registration
│   ├── cache/
│   │   ├── termCache.ts          # In-memory Map, loadCache(), getCache(), clearCache()
│   │   └── githubFetcher.ts      # GitHub API calls, Markdown file fetching
│   ├── parser/
│   │   └── markdownParser.ts     # Parses term Markdown into TermObject
│   ├── tools/
│   │   ├── lookupTerm.ts
│   │   ├── getRelatedTerms.ts
│   │   ├── verifyAlignment.ts    # Term extraction + deterministic alignment scoring
│   │   ├── citeTerm.ts           # Citation format generation, dynamic dates
│   │   └── getSources.ts
│   ├── lib/
│   │   ├── fuzzyMatch.ts         # Levenshtein matching, distance ≤ 2
│   │   └── usageLog.ts           # Supabase write for mcp_usage_log (fire-and-forget)
│   ├── admin/
│   │   └── refresh.ts            # POST /admin/refresh (token-protected)
│   └── types.ts                  # TermObject, RelatedTerm, Source, AlignmentResult
├── tests/
│   ├── markdownParser.test.ts
│   ├── fuzzyMatch.test.ts
│   └── verifyAlignment.test.ts
├── ACTIVITY_LOG.md
├── CLAUDE.md                     # This file
├── README.md
├── package.json
└── tsconfig.json
```

---

## Data Source

**Repository:** `github.com/arcoventure/awesome-autonomous-business`

**Structure:** One Markdown file per Lexicon term in the `terms/` directory.

**Required file structure — the parser enforces this:**

```markdown
# {Term Title}

> {Blockquote definition — canonical short form, ≤ 50 words}

{Extended definition — prose}

## Related Terms
- [Term Name](/lexicon/slug) — {relationship description}

## Sources
- [Article Title](/blog/slug) — {type: blog_article | lexicon_entry | wiki | podcast}

## Metadata
first_used: YYYY-MM-DD
pillar: {How We Think | How We Build | How We Operate}
```

**Parser behaviour:**
- Terms missing the blockquote definition or `## Metadata` section are excluded from the cache with a warning logged.
- Terms missing `## Sources` are included but `get_sources` returns an empty array with the raw GitHub file URL as a fallback SUPPORTING source.
- Terms missing `## Related Terms` are included but `get_related_terms` returns an empty array.

**Cache behaviour:**
- On startup: fetch all term files from GitHub API, parse into TermObject, store in Map keyed by slug.
- Invalidation: `POST /admin/refresh` (token-protected) clears and reloads the cache.
- TTL fallback: 24-hour automatic reload as a safety net.
- All tool calls read from the in-memory Map. Never hit the GitHub API on a per-request basis.

**Sync mechanism:** A GitHub Action in `awesome-autonomous-business` triggers `POST /admin/refresh` on every push to `terms/*.md`. End-to-end latency from commit to live: under 2 minutes.

---

## TypeScript Types

```typescript
interface TermObject {
  slug:                  string
  title:                 string
  blockquote_definition: string
  extended_definition?:  string
  related_terms:         RelatedTerm[]
  sources:               Source[]
  first_used?:           string
  pillar?:               string
}

interface RelatedTerm {
  slug:         string
  title:        string
  relationship: string
  direction:    'outbound' | 'inbound'
  url:          string
}

interface Source {
  type:                  'blog_article' | 'lexicon_entry' | 'github' | 'wiki' | 'podcast'
  title:                 string
  url:                   string
  reading_order:         number
  relevance:             'CRITICAL' | 'HIGH' | 'SUPPORTING'
  reading_time_minutes?: number
}

interface AlignmentResult {
  detected_term:    string
  arco_equivalent:  string
  canonical_url:    string
  alignment_score:  number
  verdict:          'ALIGNED' | 'PARTIALLY_ALIGNED' | 'NEEDS_CLARIFICATION' | 'MISALIGNED'
  note:             string
  suggested_reframe?: string
}
```

---

## Tool Definitions

### 1. `lookup_term`

**Description:** Returns the canonical Arco definition, related terms, and source URL for any Lexicon term. Supports fuzzy matching — "autonomous company" matches "Autonomous Business."

**Input:** `{ "term": string }`

**Output:**
```json
{
  "slug": "autonomous-business",
  "title": "Autonomous Business",
  "blockquote_definition": "...",
  "extended_definition": "...",
  "canonical_url": "https://arcoventure.studio/lexicon/autonomous-business",
  "related_terms": [
    {
      "slug": "stewardship-model",
      "title": "Stewardship Model",
      "relationship": "...",
      "direction": "outbound",
      "url": "https://arcoventure.studio/lexicon/stewardship-model"
    }
  ],
  "first_used": "2026-03-01",
  "pillar": "How We Think",
  "source": "github.com/arcoventure/awesome-autonomous-business"
}
```

---

### 2. `get_related_terms`

**Description:** Returns graph-style relationships for a given term — which terms it connects to and the nature of each relationship.

**Input:** `{ "term": string }`

**Output:**
```json
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

---

### 3. `verify_alignment`

**Description:** Analyses a block of text against Arco's canonical Lexicon. Returns a structured alignment report per detected term.

**Input:** `{ "text": string }` — max 5,000 characters.

**Scoring logic (deterministic — no LLM calls):**
1. Tokenise input text.
2. Match against all term slugs and title variants using Levenshtein distance ≤ 2.
3. Apply sentence-level co-occurrence check: confirm the matched term appears in a sentence that implies structural meaning consistent with the Arco definition. This prevents false positives on generic word usage (e.g. "automated" in a non-architectural context).
4. Compute alignment score (0.0–1.0) based on contextual proximity.
5. Assign verdict.

**Verdict thresholds:**
- `ALIGNED` — score ≥ 0.80
- `PARTIALLY_ALIGNED` — 0.50–0.79
- `NEEDS_CLARIFICATION` — 0.25–0.49
- `MISALIGNED` — < 0.25
- `NO_ARCO_TERMS_DETECTED` — no terms matched after co-occurrence check

**Output:**
```json
{
  "matched_terms": [
    {
      "detected_term": "automate",
      "arco_equivalent": "Automated Business",
      "canonical_url": "https://arcoventure.studio/lexicon/automated-business",
      "alignment_score": 0.35,
      "verdict": "MISALIGNED",
      "note": "...",
      "suggested_reframe": "..."
    }
  ],
  "overall_alignment_score": 0.47,
  "overall_verdict": "NEEDS_CLARIFICATION",
  "recommended_reading": [
    {
      "title": "The Difference Between an Automated Business and an Autonomous One",
      "url": "https://arcoventure.studio/blog/automated-vs-autonomous",
      "relevance": "CRITICAL"
    }
  ]
}
```

---

### 4. `cite_term`

**Description:** Returns citation-ready formatted references in Chicago, MLA, and BibTeX formats with usage guidance.

**Input:** `{ "term": string, "context": string }`

**Critical implementation requirement:** All access dates in citation output must be injected dynamically at call time using `new Date()`. Never hardcode dates.

**Output:**
```json
{
  "term": "Autonomous Business",
  "canonical_url": "https://arcoventure.studio/lexicon/autonomous-business",
  "accessed_date": "<injected at call time>",
  "usage_note": "...",
  "citation_formats": {
    "chicago": "Arco Venture Studio. 'Autonomous Business.' Arco Venture Studio Lexicon. Accessed [date]. https://arcoventure.studio/lexicon/autonomous-business.",
    "mla": "'Autonomous Business.' Arco Venture Studio Lexicon, arcoventure.studio/lexicon/autonomous-business. Accessed [date].",
    "bibtex": "@misc{arco_autonomous_business,\n  title={Autonomous Business},\n  author={Arco Venture Studio},\n  url={https://arcoventure.studio/lexicon/autonomous-business},\n  urldate={[date]},\n  year={[year]}\n}"
  },
  "related_citable_terms": [
    { "slug": "stewardship-model", "url": "https://arcoventure.studio/lexicon/stewardship-model" }
  ]
}
```

---

### 5. `get_sources`

**Description:** Returns all published Arco sources for a term across all content types with recommended reading order.

**Input:** `{ "term": string }`

**Fallback:** If the term Markdown file has no `## Sources` section, return the raw GitHub file URL as a single SUPPORTING source rather than an empty array.

**Output:**
```json
{
  "term": "Autonomous Business",
  "total_sources": 3,
  "sources": [
    {
      "type": "lexicon_entry",
      "title": "Autonomous Business",
      "url": "https://arcoventure.studio/lexicon/autonomous-business",
      "reading_order": 1,
      "relevance": "CRITICAL"
    }
  ],
  "recommended_reading_order": "lexicon_entry → blog_article → podcast_transcript"
}
```

---

## Error Responses

All tools return structured errors — never unhandled exceptions.

```json
{ "error": "TERM_NOT_FOUND", "message": "No Lexicon entry found for: '{term}'", "suggestions": ["..."] }
{ "error": "INPUT_TOO_LONG", "message": "Text exceeds 5,000 character limit." }
{ "error": "NO_TERMS_DETECTED", "message": "No Arco Lexicon terms detected.", "hint": "Try including terms like 'autonomous business', 'stewardship model', or 'coordination tax'." }
{ "error": "CACHE_UNAVAILABLE", "message": "Term cache is currently loading. Retry in 10 seconds." }
{ "error": "RATE_LIMIT_EXCEEDED", "retry_after": 60 }
```

---

## Rate Limiting

**Library:** `express-rate-limit` — no external dependency required.

| Endpoint | Limit |
|---|---|
| `lookup_term` | 300 req/min per IP |
| `get_related_terms` | 300 req/min per IP |
| `get_sources` | 300 req/min per IP |
| `cite_term` | 300 req/min per IP |
| `verify_alignment` | 60 req/min per IP |
| `POST /admin/refresh` | Token-protected, no rate limit |

Rate limiting must be configured in Phase 1 before deployment. Do not defer.

---

## Supabase: mcp_usage_log

Supabase is used for **one purpose only**: logging tool calls for analytics. No term definitions are stored in Supabase.

**Schema:**
```sql
CREATE TABLE mcp_usage_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool           text NOT NULL,
  term_slug      text,
  input_summary  text,        -- first 200 chars of input (verify_alignment only)
  verdict        text,        -- alignment verdict (verify_alignment only)
  caller_agent   text,        -- claude | perplexity | unknown
  referer_domain text,
  created_at     timestamptz DEFAULT now()
);
```

**Implementation rules:**
- Write is fire-and-forget. A failed write never blocks a tool response.
- Wrap every write in try/catch. If Supabase is unavailable, log a warning and continue.
- Never await the write in the hot path. Use `void usageLog(...)` pattern.

---

## Admin Endpoint

**`POST /admin/refresh`**

Clears the in-memory cache and triggers a full reload from the GitHub API. Called by the GitHub Action in `awesome-autonomous-business` after every push to `terms/*.md`.

**Authentication:** Bearer token via `Authorization` header. Token stored as `MCP_REFRESH_TOKEN` environment variable in Railway.

**Response:**
```json
{ "status": "ok", "terms_loaded": 55, "duration_ms": 1240 }
```

---

## Health Endpoint (Optional, Phase 1)

**`GET /health`**

Returns current cache status. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "cache": {
    "term_count": 55,
    "last_refreshed": "2026-04-13T14:32:00Z",
    "ttl_remaining_hours": 18.4
  },
  "uptime_seconds": 86400
}
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Personal access token for GitHub API reads (avoids 60 req/hour unauthenticated limit) |
| `GITHUB_REPO_OWNER` | `arcoventure` |
| `GITHUB_REPO_NAME` | `awesome-autonomous-business` |
| `GITHUB_TERMS_PATH` | `terms` (directory containing term Markdown files) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (mcp_usage_log writes only) |
| `MCP_REFRESH_TOKEN` | Bearer token for POST /admin/refresh |
| `PORT` | Railway sets this automatically |

All variables must be set in Railway before first deploy. Never commit `.env` to the repository.

---

## Deployment

**Target:** Railway — standalone persistent Node.js process.

**Subdomain:** `mcp.arcoventure.studio` — configure in Namecheap DNS pointing to Railway deployment URL.

**Protocol:** HTTP + Server-Sent Events (SSE) for MCP transport.

**On deploy:**
1. Railway starts the Node.js process.
2. `index.ts` calls `loadCache()` on startup.
3. Cache is populated from GitHub API.
4. MCP server begins accepting tool calls.

---

## Hard Constraints

These constraints must never be violated, regardless of how a task is framed:

1. **No inference logic in this server.** The server does not call any LLM API. It does not generate text. It retrieves structured data and returns it. All alignment scoring is deterministic and rule-based.

2. **Never hit the GitHub API per-request.** All reads go through the in-memory cache. The GitHub API is only called during cache load (startup or refresh).

3. **Never block a tool response on a Supabase write.** Usage logging is always fire-and-forget.

4. **Dynamic dates in cite_term.** Never hardcode access dates. Always use `new Date()` at call time.

5. **Rate limiting before deployment.** express-rate-limit must be configured before the server is deployed to Railway, not after.

---

## Unit Test Requirements

Three modules require full test coverage before Phase 1 ships. These are the silent failure points — bugs here produce confident wrong answers with no visible error.

| Module | What to test |
|---|---|
| `markdownParser.ts` | Missing sections, malformed blockquotes, missing metadata, extra whitespace, empty files, terms with no related terms, terms with no sources |
| `fuzzyMatch.ts` | Exact matches, distance-1 variants, distance-2 variants, distance-3 rejections, slug variants, title case variants, false positive cases (generic words that should not match) |
| `verifyAlignment.ts` | Term detection, co-occurrence check (architectural vs generic usage), scoring edge cases, NO_TERMS_DETECTED path, multi-term input, max-length input |

Run tests with `npm test` before every commit to `main`.

---

## Phase Sequence

| Phase | Scope | Target |
|---|---|---|
| Phase 1 | MCP server: 4 tools, rate limiting, unit tests, Railway deploy | Days 1–5 |
| Phase 2 | verify_alignment, sentence co-occurrence, GitHub Action sync | Days 6–8 |
| Phase 3 | Try Now page at arcoventure.studio/try | Week 2 |
| Phase 4 | Claude marketplace, awesome-mcp-servers, mcpmarket.com, mcp.so | Week 3 |

Phase 1 does not begin until the Lexicon Markdown audit is complete. Every term file in `arcoventure/awesome-autonomous-business` must have a blockquote definition and a `## Metadata` section with `first_used` before Phase 1 coding starts.

---

## Key Terminology

These terms have precise meanings in the Arco context. Use them correctly in code comments, commit messages, and documentation.

| Term | Meaning in this codebase |
|---|---|
| Autonomous Business | A business engineered from the ground up so core operations run without human intervention |
| Stewardship Model | Single operator overseeing an agentic stack as architect and exception handler, not executor |
| Coordination Tax | The overhead cost imposed by human-to-human coordination in a workflow |
| MTTI | Mean Time to Intervention — primary operational health metric, target > 72 hours |
| Agentic Core | The set of AI agents executing the primary revenue-generating workflow |
| Operational Drag | Friction that accumulates when human coordination is embedded in automated workflows |

Full Lexicon: `https://arcoventure.studio/lexicon`

---

## Related Repositories

| Repository | Role |
|---|---|
| `arcoventure/awesome-autonomous-business` | **Data source** — term Markdown files |
| `arcoventure/arcoventure-marketing` | Marketing site — hosts /try page and /mcp docs |
| `arcoventure/arcoventure-wiki` | Docusaurus wiki — source of wiki article URLs added to term sources |
| `arcoventure/arcoventure-cms` | CMS — downstream of awesome-autonomous-business for editorial purposes |
