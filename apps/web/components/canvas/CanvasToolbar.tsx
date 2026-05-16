'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore, COMMAND_NODE_TYPES, getNodeColor } from '@/lib/store';
import type { NodeType } from '@heybeaux/inos-types';

interface ToolbarButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  accentColor?: string;
  onClick: () => void;
}

function ToolbarButton({ icon, label, active, accentColor, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150"
      style={{
        background: active ? (accentColor ? `${accentColor}20` : 'rgba(0, 245, 212, 0.15)') : 'transparent',
        color: active ? (accentColor ?? 'var(--bio-cyan)') : 'var(--text-secondary)',
        border: active
          ? `1px solid ${accentColor ? `${accentColor}40` : 'var(--bio-cyan)'}`
          : '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span className="text-sm">{icon}</span>
    </button>
  );
}

interface DividerProps {
  vertical?: boolean;
}

function Divider({ vertical = true }: DividerProps) {
  return (
    <div
      style={{
        width: vertical ? '1px' : 'auto',
        height: vertical ? '24px' : '1px',
        background: 'var(--surface-glass-border)',
        margin: vertical ? '0 2px' : '2px 0',
      }}
    />
  );
}

export function CanvasToolbar() {
  const {
    toolbarPlacementMode,
    setToolbarPlacementMode,
    setCommandPaletteOpen,
    zoom,
    setZoom,
    showFactsPanel,
    showSummaryPanel,
    showTimelinePanel,
    togglePanel,
    nodes,
  } = useGraphStore();

  const handleZoomIn = useCallback(() => setZoom(Math.min(zoom + 0.2, 3)), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(Math.max(zoom - 0.2, 0.3)), [zoom, setZoom]);
  const handleZoomFit = useCallback(() => setZoom(1), [setZoom]);

  const nodeCount = nodes.filter((n) => n.status !== 'orphaned').length;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 p-2 rounded-xl"
      style={{
        background: 'var(--surface-glass)',
        border: '1px solid var(--surface-glass-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Node creation buttons */}
      <div className="flex flex-col gap-0.5">
        {COMMAND_NODE_TYPES.map(({ type, label, icon }) => {
          const isActive = toolbarPlacementMode === type;
          const color = getNodeColor(type);
          return (
            <ToolbarButton
              key={type}
              icon={icon}
              label={`Add ${label}`}
              active={isActive}
              accentColor={color}
              onClick={() => setToolbarPlacementMode(isActive ? null : type)}
            />
          );
        })}
      </div>

      <Divider />

      {/* Command palette */}
      <ToolbarButton
        icon="⌘"
        label="Command Palette (Cmd+K)"
        onClick={() => setCommandPaletteOpen(true)}
      />

      <Divider />

      {/* Zoom controls */}
      <div className="flex flex-col gap-0.5">
        <ToolbarButton icon="+" label="Zoom In" onClick={handleZoomIn} />
        <div className="flex items-center justify-center h-9">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <ToolbarButton icon="−" label="Zoom Out" onClick={handleZoomOut} />
        <ToolbarButton icon="⊡" label="Fit View" onClick={handleZoomFit} />
      </div>

      <Divider />

      {/* Panel toggles */}
      <div className="flex flex-col gap-0.5">
        <ToolbarButton
          icon="📊"
          label="Facts Panel"
          active={showFactsPanel}
          accentColor="var(--bio-green)"
          onClick={() => togglePanel('facts')}
        />
        <ToolbarButton
          icon="📝"
          label="Summary Panel"
          active={showSummaryPanel}
          accentColor="var(--bio-cyan)"
          onClick={() => togglePanel('summary')}
        />
        <ToolbarButton
          icon="🕐"
          label="Timeline"
          active={showTimelinePanel}
          accentColor="var(--bio-amber)"
          onClick={() => togglePanel('timeline')}
        />
      </div>

      <Divider />

      {/* Node count */}
      <div className="flex items-center justify-center h-9">
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: 'var(--abyss-shallow)', color: 'var(--text-muted)' }}
        >
          {nodeCount} nodes
        </span>
      </div>

      {/* Placement mode indicator */}
      {toolbarPlacementMode && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-1 px-2 py-1 rounded text-center"
          style={{
            background: `${getNodeColor(toolbarPlacementMode)}15`,
            border: `1px solid ${getNodeColor(toolbarPlacementMode)}30`,
          }}
        >
          <p className="text-xs font-medium" style={{ color: getNodeColor(toolbarPlacementMode) }}>
            Click canvas to place
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {toolbarPlacementMode}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
