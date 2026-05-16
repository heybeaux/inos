# Inosculate — Thinking Together

> *"Don't just think with AI. Think **with** it."*

**Origin:** 2026-05-16, Beaux Walton + Cirrus ☁️  
**Ecosystem:** Ginnung (heybeaux)  
**Status:** Marinating — living document

---

## The Itch

Pax put it best:

> *"The world needs better tools for thinking together — not just chat, but structured ways for people (and agents) to reason through hard problems collaboratively without losing the thread."*

The gap between *"we talked about it"* and *"we actually understood each other"* is enormous and mostly unsolved.

Chat collapses thinking into a flat timeline. Branching possibilities are lost in scroll. Decisions lose their rationale. Disagreements get resolved and forgotten — you can see *what* was decided but not *why* or *what was rejected*. The thinking fossilizes into a transcript.

**Inos** fixes that by making reasoning itself the canvas — not the conversation about reasoning.

---

## What It Is

Inos is a **4D reasoning graph** — a living, visual canvas where humans and AI agents think together collaboratively, with full traceability, temporal awareness, and fact propagation.

Every node is a thought. Every edge is a relationship. Time is a first-class dimension. Facts cascade. Nothing is ever lost.

### The Four Dimensions

| Dimension | What It Captures |
|-----------|-----------------|
| **Structure** | Nodes (claims, questions, decisions, evidence) connected by typed edges (supports, challenges, refines, diverges, merges) |
| **Branching** | Multiple paths from any node — A splits to B and F, B leads to C, F leads to Z, and you can create F→C that synthesizes both |
| **Cross-links** | Nodes can borrow from or reference other nodes across branches — not a tree, a true graph |
| **Temporal** | Every visit, update, and context shift is recorded. The graph as it was last Tuesday vs. today. Staleness, decay, and revival are visible |

### The Core Insight

Chat is linear. Whiteboards are flat. Mind maps are trees. **Real thinking is a directed acyclic graph that evolves over time.**

Inos makes that graph first-class, interactive, and alive.

---

## The Living Canvas

Inos doesn't just display a graph — it **breathes**. The visual language encodes the health, relevance, and state of thinking.

### Growth & Decay

| State | Visual | Meaning |
|-------|--------|---------|
| **Fresh** | Pulsing glow | Active discussion, recent activity, energy |
| **Mature** | Settled, solid | Resolved decision, stable foundation, trusted |
| **Dormant** | Faded, translucent | Not active but preserved. Can be revisited. |
| **Negated** | Greyed, strikethrough | Foundational assumption collapsed. Still visible — you can see *why* a path died. |
| **Orphaned** | Disconnected, dim | Was valid but its parent assumption is gone. Not deleted — it's historical reasoning. |
| **Updated** | Highlighted, refreshed | Fact changed, cascade triggered, node recalculated |

### Fact Propagation & Cascade

This is what separates Inos from a whiteboard. Facts are first-class citizens with dependencies.

**Scenario:** A node states "API rate limit: 100/min." Three branches cite this fact:
- **Node B** calculates cost based on 100/min → limit changes to 1000/min → Node B **updates** (still valid, just recalculated)
- **Node F** says "batch processing impossible at 100/min" → **negated** (constraint removed, path now viable, glows green)
- **Node Z** was built because batching was impossible → **orphaned** (foundational assumption collapsed, turns grey, flagged stale)

You don't read a changelog. You **watch the reasoning respond to new information.**

### Temporal Navigation

- **Time scrubber** — slide through the canvas history. See the graph as it was on any date.
- **Delta view** — compare two temporal slices. New nodes, negated nodes, shifted branches — all highlighted.
- **Revisitation context** — when you return to a node after days, the canvas surfaces what changed since your last visit.

---

## Node Types

Every node in the graph has a type that determines its behavior, visual treatment, and interaction model.

| Type | Purpose | Special Behavior |
|------|---------|-----------------|
| **Claim** | A statement or assertion | Can be supported or challenged |
| **Question** | An open inquiry | Prompts responses, never fully resolved |
| **Decision** | A concluded choice | Carries traceable rationale, triggers state contracts |
| **Evidence** | Data, facts, references | Fact propagation source, staleness detection |
| **Branch** | A divergent path from a parent | Can be compared side-by-side with sibling branches |
| **Synthesis** | A merge of multiple branches | Combines aspects of parent paths |
| **Deliberation** | A Parliament run embedded in the graph | Multi-agent debate as a node, output becomes branches |

---

## Edge Types

Edges define the *relationship* between nodes — not just "A leads to B" but "A supports B" or "A challenges B."

| Type | Meaning |
|------|---------|
| **Supports** | This node strengthens or validates the target |
| **Challenges** | This node disputes or questions the target |
| **Refines** | This node adds nuance or detail to the target |
| **Diverges** | This node explores an alternative to the target |
| **Merges** | This node synthesizes multiple sources |
| **Depends On** | This node requires the target's truth |
| **References** | Loose connection — related but not dependent |

