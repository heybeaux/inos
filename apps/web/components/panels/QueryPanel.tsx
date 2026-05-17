'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function QueryPanel() {
  const { nodes, edges, activePanel, setActivePanel } = useGraphStore();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relevantNodeIds, setRelevantNodeIds] = useState<string[]>([]);
  const [usedModel, setUsedModel] = useState<string | null>(null);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);
    setError(null);
    setRelevantNodeIds([]);
    setUsedModel(null);

    try {
      const resp = await fetch('http://localhost:4000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            content: n.content,
            tags: n.tags,
          })),
          edges: edges.map((e) => ({
            sourceId: e.sourceId,
            targetId: e.targetId,
            type: e.type,
          })),
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error ?? 'Query failed');
        return;
      }

      setResponse(data.answer);
      setUsedModel(data.model);

      // Still highlight relevant nodes via local scoring
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2)
        .map((t) => t.replace(/[^a-z0-9]/g, ''));

      const scored = nodes.map((node) => {
        let score = 0;
        const titleLower = node.title.toLowerCase();
        const contentStr = typeof node.content === 'string'
          ? node.content.toLowerCase()
          : JSON.stringify(node.content).toLowerCase();
        for (const term of queryTerms) {
          if (titleLower.includes(term)) score += 5;
          if (contentStr.includes(term)) score += 2;
        }
        return { node, score };
      });

      const topResults = scored
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      setRelevantNodeIds(topResults.map((r) => r.node.id));
    } catch {
      setError('Failed to connect to the API. Is the server running on port 4000?');
    } finally {
      setLoading(false);
    }
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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-purple)' }}>
          Natural Language Query
        </h2>
        <button onClick={() => setActivePanel('none')} className="text-xl cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          ✕
        </button>
      </div>

      <Card className="mb-4">
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Ask questions about the knowledge graph. The LLM traverses nodes and edges to find relevant answers.
        </p>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., What are the cost implications of migration?"
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

      {error && (
        <Card className="mb-4" style={{ borderColor: 'var(--bio-red)', border: '1px solid var(--bio-red)' }}>
          <p className="text-sm" style={{ color: 'var(--bio-red)' }}>{error}</p>
        </Card>
      )}

      {response && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--bio-purple)' }}>Answer</h4>
              {usedModel && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-glass)', color: 'var(--text-muted)' }}>
                  {usedModel}
                </span>
              )}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {response}
            </div>
          </Card>

          {relevantNodeIds.length > 0 && (
            <Card className="mt-3">
              <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Referenced nodes ({relevantNodeIds.length})
              </h4>
              <div className="space-y-1.5">
                {relevantNodeIds.map((id) => {
                  const node = nodes.find((n) => n.id === id);
                  if (!node) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getNodeColor(node.type) }} />
                      <span style={{ color: 'var(--text-primary)' }}>{node.title}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({node.type})</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
