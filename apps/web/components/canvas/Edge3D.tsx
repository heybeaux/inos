'use client';

import type { InosEdge } from '@heybeaux/inos-types';
import { getEdgeColor } from '@/lib/store';

interface Edge3DProps {
  edge: InosEdge;
  sourcePosition: [number, number, number];
  targetPosition: [number, number, number];
}

export function Edge3D({ edge, sourcePosition, targetPosition }: Edge3DProps) {
  const color = getEdgeColor(edge.type);

  // Calculate midpoint for curved line
  const midX = (sourcePosition[0] + targetPosition[0]) / 2;
  const midY = (sourcePosition[1] + targetPosition[1]) / 2;
  const midZ = (sourcePosition[2] + targetPosition[2]) / 2;
  // Offset midpoint slightly for curve
  const perpX = -(targetPosition[1] - sourcePosition[1]) * 0.1;
  const perpY = (targetPosition[0] - sourcePosition[0]) * 0.1;
  const curvePoint: [number, number, number] = [
    midX + perpX,
    midY + perpY,
    midZ,
  ];

  return (
    <>
      {/* Main edge line */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([...sourcePosition, ...targetPosition]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.4}
        />
      </line>

      {/* Small glow dot at midpoint */}
      <mesh position={curvePoint}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
    </>
  );
}
