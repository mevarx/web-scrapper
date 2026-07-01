# PRD: AnswerAI — Self-Hosted Multi-Source Answer Aggregator

**Doc status:** Draft v1.0
**Owner:** Product/Eng
**Last updated:** 2026-07-01

---

## 1. Overview

### 1.1 Problem
Developers researching a technical question today open 6–8 tabs (Stack Overflow, Reddit, Dev.to, HN, Medium, X) and manually synthesize the answer themselves. Existing AI answer engines (Perplexity, You.com) are closed-source, hosted, and don't let users control which sources are queried, how results are weighted, or where their API keys/data go.

### 1.2 Solution
AnswerAI is an open-source, self-hosted answer aggregator. Users run their own instance (Docker Compose), supply their own API keys per source, and query across up to 6 developer-relevant sources in parallel. Results are quality-ranked and fed into a RAG pipeline that uses the user's own Gemini API key to generate a cited, synthesized answer. Zero infrastructure cost to the maintainers — every instance runs on the user's own compute and keys.

### 1.3 Target User
Individual developers, technical writers, and small teams who want a private, controllable, self-hosted alternative to closed answer engines. Single-user per instance at launch.

### 1.4 Non-Goals (see §9 Out of Scope)
Multi-tenant auth, managed cloud hosting, non-Gemini LLM backends, analytics dashboards.

---

## 2. User Flows

### 2.1 Setup Flow
1. `git clone` the repo.
2. `cp .env.example .env` and fill in keys for desired sources (all optional except Gemini).
3. `docker-compose up -d` — spins up `backend` (FastAPI), `frontend` (Next.js), and a mounted SQLite volume.
4. Visit `localhost:3000` → Setup Wizard checks `.env`, pings each configured source's auth endpoint, and shows a pass/fail status per source.
5. User lands on the query screen with sources auto-toggled based on what's configured.

**Target: end-to-end under 10 minutes for a user with keys already in hand.**

### 2.2 Query Flow
1. User types a question into the search bar.
2. User optionally adjusts the source toggle bar (defaults to all authenticated/available sources).
3. On submit: backend checks cache → if miss, dispatches parallel async scrape jobs to each enabled source.
4. Results stream back source-by-source (progressive UI) as each scraper resolves.
5. Once all sources return (or timeout), results are deduplicated, scored, and the top-N chunks are passed to Gemini with a citation-aware prompt.
6. UI renders: synthesized answer (with inline citation markers `[1][2]`) + a citations panel (title, source badge, score, URL) + raw per-source result list (collapsible).
7. Query + results are cached in SQLite keyed by normalized query + source-set hash.

### 2.3 Config Flow
1. User opens `/settings`.
2. **Sources tab:** per-source card showing auth status (✅/❌/⚠️ not configured), "Test Connection" button, last successful sync timestamp, rate-limit remaining (if exposed by source API).
3. **Cache tab:** TTL slider per source type, "Clear Cache" button, current cache size/hit-rate stat.
4. **LLM tab:** Gemini key status, model selector (flash/pro), max tokens, temperature.

---

## 3. Features

| # | Feature | Priority |
|---|---------|----------|
| 1 | Multi-source scraping (Reddit, Medium, SO, Dev.to, HN, X) | P0 |
| 2 | Parallel async scraping with per-source timeout | P0 |
| 3 | Quality-based ranking (source weight × normalized upvotes) | P0 |
| 4 | RAG pipeline: retrieve → chunk → rank → generate with citations | P0 |
| 5 | Inline + panel citations (URL, title, source, score) | P0 |
| 6 | SQLite caching with configurable per-source TTL | P0 |
| 7 | Source status dashboard (auth/health/last-sync) | P1 |
| 8 | Per-query source toggle | P0 |
| 9 | Docker Compose self-hosted deployment | P0 |
| 10 | Zero maintainer infra cost (BYO keys/compute) | P0 (design constraint, not a build item) |

---

## 4. Functional Requirements

### FR1 — Source Adapters
- Each source implemented as a class conforming to a shared `SourceAdapter` interface: `async def search(query: str, limit: int) -> list[RawResult]`.
- `RawResult` schema: `{title, url, snippet/body, author, score (upvotes/points), created_at, source_name}`.
- Adapters must independently catch and surface auth failures, rate-limit errors, and timeouts without crashing the aggregate request.

