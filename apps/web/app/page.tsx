'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useGraphStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { SummaryPanel } from '@/components/panels/SummaryPanel';
import { FactsPanel } from '@/components/panels/FactsPanel';
import { QueryPanel } from '@/components/panels/QueryPanel';
import { TimelinePanel } from '@/components/panels/TimelinePanel';
import { NodeDetailPanel } from '@/components/panels/NodeDetailPanel';
import { ImportPanel } from '@/components/panels/ImportPanel';
import { CommandPaletteContainer } from '@/components/ui/CommandPalette';
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { ContextMenu } from '@/components/canvas/ContextMenu';
import { InlineEditorContainer } from '@/components/nodes/InlineEditor';
import { TimelineSidebar } from '@/components/canvas/TimelineSidebar';
import { CreateCanvasModal } from '@/components/panels/CreateCanvasModal';

// Dynamic import to avoid SSR issues with Three.js
const Canvas3D = dynamic(() => import('@/components/canvas/Canvas3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--abyss-deepest)' }}>
      <div className="text-center">
        <div
          className="w-12 h-12 border-4 border-[var(--bio-cyan)] border-t-transparent rounded-full animate-spin mx-auto mb-4"
        />
        <p style={{ color: 'var(--text-secondary)' }}>Summoning the deep ocean…</p>
      </div>
    </div>
  ),
});

// Top bar with canvas name and controls
function TopBar() {
  const { activePanel, setActivePanel, closePanels, setCommandPaletteOpen, canvasName } = useGraphStore();

  return (
    <motion.div
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3 glass"
      style={{ borderBottom: '1px solid var(--surface-glass-border)' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold" style={{ color: 'var(--bio-cyan)' }}>
          ☁ Inos
        </span>
        <span
          className="text-sm px-3 py-1 rounded-full"
          style={{
            background: 'var(--surface-glass)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--surface-glass-border)',
          }}
        >
          {canvasName}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Cmd+K shortcut button */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all duration-200"
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--surface-glass-border)',
          }}
        >
          <span>⌘</span>
          <kbd
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'var(--abyss-shallow)', color: 'var(--text-muted)' }}
          >
            K
          </kbd>
        </button>

        {[
          { key: 'create' as const, label: '+ New' },
          { key: 'import' as const, label: 'Import' },
          { key: 'summary' as const, label: 'Summary' },
          { key: 'facts' as const, label: 'Facts' },
          { key: 'query' as const, label: 'Query' },
          { key: 'timeline' as const, label: 'Timeline' },
        ].map(({ key, label }) => {
          const isActive = activePanel === key;
          return (
            <button
              key={key}
              onClick={() => (isActive ? closePanels() : setActivePanel(key))}
              className="px-3 py-1.5 text-sm rounded-lg transition-all duration-200"
              style={{
                background: isActive ? 'var(--bio-cyan)' : 'transparent',
                color: isActive ? 'var(--abyss-deepest)' : 'var(--text-secondary)',
                border: isActive ? 'none' : '1px solid var(--surface-glass-border)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Legend overlay (bottom-left)
function Legend() {
  const legendItems = [
    { shape: '●', label: 'Claim', color: '#00f5d4' },
    { shape: '◆', label: 'Decision', color: '#7b2ff7' },
    { shape: '■', label: 'Fact', color: '#00ff87' },
    { shape: '◎', label: 'Question', color: '#f15bb5' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1, duration: 0.5 }}
      className="fixed bottom-4 left-4 z-20 glass rounded-xl px-4 py-3"
      style={{
        background: 'var(--surface-glass)',
        border: '1px solid var(--surface-glass-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p
        className="text-xs font-semibold mb-2 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Node Types
      </p>
      <div className="flex flex-col gap-1.5">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <span style={{ color: item.color, fontSize: '14px' }}>{item.shape}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function CanvasPage() {
  const { loadDemo, handleCanvasClick } = useGraphStore();
  const [ready, setReady] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDemo();
    setReady(true);
  }, [loadDemo]);

  // Handle canvas clicks for toolbar placement mode
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        handleCanvasClick(x, y);
      }
    },
    [handleCanvasClick]
  );

  if (!ready) return null;

  return (
    <main className="w-screen h-screen relative overflow-hidden" style={{ background: 'var(--abyss-deepest)' }}>
      <TopBar />
      <div
        ref={canvasContainerRef}
        className="w-full h-full pt-14"
        onClick={handleContainerClick}
      >
        <Canvas3D />
      </div>
      <Legend />

      {/* 2D Timeline sidebar */}
      <TimelineSidebar />

      {/* Canvas toolbar */}
      <CanvasToolbar />

      {/* Command palette */}
      <CommandPaletteContainer />

      {/* Context menu */}
      <ContextMenu />

      {/* Inline editor */}
      <InlineEditorContainer />

      {/* Side panels */}
      <AnimatePresence>
        <SidePanelRouter />
      </AnimatePresence>

      {/* Create canvas modal */}
      <CreateCanvasModal />
    </main>
  );
}

function SidePanelRouter() {
  const { activePanel } = useGraphStore();

  return (
    <AnimatePresence>
      {activePanel === 'import' && <ImportPanel key="import" />}
      {activePanel === 'summary' && <SummaryPanel key="summary" />}
      {activePanel === 'facts' && <FactsPanel key="facts" />}
      {activePanel === 'query' && <QueryPanel key="query" />}
      {activePanel === 'timeline' && <TimelinePanel key="timeline" />}
      {activePanel === 'node-detail' && <NodeDetailPanel key="node-detail" />}
    </AnimatePresence>
  );
}
