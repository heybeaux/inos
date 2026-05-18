'use client';

import { useRef, useCallback } from 'react';
import type * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Text, MeshDistortMaterial } from '@react-three/drei';
import type { InosNode } from '@heybeaux/inos-types';
import { useGraphStore, getNodeColor } from '@/lib/store';

// Node shapes by type
function NodeShape({
  type,
  color,
  isHovered,
  isSelected,
}: {
  type: InosNode['type'];
  color: string;
  isHovered: boolean;
  isSelected: boolean;
}) {
  const scale = isHovered || isSelected ? 1.3 : 1.0;
  const emissiveIntensity = isSelected ? 1.0 : isHovered ? 0.8 : 0.3;

  switch (type) {
    case 'claim':
      return (
        <mesh scale={[scale, scale, scale]}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
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
            emissiveIntensity={emissiveIntensity}
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
            emissiveIntensity={emissiveIntensity}
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
            emissiveIntensity={emissiveIntensity}
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
            emissiveIntensity={emissiveIntensity}
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
  const { setContextMenu, setInlineEditId, selectedNodeId, setSelectedNode } = useGraphStore();
  const isSelected = selectedNodeId === node.id;
  const lastClickTime = useRef(0);

  // Gentle bobbing animation
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.getElapsedTime();
      const offset = node.id.charCodeAt(node.id.length - 1) * 0.5;
      groupRef.current.position.y = position[1] + Math.sin(t * 0.8 + offset) * 0.15;
    }
  });

  // Double-click handler → open inline editor
  const handleDoubleClick = useCallback(() => {
    setInlineEditId(node.id);
  }, [node.id, setInlineEditId]);

  // Right-click handler → open context menu
  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // Convert 3D position to screen coordinates for the context menu
      const canvas = e.nativeEvent?.target as HTMLCanvasElement | undefined;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setContextMenu({
          open: true,
          x: e.nativeEvent?.clientX ?? rect.width / 2,
          y: e.nativeEvent?.clientY ?? rect.height / 2,
          nodeId: node.id,
          mergeMode: false,
        });
      }
    },
    [node.id, setContextMenu]
  );

  // Click handler with double-click detection
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastClickTime.current < 300) {
        handleDoubleClick();
        return;
      }
      lastClickTime.current = now;
      setSelectedNode(node.id);
      onClick();
    },
    [onClick, handleDoubleClick, setSelectedNode, node.id]
  );

  return (
    <group ref={groupRef} position={position}>
      {/* Glow halo — brighter when selected */}
      <mesh>
        <sphereGeometry args={[isSelected ? 1.0 : isHovered ? 0.9 : 0.7, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.25 : isHovered ? 0.15 : 0.06}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.65, 0.02, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      )}

      {/* Main shape */}
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover();
        }}
        onPointerOut={onLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <NodeShape type={node.type} color={color} isHovered={isHovered} isSelected={isSelected} />
      </group>

      {/* Label */}
      <Text
        position={[0, -0.9, 0]}
        fontSize={0.22}
        color={isHovered || isSelected ? '#ffffff' : '#94a3b8'}
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
