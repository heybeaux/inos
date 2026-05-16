'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGraphStore, COMMAND_NODE_TYPES, RELATIONSHIP_TYPES, getNodeColor } from '@/lib/store';
import type { NodeType, EdgeType, InosNode } from '@heybeaux/inos-types';

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const { nodes, addNode, addEdge, setCommandPaletteOpen } = useGraphStore();

  // Form state
  const [selectedType, setSelectedType] = useState<NodeType>('claim');
  const [content, setContent] = useState('');
  const [relationshipType, setRelationshipType] = useState<EdgeType>('supports');
  const [connectToId, setConnectToId] = useState<string | null>(null);

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Global keyboard shortcut: Cmd+K / Ctrl+K to toggle, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, setCommandPaletteOpen]);

  // Smart connect: filter nodes as user types
  const matchingNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter((n) => n.status !== 'orphaned')
      .filter((n) => n.title.toLowerCase().includes(q) || String(n.content).toLowerCase().includes(q))
      .slice(0, 5);
  }, [searchQuery, nodes]);

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (!content.trim()) return;

    const newNode = addNode({
      type: selectedType,
      title: content.trim().slice(0, 80),
      content: content.trim(),
    });

    // If a connection target is selected, create an edge
    if (connectToId) {
      addEdge({
        type: relationshipType,
        sourceId: newNode.id,
        targetId: connectToId,
        label: RELATIONSHIP_TYPES.find((r) => r.type === relationshipType)?.label,
      });
    }

    // Reset and close
    setContent('');
    setSearchQuery('');
    setConnectToId(null);
    onClose();
  }, [content, selectedType, connectToId, relationshipType, addNode, addEdge, onClose]);

  // Keyboard: Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(10, 10, 26, 0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: -30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--surface-glass)',
          border: '1px solid var(--surface-glass-border)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 245, 212, 0.08)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--surface-glass-border)]">
          <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Add to canvas…"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSearchQuery(e.target.value);
            }}
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd
            className="text-xs px-2 py-1 rounded font-mono"
            style={{ background: 'var(--abyss-shallow)', color: 'var(--text-muted)' }}
          >
            ↵
          </kbd>
        </div>

        {/* Node type tabs */}
        <div className="flex gap-1 px-5 py-3 overflow-x-auto border-b border-[var(--surface-glass-border)]">
          {COMMAND_NODE_TYPES.map(({ type, label, icon }) => {
            const isActive = selectedType === type;
            const color = getNodeColor(type);
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap"
                style={{
                  background: isActive ? `${color}18` : 'transparent',
                  color: isActive ? color : 'var(--text-secondary)',
                  border: isActive ? `1px solid ${color}40` : '1px solid transparent',
                }}
              >
                <span style={{ color }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Smart connect suggestions */}
        <AnimatePresence>
          {matchingNodes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5 py-3 border-b border-[var(--surface-glass-border)]"
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Connect to…
              </p>
              <div className="flex flex-wrap gap-2">
                {matchingNodes.map((node) => {
                  const color = getNodeColor(node.type);
                  const isSelected = connectToId === node.id;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setConnectToId(isSelected ? null : node.id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-150"
                      style={{
                        background: isSelected ? `${color}20` : 'var(--abyss-shallow)',
                        border: isSelected ? `1px solid ${color}50` : '1px solid transparent',
                        color: isSelected ? color : 'var(--text-secondary)',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                      <span className="max-w-[180px] truncate">{node.title}</span>
                    </button>
                  );
                })}
              </div>

              {/* Relationship selector */}
              {connectToId && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 mt-3"
                >
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Relationship:</span>
                  <div className="flex gap-1">
                    {RELATIONSHIP_TYPES.map(({ type, label }) => {
                      const isActive = relationshipType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setRelationshipType(type)}
                          className="px-2 py-1 rounded text-xs font-medium transition-all duration-150"
                          style={{
                            background: isActive ? 'var(--bio-cyan)' : 'var(--abyss-shallow)',
                            color: isActive ? 'var(--abyss-deepest)' : 'var(--text-secondary)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add to Canvas button */}
        <div className="px-5 py-4 flex justify-end">
          <button
            onClick={handleSubmit}
            className="px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{
              background: content.trim() ? 'var(--bio-cyan)' : 'var(--abyss-shallow)',
              color: content.trim() ? 'var(--abyss-deepest)' : 'var(--text-muted)',
              cursor: content.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add to Canvas
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Wrapper component that handles global keyboard shortcut
export function CommandPaletteContainer() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useGraphStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <CommandPalette key="command-palette" onClose={() => setCommandPaletteOpen(false)} />
      )}
    </AnimatePresence>
  );
}
