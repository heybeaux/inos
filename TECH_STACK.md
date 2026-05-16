# Inos — Tech Stack

**Status:** Draft v0.1 — 2026-05-16, Cirrus ☁️ + Beaux Walton  
**Design mandate:** Highly visual, bioluminescent (Abyssal design language), accessible to non-technical users.

---

## Frontend

### Core

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | **Next.js 16** (App Router) | Matches Engram Playground. React Server Components for fast initial load. Shared ecosystem. |
| **UI Library** | **React 19** | Latest, concurrent rendering, Server Components. |
| **Styling** | **Tailwind CSS v4** | Consistent with Engram Playground. Rapid iteration. Design tokens for Abyssal theme. |
| **Animation** | **Framer Motion** | Smooth transitions, gesture support, layout animations. |
| **3D Rendering** | **Three.js + @react-three/fiber + @react-three/drei** | Bioluminescent graph rendering. Matches Engram Playground's Abyssal design language. WebGL performance for large graphs. |

### Graph Rendering

| Layer | Choice | Why |
|-------|--------|-----|
| **Force Simulation** | **d3-force-3d** | 3D force-directed layout. Integrates with Three.js. Handles 10k+ nodes. |
| **Graph Component** | **@react-three/drei** (custom nodes) + Three.js shaders | Custom bioluminescent node shaders. Glowing edges, pulsing states, temporal effects. |
| **2D Fallback** | **react-force-graph-2d** | For accessibility / low-power devices. Same data, 2D rendering. |

### Why 3D?

This isn't about being flashy. A reasoning graph is fundamentally spatial:

- **Depth encodes time** — older nodes recede, newer nodes float forward
- **Distance encodes relationship strength** — tightly related nodes cluster
- **Z-axis encodes hierarchy** — root topic at center, branches radiate outward
- **Bioluminescence encodes state** — fresh nodes pulse, stale nodes dim, disputed nodes flicker

In 2D, you need legends and tooltips to convey state. In 3D, the graph *shows* you. A non-technical user immediately sees: "this area is glowing = active discussion," "this node is dim = stale," "this path is red = challenged."

The Abyssal design language (from Engram Playground) makes this feel alive — not like a data visualization, but like a living organism.

### State Management

| Layer | Choice | Why |
|-------|--------|-----|
| **Client State** | **Zustand** | Lightweight, no boilerplate, devtools. Simpler than Redux, more flexible than Context. |
| **Real-time Sync** | **Yjs** | CRDT — conflict-free real-time collaboration. Offline-first, auto-merge. |
| **Yjs Provider** | **y-websocket** (self-hosted) | WebSocket provider for Yjs. No vendor lock-in. We control the sync server. |
| **Server Queries** | **SWR** or **TanStack Query** | Caching, revalidation, optimistic updates for non-real-time data. |

### Why Yjs?

Real-time collaboration is non-negotiable. Multiple humans and agents on the same canvas, simultaneously. Yjs gives us:

- **Conflict-free** — no merge conflicts, no "who wins" logic
- **Offline-first** — edits queue locally, sync when reconnected
- **Undo/redo** — built-in, per-user
- **Awareness** — who's online, where they're looking, what they're editing
- **Extensible** — we define our own Yjs types for nodes, edges, canvas state

The data model maps cleanly:
- `Y.Map<string, Y.Map>` for nodes (keyed by node ID)
- `Y.Map<string, Y.Map>` for edges (keyed by edge ID)
- `Y.Map` for canvas metadata
- `Y.Awareness` for presence (cursor position, focused node, zoom level)

---

## Backend

### API Server

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | **Hono** | Matches Lattice and Parliament. Lightweight, edge-compatible, great TypeScript support. |
| **Runtime** | **Node.js** (self-hosted) | Full ecosystem access. No edge limitations for LLM calls, file I/O. |
| **WebSocket Server** | **Built-in** (ws + y-websocket) | Yjs sync server. Co-located with API for simplicity. |
| **Validation** | **Zod** | Matches Forge and ecosystem standard. Runtime type safety. |
| **Auth** | **JWT + API Keys** | Matches Engram's auth model. Human users get JWTs, agents get API keys. |

