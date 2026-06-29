// ============================================================
//  synapse-server/src/routes/synapseRoutes.js
//
//  Defines all routes under the /api/generate-synapse path.
//  Keeps routing concerns separate from business logic.
// ============================================================

const express = require("express");
const { generateSynapse, expandSynapse, saveGraph, getGraph } = require("../controllers/synapseController");

const router = express.Router();

/**
 * POST /api/generate-synapse
 *
 * Accepts a JSON body: { "query": "Explain Quantum Entanglement" }
 * Returns a full knowledge graph: { success, data: { topic, nodes, edges } }
 */
router.post("/generate-synapse", generateSynapse);

/**
 * POST /api/expand-synapse
 *
 * Accepts a JSON body: { "parentId": "id", "parentLabel": "label", "position": {x,y,z} }
 * Returns a sub-graph: { success, data: { nodes, edges } }
 */
router.post("/expand-synapse", expandSynapse);

router.post("/graph/save", saveGraph);
router.get("/graph/:id", getGraph);

module.exports = router;
