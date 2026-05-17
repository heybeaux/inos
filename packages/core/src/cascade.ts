import type { InosNode, InosGraph } from '@heybeaux/inos-types';

export type CascadeResult = {
  affectedNodeIds: string[];
  negatedNodeIds: string[];
  orphanedNodeIds: string[];
  staleNodeIds: string[];
};

export class CascadeEngine {
  private graph: InosGraph;

  constructor(graph: InosGraph) {
    this.graph = graph;
  }

  cascade(changedNodeId: string): CascadeResult {
    const result: CascadeResult = {
      affectedNodeIds: [],
      negatedNodeIds: [],
      orphanedNodeIds: [],
      staleNodeIds: [],
    };

    const queue: { nodeId: string; depth: number }[] = [
      { nodeId: changedNodeId, depth: 0 },
    ];
    const visited = new Set<string>([changedNodeId]);

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      const dependents = this.graph.nodes.filter((n: InosNode) =>
        n.dependsOn.includes(nodeId),
      );

      for (const dependent of dependents) {
        if (visited.has(dependent.id)) continue;
        visited.add(dependent.id);

        const newState = this.evaluateStaleness(dependent);
        result.affectedNodeIds.push(dependent.id);

        switch (newState) {
          case 'negated':
            result.negatedNodeIds.push(dependent.id);
            break;
          case 'orphaned':
            result.orphanedNodeIds.push(dependent.id);
            break;
          case 'stale':
            result.staleNodeIds.push(dependent.id);
            break;
        }

        dependent.staleness = {
          state: newState,
          triggeredBy: nodeId,
          evaluatedAt: new Date().toISOString(),
          cascadeDepth: depth + 1,
        };

        queue.push({ nodeId: dependent.id, depth: depth + 1 });
      }
    }

    this.graph.temporalIndex.push({
      timestamp: new Date().toISOString(),
      changedNodes: result.affectedNodeIds,
      changedEdges: [],
      delta: {
        nodes: this.graph.nodes.filter((n: InosNode) =>
          result.affectedNodeIds.includes(n.id),
        ),
        edges: [],
      },
    });

    return result;
  }

  private evaluateStaleness(node: InosNode): InosNode['staleness']['state'] {
    if (node.dependsOn.length === 0) return node.staleness.state;

    const parents: InosNode[] = [];
    let hasMissingParent = false;
    for (const parentId of node.dependsOn) {
      const parent = this.graph.nodes.find((n: InosNode) => n.id === parentId);
      if (parent) {
        parents.push(parent);
      } else {
        hasMissingParent = true;
      }
    }

    if (parents.some((p) => p.staleness.state === 'negated')) return 'negated';
    if (hasMissingParent) return 'orphaned';
    if (parents.some((p) => p.staleness.state === 'orphaned')) return 'orphaned';
    if (parents.some((p) => p.staleness.state === 'stale')) return 'stale';
    if (parents.some((p) => p.updatedAt > node.updatedAt)) return 'stale';

    return 'fresh';
  }
}
