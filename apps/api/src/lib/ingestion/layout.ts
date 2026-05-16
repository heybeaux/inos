/**
 * Simple 3D force-directed layout for initial node positioning.
 *
 * - Nodes repel each other (Coulomb's law)
 * - Connected nodes attract (Hooke's law / spring)
 * - Root/topic node pinned near center (0, 0, 0)
 *
 * This is a basic implementation — not a full physics engine.
 * Good enough for initial placement; the frontend can refine with d3-force-3d.
 */

import type { ExtractedNode, ExtractedEdge, PositionedNode } from './types.js';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const REPULSION_STRENGTH = 800;
const ATTRACTION_STRENGTH = 0.005;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.85;
const MAX_ITERATIONS = 300;
const MIN_DISTANCE = 1;

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < MIN_DISTANCE) return vec3(0, 0, 0);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function randomPosition(): Vec3 {
  const spread = 200;
  return vec3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread
  );
}

/**
 * Run force-directed layout on extracted nodes and edges.
 * Returns nodes with { x, y, z } positions.
 */
export function forceLayout(
  nodes: ExtractedNode[],
  edges: ExtractedEdge[]
): PositionedNode[] {
  if (nodes.length === 0) return [];

  // Initialize positions randomly
  const positions: Vec3[] = nodes.map(() => randomPosition());
  const velocities: Vec3[] = nodes.map(() => vec3());

  // Build adjacency for quick lookup
  const adjacency = new Map<string, Set<number>>();
  for (const edge of edges) {
    const srcIdx = nodes.findIndex((n) => n.id === edge.source);
    const tgtIdx = nodes.findIndex((n) => n.id === edge.target);
    if (srcIdx === -1 || tgtIdx === -1) continue;

    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(tgtIdx);
    adjacency.get(edge.target)!.add(srcIdx);
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const temperature = 1 - iter / MAX_ITERATIONS;

    // Reset forces
    const forces: Vec3[] = nodes.map(() => vec3());

    // Repulsion: all pairs repel
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const diff = sub(positions[i], positions[j]);
        const dist = Math.max(length(diff), MIN_DISTANCE);
        const repForce = REPULSION_STRENGTH / (dist * dist);
        const dir = normalize(diff);
        const f = scale(dir, repForce);
        forces[i] = add(forces[i], f);
        forces[j] = add(forces[j], scale(f, -1));
      }
    }

    // Attraction: connected nodes attract (spring)
    for (const edge of edges) {
      const srcIdx = nodes.findIndex((n) => n.id === edge.source);
      const tgtIdx = nodes.findIndex((n) => n.id === edge.target);
      if (srcIdx === -1 || tgtIdx === -1) continue;

      const diff = sub(positions[tgtIdx], positions[srcIdx]);
      const dist = length(diff);
      const idealDist = 100;
      const attForce = (dist - idealDist) * ATTRACTION_STRENGTH;
      const dir = normalize(diff);
      const f = scale(dir, attForce);
      forces[srcIdx] = add(forces[srcIdx], f);
      forces[tgtIdx] = add(forces[tgtIdx], scale(f, -1));
    }

    // Gravity toward center
    for (let i = 0; i < nodes.length; i++) {
      const toCenter = scale(positions[i], -1);
      forces[i] = add(forces[i], scale(toCenter, CENTER_GRAVITY));
    }

    // Update velocities and positions
    for (let i = 0; i < nodes.length; i++) {
      velocities[i] = scale(add(velocities[i], forces[i]), DAMPING);
      // Clamp velocity
      const vLen = length(velocities[i]);
      if (vLen > 50) {
        velocities[i] = scale(normalize(velocities[i]), 50);
      }
      positions[i] = add(positions[i], scale(velocities[i], temperature));
    }

    // Early exit if converged
    const totalEnergy = velocities.reduce(
      (sum, v) => sum + length(v) * length(v),
      0
    );
    if (totalEnergy < 0.01) break;
  }

  // Map back to PositionedNode
  return nodes.map((node, i) => ({
    ...node,
    x: Math.round(positions[i].x * 100) / 100,
    y: Math.round(positions[i].y * 100) / 100,
    z: Math.round(positions[i].z * 100) / 100,
  }));
}
