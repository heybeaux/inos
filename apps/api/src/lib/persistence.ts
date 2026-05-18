/**
 * Row<->API converters for the Inos persistence layer.
 *
 * Prisma's SQLite provider can't store JSON natively, so structured
 * fields (tags, sourceSpan, visits, etc.) are TEXT columns we
 * serialize/deserialize at this boundary. Keeping the conversion in
 * one place means routes deal purely in domain types.
 */

import type {
  Canvas,
  InosNode,
  InosEdge,
  NodeAuthor,
  StalenessInfo,
  NodeSourceSpan,
  VisitRecord,
  NodeType,
  NodeStatus,
  NodeContent,
  EdgeType,
} from '@heybeaux/inos-types';
import type {
  Canvas as CanvasRow,
  InosNode as InosNodeRow,
  Edge as EdgeRow,
} from '@prisma/client';

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function canvasRowToCanvas(row: CanvasRow): Canvas {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    author: parseJson<NodeAuthor>(row.authorJson, { type: 'system', source: 'ingestion' }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    participants: parseJson<NodeAuthor[]>(row.participants, []),
    tags: parseJson<string[]>(row.tags, []),
    schemaVersion: row.schemaVersion,
  };
}

export function canvasToCreateRow(canvas: Canvas): {
  id: string;
  name: string;
  description: string | null;
  authorJson: string;
  participants: string;
  tags: string;
  schemaVersion: string;
} {
  return {
    id: canvas.id,
    name: canvas.name,
    description: canvas.description ?? null,
    authorJson: JSON.stringify(canvas.author),
    participants: JSON.stringify(canvas.participants ?? []),
    tags: JSON.stringify(canvas.tags ?? []),
    schemaVersion: canvas.schemaVersion,
  };
}

export function nodeRowToNode(row: InosNodeRow): InosNode {
  const node: InosNode = {
    id: row.id,
    type: row.type as NodeType,
    title: row.title,
    content: parseJson<NodeContent>(row.contentJson, '' as unknown as NodeContent),
    author: parseJson<NodeAuthor>(row.authorJson, { type: 'system', source: 'ingestion' }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    visits: parseJson<VisitRecord[]>(row.visits, []),
    dependsOn: parseJson<string[]>(row.dependsOn, []),
    staleness: parseJson<StalenessInfo>(row.staleness, {
      state: 'fresh',
      evaluatedAt: row.updatedAt.toISOString(),
      cascadeDepth: 0,
    }),
    canvasId: row.canvasId,
    status: row.status as NodeStatus,
    tags: parseJson<string[]>(row.tags, []),
    schemaVersion: row.schemaVersion,
  };
  if (row.sourceSpan) {
    node.sourceSpan = parseJson<NodeSourceSpan | undefined>(row.sourceSpan, undefined);
  }
  if (row.engramMemoryId) {
    node.engramMemoryId = row.engramMemoryId;
  }
  return node;
}

export function nodeToCreateRow(node: InosNode): {
  id: string;
  canvasId: string;
  type: string;
  title: string;
  contentJson: string;
  authorJson: string;
  status: string;
  tags: string;
  dependsOn: string;
  visits: string;
  staleness: string;
  sourceSpan: string | null;
  engramMemoryId: string | null;
  factKey: string | null;
  schemaVersion: string;
} {
  return {
    id: node.id,
    canvasId: node.canvasId,
    type: node.type,
    title: node.title,
    contentJson: JSON.stringify(node.content),
    authorJson: JSON.stringify(node.author),
    status: node.status,
    tags: JSON.stringify(node.tags ?? []),
    dependsOn: JSON.stringify(node.dependsOn ?? []),
    visits: JSON.stringify(node.visits ?? []),
    staleness: JSON.stringify(node.staleness),
    sourceSpan: node.sourceSpan ? JSON.stringify(node.sourceSpan) : null,
    engramMemoryId: node.engramMemoryId ?? null,
    factKey: null,
    schemaVersion: node.schemaVersion,
  };
}

export function edgeRowToEdge(row: EdgeRow): InosEdge {
  return {
    id: row.id,
    type: row.type as EdgeType,
    sourceId: row.sourceId,
    targetId: row.targetId,
    label: row.label ?? undefined,
    createdAt: row.createdAt.toISOString(),
    author: parseJson<NodeAuthor>(row.authorJson, { type: 'system', source: 'ingestion' }),
    canvasId: row.canvasId,
    schemaVersion: row.schemaVersion,
  };
}

export function edgeToCreateRow(edge: InosEdge): {
  id: string;
  canvasId: string;
  type: string;
  sourceId: string;
  targetId: string;
  label: string | null;
  authorJson: string;
  schemaVersion: string;
} {
  return {
    id: edge.id,
    canvasId: edge.canvasId,
    type: edge.type,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: edge.label ?? null,
    authorJson: JSON.stringify(edge.author),
    schemaVersion: edge.schemaVersion,
  };
}
