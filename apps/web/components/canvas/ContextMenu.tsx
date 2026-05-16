'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGraphStore, getNodeColor } from '@/lib/store';
import type { InosNode } from '@heybeaux/inos-types';

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ContextMenu() {
  const { contextMenu, setContextMenu, nodes, addNode, addEdge, deleteNode, setInlineEditId } = useGraphStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<string | null>(null);

  const sourceNode = contextMenu.nodeId ? nodes.find((n) => n.id === contextMenu.nodeId) ?? null : null;

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    if (contextMenu.open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.open]);

  const closeMenu = useCallback(() => {
    setContextMenu({ open: false, mergeMode: false });
    setMergeMode(false);
    setMergeSearch('');
    setSelectedMergeTarget(null);
  }, [setContextMenu]);

  if (!contextMenu.open || !sourceNode) return null;

  // Calculate position, keeping menu in viewport
  const menuWidth = 240;
  const x = Math.min(contextMenu.x, window.innerWidth - menuWidth - 10);
  const y = Math.min(contextMenu.y, window.innerHeight - 300);

  const menuItems: MenuItem[] = [
    {
      label: 'Branch from here',
      icon: '🌿',
      action: () => {
        const newNode = addNode({
          type: 'branch',
          title: `Branch: ${sourceNode.title}`,
          content: `Divergent from "${sourceNode.title}"`,
        });
        addEdge({
          type: 'diverges',
          sourceId: newNode.id,
          targetId: sourceNode.id,
          label: 'branch from',
        });
        closeMenu();
      },
    },
    {
      label: 'Challenge this',
      icon: '⚔️',
      action: () => {
        const newNode = addNode({
          type: 'claim',
          title: `Challenge: ${sourceNode.title}`,
          content: '',
          tags: ['challenge'],
        });
        addEdge({
          type: 'challenges',
          sourceId: newNode.id,
          targetId: sourceNode.id,
          label: 'challenges',
        });
        closeMenu();
      },
    },
    {
      label: 'Add fact',
      icon: '📋',
      action: () => {
        const newNode = addNode({
          type: 'fact',
          title: 'New fact',
          content: { source: '', excerpt: '', url: '' },
        });
        addEdge({
          type: 'depends_on',
          sourceId: sourceNode.id,
          targetId: newNode.id,
          label: 'depends on fact',
        });
        closeMenu();
      },
    },
    {
      label: 'Add evidence',
      icon: '🔬',
      action: () => {
        const newNode = addNode({
          type: 'evidence',
          title: 'New evidence',
          content: '',
        });
        addEdge({
          type: 'supports',
          sourceId: newNode.id,
          targetId: sourceNode.id,
          label: 'supports',
        });
        closeMenu();
      },
    },
    {
      label: 'Edit',
      icon: '✏️',
      action: () => {
        setInlineEditId(sourceNode.id);
        closeMenu();
      },
    },
    {
      label: 'Merge with…',
      icon: '🔗',
      action: () => {
        setMergeMode(true);
      },
    },
    {
      label: 'Delete',
      icon: '🗑️',
      action: () => {
        deleteNode(sourceNode.id);
        closeMenu();
      },
      danger: true,
    },
  ];

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.12 }}
      className="fixed z-50 rounded-xl overflow-hidden"
      style={{
        left: x,
        top: y,
        minWidth: menuWidth,
        background: 'var(--surface-glass)',
        border: '1px solid var(--surface-glass-border)',
        boxShadow: '0 15px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 245, 212, 0.06)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {!mergeMode ? (
        <div className="py-1.5">
          {/* Source node header */}
          <div
            className="px-4 py-2.5 border-b border-[var(--surface-glass-border)]"
            style={{ background: 'rgba(0, 245, 212, 0.04)' }}
          >
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {sourceNode.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: getNodeColor(sourceNode.type) }}>
              {sourceNode.type}
            </p>
          </div>

          {/* Menu items */}
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              disabled={item.disabled}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors"
              style={{
                color: item.danger ? 'var(--bio-red)' : item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-2">
          {/* Merge mode header */}
          <div className="px-4 py-2.5 border-b border-[var(--surface-glass-border)]">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Merge with…
            </p>
            <input
              type="text"
              placeholder="Search nodes…"
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              className="w-full mt-2 px-3 py-1.5 rounded-lg text-sm bg-transparent outline-none"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--surface-glass-border)',
              }}
              autoFocus
            />
          </div>

          {/* Node list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {nodes
              .filter((n) => n.id !== sourceNode.id && n.status !== 'orphaned')
              .filter((n) =>
                !mergeSearch ||
                n.title.toLowerCase().includes(mergeSearch.toLowerCase())
              )
              .slice(0, 8)
              .map((node) => {
                const color = getNodeColor(node.type);
                const isSelected = selectedMergeTarget === node.id;
                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedMergeTarget(node.id)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors"
                    style={{
                      color: isSelected ? color : 'var(--text-primary)',
                      background: isSelected ? `${color}10` : 'transparent',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                    onMouseLeave={(e) =>
                      !isSelected && (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-left truncate">{node.title}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {node.type}
                    </span>
                  </button>
                );
              })}
          </div>

          {/* Merge action buttons */}
          <div className="flex gap-2 px-4 py-3 border-t border-[var(--surface-glass-border)]">
            <button
              onClick={() => {
                setMergeMode(false);
                setSelectedMergeTarget(null);
              }}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedMergeTarget) {
                  addEdge({
                    type: 'merges',
                    sourceId: sourceNode.id,
                    targetId: selectedMergeTarget,
                    label: 'merged into',
                  });
                }
                closeMenu();
              }}
              disabled={!selectedMergeTarget}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: selectedMergeTarget ? 'var(--bio-cyan)' : 'var(--abyss-shallow)',
                color: selectedMergeTarget ? 'var(--abyss-deepest)' : 'var(--text-muted)',
              }}
            >
              Merge
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