### Database

| Layer | Choice | Why |
|-------|--------|-----|
| **Primary** | **Turso** (libSQL/SQLite) | Edge-compatible, fast, serverless. Matches Forge's LibSQL usage. Free tier generous. |
| **ORM** | **Drizzle** | Lightweight, TypeScript-native. Faster than Prisma for SQLite. No migration overhead. |
| **Yjs Persistence** | **y-sqlite** | Direct Yjs document persistence to SQLite. No serialization layer needed. |
| **Full-text Search** | **SQLite FTS5** | Built-in, fast enough for canvas/node search. No external service needed. |
| **Vector Search** | **SQLite extensions** or **Pinecone** | For semantic node search and fact dedup. Pinecone already in ecosystem (Engram, WhaleHawk). Start with SQLite FTS + embedding similarity, graduate to Pinecone when scale demands it. |

### Why Turso + libSQL?

- **Matches Forge** — already using LibSQL, same tooling
- **Edge-compatible** — can deploy read replicas close to users
- **Serverless** — no database to manage, auto-scaling
- **SQLite foundation** — FTS5 built-in, JSON support, fast reads
- **Cost** — generous free tier, scales with usage

For team/enterprise deployments, we can offer a **PostgreSQL mode** (using Prisma, matching Engram) for organizations that need it. But libSQL is the default.

### Background Jobs

| Layer | Choice | Why |
|-------|--------|-----|
| **Queue** | **In-process** (bullmq-lite) or **BullMQ + Redis** | Matches Engram's BullMQ usage. For LLM summarization, fact cascade, transcript ingestion. |
| **Scheduler** | **node-cron** (in-process) | For periodic tasks: summary regeneration, stale fact detection, dream cycle integration. |

For early stages, in-process jobs are fine. Scale to BullMQ + Redis when we have multi-instance deployment.

---

## AI/LLM Integration

| Layer | Choice | Why |
|-------|--------|-----|
| **Provider** | **OpenRouter** | Already configured. Access to all models (Gemini, GPT, Claude). Cost-effective. |
| **Local Provider** | **Ollama / oMLX / LM Studio** | Privacy-first, offline-capable, zero API cost. Apple Silicon (MLX) gets native acceleration. |
| **Transcript Ingestion** | **Frontier model** (GPT-4.1 / Claude Opus) OR **Local large model** (Llama 3.3 70B via Ollama) | Best at extracting structured reasoning from messy text. |
| **Canvas Summary** | **Mid-tier model** (Claude Sonnet / Gemini Pro) OR **Local mid model** (Mistral/Mixtral via Ollama) | Good summarization, lower cost. Runs frequently. |
| **Fact Dedup** | **Local small model** (Phi-3 / Llama 3.2 3B via oMLX) | Only runs on borderline cases (70-90% title similarity). Tiny model, fast, cheap. |
| **Zoom-out Assessment** | **Frontier model** (Opus / Gemini Pro) | Meta-reasoning about the entire graph. Needs deep comprehension. |
| **Natural Language Queries** | **Mid-tier model** + **SQLite FTS** | Translate NL query to node filters + graph traversals. |

### Model Routing Strategy

#### Cloud Mode (OpenRouter)

| Task | Model | Cost Est. |
|------|-------|-----------|
| Transcript → graph (1hr meeting) | GPT-4.1 | ~$0.50-1.00 |
| Canvas summary regeneration | Claude Sonnet | ~$0.05-0.10 |
| Fact dedup (borderline pair) | Gemini Flash | ~$0.001 |
| Zoom-out assessment (full graph) | Opus | ~$0.20-0.50 |
| NL query → graph traversal | Gemini Flash | ~$0.005 |

#### Local Mode (Ollama / oMLX / LM Studio)

