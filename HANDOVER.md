# Inos — Handover Document

> **Original draft:** 2026-05-17 03:31 UTC (Cirrus ☁️ / KiloClaw)
> **Phase-0 rewrite:** 2026-05-17 03:55 UTC (Rook ♜, after live verification)
> **Repo:** https://github.com/heybeaux/inos
> **Stack:** Next.js 15 (App Router) + Hono + Zustand + Three.js/React Three Fiber + Framer Motion
> **Package Manager:** pnpm 10 (monorepo: `apps/web`, `apps/api`, `packages/types`, `packages/core`)

---

## Why this doc was rewritten

The previous version claimed "Both `pnpm build` targets pass clean" and "all features functional." Neither was true. This rewrite reflects the **verified state** after Phase 0 — build green, real tests green, ingestion live-tested against a real transcript, and the lies removed.

If you're an agent picking this up: trust this doc only for the **Verified state** section. Treat the rest of the original handover as design intent that has not been validated.

---

## What Inos Is

**Inos (Inosculate)** is a 4D reasoning graph for human-AI collaborative thinking. Part of the **Ginnung** ecosystem alongside Lattice, Sonder, Parliament, Engram, ACR, and AWM.

**Core idea:** Paste a Slack thread, Zoom transcript, or meeting notes → get a structured, explorable 3D knowledge graph of claims, decisions, questions, evidence, and how they relate. Time is the 4th dimension.

**MVP wedge:** "Paste messy transcript, get structured reasoning graph."

### Architecture

```
apps/web/           Next.js 15 frontend (App Router)
├── components/canvas/   Three.js scene
├── components/panels/   Slide-in panels
├── components/ui/       Reusable primitives
├── lib/store.ts         Zustand — single source of truth
├── lib/api.ts           API client
├── lib/demo-data.ts     49-node demo scenario generator
└── app/page.tsx         Main canvas page

apps/api/           Hono backend (port 4000)
├── src/index.ts                CORS, /health, POST /api/query
├── src/routes/ingestion.ts     POST /api/ingest
└── src/lib/ingestion/          extractor / prompts / layout / types

packages/types/     Shared types (InosNode, InosEdge, Canvas, etc.)
packages/core/      CascadeEngine, DedupEngine (currently unwired), TemporalEngine
```

---

## Verified state (as of 2026-05-17 phase-0)

### Build & tests

- ✅ `CI=true pnpm -r build` — all 4 workspaces green
- ✅ `CI=true pnpm --filter @heybeaux/inos-core test` — 17 tests passing (was 10, of which 4 were `expect(true).toBe(true)` placeholders)
- ✅ Ingestion pipeline live-verified against a real 14-line Slack-style transcript with both `openai/gpt-4o-mini` and `anthropic/claude-sonnet-4-6` (new default). Sample output saved to `/tmp/inos-sonnet46-extraction.json` outside the repo for reference.

### What was fixed in Phase 0

1. **Build was broken on master.** Web app failed prerender of `/404` with `<Html> should not be imported outside of pages/_document`. Root cause was `NODE_ENV=development` leaking from the shell env into Next 15's webpack alias resolution, picking the wrong react-dom-server variant. Fix: `apps/web/package.json` `build` script now forces `NODE_ENV=production`. Note: this is a local band-aid. The underlying environment leak should be fixed at its source (it will also affect `next dev` / `next start`).

2. **Cascade engine was wrong on multi-parent dependencies.** `CascadeEngine.evaluateStaleness` used `.find()` on the first matching parent, so a node with three parents (one negated, two fresh) would be marked fresh if the negated one wasn't the first match. Fix: evaluate state across ALL parents with explicit priority `negated > orphaned > stale > newer-update > fresh`. 8 real tests added in `packages/core/src/cascade.test.ts` replacing the `expect(true).toBe(true)` stub. **This is the thesis of the product — if it's wrong, nothing else matters.**

3. **Ingestion crashed on real transcripts.** Live test: `gpt-4o-mini` returned valid JSON with one node missing the `dependsOn` field. `extractor.ts:374` then crashed with `Cannot read properties of undefined (reading 'map')`. Fix: defensive `?? []` on `extNode.dependsOn`. Audited for other LLM-output-trust bugs — see `packages/core/src/cascade.ts` notes in the PR.

4. **`simulateLLMResponse` lie removed.** Without `OPENROUTER_API_KEY` set, the previous code returned a hardcoded 6-node "Origin of Life" graph regardless of input, and the HTTP route served it as `200 OK`. The user thought their transcript was extracted; they got fake data. Now: route returns `503` with `{error: "OPENROUTER_API_KEY not configured"}`.

