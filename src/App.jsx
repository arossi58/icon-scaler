import { useState, useCallback, useEffect, useMemo } from "react";
import { PRESET_SIZES, ICON_LIBRARIES } from "./constants.js";
import { STORAGE_KEY, loadSaved } from "./storage.js";
import { calcStroke, rewriteSvg, detectBaseStroke } from "./svg.js";
import IconBrowser from "./components/IconBrowser.jsx";
import WorkspaceRow from "./components/WorkspaceRow.jsx";
import CurveGraph from "./components/CurveGraph.jsx";

const RECOMMENDED_INTENSITY = 0.2;

export default function App() {
  const [workspace, setWorkspace] = useState(() => {
    const s = loadSaved();
    return Array.isArray(s.workspace) ? s.workspace : [];
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [refSize, setRefSize] = useState(() => loadSaved().refSize ?? 24);
  const [refStroke, setRefStroke] = useState(() => loadSaved().refStroke ?? 2);
  const [scalingMode, setScalingMode] = useState(() => loadSaved().scalingMode ?? "auto");
  const [autoIntensity, setAutoIntensity] = useState(() => loadSaved().autoIntensity ?? RECOMMENDED_INTENSITY);
  const [activeSizes, setActiveSizes] = useState(() => {
    const s = loadSaved();
    return Array.isArray(s.activeSizes) ? s.activeSizes : [12, 16, 20, 24, 32, 48];
  });
  const [manualStrokes, setManualStrokes] = useState(() => loadSaved().manualStrokes ?? {});
  const [savedCurves, setSavedCurves] = useState(() => loadSaved().savedCurves ?? []);
  const [curveName, setCurveName] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // null | {done, total}
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        workspace, refSize, refStroke, scalingMode, autoIntensity, activeSizes, manualStrokes, savedCurves,
      }));
    } catch (e) {
      console.warn("Failed to save state:", e.message);
    }
  }, [workspace, refSize, refStroke, scalingMode, autoIntensity, activeSizes, manualStrokes, savedCurves]);

  const clearAll = useCallback(() => {
    setWorkspace([]);
    setRefSize(24);
    setRefStroke(2);
    setScalingMode("auto");
    setAutoIntensity(RECOMMENDED_INTENSITY);
    setActiveSizes([12, 16, 20, 24, 32, 48]);
    setManualStrokes({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const workspaceIds = useMemo(
    () => new Set(workspace.map((item) => `${item.lib}:${item.name}`)),
    [workspace]
  );

  const getStrokeForSize = useCallback((size) => {
    if (scalingMode === "manual") {
      return manualStrokes[size] ?? calcStroke(refStroke, refSize, size, autoIntensity);
    }
    return calcStroke(refStroke, refSize, size, autoIntensity);
  }, [scalingMode, manualStrokes, refStroke, refSize, autoIntensity]);

  const addToWorkspace = useCallback(async (list) => {
    setLoadingWorkspace(true);
    const newItems = [];
    for (const { lib, name } of list) {
      const id = `${lib}:${name}`;
      try {
        const svgText = await ICON_LIBRARIES[lib].fetchSvg(name);
        newItems.push({ id, lib, name, svgText, detectedStroke: detectBaseStroke(svgText) });
      } catch (e) {
        console.warn(`Failed to load ${name}:`, e.message);
      }
    }
    setWorkspace((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      return [...prev, ...newItems.filter((item) => !existing.has(item.id))];
    });
    setLoadingWorkspace(false);
  }, []);

  const removeFromWorkspace = useCallback((id) => {
    setWorkspace((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const saveCurrentCurve = useCallback(() => {
    const name = curveName.trim();
    if (!name) return;
    setSavedCurves((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name, refSize, refStroke, scalingMode, autoIntensity, manualStrokes },
    ]);
    setCurveName("");
  }, [curveName, refSize, refStroke, scalingMode, autoIntensity, manualStrokes]);

  const loadCurve = useCallback((curve) => {
    setRefSize(curve.refSize);
    setRefStroke(curve.refStroke);
    setScalingMode(curve.scalingMode);
    setAutoIntensity(curve.autoIntensity);
    setManualStrokes(curve.manualStrokes);
  }, []);

  const deleteCurve = useCallback((id) => {
    setSavedCurves((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const switchToAuto = useCallback(() => setScalingMode("auto"), []);

  const switchToManual = useCallback(() => {
    setManualStrokes((prev) => {
      const seeded = { ...prev };
      activeSizes.forEach((s) => {
        if (seeded[s] === undefined) seeded[s] = calcStroke(refStroke, refSize, s, autoIntensity);
      });
      return seeded;
    });
    setScalingMode("manual");
  }, [activeSizes, refStroke, refSize, autoIntensity]);

  const seedManualFromAuto = useCallback(() => {
    const seeded = {};
    activeSizes.forEach((s) => { seeded[s] = calcStroke(refStroke, refSize, s, autoIntensity); });
    setManualStrokes(seeded);
  }, [activeSizes, refStroke, refSize, autoIntensity]);

  const toggleSize = (s) =>
    setActiveSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s].sort((a, b) => a - b));

  const handleUploadFiles = useCallback(async (files) => {
    const svgFiles = [...files].filter((f) => f.name.toLowerCase().endsWith(".svg") || f.type === "image/svg+xml");
    if (svgFiles.length === 0) return;
    setLoadingWorkspace(true);
    const newItems = [];
    for (const file of svgFiles) {
      try {
        const text = await file.text();
        const name = file.name.replace(/\.svg$/i, "");
        const id = `upload:${name}`;
        newItems.push({ id, lib: "upload", name, svgText: text, detectedStroke: detectBaseStroke(text) });
      } catch (e) {
        console.warn(`Failed to read ${file.name}:`, e.message);
      }
    }
    setWorkspace((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      return [...prev, ...newItems.filter((item) => !existing.has(item.id))];
    });
    setLoadingWorkspace(false);
  }, []);

  const exportAll = useCallback(async () => {
    if (workspace.length === 0 || activeSizes.length === 0) return;
    setExportProgress({ done: 0, total: workspace.length });
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < workspace.length; i++) {
      const { name, svgText } = workspace[i];
      activeSizes.forEach((size) => {
        const sw = getStrokeForSize(size);
        zip.file(`${name}-${size}px.svg`, rewriteSvg(svgText, sw, size));
      });
      setExportProgress({ done: i + 1, total: workspace.length });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "icons.zip"; a.click();
    URL.revokeObjectURL(url);
    setExportProgress(null);
  }, [workspace, activeSizes, getStrokeForSize]);

  const isNearRecommended = Math.abs(autoIntensity - RECOMMENDED_INTENSITY) < 0.03;

  return (
    <div className="app">

      {showBrowser && (
        <IconBrowser
          onAddToWorkspace={addToWorkspace}
          onClose={() => setShowBrowser(false)}
          existingIds={workspaceIds}
        />
      )}

      {exportProgress && (
        <div className="export-overlay">
          <div className="export-overlay-inner">
            <div className="export-overlay-title">Exporting…</div>
            <div className="export-progress-track">
              <div className="export-progress-fill" style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }} />
            </div>
            <div className="export-progress-count">{exportProgress.done} / {exportProgress.total}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="app-header">
        <div className="app-header-brand">
          <div className="app-header-logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="app-header-title">Icon Scaler</span>
          {workspace.length > 0 && (
            <span className="app-header-count">{workspace.length} icon{workspace.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {workspace.length > 0 && (
          <button onClick={clearAll} className="btn-ghost">Clear all</button>
        )}
        <label className="btn-ghost">
          ↑ Upload SVG
          <input type="file" accept=".svg,image/svg+xml" multiple style={{ display: "none" }}
            onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <button onClick={() => setShowBrowser(true)} className="btn-primary">◇ Browse Icons</button>
      </div>

      <div className="app-layout">

        {/* ── Sidebar ── */}
        <div className="sidebar">

          {/* Reference */}
          <div className="card">
            <div className="sec-label">Reference</div>
            <div className="ref-row">
              <div className="ref-field">
                <div className="field-label">Design size</div>
                <select value={refSize} onChange={(e) => setRefSize(Number(e.target.value))} className="field-select">
                  {PRESET_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
              <div className="ref-stroke-display">
                <span className="ref-stroke-val">{refStroke}</span>
              </div>
            </div>
            <div className="field-label">Base stroke weight</div>
            <input type="range" min="0.25" max="8" step="0.25" value={refStroke}
              onChange={(e) => setRefStroke(parseFloat(e.target.value))} />
            <div className="range-limits">
              <span>0.25</span><span>8</span>
            </div>
          </div>

          {/* Scaling */}
          <div className="card">
            <div className="mode-tabs">
              {[["auto", "Auto"], ["manual", "Manual"]].map(([mode, label]) => (
                <button key={mode}
                  onClick={() => mode === "auto" ? switchToAuto() : switchToManual()}
                  className={`mode-tab${scalingMode === mode ? " mode-tab--active" : ""}`}>
                  {label}
                </button>
              ))}
            </div>

            {scalingMode === "auto" ? (
              <>
                <div className="field-label">Compensation intensity</div>
                <div className="intensity-row">
                  <input type="range" min="0" max="1.5" step="0.05" value={autoIntensity}
                    className="range-flex"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setAutoIntensity(Math.abs(v - RECOMMENDED_INTENSITY) < 0.08 ? RECOMMENDED_INTENSITY : v);
                    }} />
                  <span className="intensity-val">{autoIntensity.toFixed(2)}</span>
                </div>
                <div className="intensity-labels">
                  <span className="intensity-limit">0</span>
                  <button onClick={() => setAutoIntensity(RECOMMENDED_INTENSITY)}
                    className={`recommend-btn${isNearRecommended ? " recommend-btn--active" : ""}`}>
                    {isNearRecommended ? "★" : "◇"} recommended
                  </button>
                  <span className="intensity-limit">1.5</span>
                </div>
                <div className="curve-wrap">
                  <CurveGraph intensity={autoIntensity} refSize={refSize} refStroke={refStroke} sizes={activeSizes} />
                </div>
                <div className="curve-label">
                  stroke = detected × ({refSize}/size)^{autoIntensity.toFixed(2)}
                </div>
              </>
            ) : (
              <>
                <div className="manual-header">
                  <div className="field-label">Stroke per size</div>
                  <button onClick={seedManualFromAuto} className="btn-reset">Reset to auto</button>
                </div>
                <div className="manual-list">
                  {activeSizes.map((size) => {
                    const val = manualStrokes[size] ?? calcStroke(refStroke, refSize, size, autoIntensity);
                    return (
                      <div key={size} className="manual-row">
                        <span className={`manual-size-label${size === refSize ? " manual-size-label--ref" : ""}`}>{size}</span>
                        <input type="range" min="0.25" max="6" step="0.25" value={val}
                          className="range-flex"
                          onChange={(e) => setManualStrokes((p) => ({ ...p, [size]: parseFloat(e.target.value) }))} />
                        <span className="manual-stroke-val">{val}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="manual-footer">Applied to all icons</div>
              </>
            )}
          </div>

          {/* Saved Curves */}
          <div className="card">
            <div className="sec-label">Saved Curves</div>
            {savedCurves.length === 0 && (
              <div className="curves-empty">No saved curves yet</div>
            )}
            {savedCurves.map((curve) => (
              <div key={curve.id} className="curve-preset-row">
                <span className="curve-preset-name">{curve.name}</span>
                <span className="curve-preset-meta">
                  {curve.scalingMode === "manual" ? "manual" : `auto · ${curve.autoIntensity.toFixed(2)}`}
                </span>
                <button onClick={() => loadCurve(curve)} className="curve-preset-load">Load</button>
                <button onClick={() => deleteCurve(curve.id)} className="curve-preset-delete">×</button>
              </div>
            ))}
            <div className="curve-save-row">
              <input
                type="text"
                placeholder="Name this curve…"
                value={curveName}
                onChange={(e) => setCurveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveCurrentCurve(); }}
                className="curve-name-input"
              />
              <button onClick={saveCurrentCurve} disabled={!curveName.trim()} className="curve-save-btn">
                Save
              </button>
            </div>
          </div>

          {/* Export Sizes */}
          <div className="card">
            <div className="sec-label">Export Sizes</div>
            <div className="size-grid">
              {PRESET_SIZES.map((s) => {
                const active = activeSizes.includes(s);
                return (
                  <button key={s} onClick={() => toggleSize(s)}
                    className={`size-btn${active ? " size-btn--active" : ""}`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebar-spacer" />

          <button onClick={exportAll} disabled={workspace.length === 0 || activeSizes.length === 0}
            className="export-btn">
            {workspace.length > 0 ? `Export all (${workspace.length}) →` : "Export all →"}
          </button>
        </div>

        {/* ── Main Content ── */}
        <div
          className="main-content"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUploadFiles(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div className="drag-overlay">
              <div className="drag-overlay-inner">
                <div className="drag-overlay-arrow">↓</div>
                <div className="drag-overlay-label">Drop SVG files</div>
              </div>
            </div>
          )}

          {workspace.length === 0 && !loadingWorkspace ? (
            <div className="empty-state">
              <div className="empty-diamond">◇</div>
              <span>Browse the icon library or upload your own SVGs</span>
              <div className="empty-actions">
                <button onClick={() => setShowBrowser(true)} className="btn-empty-primary">◇ Browse Icons</button>
                <label className="btn-empty-ghost">
                  ↑ Upload SVG
                  <input type="file" accept=".svg,image/svg+xml" multiple style={{ display: "none" }}
                    onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              <div className="empty-tips-grid">
                {[
                  {
                    label: "Figma",
                    tips: [
                      ["Center stroke alignment", "inside/outside strokes are expanded to filled paths on SVG export"],
                      ["Avoid Outline Stroke", "the right-click option converts strokes to fills — keep strokes live"],
                      ["Export from a Frame", "bare groups may omit the viewBox; frames always include it"],
                      ["Don't Flatten Selection", "flattening merges paths and discards individual stroke data"],
                    ],
                  },
                  {
                    label: "Adobe Illustrator",
                    tips: [
                      ["Avoid Object → Expand", "expands strokes into filled outlines before export"],
                      ["Presentation Attributes", "in SVG Options — not CSS Properties or Style Element"],
                      ["Enable Responsive", "removes fixed width/height while preserving viewBox"],
                      ["File → Save As → SVG", "produces cleaner output than Export As → SVG"],
                    ],
                  },
                ].map(({ label, tips }) => (
                  <div key={label} className="tip-card">
                    <div className="tip-card-label">{label}</div>
                    <div className="tip-list">
                      {tips.map(([title, desc]) => (
                        <div key={title} className="tip-item">
                          <span className="tip-title">{title}</span>
                          <span className="tip-desc">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div className="col-headers">
                <div className="col-icon-label">Icon</div>
                <div className="col-sizes">
                  {activeSizes.map((size) => {
                    const dim = Math.max(size + 16, 40);
                    return (
                      <div key={size} className="col-size-header" style={{ width: dim }}>
                        <span className={`col-size-label${size === refSize ? " col-size-label--ref" : ""}`}>{size}px</span>
                      </div>
                    );
                  })}
                </div>
                <div className="col-spacer" />
              </div>

              {workspace.map((item) => (
                <WorkspaceRow
                  key={item.id}
                  item={item}
                  activeSizes={activeSizes}
                  getStrokeForSize={getStrokeForSize}
                  onRemove={() => removeFromWorkspace(item.id)}
                />
              ))}

              {loadingWorkspace && (
                <div className="loading-row">
                  <span>Loading icons…</span>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
