'use client';

import { motion } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { useMemo } from 'react';

function formatDate(ts: number, opts: Intl.DateTimeFormatOptions): string {
  if (!ts || isNaN(ts)) return '—';
  try { return new Date(ts).toLocaleDateString('en-US', opts); } catch { return '—'; }
}

export function TimelinePanel() {
  const { nodes, edges, timelineProgress, setTimelineProgress, setActivePanel } = useGraphStore();

  const timeRange = useMemo(() => {
    if (nodes.length === 0) return { min: 0, max: 0, span: '—' };
    const timestamps = nodes.map((n) => new Date(n.createdAt).getTime()).filter((t) => t > 0 && !isNaN(t));
    if (timestamps.length === 0) return { min: 0, max: 0, span: '—' };
    const sorted = timestamps.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const days = Math.round((max - min) / 86400000);
    return { min, max, span: days > 0 ? `${days}d` : '< 1d' };
  }, [nodes]);

  const currentDateLabel = useMemo(() => {
    if (!timeRange.min || !timeRange.max) return '—';
    const cutoff = timeRange.min + (timeRange.max - timeRange.min) * (timelineProgress / 100);
    return formatDate(cutoff, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [timelineProgress, timeRange]);

  const visibleCount = useMemo(() => {
    if (timelineProgress >= 100) return nodes.length;
    if (!timeRange.max) return 0;
    const cutoff = timeRange.min + (timeRange.max - timeRange.min) * (timelineProgress / 100);
    return nodes.filter((n) => {
      const t = new Date(n.createdAt).getTime();
      return t > 0 && !isNaN(t) && t <= cutoff;
    }).length;
  }, [nodes, timelineProgress, timeRange]);

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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-amber)' }}>Timeline</h2>
        <button onClick={() => setActivePanel('none')} className="text-xl cursor-pointer" style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>

      <Card className="mb-4">
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Drag the slider to wind time forward/backward. The 3D canvas and left sidebar update in real-time.
        </p>
        <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <span>{formatDate(timeRange.min, { month: 'short', day: 'numeric' })}</span>
          <span style={{ color: 'var(--bio-amber)' }}>{currentDateLabel}</span>
          <span>{formatDate(timeRange.max, { month: 'short', day: 'numeric' })}</span>
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
