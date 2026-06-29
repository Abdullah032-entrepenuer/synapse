// ============================================================
//  synapse-client/vite.config.js
//
//  Vite configuration with manual chunk splitting and alias resolution.
//  Enforces a single instance of Three.js to prevent rendering failures
//  caused by multiple Three.js modules loading in the bundle.
// ============================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Force all dependencies (R3F, Drei, Spring, Postprocessing) to
      // resolve to the same root installation of Three.js
      three: path.resolve(__dirname, "node_modules/three"),
    },
  },

  build: {
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("three") || id.includes("@react-three")) {
            return "vendor-three";
          }
          if (id.includes("react-dom") || id.includes("react/")) {
            return "vendor-react";
          }
          if (id.includes("zustand")) {
            return "vendor-zustand";
          }
          if (id.includes("axios")) {
            return "vendor-axios";
          }
        },
      },
    },
  },

  // ── Dev Server ──────────────────────────────────────────
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});
