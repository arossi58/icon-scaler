import { useState, useCallback, useEffect, useMemo } from "react";
import { PRESET_SIZES, ICON_LIBRARIES } from "./constants.js";
import { STORAGE_KEY, loadSaved } from "./storage.js";
import { calcStroke, rewriteSvg, detectBaseStroke } from "./svg.js";
import IconBrowser from "./components/IconBrowser.jsx";
import WorkspaceRow from "./components/WorkspaceRow.jsx";
import CurveGraph from "./components/CurveGraph.jsx";

const secLabel = { fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 };

export default function App() {
  const [workspace, setWorkspace] = useState(() => {
    const s = loadSaved();
    return Array.isArray(s.workspace) ? s.workspace : [];
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [refSize, setRefSize] = useState(() => loadSaved().refSize ?? 24);
  const [refStroke, setRefStroke] = useState(() => loadSaved().refStroke ?? 2);
  const [scalingMode, setScalingMode] = useState(() => loadSaved().scalingMode ?? "auto");
  const [autoIntensity, setAutoIntensity] = useState(() => loadSaved().autoIntensity ?? 0.5);
  const [activeSizes, setActiveSizes] = useState(() => {
    const s = loadSaved();
    return Array.isArray(s.activeSizes) ? s.activeSizes : [12, 16, 20, 24, 32, 48];
  });
  const [manualStrokes, setManualStrokes] = useState(() => loadSaved().manualStrokes ?? {});
  const [showBrowser, setShowBrowser] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // null | {done, total}
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        workspace, refSize, refStroke, scalingMode, autoIntensity, activeSizes, manualStrokes,
      }));
    } catch (e) {
      console.warn("Failed to save state:", e.message);
    }
  }, [workspace, refSize, refStroke, scalingMode, autoIntensity, activeSizes, manualStrokes]);

  const clearAll = useCallback(() => {
    setWorkspace([]);
    setRefSize(24);
    setRefStroke(2);
    setScalingMode("auto");
    setAutoIntensity(0.5);
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

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'DM Mono', monospace" }}>

      {showBrowser && (
        <IconBrowser
          onAddToWorkspace={addToWorkspace}
          onClose={() => setShowBrowser(false)}
          existingIds={workspaceIds}
        />
      )}

      {exportProgress && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
          <div style={{ textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
            <div style={{ fontSize: 13, color: "#f0f0f0", marginBottom: 12 }}>Exporting…</div>
            <div style={{ width: 200, height: 2, background: "#1e1e1e", borderRadius: 1, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", background: "#7a9ad4", borderRadius: 1, width: `${(exportProgress.done / exportProgress.total) * 100}%`, transition: "width 0.1s" }} />
            </div>
            <div style={{ fontSize: 10, color: "#999", fontVariantNumeric: "tabular-nums" }}>{exportProgress.done} / {exportProgress.total}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e1e", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg, #f0f0f0, #888)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f0f0" }}>Icon Scaler</span>
          {workspace.length > 0 && (
            <span style={{ fontSize: 10, color: "#888" }}>{workspace.length} icon{workspace.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {workspace.length > 0 && (
          <button onClick={clearAll}
            style={{ padding: "6px 14px", fontSize: 11, background: "transparent", color: "#999", border: "1px solid #222", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
            Clear all
          </button>
        )}
        <label style={{ padding: "6px 14px", fontSize: 11, background: "transparent", color: "#999", border: "1px solid #222", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
          ↑ Upload SVG
          <input type="file" accept=".svg,image/svg+xml" multiple style={{ display: "none" }}
            onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <button onClick={() => setShowBrowser(true)}
          style={{ padding: "6px 14px", fontSize: 11, background: "linear-gradient(135deg, #161625, #131a2e)", color: "#7a9ad4", border: "1px solid #253050", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
          ◇ Browse Icons
        </button>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 51px)" }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 268, minWidth: 268, borderRight: "1px solid #1e1e1e", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>

          {/* Reference */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={secLabel}>Reference</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#888", marginBottom: 4 }}>Design size</div>
                <select value={refSize} onChange={(e) => setRefSize(Number(e.target.value))}
                  style={{ width: "100%", padding: "5px 6px", fontSize: 11, background: "#181818", color: "#ccc", border: "1px solid #252525", borderRadius: 5, outline: "none", fontFamily: "'DM Mono', monospace" }}>
                  {PRESET_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
              <div style={{ paddingTop: 14, textAlign: "right" }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: "#c9a55a", fontVariantNumeric: "tabular-nums" }}>{refStroke}</span>
              </div>
            </div>
            <div style={{ fontSize: 9, color: "#888", marginBottom: 4 }}>Base stroke weight</div>
            <input type="range" min="0.25" max="8" step="0.25" value={refStroke}
              onChange={(e) => setRefStroke(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#c9a55a" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#888", marginTop: 2 }}>
              <span>0.25</span><span>8</span>
            </div>
          </div>

          {/* Scaling */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={{ display: "flex", background: "#0e0e0e", borderRadius: 6, padding: 2, marginBottom: 12, border: "1px solid #191919" }}>
              {[["auto", "Auto"], ["manual", "Manual"]].map(([mode, label]) => (
                <button key={mode}
                  onClick={() => mode === "auto" ? switchToAuto() : switchToManual()}
                  style={{ flex: 1, padding: "5px 0", fontSize: 11, fontFamily: "'DM Mono', monospace", background: scalingMode === mode ? "#1a1a1a" : "transparent", color: scalingMode === mode ? "#f0f0f0" : "#999", border: `1px solid ${scalingMode === mode ? "#2a2a2a" : "transparent"}`, borderRadius: 5, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {scalingMode === "auto" ? (
              <>
                <div style={{ fontSize: 9, color: "#888", marginBottom: 4 }}>Compensation intensity</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <input type="range" min="0" max="1.5" step="0.05" value={autoIntensity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setAutoIntensity(Math.abs(v - 0.5) < 0.08 ? 0.5 : v);
                    }}
                    style={{ flex: 1, accentColor: "#c9a55a" }} />
                  <span style={{ fontSize: 11, color: "#c9a55a", minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{autoIntensity.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 8, color: "#888" }}>0</span>
                  <button onClick={() => setAutoIntensity(0.5)}
                    style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", cursor: "pointer", padding: "2px 7px", borderRadius: 4, transition: "all 0.15s", background: Math.abs(autoIntensity - 0.5) < 0.03 ? "#16140e" : "transparent", color: Math.abs(autoIntensity - 0.5) < 0.03 ? "#c9a55a" : "#999", border: `1px solid ${Math.abs(autoIntensity - 0.5) < 0.03 ? "#3a2e1a" : "#252525"}` }}>
                    {Math.abs(autoIntensity - 0.5) < 0.03 ? "★" : "◇"} recommended
                  </button>
                  <span style={{ fontSize: 8, color: "#888" }}>1.5</span>
                </div>
                <div style={{ background: "#0e0e0e", borderRadius: 6, padding: "6px 4px 2px", border: "1px solid #191919" }}>
                  <CurveGraph intensity={autoIntensity} refSize={refSize} refStroke={refStroke} sizes={activeSizes} />
                </div>
                <div style={{ fontSize: 8, color: "#888", marginTop: 4, textAlign: "center" }}>
                  stroke = detected × ({refSize}/size)^{autoIntensity.toFixed(2)}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: "#888" }}>Stroke per size</div>
                  <button onClick={seedManualFromAuto}
                    style={{ fontSize: 9, color: "#999", background: "transparent", border: "1px solid #222", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                    Reset to auto
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {activeSizes.map((size) => {
                    const val = manualStrokes[size] ?? calcStroke(refStroke, refSize, size, autoIntensity);
                    return (
                      <div key={size} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: size === refSize ? "#f0f0f0" : "#999", width: 22, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{size}</span>
                        <input type="range" min="0.25" max="6" step="0.25" value={val}
                          onChange={(e) => setManualStrokes((p) => ({ ...p, [size]: parseFloat(e.target.value) }))}
                          style={{ flex: 1, accentColor: "#c9a55a" }} />
                        <span style={{ fontSize: 10, color: "#c9a55a", minWidth: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 9, color: "#888", marginTop: 8 }}>Applied to all icons</div>
              </>
            )}
          </div>

          {/* Export Sizes */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={secLabel}>Export Sizes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {PRESET_SIZES.map((s) => {
                const active = activeSizes.includes(s);
                return (
                  <button key={s} onClick={() => toggleSize(s)}
                    style={{ padding: "4px 9px", fontSize: 11, background: active ? "#1e1e1e" : "transparent", color: active ? "#f0f0f0" : "#888", border: `1px solid ${active ? "#333" : "#191919"}`, borderRadius: 5, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={exportAll} disabled={workspace.length === 0 || activeSizes.length === 0}
            style={{ padding: "10px 0", fontSize: 11, fontWeight: 500, fontFamily: "'DM Mono', monospace", background: workspace.length > 0 ? "linear-gradient(135deg, #161625, #131a2e)" : "#161616", color: workspace.length > 0 ? "#7a9ad4" : "#888", border: workspace.length > 0 ? "1px solid #253050" : "1px solid #1a1a1a", borderRadius: 7, cursor: workspace.length > 0 ? "pointer" : "not-allowed" }}>
            {workspace.length > 0 ? `Export all (${workspace.length}) →` : "Export all →"}
          </button>
        </div>

        {/* ── Main Content ── */}
        <div
          style={{ flex: 1, padding: "16px 20px", overflow: "auto", position: "relative" }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUploadFiles(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,10,0.88)", border: "2px dashed #253050", backdropFilter: "blur(2px)", pointerEvents: "none" }}>
              <div style={{ textAlign: "center", color: "#7a9ad4", fontFamily: "'DM Mono', monospace" }}>
                <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>↓</div>
                <div style={{ fontSize: 13 }}>Drop SVG files</div>
              </div>
            </div>
          )}

          {workspace.length === 0 && !loadingWorkspace ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 110px)", color: "#888", fontSize: 12, gap: 14 }}>
              <div style={{ fontSize: 32, opacity: 0.2 }}>◇</div>
              <span>Browse the icon library or upload your own SVGs</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowBrowser(true)}
                  style={{ padding: "8px 18px", fontSize: 12, background: "#131313", color: "#7a9ad4", border: "1px solid #253050", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                  ◇ Browse Icons
                </button>
                <label style={{ padding: "8px 18px", fontSize: 12, background: "transparent", color: "#999", border: "1px solid #222", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                  ↑ Upload SVG
                  <input type="file" accept=".svg,image/svg+xml" multiple style={{ display: "none" }}
                    onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              <div style={{ marginTop: 8, width: "min(600px, 90vw)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                  <div key={label} style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>{label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tips.map(([title, desc]) => (
                        <div key={title} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 9, color: "#c9a55a", fontFamily: "'DM Mono', monospace" }}>{title}</span>
                          <span style={{ fontSize: 10, color: "#888", lineHeight: 1.4 }}>{desc}</span>
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
              <div style={{ display: "flex", alignItems: "center", padding: "0 0 8px", borderBottom: "1px solid #1a1a1a", marginBottom: 2 }}>
                <div style={{ width: 156, flexShrink: 0, paddingRight: 16 }}>
                  <span style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>Icon</span>
                </div>
                <div style={{ display: "flex", gap: 10, flex: 1, overflowX: "auto" }}>
                  {activeSizes.map((size) => {
                    const dim = Math.max(size + 16, 40);
                    return (
                      <div key={size} style={{ width: dim, flexShrink: 0, textAlign: "center" }}>
                        <span style={{ fontSize: 9, color: size === refSize ? "#999" : "#888", fontFamily: "'DM Mono', monospace" }}>{size}px</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ width: 46, flexShrink: 0 }} />
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0", color: "#888", fontSize: 11 }}>
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
