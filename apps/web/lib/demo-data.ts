/**
 * Demo data generator for Inos — comprehensive reasoning graph.
 * Scenario: "Should we migrate from self-hosted PostgreSQL to Supabase?"
 */

import type {
  InosGraph,
  InosNode,
  InosEdge,
  Canvas,
  CanvasSummary,
  FactsTable,
  NodeAuthor,
} from '@heybeaux/inos-types';

// ── Authors ──────────────────────────────────────────────────────────────

const beaux: NodeAuthor = { type: 'human', userId: 'beaux', displayName: 'Beaux' };
const deanna: NodeAuthor = { type: 'human', userId: 'deanna', displayName: 'Deanna' };
const trevan: NodeAuthor = { type: 'human', userId: 'trevan', displayName: 'Trevan' };
const agentOps: NodeAuthor = { type: 'agent', agentId: 'cloud-ops', model: 'anthropic/claude-opus-4-6' };
const agentFinance: NodeAuthor = { type: 'agent', agentId: 'fin-analyst', model: 'openrouter/google/gemini-2.5-pro' };
const system: NodeAuthor = { type: 'system', source: 'demo-seed' };

// ── Timestamps (spread over ~2 weeks, May 2–16, 2026) ────────────────────

const t = (day: number, hour: number, min: number) =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`;

const schemaV = '1.0.0';
const canvasId = 'canvas-supabase-migration-eval';

// ── Helpers ──────────────────────────────────────────────────────────────

function n(
  id: string,
  type: InosNode['type'],
  title: string,
  content: InosNode['content'],
  author: NodeAuthor,
  created: string,
  deps: string[] = [],
  tags: string[] = [],
  status: InosNode['status'] = 'fresh',
  stalenessState: StalenessInfoState = 'fresh',
): InosNode {
  return {
    id,
    type,
    title,
    content,
    author,
    createdAt: created,
    updatedAt: created,
    visits: [],
    dependsOn: deps,
    staleness: {
      state: stalenessState,
      evaluatedAt: created,
      cascadeDepth: 0,
    },
    canvasId,
    status,
    tags,
    schemaVersion: schemaV,
  };
}

type StalenessInfoState = 'fresh' | 'stale' | 'negated' | 'orphaned';

function e(
  id: string,
  type: InosEdge['type'],
  sourceId: string,
  targetId: string,
  author: NodeAuthor,
  created: string,
  label?: string,
  mergeMap?: InosEdge['mergeMap'],
): InosEdge {
  return {
    id,
    type,
    sourceId,
    targetId,
    label,
    createdAt: created,
    author,
    mergeMap,
    canvasId,
    schemaVersion: schemaV,
  };
}

// ── Nodes ────────────────────────────────────────────────────────────────

const NODES: InosNode[] = [
  // ═══════════════════════════════════════════════
  // ROOT QUESTION
  // ═══════════════════════════════════════════════
  n(
    'question-root-migrate',
    'question',
    'Migrate to Supabase?',
    'Should we migrate our self-hosted PostgreSQL infrastructure to Supabase managed hosting? This decision impacts cost, reliability, team capacity, and data sovereignty.',
    beaux,
    t(2, 9, 0),
    [],
    ['migration', 'infrastructure', 'strategy'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // BRANCH 1 — Full Migration (aggressive, cost-focused)
  // ═══════════════════════════════════════════════

  n(
    'branch-full-migration',
    'branch',
    'Full Migration',
    'Aggressive approach: migrate everything to Supabase in one project. Focus on cost savings and operational simplicity.',
    beaux,
    t(2, 10, 0),
    ['question-root-migrate'],
    ['branch', 'migration'],
    'fresh',
  ),

  n(
    'claim-migrate-cost-savings',
    'claim',
    'Save $1,800/mo',
    'Full migration to Supabase Pro tier would reduce monthly database costs from ~$2,400 to ~$600 — a $1,800/mo saving. Supabase handles backups, patching, and monitoring included.',
    agentFinance,
    t(3, 14, 0),
    ['branch-full-migration'],
    ['cost', 'claim'],
    'fresh',
  ),

  n(
    'fact-current-hosting-cost',
    'fact',
    'Current hosting cost',
    { value: 2400, unit: 'USD/month', verifiedAt: t(2, 8, 0) },
    agentFinance,
    t(2, 8, 0),
    ['branch-full-migration'],
    ['cost', 'fact', 'verified'],
    'mature',
  ),

  n(
    'claim-supabase-auto-backups',
    'claim',
    'Supabase handles backups',
    'Supabase provides automated daily backups with 7-day retention (Pro tier) and point-in-time recovery. Eliminates our custom backup scripts and cron jobs.',
    agentOps,
    t(3, 15, 30),
    ['branch-full-migration'],
    ['operations', 'claim'],
    'fresh',
  ),

  n(
    'fact-supabase-pricing',
    'fact',
    'Supabase Pro pricing',
    { value: 25, unit: 'USD/project/month', verifiedAt: t(3, 12, 0) },
    agentOps,
    t(3, 12, 0),
    ['branch-full-migration'],
    ['cost', 'fact', 'verified'],
    'fresh',
  ),

  n(
    'evidence-supabase-pricing-page',
    'evidence',
    'Supabase pricing page',
    { source: 'supabase.com', excerpt: 'Pro plan: $25/month per project. Includes 8GB DB, daily backups, PITR.', url: 'https://supabase.com/pricing' },
    agentOps,
    t(3, 12, 30),
    ['fact-supabase-pricing'],
    ['evidence', 'pricing'],
    'fresh',
  ),

  n(
    'claim-one-weekend-migration',
    'claim',
    'One weekend migration',
    'With pg_dump/pg_restore and logical replication, we can complete the full migration in a single weekend with minimal downtime (< 2 hours).',
    trevan,
    t(5, 10, 0),
    ['branch-full-migration'],
    ['migration', 'claim', 'timeline'],
    'fresh',
  ),

  n(
    'fact-migration-downtime-src1',
    'fact',
    'Migration downtime (Trevan)',
    { value: 2, unit: 'hours', verifiedAt: t(5, 10, 30) },
    trevan,
    t(5, 10, 30),
    ['claim-one-weekend-migration'],
    ['fact', 'timeline', 'disputed'],
    'stale',
  ),

  n(
    'decision-commit-full-migration',
    'decision',
    'Commit to Q3 migration',
    'After cost analysis, we commit to full Supabase migration by end of Q3 2026. Budget allocated: $5,000 for migration tooling and testing.',
    beaux,
    t(8, 16, 0),
    ['claim-migrate-cost-savings', 'claim-supabase-auto-backups'],
    ['decision', 'migration', 'timeline'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // BRANCH 2 — Hybrid Approach (gradual, risk-averse)
  // ═══════════════════════════════════════════════

  n(
    'branch-hybrid',
    'branch',
    'Hybrid Approach',
    'Gradual migration: start with read replicas on Supabase, keep primary self-hosted. Evaluate over 6 months before committing fully.',
    deanna,
    t(4, 9, 0),
    ['question-root-migrate'],
    ['branch', 'hybrid'],
    'fresh',
  ),

  n(
    'claim-hybrid-reduces-risk',
    'claim',
    'Hybrid reduces risk',
    'Running read replicas on Supabase while keeping the primary self-hosted lets us test performance, reliability, and team workflows before full commitment.',
    deanna,
    t(4, 10, 0),
    ['branch-hybrid'],
    ['risk', 'claim'],
    'fresh',
  ),

  n(
    'claim-read-replicas-sync',
    'claim',
    'Cross-provider replication works',
    'PostgreSQL logical replication supports cross-provider read replicas. We can replicate our self-hosted primary to Supabase with sub-second lag.',
    trevan,
    t(5, 11, 0),
    ['branch-hybrid'],
    ['technical', 'claim'],
    'fresh',
  ),

  n(
    'evidence-pg-replication-docs',
    'evidence',
    'PostgreSQL logical replication docs',
    { source: 'postgresql.org', excerpt: 'Logical replication allows subscribing to changes from a remote publisher across network boundaries.', url: 'https://www.postgresql.org/docs/current/logical-replication.html' },
    trevan,
    t(5, 11, 30),
    ['claim-read-replicas-sync'],
    ['evidence', 'technical'],
    'fresh',
  ),

  n(
    'assumption-connection-pooling',
    'assumption',
    'Connection pooling overhead < 10%',
    'We assume the additional latency from connection pooling across providers will stay under 10%, keeping read query performance acceptable.',
    trevan,
    t(5, 14, 0),
    ['branch-hybrid'],
    ['assumption', 'performance', 'pending'],
    'fresh',
  ),

  n(
    'fact-read-replica-latency',
    'fact',
    'Replication lag measured',
    { value: 45, unit: 'milliseconds', verifiedAt: t(7, 16, 0) },
    trevan,
    t(7, 16, 0),
    ['claim-read-replicas-sync'],
    ['fact', 'performance', 'verified'],
    'fresh',
  ),

  n(
    'decision-hybrid-pilot',
    'decision',
    'Start hybrid pilot',
    'Approved: deploy Supabase read replica for analytics queries only. No write traffic. 6-month evaluation period with monthly reviews.',
    beaux,
    t(8, 14, 0),
    ['claim-hybrid-reduces-risk', 'claim-read-replicas-sync'],
    ['decision', 'hybrid'],
    'fresh',
  ),

  n(
    'fact-hybrid-extra-cost',
    'fact',
    'Hybrid extra infrastructure cost',
    { value: 800, unit: 'USD/month', verifiedAt: t(6, 9, 0) },
    agentFinance,
    t(6, 9, 0),
    ['branch-hybrid'],
    ['cost', 'fact', 'verified'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // BRANCH 3 — Stay Self-Hosted (conservative, control-focused)
  // ═══════════════════════════════════════════════

  n(
    'branch-stay-selfhosted',
    'branch',
    'Stay Self-Hosted',
    'Conservative approach: improve our current self-hosted setup. Full data control, no vendor lock-in, leverage existing DBA expertise.',
    deanna,
    t(4, 11, 0),
    ['question-root-migrate'],
    ['branch', 'self-hosted'],
    'fresh',
  ),

  n(
    'claim-selfhosted-full-control',
    'claim',
    'Self-hosted = full control',
    'Self-hosted PostgreSQL gives us complete control over versions, extensions, tuning parameters, and physical data location. No vendor surprises.',
    deanna,
    t(4, 11, 30),
    ['branch-stay-selfhosted'],
    ['control', 'claim'],
    'fresh',
  ),

  n(
    'fact-team-dba-count',
    'fact',
    'DBA team size',
    { value: 3, unit: 'people', verifiedAt: t(2, 8, 0) },
    deanna,
    t(2, 8, 0),
    ['branch-stay-selfhosted'],
    ['team', 'fact', 'verified'],
    'mature',
  ),

  n(
    'claim-dba-manage-fine',
    'claim',
    'DBAs can handle it',
    'With 3 DBAs on staff, our team has the capacity and expertise to manage self-hosted PostgreSQL long-term. Current uptime: 99.95% over 12 months.',
    deanna,
    t(5, 9, 0),
    ['branch-stay-selfhosted'],
    ['team', 'claim'],
    'fresh',
  ),

  n(
    'assumption-dba-retention',
    'assumption',
    'DBA retention is stable',
    'We assume our 3 DBAs will remain with the company for the next 2+ years. If they leave, self-hosted becomes a significant risk.',
    deanna,
    t(5, 9, 30),
    ['claim-dba-manage-fine'],
    ['assumption', 'risk', 'pending'],
    'fresh',
  ),

  n(
    'assumption-supabase-will-stay-compatible',
    'assumption',
    'Supabase remains Postgres-compatible',
    'We assume Supabase will maintain full PostgreSQL compatibility. If they diverge (unlikely but non-zero), migration back would be painful.',
    agentOps,
    t(6, 10, 0),
    ['branch-full-migration'],
    ['assumption', 'risk', 'vendor-lockin'],
    'fresh',
  ),

  n(
    'negated-assumption-data-sovereignty-ok',
    'assumption',
    'Data sovereignty requirements are met',
    'We initially assumed Supabase\'s AWS US-West region meets our data sovereignty requirements. Compliance review found this is INSUFFICIENT for EU customer data.',
    agentOps,
    t(10, 11, 0),
    ['branch-stay-selfhosted'],
    ['assumption', 'compliance', 'negated'],
    'negated',
    'negated',
  ),

  n(
    'orphaned-compliance-checklist',
    'evidence',
    'EU compliance checklist (obsolete)',
    { source: 'internal', excerpt: 'Checklist for EU data compliance with Supabase AWS US-West — rendered obsolete by compliance review.', url: '' },
    agentOps,
    t(7, 10, 0),
    ['negated-assumption-data-sovereignty-ok'],
    ['compliance', 'orphaned'],
    'orphaned',
    'orphaned',
  ),

  n(
    'evidence-uptime-dashboard',
    'evidence',
    'Current uptime dashboard',
    { source: 'Grafana', excerpt: 'Self-hosted PostgreSQL uptime: 99.95% over rolling 12-month window. 2 unplanned outages, both < 15 minutes.', url: 'https://grafana.internal/d/postgres-uptime' },
    system,
    t(2, 8, 30),
    ['claim-dba-manage-fine'],
    ['evidence', 'reliability'],
    'mature',
  ),

  n(
    'decision-stay-selfhosted-2026',
    'decision',
    'Stay self-hosted through 2026',
    'Decision: maintain self-hosted PostgreSQL through end of 2026. Re-evaluate in Q1 2027 after compliance review and DBA retention assessment.',
    beaux,
    t(10, 16, 0),
    ['claim-selfhosted-full-control', 'claim-dba-manage-fine'],
    ['decision', 'self-hosted', 'timeline'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // CROSS-CUTTING NODES
  // ═══════════════════════════════════════════════

  n(
    'question-migration-risks',
    'question',
    'What are the migration risks?',
    'What are the key risks of migrating to Supabase? Downtime, data loss, performance regression, vendor lock-in, cost overruns, team disruption.',
    beaux,
    t(3, 9, 0),
    ['question-root-migrate'],
    ['risk', 'question'],
    'fresh',
  ),

  n(
    'fact-migration-downtime-src2',
    'fact',
    'Migration downtime (Ops Agent)',
    { value: 6, unit: 'hours', verifiedAt: t(5, 15, 0) },
    agentOps,
    t(5, 15, 0),
    ['question-migration-risks'],
    ['fact', 'timeline', 'disputed'],
    'stale',
  ),

  n(
    'question-sla-impact',
    'question',
    'How does this affect our SLA?',
    'If migration causes downtime or performance issues, how does it impact our 99.9% uptime SLA to customers? What are the financial penalties?',
    deanna,
    t(4, 14, 0),
    ['question-root-migrate'],
    ['sla', 'risk', 'question'],
    'fresh',
  ),

  n(
    'fact-sla-penalty',
    'fact',
    'SLA penalty cost',
    { value: 5000, unit: 'USD/hour', verifiedAt: t(4, 14, 30) },
    agentFinance,
    t(4, 14, 30),
    ['question-sla-impact'],
    ['cost', 'fact', 'sla', 'verified'],
    'fresh',
  ),

  n(
    'claim-supabase-sla',
    'claim',
    'Supabase 99.9% SLA',
    'Supabase Pro tier includes a 99.9% uptime SLA with service credits for violations. However, credits may not cover our contractual penalty exposure.',
    agentOps,
    t(6, 11, 0),
    ['question-sla-impact'],
    ['sla', 'claim'],
    'fresh',
  ),

  n(
    'claim-supabase-extensions-limited',
    'claim',
    'Limited extension support',
    'Supabase does not support all PostgreSQL extensions we currently use: pg_cron (we use custom cron jobs), and pg_partman (for table partitioning). This may require architecture changes.',
    trevan,
    t(7, 10, 0),
    ['question-migration-risks'],
    ['technical', 'claim', 'risk'],
    'fresh',
  ),

  n(
    'fact-pg-extension-list',
    'fact',
    'Extensions we use',
    { value: ['pg_cron', 'pg_partman', 'pg_stat_statements', 'postgis', 'uuid-ossp'], unit: null as unknown as undefined, verifiedAt: t(7, 9, 0) },
    trevan,
    t(7, 9, 0),
    ['claim-supabase-extensions-limited'],
    ['fact', 'technical', 'verified'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // SYNTHESIS NODE (merges Branch 1 + Branch 2)
  // ═══════════════════════════════════════════════

  n(
    'synthesis-migration-strategy',
    'synthesis',
    'Migration strategy synthesis',
    'Synthesizing full migration and hybrid approaches: recommend a phased migration — start with the hybrid pilot (Branch 2), validate for 90 days, then proceed to full migration (Branch 1) if metrics confirm. This balances cost savings with risk mitigation. Estimated total timeline: 9 months, total cost: $8,400 (migration tooling + 3 months hybrid overhead vs. $1,800/mo × 9 months savings = net positive).',
    agentOps,
    t(12, 10, 0),
    ['branch-full-migration', 'branch-hybrid'],
    ['synthesis', 'strategy'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // DELIBERATION NODE (Parliament debate)
  // ═════════════════──────────────────────────────

  n(
    'deliberation-migration-parliament',
    'deliberation',
    'Migration Parliament',
    { parliamentId: 'parl-supabase-migration-001', topic: 'Should we migrate to Supabase?', preset: 'adversarial-collaboration' },
    system,
    t(14, 14, 0),
    ['question-root-migrate'],
    ['deliberation', 'parliament'],
    'fresh',
  ),

  n(
    'turn-pro-migration',
    'claim',
    'Turn: Pro-migration arguments',
    'Strong financial case: $1,800/mo savings, automated operations, eliminates single points of failure (DBA bus factor = 3). Supabase\'s managed service reduces operational toil by an estimated 60%. The hybrid pilot provides a safety net.',
    agentFinance,
    t(14, 14, 10),
    ['deliberation-migration-parliament'],
    ['parliament', 'turn', 'pro'],
    'fresh',
  ),

  n(
    'turn-con-migration',
    'claim',
    'Turn: Anti-migration arguments',
    'Significant risks: EU data sovereignty non-compliant with Supabase US-West, migration downtime disputed (2h vs 6h estimates), SLA penalty exposure of $5k/hr. We lose control over PostgreSQL version timing and extension availability. DBA team morale impact.',
    deanna,
    t(14, 14, 20),
    ['deliberation-migration-parliament'],
    ['parliament', 'turn', 'con'],
    'fresh',
  ),

  n(
    'turn-moderator-synthesis',
    'insight',
    'Moderator synthesis',
    'Both sides present valid concerns. The phased approach (hybrid pilot → full migration) addresses the primary risk concerns. However, EU data sovereignty must be resolved before any migration of customer data. Recommendation: proceed with pilot on non-EU data only.',
    agentOps,
    t(14, 14, 30),
    ['deliberation-migration-parliament'],
    ['parliament', 'turn', 'synthesis'],
    'fresh',
  ),

  n(
    'decision-phased-pilot-approved',
    'decision',
    'Phased pilot approved',
    'Parliament consensus: proceed with 90-day hybrid pilot using Supabase for non-EU analytics data only. EU data remains self-hosted pending sovereignty review. Go/no-go for full migration at day 90 based on pilot metrics.',
    beaux,
    t(14, 15, 0),
    ['deliberation-migration-parliament', 'synthesis-migration-strategy'],
    ['decision', 'parliament', 'strategy'],
    'fresh',
  ),

  // ═══════════════════════════════════════════════
  // ADDITIONAL EVIDENCE & SUPPORTING FACTS
  // ═══════════════════════════════════════════════

  n(
    'fact-supabase-uptime',
    'fact',
    'Supabase historical uptime',
    { value: 99.95, unit: '% (12-month rolling)', verifiedAt: t(8, 10, 0) },
    agentOps,
    t(8, 10, 0),
    ['claim-supabase-sla'],
    ['fact', 'reliability', 'verified'],
    'fresh',
  ),

  n(
    'evidence-supabase-status-page',
    'evidence',
    'Supabase status page',
    { source: 'status.supabase.com', excerpt: 'All systems operational. Historical uptime: 99.95% over past 12 months. Last incident: 2026-03-12 (resolved, 45 min).', url: 'https://status.supabase.com' },
    agentOps,
    t(8, 10, 30),
    ['fact-supabase-uptime'],
    ['evidence', 'reliability'],
    'fresh',
  ),

  n(
    'claim-dba-bus-factor',
    'claim',
    'DBA bus factor is 3',
    'We have 3 DBAs who can manage our self-hosted infrastructure. If 2 leave, we\'d be in trouble. Managed service reduces this risk significantly.',
    deanna,
    t(9, 11, 0),
    ['question-migration-risks'],
    ['risk', 'team', 'claim'],
    'fresh',
  ),

  n(
    'fact-team-growth-plan',
    'fact',
    'Engineering hiring plan',
    { value: '2 backend engineers + 1 DBA in Q4 2026', unit: null as unknown as undefined, verifiedAt: t(9, 9, 0) },
    deanna,
    t(9, 9, 0),
    ['claim-dba-bus-factor'],
    ['team', 'fact', 'verified'],
    'fresh',
  ),

  n(
    'question-migration-tools',
    'question',
    'What migration tools should we use?',
    'For full migration: pg_dump/pg_restore vs. logical replication vs. specialized tools like pglogical or Debezium? Each has different downtime characteristics and complexity.',
    trevan,
    t(6, 14, 0),
    ['question-migration-risks'],
    ['technical', 'question'],
    'fresh',
  ),

  n(
    'question-vendor-lockin-mitigation',
    'question',
    'How do we mitigate vendor lock-in?',
    'If we move to Supabase and later need to leave, what is the exit strategy? Can we export data cleanly? Are there abstraction layers we should build now?',
    deanna,
    t(9, 15, 0),
    ['question-migration-risks'],
    ['vendor-lockin', 'question', 'strategy'],
    'fresh',
  ),

  n(
    'claim-logical-replication-best',
    'claim',
    'Logical replication is the best approach',
    'PostgreSQL logical replication offers the lowest downtime path. We can run the replica in parallel, cutover with < 2h downtime, and roll back if needed.',
    trevan,
    t(6, 15, 0),
    ['question-migration-tools'],
    ['technical', 'claim'],
    'fresh',
  ),

  n(
    'evidence-migration-case-study',
    'evidence',
    'GitHub migration case study',
    { source: 'github.blog', excerpt: 'How GitHub migrated 1M+ PostgreSQL databases with zero downtime using logical replication and custom tooling.', url: 'https://github.blog/engineering/postgresql-migration' },
    trevan,
    t(7, 14, 0),
    ['claim-logical-replication-best'],
    ['evidence', 'technical'],
    'fresh',
  ),
];

// ── Edges ────────────────────────────────────────────────────────────────

const EDGES: InosEdge[] = [
  // Root → branches
  e('edge-root→branch1', 'diverges', 'branch-full-migration', 'question-root-migrate', beaux, t(2, 10, 0), 'explores full migration'),
  e('edge-root→branch2', 'diverges', 'branch-hybrid', 'question-root-migrate', deanna, t(4, 9, 0), 'explores hybrid approach'),
  e('edge-root→branch3', 'diverges', 'branch-stay-selfhosted', 'question-root-migrate', deanna, t(4, 11, 0), 'explores staying self-hosted'),

  // Root → cross-cutting questions
  e('edge-root→risk', 'references', 'question-migration-risks', 'question-root-migrate', beaux, t(3, 9, 0), 'what are the risks?'),
  e('edge-root→sla', 'references', 'question-sla-impact', 'question-root-migrate', deanna, t(4, 14, 0), 'SLA implications'),

  // Branch 1: Full Migration edges
  e('edge-b1→cost', 'supports', 'claim-migrate-cost-savings', 'branch-full-migration', agentFinance, t(3, 14, 0), 'cost analysis'),
  e('edge-b1→backups', 'supports', 'claim-supabase-auto-backups', 'branch-full-migration', agentOps, t(3, 15, 30), 'ops benefits'),
  e('edge-b1→timeline', 'supports', 'claim-one-weekend-migration', 'branch-full-migration', trevan, t(5, 10, 0), 'timeline claim'),
  e('edge-cost→fact', 'depends_on', 'claim-migrate-cost-savings', 'fact-current-hosting-cost', agentFinance, t(3, 14, 5), 'needs current cost'),
  e('edge-cost→pricing', 'depends_on', 'claim-migrate-cost-savings', 'fact-supabase-pricing', agentFinance, t(3, 14, 10), 'needs pricing data'),
  e('edge-pricing→evidence', 'supports', 'evidence-supabase-pricing-page', 'fact-supabase-pricing', agentOps, t(3, 12, 30), 'pricing source'),
  e('edge-b1→vendor', 'depends_on', 'claim-migrate-cost-savings', 'assumption-supabase-will-stay-compatible', agentOps, t(6, 10, 5), 'vendor stability'),
  e('edge-decision→cost', 'depends_on', 'decision-commit-full-migration', 'claim-migrate-cost-savings', beaux, t(8, 16, 5), 'cost basis'),
  e('edge-decision→backups', 'depends_on', 'decision-commit-full-migration', 'claim-supabase-auto-backups', beaux, t(8, 16, 10), 'ops basis'),
  e('edge-timeline→downtime-src1', 'supports', 'fact-migration-downtime-src1', 'claim-one-weekend-migration', trevan, t(5, 10, 30), 'downtime estimate'),

  // Branch 2: Hybrid edges
  e('edge-b2→risk', 'supports', 'claim-hybrid-reduces-risk', 'branch-hybrid', deanna, t(4, 10, 0), 'risk reduction'),
  e('edge-b2→replicas', 'supports', 'claim-read-replicas-sync', 'branch-hybrid', trevan, t(5, 11, 0), 'replication claim'),
  e('edge-replicas→evidence', 'supports', 'evidence-pg-replication-docs', 'claim-read-replicas-sync', trevan, t(5, 11, 30), 'replication docs'),
  e('edge-b2→pooling', 'depends_on', 'claim-read-replicas-sync', 'assumption-connection-pooling', trevan, t(5, 14, 5), 'pooling assumption'),
  e('edge-replicas→latency', 'supports', 'fact-read-replica-latency', 'claim-read-replicas-sync', trevan, t(7, 16, 0), 'measured latency'),
  e('edge-b2→extra-cost', 'supports', 'fact-hybrid-extra-cost', 'branch-hybrid', agentFinance, t(6, 9, 0), 'hybrid cost'),
  e('edge-hybrid-decision→risk', 'depends_on', 'decision-hybrid-pilot', 'claim-hybrid-reduces-risk', beaux, t(8, 14, 5), 'risk basis'),
  e('edge-hybrid-decision→replicas', 'depends_on', 'decision-hybrid-pilot', 'claim-read-replicas-sync', beaux, t(8, 14, 10), 'replication basis'),

  // Branch 3: Stay Self-Hosted edges
  e('edge-b3→control', 'supports', 'claim-selfhosted-full-control', 'branch-stay-selfhosted', deanna, t(4, 11, 30), 'control claim'),
  e('edge-b3→team', 'supports', 'fact-team-dba-count', 'branch-stay-selfhosted', deanna, t(2, 8, 0), 'DBA count'),
  e('edge-b3→manage', 'supports', 'claim-dba-manage-fine', 'branch-stay-selfhosted', deanna, t(5, 9, 0), 'capacity claim'),
  e('edge-manage→dba', 'depends_on', 'claim-dba-manage-fine', 'fact-team-dba-count', deanna, t(5, 9, 5), 'needs team size'),
  e('edge-manage→retention', 'depends_on', 'claim-dba-manage-fine', 'assumption-dba-retention', deanna, t(5, 9, 30), 'retention risk'),
  e('edge-manage→uptime', 'supports', 'evidence-uptime-dashboard', 'claim-dba-manage-fine', system, t(2, 8, 30), 'uptime evidence'),
  e('edge-control→sovereignty', 'refines', 'negated-assumption-data-sovereignty-ok', 'claim-selfhosted-full-control', agentOps, t(10, 11, 0), 'sovereignty check'),
  e('edge-sovereignty→orphaned', 'depends_on', 'orphaned-compliance-checklist', 'negated-assumption-data-sovereignty-ok', agentOps, t(7, 10, 0), 'compliance dep'),
  e('edge-selfhosted-decision→control', 'depends_on', 'decision-stay-selfhosted-2026', 'claim-selfhosted-full-control', beaux, t(10, 16, 5), 'control basis'),
  e('edge-selfhosted-decision→manage', 'depends_on', 'decision-stay-selfhosted-2026', 'claim-dba-manage-fine', beaux, t(10, 16, 10), 'capacity basis'),

  // Cross-cutting edges
  e('edge-risks→downtime2', 'supports', 'fact-migration-downtime-src2', 'question-migration-risks', agentOps, t(5, 15, 0), 'Ops downtime estimate'),
  e('edge-sla→penalty', 'depends_on', 'question-sla-impact', 'fact-sla-penalty', agentFinance, t(4, 14, 35), 'penalty basis'),
  e('edge-sla→supabase-sla', 'supports', 'claim-supabase-sla', 'question-sla-impact', agentOps, t(6, 11, 0), 'SLA comparison'),
  e('edge-sla-sla→uptime', 'depends_on', 'claim-supabase-sla', 'fact-supabase-uptime', agentOps, t(8, 10, 5), 'uptime data'),
  e('edge-sla-uptime→status', 'supports', 'evidence-supabase-status-page', 'fact-supabase-uptime', agentOps, t(8, 10, 30), 'status source'),
  e('edge-risks→extensions', 'supports', 'claim-supabase-extensions-limited', 'question-migration-risks', trevan, t(7, 10, 0), 'extension risk'),
  e('edge-extensions→ext-list', 'depends_on', 'claim-supabase-extensions-limited', 'fact-pg-extension-list', trevan, t(7, 9, 5), 'extension inventory'),

  // Downtime dispute (two facts challenge each other)
  e('edge-downtime-dispute', 'challenges', 'fact-migration-downtime-src1', 'fact-migration-downtime-src2', system, t(5, 16, 0), 'conflicting estimates'),

  // Synthesis edges (merges branch 1 + branch 2)
  e('edge-synthesis→b1', 'merges', 'synthesis-migration-strategy', 'branch-full-migration', agentOps, t(12, 10, 0), 'incorporates full migration plan', [{ fromNodeId: 'branch-full-migration', aspects: ['cost savings', 'automation'] }]),
  e('edge-synthesis→b2', 'merges', 'synthesis-migration-strategy', 'branch-hybrid', agentOps, t(12, 10, 5), 'incorporates hybrid safety net', [{ fromNodeId: 'branch-hybrid', aspects: ['risk mitigation', 'phased approach'] }]),

  // Deliberation edges
  e('edge-delib→pro', 'supports', 'turn-pro-migration', 'deliberation-migration-parliament', agentFinance, t(14, 14, 10), 'pro arguments'),
  e('edge-delib→con', 'supports', 'turn-con-migration', 'deliberation-migration-parliament', deanna, t(14, 14, 20), 'con arguments'),
  e('edge-delib→moderator', 'supports', 'turn-moderator-synthesis', 'deliberation-migration-parliament', agentOps, t(14, 14, 30), 'moderator synthesis'),
  e('edge-delib-con→challenge', 'challenges', 'turn-con-migration', 'turn-pro-migration', deanna, t(14, 14, 22), 'counters pro arguments'),
  e('edge-delib→decision', 'depends_on', 'decision-phased-pilot-approved', 'deliberation-migration-parliament', beaux, t(14, 15, 0), 'parliament outcome'),
  e('edge-delib-decision→synth', 'depends_on', 'decision-phased-pilot-approved', 'synthesis-migration-strategy', beaux, t(14, 15, 5), 'synthesis alignment'),

  // Additional edges
  e('edge-risk→busfactor', 'supports', 'claim-dba-bus-factor', 'question-migration-risks', deanna, t(9, 11, 0), 'bus factor risk'),
  e('edge-busfactor→hiring', 'supports', 'fact-team-growth-plan', 'claim-dba-bus-factor', deanna, t(9, 9, 0), 'hiring plan'),
  e('edge-risk→tools', 'references', 'question-migration-tools', 'question-migration-risks', trevan, t(6, 14, 0), 'tool selection'),
  e('edge-risk→lockin', 'references', 'question-vendor-lockin-mitigation', 'question-migration-risks', deanna, t(9, 15, 0), 'exit strategy'),
  e('edge-tools→logical', 'supports', 'claim-logical-replication-best', 'question-migration-tools', trevan, t(6, 15, 0), 'replication approach'),
  e('edge-logical→case-study', 'supports', 'evidence-migration-case-study', 'claim-logical-replication-best', trevan, t(7, 14, 0), 'case study'),
];

// ── Canvas ───────────────────────────────────────────────────────────────

const CANVAS: Canvas = {
  id: canvasId,
  name: 'Supabase Migration Evaluation',
  description:
    'Multi-stakeholder decision canvas evaluating whether to migrate from self-hosted PostgreSQL to Supabase managed hosting. Three branches explored: full migration, hybrid approach, and staying self-hosted.',
  author: beaux,
  createdAt: t(2, 9, 0),
  updatedAt: t(14, 15, 0),
  participants: [beaux, deanna, trevan, agentOps, agentFinance],
  tags: ['migration', 'postgresql', 'supabase', 'infrastructure', 'decision'],
  schemaVersion: schemaV,
};

// ── Canvas Summary ───────────────────────────────────────────────────────

const SUMMARY: CanvasSummary = {
  canvasId,
  name: CANVAS.name,
  description: CANVAS.description,
  createdAt: t(2, 9, 0),
  updatedAt: t(14, 15, 0),
  proseSummary:
    'This canvas explores whether to migrate from self-hosted PostgreSQL to Supabase managed hosting. Three branches have been explored: (1) Full Migration — aggressive, cost-focused path with $1,800/mo projected savings; (2) Hybrid Approach — gradual, risk-averse strategy using read replicas for a 6-month evaluation; (3) Stay Self-Hosted — conservative path leveraging existing DBA expertise and full data control. A synthesis node merges branches 1 and 2, recommending a phased migration: start with the hybrid pilot, validate for 90 days, then proceed to full migration if metrics confirm. Two key assumptions remain unresolved: connection pooling overhead under 10% and DBA team retention stability. A Parliament deliberation reached consensus on a phased pilot approved for non-EU data only, pending resolution of EU data sovereignty concerns.',
  activeBranches: [
    {
      nodeId: 'branch-full-migration',
      title: 'Full Migration',
      nodeCount: 8,
      status: 'merged',
      lastActivityAt: t(12, 10, 0),
      summary: 'Aggressive migration focused on cost savings and operational simplicity. Merged into synthesis.',
    },
    {
      nodeId: 'branch-hybrid',
      title: 'Hybrid Approach',
      nodeCount: 8,
      status: 'active',
      lastActivityAt: t(14, 15, 0),
      summary: 'Gradual migration with read replicas. Currently the active pilot approach. 90-day evaluation underway.',
    },
    {
      nodeId: 'branch-stay-selfhosted',
      title: 'Stay Self-Hosted',
      nodeCount: 7,
      status: 'resolved',
      lastActivityAt: t(10, 16, 0),
      summary: 'Conservative path. Decision made to stay self-hosted through 2026 with Q1 2027 re-evaluation.',
    },
  ],
  primaryBranchId: 'branch-hybrid',
  pendingAssumptions: [
    {
      nodeId: 'assumption-connection-pooling',
      description: 'Connection pooling overhead stays under 10%',
      riskLevel: 'medium',
      dependedOnBy: ['decision-hybrid-pilot'],
    },
    {
      nodeId: 'assumption-dba-retention',
      description: '3 DBAs will remain with the company for 2+ years',
      riskLevel: 'high',
      dependedOnBy: ['claim-dba-manage-fine', 'decision-stay-selfhosted-2026'],
    },
    {
      nodeId: 'assumption-supabase-will-stay-compatible',
      description: 'Supabase maintains full PostgreSQL compatibility',
      riskLevel: 'low',
      dependedOnBy: ['claim-migrate-cost-savings'],
    },
  ],
  recentDecisions: [
    {
      nodeId: 'decision-phased-pilot-approved',
      title: 'Phased pilot approved',
      rationale: 'Parliament consensus: 90-day hybrid pilot for non-EU data, go/no-go at day 90.',
      decidedAt: t(14, 15, 0),
    },
    {
      nodeId: 'decision-stay-selfhosted-2026',
      title: 'Stay self-hosted through 2026',
      rationale: 'Maintain current setup, re-evaluate in Q1 2027 after compliance and retention review.',
      decidedAt: t(10, 16, 0),
    },
    {
      nodeId: 'decision-hybrid-pilot',
      title: 'Start hybrid pilot',
      rationale: 'Deploy Supabase read replica for analytics only, 6-month evaluation with monthly reviews.',
      decidedAt: t(8, 14, 0),
    },
    {
      nodeId: 'decision-commit-full-migration',
      title: 'Commit to Q3 migration',
      rationale: 'Cost analysis supports full migration by end of Q3 2026 with $5k budget.',
      decidedAt: t(8, 16, 0),
    },
  ],
  activeChallenges: [
    {
      targetNodeId: 'fact-migration-downtime-src1',
      challengerNodeId: 'fact-migration-downtime-src2',
      description: 'Migration downtime disputed: Trevan estimates 2 hours, Ops Agent estimates 6 hours.',
      addressed: false,
    },
    {
      targetNodeId: 'turn-pro-migration',
      challengerNodeId: 'turn-con-migration',
      description: 'Pro-migration financial arguments challenged by data sovereignty and SLA penalty concerns.',
      addressed: true,
    },
  ],
  healthMetrics: {
    freshNodes: 29,
    matureNodes: 4,
    staleNodes: 2,
    negatedNodes: 1,
    orphanedNodes: 1,
  },
  participants: [beaux, deanna, trevan, agentOps, agentFinance],
  stats: {
    totalNodes: NODES.length,
    totalEdges: EDGES.length,
    factCount: NODES.filter((n) => n.type === 'fact').length,
    decisionCount: NODES.filter((n) => n.type === 'decision').length,
    questionCount: NODES.filter((n) => n.type === 'question').length,
  },
  lastGeneratedAt: t(14, 15, 30),
};

// ── Facts Table ──────────────────────────────────────────────────────────

const FACTS_TABLE: FactsTable = {
  canvasId,
  facts: {
    current_hosting_cost: {
      key: 'current_hosting_cost',
      label: 'Current Hosting Cost',
      value: 2400,
      unit: 'USD/month',
      staleness: 'current',
      sources: ['fact-current-hosting-cost'],
      dependedOnBy: ['claim-migrate-cost-savings', 'decision-commit-full-migration'],
      updatedAt: t(2, 8, 0),
      updatedBy: agentFinance,
    },
    supabase_pro_pricing: {
      key: 'supabase_pro_pricing',
      label: 'Supabase Pro Pricing',
      value: 25,
      unit: 'USD/project/month',
      staleness: 'current',
      sources: ['fact-supabase-pricing'],
      dependedOnBy: ['claim-migrate-cost-savings'],
      updatedAt: t(3, 12, 0),
      updatedBy: agentOps,
    },
    migration_downtime: {
      key: 'migration_downtime',
      label: 'Migration Downtime',
      value: 2,
      unit: 'hours',
      staleness: 'disputed',
      sources: ['fact-migration-downtime-src1', 'fact-migration-downtime-src2'],
      conflicts: [
        {
          nodeId: 'fact-migration-downtime-src1',
          proposedValue: 2,
          rationale: 'Logical replication cutover, tested in staging.',
        },
        {
          nodeId: 'fact-migration-downtime-src2',
          proposedValue: 6,
          rationale: 'Including data validation, DNS propagation, and rollback buffer.',
        },
      ],
      dependedOnBy: ['claim-one-weekend-migration', 'question-sla-impact', 'decision-commit-full-migration'],
      updatedAt: t(5, 15, 0),
      updatedBy: agentOps,
    },
    dba_team_size: {
      key: 'dba_team_size',
      label: 'DBA Team Size',
      value: 3,
      unit: 'people',
      staleness: 'current',
      sources: ['fact-team-dba-count'],
      dependedOnBy: ['claim-dba-manage-fine', 'claim-dba-bus-factor'],
      updatedAt: t(2, 8, 0),
      updatedBy: deanna,
    },
    replication_lag: {
      key: 'replication_lag',
      label: 'Cross-Provider Replication Lag',
      value: 45,
      unit: 'milliseconds',
      staleness: 'current',
      sources: ['fact-read-replica-latency'],
      dependedOnBy: ['claim-read-replicas-sync', 'decision-hybrid-pilot'],
      updatedAt: t(7, 16, 0),
      updatedBy: trevan,
    },
    sla_penalty_cost: {
      key: 'sla_penalty_cost',
      label: 'SLA Penalty Cost',
      value: 5000,
      unit: 'USD/hour',
      staleness: 'current',
      sources: ['fact-sla-penalty'],
      dependedOnBy: ['question-sla-impact', 'claim-supabase-sla'],
      updatedAt: t(4, 14, 30),
      updatedBy: agentFinance,
    },
    supabase_historical_uptime: {
      key: 'supabase_historical_uptime',
      label: 'Supabase Historical Uptime',
      value: 99.95,
      unit: '% (12-month rolling)',
      staleness: 'current',
      sources: ['fact-supabase-uptime'],
      dependedOnBy: ['claim-supabase-sla'],
      updatedAt: t(8, 10, 0),
      updatedBy: agentOps,
    },
    pg_extensions_used: {
      key: 'pg_extensions_used',
      label: 'PostgreSQL Extensions in Use',
      value: ['pg_cron', 'pg_partman', 'pg_stat_statements', 'postgis', 'uuid-ossp'],
      staleness: 'current',
      sources: ['fact-pg-extension-list'],
      dependedOnBy: ['claim-supabase-extensions-limited'],
      updatedAt: t(7, 9, 0),
      updatedBy: trevan,
    },
    hybrid_extra_cost: {
      key: 'hybrid_extra_cost',
      label: 'Hybrid Infrastructure Overhead',
      value: 800,
      unit: 'USD/month',
      staleness: 'stale',
      sources: ['fact-hybrid-extra-cost'],
      dependedOnBy: ['branch-hybrid'],
      updatedAt: t(6, 9, 0),
      updatedBy: agentFinance,
    },
  },
  lastRebuiltAt: t(14, 15, 30),
};

// ── Fact Registry ────────────────────────────────────────────────────────

const FACT_REGISTRY: Record<string, string[]> = {
  current_hosting_cost: ['fact-current-hosting-cost'],
  supabase_pro_pricing: ['fact-supabase-pricing'],
  migration_downtime: ['fact-migration-downtime-src1', 'fact-migration-downtime-src2'],
  dba_team_size: ['fact-team-dba-count'],
  replication_lag: ['fact-read-replica-latency'],
  sla_penalty_cost: ['fact-sla-penalty'],
  supabase_historical_uptime: ['fact-supabase-uptime'],
  pg_extensions_used: ['fact-pg-extension-list'],
  hybrid_extra_cost: ['fact-hybrid-extra-cost'],
};

// ── Export ───────────────────────────────────────────────────────────────

export function generateDemoGraph(): InosGraph {
  return {
    schemaVersion: schemaV,
    canvas: CANVAS,
    nodes: NODES,
    edges: EDGES,
    temporalIndex: [],
    factRegistry: FACT_REGISTRY,
    summary: SUMMARY,
    factsTable: FACTS_TABLE,
  };
}
