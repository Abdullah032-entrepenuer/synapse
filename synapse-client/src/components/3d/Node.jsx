// ============================================================
//  synapse-client/src/components/3d/Node.jsx  (v3 — Native Lerp Physics)
//
//  Physics-based, draggable 3D knowledge node utilizing native
//  Three.js lerp instead of react-spring to guarantee React 19
//  compatibility and prevent black screen rendering crashes.
// ============================================================

import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import { useDrag } from "@use-gesture/react";
import * as THREE from "three";

import useSynapseStore from "../../store/useSynapseStore";

const SIZE_BY_LEVEL = { 0: 0.55, 1: 0.32, 2: 0.22 };
const DEFAULT_SIZE  = 0.25;
const COLLISION_RADIUS = 2.2;

const Node = ({ node, onFusion, onExpand }) => {
  const { id, label, level = 1, position, color } = node;
  const [hovered, setHovered] = useState(false);
  const isDragging = useSynapseStore((s) => s.isDragging);

  // Safe coordinate normalization
  const px = Number.isFinite(position?.x) ? position.x : 0;
  const py = Number.isFinite(position?.y) ? position.y : 0;
  const pz = Number.isFinite(position?.z) ? position.z : 0;
  const safeColor = color || "#00ffcc";

  const { camera, gl, raycaster } = useThree();

  // Animation target states tracking via refs (bypasses React loop for 60FPS)
  const groupRef = useRef();
  const meshRef = useRef();
  const materialRef = useRef();
  const floatRef = useRef();

  const originalPos = useMemo(() => new THREE.Vector3(px, py, pz), [px, py, pz]);
  const targetPos   = useRef(new THREE.Vector3(px, py, pz));
  const targetScale = useRef(new THREE.Vector3(1, 1, 1));
  const targetEmissive = useRef(0.6);

  // Dragging mechanics state
  const draggedPos  = useRef(new THREE.Vector3(px, py, pz));
  const dragPlane   = useRef(new THREE.Plane());
  const hitPoint    = useRef(new THREE.Vector3());
  const fusionFired = useRef(false);

  const setIsDragging = useSynapseStore((s) => s.setIsDragging);
  const baseRadius = SIZE_BY_LEVEL[level] ?? DEFAULT_SIZE;

  // Smooth frame loop physics
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Use delta to normalize speed across high-refresh displays
    const lerpFactor = Math.min(1, delta * 8);

    // 1. Smoothly slide position toward target
    groupRef.current.position.lerp(targetPos.current, lerpFactor);

    // 2. Smoothly adjust scale
    if (meshRef.current) {
      meshRef.current.scale.lerp(targetScale.current, lerpFactor);
    }

    // 3. Smoothly fade emissive intensity bloom
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        targetEmissive.current,
        lerpFactor
      );
    }

    // 4. Floating idle offset
    if (floatRef.current) {
      const phase = (px + py + pz) * 0.31;
      floatRef.current.position.y =
        Math.sin(state.clock.elapsedTime * 0.6 + phase) * 0.06;
    }
  });

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
    if (hovered && !isDragging) {
      targetScale.current.set(1.15, 1.15, 1.15);
      targetEmissive.current = 1.5;
    } else if (!isDragging) {
      targetScale.current.set(1, 1, 1);
      targetEmissive.current = 0.6;
    }
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, isDragging]);

  const bind = useDrag(
    ({ active, last, first, event }) => {
      event?.stopPropagation?.();

      if (first) {
        fusionFired.current = false;
        setIsDragging(true);

        const toCam = camera.position
          .clone()
          .sub(draggedPos.current)
          .normalize();
        dragPlane.current.setFromNormalAndCoplanarPoint(toCam, draggedPos.current);

        targetScale.current.set(1.3, 1.3, 1.3);
        targetEmissive.current = 2.8;
      }

      if (active) {
        const ne = event?.nativeEvent ?? event;
        if (!ne?.clientX) return;

        const rect = gl.domElement.getBoundingClientRect();
        const ndcX =  ((ne.clientX - rect.left) / rect.width)  * 2 - 1;
        const ndcY = -((ne.clientY - rect.top)  / rect.height) * 2 + 1;

        raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
        if (raycaster.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
          draggedPos.current.copy(hitPoint.current);
          targetPos.current.copy(hitPoint.current);
        }
      }

      if (last) {
        setIsDragging(false);
        targetScale.current.set(1, 1, 1);
        targetEmissive.current = 0.6;

        const allNodes = useSynapseStore.getState().nodes;
        let closestNode = null;
        let minDist = COLLISION_RADIUS;

        for (const other of allNodes) {
          if (other.id === id) continue;

          const ox = other.position?.x ?? 0;
          const oy = other.position?.y ?? 0;
          const oz = other.position?.z ?? 0;

          const dist = draggedPos.current.distanceTo(new THREE.Vector3(ox, oy, oz));
          if (dist < minDist) {
            minDist = dist;
            closestNode = other;
          }
        }

        if (closestNode && !fusionFired.current) {
          fusionFired.current = true;

          const cx = closestNode.position?.x ?? 0;
          const cy = closestNode.position?.y ?? 0;
          const cz = closestNode.position?.z ?? 0;

          // Magnetic snap to target
          targetPos.current.set(cx, cy, cz);
          targetScale.current.set(1.6, 1.6, 1.6);
          targetEmissive.current = 4.0;

          // Quick flash decay
          setTimeout(() => {
            targetEmissive.current = 0.6;
            targetScale.current.set(1, 1, 1);
          }, 320);

          // Elastic bounce home
          setTimeout(() => {
            targetPos.current.copy(originalPos);
            draggedPos.current.copy(originalPos);
          }, 700);

          onFusion?.(node, closestNode, draggedPos.current.clone());
        } else {
          targetPos.current.copy(originalPos);
          draggedPos.current.copy(originalPos);
        }
      }
    },
    {
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      const current = useSynapseStore.getState().selectedNode;
      useSynapseStore.getState().setSelectedNode?.(
        current?.id === id ? null : node
      );
    },
    [id, node]
  );

  const handleDoubleClick = useCallback(
    (e) => {
      e.stopPropagation();
      onExpand?.(node);
    },
    [node, onExpand]
  );

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      <group ref={floatRef}>
        <mesh
          ref={meshRef}
          {...bind()}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          castShadow
        >
          <sphereGeometry args={[baseRadius, 16, 12]} />
          <meshStandardMaterial
            ref={materialRef}
            color={safeColor}
            emissive={safeColor}
            emissiveIntensity={0.6}
            roughness={0.1}
            metalness={0.3}
            transparent
            opacity={0.88}
          />
        </mesh>

        {level === 0 && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[baseRadius * 1.45, baseRadius * 1.65, 32]} />
            <meshBasicMaterial
              color={safeColor}
              transparent
              opacity={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}

        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, baseRadius + 0.24, 0]}
            fontSize={level === 0 ? 0.28 : 0.2}
            color={safeColor}
            anchorX="center"
            anchorY="bottom"
            maxWidth={2.5}
            textAlign="center"
            renderOrder={1}
            depthOffset={-1}
          >
            {label}
          </Text>
        </Billboard>
      </group>
    </group>
  );
};

export default Node;
