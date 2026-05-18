'use client';

import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function FactsPanel() {
  const { factsTable, activePanel, setActivePanel } = useGraphStore();

  const facts = factsTable ? Object.values(factsTable.facts) : [];

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-12 sm:top-14 right-0 bottom-0 w-full sm:w-96 z-20 overflow-y-auto p-4"
      style={{ background: 'rgba(10, 10, 26, 0.95)', borderLeft: '1px solid var(--surface-glass-border)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-green)' }}>
          Facts Table
        </h2>
        <button
          onClick={() => setActivePanel('none')}
          className="text-xl cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {factsTable && (
        <div className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Last rebuilt: {new Date(factsTable.lastRebuiltAt).toLocaleString()}
        </div>
      )}

      {facts.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No facts registered in this canvas yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {facts.map((fact) => {
            const stalenessColor = fact.staleness === 'disputed' ? '#f15bb5'
              : fact.staleness === 'stale' ? '#ff9f1c'
              : '#00ff87';
            const valueStr = Array.isArray(fact.value) ? fact.value.join(', ')
              : `${fact.value} ${fact.unit ?? ''}`;

            return (
              <Card key={fact.key} className="cursor-pointer hover:border-[var(--bio-green)] transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {fact.label}
                  </h4>
                  <Badge label={fact.staleness} color={stalenessColor} />
                </div>
                <p className="text-sm font-mono" style={{ color: 'var(--bio-cyan)' }}>
                  {valueStr}
                </p>
                {fact.conflicts && fact.conflicts.length > 0 && (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fact.conflicts.length} conflicting sources
                  </div>
                )}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {fact.sources.map((s) => (
                    <Badge key={s} label={s} color="var(--text-muted)" />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
