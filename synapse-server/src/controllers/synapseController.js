// ============================================================
//  synapse-server/src/controllers/synapseController.js
//
//  Core business logic for the /api/generate-synapse endpoint.
//  Now powered by Groq (llama-3.3-70b) — 100% free, no quota.
// ============================================================

const { groq } = require("../config/groq");

// ─────────────────────────────────────────────────────────────
//  SYSTEM PROMPT — "Anti-Gravity" spatial architect
// ─────────────────────────────────────────────────────────────
const SPATIAL_ARCHITECT_SYSTEM = `You are a spatial data architect for a 3D knowledge visualization system called "Synapse".

OUTPUT ONLY RAW JSON — no markdown, no explanation, no code fences, no backticks.

Break the user's topic into a central node and 6-10 connected sub-nodes that represent the most important conceptual facets of the topic.

Rules:
1. The central (root) node MUST be at position { x: 0, y: 0, z: 0 } and have level: 0.
2. Sub-nodes (level 1) must be distributed in a spherical constellation around the center, with radii between 3 and 6 units. Vary x, y, z meaningfully — avoid flat 2D layouts.
3. You may include level-2 (deeper) nodes connected to level-1 nodes for rich topics. These should have radii between 7 and 10 from center.
4. Every node MUST have a concise description (1-2 sentences, max 200 chars).
5. Colors should use hex strings and reflect the conceptual nature of each node (e.g., quantum topics = cool blues/purples, biology = greens, history = warm ambers).
6. Edges connect source node id to target node id.

JSON Schema (output EXACTLY this shape, no extra text before or after):
{
  "topic": "<the main topic>",
  "nodes": [
    {
      "id": "string (unique slug e.g. 'quantum-root')",
      "label": "string (1-4 words)",
      "description": "string (1-2 sentences)",
      "level": 0,
      "position": { "x": 0, "y": 0, "z": 0 },
      "color": "#hex",
      "source_url": "string (optional URL citation)"
    }
  ],
}
  ]
}`;

const EXPAND_SYSTEM = `You are a spatial data architect for a 3D knowledge map.
The user is zooming in to expand a specific concept.

OUTPUT ONLY RAW JSON — no markdown, no explanation, no code fences.

Rules:
1. Generate 3 to 5 new sub-nodes that dive deeper into the parent concept.
2. The nodes MUST be positioned in a tight cluster (radius of 2 to 4 units) around the provided Base Position.
3. Every node MUST have a concise description (1-2 sentences).
4. Colors should complement the parent node's topic.
5. Create edges linking the provided Parent ID to your new sub-nodes, and optionally between the new sub-nodes.

JSON Schema (output EXACTLY this shape):
{
  "nodes": [
    {
      "id": "string (unique slug)",
      "label": "string",
      "description": "string",
      "level": 2,
      "position": { "x": 0, "y": 0, "z": 0 },
      "color": "#hex"
    }
  ],
  "edges": [
    { "source": "PARENT_ID_HERE", "target": "node-id" }
  ]
}`;

// ─────────────────────────────────────────────────────────────
//  SCHEMA VALIDATOR
// ─────────────────────────────────────────────────────────────
function validateGraphSchema(data) {
  if (!data || typeof data !== "object") throw new Error("Response is not a JSON object.");
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) throw new Error("Missing 'nodes' array.");
  
  // Default to empty edges if AI omits it
  if (!Array.isArray(data.edges)) {
    data.edges = [];
  }

  const nodeIds = new Set();
  for (const node of data.nodes) {
    if (!node.id || !node.label || node.position === undefined)
      throw new Error(`Node missing required fields: ${JSON.stringify(node)}`);
    if (typeof node.position.x !== "number" || typeof node.position.y !== "number" || typeof node.position.z !== "number")
      throw new Error(`Node '${node.id}' has invalid position coordinates.`);
    nodeIds.add(node.id);
  }

  for (const edge of data.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      throw new Error(`Edge references unknown node: ${JSON.stringify(edge)}`);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
//  CONTROLLER — POST /api/generate-synapse
// ─────────────────────────────────────────────────────────────
const generateSynapse = async (req, res) => {
  // ── 1. Validate input ───────────────────────────────────
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ success: false, error: "Request body must include a non-empty 'query' string." });
  }
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3) return res.status(400).json({ success: false, error: "Query is too short." });
  if (trimmedQuery.length > 500) return res.status(400).json({ success: false, error: "Query exceeds 500 characters." });

  // ── 1.5 RAG: Fetch Live Context from Wikipedia ──────────
  let liveContext = "";
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(trimmedQuery)}`);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      if (wikiData.extract && wikiData.content_urls?.desktop?.page) {
        liveContext = `\nLIVE WIKIPEDIA CONTEXT:\nSummary: ${wikiData.extract}\nSource URL: ${wikiData.content_urls.desktop.page}\nNote: Use this source URL in the root node if highly relevant.`;
        console.log(`🌍 RAG Context fetched for: "${trimmedQuery}"`);
      }
    }
  } catch (err) {
    console.warn("⚠️ RAG Context fetch failed, falling back to internal knowledge:", err.message);
  }

  // ── 2. Call Groq ────────────────────────────────────────
  let rawText;
  try {
    console.log(`🧠 Generating synapse for query: "${trimmedQuery}"`);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SPATIAL_ARCHITECT_SYSTEM },
        { role: "user",   content: `USER TOPIC: "${trimmedQuery}"${liveContext}` },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      // Force JSON output — Groq supports this natively
      response_format: { type: "json_object" },
    });

    rawText = completion.choices[0]?.message?.content;

    if (!rawText) throw new Error("Groq returned an empty response.");

  } catch (aiError) {
    console.error("❌ Groq API call failed:", aiError.message);

    if (aiError.status === 429) {
      return res.status(429).json({ success: false, error: "Rate limit reached. Please wait a moment and try again." });
    }
    return res.status(503).json({ success: false, error: "AI service is temporarily unavailable. Please try again." });
  }

  // ── 3. Parse JSON ───────────────────────────────────────
  let graphData;
  try {
    // Strip any accidental markdown code fences as a safety net
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    graphData = JSON.parse(cleaned);
  } catch (parseError) {
    console.error("❌ Failed to parse AI JSON response:", rawText);
    return res.status(500).json({ success: false, error: "AI returned an unexpected format. Please try a different query." });
  }

  // ── 4. Validate schema ──────────────────────────────────
  try {
    validateGraphSchema(graphData);
  } catch (validationError) {
    console.error("❌ Schema validation failed:", validationError.message);
    return res.status(500).json({ success: false, error: `Graph data is malformed: ${validationError.message}` });
  }

  // ── 5. Success ──────────────────────────────────────────
  console.log(`✅ Synapse generated: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
  return res.status(200).json({ success: true, data: graphData });
};

