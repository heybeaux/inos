# Inos — Handover Document

> **Created:** 2026-05-17 03:31 UTC
> **Author:** Cirrus ☁️ (KiloClaw / OpenClaw)
> **Repo:** https://github.com/heybeaux/inos
> **Stack:** Next.js 15 (App Router) + Hono + Zustand + Three.js/React Three Fiber + Framer Motion
> **Package Manager:** pnpm (monorepo: `apps/web`, `apps/api`, `packages/types`)

---

## What Inos Is

**Inos (Inosculate)** is a 4D reasoning graph for human-AI collaborative thinking. Part of the **Ginnung** ecosystem alongside Lattice, Sonder, Parliament, Engram, ACR, and AWM.

**Core idea:** Paste a messy Slack thread, Zoom transcript, or meeting notes → get a structured, explorable 3D knowledge graph of claims, decisions, questions, evidence, and how they relate. Time is the 4th dimension — a timeline slider winds through the reasoning as it unfolded.

**MVP wedge:** "Paste messy transcript, get structured reasoning graph."

### Architecture

```
apps/web/          Next.js 15 frontend (App Router, RSC)
├── components/
│   ├── canvas/     Three.js scene (Canvas3D, GraphScene, Node3D, Edge3D, CameraControls)
│   ├── panels/     Slide-in panels (Summary, Facts, Query, Timeline, Import, NodeDetail, CreateCanvasModal)
│   ├── ui/         Reusable primitives (Button, Card, CommandPalette)
│   └── nodes/      InlineEditor
├── lib/
│   ├── store.ts    Zustand — single source of truth (nodes, edges, timeline, panels, visibility)
│   ├── api.ts      API client
│   └── demo-data.ts Demo scenario generator ("Should we migrate to Supabase?" — 49 nodes, 55 edges)
└── app/
    ├── page.tsx    Main canvas page
    └── api/health  Health endpoint

apps/api/           Hono backend (port 4000)
├── src/
│   ├── index.ts    Main server — CORS, /health, POST /api/ingest, POST /api/query
│   └── routes/
│       └── ingestion.ts  Transcript ingestion pipeline (types, prompts, layout, extractor)

packages/types/     Shared TypeScript types (InosNode, InosEdge, Canvas, CanvasSummary, FactsTable, etc.)
```

### Key Design Decisions

- **Zustand as single source of truth** — all UI components read from the store. `visibleNodeIds` set controls what's rendered on the 3D canvas, filtered by `timelineProgress` (0-100%).
- **Server-side force layout** — `GraphScene` runs a 300-iteration force simulation on mount. Positions are memoized.
- **No auto-rotation** — removed to prevent disorientation with larger graphs. Camera pulled back to z=30.
- **OpenRouter for LLM** — `gpt-4o-mini` via the `/api/query` endpoint. Ingestion also uses OpenRouter. Falls back gracefully when no API key.
- **Bioluminescent aesthetic** — deep ocean theme (`--abyss-deepest` background, `--bio-cyan` accents, glass panels with blur).
- **Strict TypeScript** — `strict: true` across all packages.

---

## Work Done Today (2026-05-16 → 2026-05-17)

### Commits

| Hash | Message |
|------|---------|
| `958bac7` | Three major features: demo seed, user experience, transcript ingestion |
| `e6497c2` | Scaffold Next.js frontend with bioluminescent 3D canvas |
| `c66b9be` | Scaffold complete: monorepo builds and all tests pass |
| `b62e2ef` | Wire everything together end-to-end |
| `333bc99` | Improve 3D canvas for 49-node demo graph |
| `438c90d` | Wire timeline slider to 3D, add 2D timeline sidebar, fix query traversal, add create canvas UI |
| `dbfd9bd` | Fix timeline duplication, wire query to OpenRouter LLM |
| `5c7ec59` | Fix timeline TypeError: guard date formatting with safe helper |

### What Was Built

