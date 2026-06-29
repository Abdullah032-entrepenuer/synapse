// ============================================================
//  synapse-server/server.js  (Entry Point)
//
//  Production-ready Express server for the Synapse API.
//
//  Key features:
//    • Helmet — sets secure HTTP headers
//    • Morgan — HTTP request logging
//    • express-rate-limit — protects the AI endpoint from abuse
//    • CORS — strict origin whitelist from environment variables
//    • Graceful error handling at the Express layer
// ============================================================

// ── 0. Load environment variables FIRST ────────────────────
require("dotenv").config();

// ── 1. Core imports ─────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

// ── 2. Route imports ────────────────────────────────────────
const synapseRoutes = require("./src/routes/synapseRoutes");

// ─────────────────────────────────────────────────────────────
//  APP INITIALISATION
// ─────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5001;

// ── 3. Security Middleware ──────────────────────────────────
/**
 * Helmet sets a suite of security-focused HTTP response headers.
 * e.g. Content-Security-Policy, X-Frame-Options, HSTS, etc.
 */
app.use(helmet());

// ── 4. CORS Configuration ───────────────────────────────────
/**
 * We build the whitelist from ALLOWED_ORIGINS env var.
 * This ensures:
 *   - In development: only http://localhost:5173 can call us
 *   - In production: only our Vercel frontend URL can call us
 *
 * Format in .env: ALLOWED_ORIGINS=http://localhost:5173,https://synapse.vercel.app
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no 'origin' header (server-to-server, Postman, etc.)
    // and requests from the whitelist.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked request from origin: ${origin}`);
      callback(new Error(`Origin '${origin}' is not allowed by CORS policy.`));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // Allow the browser to read response headers in pre-flight
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// ── 5. Body Parsing ─────────────────────────────────────────
// Accept JSON bodies up to 10kb — more than enough for a query string
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── 6. HTTP Request Logging ─────────────────────────────────
// 'dev' format: METHOD /path STATUS response_time ms
app.use(morgan("dev"));

// ── 7. Rate Limiting ────────────────────────────────────────
/**
 * Protects the AI endpoint from abuse and keeps us within the
 * Gemini free-tier limits.
 * - 30 requests per 15 minutes per IP
 * - Returns a 429 Too Many Requests with a clear message
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true, // Returns `RateLimit-*` headers
  legacyHeaders: false,
  message: {
    success: false,
    error:
      "Too many requests from this IP. Please wait 15 minutes and try again.",
  },
});

// Apply the rate limiter ONLY to API routes
app.use("/api", apiLimiter);

// ── 8. API Routes ───────────────────────────────────────────
app.use("/api", synapseRoutes);

// ── 9. Health Check ─────────────────────────────────────────
/**
 * GET /health — Used by Render's health checks to verify the
 * server is alive before routing traffic to it.
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Synapse API",
    timestamp: new Date().toISOString(),
  });
});

// ── 10. 404 & Static Frontend Serving ────────────────────────
const path = require("path");

if (process.env.NODE_ENV === "production") {
  // Serve the React static files
  app.use(express.static(path.join(__dirname, "../synapse-client/dist")));

  // Handle React routing, return all requests to React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../synapse-client/dist", "index.html"));
  });
} else {
  // Catches any request that didn't match an explicit route in dev
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: `Route '${req.method} ${req.path}' not found.`,
    });
  });
}

// ── 11. Global Error Handler ────────────────────────────────
/**
 * Express error-handling middleware — must have 4 params (err, req, res, next).
 * Catches any error thrown or passed to next(err) in any route/middleware.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // CORS errors will surface here
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({ success: false, error: err.message });
  }

  console.error("💥 Unhandled server error:", err.stack || err.message);

  res.status(err.status || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "An internal server error occurred."
        : err.message,
  });
});

// ── 12. Start Server ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Synapse Server running on http://localhost:${PORT}`);
  console.log(`   CORS whitelist: ${allowedOrigins.join(", ") || "NONE"}`);
  console.log(`   Environment:    ${process.env.NODE_ENV || "development"}\n`);
});

module.exports = app; // Exported for testing
