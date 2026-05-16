import type { InosGraph, InosNode, InosEdge } from '@heybeaux/inos-types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const graphology = require('graphology');

const Graph = graphology.default ?? graphology.Graph ?? graphology;

export class InosGraphEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph: any;

  constructor(initialGraph?: InosGraph) {
    this.graph = new Graph({ multi: true, allowSelfLoops: false, type: 'directed' });
    if (initialGraph) {
      for (const node of initialGraph.nodes) {
        this.graph.addNode(node.id, node);
      }
      for (const edge of initialGraph.edges) {
        this.graph.addEdge(edge.sourceId, edge.targetId, edge);
      }
    }
  }

  addNode(node: InosNode): void {
    this.graph.addNode(node.id, node);
  }

  getNode(nodeId: string): InosNode | undefined {
    if (!this.graph.hasNode(nodeId)) return undefined;
    return this.graph.getNodeAttributes(nodeId) as InosNode;
  }

  removeNode(nodeId: string): void {
    this.graph.dropNode(nodeId);
  }

  getEdgesForNode(nodeId: string): InosEdge[] {
    return this.graph.mapAdjacentEdges(
      (_edgeId: string, attrs: unknown) => attrs as InosEdge,
    );
  }

  getDescendants(nodeId: string): string[] {
    const descendants: string[] = [];
    this.graph.forEachOutNeighbor(nodeId, (neighbor: string) => {
      descendants.push(neighbor);
    });
    return descendants;
  }

  getBranch(rootId: string): { nodes: InosNode[]; edges: InosEdge[] } {
    const visited = new Set<string>();
    const nodes: InosNode[] = [];
    const edges: InosEdge[] = [];

    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.getNode(id);
      if (node) nodes.push(node);
      this.graph.forEachOutEdge(id, (eid: string) => {
        const edge = this.graph.getEdgeAttributes(eid) as InosEdge;
        edges.push(edge);
        const target = this.graph.target(eid);
        walk(target);
      });
    };

    walk(rootId);
    return { nodes, edges };
  }

  addEdge(edge: InosEdge): void {
    this.graph.addEdge(edge.sourceId, edge.targetId, edge);
    this.validateDAG();
  }

  get allNodes(): InosNode[] {
    return this.graph.mapNodes(
      (_id: string, attrs: unknown) => attrs as InosNode,
    );
  }

  get allEdges(): InosEdge[] {
    return this.graph.mapEdges(
      (_eid: string, attrs: unknown) => attrs as InosEdge,
    );
  }

  validateDAG(): void {
    // DFS-based cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbor of this.graph.outNeighbors(nodeId)) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (inStack.has(neighbor)) {
          return true;
        }
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.graph.nodes()) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) {
          throw new Error('Cycle detected in graph. Inos graphs must be DAGs.');
        }
      }
    }
  }
}
