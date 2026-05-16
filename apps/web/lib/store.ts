import { create } from 'zustand';
import type { InosNode, InosEdge, NodeType, EdgeType, NodeAuthor, InosGraph, CanvasSummary, FactsTable } from '@heybeaux/inos-types';
import { v4 as uuidv4 } from 'uuid';

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

type PanelType = 'none' | 'facts' | 'summary' | 'query' | 'timeline' | 'node-detail' | 'import';

// Context menu state
export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  mergeMode: boolean;
}

// Command palette node type options
export const COMMAND_NODE_TYPES: { type: NodeType; label: string; icon: string }[] = [
  { type: 'claim', label: 'Claim', icon: '●' },
  { type: 'question', label: 'Question', icon: '◎' },
  { type: 'fact', label: 'Fact', icon: '■' },
  { type: 'decision', label: 'Decision', icon: '◆' },
  { type: 'evidence', label: 'Evidence', icon: '▲' },
  { type: 'assumption', label: 'Assumption', icon: '◇' },
];

// Relationship types for command palette
export const RELATIONSHIP_TYPES: { type: EdgeType; label: string }[] = [
  { type: 'supports', label: 'Supports' },
  { type: 'challenges', label: 'Challenges' },
  { type: 'depends_on', label: 'Depends On' },
  { type: 'diverges', label: 'Diverges' },
  { type: 'refines', label: 'Refines' },
];

// Default author for new nodes
const DEFAULT_AUTHOR: NodeAuthor = { type: 'human', userId: 'beaux', displayName: 'Beaux' };

interface GraphState {
  nodes: InosNode[];
  edges: InosEdge[];
  canvasName: string;
  summary: CanvasSummary | null;
  factsTable: FactsTable | null;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  zoom: number;
  sidebarOpen: boolean;
  activePanel: PanelType;
  selectedNode: InosNode | null;

  // Node creation UI state
  commandPaletteOpen: boolean;
  contextMenu: ContextMenuState;
  inlineEditId: string | null;

  // Canvas toolbar state
  toolbarPlacementMode: NodeType | null;
  showFactsPanel: boolean;
  showSummaryPanel: boolean;
  showTimelinePanel: boolean;

  // Actions
  setNodes: (nodes: InosNode[]) => void;
  setEdges: (edges: InosEdge[]) => void;
  loadGraph: (graph: InosGraph) => void;
  setFocusedNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: PanelType) => void;
  setSelectedNodeData: (node: InosNode | null) => void;
  focusNode: (nodeId: string) => void;
  openNodeDetail: (node: InosNode) => void;
  closePanels: () => void;
  loadDemo: () => void;

  // Node CRUD
  addNode: (node: Partial<InosNode>) => InosNode;
  editNode: (id: string, updates: Partial<InosNode>) => void;
  deleteNode: (id: string) => void;

  // Edge CRUD
  addEdge: (edge: Partial<InosEdge>) => InosEdge;

  // UI state
  setCommandPaletteOpen: (open: boolean) => void;
  setContextMenu: (state: Partial<ContextMenuState>) => void;
  setInlineEditId: (id: string | null) => void;
  setToolbarPlacementMode: (mode: NodeType | null) => void;
  togglePanel: (panel: 'facts' | 'summary' | 'timeline') => void;

  // Canvas interaction
  handleCanvasClick: (screenX: number, screenY: number) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  canvasName: 'Inos',
  summary: null,
  factsTable: null,
  focusedNodeId: null,
  hoveredNodeId: null,
  selectedNodeId: null,
  zoom: 1,
  sidebarOpen: false,
  activePanel: 'none',
  selectedNode: null,

  commandPaletteOpen: false,
  contextMenu: { open: false, x: 0, y: 0, nodeId: null, mergeMode: false },
  inlineEditId: null,
  toolbarPlacementMode: null,
  showFactsPanel: false,
  showSummaryPanel: false,
  showTimelinePanel: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  loadGraph: (graph) =>
    set({
      nodes: graph.nodes,
      edges: graph.edges,
      canvasName: graph.canvas.name,
      summary: graph.summary ?? null,
      factsTable: graph.factsTable ?? null,
    }),
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  setZoom: (zoom) => set({ zoom }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActivePanel: (activePanel) => set({ activePanel, sidebarOpen: activePanel !== 'none' }),
  setSelectedNodeData: (selectedNode) => set({ selectedNode }),

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

  // ── Node CRUD ──
  addNode: (partial) => {
    const now = new Date().toISOString();
    const id = partial.id || `node-${uuidv4().slice(0, 8)}`;
    const node: InosNode = {
      id,
      type: partial.type ?? 'claim',
      title: partial.title ?? 'Untitled',
      content: partial.content ?? '',
      author: partial.author ?? DEFAULT_AUTHOR,
      createdAt: partial.createdAt ?? now,
      updatedAt: now,
      visits: partial.visits ?? [],
      dependsOn: partial.dependsOn ?? [],
      staleness: partial.staleness ?? { state: 'fresh', evaluatedAt: now, cascadeDepth: 0 },
      canvasId: partial.canvasId ?? 'demo-canvas',
      status: partial.status ?? 'fresh',
      tags: partial.tags ?? [],
      schemaVersion: partial.schemaVersion ?? '1.0.0',
    };
    set((state) => ({ nodes: [...state.nodes, node] }));
    return node;
  },

  editNode: (id, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, ...updates, updatedAt: new Date().toISOString() }
          : n
      ),
    })),

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, status: 'orphaned' as const, updatedAt: new Date().toISOString() }
          : n
      ),
      edges: state.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
    })),

  // ── Edge CRUD ──
  addEdge: (partial) => {
    const now = new Date().toISOString();
    const id = partial.id || `edge-${uuidv4().slice(0, 8)}`;
    const edge: InosEdge = {
      id,
      type: partial.type ?? 'supports',
      sourceId: partial.sourceId ?? '',
      targetId: partial.targetId ?? '',
      label: partial.label,
      createdAt: partial.createdAt ?? now,
      author: partial.author ?? DEFAULT_AUTHOR,
      canvasId: partial.canvasId ?? 'demo-canvas',
      schemaVersion: partial.schemaVersion ?? '1.0.0',
    };
    set((state) => ({ edges: [...state.edges, edge] }));
    return edge;
  },

  // ── UI State ──
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  setContextMenu: (partial) =>
    set((state) => ({
      contextMenu: { ...state.contextMenu, ...partial },
    })),

  setInlineEditId: (inlineEditId) => set({ inlineEditId }),

  setToolbarPlacementMode: (toolbarPlacementMode) => set({ toolbarPlacementMode }),

  togglePanel: (panel) =>
    set((state) => {
      const key = `show${panel.charAt(0).toUpperCase()}${panel.slice(1)}Panel` as
        | 'showFactsPanel'
        | 'showSummaryPanel'
        | 'showTimelinePanel';
      return { [key]: !state[key] };
    }),

  // ── Canvas Interaction ──
  handleCanvasClick: (screenX: number, screenY: number) => {
    const { toolbarPlacementMode, addNode } = get();
    if (toolbarPlacementMode) {
      addNode({
        type: toolbarPlacementMode,
        title: `New ${toolbarPlacementMode}`,
        content: '',
      });
      set({ toolbarPlacementMode: null });
    }
  },
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

// Helper: get human-readable label for node type
export function getNodeTypeLabel(type: NodeType): string {
  return COMMAND_NODE_TYPES.find((t) => t.type === type)?.label ?? type;
}
