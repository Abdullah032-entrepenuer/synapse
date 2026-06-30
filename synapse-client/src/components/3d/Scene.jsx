// ============================================================
//  synapse-client/src/components/3d/Scene.jsx  (v2 — Synaptic Fusion)
//
//  Orchestrates the 3D scene AND owns the Synaptic Fusion pipeline:
//
//    1. Reads nodes/edges from Zustand (self-sufficient — no props)
//    2. Disables OrbitControls while any node is being dragged
//    3. handleFusion() — fires POST /api/generate-synapse on collision
//    4. Offsets returned nodes to spawn near the collision point
//    5. Remaps returned edge IDs to match prefixed unique node IDs
//    6. Calls addMergedNodes() — appends without resetting the scene
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls }  from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE          from "three";

import Node           from "./Node";
import Edges          from "./Edges";
import ParticleField  from "./ParticleField";
import useSynapseStore from "../../store/useSynapseStore";
import { getSafePosition } from "../../utils/coordinateHelper";
import { fetchSynapseExpansion } from "../../api/synapseApi";

// ── API base URL (Vite env) ────────────────────────────────
const API_URL = import.meta.env.PROD
  ? "/api"
  : (import.meta.env.VITE_API_URL || "http://localhost:5001/api");

// ── Spread radius for spawned fusion cluster ───────────────
const FUSION_SPAWN_SPREAD = 0.45;

// ─────────────────────────────────────────────────────────────
//  MOUSE LIGHT
//  Dynamic point light that follows the mouse to cast tactile
//  glowing reflections across the metallic nodes.
// ─────────────────────────────────────────────────────────────
const MouseLight = () => {
  const lightRef = useRef();
  const { viewport } = useThree();

  useFrame((state) => {
    if (!lightRef.current) return;
    const x = (state.pointer.x * viewport.width) / 2;
    const y = (state.pointer.y * viewport.height) / 2;
    lightRef.current.position.set(x, y, 5);
  });

  return (
    <pointLight
      ref={lightRef}
      intensity={2.5}
      color="#06b6d4"
      distance={15}
      decay={2}
    />
  );
};

// ─────────────────────────────────────────────────────────────
//  CAMERA ANIMATOR
//  Smooth fly-in whenever the graph is first loaded.
// ─────────────────────────────────────────────────────────────
const CameraAnimator = ({ shouldAnimate }) => {
  const { camera }   = useThree();
  const isAnimating  = useRef(false);
  const progress     = useRef(0);
  const startPos     = useRef(new THREE.Vector3());
  const targetPos    = useRef(new THREE.Vector3(0, 2, 18));

  // Trigger a new fly-in whenever shouldAnimate changes to true
  useEffect(() => {
    if (!shouldAnimate) return;
    const nodes = useSynapseStore.getState().nodes;
    if (nodes.length === 0) return;

    const maxDist = nodes.reduce((m, n) => {
      const pos = getSafePosition(n);
      return Math.max(m, new THREE.Vector3(pos.x, pos.y, pos.z).length());
    }, 0);
    targetPos.current.set(0, 2, Math.max(12, maxDist * 2.5));
    startPos.current.copy(camera.position);
    progress.current  = 0;
    isAnimating.current = true;
  }, [shouldAnimate, camera]);

  useFrame((_, delta) => {
    if (!isAnimating.current) return;
    progress.current = Math.min(progress.current + delta * 0.8, 1);
    const ease = 1 - Math.pow(1 - progress.current, 3); // ease-out cubic
    camera.position.lerpVectors(startPos.current, targetPos.current, ease);
    camera.lookAt(0, 0, 0);
    if (progress.current >= 1) isAnimating.current = false;
  });

  return null;
};

