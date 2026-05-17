'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGraphStore } from '@/lib/store';

const TEMPLATES = [
  { id: 'blank', name: 'Blank Canvas', icon: '◇', desc: 'Start from scratch' },
  { id: 'decision', name: 'Decision', icon: '◆', desc: 'Map options and trade-offs' },
  { id: 'investigation', name: 'Investigation', icon: '◎', desc: 'Trace questions to evidence' },
  { id: 'design', name: 'Design Review', icon: '●', desc: 'Claims, constraints, and feedback' },
];

export function CreateCanvasModal() {
  const { activePanel, setActivePanel, nodes } = useGraphStore();
  const [showModal, setShowModal] = useState(false);

  // Expose via command palette or a button — for now, show when activePanel === 'create'
  const isOpen = activePanel === 'create' || showModal;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setActivePanel('none')}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl p-6 w-full max-w-md"
            style={{
              background: 'rgba(10, 10, 26, 0.98)',
              border: '1px solid var(--surface-glass-border)',
              boxShadow: '0 0 60px rgba(0, 245, 212, 0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--bio-cyan)' }}>
              Create New Canvas
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              {nodes.length > 0 ? 'Current canvas will be replaced. All unsaved work will be lost.' : 'Choose a template to get started.'}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    // For now, just load fresh demo data. Later: wire to actual canvas creation
                    useGraphStore.getState().loadDemo();
                    setActivePanel('none');
                  }}
                  className="text-left p-3 rounded-lg transition-all"
                  style={{
                    background: 'var(--surface-glass)',
                    border: '1px solid var(--surface-glass-border)',
                  }}
                >
                  <div className="text-lg mb-1">{t.icon}</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActivePanel('none')}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--surface-glass-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  useGraphStore.getState().loadDemo();
                  setActivePanel('none');
                }}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: 'var(--bio-cyan)', color: 'var(--abyss-deepest)' }}
              >
                Start Blank
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
