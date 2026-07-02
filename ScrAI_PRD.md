# PRD: Cited — Self-Hosted Multi-Source Answer Aggregator

**Doc status:** Draft v1.0 (renamed from AnswerAI)
**Owner:** Product/Eng
**Last updated:** 2026-07-02

---

## 1. Overview

### 1.1 Problem
Developers researching a technical question today open 6–8 tabs (Stack Overflow, Reddit, Dev.to, HN, Medium, X) and manually synthesize the answer themselves. Existing AI answer engines (Perplexity, You.com) are closed-source, hosted, and don't let users control which sources are queried, how results are weighted, or where their API keys/data go.

### 1.2 Solution
Cited is an open-source, self-hosted answer aggregator. Users run their own instance (Docker Compose), supply their own API keys per source, and query across up to 6 developer-relevant sources in parallel. Results are quality-ranked and fed into a RAG pipeline that uses the user's own Gemini API key to generate a cited, synthesized answer. Zero infrastructure cost to the maintainers — every instance runs on the user's own compute and keys.

### 1.3 Target User
Individual developers, technical writers, and small teams who want a private, controllable, self-hosted alternative to closed answer engines. Single-user per instance at launch.

### 1.4 Non-Goals
Multi-tenant auth, managed cloud hosting, non-Gemini LLM backends, analytics dashboards.

---

## 2. Branding & Color Palette

**Note:** source palette image provided only 2 of 5 planned colors. Using those as the core brand pair, with a functional dark-mode/accent set filled in to make the UI usable. Swap in the remaining 3 once available.

| Role | Name | Hex | Usage |
|---|---|---|---|
| Primary background (dark mode) | Black | `#000000` | App shell background, hero section, header/footer |
| Primary background (light mode) / surface | Blanche Dalmond | `#F6E9C7` | Light-mode background, cards, hero text-on-dark contrast |
| Text on Black | Blanche Dalmond | `#F6E9C7` | Headlines/labels on dark backgrounds |
| Text on Blanche Dalmond | Black | `#000000` | Body copy on light backgrounds |
| Accent (interactive/CTA) | *TBD — pending remaining 3 palette colors* | — | Buttons, active states, source-toggle chips, links |
| Muted/border | Black @ 10–15% opacity on cream, Cream @ 10–15% opacity on black | derived | Dividers, disabled states |

**Interim accent recommendation:** until colors 3–5 arrive, use a desaturated warm accent derived from Blanche Dalmond (e.g. `#D8B978`, a deeper gold) for interactive elements, since pure black/cream alone has no clear "action" color and everything will look static/disabled.

**Typography direction implied by the reference slides:** bold, wide-tracked, all-caps sans-serif for headings (e.g. Space Grotesk, Neue Montreal, or similar) — matches the palette card's condensed/spaced caps styling.

---

## 3. User Flows

### 3.1 Setup Flow
1. `git clone` the repo.
2. `cp .env.example .env` and fill in keys for desired sources (all optional except Gemini).
3. `docker-compose up -d` — spins up `backend` (FastAPI), `frontend` (Next.js), and a mounted SQLite volume.
4. Visit `localhost:3000` → Setup Wizard checks `.env`, pings each configured source's auth endpoint, and shows pass/fail status per source.
5. User lands on the query screen with sources auto-toggled based on what's configured.

**Target: end-to-end under 10 minutes for a user with keys already in hand.**

### 3.2 Query Flow
1. User types a question into the search bar.
2. User optionally adjusts the source toggle bar (defaults to all authenticated/available sources).
3. On submit: backend checks cache → if miss, dispatches parallel async scrape jobs to each enabled source.
4. Results stream back source-by-source (progressive UI) as each scraper resolves.
5. Once all sources return (or timeout), results are deduplicated, scored, and top-N chunks passed to Gemini with a citation-aware prompt.
6. UI renders: synthesized answer (inline citation markers `[1][2]`) + citations panel (title, source badge, score, URL) + raw per-source result list (collapsible).
7. Query + results cached in SQLite keyed by normalized query + source-set hash.

### 3.3 Config Flow
1. User opens `/settings`.
2. **Sources tab:** per-source card showing auth status (✅/❌/⚠️), "Test Connection" button, last successful sync, rate-limit remaining.
3. **Cache tab:** TTL slider per source type, "Clear Cache" button, cache size/hit-rate stat.
4. **LLM tab:** Gemini key status, model selector (flash/pro), max tokens, temperature.

---

## 4. Features

| # | Feature | Priority |
|---|---------|----------|
| 1 | Multi-source scraping (Reddit, Medium, SO, Dev.to, HN, X) | P0 |
| 2 | Parallel async scraping with per-source timeout | P0 |
| 3 | Quality-based ranking (source weight × normalized upvotes) | P0 |
| 4 | RAG pipeline: retrieve → chunk → rank → generate with citations | P0 |
| 5 | Inline + panel citations (URL, title, source, score) | P0 |
| 6 | SQLite caching with configurable per-source TTL | P0 |
| 7 | Source status dashboard | P1 |
| 8 | Per-query source toggle | P0 |
| 9 | Docker Compose self-hosted deployment | P0 |
| 10 | Zero maintainer infra cost (BYO keys/compute) | Design constraint |

---

## 5. Functional Requirements

**FR1 — Source Adapters:** shared `SourceAdapter` interface (`async def search(query, limit) -> list[RawResult]`); adapters isolate failures so one bad source never fails the whole query.

**FR2 — Reddit (PRAW):** `client_id` + `client_secret`, read-only script app; pull top comments on high-score threads as supplementary context.

