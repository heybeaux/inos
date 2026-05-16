'use client';

import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function SummaryPanel() {
  const { nodes, edges, activePanel, setActivePanel } = useGraphStore();

  const stats = {
    totalNodes: nodes.length,
    claims: nodes.filter((n) => n.type === 'claim').length,
    facts: nodes.filter((n) => n.type === 'fact').length,
    questions: nodes.filter((n) => n.type === 'question').length,
    decisions: nodes.filter((n) => n.type === 'decision').length,
    totalEdges: edges.length,
  };

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-14 right-0 bottom-0 w-96 z-20 overflow-y-auto p-4"
      style={{ background: 'rgba(10, 10, 26, 0.95)', borderLeft: '1px solid var(--surface-glass-border)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-cyan)' }}>
          Canvas Summary
        </h2>
        <button
          onClick={() => setActivePanel('none')}
          className="text-xl cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      <Card className="mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Overview
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          This canvas explores the hypothesis that oceanic environments are the cradle of all life,
          supported by evidence from hydrothermal vents and chemosynthetic ecosystems.
        </p>
      </Card>

      <Card className="mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Statistics
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Total Nodes</span>
            <span style={{ color: 'var(--bio-cyan)' }}>{stats.totalNodes}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Claims</span>
            <Badge label={String(stats.claims)} color="#00f5d4" />
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Facts</span>
            <Badge label={String(stats.facts)} color="#00ff87" />
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Questions</span>
            <Badge label={String(stats.questions)} color="#f15bb5" />
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Decisions</span>
            <Badge label={String(stats.decisions)} color="#7b2ff7" />
          </div>
          <div className="flex justify-between text-sm pt-2 border-t" style={{ borderColor: 'var(--surface-glass-border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Connections</span>
            <span style={{ color: 'var(--bio-cyan)' }}>{stats.totalEdges}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Health
        </h3>
        <div className="flex gap-2 flex-wrap">
          {nodes.filter((n) => n.status === 'fresh').length > 0 && (
            <Badge label={`${nodes.filter((n) => n.status === 'fresh').length} Fresh`} color="#00ff87" />
          )}
          {nodes.filter((n) => n.status === 'stale').length > 0 && (
            <Badge label={`${nodes.filter((n) => n.status === 'stale').length} Stale`} color="#ff9f1c" />
          )}
          {nodes.filter((n) => n.status === 'negated').length > 0 && (
            <Badge label={`${nodes.filter((n) => n.status === 'negated').length} Negated`} color="#ff6b6b" />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