---

## The Faculty Integration

Inos is a Ginnung faculty — it plugs into the ecosystem and makes every other faculty accessible through the canvas.

### How Each Faculty Integrates

| Faculty | Role in Inos |
|---------|-------------|
| **Parliament** | Invoked as a node type — structured multi-agent deliberation becomes a graph node with its own sub-branches |
| **Lattice** | State contracts on decision nodes, verification gates on branches, circuit breaker status visible on the canvas |
| **Engram** | Persistent memory for every node. Dream cycle runs dedup across branches. Fact propagation uses episodic recall |
| **ACR** | Capability resolution for agent participants — shows what each AI participant can/can't do in context |
| **Forge** | Pipelines can be triggered from the canvas. A synthesis node can kick off a Forge workflow |

### The Integration Story

```
User creates a question node in Inos
    ↓
User invites AI participants (any model via OpenRouter)
    ↓
ACR resolves context — what capabilities matter for this question
    ↓
Engram pulls relevant memories — "we discussed this before on March 12"
    ↓
Option A: Direct discussion — human + agents add nodes
Option B: Parliament deliberation — structured debate runs, output becomes branches
    ↓
Lattice verification gates validate decisions before they're marked resolved
    ↓
Canvas evolves — nodes grow, mature, decay, or cascade
    ↓
Everything persists to Engram. The graph remembers.
```

---

## Positioning Within Ginnung

```
ACR          → what agents CAN do
AWM          → what agents WILL do
Parliament   → whether they SHOULD do it
Engram       → what agents DID
Forge        → how it all flows
Lattice      → how they coordinate
Inosculate   → how humans and agents THINK TOGETHER
```

Inos is the **interface layer** — the thing that makes the entire Ginnung stack navigable by humans who don't want to read debate transcripts or JSON state contracts. It's the canvas where everything comes together.

### Relationship to Parliament

Parliament and Inos are complementary but fundamentally different:

| | Parliament | Inos |
|---|-----------|------|
| **Primary users** | AI agents | Humans + AI agents |
| **Process** | Structured debate until consensus | Open-ended reasoning graph |
| **Output** | Decision + transcript | Living graph that evolves |
| **Time model** | Single session, linear | Persistent, 4D, revisitable |
| **Positioning** | "Think before you act" | "Think together" |

Parliament runs *inside* Inos as a node type. Inos sits above it in the stack.

---

## Name

**Inosculate** — to unite by growth; in biology, when two separate vascular systems connect and become one living thing.

Human reasoning + AI reasoning, grafted together. They don't just communicate — they grow together.

**Nickname:** Inos  
**Tagline:** *"Don't just think with AI. Think **with** it."*  
**Alt tagline:** *"Where human and machine reasoning grow together."*

### Mythological Consistency (Ginnung ecosystem)

| Name | Origin | Meaning |
|------|--------|---------|
| **Ginnung** | Ginnungagap (Norse) | The primordial void — the canvas before creation |
| **Lattice** | English | Structure, framework, coordination |
| **Sonder** | German (via Dictionary of Obscure Sorrows) | Realization that others have lives as vivid as yours |
| **Parliament** | English (from parler, "to speak") | A gathering for debate |
| **Inosculate** | Latin (inosculor, "to kiss") | Two systems uniting by growth |

The naming holds.

---

## Open Questions (To Marinate On)

### Data Model
1. How do we represent node content? Free text? Structured? Both?
2. What's the canonical form of the graph? JSON? Custom format?
3. How do we handle concurrent edits? CRDTs? Operational transforms?

### UX
4. Force-directed graph vs. tree view vs. something new?
5. How do you navigate a graph with 10,000 nodes? Progressive zoom?
6. Mobile experience — can you think together on a phone?
7. How does side-by-side branch comparison feel?

### Technical
8. What's the persistence layer? SQLite? PostgreSQL? LibSQL?
9. Real-time collaboration — WebSockets? CRDTs like Yjs?
10. How do we render the graph efficiently? Canvas? SVG? WebGL/Three.js (bioluminescent, per Abyssal design language)?
11. API surface — REST? GraphQL? Subscriptions?

### Faculty Integration
12. How does Parliament output become graph nodes automatically?
13. Can Lattice circuit breakers visually "block" a branch on the canvas?
14. Does Engram's dream cycle generate "insight" nodes that surface patterns?

### Product
15. Open source or proprietary?
16. First demo — what's the 5-minute "wow" experience?
17. Who's the beachhead user? Individual thinkers? Teams? Agent builders?

---

## Status

**Phase:** Marinating — early ideation, no code yet.  
**Next:** Continue refining the shape. Build consensus around the data model and core UX metaphor.  
**Then:** Prototype the graph engine + a minimal canvas.

---

*Last updated: 2026-05-16, Cirrus ☁️*
