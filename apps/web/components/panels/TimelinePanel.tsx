'use client';

import { motion } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { useMemo } from 'react';

export function TimelinePanel() {
  const { nodes, edges, timelineProgress, setTimelineProgress, activePanel, setActivePanel, openNodeDetail, visibleNodeIds } = useGraphStore();

  const timeRange = useMemo(() => {
    if (nodes.length === 0) return { min: 0, max: 0, span: '' };
    const ts = nodes.map((n) => new Date(n.createdAt).getTime()).sort((a, b) => a - b);
    const days = Math.round((ts[ts.length - 1] - ts[0]) / (1000 * 60 * 60 * 24));
    return { min: ts[0], max: ts[ts.length - 1], span: days > 0 ? `${days}d` : '< 1d' };
  }, [nodes]);

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [nodes]);

  const currentDateLabel = useMemo(() => {
    const cutoff = timeRange.min + (timeRange.max - timeRange.min) * (timelineProgress / 100);
    return new Date(cutoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [timelineProgress, timeRange]);

  const nodesByDay = useMemo(() => {
    const map = new Map<string, typeof sortedNodes>();
    sortedNodes.forEach((node) => {
      const day = new Date(node.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(node);
    });
    return Array.from(map.entries());
  }, [sortedNodes]);

  const visibleCount = visibleNodeIds ? visibleNodeIds.size : nodes.length;
  const visibleEdgeCount = edges.filter((e) =>
    visibleNodeIds ? visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId) : true
  ).length;

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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-amber)' }}>Timeline</h2>
        <button onClick={() => setActivePanel('none')} className="text-xl cursor-pointer" style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>

      <Card className="mb-4">
        <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <span>{nodes.length > 0 ? new Date(timeRange.min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
          <span style={{ color: 'var(--bio-amber)' }}>{currentDateLabel}</span>
          <span>{nodes.length > 0 ? new Date(timeRange.max).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
        </div>
        <input type="range" min="0" max="100" step="0.5" value={timelineProgress}
          onChange={(e) => setTimelineProgress(Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--bio-amber)' }} />
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          <span>{visibleCount} of {nodes.length} nodes</span><span>span: {timeRange.span}</span>
        </div>
      </Card>

      <Card className="mb-4 p-3">
        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Reasoning Flow</h3>
        <div className="relative" style={{ minHeight: `${Math.max(nodesByDay.length * 24, 60)}px` }}>
          <div className="absolute left-3 top-0 bottom-0" style={{ width: '2px', background: 'var(--surface-glass-border)' }} />
          {nodesByDay.map(([day, dayNodes]) => (
            <div key={day} className="relative" style={{ marginBottom: '8px' }}>
              <div className="absolute text-xs font-semibold" style={{ left: '0', top: '2px', color: 'var(--text-muted)', width: '50px' }}>{day}</div>
              <div className="ml-16 flex flex-col gap-1">
                {dayNodes.map((node) => {
                  const isVisible = visibleNodeIds ? visibleNodeIds.has(node.id) : true;
                  const color = getNodeColor(node.type);
                  return (
                    <div key={node.id} onClick={() => openNodeDetail(node)}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-all"
                      style={{ background: isVisible ? 'transparent' : 'rgba(0,0,0,0.3)', opacity: isVisible ? 1 : 0.3, borderLeft: `3px solid ${color}` }}>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs truncate" style={{ color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)' }}>{node.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Connections</h3>
        <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex justify-between"><span>Total edges</span><span style={{ color: 'var(--bio-cyan)' }}>{edges.length}</span></div>
          <div className="flex justify-between"><span>Visible edges</span><span style={{ color: 'var(--bio-cyan)' }}>{visibleEdgeCount}</span></div>
        </div>
      </Card>
    </motion.div>
  );
}