**FR3 — Medium (Playwright):** no auth; headless scrape with configurable delay; graceful degrade if selectors break.

**FR4 — Stack Overflow:** public Stack Exchange API; optional app key for higher limits; pull top-N answers by score, not just question titles.

**FR5 — Dev.to:** public API, optional key for higher limits.

**FR6 — Hacker News:** Firebase HN API + Algolia HN Search API for relevance search.

**FR7 — Twitter/X:** optional Bearer token (API v2) or Playwright fallback, flagged as best-effort in the status dashboard.

**FR8 — Ranking Engine:**
`final_score = source_weight[source] * normalize(raw_score, source) * recency_decay(created_at)`
Default weights (configurable): SO 1.0, Dev.to 0.85, Reddit 0.7, Medium 0.6, HN 0.55, Twitter 0.4.

**FR9 — RAG Pipeline:** chunk bodies (~300–500 tokens); retrieve top-K (default 8); citation-index validator rejects/re-prompts on hallucinated out-of-range citations.

**FR10 — Caching:** two-tier SQLite cache — raw per-source results (longer TTL, default 6h) and synthesized answers (shorter TTL, default 1h), independently configurable.

**FR11 — Source Status Dashboard:** per-source configured/authenticated/last-sync/last-error/rate-limit-remaining.

**FR12 — Setup Wizard:** validates `.env` via each adapter's `test_connection()` before allowing queries against unconfigured sources.

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Cached query < 2s p95. Cold query (6 sources) < 12s p95, 20s hard timeout per source with partial-result fallback. |
| Reliability | Single source failure never fails the overall query. |
| Cost | No maintainer-side compute/API cost — user's own keys and compute only. |
| Portability | Single `docker-compose up` on any Docker host, no external managed services beyond source APIs. |
| Data privacy | Queries/cache/keys stay local. No telemetry by default. |
| Security | Keys never logged or returned to frontend; parameterized SQL only; scraped content sanitized before rendering or entering LLM prompts (XSS + prompt-injection mitigation); scoped CORS, not wildcard. |
| Extensibility | New source = new adapter + config entry, no core pipeline changes. |
| Observability | Structured per-scrape-job logs (source, latency, result count, error). |

---

## 7. Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python 3.11+) |
| Frontend | Next.js (React), shadcn/ui components |
| Scraping | PRAW (Reddit), Playwright (Medium, X fallback), official REST APIs (SO, Dev.to, HN/Algolia) |
| LLM | Gemini API (`gemini-1.5-flash` default, `gemini-1.5-pro` optional) |
| Database | SQLite (Docker volume) |
| Orchestration | Docker Compose |
| Async jobs | `asyncio.gather` with per-task timeout + shared rate-limit wrapper per source |

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Time to first successful query after clone | < 10 minutes |
| Source reliability | >90% valid results across configured sources |
| Citation density | ≥3 citations per answer (≥3 sources enabled) |
| Cache hit rate | >40% over rolling 7-day window |
| Cached response latency | <2s p95 |
| Cold response latency | <12s p95 |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Medium/X scraping breaks (no official API / ToS-sensitive) | Isolated Playwright adapters, labeled best-effort, configurable delay, easy per-source disable |
| Rate limits across 6 concurrent sources | Shared backoff + rate-limit tracking, aggressive caching, semaphore capping concurrent queries per source |
| Gemini hallucinating citations | Post-generation validator, one re-prompt, fallback to raw results on repeat failure |
| Ranking weights feel arbitrary | User-configurable weights in Settings; raw per-source results shown alongside synthesis |
| Setup friction (Playwright deps, Docker unfamiliarity) | Deps baked into Docker image, Setup Wizard with explicit pass/fail, troubleshooting doc |
| SQLite concurrency under load | Explicitly single-user scope, documented limitation |
| Cost surprise from Gemini Pro / high volume | Default to flash model, show estimated token usage per query, cache aggressively |
| Incomplete brand palette (2/5 colors) | Interim accent color defined (§2); revisit once full palette delivered |

---

## 10. Out of Scope (Launch)

- Multi-user authentication / multi-tenant deployments
- Managed/hosted version
- Advanced analytics dashboards
- Non-Gemini LLM backends (architecture shouldn't preclude later addition)

---

## 11. Timeline (Phased)

**Phase 1 — Core (Week 1–2):** FastAPI skeleton, SQLite schema, `SourceAdapter` interface, config/env loading, Docker Compose skeleton (backend only).

**Phase 2 — Scrapers (Week 3–5):** all 6 adapters (SO → Dev.to → HN → Reddit → Medium → X), `test_connection()` per adapter, parallel dispatcher, ranking engine, rate-limit wrapper.

**Phase 3 — RAG (Week 6–7):** chunking, retrieval, Gemini prompt construction, citation validator, answer caching.

**Phase 4 — Frontend (Week 8–9):** Next.js query screen (progressive streaming), citations panel, source toggle bar, Settings pages, Setup Wizard, Cited branding/palette applied.

**Phase 5 — Docs & Hardening (Week 10):** README + setup walkthrough, `.env.example`, ToS/scraping ethics notes, troubleshooting guide, load test against §8 metrics, security audit (rate limiting + injection/XSS per prior audit prompt).

---

## 12. Open Questions

- Remaining 3 palette colors — needed to finalize accent/interactive color instead of the interim gold.
- Should Medium/X adapters be opt-in by default given ToS fragility?
- Is a lightweight in-memory job queue needed once concurrent multi-query usage is tested?
- Per-query-adjustable ranking weights for power users, or global settings only?
