import { create } from 'zustand';
import type { InosNode, InosEdge } from '@heybeaux/inos-types';

// Demo data — will be replaced by API calls later
const DEMO_NODES: InosNode[] = [
  {
    id: 'node-1',
    type: 'claim',
    title: 'The ocean is the origin of life',
    content: 'All known life on Earth traces its evolutionary lineage back to marine organisms.',
    author: { type: 'human', userId: 'beaux', displayName: 'Beaux' },
    createdAt: '2026-05-16T10:00:00Z',
    updatedAt: '2026-05-16T10:00:00Z',
    visits: [],
    dependsOn: [],
    staleness: { state: 'fresh', evaluatedAt: '2026-05-16T10:00:00Z', cascadeDepth: 0 },
    canvasId: 'demo-canvas',
    status: 'fresh',
    tags: ['biology', 'origins'],
    schemaVersion: '1.0.0',
  },
  {
    id: 'node-2',
    type: 'fact',
    title: 'Hydrothermal vents discovered in 1977',
    content: { source: 'NOAA', excerpt: 'Deep-sea hydrothermal vent ecosystems host chemosynthetic life.', url: 'https://oceanexplorer.noaa.gov' },
    author: { type: 'system', source: 'imported' },
    createdAt: '2026-05-16T10:05:00Z',
    updatedAt: '2026-05-16T10:05:00Z',
    visits: [],
    dependsOn: ['node-1'],
    staleness: { state: 'fresh', evaluatedAt: '2026-05-16T10:05:00Z', cascadeDepth: 0 },
    canvasId: 'demo-canvas',
    status: 'fresh',
    tags: ['geology', 'discovery'],
    schemaVersion: '1.0.0',
  },
  {
    id: 'node-3',
    type: 'question',
    title: 'Could life exist without water?',
    content: 'Are there alternative solvents that could support biochemistry?',
    author: { type: 'human', userId: 'beaux', displayName: 'Beaux' },
    createdAt: '2026-05-16T10:10:00Z',
    updatedAt: '2026-05-16T10:10:00Z',
    visits: [],
    dependsOn: ['node-1'],
    staleness: { state: 'fresh', evaluatedAt: '2026-05-16T10:10:00Z', cascadeDepth: 0 },
    canvasId: 'demo-canvas',
    status: 'fresh',
    tags: ['astrobiology', 'speculation'],
    schemaVersion: '1.0.0',
  },
  {
    id: 'node-4',
    type: 'decision',
    title: 'Focus on Earth-origin hypothesis',
    content: 'We will ground all arguments in terrestrial biology before expanding to exobiology.',
    author: { type: 'human', userId: 'beaux', displayName: 'Beaux' },
    createdAt: '2026-05-16T10:15:00Z',
    updatedAt: '2026-05-16T10:15:00Z',
    visits: [],
    dependsOn: ['node-3'],
    staleness: { state: 'fresh', evaluatedAt: '2026-05-16T10:15:00Z', cascadeDepth: 0 },
    canvasId: 'demo-canvas',
    status: 'fresh',
    tags: ['methodology'],
    schemaVersion: '1.0.0',
  },
  {
    id: 'node-5',
    type: 'claim',
    title: 'Chemosynthesis predates photosynthesis',
    content: 'The earliest metabolic pathways were chemosynthetic, using inorganic compounds from vents.',
    author: { type: 'agent', agentId: 'inos-researcher', model: 'kilocode/qwen/qwen3.6-plus' },
    createdAt: '2026-05-16T10:20:00Z',
    updatedAt: '2026-05-16T10:20:00Z',
    visits: [],
    dependsOn: ['node-2'],
    staleness: { state: 'fresh', evaluatedAt: '2026-05-16T10:20:00Z', cascadeDepth: 0 },
    canvasId: 'demo-canvas',
    status: 'fresh',
    tags: ['evolution', 'metabolism'],
    schemaVersion: '1.0.0',
  },
];

