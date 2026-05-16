'use client';

// Viewport wrapper — the Canvas component already fills the viewport.
// This component exists as a stable hook point for future zoom/pan UI.

export function Viewport({ children }: { children: React.ReactNode }) {
  return <div className="w-full h-full">{children}</div>;
}
