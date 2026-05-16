'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/lib/store';
import type { InosNode, InosEdge } from '@heybeaux/inos-types';
import { Node3D } from './Node3D';
import { Edge3D } from './Edge3D';

// Simple force-directed layout using memoized positions
function useForceLayout(nodes: InosNode[], edges: InosEdge[]) {
  return useMemo(() => {
    if (nodes.length === 0) return new Map<string, [number, number, number]>();

    const nodeMap = new Map<string, [number, number, number]>();

    // Initial random positions — scale sphere with node count
    const r = Math.max(5, Math.sqrt(nodes.length) * 1.5);
    for (const node of nodes) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
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
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
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
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
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
  }, [nodes, edges]);
}

export function GraphScene() {
  const { nodes, edges, hoveredNodeId, setHoveredNode, openNodeDetail } = useGraphStore();
  const positions = useForceLayout(nodes, edges);

  return (
    <group>
      {nodes.map((node) => {
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

      {edges.map((edge) => {
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
