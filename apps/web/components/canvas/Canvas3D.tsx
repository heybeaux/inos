'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { GraphScene } from './GraphScene';
import { CameraControls } from './CameraControls';

// Particle field for ambient ocean feel
function AmbientParticles() {
  // Generate random particle positions
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#00f5d4"
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  );
}

export default function Canvas3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 60, near: 0.1, far: 100 }}
      style={{ width: '100%', height: '100%', display: 'block' }}
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: 3, // ACESFilmicToneMapping
        toneMappingExposure: 1.2,
      }}
      dpr={[1, 2]}
    >
      {/* Lighting */}
      <ambientLight intensity={0.15} color="#1b2838" />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#00f5d4" />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#7b2ff7" />
      <pointLight position={[0, -10, 5]} intensity={0.2} color="#f15bb5" />

      {/* Scene */}
      <Suspense fallback={null}>
        <GraphScene />
        <AmbientParticles />
        <CameraControls />
      </Suspense>
    </Canvas>
  );
}