5. **Default model upgraded** from `openai/gpt-4o-mini` to `anthropic/claude-sonnet-4-6`. Live A/B on the same 14-line transcript: gpt-4o-mini → 15 nodes / 8 edges (mostly `depends_on`); Sonnet 4.6 → 16 nodes / 18 edges (rich edge typing: supports, challenges, refines, depends_on). Sonnet 4.6 is ~10× slower (38s vs 3s) but the quality lift is real and reasoning extraction is not a hot path. Override via `INGESTION_MODEL` env or per-request `config.model`.

6. **Repo hygiene.** `apps/api/dist/`, `apps/api/node_modules/`, `packages/*/node_modules/`, root `node_modules/` were tracked in git despite a `.gitignore` that excluded them. Untracked everything in Phase 0; deleted noise in the next `git status`.

### Known bugs still present (Phase 1 work — NOT fixed in Phase 0)

In `packages/core/src/cascade.ts`:

- **Temporal-index side effect.** Every `cascade()` call mutates `graph.temporalIndex` even when nothing changed.
- **BFS traversal is not topologically ordered.** Diamond dependencies (A→B, A→C, B→D, C→D) evaluate D against B/C in arbitrary order, so D may evaluate against a stale-but-not-yet-cascaded sibling.
- **`triggeredBy` records the immediate parent in BFS, not the root cause.** For A→B→C with A negated, C's `staleness.triggeredBy` is `'b'`, not `'a'`.
- **No self-loop guard.** `dependsOn` containing the node's own id would mark the node stale relative to itself.

In `apps/api/src/lib/ingestion/extractor.ts` — see static audit at `/tmp/inos-ingestion-audit.md` for full list with file:line refs. Highlights:

- **Bare `JSON.parse`** at `extractor.ts:267` — no retry, no JSON repair, no salvage. A truncated response (plausible at `max_tokens: 8000` on long transcripts) throws straight to a 500.
- **LLM `type` strings cast blindly** at `extractor.ts:313, 352` — `as InosNode['type']` / `as InosEdge['type']` with no enum allowlist. Hallucinated `"action_item"` flows through and breaks downstream consumers.
- **Markdown-fence stripping is wrong** when the fence appears inside JSON content — non-greedy regex matches the wrong block.
- **Edges referencing nonexistent node ids are silently dropped** with no log, no count, no warning to the user.
- **`response_format: { type: 'json_object' }` is sent unconditionally** — some OpenRouter models 400 on this.
- **No retry / timeout / AbortController / chunking / token counting.** A 100KB transcript silently truncates and may produce unparseable JSON.
- **`factRegistry: {}` and `temporalIndex: []` are always empty by construction** despite the data model supporting them.
- **`DedupEngine` is dead code.** `packages/core/src/dedup.ts` is exported, tested, and never imported anywhere in `apps/`. The Levenshtein-based fact dedup the data model implies is not wired into ingestion.
- **`detectFormat` regexes are wildly broad.** `/^\w+ \w+:/m` for Slack matches "Subject:" / "Dear Sir:" / "Note Here:" — first-match wins.
- **`forceLayout` uses unseeded `Math.random()`** for initial positions → non-deterministic layout across runs of the same transcript.
- **Prompt injection unmitigated.** Transcript is wedged between `---` markers with no escape strategy.

In `apps/web/`:

- **No `app/not-found.tsx`** — Next auto-generates one, but custom 404 UI requires this file.
- **Demo data loads on every mount** — `page.tsx` calls `loadDemo()` in `useEffect`. Replace with actual canvas loading once persistence lands.
- **`useForceLayout` re-runs whenever nodes/edges change.** For 100+ nodes consider a Web Worker.
- **No React ErrorBoundary** around the 3D scene — a Three.js crash whites out the whole page.

---

## Phase-1 priorities (revised from the original P1–P7)

Re-ordered after Phase 0 audit. The original priorities are still mostly correct but the ordering buried risk.

### P1: Make the wedge actually work (1 week)

The thesis is "paste transcript, get structured graph." That has to be *good* before persistence or realtime is worth building.

- **Multi-pass extraction.** First pass: structure (nodes/edges). Second pass: fact extraction with `factKey` normalization. Third pass: confidence scoring. Each pass is small and graded against a fixture set.
- **Enum-validated LLM output.** Replace `as InosNode['type']` casts with an allowlist check. Drop or remap unknown types; never trust the model.
- **JSON repair on parse failure.** When `JSON.parse` throws, re-ask the model with the error message. One retry max.
- **Wire `DedupEngine` into ingestion** for fact key normalization. Long-term: replace Levenshtein with Engram embedding similarity.
- **Source attribution.** Every extracted node tags the original text span (character range or quote). HANDOVER's old P2 lists this; it's actually critical for trust.
- **Real fixture suite.** 5+ hand-graded transcripts. Run on every ingestion change. Regression-tracked.
- **Token counting + chunking** for transcripts > model context.
- **Seed `forceLayout`** for deterministic layouts.

