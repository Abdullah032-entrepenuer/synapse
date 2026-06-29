// ============================================================
//  synapse-client/src/components/3d/ParticleField.jsx
//
//  Renders a subtle deep-space star field as a background.
//
//  Performance approach — INSTANCING:
//    Rather than creating 2000 individual <mesh> objects
//    (which would each be a separate draw call = GPU bottleneck),
//    we use THREE.Points with a single BufferGeometry.
//    This renders ALL stars in ONE draw call regardless of count.
//
//    2000 stars = 1 draw call (with Points)
//    2000 stars = 2000 draw calls (with individual meshes) ← NEVER do this
// ============================================================

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 2000;

const ParticleField = () => {
  const pointsRef = useRef();

  // Generate random star positions ONCE using useMemo.
  // Float32Array is required by BufferGeometry — it's 4x more
  // memory-efficient than a standard JS number array.
  const { positions, sizes } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Spread stars in a large cube around the scene
      positions[i3]     = (Math.random() - 0.5) * 100; // X
      positions[i3 + 1] = (Math.random() - 0.5) * 100; // Y
      positions[i3 + 2] = (Math.random() - 0.5) * 100; // Z
      // Vary star sizes slightly
      sizes[i] = Math.random() * 1.5 + 0.5;
    }

    return { positions, sizes };
  }, []);

  // Very slow rotation of the entire star field for a subtle
  // "the universe is rotating" feeling
  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.008;
    pointsRef.current.rotation.x = state.clock.elapsedTime * 0.003;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c8b8ff"
        size={0.08}
        sizeAttenuation={true} // Stars shrink with distance (perspective)
        transparent
        opacity={0.6}
        depthWrite={false} // Prevents star z-fighting with nodes
      />
    </points>
  );
};

export default ParticleField;
