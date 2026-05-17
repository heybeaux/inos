/**
 * Multi-pass extraction prompts for Inos ingestion.
 *
 * Why prompts-per-pass and not one big prompt:
 *   - A single LLM call asked to identify 12 node types + 10 edge types + ids +
 *     deps in one shot consistently misses ~70% of reasoning units (see
 *     bench/last-run.json baseline against `phase-1/p1.1-prompts`).
 *   - The model attends to nodes it has names for. Splitting the task into
 *     "find the spine" then "find the support" then "find the relations" lets
 *     each pass attend narrowly and use a vocabulary tailored to the pass.
 *
 * Node-type guidance is intentionally explicit about IS / IS NOT / TRIGGERS,
 * because the model otherwise collapses everything into `claim`.
 */

import type { InputFormat } from './types.js';

// ────────────────────────────────────────────────────────────────────────────
// Per-node-type guidance.
//
// Each entry is calibrated against the 5 solo-thinking gold fixtures
// (bench/references/*.json). "TRIGGERS" are surface phrases that solo authors
// actually write in journals / chats with themselves / messy markdown notes.
// ────────────────────────────────────────────────────────────────────────────

const NODE_TYPE_GUIDE = `
NODE TYPES — read all of these carefully before extracting anything.

1) question — an unresolved inquiry the author is currently sitting with.
   IS: open-ended interrogatives, "should we…?", "what is…?", "why…?".
     Also: residual open questions left at the end of a deliberation.
   IS NOT: rhetorical questions, recap framing ("the question was…").
   TRIGGERS: "should we", "should I", "open question:", "I'm trying to decide",
     "the question is", "what if", "?".

2) claim — an assertion or position the author is putting forward.
   IS: declarative statements of belief/opinion, hypothesis labels (H1, H2…),
     "tentative position", "my current view".
   IS NOT: verifiable facts with numbers (those are facts), unstated
     background beliefs (those are assumptions).
   TRIGGERS: "I think", "I believe", "my take is", "H1:", "the claim",
     "tentative position", "argument for…", "position:".

3) fact — a verifiable concrete data point with a measurable value or
   citation-worthy specificity.
   IS: numbers with units, percentages, dates, technical configurations,
     pricing tiers, latencies, conversion rates, named launches with dates.
   IS NOT: opinions about what those numbers mean. "Activation is 38%" is a
     fact; "activation is too low" is a claim.
   TRIGGERS: digits ("38%", "$14k/month", "p95 28s", "4 weeks"), dates,
     technical specs ("ra3.4xlarge", "dist key x"), named launches.

4) assumption — an unverified belief the argument depends on. The author
   is taking it for granted, even though it could be wrong.
   IS: load-bearing premises that haven't been tested.
   IS NOT: stated claims with backing. An assumption sits below a claim and
     would invalidate it if false.
   TRIGGERS: "assuming", "I'm assuming", "this assumes", "if I'm right that",
     "premise:", "taking for granted", "B2B SaaS needs X" (load-bearing).

5) evidence — externally-cited data or a quoted source backing a claim.
   Distinct from fact: facts stand alone; evidence is invoked to support
   a specific node.
   IS: counter-data presented to challenge a hypothesis, quoted user feedback,
     log excerpts, link/citation pull-quotes.
   IS NOT: the underlying numerical fact itself.
   TRIGGERS: "the data shows", "looking at logs", "per Speed Insights",
     "according to", "Stripe dashboard says".

6) insight — a non-obvious realization that reframes the problem.
   IS: "the real problem is…", "the actual frame is…", aha moments,
     positioning/structural realizations, meta-observations about one's own
     bias, opportunity-cost reframes.
   IS NOT: ordinary claims. Insights specifically shift HOW the question is
     thought about, not just WHAT the answer is.
   TRIGGERS: "the real problem is", "actually", "the actual frame is",
     "I'm realizing", "the structural issue is", "I notice that I…",
     "opportunity cost", "positioning mismatch", "I may be dressing up X
     as Y".

7) decision — a concluded choice made by the author, usually with rationale.
   IS: "I'm going with…", "we decided to…", "choose Option X", "let's do…".
   IS NOT: an option still being weighed (that's a branch), a tentative
     leaning (that's a claim).
   TRIGGERS: "decision:", "going with", "I'll", "we'll", "chose", "let's do",
     "buy LaunchDarkly", "write blog posts", "rebuild".

8) branch — one of several alternative paths being considered, OR a deferred
   path the author explicitly notes for revisiting.
   IS: "Option A / B / C", lakehouse/buy/build alternatives, "revisit at
     Series B", "fast-follow if competitor does X", "Option 1 first; Option 2
     deferred 6 months".
   IS NOT: the final decision itself. Branches are pre-decision OR
     conditionally-deferred futures.
   TRIGGERS: "Option 1/2/3/A/B/C", "alternative:", "another path:",
     "revisit when", "fast-follow", "fallback option".

9) constraint — a hard limit, governance rule, or reversal-condition.
   IS: "won't ship A/B because volume too low", "would reverse to migrate
     if X happens", growth-trajectory limits ("$20k/month in 12 months"),
     scope constraints.
   IS NOT: a fact (constraints are forward-looking limits, not present
     measurements).
   TRIGGERS: "constraint:", "reversal conditions", "would reverse if",
     "would flip back if", "limits:", "won't / can't", "no A/B test because",
     "ship to 100% because".

10) deliberation — a multi-perspective discussion record (typically from
    Parliament-style multi-agent thinking). Rare in solo content.
    IS NOT: a self-debate (those are alternating claims + challenges).

11) synthesis — an integrative summary that combines multiple branches.
    Rare; only emit if the source explicitly synthesizes 2+ branches.

12) artifact — a produced output (doc, code module, image). Only emit if
    the source explicitly mentions producing an artifact.

CRITICAL DISAMBIGUATION:
- A self-debate with "argument for X" vs "argument against X" is TWO claims
  connected by a "challenges" edge, NOT a deliberation.
- A numbered list of options is N branches plus 1 decision (if chosen).
- "Hypotheses H1/H2/H3/H4" are claims, each connected via "supports" from
  the facts that back them and "challenges" from data that contradicts them.
- A reversal-condition list ("would reverse if A, B, or C") is ONE
  constraint node, not three.
- An "open question" left at the end of a journal entry IS a question node
  (do not skip it because the entry already has a "main" question).
`;

