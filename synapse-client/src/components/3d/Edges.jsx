// ============================================================
//  synapse-client/src/components/3d/Edges.jsx
//
//  Renders all edges in the knowledge graph as glowing,
//  semi-transparent neural connections between nodes.
//
//  Implementation approach:
//    • We use THREE.BufferGeometry with setFromPoints() to draw
//      line segments. This is the most performant approach for
//      dynamic line drawing in Three.js.
//    • Each edge is a separate <line> primitive — this is fine
//      for our expected count of 5-20 edges. If we needed 1000s
//      of edges we'd use a single merged BufferGeometry.
//    • LineBasicMaterial with transparency gives the "neural
//      connection" aesthetic without any shader overhead.
// ============================================================

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  SINGLE EDGE COMPONENT
//  Draws one glowing line between two 3D positions.
// ─────────────────────────────────────────────────────────────
const Edge = ({ startPos, endPos, color }) => {
  const lineRef = useRef();

  // Build the geometry from two Vector3 points safely.
  // useMemo prevents re-creating the geometry on every render.
  const geometry = useMemo(() => {
    // If startPos or endPos are not already sanitized, fallback to 0
    const sx = Number.isFinite(startPos?.x) ? startPos.x : 0;
    const sy = Number.isFinite(startPos?.y) ? startPos.y : 0;
    const sz = Number.isFinite(startPos?.z) ? startPos.z : 0;
    
    const ex = Number.isFinite(endPos?.x) ? endPos.x : 0;
    const ey = Number.isFinite(endPos?.y) ? endPos.y : 0;
    const ez = Number.isFinite(endPos?.z) ? endPos.z : 0;

    const points = [
      new THREE.Vector3(sx, sy, sz),
      new THREE.Vector3(ex, ey, ez),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [startPos, endPos]);

  // Gently pulse the edge opacity for a "living network" feel
  useFrame((state) => {
    if (!lineRef.current) return;
    const pulse = 0.12 + Math.sin(state.clock.elapsedTime * 1.2) * 0.04;
    lineRef.current.material.opacity = pulse;
  });

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={color || "#8b5cf6"}
        transparent
        opacity={0.12}
        linewidth={1} // Note: linewidth >1 only works on WebGL2 + specific drivers
      />
    </line>
  );
};

// ─────────────────────────────────────────────────────────────
//  EDGES CONTAINER
//  Maps the edges array from the API to individual Edge components,
//  resolving source/target IDs to actual 3D positions.
// ─────────────────────────────────────────────────────────────
const Edges = ({ nodes, edges }) => {
  // Build a fast O(1) lookup map: nodeId → node object
  // This avoids an O(n²) nested loop when resolving edge positions.
  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  return (
    <group>
      {edges.map((edge, index) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        // Skip malformed edges that reference non-existent nodes
        if (!sourceNode || !targetNode) {
          console.warn(`Synapse: Edge ${index} has unresolvable source/target.`);
          return null;
        }

        // Use the source node's color for the connection line
        const edgeColor = sourceNode.color || "#8b5cf6";

        return (
          <Edge
            key={`edge-${edge.source}-${edge.target}-${index}`}
            startPos={sourceNode.position}
            endPos={targetNode.position}
            color={edgeColor}
          />
        );
      })}
    </group>
  );
};

export default Edges;
