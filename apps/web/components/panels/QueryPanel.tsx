'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function QueryPanel() {
  const { nodes, edges, activePanel, setActivePanel } = useGraphStore();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [relevantNodeIds, setRelevantNodeIds] = useState<string[]>([]);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);
    setRelevantNodeIds([]);

    // Simulate LLM processing delay
    await new Promise((r) => setTimeout(r, 1500));

    // Graph traversal: find relevant nodes by matching query terms
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
      const tagsLower = node.tags.map((t) => t.toLowerCase());

      for (const term of queryTerms) {
        if (titleLower.includes(term)) score += 5;
        if (contentStr.includes(term)) score += 2;
        if (tagsLower.some((t) => t.includes(term))) score += 3;
      }

      // Bonus for nodes that are well-connected
      const connectionCount = edges.filter(
        (e) => e.sourceId === node.id || e.targetId === node.id
      ).length;
      score += connectionCount * 0.5;

      return { node, score };
    });

    // Take top results above a threshold
    const topResults = scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    setRelevantNodeIds(topResults.map((r) => r.node.id));

    if (topResults.length === 0) {
      setResponse(
        `I couldn't find any nodes related to "${query}" in this canvas. ` +
        `The graph currently has ${nodes.length} nodes covering topics like: ${[...new Set(nodes.flatMap((n) => n.tags))].slice(0, 6).join(', ')}. ` +
        `Try asking about one of these topics, or expand the canvas with more content.`
      );
    } else {
      const topNode = topResults[0].node;
      const otherNodes = topResults.slice(1);

      const topContent = typeof topNode.content === 'string'
        ? topNode.content
        : 'excerpt' in topNode.content && topNode.content.excerpt
          ? topNode.content.excerpt
          : JSON.stringify(topNode.content);

      let answer = `**${topNode.title}** (${topNode.type})\n\n`;
      answer += topContent.length > 400 ? topContent.slice(0, 400) + '…' : topContent;

      if (otherNodes.length > 0) {
        answer += `\n\n**Related nodes:**\n`;
        for (const r of otherNodes) {
          const connEdges = edges.filter(
            (e) => e.sourceId === r.node.id || e.targetId === r.node.id
          );
          const connLabels = connEdges.map((e) => e.type).join(', ');
          answer += `• ${r.node.title} (${r.node.type}${connLabels ? `, ${connLabels}` : ''})\n`;
        }
      }

      setResponse(answer);
    }

    setLoading(false);
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
          Ask questions about the knowledge graph. The system traverses nodes and edges to find relevant answers.
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

      {response && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--bio-purple)' }}>
              Answer
            </h4>
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: 'var(--text-primary)' }}
            >
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
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: getNodeColor(node.type) }}
                      />
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

// Import getNodeColor for referenced nodes section
function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    claim: '#00f5d4',
    question: '#f15bb5',
    decision: '#7b2ff7',
    evidence: '#00ff87',
    branch: '#fee440',
    synthesis: '#00f5d4',
    deliberation: '#ff9f1c',
    constraint: '#ff6b6b',
    assumption: '#f15bb5',
    insight: '#00f5d4',
    artifact: '#7b2ff7',
    fact: '#00ff87',
  };
  return colors[type] ?? '#00f5d4';
}