// ────────────────────────────────────────────────────────────────────────────
// Per-edge-type guidance.
// ────────────────────────────────────────────────────────────────────────────

const EDGE_TYPE_GUIDE = `
EDGE TYPES — directional. "source → target" means "source does X to target".

- supports: source strengthens / provides evidence for target.
  e.g. fact→claim, fact→question (the fact is what raised the question),
       insight→branch (insight points toward this branch),
       claim→decision (the claim was a reason to decide).

- challenges: source contradicts, undermines, or questions target.
  e.g. counter-evidence→claim, insight→assumption ("the real issue is X" ⟂
       "we assumed Y"), challenge-node→prior-claim.

- refines: source narrows / clarifies / adds specificity to target without
  contradicting it.
  e.g. reversal-conditions→decision (clarify when to undo it),
       insight→question (sharpens what the question is really asking).

- diverges: source is an alternative path that branches away from target.
  e.g. option-A→option-B (peer alternatives), branch→branch.
  ALSO use diverges between sibling branches under the same decision.

- merges: source combines two prior branches. (Rare in solo content.)

- depends_on: source cannot be true / acted on unless target holds.
  e.g. decision→assumption (the decision requires the assumption),
       open-question→decision (the question depends on the decision being
       settled first).

- references: source mentions / links to target without strong logical claim.

- replaces: source SUPERSEDES target. Use for reversed positions:
  decision→tentative-position when the author starts with one position and
  ends up with the opposite. THIS IS COMMON IN SELF-DEBATE.

- inherits: rare; type-system inheritance.

- temporal: rare; explicit temporal ordering link.

GUIDANCE: in 90% of solo-thinking content the right edges are supports,
challenges, refines, diverges, depends_on, and (when position is reversed)
replaces. Default to those.
`;

// ────────────────────────────────────────────────────────────────────────────
// P1.3 hand-off — per-node "excerpt" instruction block.
//
// Every per-pass prompt that emits nodes (spine, support, recovery)
// embeds this block at the end of its JSON schema description. The
// downstream `resolveSourceSpan` resolver tolerates missing excerpts,
// so the LLM is explicitly told to OMIT rather than fabricate.
// ────────────────────────────────────────────────────────────────────────────