// ─────────────────────────────────────────────────────────────
//  CONTROLLER — POST /api/expand-synapse
// ─────────────────────────────────────────────────────────────
const expandSynapse = async (req, res) => {
  const { parentId, parentLabel, position } = req.body;
  if (!parentId || !parentLabel || !position) {
    return res.status(400).json({ success: false, error: "Missing required fields (parentId, parentLabel, position)." });
  }

  const prompt = `Parent ID: "${parentId}"\nParent Concept: "${parentLabel}"\nBase Position: x: ${position.x}, y: ${position.y}, z: ${position.z}`;

  let rawText;
  try {
    console.log(`🔍 Expanding node: "${parentLabel}"`);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: EXPAND_SYSTEM },
        { role: "user",   content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });

    rawText = completion.choices[0]?.message?.content;
    if (!rawText) throw new Error("Groq returned an empty response.");
  } catch (aiError) {
    console.error("❌ Groq API call failed:", aiError.message);
    return res.status(503).json({ success: false, error: "AI service unavailable." });
  }

  let graphData;
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    graphData = JSON.parse(cleaned);
  } catch (parseError) {
    return res.status(500).json({ success: false, error: "AI returned invalid JSON format." });
  }

  // Inject the parent ID into the edges just in case the AI missed it
  if (graphData.edges) {
    graphData.edges = graphData.edges.map(e => ({
      source: e.source === "PARENT_ID_HERE" ? parentId : e.source,
      target: e.target
    }));
  }

  console.log(`✅ Expansion generated: ${graphData.nodes?.length || 0} nodes`);
  return res.status(200).json({ success: true, data: graphData });
};

const db = require("../config/db");

// ─────────────────────────────────────────────────────────────
//  CONTROLLER — POST /api/graph/save
// ─────────────────────────────────────────────────────────────
const saveGraph = (req, res) => {
  const { graphData } = req.body;
  if (!graphData) return res.status(400).json({ success: false, error: "Missing graphData" });

  // Generate a simple alphanumeric ID
  const id = Math.random().toString(36).substring(2, 10);
  
  db.run(`INSERT INTO graphs (id, data) VALUES (?, ?)`, [id, JSON.stringify(graphData)], function(err) {
    if (err) {
      console.error("❌ Failed to save graph:", err.message);
      return res.status(500).json({ success: false, error: "Failed to save graph to database." });
    }
    console.log(`✅ Saved graph with ID: ${id}`);
    res.status(200).json({ success: true, id });
  });
};

// ─────────────────────────────────────────────────────────────
//  CONTROLLER — GET /api/graph/:id
// ─────────────────────────────────────────────────────────────
const getGraph = (req, res) => {
  const { id } = req.params;
  
  db.query(`SELECT data FROM graphs WHERE id = ?`, [id], (err, rows) => {
    if (err) {
      console.error("❌ Failed to fetch graph:", err.message);
      return res.status(500).json({ success: false, error: "Failed to fetch graph from database." });
    }
    const row = rows && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return res.status(404).json({ success: false, error: "Graph not found." });
    }
    
    try {
      const parsedData = JSON.parse(row.data);
      res.status(200).json({ success: true, data: parsedData });
    } catch (e) {
      res.status(500).json({ success: false, error: "Stored graph data is corrupt." });
    }
  });
};

module.exports = { generateSynapse, expandSynapse, saveGraph, getGraph };
