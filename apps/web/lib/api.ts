import type { InosGraph, InosNode, InosEdge, Canvas, CanvasSummary, FactsTable } from '@heybeaux/inos-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// v1 auth (Issue #3): shared secret read from NEXT_PUBLIC_INOS_API_TOKEN.
// "shared" because it ships in the browser bundle; this is the smallest
// useful step above "wide open" while we don't yet have a user model.
// The upgrade path is per-user JWTs (issued server-side at sign-in), at
// which point the bearer here becomes a user-scoped session token.
const API_TOKEN = process.env.NEXT_PUBLIC_INOS_API_TOKEN ?? '';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Graph
  getGraph: (canvasId: string) =>
    fetchJson<InosGraph>(`/api/canvases/${canvasId}/graph`),

  // Nodes
  getNodes: (canvasId: string) =>
    fetchJson<InosNode[]>(`/api/canvases/${canvasId}/nodes`),

  getNode: (canvasId: string, nodeId: string) =>
    fetchJson<InosNode>(`/api/canvases/${canvasId}/nodes/${nodeId}`),

  createNode: (canvasId: string, data: Partial<InosNode>) =>
    fetchJson<InosNode>(`/api/canvases/${canvasId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Edges
  getEdges: (canvasId: string) =>
    fetchJson<InosEdge[]>(`/api/canvases/${canvasId}/edges`),

  createEdge: (canvasId: string, data: Partial<InosEdge>) =>
    fetchJson<InosEdge>(`/api/canvases/${canvasId}/edges`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Canvas
  getCanvas: (canvasId: string) =>
    fetchJson<Canvas>(`/api/canvases/${canvasId}`),

  getSummary: (canvasId: string) =>
    fetchJson<CanvasSummary>(`/api/canvases/${canvasId}/summary`),

  getFacts: (canvasId: string) =>
    fetchJson<FactsTable>(`/api/canvases/${canvasId}/facts`),

  // Natural language query
  query: (canvasId: string, query: string) =>
    fetchJson<{ answer: string; relevantNodes: string[] }>(`/api/canvases/${canvasId}/query`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  // Ingest transcript
  ingestTranscript: (text: string, format?: string, topic?: string) =>
    fetchJson<{
      graph: InosGraph;
      stats: {
        nodesExtracted: number;
        edgesExtracted: number;
        factsExtracted: number;
        decisionsExtracted: number;
        questionsExtracted: number;
      };
    }>('/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ text, format, topic }),
    }),
};