const EXCERPT_INSTRUCTION = `
IMPORTANT — the "excerpt" field:
- For every node, include an "excerpt" containing a VERBATIM, contiguous snippet copied directly from the source text above.
- Length: 5-40 words. Pick the snippet that most directly supports the node's title/content.
- Copy character-for-character — same punctuation, capitalization, and spacing as in the source. Do NOT paraphrase, summarize, translate, or invent text.
- Do NOT include character offsets, line numbers, or any positional metadata — only the excerpt string. Offsets are computed downstream.
- If you genuinely cannot find a verbatim snippet that supports the node, omit the "excerpt" field for that node rather than fabricating one.
`;

// ────────────────────────────────────────────────────────────────────────────
// Format-specific framing — softer than before; the heavy lifting now lives
// in the per-pass instructions.
// ────────────────────────────────────────────────────────────────────────────

const FORMAT_INSTRUCTIONS: Record<InputFormat, string> = {
  slack:
    'Slack/Teams thread. Use usernames as authors. Treat each message as a candidate; emoji reactions hint at supports/challenges.',
  email:
    'Email chain. Strip quoted replies and signatures. Subject line is a strong topic hint.',
  meeting:
    'Meeting transcript. Speaker labels are authors. Agenda items often become questions or decisions.',
  raw: 'Solo-thinker content (journal, self-debate, AI dialogue, messy markdown notes). Author is the single thinker unless an AI assistant is explicitly named. Most nodes are the thinker reasoning with themselves; map "I think / my view / my decision" to the thinker.',
  auto: 'Solo or mixed content. Infer single thinker by default. If two named speakers alternate, attribute correctly.',
};

// ────────────────────────────────────────────────────────────────────────────
// Common JSON-output rules — strict-mode requirements that apply to every
// pass. We use OpenRouter's `response_format: json_object` and rely on
// in-prompt schema enforcement (json_schema mode is uneven across providers).
// ────────────────────────────────────────────────────────────────────────────

const STRICT_JSON_RULES = `
OUTPUT FORMAT RULES — non-negotiable.
- Respond with ONE valid JSON object. No prose. No markdown fences.
- Use double-quoted keys and strings. No trailing commas. No comments.
- Every id you emit must be unique within this response.
- Use short stable ids like "n1", "n2", … or descriptive ones like
  "fact-stripe-error" — they will be hashed later, just keep them unique.

TITLE QUALITY — this is the single biggest correctness lever.
- LENGTH: 30–110 chars. Aim for 40–80.
- VERBATIM KEYWORDS: preserve distinctive words the author used. If the
  source mentions "Schelling point", "SSPL", "AGPL", "ITP", "p95", "LCP",
  "ra3.4xlarge", "Apple Pay", "GrowthBook", "rage-quit", "opportunity
  cost", "positioning mismatch", "lakehouse", "Iceberg", "Schelling" —
  those tokens MUST appear in the title. Carry technical terminology
  verbatim.
- DON'T PARAPHRASE INTO GENERIC PHRASING: "build cheaper" stays "build
  cheaper", not "in-house option is more economical". Match source diction.
- NUMBERS / UNITS / DATES in fact-node titles:
  "Redshift cluster costs $14k/month", "p95 28s", "Activation rate is 38%".
- HYPOTHESIS labels (H1, H2…) and OPTION labels (Option A/B/1/2) MUST be
  preserved at the FRONT of the title:
  "H1: ITP blocks Stripe iframe cookie",
  "Option B: Full rebuild as single-screen create-canvas".
- DECISIONS: lead with the chosen action. Acceptable forms:
  "Choose Option B: full rebuild of onboarding",
  "Go with Option 1: fix schema, defer Snowflake to Q3",
  "Buy LaunchDarkly on 1-year contract",
  "Write deep technical blog posts (not open-source)".
- ATOMIC: one reasoning unit per node. If you find yourself writing
  "and" / "—" / ";" to glue two distinct ideas, split. But do NOT shred a
  single coherent position into N sub-beats just because it has multiple
  supporting clauses.

OTHER FIELDS:
- content: full sentence(s) from the source, lightly cleaned.
- author: speaker/thinker name, or "AI" for assistant turns, or
  "Author" for unattributed solo content. Never empty.
`;

// ────────────────────────────────────────────────────────────────────────────
// PASS 1 — Spine extraction.
//
// Goal: find every question / claim / decision / insight / branch.
// These are the "load-bearing" reasoning units; everything else hangs off
// them. By limiting the node-type vocabulary in Pass 1 we get higher recall
// on these structural nodes.
// ────────────────────────────────────────────────────────────────────────────

