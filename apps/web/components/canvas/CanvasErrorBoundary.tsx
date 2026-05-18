'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CanvasErrorBoundaryProps {
  children: ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that wraps the R3F Canvas3D mount.
 *
 * Three.js / WebGL initialization, shader compilation, and runtime
 * draw-call errors can crash the React tree mid-render — without a
 * boundary the whole panel/store state goes with them.  This boundary
 * intercepts the throw and shows a static "rendering failed" notice
 * while leaving every other panel (Facts, Summary, Query, Timeline,
 * Node Detail, etc.) and the underlying zustand store untouched, so
 * the user can keep working with their data and retry rendering on
 * demand.
 */
export class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console so devs can capture the underlying R3F /
    // WebGL throw; intentionally do NOT touch the zustand store.
    // eslint-disable-next-line no-console
    console.error('[CanvasErrorBoundary] 3D canvas failed:', error, info);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full h-full flex items-center justify-center"
        style={{ background: 'var(--abyss-deepest)' }}
      >
        <div
          className="max-w-md text-center px-6 py-8 rounded-xl"
          style={{
            background: 'var(--surface-glass)',
            border: '1px solid var(--surface-glass-border)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--bio-cyan)' }}
          >
            Rendering failed — your data is intact
          </p>
          <p
            className="text-sm mb-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            The 3D canvas hit an error, but every panel and your nodes
            and edges are safe. You can keep using Facts, Summary,
            Query, and Timeline, or retry the canvas below.
          </p>
          {this.state.error?.message ? (
            <pre
              className="text-xs text-left p-3 mb-4 rounded font-mono overflow-x-auto"
              style={{
                background: 'var(--abyss-shallow)',
                color: 'var(--text-muted)',
                maxHeight: '120px',
              }}
            >
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200"
            style={{
              background: 'var(--bio-cyan)',
              color: 'var(--abyss-deepest)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
