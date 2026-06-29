// ============================================================
//  synapse-server/src/config/gemini.js
//  Initializes and exports the Google Gemini generative model.
//  Centralised here so we init exactly ONCE at startup.
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Validates that the API key is present before any request can be served.
 * This fails loudly at startup rather than silently at request-time.
 */
if (!process.env.GEMINI_API_KEY) {
  console.error(
    "❌  FATAL: GEMINI_API_KEY is not set in the environment. " +
      "Create a .env file from .env.example and add your key."
  );
  process.exit(1);
}

// Instantiate the client once — sharing one instance avoids re-auth overhead.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * We use `gemini-2.0-flash` — it is:
 *   • Free-tier eligible (current stable free model)
 *   • Extremely fast (sub-2s on most hardware)
 *   • Supports responseMimeType: "application/json" to guarantee JSON output
 */
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    // Force the model to respond with valid JSON only
    responseMimeType: "application/json",
    // Keep responses deterministic and tightly scoped
    temperature: 0.7,
    topP: 0.9,
    // Generous enough for a full constellation of nodes
    maxOutputTokens: 2048,
  },
});

module.exports = { model };
