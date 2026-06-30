// ============================================================
//  synapse-client/src/App.jsx  (v2 — Synaptic Fusion)
//
//  Updated to read from the new flat-array Zustand store.
//  Key changes from v1:
//    • Reads `nodes`, `edges`, `topic` directly (not `graphData`)
//    • `setGraphData` now stores to flat arrays in the store
//    • Passes `didLoad` to Scene to trigger camera fly-in
//    • Shows a "Fusion in progress" banner via `isFusing` flag
//    • Drag hint added to search hint bar
// ============================================================

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { Canvas }   from "@react-three/fiber";

import "./App.css";

import Scene         from "./components/3d/Scene";
import FlowChartView from "./components/2d/FlowChartView";
import useSynapseStore from "./store/useSynapseStore";
import { fetchSynapseGraph, fetchSynapseSave, fetchSynapseLoad } from "./api/synapseApi";

// ── SVG Icons ─────────────────────────────────────────────
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const LoaderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
const NetworkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><circle cx="5" cy="19" r="2" />
    <line x1="12" y1="7" x2="12" y2="13" /><line x1="12" y1="13" x2="19" y2="17" /><line x1="12" y1="13" x2="5" y2="17" />
  </svg>
);
const FusionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>
);
const MapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

// ── Info Panel ─────────────────────────────────────────────
const InfoPanel = ({ node, onClose }) => {
  const levelLabel = ["Central Node", "Primary Concept", "Secondary Concept", "Fused Concept"];
  return (
    <div className="info-panel" onClick={(e) => {
      if (e.target.tagName !== "A" && e.target.tagName !== "BUTTON" && e.target.tagName !== "line" && e.target.tagName !== "svg") onClose();
    }} title="Click to dismiss">
      <div className="info-panel-header" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div className="info-panel-dot" style={{ color: node.color, backgroundColor: node.color }} />
          <div>
            <div className="info-panel-label">{node.label}</div>
            <span className="info-panel-level">
              {levelLabel[node.level] ?? "Concept"} · Level {node.level}
            </span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <p className="info-panel-description">{node.description}</p>
      {node.source_url && (
        <a 
          href={node.source_url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="info-panel-citation"
          onClick={(e) => e.stopPropagation()}
        >
          [Wikipedia]
        </a>
      )}
    </div>
  );
};

// ── Loading Overlay ────────────────────────────────────────
const LoadingOverlay = ({ query }) => (
  <div className="loading-overlay">
    <div className="loader-constellation">
      <div className="loader-dot" /><div className="loader-dot" /><div className="loader-dot" />
      <div className="loader-center" />
    </div>
    <p className="loading-text">Mapping the knowledge space for &ldquo;{query}&rdquo;…</p>
  </div>
);

// ── Fusion Banner ──────────────────────────────────────────
const FusionBanner = () => (
  <div className="fusion-banner">
    <FusionIcon />
    <span>Synaptic Fusion in progress…</span>
  </div>
);

// ── Expand Banner ──────────────────────────────────────────
const ExpandBanner = () => (
  <div className="fusion-banner" style={{ borderColor: "#06b6d4", background: "rgba(6, 182, 212, 0.18)" }}>
    <NetworkIcon />
    <span style={{ color: "#06b6d4" }}>Infinite Expansion in progress…</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  APP ROOT
// ─────────────────────────────────────────────────────────────
const App = () => {
  const inputRef = useRef(null);
  const [urlId, setUrlId] = useState(() => {
    const p = window.location.pathname;
    return p.startsWith('/graph/') ? p.replace('/graph/', '') : null;
  });
  
  const navigate = useCallback((path) => {
    window.history.pushState({}, '', path);
    const newId = path.startsWith('/graph/') ? path.replace('/graph/', '') : null;
    setUrlId(newId);
  }, []);
  
  // Listen for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname;
      setUrlId(p.startsWith('/graph/') ? p.replace('/graph/', '') : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Triggers camera fly-in after each successful load
  const [didLoad, setDidLoad] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Store (flat arrays now, not graphData) ──────────────
  const query        = useSynapseStore((s) => s.query);
  const isLoading    = useSynapseStore((s) => s.isLoading);
  const isFusing     = useSynapseStore((s) => s.isFusing);
  const isExpanding  = useSynapseStore((s) => s.isExpanding);
  const error        = useSynapseStore((s) => s.error);
  const nodes        = useSynapseStore((s) => s.nodes);
  const edges        = useSynapseStore((s) => s.edges);
  const topic        = useSynapseStore((s) => s.topic);
  const selectedNode = useSynapseStore((s) => s.selectedNode);
  const viewMode     = useSynapseStore((s) => s.viewMode);

  const setQuery       = useSynapseStore((s) => s.setQuery);
  const setGraphData   = useSynapseStore((s) => s.setGraphData);
  const startLoading   = useSynapseStore((s) => s.startLoading);
  const stopLoading    = useSynapseStore((s) => s.stopLoading);
  const setError       = useSynapseStore((s) => s.setError);
  const clearError     = useSynapseStore((s) => s.clearError);
  const setSelectedNode= useSynapseStore((s) => s.setSelectedNode);
  const setViewMode    = useSynapseStore((s) => s.setViewMode);
  const setZoomDirection = useSynapseStore((s) => s.setZoomDirection);

  const hasGraph = nodes.length > 0;

  const [toast, setToast] = useState(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Load graph if ID is in URL
  useEffect(() => {
    if (urlId) {
      const loadData = async () => {
        startLoading();
        try {
          const data = await fetchSynapseLoad(urlId);
          setGraphData(data);
          setDidLoad(true);
        } catch (err) {
          setError(err.message);
          navigate("/"); // Reset URL if not found
        } finally {
          stopLoading();
        }
      };
      loadData();
    }
  }, [urlId, startLoading, setGraphData, setError, stopLoading, navigate]);

  // Auto-dismiss error after 6s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 6000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  // Submit handler
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    if (!query.trim() || isLoading) return;
    startLoading();
    setDidLoad(false);
    try {
      const data = await fetchSynapseGraph(query.trim());
      setGraphData(data); // stores to flat nodes/edges/topic
      setDidLoad(true);
    } catch (err) {
      setError(err.message);
    } finally {
      stopLoading();
    }
  }, [query, isLoading, startLoading, setGraphData, setError, stopLoading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) handleSubmit(e);
  }, [handleSubmit]);

  const exampleQueries = ["Quantum Entanglement", "The French Revolution", "Machine Learning", "Black Holes", "Photosynthesis"];

  const handleExampleClick = useCallback((ex) => {
    setQuery(ex);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [setQuery]);

  const handleShare = useCallback(async () => {
    if (!hasGraph || isSaving) return;

    if (urlId) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setToast("Link copied to clipboard!");
      } catch (err) {
        setError("Failed to copy link.");
      }
      return;
    }

    setIsSaving(true);
    try {
      const id = await fetchSynapseSave({ topic, nodes, edges });
      const shareUrl = `${window.location.origin}/graph/${id}`;
      await navigator.clipboard.writeText(shareUrl);
      setToast("Graph saved! Link copied to clipboard.");
      navigate(`/graph/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [hasGraph, isSaving, topic, nodes, edges, navigate, setError, urlId]);

  return (
    <div className="app-container">
      {/* ── Canvas (3D layer) ─────────────────────────── */}
      {/* canvas-container: absolute fill, z-index 0 sits behind the UI overlay */}
      <div
        className="canvas-container"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
        }}
      >
        {viewMode === "3D" ? (
          <Canvas
            camera={{ position: [0, 0, 30], fov: 60, near: 0.1, far: 200 }}
            gl={{ powerPreference: "high-performance", antialias: true, alpha: false }}
            dpr={[1, 2]}
            style={{ width: "100%", height: "100%", background: "#050505", display: "block" }}
          >
            <Suspense fallback={null}>
              <Scene didLoad={didLoad} />
            </Suspense>
          </Canvas>
        ) : (
          <FlowChartView />
        )}
      </div>

      {/* ── UI Overlay ────────────────────────────────── */}
      <div className="ui-overlay">
        {/* Floating Zoom Controls for 3D View */}
        {viewMode === "3D" && (
          <div className="zoom-controls">
            <button onClick={() => setZoomDirection("in")} title="Zoom In" aria-label="Zoom In">+</button>
            <button onClick={() => setZoomDirection("out")} title="Zoom Out" aria-label="Zoom Out">−</button>
          </div>
        )}

        {/* Header */}
        <header className="header" style={{ width: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="header-logo"><NetworkIcon /></div>
            <span className="header-title">Synapse</span>
            <span className="header-badge">AI · {viewMode}</span>
          </div>
          
          <div style={{ display: "flex", gap: "8px" }}>
            {hasGraph && (
              <button 
                className="glass-button" 
                onClick={handleShare}
                disabled={isSaving}
                title={urlId ? "Copy shareable link" : "Save & Share Graph"}
              >
                {isSaving ? <LoaderIcon /> : <ShareIcon />}
                <span>{urlId ? "Copy Link" : "Save Graph"}</span>
              </button>
            )}
            <button 
              className="glass-button" 
              onClick={() => setViewMode(viewMode === "3D" ? "2D" : "3D")}
            >
              <MapIcon />
              <span>{viewMode === "3D" ? "2D Flowchart" : "3D Map"}</span>
            </button>
          </div>
        </header>

        {/* Stats bar */}
        {hasGraph && !isLoading && (
          <div className="stats-bar">
            <div className="stat-item"><span>Topic</span><strong>{topic}</strong></div>
            <div className="stat-item"><span>Nodes</span><strong>{nodes.length}</strong></div>
            <div className="stat-item"><span>Connections</span><strong>{edges.length}</strong></div>
            {nodes.length > 0 && (
              <div className="stat-item" style={{ fontSize: "0.7rem", color: "rgba(240,240,245,0.35)", gap: 4 }}>
                <FusionIcon style={{ width: 12, height: 12 }} />
                <span>Drag to fuse, or <strong>double-click</strong> to expand</span>
              </div>
            )}
          </div>
        )}

        {/* Info panel */}
        {selectedNode && !isLoading && (
          <InfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {/* Idle prompt */}
        {!hasGraph && !isLoading && (
          <div className="idle-prompt">
            <h1 className="idle-prompt-title">Think in<br />Three Dimensions</h1>
            <p className="idle-prompt-subtitle">Type any topic to map its knowledge universe</p>
          </div>
        )}

        {/* Search bar */}
        <div className="search-container">
          {!hasGraph && !isLoading && (
            <p className="search-hint">
              Try:{" "}
              {exampleQueries.map((eq, i) => (
                <span key={eq}>
                  <span onClick={() => handleExampleClick(eq)} style={{ cursor: "pointer", opacity: 0.9, color: "var(--color-primary)" }}>{eq}</span>
                  {i < exampleQueries.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          )}
          {hasGraph && !isLoading && (
            <p className="search-hint" style={{ color: "rgba(139,92,246,0.6)" }}>
              ⚡ <strong>Synaptic Fusion:</strong> drag any node onto another to merge their knowledge
            </p>
          )}
          <form className="search-bar" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasGraph ? "Search a new topic…" : "Explore any topic… e.g. 'Quantum Entanglement'"}
              disabled={isLoading}
              maxLength={500}
              autoComplete="off"
              aria-label="Knowledge query input"
              id="synapse-query-input"
            />
            <button className="search-button" type="submit" disabled={isLoading || !query.trim()} aria-label="Generate" id="synapse-submit-button">
              {isLoading ? <LoaderIcon /> : <SendIcon />}
            </button>
          </form>
          
          <div className="dev-contact">
            Developer: <a href="mailto:abdullahawais034@gmail.com">abdullahawais034@gmail.com</a>
          </div>
        </div>
      </div>

      {/* ── Transient overlays ─────────────────────────── */}
      {isLoading  && <LoadingOverlay query={query} />}
      {isFusing   && <FusionBanner />}
      {isExpanding && <ExpandBanner />}
      {error      && (
        <div className="error-toast" onClick={clearError} role="alert">⚠ {error}</div>
      )}
      {toast      && (
        <div className="success-toast" onClick={() => setToast(null)} role="alert">✓ {toast}</div>
      )}
    </div>
  );
};

export default App;
