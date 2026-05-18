/**
 * Prisma singleton for the Inos API.
 *
 * We use a module-level singleton (not per-request) so SQLite isn't
 * reopening a new file handle for every fetch. The PrismaClient itself
 * is internally pooled.
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// Hook for tests to inject an in-memory or alternate-file Prisma client.
export function setPrismaForTests(client: PrismaClient): void {
  prisma = client;
}
