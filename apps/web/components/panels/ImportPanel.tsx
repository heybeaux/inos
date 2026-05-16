'use client';

import { useState } from 'react';
import { useGraphStore } from '@/lib/store';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';

type InputFormat = 'auto' | 'slack' | 'email' | 'meeting' | 'raw';

export function ImportPanel() {
  const { loadGraph, setActivePanel } = useGraphStore();
  const [text, setText] = useState('');
  const [format, setFormat] = useState<InputFormat>('auto');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    nodesExtracted: number;
    edgesExtracted: number;
    factsExtracted: number;
    decisionsExtracted: number;
    questionsExtracted: number;
  } | null>(null);

  async function handleIngest() {
    if (!text.trim()) {
      setError('Please paste some text to ingest.');
      return;
    }

    setLoading(true);
    setError(null);
    setStats(null);

    try {
      const result = await api.ingestTranscript(
        text,
        format === 'auto' ? undefined : format,
        topic || undefined
      );

      setStats(result.stats);
      loadGraph(result.graph);
      setActivePanel('none'); // close panel after successful import
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Ingestion failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const formats: { value: InputFormat; label: string }[] = [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'slack', label: 'Slack / Teams' },
    { value: 'email', label: 'Email chain' },
    { value: 'meeting', label: 'Meeting transcript' },
    { value: 'raw', label: 'Raw text' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-14 right-0 z-20 w-96 max-h-[calc(100vh-4rem)] overflow-y-auto glass rounded-bl-xl p-5"
      style={{
        border: '1px solid var(--surface-glass-border)',
        borderRight: 'none',
        borderTop: 'none',
      }}
    >
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: 'var(--bio-cyan)' }}
      >
        ☁ Import Transcript
      </h3>

      {/* Format selector */}
      <div className="mb-3">
        <label
          className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Format
        </label>
        <div className="flex flex-wrap gap-1.5">
          {formats.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className="px-2.5 py-1 text-xs rounded-md transition-all"
              style={{
                background:
                  format === f.value
                    ? 'var(--bio-cyan)'
                    : 'var(--surface-glass)',
                color:
                  format === f.value
                    ? 'var(--abyss-deepest)'
                    : 'var(--text-secondary)',
                border:
                  format === f.value
                    ? 'none'
                    : '1px solid var(--surface-glass-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic input */}
      <div className="mb-3">
        <label
          className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Topic (optional)
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. API redesign discussion"
          className="w-full px-3 py-2 text-sm rounded-lg outline-none"
          style={{
            background: 'var(--surface-glass)',
            color: 'var(--text-primary)',
            border: '1px solid var(--surface-glass-border)',
          }}
        />
      </div>

      {/* Text area */}
      <div className="mb-4">
        <label
          className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Paste text
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a Slack thread, email chain, meeting transcript, or any discussion..."
          rows={8}
          className="w-full px-3 py-2 text-sm rounded-lg outline-none resize-y"
          style={{
            background: 'var(--surface-glass)',
            color: 'var(--text-primary)',
            border: '1px solid var(--surface-glass-border)',
            fontFamily: 'monospace',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-3 p-3 rounded-lg text-xs"
          style={{
            background: 'rgba(255, 107, 107, 0.1)',
            color: '#ff6b6b',
            border: '1px solid rgba(255, 107, 107, 0.3)',
          }}
        >
          {error}
        </div>
      )}

      {/* Ingest button */}
      <Button
        onClick={handleIngest}
        disabled={loading || !text.trim()}
        className="w-full"
        variant="primary"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="w-4 h-4 border-2 border-[var(--abyss-deepest)] border-t-transparent rounded-full animate-spin"
            />
            Extracting reasoning…
          </span>
        ) : (
          'Ingest → Build Graph'
        )}
      </Button>

      {/* Stats */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-3 rounded-lg"
          style={{
            background: 'rgba(0, 245, 212, 0.05)',
            border: '1px solid rgba(0, 245, 212, 0.2)',
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--bio-cyan)' }}
          >
            ✓ Extraction complete
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Nodes" value={stats.nodesExtracted} />
            <Stat label="Edges" value={stats.edgesExtracted} />
            <Stat label="Facts" value={stats.factsExtracted} />
            <Stat label="Decisions" value={stats.decisionsExtracted} />
            <Stat label="Questions" value={stats.questionsExtracted} />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex justify-between items-center px-2 py-1 rounded"
      style={{ background: 'var(--surface-glass)' }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="font-mono font-bold"
        style={{ color: 'var(--bio-cyan)' }}
      >
        {value}
      </span>
    </div>
  );
}
