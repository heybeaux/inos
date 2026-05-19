# Inos — Deep

Loaded when designing in or debugging Inos. Token budget ~2500.

## What "4D reasoning graph" means

Three spatial-ish axes for the structure of thought, one temporal:
- **Nodes** — propositions, claims, questions, artifacts.
- **Edges** — supports / contradicts / refines / depends-on / branches-from.
- **Branches** — parallel lines of thinking that may merge, prune, or be arbitrated.
- **Time** — every node and edge has revision history; you can scrub the graph.

"4D" is the user-facing framing; structurally it's a versioned, branchable knowledge graph with an agent loop participating in-graph rather than chat-adjacent.

## The solo-first beachhead

The wedge is a *single person* doing serious thinking with agents as graph participants. This is not a strategic accident — it's an intentional choice locked 2026-05-16:

- Fixtures, demos, and prompt design should bias **solo-thinker transcripts**.
- Multiplayer (Yjs / CRDT) is on the future-feature list but is *not* the strategic fork — don't redesign the graph model to accommodate it at v1.
- The reason: a solo user with agents already exercises every hard part of the system (state, governance, memory, deliberation). Multiplayer adds coordination overhead without proving the core value.

## Faculty wiring (load-bearing for v1)

Inos is the first faculty where Sonder/Parliament/Lattice/Engram stop being infra and become the product. They run **in-process**:

- **Sonder** — runtime + event bus. Every graph mutation goes through a Sonder envelope. `createRuntime()` is called once at app boot; emits flow through ed25519-signed `SonderEventV2`.
- **Parliament** — invoked when a node has contested edits or when the user explicitly asks for multi-agent deliberation on a branch. Results persist to Parliament's SQLite (memory: `parliament-results-durable-in-sqlite.md`).
- **Lattice** — pre-emit checkGate hook on agent writes. Policy lives in Lattice; mechanism lives in Sonder (memory: `ginnung-fencing-architecture.md`).
- **Engram** — *local* instance, primarily for **dedup** against existing graph nodes. Not the canonical store. Use the local running tree (memory: `engram-running-tree.md`).

This wiring is *the wedge*, not a Phase-5 wishlist (memory: `inos-ginnung-faculty-wiring.md`). Trimming any of these from v1 turns Inos back into "yet another graph editor."

## Agent-in-graph participation

Agents don't sit beside the graph in a chat panel; they post nodes and edges *into* the graph as first-class citizens. Implications:

- Agent contributions are signed Sonder events — auditable, governable, revertible.
- Lattice gates apply to agent writes, not user writes.
- Parliament can be invoked to arbitrate when an agent's proposed node conflicts with the user's framing.

## Phasing

- **v1 (current):** solo-thinker, in-process faculties, master branch active.
- **v1.5:** richer Parliament-on-branch integration; better revision scrubbing.
- **future (no commitment):** Yjs multiplayer, faculty installer wiring (memory: `ginnung-faculty-installer-idea.md`).

## Boundaries

- Inos **is** a faculty product — a thinking surface a user sits down and uses.
- Inos **does not** own runtime mechanics (Sonder), gate policy (Lattice), or reasoning protocols (Parliament). It composes them.
- Inos **does not** add a direct-input chat / query / write box in cockpit (memory: `ginnung-input-framing.md`) — that's a Ginnung-cockpit framing decision, not an Inos one, but it propagates.

## Default branch reminder

`master`, not `main`. The repo predates the rename convention. PR scripts and CI assumptions that default to `main` will silently miss. (See also memory: `feedback_main_branch_terminology.md` — voice-to-text quirks compound this.)