const DEMO_EDGES: InosEdge[] = [
  {
    id: 'edge-1',
    type: 'supports',
    sourceId: 'node-2',
    targetId: 'node-1',
    label: 'evidence for',
    createdAt: '2026-05-16T10:05:00Z',
    author: { type: 'system', source: 'imported' },
    canvasId: 'demo-canvas',
    schemaVersion: '1.0.0',
  },
  {
    id: 'edge-2',
    type: 'diverges',
    sourceId: 'node-3',
    targetId: 'node-1',
    label: 'challenges scope of',
    createdAt: '2026-05-16T10:10:00Z',
    author: { type: 'human', userId: 'beaux', displayName: 'Beaux' },
    canvasId: 'demo-canvas',
    schemaVersion: '1.0.0',
  },
  {
    id: 'edge-3',
    type: 'refines',
    sourceId: 'node-4',
    targetId: 'node-3',
    label: 'narrows to',
    createdAt: '2026-05-16T10:15:00Z',
    author: { type: 'human', userId: 'beaux', displayName: 'Beaux' },
    canvasId: 'demo-canvas',
    schemaVersion: '1.0.0',
  },
  {
    id: 'edge-4',
    type: 'supports',
    sourceId: 'node-5',
    targetId: 'node-1',
    label: 'strengthens claim',
    createdAt: '2026-05-16T10:20:00Z',
    author: { type: 'agent', agentId: 'inos-researcher', model: 'kilocode/qwen/qwen3.6-plus' },
    canvasId: 'demo-canvas',
    schemaVersion: '1.0.0',
  },
  {
    id: 'edge-5',
    type: 'depends_on',
    sourceId: 'node-5',
    targetId: 'node-2',
    label: 'builds on fact',
    createdAt: '2026-05-16T10:20:00Z',
    author: { type: 'agent', agentId: 'inos-researcher', model: 'kilocode/qwen/qwen3.6-plus' },
    canvasId: 'demo-canvas',
    schemaVersion: '1.0.0',
  },
];

type PanelType = 'none' | 'facts' | 'summary' | 'query' | 'timeline' | 'node-detail';

interface GraphState {
  nodes: InosNode[];
  edges: InosEdge[];
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  zoom: number;
  sidebarOpen: boolean;
  activePanel: PanelType;
  selectedNode: InosNode | null;

  // Actions
  setNodes: (nodes: InosNode[]) => void;
  setEdges: (edges: InosEdge[]) => void;
  setFocusedNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: PanelType) => void;
  setSelectedNode: (node: InosNode | null) => void;
  focusNode: (nodeId: string) => void;
  openNodeDetail: (node: InosNode) => void;
  closePanels: () => void;
  loadDemo: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  focusedNodeId: null,
  hoveredNodeId: null,
  zoom: 1,
  sidebarOpen: false,
  activePanel: 'none',
  selectedNode: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
  setZoom: (zoom) => set({ zoom }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActivePanel: (activePanel) => set({ activePanel, sidebarOpen: activePanel !== 'none' }),
  setSelectedNode: (selectedNode) => set({ selectedNode }),

  focusNode: (nodeId) => set({ focusedNodeId: nodeId }),

  openNodeDetail: (node) =>
    set({
      selectedNode: node,
      activePanel: 'node-detail',
      sidebarOpen: true,
      focusedNodeId: node.id,
    }),

  closePanels: () =>
    set({
      sidebarOpen: false,
      activePanel: 'none',
      selectedNode: null,
      focusedNodeId: null,
    }),

  loadDemo: () =>
    set({
      nodes: DEMO_NODES,
      edges: DEMO_EDGES,
    }),
}));

// Helper: get node color by type
export function getNodeColor(type: InosNode['type']): string {
  const colors: Record<string, string> = {
    claim: '#00f5d4',
    question: '#f15bb5',
    decision: '#7b2ff7',
    evidence: '#00ff87',
    branch: '#fee440',
    synthesis: '#00f5d4',
    deliberation: '#ff9f1c',
    constraint: '#ff6b6b',
    assumption: '#f15bb5',
    insight: '#00f5d4',
    artifact: '#7b2ff7',
    fact: '#00ff87',
  };
  return colors[type] ?? '#00f5d4';
}

// Helper: get edge color by type
export function getEdgeColor(type: InosEdge['type']): string {
  const colors: Record<string, string> = {
    supports: '#00ff87',
    challenges: '#ff6b6b',
    refines: '#00f5d4',
    diverges: '#ff9f1c',
    merges: '#7b2ff7',
    depends_on: '#f15bb5',
    references: '#fee440',
    temporal: '#00f5d4',
    replaces: '#ff6b6b',
    inherits: '#7b2ff7',
  };
  return colors[type] ?? '#94a3b8';
}
