import { create } from 'zustand';
import type { InosNode, InosEdge, NodeType, EdgeType, NodeAuthor, InosGraph, CanvasSummary, FactsTable } from '@heybeaux/inos-types';
import { v4 as uuidv4 } from 'uuid';
import { generateDemoGraph } from '@/lib/demo-data';

type PanelType = 'none' | 'facts' | 'summary' | 'query' | 'timeline' | 'node-detail' | 'import' | 'create';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  mergeMode: boolean;
}

export const COMMAND_NODE_TYPES: { type: NodeType; label: string; icon: string }[] = [
  { type: 'claim', label: 'Claim', icon: '●' },
  { type: 'question', label: 'Question', icon: '◎' },
  { type: 'fact', label: 'Fact', icon: '■' },
  { type: 'decision', label: 'Decision', icon: '◆' },
  { type: 'evidence', label: 'Evidence', icon: '▲' },
  { type: 'assumption', label: 'Assumption', icon: '◇' },
];

export const RELATIONSHIP_TYPES: { type: EdgeType; label: string }[] = [
  { type: 'supports', label: 'Supports' },
  { type: 'challenges', label: 'Challenges' },
  { type: 'depends_on', label: 'Depends On' },
  { type: 'diverges', label: 'Diverges' },
  { type: 'refines', label: 'Refines' },
];

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
  timelineProgress: number;
  visibleNodeIds: Set<string> | null;
  commandPaletteOpen: boolean;
  contextMenu: ContextMenuState;
  inlineEditId: string | null;
  toolbarPlacementMode: NodeType | null;
  showFactsPanel: boolean;
  showSummaryPanel: boolean;
  showTimelinePanel: boolean;

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
  setTimelineProgress: (progress: number) => void;
  addNode: (node: Partial<InosNode>) => InosNode;
  editNode: (id: string, updates: Partial<InosNode>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Partial<InosEdge>) => InosEdge;
  setCommandPaletteOpen: (open: boolean) => void;
  setContextMenu: (state: Partial<ContextMenuState>) => void;
  setInlineEditId: (id: string | null) => void;
  setToolbarPlacementMode: (mode: NodeType | null) => void;
  togglePanel: (panel: 'facts' | 'summary' | 'timeline') => void;
  handleCanvasClick: (screenX: number, screenY: number) => void;
}