1. **Foundation** — monorepo scaffold, type system, bioluminescent design tokens, .gitignore
2. **3D Canvas** — React Three Fiber scene with force-directed layout, Node3D (type-colored, hover effects), Edge3D (type-colored connections), CameraControls (orbit, zoom, pan)
3. **Transcript Ingestion** — Hono endpoint that parses messy text via LLM into structured graph (nodes + edges + summary + facts)
4. **Demo Seed** — 49-node "Supabase migration" scenario with 3 branches, synthesis merge, 9 facts, temporal data
5. **Zustand Store** — unified state for nodes, edges, panels, timeline, visibility, context menu, command palette, inline editing
6. **Panels** — Summary (prose summary + health badges), Facts (facts table with disputed/stale badges), Query (LLM-powered Q&A), Timeline (slider + legend), NodeDetail, Import
7. **Timeline Slider → 3D Wiring** — `setTimelineProgress()` computes `visibleNodeIds`, `GraphScene` filters rendering accordingly
8. **2D Timeline Sidebar** — left sidebar (appears when Timeline panel active), nodes grouped by date, click-to-focus on 3D canvas
9. **Query → OpenRouter** — `/api/query` endpoint sends full graph context to `gpt-4o-mini`, returns LLM answer + highlights relevant nodes
10. **Create Canvas UI** — "+ New" button in TopBar, template modal (Blank, Decision, Investigation, Design Review)
11. **UX Features** — Command Palette (Cmd+K), Context Menu (right-click nodes), Inline Editor, Canvas Toolbar
12. **Bug Fixes** — timeline duplication, date TypeError, query hardcoded responses, build errors

### Current State

- ✅ Both `pnpm build` targets pass clean (web: 165kB First Load JS, API: TypeScript compiles)
- ✅ 8 commits pushed to `heybeaux/inos` master
- ✅ All features functional in `pnpm dev`
- ⚠️ No persistent storage yet — all data is in-memory (demo loads on mount)
- ⚠️ No authentication
- ⚠️ Query uses `gpt-4o-mini` — could be upgraded to better models

---

## What I Want a Frontier Agentic Team to Do

**Goal: 10x Inos from MVP to production-ready collaborative reasoning platform.**

### Priority 1: Persistence & Real-Time Sync

The biggest gap is that everything dies on refresh.

- **Add Supabase (PostgreSQL)** for canvas/node/edge persistence. See `packages/types/` for the data model. Create Prisma schema, run migrations, wire CRUD endpoints in Hono.
- **Yjs/CRDT** for real-time multi-user collaboration. Zustand → Yjs provider. Multiple cursors, live presence indicators, conflict-free merging.
- **WebSocket** or SSE for live sync. Hono → WebSocket gateway. Frontend subscribes to canvas changes.

### Priority 2: Ingestion Quality & Multi-Format

The ingestion pipeline works but is a single LLM call. Make it robust.

- **Multi-pass extraction** — first pass: structure (nodes/edges), second pass: fact extraction, third pass: confidence scoring and staleness evaluation.
- **Format-specific parsers** — separate prompts/extractors for Slack exports, Zoom transcripts, email threads, markdown notes, PDFs.
- **Confidence scores** on each node — show which nodes are "high confidence" vs "might be wrong."
- **Source attribution** — every extracted node should link back to the exact quote/segment in the original transcript.

### Priority 3: Reasoning & Query Intelligence

Query is basic Q&A over graph context. Level it up.

- **Graph traversal reasoning** — the LLM should trace paths: "What evidence supports Decision X?" → find all `supports` edges, recursively traverse, summarize chain.
- **Contradiction detection** — auto-detect nodes that conflict (e.g., two facts with opposing values, decisions that undermine each other).
- **Auto-synthesis** — when 3+ branches converge, auto-generate a synthesis node summarizing the merged insight.
- **Temporal reasoning** — "How did our thinking change over time?" — track how node staleness shifts, decisions superseded, facts revised.
- **Upgrade LLM model** — try `anthropic/claude-sonnet-4-20250514` or `openrouter/google/gemini-2.5-pro` for better reasoning on complex graphs.

### Priority 4: Canvas UX & Visual Hierarchy

The 3D canvas works but needs polish for real use.

- **Auto-clustering** — detect communities in the graph (Louvain algorithm), cluster them visually, let users expand/collapse clusters.
- **Semantic zoom** — far away: see cluster labels and counts. Zoom in: see node types and titles. Zoom closer: see full content.
- **Edge routing** — curved edges, avoid node overlap, better visual hierarchy for edge types (dashed for challenges, solid for supports, glow for critical paths).
- **Focus mode** — click a node, dim everything else, highlight its dependency chain (what it depends on + what depends on it).
- **Node search/filter** — Cmd+F style search that highlights matching nodes and dims the rest.
- **Export** — PNG of current view, JSON export, Markdown export of the reasoning.

### Priority 5: Sonder Integration (Audit Layer)

