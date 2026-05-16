'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';

export function TimelinePanel() {
  const { nodes, activePanel, setActivePanel } = useGraphStore();
  const [timeSlice, setTimeSlice] = useState(100);

  const sortedNodes = [...nodes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const cutoff = new Date(Date.now() - timeSlice * 60000);
  const visibleNodes = sortedNodes.filter((n) => new Date(n.createdAt) >= cutoff);

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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bio-amber)' }}>
          Timeline
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
        <label className="text-xs block mb-2" style={{ color: 'var(--text-muted)' }}>
          Time window: last {timeSlice} minutes
        </label>
        <input
          type="range"
          min="1"
          max="1440"
          value={timeSlice}
          onChange={(e) => setTimeSlice(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--bio-amber)' }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          <span>1m</span>
          <span>24h</span>
        </div>
      </Card>

      <div className="space-y-2">
        {visibleNodes.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No nodes in this time window.
            </p>
          </Card>
        ) : (
          visibleNodes.map((node, i) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="cursor-pointer hover:border-[var(--bio-amber)] transition-colors">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background:
                        node.type === 'claim'
                          ? '#00f5d4'
                          : node.type === 'fact'
                          ? '#00ff87'
                          : node.type === 'question'
                          ? '#f15bb5'
                          : '#7b2ff7',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {node.title}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(node.createdAt).toLocaleTimeString()} · {node.type}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
