'use client';

import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function FactsPanel() {
  const { nodes, activePanel, setActivePanel } = useGraphStore();

  const facts = nodes.filter((n) => n.type === 'fact' || n.type === 'evidence');

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

      {facts.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No facts registered in this canvas yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {facts.map((fact) => (
            <Card key={fact.id} className="cursor-pointer hover:border-[var(--bio-green)] transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {fact.title}
                </h4>
                <Badge label={fact.staleness.state} color={fact.staleness.state === 'fresh' ? '#00ff87' : '#ff9f1c'} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {typeof fact.content === 'string'
                  ? fact.content
                  : 'excerpt' in fact.content && fact.content.excerpt
                  ? fact.content.excerpt
                  : ''}
              </p>
              {fact.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {fact.tags.map((tag) => (
                    <Badge key={tag} label={tag} color="var(--text-muted)" />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