### FR2 — Reddit (PRAW)
- Auth via `client_id` + `client_secret` (script-type app, read-only).
- Search relevant subreddits + global search; pull top comments as supplementary context for score-boosted threads.

### FR3 — Medium (Playwright)
- No auth. Headless scrape of Medium search results page.
- Must respect a configurable request delay and a `robots.txt`-aware toggle (default: on) since this is scraping, not an API.
- Fragile by nature — must degrade gracefully (mark source unavailable, don't fail the whole query) if selectors break.

### FR4 — Stack Overflow
- Public Stack Exchange API. No auth required for read; optional app key raises rate limit.
- Pull top-N answers by score for matching questions, not just question titles.

### FR5 — Dev.to
- Public API; optional API key for higher rate limits.

### FR6 — Hacker News
- Official Firebase HN API + Algolia HN Search API for relevance search (`hn.algolia.com`).

### FR7 — Twitter/X
- Optional Bearer token (API v2) OR Playwright fallback if no token provided. Fallback must be clearly flagged as best-effort/unstable in the source status dashboard given platform scraping restrictions.

### FR8 — Ranking Engine
- Formula: `final_score = source_weight[source] * normalize(raw_score, source) * recency_decay(created_at)`
- Default source weights (configurable in settings): SO 1.0, Dev.to 0.85, Reddit 0.7, Medium 0.6, HN 0.55, Twitter 0.4.
- `normalize()` scales each source's raw score to a 0–1 range using source-specific heuristics (SO uses answer score, Reddit uses upvote ratio × score, etc.) since raw magnitudes aren't comparable across sources.
- Recency decay is a soft multiplier, not a hard filter — old canonical SO answers should still outrank a fresh but thin tweet.

### FR9 — RAG Pipeline
- Chunk each `RawResult.body` into passages (~300–500 tokens).
- Retrieve top-K chunks post-ranking (default K=8, configurable) to stay within Gemini context/cost budget.
- Construct a structured prompt requiring the model to cite sources by index for every claim, matching the citation format in the UI (`[1]`, `[2]`, …).
- Enforce via prompt + a post-generation validator that every `[n]` marker maps to a real citation index, and flag/re-prompt once if the model hallucinates an out-of-range citation.

### FR10 — Caching
- SQLite table keyed on `hash(normalized_query + sorted(enabled_sources))`.
- Two-tier cache: raw per-source results (longer TTL, e.g. 6h default) and final synthesized answers (shorter TTL, e.g. 1h default), independently configurable.
- Cache entries store fetch timestamp; dashboard shows hit-rate over a rolling window.

### FR11 — Source Status Dashboard
- Real-time (poll or WS) per-source card: configured (Y/N) → authenticated (Y/N/N-A) → last successful call → last error (if any) → rate-limit remaining if the API exposes it.

### FR12 — Setup Wizard
- On first boot, validate `.env` against each adapter's `test_connection()` method and surface pass/fail before allowing queries against unconfigured sources.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Cached query response < 2s (p95). Cold query (all 6 sources) target < 12s p95, hard timeout at 20s per source with partial-result fallback. |
| Reliability | A single source failure/timeout must never fail the overall query — degrade to fewer citations, surface which sources failed. |
| Cost | No maintainer-side compute or API cost. All LLM/API costs are the user's own, incurred against their own keys. |
| Portability | Single `docker-compose up` on any Docker host (local, Railway, Render, bare VPS) with no external managed services required beyond the source APIs themselves. |
| Data privacy | All queries, cache, and keys stay local to the user's instance/volume. No telemetry/phone-home by default; if added later, opt-in only. |
| Security | API keys read from `.env`/Docker secrets only, never logged, never sent to the frontend. Rate-limit/backoff handling per source to avoid account bans. |
| Extensibility | New source = new adapter implementing `SourceAdapter`; ranking weight and cache TTL added via config, no core pipeline changes required. |
| Observability | Structured logs per scrape job (source, latency, result count, error) sufficient to debug without a dedicated monitoring stack. |

---

## 6. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python 3.11+) | Async-native, fits parallel scraping model |
| Frontend | Next.js (React) | SSR not required — can be a static/SPA-style client hitting the FastAPI backend |
| Scraping | PRAW (Reddit), Playwright (Medium, X fallback), official REST APIs (SO, Dev.to, HN/Algolia) | Playwright run headless in its own container/layer to isolate browser deps |
| LLM | Gemini API (`gemini-1.5-flash` default, `gemini-1.5-pro` optional) | User-supplied key; model configurable in Settings |
| Database | SQLite | File-based, mounted as a Docker volume for persistence across restarts |
| Orchestration | Docker Compose | `backend`, `frontend`, shared volume for SQLite + Playwright browser cache |
| Async jobs | `asyncio.gather` with per-task timeout | No external queue (Celery/Redis) needed at this scale — keeps infra footprint at zero |

---

## 7. Success Metrics

| Metric | Target |
|---|---|
| Time to first successful query after clone | < 10 minutes |
| Source reliability | All 6 adapters return valid results in >90% of test queries (excluding sources the user hasn't configured) |
| Citation density | ≥ 3 citations per generated answer on queries with ≥3 sources enabled |
| Cache hit rate | > 40% on repeated/similar queries over a rolling 7-day window |
| Cached response latency | < 2s p95 |
| Cold response latency | < 12s p95 (6 sources enabled) |

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Medium/X scraping breaks (no official API / ToS-sensitive) | Source silently degrades or violates ToS | Playwright adapters isolated + clearly labeled "best-effort"; configurable request delay; easy to disable per-source; document ToS considerations in README |
| Rate limits across 6 concurrent sources | Partial/failed results, possible key bans | Per-source backoff + rate-limit tracking in status dashboard; cache aggressively to reduce call volume |
| Gemini hallucinating citations | Trust/accuracy issue | Post-generation citation-index validator (FR9); re-prompt once on failure; fall back to showing raw ranked results if validation fails twice |
| Ranking weights feel arbitrary/unfair to a source | User distrust of synthesized answer | Make weights user-configurable in Settings; show raw per-source results alongside synthesis so users can verify |
| Self-hosted setup friction (Playwright browser deps, Docker unfamiliarity) | Missed <10 min setup target | Ship Playwright deps baked into the Docker image (not installed at runtime); Setup Wizard with explicit pass/fail per step; troubleshooting doc |
| SQLite concurrency limits under heavy single-user load | Minor — single-user design makes this low risk | Explicitly out of scope to solve for multi-user; document as a known single-instance limitation |
| Cost surprise from Gemini Pro / high query volume | User bill shock | Default to `gemini-1.5-flash`; show estimated token usage per query in UI; cache to cut redundant calls |

---

## 9. Out of Scope (Launch)

- Multi-user authentication / multi-tenant deployments
- Managed/hosted version (users self-host only)
- Advanced analytics or usage dashboards beyond cache hit-rate/source status
- Non-Gemini LLM backends (OpenAI, Anthropic, local models) — architecture should not preclude this later, but not built at launch

---

## 10. Timeline (Phased)

**Phase 1 — Core (Week 1–2)**
FastAPI skeleton, SQLite schema (results cache, answer cache, config), `SourceAdapter` interface, config/env loading, Docker Compose skeleton (backend only).

**Phase 2 — Scrapers (Week 3–5)**
Implement all 6 adapters (SO → Dev.to → HN → Reddit → Medium → X, in ascending complexity order), per-adapter `test_connection()`, parallel async dispatcher with timeout/error isolation, ranking engine.

**Phase 3 — RAG (Week 6–7)**
Chunking, retrieval/top-K selection, Gemini prompt construction, citation-index validator, answer caching.

**Phase 4 — Frontend (Week 8–9)**
Next.js query screen (progressive streaming results), citations panel, source toggle bar, Settings pages (Sources/Cache/LLM), Setup Wizard.

**Phase 5 — Docs & Hardening (Week 10)**
README with setup walkthrough, `.env.example`, ToS/scraping ethics notes for Medium/X adapters, troubleshooting guide, load-test against success metrics (§7), Docker image size/build-time optimization.

---

## 11. Open Questions

- Should Medium/X adapters be disabled by default (opt-in) given ToS fragility, vs. enabled-if-configured like the rest?
- Is a lightweight job queue (e.g., in-memory only, no Redis) needed once concurrent multi-query usage is tested, or does single-user `asyncio.gather` hold up?
- Should ranking weights be per-query-adjustable (not just global settings) for power users?
