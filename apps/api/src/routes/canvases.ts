/**
 * Canvas / graph routes.
 *
 * Surface (matches what apps/web/lib/api.ts calls):
 *   GET    /api/canvases
 *   POST   /api/canvases
 *   GET    /api/canvases/:id
 *   GET    /api/canvases/:id/graph
 *   GET    /api/canvases/:id/nodes
 *   GET    /api/canvases/:id/nodes/:nodeId
 *   POST   /api/canvases/:id/nodes
 *   PUT    /api/canvases/:id/nodes/:nodeId
 *   DELETE /api/canvases/:id/nodes/:nodeId
 *   GET    /api/canvases/:id/edges
 *   POST   /api/canvases/:id/edges
 *   PUT    /api/canvases/:id/edges/:edgeId
 *   DELETE /api/canvases/:id/edges/:edgeId
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/db.js';
import {
  canvasRowToCanvas,
  canvasToCreateRow,
  nodeRowToNode,
  edgeRowToEdge,
} from '../lib/persistence.js';
import type { InosNode, InosEdge, NodeAuthor } from '@heybeaux/inos-types';

const SYSTEM_AUTHOR: NodeAuthor = { type: 'system', source: 'api' };

const createCanvasSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  author: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
});

// Loose patch schema — anything we don't recognise is ignored downstream.
const nodePatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.unknown().optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    type: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
    staleness: z.unknown().optional(),
    sourceSpan: z.unknown().optional(),
    posX: z.number().optional(),
    posY: z.number().optional(),
  })
  .passthrough();

const edgePatchSchema = z
  .object({
    type: z.string().optional(),
    label: z.string().max(500).nullable().optional(),
    sourceId: z.string().optional(),
    targetId: z.string().optional(),
  })
  .passthrough();

const route = new Hono();

// ── Canvases ────────────────────────────────────────────────────────────

route.get('/api/canvases', async (c) => {
  const prisma = getPrisma();
  const rows = await prisma.canvas.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return c.json(rows.map(canvasRowToCanvas));
});

route.post('/api/canvases', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = createCanvasSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: `Validation: ${parsed.error.issues[0]?.message ?? 'bad input'}` }, 400);
  }
  const prisma = getPrisma();
  const id = uuidv4();
  const author = (parsed.data.author as NodeAuthor | undefined) ?? SYSTEM_AUTHOR;
  const row = await prisma.canvas.create({
    data: canvasToCreateRow({
      id,
      name: parsed.data.name,
      description: parsed.data.description,
      author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: [author],
      tags: parsed.data.tags ?? [],
      schemaVersion: '1.0.0',
    }),
  });
  return c.json(canvasRowToCanvas(row), 201);
});

route.get('/api/canvases/:id', async (c) => {
  const prisma = getPrisma();
  const id = c.req.param('id');
  const row = await prisma.canvas.findUnique({ where: { id } });
  if (!row) return c.json({ error: 'Canvas not found' }, 404);
  return c.json(canvasRowToCanvas(row));
});

// ── Graph (nodes + edges) ──────────────────────────────────────────────

route.get('/api/canvases/:id/graph', async (c) => {
  const prisma = getPrisma();
  const id = c.req.param('id');
  const canvas = await prisma.canvas.findUnique({ where: { id } });
  if (!canvas) return c.json({ error: 'Canvas not found' }, 404);
  const [nodes, edges] = await Promise.all([
    prisma.inosNode.findMany({ where: { canvasId: id } }),
    prisma.edge.findMany({ where: { canvasId: id } }),
  ]);
  return c.json({
    schemaVersion: '1.0.0',
    canvas: canvasRowToCanvas(canvas),
    nodes: nodes.map(nodeRowToNode),
    edges: edges.map(edgeRowToEdge),
    temporalIndex: [],
    factRegistry: {},
  });
});

// ── Nodes ──────────────────────────────────────────────────────────────

route.get('/api/canvases/:id/nodes', async (c) => {
  const prisma = getPrisma();
  const rows = await prisma.inosNode.findMany({ where: { canvasId: c.req.param('id') } });
  return c.json(rows.map(nodeRowToNode));
});

route.get('/api/canvases/:id/nodes/:nodeId', async (c) => {
  const prisma = getPrisma();
  const row = await prisma.inosNode.findFirst({
    where: { canvasId: c.req.param('id'), id: c.req.param('nodeId') },
  });
  if (!row) return c.json({ error: 'Node not found' }, 404);
  return c.json(nodeRowToNode(row));
});

route.post('/api/canvases/:id/nodes', async (c) => {
  const canvasId = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const data = (body ?? {}) as Partial<InosNode>;
  if (!data.title || !data.type) {
    return c.json({ error: 'title and type are required' }, 400);
  }
  const prisma = getPrisma();
  const id = data.id ?? uuidv4();
  const now = new Date();
  const created = await prisma.inosNode.create({
    data: {
      id,
      canvasId,
      type: String(data.type),
      title: String(data.title),
      contentJson: JSON.stringify(data.content ?? ''),
      authorJson: JSON.stringify(data.author ?? SYSTEM_AUTHOR),
      status: String(data.status ?? 'fresh'),
      tags: JSON.stringify(data.tags ?? []),
      dependsOn: JSON.stringify(data.dependsOn ?? []),
      visits: JSON.stringify(data.visits ?? []),
      staleness: JSON.stringify(
        data.staleness ?? { state: 'fresh', evaluatedAt: now.toISOString(), cascadeDepth: 0 },
      ),
      sourceSpan: data.sourceSpan ? JSON.stringify(data.sourceSpan) : null,
      engramMemoryId: data.engramMemoryId ?? null,
      schemaVersion: data.schemaVersion ?? '1.0.0',
    },
  });
  return c.json(nodeRowToNode(created), 201);
});

route.put('/api/canvases/:id/nodes/:nodeId', async (c) => {
  const canvasId = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = nodePatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: `Validation: ${parsed.error.issues[0]?.message ?? 'bad input'}` }, 400);
  }
  const prisma = getPrisma();
  const existing = await prisma.inosNode.findFirst({ where: { canvasId, id: nodeId } });
  if (!existing) return c.json({ error: 'Node not found' }, 404);

  const patch = parsed.data;
  const data: Record<string, unknown> = {};
  if (typeof patch.title === 'string') data.title = patch.title;
  if (typeof patch.type === 'string') data.type = patch.type;
  if (typeof patch.status === 'string') data.status = patch.status;
  if (patch.content !== undefined) data.contentJson = JSON.stringify(patch.content);
  if (patch.tags !== undefined) data.tags = JSON.stringify(patch.tags);
  if (patch.dependsOn !== undefined) data.dependsOn = JSON.stringify(patch.dependsOn);
  if (patch.staleness !== undefined) data.staleness = JSON.stringify(patch.staleness);
  if (patch.sourceSpan !== undefined) {
    data.sourceSpan = patch.sourceSpan ? JSON.stringify(patch.sourceSpan) : null;
  }
  if (typeof patch.posX === 'number') data.posX = patch.posX;
  if (typeof patch.posY === 'number') data.posY = patch.posY;

  const updated = await prisma.inosNode.update({
    where: { id: nodeId },
    data,
  });
  return c.json(nodeRowToNode(updated));
});

route.delete('/api/canvases/:id/nodes/:nodeId', async (c) => {
  const canvasId = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  const prisma = getPrisma();
  const existing = await prisma.inosNode.findFirst({ where: { canvasId, id: nodeId } });
  if (!existing) return c.json({ error: 'Node not found' }, 404);
  // Cascade-delete edges that reference this node — the FK is on canvasId, not nodeId.
  await prisma.edge.deleteMany({
    where: { canvasId, OR: [{ sourceId: nodeId }, { targetId: nodeId }] },
  });
  await prisma.inosNode.delete({ where: { id: nodeId } });
  return c.json({ ok: true });
});

// ── Edges ──────────────────────────────────────────────────────────────

route.get('/api/canvases/:id/edges', async (c) => {
  const prisma = getPrisma();
  const rows = await prisma.edge.findMany({ where: { canvasId: c.req.param('id') } });
  return c.json(rows.map(edgeRowToEdge));
});

route.post('/api/canvases/:id/edges', async (c) => {
  const canvasId = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const data = (body ?? {}) as Partial<InosEdge>;
  if (!data.sourceId || !data.targetId || !data.type) {
    return c.json({ error: 'sourceId, targetId, and type are required' }, 400);
  }
  const prisma = getPrisma();
  const id = data.id ?? uuidv4();
  const created = await prisma.edge.create({
    data: {
      id,
      canvasId,
      type: String(data.type),
      sourceId: String(data.sourceId),
      targetId: String(data.targetId),
      label: data.label ?? null,
      authorJson: JSON.stringify(data.author ?? SYSTEM_AUTHOR),
      schemaVersion: data.schemaVersion ?? '1.0.0',
    },
  });
  return c.json(edgeRowToEdge(created), 201);
});

route.put('/api/canvases/:id/edges/:edgeId', async (c) => {
  const canvasId = c.req.param('id');
  const edgeId = c.req.param('edgeId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = edgePatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: `Validation: ${parsed.error.issues[0]?.message ?? 'bad input'}` }, 400);
  }
  const prisma = getPrisma();
  const existing = await prisma.edge.findFirst({ where: { canvasId, id: edgeId } });
  if (!existing) return c.json({ error: 'Edge not found' }, 404);

  const patch = parsed.data;
  const data: Record<string, unknown> = {};
  if (typeof patch.type === 'string') data.type = patch.type;
  if (typeof patch.sourceId === 'string') data.sourceId = patch.sourceId;
  if (typeof patch.targetId === 'string') data.targetId = patch.targetId;
  if (patch.label !== undefined) data.label = patch.label ?? null;

  const updated = await prisma.edge.update({ where: { id: edgeId }, data });
  return c.json(edgeRowToEdge(updated));
});

route.delete('/api/canvases/:id/edges/:edgeId', async (c) => {
  const canvasId = c.req.param('id');
  const edgeId = c.req.param('edgeId');
  const prisma = getPrisma();
  const existing = await prisma.edge.findFirst({ where: { canvasId, id: edgeId } });
  if (!existing) return c.json({ error: 'Edge not found' }, 404);
  await prisma.edge.delete({ where: { id: edgeId } });
  return c.json({ ok: true });
});

export default route;
