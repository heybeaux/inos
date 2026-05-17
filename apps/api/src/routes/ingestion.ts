import { Hono } from 'hono';
import { z } from 'zod';
import {
  extractAndBuildGraph,
  ExtractionSchemaError,
  IngestionConfigError,
} from '../lib/ingestion/extractor.js';

const ingestSchema = z.object({
  text: z.string().min(1, 'text is required'),
  format: z.enum(['slack', 'email', 'meeting', 'raw', 'auto']).optional(),
  topic: z.string().optional(),
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

  const { text, format, topic, config } = parsed.data;

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

    return c.json({ graph, stats: statsSchema.parse(stats) });
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