// ─────────────────────────────────────────────────────────────
//  SCENE COMPONENT
// ─────────────────────────────────────────────────────────────
const Scene = ({ didLoad }) => {
  const orbitRef = useRef();

  // ── Read graph from store (no props needed) ────────────
  const nodes        = useSynapseStore((s) => s.nodes);
  const edges        = useSynapseStore((s) => s.edges);
  const isDragging   = useSynapseStore((s) => s.isDragging);
  const addMergedNodes = useSynapseStore((s) => s.addMergedNodes);
  const setIsFusing  = useSynapseStore((s) => s.setIsFusing);
  const setIsExpanding = useSynapseStore((s) => s.setIsExpanding);

  // ── Disable OrbitControls during drag ──────────────────
  // This is the KEY integration point: when a node is being
  // dragged, OrbitControls must be disabled so the camera
  // doesn't spin. We sync it via the isDragging flag in Zustand.
  useEffect(() => {
    if (orbitRef.current) {
      orbitRef.current.enabled = !isDragging;
    }
  }, [isDragging]);

  // ─────────────────────────────────────────────────────────
  //  HANDLE FUSION — called by Node.jsx on collision
  //
  //  Pipeline:
  //    A. Build a fusion query from the two node labels
  //    B. POST to /api/generate-synapse
  //    C. Offset the returned nodes to spawn near the collision point
  //    D. Prefix node IDs to guarantee uniqueness in the global graph
  //    E. Remap edge source/target to the prefixed IDs
  //    F. Call addMergedNodes() to append (no scene reset)
  // ─────────────────────────────────────────────────────────
  const handleFusion = useCallback(
    async (nodeA, nodeB, collisionPoint) => {
      const fusionQuery =
        `Combine the concepts of "${nodeA.label}" and "${nodeB.label}". ` +
        `Generate a new sub-cluster of knowledge that explores the deep ` +
        `intersection, synergy, and emergent ideas between these two concepts.`;

      console.log(
        `⚡ Synaptic Fusion triggered: "${nodeA.label}" ✕ "${nodeB.label}"`
      );

      setIsFusing(true);

      try {
        const res = await fetch(`${API_URL}/generate-synapse`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ query: fusionQuery }),
        });

        const result = await res.json();

        if (!result.success || !result.data) {
          console.error("❌ Fusion API returned failure:", result.error);
          return;
        }

        const { nodes: rawNodes, edges: rawEdges } = result.data;

        // ── C. Stamp a unique prefix so IDs never collide ──────
        const stamp  = `fusion-${Date.now()}`;

        // ── D. Offset positions to spawn near the collision point ──
        // The API returns nodes centered at [0,0,0]. We:
        //   • Scale them down (FUSION_SPAWN_SPREAD) to form a tighter cluster
        //   • Translate them to the collision world position
        const offsetNodes = rawNodes.map((n) => {
          const pos = getSafePosition(n);
          return {
            ...n,
            id: `${stamp}-${n.id}`,
            // Mark as fusion level so they render slightly smaller
            level: Math.min((n.level ?? 1) + 1, 2),
            position: {
              x: collisionPoint.x + pos.x * FUSION_SPAWN_SPREAD,
              y: collisionPoint.y + pos.y * FUSION_SPAWN_SPREAD,
              z: collisionPoint.z + pos.z * FUSION_SPAWN_SPREAD,
            },
          };
        });


        // ── E. Remap edge IDs to match the prefixed node IDs ───
        const idMap = new Map(
          rawNodes.map((n, i) => [n.id, offsetNodes[i].id])
        );

        const offsetEdges = rawEdges
          .map((e) => ({
            source: idMap.get(e.source),
            target: idMap.get(e.target),
          }))
          // Drop edges where source or target failed to remap
          .filter((e) => e.source && e.target);

        // ── F. Append to the live scene — no unmount, no reset ─
        addMergedNodes(offsetNodes, offsetEdges);

        console.log(
          `✅ Fusion complete: +${offsetNodes.length} nodes, +${offsetEdges.length} edges`
        );
      } catch (err) {
        console.error("❌ Fusion fetch failed:", err.message);
      } finally {
        setIsFusing(false);
      }
    },
    [addMergedNodes, setIsFusing]
  );

  // ─────────────────────────────────────────────────────────
  //  HANDLE EXPANSION — called by Node.jsx on double-click
  // ─────────────────────────────────────────────────────────
  const handleExpand = useCallback(
    async (nodeToExpand) => {
      console.log(`🌌 Infinite Expansion triggered on: "${nodeToExpand.label}"`);
      setIsExpanding(true);

      try {
        const safePos = getSafePosition(nodeToExpand);
        const result = await fetchSynapseExpansion(nodeToExpand.id, nodeToExpand.label, safePos);

        const { nodes: rawNodes, edges: rawEdges } = result;

        // Stamp a unique prefix
        const stamp = `expand-${Date.now()}`;

        const offsetNodes = rawNodes.map((n) => {
          const pos = getSafePosition(n);
          return {
            ...n,
            id: `${stamp}-${n.id}`,
            level: Math.min((n.level ?? 2), 2), // Sub-nodes
            position: {
              x: safePos.x + pos.x * 0.85,
              y: safePos.y + pos.y * 0.85,
              z: safePos.z + pos.z * 0.85,
            },
          };
        });

        const idMap = new Map(rawNodes.map((n, i) => [n.id, offsetNodes[i].id]));

        const offsetEdges = rawEdges
          .map((e) => ({
            source: e.source === nodeToExpand.id ? nodeToExpand.id : idMap.get(e.source),
            target: idMap.get(e.target),
          }))
          .filter((e) => e.source && e.target);

        addMergedNodes(offsetNodes, offsetEdges);
        console.log(`✅ Expansion complete: +${offsetNodes.length} nodes, +${offsetEdges.length} edges`);
      } catch (err) {
        console.error("❌ Expansion fetch failed:", err.message);
      } finally {
        setIsExpanding(false);
      }
    },
    [addMergedNodes, setIsExpanding]
  );

  return (
    <>
      {/* ── Lighting ───────────────────────────────────────── */}
      <color attach="background" args={['#050505']} />
      <ambientLight intensity={1.6} color="#ffffff" />
      <directionalLight position={[10, 10, 10]} intensity={1.2} color="#ffffff" castShadow />
      <pointLight position={[-8, -6, -8]} intensity={1.8} color="#7c3aed" distance={40} />
      <pointLight position={[0,   5, -15]} intensity={1.4} color="#06b6d4" distance={40} />

      {/* Dynamic mouse follower light for tactile reflections */}
      <MouseLight />

      {/* ── OrbitControls ────────────────────────────────── */}
      <OrbitControls
        ref={orbitRef}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        enablePan={true}
        minDistance={4}
        maxDistance={50}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.9}
      />

      {/* ── Background star field (1 draw call) ─────────── */}
      <ParticleField />

      {/* ── Camera fly-in on initial load ───────────────── */}
      <CameraAnimator shouldAnimate={didLoad} />

      {/* ── Knowledge Graph ─────────────────────────────── */}
      {nodes.length > 0 && (
        <group>
          {/* Edges render behind nodes */}
          <Edges nodes={nodes} edges={edges} />

          {/* Each node gets onFusion to call back into Scene */}
          {nodes.map((node) => (
            <Node
              key={node.id}
              node={node}
              onFusion={handleFusion}
              onExpand={handleExpand}
            />
          ))}
        </group>
      )}

      {/* ── High-Performance Bloom Glow Effect ──────────── */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={0.8}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
};

export default Scene;
