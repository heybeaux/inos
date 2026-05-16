'use client';

import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text, MeshDistortMaterial } from '@react-three/drei';
import type { InosNode } from '@heybeaux/inos-types';
import { getNodeColor } from '@/lib/store';

// Node shapes by type
function NodeShape({
  type,
  color,
  isHovered,
}: {
  type: InosNode['type'];
  color: string;
  isHovered: boolean;
}) {
  const scale = isHovered ? 1.3 : 1.0;

  switch (type) {
    case 'claim':
      return (
        <mesh scale={[scale, scale, scale]}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHovered ? 0.8 : 0.3}
            distort={0.3}
            speed={2}
            transparent
            opacity={0.85}
          />
        </mesh>
      );
    case 'decision':
      return (
        <mesh scale={[scale, scale, scale]} rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.5, 0]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHovered ? 0.8 : 0.3}
            distort={0.2}
            speed={1.5}
            transparent
            opacity={0.85}
          />
        </mesh>
      );
    case 'fact':
      return (
        <mesh scale={[scale, scale, scale]}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHovered ? 0.8 : 0.3}
            distort={0.1}
            speed={1}
            transparent
            opacity={0.85}
          />
        </mesh>
      );
    case 'question':
      return (
        <mesh scale={[scale, scale, scale]}>
          <torusGeometry args={[0.4, 0.15, 16, 32]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHovered ? 0.8 : 0.3}
            distort={0.15}
            speed={2.5}
            transparent
            opacity={0.85}
          />
        </mesh>
      );
    default:
      return (
        <mesh scale={[scale, scale, scale]}>
          <dodecahedronGeometry args={[0.5, 0]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHovered ? 0.8 : 0.3}
            distort={0.2}
            speed={1.5}
            transparent
            opacity={0.85}
          />
        </mesh>
      );
  }
}

interface Node3DProps {
  node: InosNode;
  position: [number, number, number];
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}

export function Node3D({ node, position, isHovered, onHover, onLeave, onClick }: Node3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const color = getNodeColor(node.type);

  // Gentle bobbing animation
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.getElapsedTime();
      const offset = node.id.charCodeAt(node.id.length - 1) * 0.5;
      groupRef.current.position.y = position[1] + Math.sin(t * 0.8 + offset) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[isHovered ? 0.9 : 0.7, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.15 : 0.06}
        />
      </mesh>

      {/* Main shape */}
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover();
        }}
        onPointerOut={onLeave}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <NodeShape type={node.type} color={color} isHovered={isHovered} />
      </group>

      {/* Label */}
      <Text
        position={[0, -0.9, 0]}
        fontSize={0.22}
        color={isHovered ? '#ffffff' : 'var(--text-secondary)'}
        anchorX="center"
        anchorY="middle"
        maxWidth={3}
        textAlign="center"
        font={undefined}
      >
        {node.title.length > 35 ? node.title.slice(0, 35) + '…' : node.title}
      </Text>
    </group>
  );
}
