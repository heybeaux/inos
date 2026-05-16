'use client';

import type { InosEdge } from '@heybeaux/inos-types';
import { getEdgeColor } from '@/lib/store';
import { Badge } from '@/components/ui/Badge';

interface EdgeProps {
  edge: InosEdge;
}

export function Edge({ edge }: EdgeProps) {
  const color = getEdgeColor(edge.type);

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-4 h-0.5 flex-shrink-0" style={{ background: color }} />
      <Badge label={edge.type.replace('_', ' ')} color={color} />
      {edge.label && (
        <span style={{ color: 'var(--text-muted)' }}>{edge.label}</span>
      )}
    </div>
  );
}
