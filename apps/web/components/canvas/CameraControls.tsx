'use client';

import { OrbitControls } from '@react-three/drei';

export function CameraControls() {
  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={40}
      enablePan={true}
      panSpeed={0.5}
      zoomSpeed={0.8}
      rotateSpeed={0.5}
      autoRotate
      autoRotateSpeed={0.3}
      makeDefault
    />
  );
}
