// ============================================================
//  synapse-client/src/api/synapseApi.js
//
//  Centralised API client using axios.
//
//  Why centralise this?
//    • Single source for the base URL — change it in ONE place
//    • Consistent error normalisation across all API calls
//    • Easy to add auth headers, interceptors, or retries later
// ============================================================

import axios from "axios";

// ── Base URL ─────────────────────────────────────────────
/**
 * In development: hits localhost:5001
 * In production: hits the relative /api path (since they are served on the same domain)
 */
const BASE_URL = import.meta.env.PROD ? "/api" : "http://localhost:5001/api";

// Create a pre-configured axios instance
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30s — generous for AI generation
  headers: {
    "Content-Type": "application/json",
  },
});

// ── API Functions ─────────────────────────────────────────

/**
 * Sends a user query to the backend and returns the spatial
 * knowledge graph data.
 *
 * @param {string} query - The user's knowledge query
 * @returns {Promise<{ topic: string, nodes: Array, edges: Array }>}
 * @throws {Error} with a user-friendly message on failure
 */
export const fetchSynapseGraph = async (query) => {
  try {
    const response = await apiClient.post("/generate-synapse", { query });

    if (response.data.success) {
      return response.data.data;
    }

    // Server returned a structured error
    throw new Error(
      response.data.error || "An unknown error occurred on the server."
    );
  } catch (err) {
    // Axios network error (no response from server)
    if (err.code === "ERR_NETWORK" || !err.response) {
      throw new Error(
        "Cannot connect to Synapse server. Is it running on port 5001?"
      );
    }

    // Server responded with an HTTP error (4xx / 5xx)
    if (err.response) {
      const serverMessage = err.response.data?.error;
      throw new Error(serverMessage || `Server error: ${err.response.status}`);
    }

    // Re-throw the already user-friendly error from above
    throw err;
  }
};

/**
 * Sends a request to expand a specific node.
 */
export const fetchSynapseExpansion = async (parentId, parentLabel, position) => {
  try {
    const response = await apiClient.post("/expand-synapse", { parentId, parentLabel, position });
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error(response.data.error || "An unknown error occurred on the server.");
  } catch (err) {
    if (err.code === "ERR_NETWORK" || !err.response) {
      throw new Error("Cannot connect to Synapse server.");
    }
    if (err.response) {
      const serverMessage = err.response.data?.error;
      throw new Error(serverMessage || `Server error: ${err.response.status}`);
    }
    throw err;
  }
};

/**
 * Saves the current graph to the database.
 */
export const fetchSynapseSave = async (graphData) => {
  try {
    const response = await apiClient.post("/graph/save", { graphData });
    if (response.data.success) {
      return response.data.id;
    }
    throw new Error(response.data.error || "Failed to save graph.");
  } catch (err) {
    if (err.response) throw new Error(err.response.data?.error || `Server error: ${err.response.status}`);
    throw err;
  }
};

/**
 * Loads a graph from the database by ID.
 */
export const fetchSynapseLoad = async (id) => {
  try {
    const response = await apiClient.get(`/graph/${id}`);
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error(response.data.error || "Failed to load graph.");
  } catch (err) {
    if (err.response) throw new Error(err.response.data?.error || `Server error: ${err.response.status}`);
    throw err;
  }
};