| Task | Model | Hardware | Performance |
|------|-------|----------|-------------|
| Transcript → graph (1hr meeting) | Llama 3.3 70B (Ollama) | 48GB+ VRAM | ~30-60s |
| Canvas summary regeneration | Mistral 7B / Mixtral 8x7B | 16GB+ VRAM | ~5-10s |
| Fact dedup (borderline pair) | Phi-3 / Llama 3.2 3B (oMLX) | 4GB+ RAM (Apple Silicon) | ~0.5-1s |
| NL query → graph traversal | Phi-3 / Qwen 2.5 3B | 4GB+ RAM | ~0.5s |
| Zoom-out assessment | **Cloud fallback** (needs deep reasoning) | N/A | — |

Zoom-out assessment requires frontier-level comprehension and doesn't have a viable local option yet. We recommend cloud for this task regardless of mode.

### Provider Abstraction

The backend uses a **provider-agnostic interface** — swap between cloud and local with a config change:

```typescript
interface LLMProvider {
  generate(prompt: string, opts: GenerationOpts): Promise<GenerationResult>;
  generateWithTools(prompt: string, tools: Tool[]): Promise<ToolCallResult>;
  stream(prompt: string, opts: GenerationOpts): AsyncIterable<string>;
}
```

Implementations:
- `OpenRouterProvider` — cloud models via OpenRouter API
- `OllamaProvider` — local models via Ollama REST API
- `MLXProvider` — Apple Silicon native via oMLX
- `LMStudioProvider` — local models via LM Studio server

Config-driven model routing:

```yaml
# inos.config.yaml
llm:
  mode: hybrid  # 'cloud' | 'local' | 'hybrid'
  cloud:
    provider: openrouter
    defaultModel: anthropic/claude-sonnet-4
  local:
    provider: ollama  # or 'omlx', 'lmstudio'
    host: http://localhost:11434
    models:
      transcript: llama3.3:70b
      summary: mixtral:8x7b
      dedup: phi3:3.8b
      query: qwen2.5:3b
  fallback:
    # If local model fails, fall back to cloud
    enabled: true
    provider: openrouter
```

---

## Ecosystem Integration

| System | Integration Method | Package |
|--------|-------------------|---------|
| **Engram** | REST API client (`@heybeaux/engram-client`) | Memory read/write, dream cycle integration |
| **Lattice** | Direct import (`@heybeaux/lattice-core`) | State contracts, circuit breakers, fact validation |
| **Parliament** | REST API + direct import | Deliberation-as-node, transcript ingestion |
| **ACR** | Direct import (`@heybeaux/acr-core`) | Capability resolution for agent nodes |
| **Sonder** | Direct import (`@heybeaux/lattice-core` → adapter) | Node signing, governance verification |
| **Forge** | REST API | Pipeline triggers from canvas actions |

---

## Deployment

| Environment | Target | Notes |
|------------|--------|-------|
| **Development** | Local (`next dev` + local SQLite) | Hot reload, fast iteration. |
| **Staging** | Vercel (frontend) + Fly.io (backend) | Matches Engram deployment pattern. |
| **Production** | Vercel (frontend) + Fly.io (backend + Turso) | Scalable, edge-cached reads. |
| **Self-hosted (enterprise)** | Docker Compose | Full stack in containers. PostgreSQL optional. |
| **Local/Offline** | Desktop app (Tauri or Electron) | Full stack runs locally. SQLite + Ollama/oMLX. Zero cloud dependency. Privacy-first. |

---

## Project Structure

