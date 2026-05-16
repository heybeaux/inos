'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGraphStore } from '@/lib/store';
import type { InosNode } from '@heybeaux/inos-types';

interface InlineEditorProps {
  node: InosNode;
  position: [number, number, number];
  onSave: (updates: { title: string; content: string }) => void;
  onCancel: () => void;
}

export function InlineEditor({ node, position, onSave, onCancel }: InlineEditorProps) {
  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(typeof node.content === 'string' ? node.content : '');
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (document.activeElement === titleRef.current) {
          e.preventDefault();
          contentRef.current?.focus();
        } else if (document.activeElement === contentRef.current) {
          e.preventDefault();
          onSave({ title, content });
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [title, content, onSave, onCancel]
  );

  // Convert 3D world position to screen position for the overlay
  // Since this renders as a DOM overlay, we position it centered on viewport
  // The actual node highlighting is handled by the 3D scene
  return (
    <div
      className="fixed z-40 flex flex-col gap-2 p-4 rounded-xl"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '380px',
        background: 'var(--surface-glass)',
        border: '1px solid var(--bio-cyan)',
        boxShadow: '0 0 30px rgba(0, 245, 212, 0.15), 0 20px 50px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(16px)',
      }}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Node type badge */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            background: 'rgba(0, 245, 212, 0.1)',
            color: 'var(--bio-cyan)',
            border: '1px solid rgba(0, 245, 212, 0.2)',
          }}
        >
          Editing: {node.type}
        </span>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ✕
        </button>
      </div>

      {/* Title input */}
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full bg-transparent outline-none text-lg font-semibold"
        style={{ color: 'var(--text-primary)' }}
      />

      {/* Content textarea */}
      <textarea
        ref={contentRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content…"
        rows={3}
        className="w-full bg-transparent outline-none resize-none text-sm"
        style={{ color: 'var(--text-secondary)' }}
      />

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--surface-glass-border)]">
        <span className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>
          <kbd className="px-1.5 py-0.5 rounded mx-0.5" style={{ background: 'var(--abyss-shallow)' }}>Enter</kbd>
          to save
          <kbd className="px-1.5 py-0.5 rounded mx-0.5 ml-1" style={{ background: 'var(--abyss-shallow)' }}>Esc</kbd>
          to cancel
        </span>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ title, content })}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: 'var(--bio-cyan)',
            color: 'var(--abyss-deepest)',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// Container that renders the active inline editor
export function InlineEditorContainer() {
  const { inlineEditId, nodes, editNode, setInlineEditId } = useGraphStore();

  if (!inlineEditId) return null;

  const node = nodes.find((n) => n.id === inlineEditId);
  if (!node) return null;

  return (
    <InlineEditor
      key={node.id}
      node={node}
      position={[0, 0, 0]}
      onSave={(updates) => {
        editNode(node.id, updates);
        setInlineEditId(null);
      }}
      onCancel={() => setInlineEditId(null)}
    />
  );
}
