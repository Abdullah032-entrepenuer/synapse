// ============================================================
//  synapse-server/src/config/groq.js
//  Initializes and exports the Groq AI client.
//  Groq is 100% free, no billing required, extremely fast.
//  Sign up at: https://console.groq.com
// ============================================================

const Groq = require("groq-sdk");

if (!process.env.GROQ_API_KEY) {
  console.error(
    "❌  FATAL: GROQ_API_KEY is not set in the environment. " +
      "Get a free key at https://console.groq.com and add it to .env"
  );
  process.exit(1);
}

// Single shared Groq client instance
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

module.exports = { groq };
