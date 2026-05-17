'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';

/**
 * TimelineSidebar — left sidebar showing the temporal structure.
 * Only appears when timeline panel is open. Nodes listed by date with a "now" line.
 */
export function TimelineSidebar() {
  const { nodes, edges, timelineProgress, setTimelineProgress, visibleNodeIds, focusNode, activePanel } = useGraphStore();

  // Only show when timeline panel is active
  if (activePanel !== 'timeline' || nodes.length === 0) return null;

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [nodes]
  );

  const dateRange = useMemo(() => {
    const ts = nodes.map((n) => new Date(n.createdAt).getTime());
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [nodes]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof sortedNodes>();
    sortedNodes.forEach((n) => {
      const key = new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    });
    return Array.from(map.entries());
  }, [sortedNodes]);

  return (
    <AnimatePresence>
      <motion.div
        key="timeline-sidebar"
        initial={{ x: -260, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -260, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-14 left-0 bottom-0 z-20 overflow-y-auto"
        style={{
          width: '220px',
          background: 'rgba(10, 10, 26, 0.95)',
          borderRight: '1px solid var(--surface-glass-border)',
        }}
      >
        <div className="p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--bio-amber)' }}>
            Timeline
          </h3>

          {/* Slider */}
          <div className="mb-4 px-1">
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={timelineProgress}
              onChange={(e) => setTimelineProgress(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: 'var(--bio-amber)', height: '4px' }}
            />
            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <span>{new Date(dateRange.min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{new Date(dateRange.max).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>

          {/* Timeline spine */}
          <div className="relative">
            <div className="absolute left-[9px] top-0 bottom-0" style={{ width: '2px', background: 'var(--surface-glass-border)' }} />

            {/* Now indicator */}
            <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: `${timelineProgress}%` }}>
              <div className="h-px" style={{ background: 'var(--bio-amber)', boxShadow: '0 0 6px rgba(254,228,64,0.4)' }} />
            </div>

            {groups.map(([date, group]) => (
              <div key={date} className="relative mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 z-10" style={{ background: 'var(--bio-amber)', marginLeft: '8px' }} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{date}</span>
                </div>
                <div className="ml-[22px] space-y-1">
                  {group.map((node) => {
                    const isVisible = visibleNodeIds ? visibleNodeIds.has(node.id) : true;
                    return (
                      <button
                        key={node.id}
                        onClick={() => focusNode(node.id)}
                        className="w-full text-left px-2 py-0.5 rounded text-xs transition-all truncate"
                        style={{
                          borderLeft: `2px solid ${getNodeColor(node.type)}`,
                          opacity: isVisible ? 1 : 0.25,
                          color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                        title={node.title}
                      >
                        {node.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-4 pt-3 border-t text-[10px]" style={{ borderColor: 'var(--surface-glass-border)', color: 'var(--text-muted)' }}>
            <div className="flex justify-between mb-1">
              <span>Visible</span>
              <span style={{ color: 'var(--bio-cyan)' }}>{visibleNodeIds ? visibleNodeIds.size : nodes.length} / {nodes.length}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
