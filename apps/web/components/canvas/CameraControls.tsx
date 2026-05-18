'use client';

import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useGraphStore } from '@/lib/store';

// Base camera distance from origin — matches Canvas3D's initial position [0,0,30].
// Toolbar zoom % is interpreted as: distance = BASE / zoom.
const BASE_DISTANCE = 30;

export function CameraControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const zoom = useGraphStore((s) => s.zoom);

  // Drive camera distance from the toolbar zoom value. We move the
  // camera along its existing direction so orbit rotation is preserved.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = controls.target;
    const dir = camera.position.clone().sub(target);
    const currentDist = dir.length();
    if (currentDist === 0) return;
    const desiredDist = BASE_DISTANCE / Math.max(zoom, 0.0001);
    const clamped = Math.min(60, Math.max(3, desiredDist));
    dir.setLength(clamped);
    camera.position.copy(target).add(dir);
    controls.update();
  }, [zoom, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={60}
      enablePan={true}
      panSpeed={0.5}
      zoomSpeed={0.8}
      rotateSpeed={0.5}
      makeDefault
    />
  );
}
