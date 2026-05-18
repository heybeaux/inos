'use client';

import { motion } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function NodeDetailPanel() {
  const { selectedNode, setActivePanel, setInlineEditId, nodes, edges } = useGraphStore();

  if (!selectedNode) return null;

  const color = getNodeColor(selectedNode.type);

  // Find connected nodes
  const connectedEdges = edges.filter(
    (e) => e.sourceId === selectedNode.id || e.targetId === selectedNode.id
  );
  const connectedNodeIds = new Set(
    connectedEdges.flatMap((e) => [e.sourceId, e.targetId]).filter((id) => id !== selectedNode.id)
  );
  const connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));

  const contentStr =
    typeof selectedNode.content === 'string'
      ? selectedNode.content
      : JSON.stringify(selectedNode.content, null, 2);

  const authorLabel =
    selectedNode.author.type === 'human'
      ? selectedNode.author.displayName
      : selectedNode.author.type === 'agent'
      ? `${selectedNode.author.model}`
      : selectedNode.author.source;

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
        <h2 className="text-lg font-semibold" style={{ color }}>
          Node Detail
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setInlineEditId(selectedNode.id);
              setActivePanel('none');
            }}
            className="px-3 py-1 text-xs font-semibold rounded-lg"
            style={{ background: 'var(--bio-cyan)', color: 'var(--abyss-deepest)' }}
          >
            Edit
          </button>
          <button
            onClick={() => setActivePanel('none')}
            className="text-xl cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>
      </div>

      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3 h-3 rounded-full" style={{ background: color }} />
          <Badge label={selectedNode.type} color={color} />
          <Badge label={selectedNode.status} color={selectedNode.status === 'fresh' ? '#00ff87' : '#ff9f1c'} />
        </div>
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {selectedNode.title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {contentStr.length > 300 ? contentStr.slice(0, 300) + '…' : contentStr}
        </p>
      </Card>

      <Card className="mb-4">
        <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Metadata
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Author</span>
            <span style={{ color: 'var(--text-secondary)' }}>{authorLabel}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Created</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {new Date(selectedNode.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Updated</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {new Date(selectedNode.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>ID</span>
            <span
              className="font-mono"
              style={{ color: 'var(--text-muted)', fontSize: '10px' }}
            >
              {selectedNode.id}
            </span>
          </div>
        </div>
      </Card>

      {selectedNode.tags.length > 0 && (
        <Card className="mb-4">
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Tags
          </h4>
          <div className="flex gap-1.5 flex-wrap">
            {selectedNode.tags.map((tag) => (
              <Badge key={tag} label={tag} color="var(--bio-cyan)" />
            ))}
          </div>
        </Card>
      )}

      {connectedNodes.length > 0 && (
        <Card>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Connected ({connectedNodes.length})
          </h4>
          <div className="space-y-2">
            {connectedNodes.map((node) => {
              const edge = connectedEdges.find(
                (e) =>
                  (e.sourceId === selectedNode.id && e.targetId === node.id) ||
                  (e.targetId === selectedNode.id && e.sourceId === node.id)
              );
              const nodeColor = getNodeColor(node.type);
              return (
                <div key={node.id} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: nodeColor }} />
                  <span style={{ color: 'var(--text-primary)' }} className="flex-1 truncate">
                    {node.title}
                  </span>
                  {edge?.type && (
                    <Badge label={edge.type.replace('_', ' ')} color="var(--text-muted)" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </motion.div>
  );
}
