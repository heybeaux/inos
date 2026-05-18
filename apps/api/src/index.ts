import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import ingestionRoute from './routes/ingestion.js';
import canvasesRoute from './routes/canvases.js';
import {
  authMiddleware,
  bodyLimitMiddleware,
  rateLimitMiddleware,
} from './lib/auth.js';
import { resolveCorsConfig } from './lib/cors-config.js';

const app = new Hono();

// CORS (Issue #16) — allowed origins from env, with a sane localhost
// default for dev. We use bearer tokens, not cookies, so credentials
// are off.
const { origins: ALLOWED_ORIGINS, credentials: CORS_CREDENTIALS } = resolveCorsConfig({
  rawOrigins: process.env.INOS_ALLOWED_ORIGINS,
  credentials: false,
});

app.use(
  '/*',
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: CORS_CREDENTIALS,
  }),
);

// Order matters: cap body size before parsing JSON, rate-limit before
// auth (so unauthenticated floods can't pin a CPU on bcrypt-style work),
// and check auth before anything actually mutates state.
app.use('/*', bodyLimitMiddleware);
app.use('/*', rateLimitMiddleware);
app.use('/*', authMiddleware);

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/query', async (c) => {
  const { query, nodes, edges } = await c.req.json<{
    query: string;
    nodes: Array<{ id: string; type: string; title: string; content: unknown; tags: string[] }>;
    edges: Array<{ sourceId: string; targetId: string; type: string }>;
  }>();

  if (!query || !nodes?.length) {
    return c.json({ error: 'query and nodes required' }, 400);
  }

  // Build context from graph — truncate long content
  const nodeContext = nodes.map((n) => {
    const content = typeof n.content === 'string' ? n.content : JSON.stringify(n.content);
    return `[${n.type}] "${n.title}": ${content.slice(0, 300)} [tags: ${n.tags.join(', ')}]`;
  }).join('\n');

  const edgeContext = edges.map((e) => `  ${e.sourceId} --[${e.type}]--> ${e.targetId}`).join('\n');

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  if (!apiKey) {
    return c.json({
      answer: `No LLM configured. Add OPENROUTER_API_KEY to your .env to enable AI-powered queries.\n\nYour graph has ${nodes.length} nodes and ${edges.length} edges.`,
      model: 'none',
    });
  }

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Inos',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are Inos, an AI reasoning assistant. You analyze knowledge graphs and answer questions based on their content.

Rules:
- Base your answer ONLY on the nodes and edges provided in the context
- If the graph doesn't contain relevant info, say so honestly
- Reference specific node titles when answering
- Keep answers concise (2-4 sentences)
- If asked about connections, trace the path through edges`,
          },
          {
            role: 'user',
            content: `Question: ${query}\n\nGraph nodes:\n${nodeContext}\n\nRelationships:\n${edgeContext}\n\nAnswer the question based on the graph above.`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return c.json({ error: `LLM request failed (${resp.status})`, detail: errText.slice(0, 200) }, 502);
    }

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content ?? 'No response from model.';

    return c.json({ answer, model: data.model ?? 'unknown' });
  } catch (err: unknown) {
    return c.json({
      error: 'LLM request failed',
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

app.route('', ingestionRoute);
app.route('', canvasesRoute);

// Vitest imports this module to mount the routes — only auto-start when
// we're not in a test context.
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const port = Number(process.env.INOS_API_PORT ?? '4000');
  console.log(`Inos API server is running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
