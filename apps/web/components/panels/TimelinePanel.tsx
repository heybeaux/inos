'use client';

import { motion } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { useMemo } from 'react';

export function TimelinePanel() {
  const {
    nodes,
    edges,
    timelineProgress,
    setTimelineProgress,
    setActivePanel,
  } = useGraphStore();

  const timeRange = useMemo(() => {
    if (nodes.length === 0) return { min: 0, max: 0, span: '' };
    const ts = nodes.map((n) => new Date(n.createdAt).getTime()).sort((a, b) => a - b);
    return { min: ts[0], max: ts[ts.length - 1], span: `${Math.round((ts[ts.length - 1] - ts[0]) / 86400000)}d` };
  }, [nodes]);

  const currentDateLabel = useMemo(() => {
    const cutoff = timeRange.min + (timeRange.max - timeRange.min) * (timelineProgress / 100);
    return new Date(cutoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [timelineProgress, timeRange]);

  const visibleCount = useMemo(() => {
    if (timelineProgress >= 100) return nodes.length;
    const cutoff = timeRange.min + (timeRange.max - timeRange.min) * (timelineProgress / 100);
    return nodes.filter((n) => new Date(n.createdAt).getTime() <= cutoff).length;
  }, [nodes, timelineProgress, timeRange]);

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
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Drag the slider to wind time forward/backward. The 3D canvas and left sidebar update in real-time.
        </p>
        <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <span>{nodes.length > 0 ? new Date(timeRange.min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
          <span style={{ color: 'var(--bio-amber)' }}>{currentDateLabel}</span>
          <span>{nodes.length > 0 ? new Date(timeRange.max).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={timelineProgress}
          onChange={(e) => setTimelineProgress(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--bio-amber)' }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          <span>{visibleCount} of {nodes.length} nodes</span>
          <span>span: {timeRange.span}</span>
        </div>
      </Card>

      <Card>
        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Legend</h3>
        <div className="space-y-1.5">
          {['claim', 'question', 'decision', 'evidence', 'branch', 'synthesis', 'fact'].map((type) => (
            <div key={type} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getNodeColor(type as any) }} />
              <span style={{ color: 'var(--text-secondary)' }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
