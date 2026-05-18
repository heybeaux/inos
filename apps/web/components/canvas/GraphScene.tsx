'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/lib/store';
import type { InosNode, InosEdge } from '@heybeaux/inos-types';
import { mulberry32, seedFromString } from '@heybeaux/inos-core';
import { Node3D } from './Node3D';
import { Edge3D } from './Edge3D';

// Floor for the inverse-distance / inverse-magnitude divisors below.
// `Math.sqrt(tinyPositive)` is still positive and slips past `||`
// fallbacks, but yields exploding `force / (dist * dist)` terms and
// eventually NaN positions once a coincident pair appears.
const MIN_DISTANCE = 0.1;

// Simple force-directed layout using memoized positions.
// `seedKey` makes the initial random sphere deterministic per canvas
// so the layout is reproducible across reloads, server renders, and
// visual diffs.
function useForceLayout(
  nodes: InosNode[],
  edges: InosEdge[],
  seedKey: string,
) {
  return useMemo(() => {
    if (nodes.length === 0) return new Map<string, [number, number, number]>();

    const nodeMap = new Map<string, [number, number, number]>();

    // Seed PRNG from canvas id so the same graph always lays out the
    // same way; previously `Math.random()` made every reload jitter.
    const rand = mulberry32(seedFromString(seedKey));

    // Initial random positions — scale sphere with node count
    const r = Math.max(5, Math.sqrt(nodes.length) * 1.5);
    for (const node of nodes) {
      const phi = Math.acos(2 * rand() - 1);
      const theta = rand() * Math.PI * 2;
      nodeMap.set(node.id, [
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ]);
    }

    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, new Set());
      if (!adjacency.has(edge.targetId)) adjacency.set(edge.targetId, new Set());
      adjacency.get(edge.sourceId)!.add(edge.targetId);
      adjacency.get(edge.targetId)!.add(edge.sourceId);
    }

    // Run force simulation
    const iterations = 300;
    const ids = nodes.map((n) => n.id);

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, [number, number, number]>();
      for (const id of ids) forces.set(id, [0, 0, 0]);

      // Repulsion
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = nodeMap.get(ids[i])!;
          const b = nodeMap.get(ids[j])!;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const dz = b[2] - a[2];
          const dist = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));
          const force = 8 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          const fa = forces.get(ids[i])!;
          const fb = forces.get(ids[j])!;
          forces.set(ids[i], [fa[0] - fx, fa[1] - fy, fa[2] - fz]);
          forces.set(ids[j], [fb[0] + fx, fb[1] + fy, fb[2] + fz]);
        }
      }

      // Attraction
      for (const edge of edges) {
        const a = nodeMap.get(edge.sourceId);
        const b = nodeMap.get(edge.targetId);
        if (!a || !b) continue;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        const dist = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const force = 0.02 * (dist - 3);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        const fa = forces.get(edge.sourceId)!;
        const fb = forces.get(edge.targetId)!;
        forces.set(edge.sourceId, [fa[0] + fx, fa[1] + fy, fa[2] + fz]);
        forces.set(edge.targetId, [fb[0] - fx, fb[1] - fy, fb[2] - fz]);
      }

      // Centering
      for (const id of ids) {
        const pos = nodeMap.get(id)!;
        const f = forces.get(id)!;
        forces.set(id, [f[0] - pos[0] * 0.01, f[1] - pos[1] * 0.01, f[2] - pos[2] * 0.01]);
      }

      // Apply with cooling
      const cooling = 1 - iter / iterations;
      const step = 0.5 * cooling;
      for (const id of ids) {
        const pos = nodeMap.get(id)!;
        const f = forces.get(id)!;
        nodeMap.set(id, [pos[0] + f[0] * step, pos[1] + f[1] * step, pos[2] + f[2] * step]);
      }
    }

    return nodeMap;
  }, [nodes, edges, seedKey]);
}

export function GraphScene() {
  const { nodes, edges, hoveredNodeId, setHoveredNode, openNodeDetail, visibleNodeIds, canvasName } = useGraphStore();
  // Prefer the actual canvasId from a real node so layouts stay stable
  // when the user renames the canvas; fall back to canvasName for the
  // initial empty-store render.
  const seedKey = nodes[0]?.canvasId ?? canvasName;
  const positions = useForceLayout(nodes, edges, seedKey);

  // Filter nodes and edges based on timeline visibility
  const visibleNodes = visibleNodeIds
    ? nodes.filter((n) => visibleNodeIds.has(n.id))
    : nodes;
  const visibleNodeSet = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter(
    (e) => visibleNodeSet.has(e.sourceId) && visibleNodeSet.has(e.targetId)
  );

  return (
    <group>
      {visibleNodes.map((node) => {
        const pos = positions.get(node.id) ?? [0, 0, 0];
        const isHovered = hoveredNodeId === node.id;
        return (
          <Node3D
            key={node.id}
            node={node}
            position={pos as [number, number, number]}
            isHovered={isHovered}
            onHover={() => setHoveredNode(node.id)}
            onLeave={() => setHoveredNode(null)}
            onClick={() => openNodeDetail(node)}
          />
        );
      })}

      {visibleEdges.map((edge) => {
        const sourcePos = positions.get(edge.sourceId);
        const targetPos = positions.get(edge.targetId);
        if (!sourcePos || !targetPos) return null;
        return (
          <Edge3D
            key={edge.id}
            edge={edge}
            sourcePosition={sourcePos as [number, number, number]}
            targetPosition={targetPos as [number, number, number]}
          />
        );
      })}
    </group>
  );
}
