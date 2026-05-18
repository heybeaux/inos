/**
 * Integration tests for the Canvas persistence layer (Issue #2).
 *
 * Uses a fresh on-disk SQLite database per test run. We can't `:memory:`
 * the file because Prisma migrations target a file URL, but we keep the
 * file in os.tmpdir() so it disappears with the test box.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { setPrismaForTests } from '../lib/db.js';

const SCHEMA_PATH = resolve(__dirname, '../../prisma/schema.prisma');
let tempDir: string;
let prisma: PrismaClient;
let app: typeof import('../index.js').default;

const TEST_TOKEN = 'test-token-abc123';

async function jsonReq(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const res = await app.fetch(req);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'inos-api-test-'));
  const dbPath = join(tempDir, 'test.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.VITEST = '1';
  process.env.INOS_API_TOKEN = TEST_TOKEN;

  // Apply the committed migrations against the temp DB.
  execSync(`npx prisma migrate deploy --schema ${SCHEMA_PATH}`, {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });

  prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  setPrismaForTests(prisma);

  // Import after env is set so the route module sees the test config.
  app = (await import('../index.js')).default;
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Wipe between tests so cases don't bleed into each other.
  await prisma.edge.deleteMany();
  await prisma.inosNode.deleteMany();
  await prisma.fact.deleteMany();
  await prisma.canvas.deleteMany();
});

describe('canvas persistence', () => {
  it('creates a canvas and lists it back', async () => {
    const create = await jsonReq('/api/canvases', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Canvas', description: 'unit-test' }),
    });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeTruthy();
    expect(create.body.name).toBe('Test Canvas');

    const list = await jsonReq('/api/canvases');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBe(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it('reflects a node PUT in the canvas graph response', async () => {
    const create = await jsonReq('/api/canvases', {
      method: 'POST',
      body: JSON.stringify({ name: 'Graph Canvas' }),
    });
    expect(create.status).toBe(201);
    const canvasId = create.body.id as string;

    // Seed a node directly via Prisma (faster than POST, same surface).
    await prisma.inosNode.create({
      data: {
        id: 'node-A',
        canvasId,
        type: 'claim',
        title: 'Original title',
        contentJson: JSON.stringify('hello'),
        authorJson: JSON.stringify({ type: 'system', source: 'test' }),
        status: 'fresh',
        tags: JSON.stringify(['t1']),
        dependsOn: JSON.stringify([]),
        visits: JSON.stringify([]),
        staleness: JSON.stringify({
          state: 'fresh',
          evaluatedAt: new Date().toISOString(),
          cascadeDepth: 0,
        }),
        schemaVersion: '1.0.0',
      },
    });

    const put = await jsonReq(`/api/canvases/${canvasId}/nodes/node-A`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated title', tags: ['t1', 't2'], status: 'mature' }),
    });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('Updated title');

    const graph = await jsonReq(`/api/canvases/${canvasId}/graph`);
    expect(graph.status).toBe(200);
    expect(graph.body.nodes).toHaveLength(1);
    expect(graph.body.nodes[0].title).toBe('Updated title');
    expect(graph.body.nodes[0].tags).toEqual(['t1', 't2']);
    expect(graph.body.nodes[0].status).toBe('mature');
  });

  it('deletes a node and removes its edges', async () => {
    const create = await jsonReq('/api/canvases', {
      method: 'POST',
      body: JSON.stringify({ name: 'Edge Canvas' }),
    });
    const canvasId = create.body.id as string;

    // Seed two nodes + one edge.
    await prisma.inosNode.createMany({
      data: [
        {
          id: 'n1',
          canvasId,
          type: 'claim',
          title: 'A',
          contentJson: '""',
          authorJson: '{"type":"system","source":"t"}',
          staleness: '{"state":"fresh","evaluatedAt":"2026-01-01T00:00:00Z","cascadeDepth":0}',
        },
        {
          id: 'n2',
          canvasId,
          type: 'fact',
          title: 'B',
          contentJson: '""',
          authorJson: '{"type":"system","source":"t"}',
          staleness: '{"state":"fresh","evaluatedAt":"2026-01-01T00:00:00Z","cascadeDepth":0}',
        },
      ],
    });
    await prisma.edge.create({
      data: {
        id: 'e1',
        canvasId,
        type: 'supports',
        sourceId: 'n2',
        targetId: 'n1',
        authorJson: '{"type":"system","source":"t"}',
      },
    });

    const del = await jsonReq(`/api/canvases/${canvasId}/nodes/n2`, { method: 'DELETE' });
    expect(del.status).toBe(200);

    const graph = await jsonReq(`/api/canvases/${canvasId}/graph`);
    expect(graph.body.nodes.map((n: any) => n.id)).toEqual(['n1']);
    expect(graph.body.edges).toHaveLength(0);
  });
});