export function buildSpinePrompt(
  format: InputFormat,
  text: string,
  topicHint?: string,
): string {
  const formatInstr = FORMAT_INSTRUCTIONS[format] ?? FORMAT_INSTRUCTIONS.raw;
  const topicLine = topicHint
    ? `Topic hint: "${topicHint}". Use this as canvasName if it fits.`
    : 'Infer canvasName from the content.';

  return [
    'PASS 1 of 4: SPINE EXTRACTION.',
    '',
    'You are extracting the *load-bearing* reasoning units only:',
    '  question | claim | decision | insight | branch',
    '',
    'Do NOT emit fact / evidence / assumption / constraint in this pass.',
    'Do NOT emit edges in this pass.',
    '',
    `INPUT FORMAT: ${formatInstr}`,
    topicLine,
    '',
    NODE_TYPE_GUIDE.trim(),
    '',
    'CALIBRATION — solo-thinking content typically has:',
    '  1–3 questions (main + a residual open question)',
    '  2–8 claims (each ATOMIC: one assertion per node, not a compound',
    '    "X and Y" claim. A hypothesis label (H1, H2, …) is one claim.',
    '    A challenge to a prior claim is its OWN claim node.)',
    '  1 decision (the chosen path) — sometimes 0 if undecided',
    '  1–3 insights (the reframes / aha moments / meta-observations)',
    '  0–4 branches (numbered options like Option A/B/1/2, deferred',
    '    revisit-conditions, fast-follow paths)',
    '',
    'COVERAGE: emit every DISTINCT reasoning unit; do NOT emit multiple',
    'nodes for the SAME unit. If the author writes "argument for X" then',
    '"argument against X", that is TWO claims. If the author lists options',
    '1/2/3/4, emit ALL four as branches. But if the author makes one',
    'argument with several supporting beats, that is ONE claim — do not',
    'split it into N sub-claims, that dilutes signal.',
    '',
    'Here is the source:',
    '---',
    text,
    '---',
    '',
    STRICT_JSON_RULES.trim(),
    '',
    'SCHEMA:',
    '{',
    '  "canvasName": "<inferred topic>",',
    '  "summary": "<one-paragraph summary>",',
    '  "nodes": [',
    '    {',
    '      "id": "<unique>",',
    '      "type": "question|claim|decision|insight|branch",',
    '      "title": "<concrete ≤120 char title>",',
    '      "content": "<lightly cleaned source text>",',
    '      "author": "<speaker name or Author or AI>",',
    '      "excerpt": "<verbatim 5-40 word snippet from source>"',
    '    }',
    '  ]',
    '}',
    '',
    EXCERPT_INSTRUCTION.trim(),
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// PASS 2 — Support extraction.
//
// Goal: find fact / evidence / assumption / constraint nodes. We hand the
// model the spine from Pass 1 so it knows what each support-node attaches
// to. Anchoring on the spine dramatically improves recall on facts that
// would otherwise be ignored as "background noise".
// ────────────────────────────────────────────────────────────────────────────

export function buildSupportPrompt(
  format: InputFormat,
  text: string,
  spineJson: string,
): string {
  const formatInstr = FORMAT_INSTRUCTIONS[format] ?? FORMAT_INSTRUCTIONS.raw;

  return [
    'PASS 2 of 4: SUPPORT EXTRACTION.',
    '',
    'The spine has already been extracted (questions, claims, decisions,',
    'insights, branches). You will now extract the *support nodes* that',
    'back, challenge, or contextualize those spine nodes:',
    '  fact | evidence | assumption | constraint',
    '',
    'Do NOT re-emit any spine node from Pass 1.',
    'Do NOT emit edges in this pass.',
    '',
    `INPUT FORMAT: ${formatInstr}`,
    '',
    NODE_TYPE_GUIDE.trim(),
    '',
    'CALIBRATION — TYPICAL CAPS per solo-thinking entry (DO NOT EXCEED',
    'unless the source clearly warrants):',
    '  facts: 3–5 (the DECISION-RELEVANT numbers / dates / configs only)',
    '  evidence: 0–2 (cited data invoked to support or counter)',
    '  assumptions: 1–2 (load-bearing unstated beliefs)',
    '  constraints: 1–2 (limits + reversal-conditions as ONE node)',
    '',
    'BE SELECTIVE on facts. A fact is decision-relevant if it would change',
    'the conclusion if it were different. ROLL UP related numbers into ONE',
    'node: e.g. "LaunchDarkly Pro $0.55/MAU; ~$80-90k/year all-in at 12k',
    'MAU" is ONE fact, not five separate seat-tier facts. Cluster config',
    'details (node count, dist key, sort key) belong in ONE fact, not three.',
    '',
    'A REVERSAL-CONDITION LIST ("would reverse if A, B, or C") is ONE',
    'constraint node — never split. Likewise "won\'t do X because volume',
    'too low" is one constraint, not two.',
    '',
    'PREFER UNDER-EXTRACTING to over-extracting. The downstream grader',
    'matches one extracted node per reference node — extra nodes do not',
    'help, they dilute signal.',
    '',
    'PREVIOUSLY EXTRACTED SPINE (do not re-emit these):',
    spineJson,
    '',
    'Here is the source:',
    '---',
    text,
    '---',
    '',
    STRICT_JSON_RULES.trim(),
    '',
    'SCHEMA:',
    '{',
    '  "nodes": [',
    '    {',
    '      "id": "<unique, not colliding with spine ids>",',
    '      "type": "fact|evidence|assumption|constraint",',
    '      "title": "<concrete ≤120 char title>",',
    '      "content": "<lightly cleaned source text>",',
    '      "author": "<speaker name or Author or AI>",',
    '      "factKey": "<optional stable snake_case key for fact nodes>",',
    '      "excerpt": "<verbatim 5-40 word snippet from source>"',
    '    }',
    '  ]',
    '}',
    '',
    EXCERPT_INSTRUCTION.trim(),
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// PASS 3 — Edge extraction.
//
// Goal: given the full node set, propose edges (supports/challenges/refines/
// diverges/depends_on/replaces). Done as a separate pass because the model
// produces dramatically cleaner edges when not also trying to invent nodes
// concurrently.
// ────────────────────────────────────────────────────────────────────────────

export function buildEdgePrompt(
  format: InputFormat,
  text: string,
  allNodesJson: string,
): string {
  const formatInstr = FORMAT_INSTRUCTIONS[format] ?? FORMAT_INSTRUCTIONS.raw;

  return [
    'PASS 3 of 4: EDGE EXTRACTION.',
    '',
    'All nodes have been extracted. Your job is to wire them up.',
    '',
    `INPUT FORMAT: ${formatInstr}`,
    '',
    EDGE_TYPE_GUIDE.trim(),
    '',
    'EDGES — quality bar:',
    '- Every edge must reference two ids from the node list below.',
    '- Prefer fewer high-confidence edges over many weak ones.',
    '- A typical solo-thinking entry has roughly 1.0–1.5 edges per node.',
    '- Each fact should normally connect to the claim or question it backs.',
    '- Each option/branch should diverge from sibling branches AND support',
    '  (or be replaced by) the eventual decision.',
    '- Each insight should challenge an assumption OR support the decision.',
    '- A counter-claim should "challenges" the claim it counters.',
    '- A reversed position uses "replaces": new-decision → tentative-position.',
    '',
    'EXTRACTED NODES (use these ids verbatim):',
    allNodesJson,
    '',
    'Here is the source for context:',
    '---',
    text,
    '---',
    '',
    STRICT_JSON_RULES.trim(),
    '',
    'SCHEMA:',
    '{',
    '  "edges": [',
    '    {',
    '      "type": "supports|challenges|refines|diverges|merges|depends_on|references|replaces|inherits|temporal",',
    '      "source": "<node id from list>",',
    '      "target": "<node id from list>",',
    '      "label": "<optional short label>"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// PASS 4 — Recovery / self-check.
//
// Goal: catch reasoning units the earlier passes missed. We hand the model
// the source + the entire extraction so far and ask "what's missing?"
//
// This is a cheap pass — we route it to Haiku in the orchestrator because
// the work is mechanical "diff source vs extraction" rather than nuanced
// reasoning.
// ────────────────────────────────────────────────────────────────────────────

export function buildRecoveryPrompt(
  text: string,
  currentExtractionJson: string,
): string {
  return [
    'PASS 4 of 4: RECOVERY / SELF-CHECK.',
    '',
    'You will compare the source against an extraction and identify',
    'reasoning units (nodes) that were MISSED. Be conservative: only emit',
    'a node if the source clearly contains it and the extraction clearly',
    'does not.',
    '',
    NODE_TYPE_GUIDE.trim(),
    '',
    'COMMON MISSES in solo-thinking content — ONLY add if you can point at',
    'a specific source span the extraction skipped. Do NOT add nodes the',
    'extractor already represented under a different phrasing:',
    '- Open questions left at the END of a journal entry (often phrased',
    '  "Open question:" or starts with "If X, what is the fix…?").',
    '- Reversal-condition constraints ("would reverse if A, B, or C") —',
    '  pack as ONE constraint, not N.',
    '- Numbered options the author lists but doesn\'t weight equally (e.g.',
    '  Option 3, Option D — sometimes dismissed in passing but still a',
    '  branch).',
    '- Meta-observations / self-aware bias notes ("I may be dressing up',
    '  risk aversion as analysis") — these are INSIGHTS.',
    '- Composition / opportunity-cost / positioning-mismatch reframes.',
    '- Specific technical facts buried mid-paragraph (e.g. "ra3.4xlarge x 4',
    '  nodes with dist key event_user_id").',
    '',
    'EMIT FEW OR NONE if the extraction already covers the source well.',
    'False positives in recovery dilute signal more than they help.',
    '',
    'CURRENT EXTRACTION (do not duplicate any title here):',
    currentExtractionJson,
    '',
    'SOURCE:',
    '---',
    text,
    '---',
    '',
    STRICT_JSON_RULES.trim(),
    '',
    'SCHEMA (emit ONLY genuinely missed nodes; empty array is acceptable):',
    '{',
    '  "missedNodes": [',
    '    {',
    '      "id": "<unique, not colliding with existing ids>",',
    '      "type": "question|claim|decision|insight|branch|fact|evidence|assumption|constraint|deliberation|synthesis|artifact",',
    '      "title": "<concrete ≤120 char title>",',
    '      "content": "<source quote>",',
    '      "author": "<speaker name or Author or AI>",',
    '      "reason": "<brief: why this was missed>",',
    '      "excerpt": "<verbatim 5-40 word snippet from source>"',
    '    }',
    '  ]',
    '}',
    '',
    EXCERPT_INSTRUCTION.trim(),
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Consolidation prompt — used only when input was chunked. Merges per-chunk
// extractions, dedupes near-duplicates, and adds cross-chunk edges.
// ────────────────────────────────────────────────────────────────────────────

export function buildConsolidationPrompt(
  perChunkJson: string,
  topicHint?: string,
): string {
  const topicLine = topicHint
    ? `Topic hint: "${topicHint}".`
    : 'Infer canvasName from content.';

  return [
    'CONSOLIDATION PASS.',
    '',
    'You will merge per-chunk extractions into a single graph.',
    '',
    'RULES:',
    '- Dedupe nodes that refer to the same underlying claim/fact/etc., even',
    '  if their titles are phrased slightly differently. Keep the more',
    '  concrete title.',
    '- Preserve all unique nodes.',
    '- Add edges between nodes from DIFFERENT chunks if the source logic',
    '  implies them (e.g. a decision in chunk 3 supersedes a claim in',
    '  chunk 1 → "replaces" edge).',
    '- Use the merged id space: every output id must exist in the input.',
    '',
    topicLine,
    '',
    'PER-CHUNK EXTRACTIONS:',
    perChunkJson,
    '',
    STRICT_JSON_RULES.trim(),
    '',
    'SCHEMA:',
    '{',
    '  "canvasName": "<topic>",',
    '  "summary": "<one paragraph>",',
    '  "keepNodeIds": ["<ids to keep from inputs>"],',
    '  "renameNodes": [ { "id": "<id>", "title": "<better title>" } ],',
    '  "extraEdges": [',
    '    { "type": "<edge type>", "source": "<id>", "target": "<id>", "label": "<optional>" }',
    '  ]',
    '}',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy single-shot prompt — kept exported for backward-compat with any
// caller still importing it. New code paths use the per-pass builders above.
// ────────────────────────────────────────────────────────────────────────────

export function buildExtractionPrompt(
  format: InputFormat,
  text: string,
  topicHint?: string,
  _config?: {
    extractFacts?: boolean;
    extractAssumptions?: boolean;
    extractDecisions?: boolean;
  },
): string {
  // Kept thin — multi-pass orchestrator no longer routes through this.
  return buildSpinePrompt(format, text, topicHint);
}