```
inos/
├── apps/
│   ├── web/                    # Next.js 16 frontend
│   │   ├── app/                # App Router
│   │   ├── components/
│   │   │   ├── canvas/         # Main canvas component
│   │   │   │   ├── graph-3d/   # Three.js graph rendering
│   │   │   │   ├── graph-2d/   # 2D fallback
│   │   │   │   └── viewport/   # Camera controls, zoom, pan
│   │   │   ├── nodes/          # Node type components
│   │   │   │   ├── claim-node.tsx
│   │   │   │   ├── decision-node.tsx
│   │   │   │   ├── fact-node.tsx
│   │   │   │   ├── question-node.tsx
│   │   │   │   ├── deliberation-node.tsx
│   │   │   │   └── ...
│   │   │   ├── panels/         # Side panels
│   │   │   │   ├── facts-panel.tsx
│   │   │   │   ├── summary-panel.tsx
│   │   │   │   ├── timeline-panel.tsx
│   │   │   │   └── query-panel.tsx
│   │   │   └── ui/             # Shared UI components
│   │   ├── lib/
│   │   │   ├── yjs/            # Yjs types and provider
│   │   │   ├── api/            # API client
│   │   │   └── store/          # Zustand stores
│   │   └── styles/             # Tailwind, Abyssal theme
│   └── api/                    # Hono backend
│       ├── routes/
│       │   ├── canvases.ts
│       │   ├── nodes.ts
│       │   ├── edges.ts
│       │   ├── ingestion.ts    # Transcript → graph
│       │   ├── summary.ts      # LLM summary generation
│       │   └── query.ts        # Natural language queries
│       ├── lib/
│       │   ├── yjs/            # Yjs persistence
│       │   ├── llm/            # Model routing, prompts
│       │   ├── cascade/        # Fact propagation engine
│       │   └── ecosystem/      # Engram, Lattice, Parliament clients
│       └── middleware/
│           ├── auth.ts
│           ├── validation.ts
│           └── redaction.ts    # Sonder redaction before LLM calls
├── packages/
│   ├── types/                  # Shared TypeScript types (InosNode, etc.)
│   ├── core/                   # Graph engine (cascade, dedup, queries)
│   └── sdk/                    # Client SDK for external integrations
├── package.json
└── pnpm-workspace.yaml
```

---

## Phased Build Plan

### Phase 1: Core Engine (Weeks 1-3)
- Types package with full data model
- Graph engine: node/edge CRUD, cascade algorithm
- Yjs sync server with persistence
- Basic Hono API
- Canvas creation, node creation, edge creation

### Phase 2: Visual Canvas (Weeks 3-5)
- Next.js app with Three.js graph rendering
- Bioluminescent node shaders (Abyssal theme)
- Force-directed 3D layout
- Pan, zoom, focus
- Node detail panel
- Edge visualization with typed relationships

### Phase 3: Collaboration (Weeks 5-6)
- Real-time multi-user sync via Yjs
- Presence indicators (who's online, where they're looking)
- Undo/redo
- Offline support

### Phase 4: Intelligence (Weeks 6-8)
- Transcript ingestion → graph (the "wow" feature)
- Canvas summary generation
- Facts table with dedup
- Natural language queries
- Zoom-out LLM assessment

### Phase 5: Faculty Integration (Weeks 8-10)
- Parliament deliberation as node type
- Lattice state contract integration
- Engram memory linking
- Sonder node signing
- ACR capability context

### Phase 6: Polish & Launch (Weeks 10-12)
- Temporal navigation (time scrubber, delta view)
- Mobile responsive
- Performance optimization (10k+ nodes)
- Accessibility audit
- Demo landing page

---

## Open Questions

1. **Turso vs. local SQLite** — start with local SQLite (zero cost, fast dev) and migrate to Turso later? Or start with Turso for the edge-read benefits?
2. **Monorepo or separate repos?** — apps/web + apps/api + packages/* in one repo (like Lattice/Parliament), or separate repos per app?
3. **Graph rendering: custom Three.js or react-force-graph?** — react-force-graph is faster to ship but less control over the bioluminescent aesthetic. Custom Three.js with drei gives us full visual control but takes longer.
4. **Yjs persistence: y-sqlite or custom?** — y-sqlite is simple but we lose the ability to query nodes/edges independently. Custom persistence (serialize Yjs to our schema) gives us SQLite FTS + cascade queries but adds complexity.

---

*Last updated: 2026-05-16, Cirrus ☁️*