From the ecosystem spec: **every decision/evidence node must be a signable SonderEvent.**

- When a node is created, modified, or marked stale, emit a `SonderEvent` to the Sonder audit layer.
- Support cryptographic signing of reasoning chains (important for compliance-heavy use cases).
- Version history / tombstone tracking — soft deletes, full audit trail.

### Priority 6: Engram Integration (Memory)

- Index canvas reasoning into Engram for cross-canvas retrieval.
- "Have we discussed this before?" — auto-surface related canvases from memory.
- Dream cycle consolidation — nightly summarization of all active canvases into persistent insights.

### Priority 7: Infrastructure

- **Docker Compose** — web + api + postgres + redis in one `docker-compose.yml`.
- **CI/CD** — GitHub Actions: lint → typecheck → test → build → deploy (Railway/Vercel).
- **Rate limiting** on ingestion/query endpoints.
- **Telemetry** — basic analytics (canvas creation rate, nodes per canvas, query usage).

---

## Key Files to Understand the Codebase

| File | Why |
|------|-----|
| `packages/types/src/index.ts` | Core type definitions — the data model |
| `apps/web/lib/store.ts` | Zustand store — single source of truth, all state lives here |
| `apps/web/components/canvas/GraphScene.tsx` | Force layout + 3D rendering pipeline |
| `apps/web/components/canvas/Node3D.tsx` | Individual node rendering (geometry, color, hover, click) |
| `apps/web/components/canvas/Edge3D.tsx` | Connection rendering between nodes |
| `apps/web/components/panels/TimelinePanel.tsx` | Right panel — slider + legend (triggers `visibleNodeIds`) |
| `apps/web/components/canvas/TimelineSidebar.tsx` | Left sidebar — 2D timeline view, click-to-focus |
| `apps/web/components/panels/QueryPanel.tsx` | LLM-powered query against the graph |
| `apps/web/lib/demo-data.ts` | Demo scenario generator — 49 nodes, 55 edges, temporal data |
| `apps/api/src/index.ts` | Hono server — ingestion + query endpoints |
| `apps/api/src/routes/ingestion.ts` | Transcript ingestion pipeline |
| `apps/web/app/page.tsx` | Main canvas page, panel router, top bar |
| `apps/web/styles/abyssal.css` | Bioluminescent design tokens |

---

## Known Gotchas

1. **`dist/` in git** — `apps/api/dist/` is tracked (should probably be `.gitignore`d). Clean before building.
2. **No `.env.example`** — you need `OPENROUTER_API_KEY` for ingestion + query. Without it, ingestion falls back to mock data and query returns a "no key" message.
3. **Demo data loads on every mount** — `page.tsx` calls `loadDemo()` in `useEffect`. Replace with actual canvas loading from DB.
4. **Force layout runs on every mount** — `useForceLayout` is memoized but re-runs if nodes/edges change. For 100+ nodes, consider moving to Web Worker.
5. **Zustand devtools not enabled** — add `@redux-devtools/extension` for debugging state.
6. **No error boundary** — if the 3D scene crashes, the whole page goes white. Add React ErrorBoundary.

---

## Ecosystem Context

Inos sits in the **Ginnung** ecosystem. Here's how it maps:

| Layer | Project | Role |
|-------|---------|------|
| Reasoning Graph | **Inos** | Interactive 4D knowledge graph (this repo) |
| State Machine | **Lattice** | Agent state transitions, workflow orchestration |
| Audit Layer | **Sonder** | Cryptographic signing, event provenance, compliance |
| Governance | **Parliament** | Multi-agent consensus, voting, policy enforcement |
| Memory | **Engram** | Persistent memory storage + retrieval (api.openengram.ai) |
| Capabilities | **ACR** | Agent capability runtime (heybeaux/acr) |
| Execution Model | **AWM** | Agent workflow model, predictive execution (heybeaux/awm) |

Inos should eventually be the **visualization and collaboration layer** on top of all of these. Nodes → SonderEvents. Reasoning chains → Lattice state machines. Cross-canvas retrieval → Engram.

---

## If You're an Agent Reading This

1. Start with `packages/types/src/index.ts` — understand the data model first
2. Run `pnpm install && pnpm build` — verify everything compiles
3. Add Supabase + Prisma first — persistence unlocks everything else
4. Then add real-time sync (Yjs) — that's what makes it collaborative
5. Then improve ingestion quality — that's what makes it valuable
6. Everything else follows

Good luck. This is a good one. ☁️
