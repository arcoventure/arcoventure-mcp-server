# Activity Log — arcoventure-mcp-server

---

## 2026-04-13

**Session:** Initialisation
**Branch:** main

### Done
- Repository created ...
- CLAUDE.md committed and pushed ...

### Blockers
- Lexicon Markdown audit not yet complete ...

### Next Step
- Complete Lexicon audit ...

---

## 2026-04-13

**Session:** Pre-build audit
**Branch:** main

### Done
- Lexicon audit complete — all 54 term files pass parser requirements
- Metadata migrated to Option B format (**First used:** / **Pillar:**)
- CLAUDE.md updated to reflect new file structure and parser spec
- Phase 1 coding unblocked

### Blockers
- None

### Next Step
- Phase 1 scaffold — package.json, TypeScript setup, cache, parser, tools

---

## 2026-04-13

**Session:** Phase 1 — Scaffold
**Branch:** claude/friendly-yalow

### Done
- Created `package.json` — dependencies: `@modelcontextprotocol/sdk`, `express`, `express-rate-limit`, `@supabase/supabase-js`, `node-fetch`; devDependencies: `jest`, `ts-jest`, `typescript`, `ts-node`
- Created `tsconfig.json` — target ES2020, commonjs, strict mode
- Created `src/types.ts` — `TermObject`, `RelatedTerm`, `Source`, `AlignmentResult` interfaces
- Created `src/cache/githubFetcher.ts` — `fetchTermFileList()`, `fetchTermFileContent()` stubs
- Created `src/cache/termCache.ts` — `loadCache()`, `getCache()`, `getCachedTerm()`, `clearCache()`, `getLastRefreshed()`, `isCacheStale()` stubs
- Created `src/parser/markdownParser.ts` — `parseTermMarkdown()` stub with `ParseResult` type
- Created `src/lib/fuzzyMatch.ts` — `levenshtein()`, `normalise()`, `fuzzyFindTerm()` stubs
- Created `src/lib/usageLog.ts` — `usageLog()` fire-and-forget stub
- Created `src/tools/lookupTerm.ts`, `getRelatedTerms.ts`, `verifyAlignment.ts`, `citeTerm.ts`, `getSources.ts` — all stubs with correct I/O types
- Created `src/admin/refresh.ts` — `handleAdminRefresh()` stub
- Created `src/index.ts` — MCP server, tool registration, rate limiters (configured pre-deploy), Express admin + health routes, startup sequence
- Created `tests/markdownParser.test.ts`, `tests/fuzzyMatch.test.ts`, `tests/verifyAlignment.test.ts` — full coverage matrices per CLAUDE.md
- Ran `npm install` — 436 packages, 0 vulnerabilities

### Blockers
- None — all stubs throw `Error('Not implemented')`; tests will fail until implementations land

### Next Step
- Implement `src/parser/markdownParser.ts` — this unblocks cache load and all tool logic

---

## 2026-04-13

**Session:** Phase 1 — Full implementation
**Branch:** claude/friendly-yalow

### Done
- Implemented `markdownParser.ts` — 22 tests passing
- Implemented `fuzzyMatch.ts` — 26 tests passing; short-input guard (≤4 chars) blocks false positives on generic words
- Implemented `githubFetcher.ts` — GitHub API list + content fetch with Bearer token support
- Implemented `termCache.ts` — `loadCache()` with `isCacheLoading` flag; tools return CACHE_UNAVAILABLE only during active load window
- Implemented `usageLog.ts` — fire-and-forget Supabase write; silent no-op when env vars absent in dev
- Implemented all 5 tools: `lookupTerm`, `getRelatedTerms`, `getSources`, `citeTerm`, `verifyAlignment`
  - `citeTerm` injects access dates via `new Date()` at call time — never hardcoded
  - `getSources` fallback: GitHub raw file URL returned as SUPPORTING source when no sources parsed
  - `verifyAlignment` Phase 1: n-gram detection + STRONG_CONTEXT word scoring; Phase 2 refines co-occurrence
- Implemented `admin/refresh.ts` — Bearer token auth, clearCache + loadCache, structured error response
- All 61 tests passing across 3 suites

### Blockers
- None

### Next Step
- TypeScript build check (`npm run build`) then Railway deploy prep (env vars, health endpoint wiring)

---

## 2026-04-13

**Session:** Phase 2 — verifyAlignment co-occurrence scoring
**Branch:** claude/friendly-yalow

### Done
- Refactored `verifyAlignment.ts` scoring to two-tier vocabulary:
  - `ARCO_SPECIFIC` set: `agentic`, `stewardship`, `coordination`, `delegation`, `orchestrate`, `autonomous`, `operator` — score 0.85 (ALIGNED)
  - `STRONG_BUSINESS` set: general business/AI vocabulary — score 0.75 (≥2 hits) or 0.60 (1 hit)
  - No context hits → 0.30 (NEEDS_CLARIFICATION)
- Expanded `verifyAlignment.test.ts` from 13 → 23 tests:
  - Added `beforeEach`/`afterEach` to seed/clear in-memory cache with test TermObjects
  - Added ARCO_SPECIFIC tier tests (3 cases)
  - Added STRONG_BUSINESS tier tests (3 cases: 0.75, 0.60, 0.30)
  - Added false-positive prevention tests (3 cases)
  - Added multi-term overall scoring test
- All 71 tests passing across 3 suites

### Blockers
- None

### Next Step
- Set up Supabase `mcp_usage_log` table (run SQL migration in arcoventure-wiki Supabase project, add env vars to Railway)

---

## 2026-04-13

**Session:** Phase 2 — Supabase mcp_usage_log
**Branch:** claude/friendly-yalow

### Done
- Created `mcp_usage_log` table in arcoventure-cms Supabase project (CMS is the data hub for all Arco lexicon content)
- Added indexes on `tool` and `created_at DESC`
- Added `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to Railway service Variables
- Verified end-to-end: `lookup_term` call writes row to `mcp_usage_log` with correct `term_slug`; nullable fields (`input_summary`, `verdict`, `caller_agent`, `referer_domain`) are null as expected for non-verify_alignment tools
- Phase 2 complete

### Blockers
- None

### Next Step
- Phase 3: Try Now page at arcoventure.studio/try