import { Hono } from 'hono';
import { z } from 'zod';
import {
  extractAndBuildGraph,
  ExtractionSchemaError,
  IngestionConfigError,
} from '../lib/ingestion/extractor.js';
import { getPrisma } from '../lib/db.js';
import {
  canvasToCreateRow,
  nodeToCreateRow,
  edgeToCreateRow,
} from '../lib/persistence.js';

const ingestSchema = z.object({
  text: z.string().min(1, 'text is required'),
  format: z.enum(['slack', 'email', 'meeting', 'raw', 'auto']).optional(),
  topic: z.string().optional(),
  // If supplied, ingested nodes/edges are appended to this canvas.
  // If omitted, a fresh canvas is created from the extraction result.
  canvasId: z.string().optional(),
  config: z
    .object({
      model: z.string().optional(),
      extractFacts: z.boolean().optional(),
      extractAssumptions: z.boolean().optional(),
      extractDecisions: z.boolean().optional(),
    })
    .optional(),
});

const statsSchema = z.object({
  nodesExtracted: z.number(),
  edgesExtracted: z.number(),
  factsExtracted: z.number(),
  decisionsExtracted: z.number(),
  questionsExtracted: z.number(),
  edgesDropped: z.number(),
  nodesWithSpan: z.number(),
});

const route = new Hono();

route.post('/api/ingest', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return c.json(
      { error: `Validation: ${firstError.message}` },
      400
    );
  }

  const { text, format, topic, config, canvasId: targetCanvasId } = parsed.data;

  try {
    const { graph, stats } = await extractAndBuildGraph({
      text,
      format,
      topic,
      model: config?.model,
      extractFacts: config?.extractFacts,
      extractAssumptions: config?.extractAssumptions,
      extractDecisions: config?.extractDecisions,
    });

    // Persist to the active canvas (issue #2). If the caller named one,
    // append; otherwise the extractor-generated canvas becomes the new
    // root. Failures here surface as 500 — extraction succeeded but the
    // result wasn't saved, and the client deserves to know.
    const prisma = getPrisma();
    let persistedCanvasId = graph.canvas.id;

    if (targetCanvasId) {
      const existing = await prisma.canvas.findUnique({ where: { id: targetCanvasId } });
      if (!existing) {
        return c.json({ error: `Canvas not found: ${targetCanvasId}` }, 404);
      }
      persistedCanvasId = targetCanvasId;
      // Re-stamp the canvasId on nodes/edges to match the destination.
      for (const n of graph.nodes) n.canvasId = targetCanvasId;
      for (const e of graph.edges) e.canvasId = targetCanvasId;
      graph.canvas = {
        ...graph.canvas,
        id: targetCanvasId,
        name: existing.name,
        updatedAt: new Date().toISOString(),
      };
    } else {
      await prisma.canvas.create({ data: canvasToCreateRow(graph.canvas) });
    }

    if (graph.nodes.length > 0) {
      await prisma.inosNode.createMany({
        data: graph.nodes.map(nodeToCreateRow),
      });
    }
    if (graph.edges.length > 0) {
      await prisma.edge.createMany({
        data: graph.edges.map(edgeToCreateRow),
      });
    }
    // Mark canvas as updated so it floats to the top of GET /api/canvases.
    await prisma.canvas.update({
      where: { id: persistedCanvasId },
      data: { updatedAt: new Date() },
    });

    return c.json({ graph, stats: statsSchema.parse(stats), canvasId: persistedCanvasId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ingestion] Error:', message);
    if (err instanceof IngestionConfigError) {
      return c.json({ error: message, code: err.code }, 503);
    }
    if (err instanceof ExtractionSchemaError) {
      // Surface the typed code for the client; keep payload off the wire.
      return c.json({ error: message, code: err.code }, 502);
    }
    return c.json({ error: `Ingestion failed: ${message}` }, 500);
  }
});

export default route;
