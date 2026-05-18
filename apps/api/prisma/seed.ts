/**
 * Seed the local DB with the "demo" canvas from apps/web/lib/demo-data.ts.
 *
 * Idempotent: only seeds when the demo canvas doesn't already exist.
 * Designed to be re-run safely on a fresh clone.
 *
 * Run via:  pnpm --filter @heybeaux/inos-api exec tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { generateDemoGraph } from '../../web/lib/demo-data.js';
import {
  canvasToCreateRow,
  nodeToCreateRow,
  edgeToCreateRow,
} from '../src/lib/persistence.js';

async function main() {
  const prisma = new PrismaClient();
  try {
    const demo = generateDemoGraph();

    const existing = await prisma.canvas.findUnique({ where: { id: demo.canvas.id } });
    if (existing) {
      console.log(`[seed] Demo canvas '${demo.canvas.id}' already exists — skipping.`);
      return;
    }

    await prisma.canvas.create({ data: canvasToCreateRow(demo.canvas) });
    if (demo.nodes.length > 0) {
      await prisma.inosNode.createMany({ data: demo.nodes.map(nodeToCreateRow) });
    }
    if (demo.edges.length > 0) {
      await prisma.edge.createMany({ data: demo.edges.map(edgeToCreateRow) });
    }

    console.log(
      `[seed] Demo canvas '${demo.canvas.id}' seeded: ${demo.nodes.length} nodes, ${demo.edges.length} edges.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
