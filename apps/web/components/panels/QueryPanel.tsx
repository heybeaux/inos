'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function QueryPanel() {
  const { activePanel, setActivePanel } = useGraphStore();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    // Placeholder — will wire to API later
    await new Promise((r) => setTimeout(r, 1200));
    setResponse(
      `Based on the current graph, your question about "${query}" touches on ${nodes.length} nodes. The strongest evidence comes from hydrothermal vent discoveries that support the ocean-origin hypothesis.`
    );
    setLoading(false);
  };

  // We need nodes from the store for the placeholder response
  const { nodes } = useGraphStore();

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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-purple)' }}>
          Natural Language Query
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
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Ask questions about the knowledge graph. The AI will traverse nodes and edges to find relevant answers.
        </p>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., What evidence supports the ocean-origin hypothesis?"
          className="w-full p-3 rounded-lg text-sm resize-none focus:outline-none"
          rows={3}
          style={{
            background: 'var(--abyss-deepest)',
            border: '1px solid var(--surface-glass-border)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={handleQuery} disabled={loading || !query.trim()}>
            {loading ? 'Thinking…' : 'Query Graph'}
          </Button>
        </div>
      </Card>

      {response && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--bio-purple)' }}>
              Answer
            </h4>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {response}
            </p>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
