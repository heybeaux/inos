'use client';

import type { InosNode } from '@heybeaux/inos-types';
import { getNodeColor } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface NodeProps {
  node: InosNode;
  onClick?: () => void;
  compact?: boolean;
}

export function Node({ node, onClick, compact = false }: NodeProps) {
  const color = getNodeColor(node.type);
  const contentStr =
    typeof node.content === 'string'
      ? node.content
      : 'excerpt' in node.content && node.content.excerpt
      ? node.content.excerpt
      : '';

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
        onClick={onClick}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
          {node.title}
        </span>
      </div>
    );
  }

  return (
    <Card className="cursor-pointer hover:border-[var(--bio-cyan)] transition-colors" onClick={onClick}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ background: color }} />
        <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {node.title}
        </h4>
        <Badge label={node.type} color={color} />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {contentStr.length > 200 ? contentStr.slice(0, 200) + '…' : contentStr}
      </p>
    </Card>
  );
}