### P2: Persistence (3-4 days)

Until this lands, every other feature is theatrical.

- Supabase (Postgres) + Prisma schema derived from `packages/types/src/index.ts`. Schema review BEFORE the agent team scaffolds it — don't let LLM-guess schema happen.
- CRUD endpoints in Hono.
- Replace `loadDemo()` on mount with real canvas loading.

### P3: Engram + Sonder integration (parallel tracks)

Independent of each other, both unblocked by P2.

- **Engram:** semantic dedup, cross-canvas "have we discussed this before" retrieval, dream-cycle consolidation. Engram is already running; don't rebuild similarity logic.
- **Sonder:** `SonderEvent` emission on every node create/modify/staleness-change. Cryptographic signing of reasoning chains for compliance.

### P4: Cascade engine correctness (1-2 days)

The Phase-0 fix made multi-parent right; the rest of the bugs above (temporal side-effect, topo order, triggeredBy, self-loop) need cleanup before the engine is trustworthy at scale.

### P5: Query intelligence

The original P3. Graph traversal, contradiction detection, auto-synthesis, temporal reasoning. Worth doing only after P1–P4.

### P6: Canvas UX polish

Auto-clustering, semantic zoom, focus mode, edge routing, export. Real but not load-bearing.

### P7: Realtime sync (Yjs) — STRATEGIC DECISION GATE

This is 1-2 weeks of work and only makes sense if **teams** is the chosen beachhead, not solo thinkers. The thesis pitches both. Decide before sinking time here. Solo and team UX diverge significantly (focus mode vs presence cursors).

### P8: Infra

Docker Compose, CI/CD (GitHub Actions: lint → typecheck → test → build → deploy), rate limiting, telemetry. Standard but not until the product works.

---

## Key files

| File | Why |
|------|-----|
| `packages/types/src/index.ts` | The data model. Read first. |
| `packages/core/src/cascade.ts` | The thesis — multi-parent fix lives here. Read with `cascade.test.ts` to understand intent. |
| `packages/core/src/dedup.ts` | DEAD CODE in ingestion path. Wire it in for P1. |
| `apps/api/src/lib/ingestion/extractor.ts` | The pipeline. Single-pass, trusts LLM output, see Phase-1 P1. |
| `apps/api/src/lib/ingestion/prompts.ts` | The extraction prompt. Format-specific branches are prompt-only stubs. |
| `apps/api/src/routes/ingestion.ts` | HTTP route. 503 on missing key, 500 on parse failure. |
| `apps/api/src/index.ts` | Hono server, query endpoint. Stuffs full graph into one prompt — won't scale past ~200 nodes. |
| `apps/web/lib/store.ts` | Zustand store. Single source of truth. |
| `apps/web/lib/demo-data.ts` | 49-node demo. Replace once persistence lands. |
| `apps/web/components/canvas/GraphScene.tsx` | Force layout + 3D rendering. |
| `apps/web/app/page.tsx` | Main canvas page. Loads demo on mount. |

---

## Environment

Required:
- `OPENROUTER_API_KEY` — without it, ingestion returns 503. (Old behavior of returning a canned graph is gone.)

Optional:
- `INGESTION_MODEL` — overrides default `anthropic/claude-sonnet-4-6`
- `SITE_URL` — for OpenRouter `HTTP-Referer` header

---

## Ecosystem context

| Layer | Project | Role |
|-------|---------|------|
| Reasoning Graph | **Inos** | Interactive 4D knowledge graph (this repo) |
| State Machine | **Lattice** | Agent state transitions |
| Audit Layer | **Sonder** | Cryptographic signing, event provenance |
| Governance | **Parliament** | Multi-agent consensus, voting |
| Memory | **Engram** | Persistent memory storage + retrieval |
| Capabilities | **ACR** | Agent capability runtime |
| Execution Model | **AWM** | Agent workflow model |

---

## For the next agent

1. Read `packages/types/src/index.ts` first.
2. Run `CI=true pnpm install && CI=true pnpm -r build && CI=true pnpm -r test` to verify the baseline I claim. If anything fails, update this doc before doing other work.
3. Read `/tmp/inos-ingestion-audit.md` (static audit from Phase 0) for the full bug list with file:line refs.
4. Do not trust any HANDOVER claim you haven't verified. Including this one.

— Rook ♜