function computeVisible(nodes: InosNode[], progress: number): Set<string> | null {
  if (progress >= 100 || nodes.length === 0) return null;
  const ts = nodes.map((n) => new Date(n.createdAt).getTime()).sort((a, b) => a - b);
  const cutoff = ts[0] + (ts[ts.length - 1] - ts[0]) * (progress / 100);
  return new Set(nodes.filter((n) => new Date(n.createdAt).getTime() <= cutoff).map((n) => n.id));
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
  timelineProgress: 100,
  visibleNodeIds: null,
  commandPaletteOpen: false,
  contextMenu: { open: false, x: 0, y: 0, nodeId: null, mergeMode: false },
  inlineEditId: null,
  toolbarPlacementMode: null,
  showFactsPanel: false,
  showSummaryPanel: false,
  showTimelinePanel: false,

  setNodes: (nodes) => set({ nodes, visibleNodeIds: computeVisible(nodes, get().timelineProgress) }),
  setEdges: (edges) => set({ edges }),
  loadGraph: (graph) => set({
    nodes: graph.nodes, edges: graph.edges, canvasName: graph.canvas.name,
    summary: graph.summary ?? null, factsTable: graph.factsTable ?? null,
    visibleNodeIds: computeVisible(graph.nodes, get().timelineProgress),
  }),
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  setZoom: (zoom) => set({ zoom }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActivePanel: (activePanel) => set({ activePanel, sidebarOpen: activePanel !== 'none' }),
  setSelectedNodeData: (selectedNode) => set({ selectedNode }),
  focusNode: (nodeId) => set({ focusedNodeId: nodeId }),
  openNodeDetail: (node) => set({ selectedNode: node, activePanel: 'node-detail', sidebarOpen: true, focusedNodeId: node.id }),
  closePanels: () => set({ sidebarOpen: false, activePanel: 'none', selectedNode: null, focusedNodeId: null }),
  loadDemo: () => {
    const graph = generateDemoGraph();
    set({ nodes: graph.nodes, edges: graph.edges, canvasName: graph.canvas.name,
      summary: graph.summary ?? null, factsTable: graph.factsTable ?? null, visibleNodeIds: null });
  },
  setTimelineProgress: (progress) => set({ timelineProgress: progress, visibleNodeIds: computeVisible(get().nodes, progress) }),
  addNode: (partial) => {
    const now = new Date().toISOString();
    const id = partial.id || `node-${uuidv4().slice(0, 8)}`;
    const node: InosNode = { id, type: partial.type ?? 'claim', title: partial.title ?? 'Untitled',
      content: partial.content ?? '', author: partial.author ?? DEFAULT_AUTHOR, createdAt: partial.createdAt ?? now,
      updatedAt: now, visits: partial.visits ?? [], dependsOn: partial.dependsOn ?? [],
      staleness: partial.staleness ?? { state: 'fresh', evaluatedAt: now, cascadeDepth: 0 },
      canvasId: partial.canvasId ?? 'demo-canvas', status: partial.status ?? 'fresh',
      tags: partial.tags ?? [], schemaVersion: partial.schemaVersion ?? '1.0.0' };
    set((s) => { const nn = [...s.nodes, node]; return { nodes: nn, visibleNodeIds: computeVisible(nn, s.timelineProgress) }; });
    return node;
  },
  editNode: (id, updates) => set((s) => ({ nodes: s.nodes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n) })),
  deleteNode: (id) => set((s) => ({ nodes: s.nodes.map((n) => n.id === id ? { ...n, status: 'orphaned' as const, updatedAt: new Date().toISOString() } : n),
    edges: s.edges.filter((e) => e.sourceId !== id && e.targetId !== id) })),
  addEdge: (partial) => {
    const now = new Date().toISOString();
    const edge: InosEdge = { id: partial.id || `edge-${uuidv4().slice(0, 8)}`, type: partial.type ?? 'supports',
      sourceId: partial.sourceId ?? '', targetId: partial.targetId ?? '', label: partial.label,
      createdAt: partial.createdAt ?? now, author: partial.author ?? DEFAULT_AUTHOR,
      canvasId: partial.canvasId ?? 'demo-canvas', schemaVersion: partial.schemaVersion ?? '1.0.0' };
    set((s) => ({ edges: [...s.edges, edge] }));
    return edge;
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setContextMenu: (p) => set((s) => ({ contextMenu: { ...s.contextMenu, ...p } })),
  setInlineEditId: (id) => set({ inlineEditId: id }),
  setToolbarPlacementMode: (mode) => set({ toolbarPlacementMode: mode }),
  togglePanel: (panel) => set((s) => {
    const key = `show${panel.charAt(0).toUpperCase()}${panel.slice(1)}Panel` as keyof GraphState;
    return { [key]: !s[key] };
  }),
  handleCanvasClick: (screenX: number, screenY: number) => {
    const { toolbarPlacementMode, addNode } = get();
    if (toolbarPlacementMode) { addNode({ type: toolbarPlacementMode, title: `New ${toolbarPlacementMode}`, content: '' }); set({ toolbarPlacementMode: null }); }
  },
}));

export function getNodeColor(type: InosNode['type']): string {
  const c: Record<string, string> = { claim:'#00f5d4', question:'#f15bb5', decision:'#7b2ff7', evidence:'#00ff87', branch:'#fee440', synthesis:'#00f5d4', deliberation:'#ff9f1c', constraint:'#ff6b6b', assumption:'#f15bb5', insight:'#00f5d4', artifact:'#7b2ff7', fact:'#00ff87' };
  return c[type] ?? '#00f5d4';
}

export function getEdgeColor(type: InosEdge['type']): string {
  const c: Record<string, string> = { supports:'#00ff87', challenges:'#ff6b6b', refines:'#00f5d4', diverges:'#ff9f1c', merges:'#7b2ff7', depends_on:'#f15bb5', references:'#fee440', temporal:'#00f5d4', replaces:'#ff6b6b', inherits:'#7b2ff7' };
  return c[type] ?? '#94a3b8';
}

export function getNodeTypeLabel(type: NodeType): string {
  return COMMAND_NODE_TYPES.find((t) => t.type === type)?.label ?? type;
}
