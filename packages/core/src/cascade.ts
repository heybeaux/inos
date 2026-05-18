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

  /**
   * Cascade staleness from `changedNodeId` to every transitive dependent,
   * processing nodes in topological order (Kahn's algorithm) so that a
   * node is only re-evaluated once *all* of its parents in the affected
   * subgraph have settled.  This guarantees correct propagation through
   * diamond dependencies (A→B, A→C, B→D, C→D evaluates D exactly once,
   * after both B and C).
   *
   * `triggeredBy` always points at the original root cause
   * (`changedNodeId`), not the immediate parent — transitive descendants
   * should be traceable back to the change that initiated the cascade.
   *
   * Self-referential `dependsOn` entries (a node depending on itself)
   * are treated as no-ops to avoid infinite loops.
   */
  cascade(changedNodeId: string): CascadeResult {
    const result: CascadeResult = {
      affectedNodeIds: [],
      negatedNodeIds: [],
      orphanedNodeIds: [],
      staleNodeIds: [],
    };

    // Defensive guard: a node listing itself as a dependency would
    // create a zero-length cycle.  Drop self-loops from consideration
    // entirely (they cannot meaningfully cascade onto themselves).
    const nodeById = new Map<string, InosNode>();
    for (const n of this.graph.nodes) nodeById.set(n.id, n);

    // 1. Collect the affected subgraph rooted at changedNodeId by walking
    //    *forward* through dependents.  Skip the trigger itself — only
    //    descendants are "affected" by a cascade.
    const dependentsOf = new Map<string, string[]>();
    for (const n of this.graph.nodes) {
      for (const parentId of n.dependsOn) {
        if (parentId === n.id) continue; // self-loop guard
        if (!dependentsOf.has(parentId)) dependentsOf.set(parentId, []);
        dependentsOf.get(parentId)!.push(n.id);
      }
    }

    const affected = new Set<string>();
    const stack: string[] = [changedNodeId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const kids = dependentsOf.get(cur) ?? [];
      for (const kid of kids) {
        if (kid === changedNodeId) continue; // never re-add root
        if (affected.has(kid)) continue;
        affected.add(kid);
        stack.push(kid);
      }
    }

    if (affected.size === 0) {
      // No-op cascade: do NOT push an empty snapshot into temporalIndex.
      return result;
    }

    // 2. Kahn topological sort restricted to the affected subgraph.
    //    Edges run parent → child; "in-degree" counts how many of a
    //    node's dependsOn parents are themselves inside `affected`
    //    (parents outside the subgraph have already settled).
    const inDegree = new Map<string, number>();
    for (const id of affected) {
      const node = nodeById.get(id);
      if (!node) {
        inDegree.set(id, 0);
        continue;
      }
      let deg = 0;
      for (const parentId of node.dependsOn) {
        if (parentId === id) continue; // self-loop guard
        if (affected.has(parentId)) deg++;
      }
      inDegree.set(id, deg);
    }

    const ready: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) ready.push(id);
    }

    // Track cascade depth from the root for each affected node so
    // diamond paths report the longest (i.e. most-pessimistic) depth.
    const depthOf = new Map<string, number>();
    depthOf.set(changedNodeId, 0);

    const topoOrder: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      topoOrder.push(id);
      for (const childId of dependentsOf.get(id) ?? []) {
        if (!affected.has(childId)) continue;
        const next = (inDegree.get(childId) ?? 0) - 1;
        inDegree.set(childId, next);
        if (next === 0) ready.push(childId);
      }
    }

    // If a cycle exists entirely inside the affected subgraph, fall
    // back to processing the remaining nodes in insertion order rather
    // than dropping them silently.
    if (topoOrder.length < affected.size) {
      for (const id of affected) {
        if (!topoOrder.includes(id)) topoOrder.push(id);
      }
    }

    // 3. Walk in topological order, re-evaluating staleness so each
    //    node sees its parents' freshly-computed states.
    for (const id of topoOrder) {
      const dependent = nodeById.get(id);
      if (!dependent) continue;

      const newState = this.evaluateStaleness(dependent);
      result.affectedNodeIds.push(id);

      switch (newState) {
        case 'negated':
          result.negatedNodeIds.push(id);
          break;
        case 'orphaned':
          result.orphanedNodeIds.push(id);
          break;
        case 'stale':
          result.staleNodeIds.push(id);
          break;
      }

      // Depth = 1 + max(depth of affected parents); fall back to 1
      // when no parents are themselves affected (direct dependent of
      // the root cause).
      let parentDepth = 0;
      let sawAffectedParent = false;
      for (const parentId of dependent.dependsOn) {
        if (parentId === id) continue;
        if (depthOf.has(parentId)) {
          sawAffectedParent = true;
          parentDepth = Math.max(parentDepth, depthOf.get(parentId)!);
        }
      }
      const depth = sawAffectedParent ? parentDepth + 1 : 1;
      depthOf.set(id, depth);

      dependent.staleness = {
        state: newState,
        // Always cite the *root cause*, not the immediate parent —
        // transitive descendants should be traceable back to the
        // change that initiated the cascade.
        triggeredBy: changedNodeId,
        evaluatedAt: new Date().toISOString(),
        cascadeDepth: depth,
      };
    }

    // Only record a temporal-index snapshot when at least one node
    // actually changed.  Pushing a snapshot on every cascade call
    // (including no-ops) caused unbounded index growth.
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
      if (parentId === node.id) continue; // self-loop guard
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
