# Inos (Inosculate)

**Purpose:** A 4D reasoning graph — the *thinking surface* where a human and their agents co-construct ideas as nodes, edges, branches, and revisions over time. The first user-facing Ginnung faculty wedge: solo-thinker first, with agent participation in-graph rather than chat-adjacent. Inos is where Sonder/Parliament/Lattice/Engram stop being plumbing and start being something a person sits down and *uses*.
**Repo:** https://github.com/heybeaux/inos
**Default branch:** `master` (not `main` — important when opening PRs)
**Status:** active — v1 wedge build
**Phase:** beachhead build (solo-thinker fixtures); team/Yjs deferred
**Last verified:** 2026-05-18

## Runtime

- **Local path:** /Users/beauxwalton/projects/inos
- **Tech:** TypeScript, Next.js (canvas surface), in-process Sonder runtime
- **Faculties wired in-process (load-bearing for v1, NOT Phase 5):**
  - Sonder — runtime + event bus + envelope signing
  - Parliament — branch-arbitration / multi-agent deliberation on contested nodes
  - Lattice — gate policy on agent writes (pre-emit checkGate hook)
  - Engram — local instance, used primarily for *dedup* against the graph store
- **Persistence:** graph store local; Engram for semantic dedup; Sonder events to local sink

## Dependencies

- **Depends on:** Sonder (runtime), Parliament (reasoning), Lattice (governance), Engram (memory/dedup), ACR (capability faculty)
- **Used by:** Ginnung control plane (Inos appears as a faculty surface)
- **External:** none required at v1; future Yjs for multiplayer

## Key contacts

- **Owner:** @beauxwalton

## Quick gotchas

- **Beachhead is solo, not teams.** Fixtures should bias solo-thinking transcripts. Don't pull design weight toward multi-cursor collaboration at v1 — Yjs is a *future feature*, not a strategic fork. (Memory: `inos-beachhead.md`.)
- **Faculties are in-process, not microservices.** Sonder/Parliament/Lattice/Engram are imported and called directly. Don't reach for HTTP between them unless the faculty in question genuinely runs out-of-process (e.g. a remote Engram). (Memory: `inos-ginnung-faculty-wiring.md`.)
- **Engram is used local for dedup,** not as the canonical graph store. Don't conflate "Engram has it" with "the graph has it" — they answer different questions.
- **Default branch is `master`.** PRs and CI configs that assume `main` will quietly miss.
- **Faculty wiring is the wedge,** not a Phase-5 wishlist. If you're trimming scope, don't trim Sonder/Parliament/Lattice/Engram out of v1 — the wedge *is* the integrated experience.

## Where to learn more

- `deep.md` — graph model, agent-in-graph participation, fixture strategy
- Inos repo README (when published)
- Ginnung faculty arch: heybeaux/ginnung-web
