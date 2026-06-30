// ============================================================
//  synapse-client/src/store/useSynapseStore.js  (v3 — Safe Boundary)
//
//  Global state management with Zustand. Automatically sanitizes
//  coordinates at the store entry boundary to safeguard rendering.
// ============================================================

import { create } from "zustand";
import { getSafePosition } from "../utils/coordinateHelper";

const useSynapseStore = create((set) => ({
  // ── Graph Data (flat arrays, not nested) ─────────────────
  /** @type {Array} Live node list — automatically sanitized */
  nodes: [],

  /** @type {Array} Live edge list */
  edges: [],

  /** Human-readable topic label for the current graph */
  topic: "",

  // ── UI / Input State ─────────────────────────────────────
  query: "",
  isLoading: false,
  error: null,
  selectedNode: null,
  viewMode: "3D", // "3D" or "2D"

  // ── Physics / Interaction Flags ──────────────────────────
  isDragging: false,
  isFusing: false,
  isExpanding: false,
  zoomDirection: null, // "in", "out", or null

  // ── Actions ──────────────────────────────────────────────

  setZoomDirection: (zoomDirection) => set({ zoomDirection }),

  setQuery: (query) => set({ query }),

  startLoading: () => set({ isLoading: true, error: null }),
  stopLoading:  () => set({ isLoading: false }),

  setError:   (message) => set({ error: message, isLoading: false }),
  clearError: ()        => set({ error: null }),

  setSelectedNode: (node) => set({ selectedNode: node }),
  setViewMode:     (mode) => set({ viewMode: mode }),

  setIsDragging: (isDragging) => set({ isDragging }),
  setIsFusing:   (isFusing)   => set({ isFusing }),
  setIsExpanding:(isExpanding)=> set({ isExpanding }),

  /**
   * setGraphData — Sanitizes nodes and updates store
   */
  setGraphData: (data) => {
    const rawNodes = data.nodes ?? [];
    const sanitizedNodes = rawNodes.map((node) => ({
      ...node,
      position: getSafePosition(node),
      color: node.color || "#00ffcc",
    }));

    set({
      nodes:        sanitizedNodes,
      edges:        data.edges  ?? [],
      topic:        data.topic  ?? "",
      error:        null,
      selectedNode: null,
    });
  },

  /**
   * addMergedNodes — Sanitizes new nodes and appends them
   */
  addMergedNodes: (newNodes, newEdges) =>
    set((state) => {
      const sanitizedNewNodes = (newNodes ?? []).map((node) => ({
        ...node,
        position: getSafePosition(node),
        color: node.color || "#00ffcc",
      }));

      return {
        nodes: [...state.nodes, ...sanitizedNewNodes],
        edges: [...state.edges, ...newEdges],
      };
    }),
}));

export default useSynapseStore;

