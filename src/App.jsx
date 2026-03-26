import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import iconLists from "virtual:icon-lists";

const PRESET_SIZES = [12, 16, 20, 24, 32, 40, 48, 64];
const STORAGE_KEY = "icon-scaler-v1";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; }
  catch { return {}; }
}

function calcStroke(refStroke, refSize, targetSize, intensity) {
  if (intensity === 0 || targetSize === refSize) return refStroke;
  const ratio = refSize / targetSize;
  const compensated = refStroke * Math.pow(ratio, intensity);
  return Math.round(compensated * 100) / 100;
}

const ICON_LIBRARIES = {
  lucide: {
    name: "Lucide",
    desc: `${iconLists.lucide.length} icons`,
    fetchList: async () => iconLists.lucide,
    fetchSvg: async (n) => { const r = await fetch(`/icons/lucide/${n}.svg`); return r.text(); },
  },
  phosphor: {
    name: "Phosphor",
    desc: `${iconLists.phosphor.length} icons`,
    fetchList: async () => iconLists.phosphor,
    fetchSvg: async (n) => { const r = await fetch(`/icons/phosphor/${n}.svg`); return r.text(); },
  },
  heroicons: {
    name: "Heroicons",
    desc: `${iconLists.heroicons.length} icons`,
    fetchList: async () => iconLists.heroicons,
    fetchSvg: async (n) => { const r = await fetch(`/icons/heroicons/${n}.svg`); return r.text(); },
  },
};

function parseSvg(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  const vb = svg.getAttribute("viewBox");
  let viewBox = null;
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4) viewBox = parts;
  }
  const w = parseFloat(svg.getAttribute("width")) || (viewBox ? viewBox[2] : 24);
  const h = parseFloat(svg.getAttribute("height")) || (viewBox ? viewBox[3] : 24);
  return { svg, width: w, height: h, viewBox: viewBox || [0, 0, w, h] };
}

// Returns true if any element in the SVG uses stroke painting.
function hasSvgStrokes(svgEl) {
  const usesStroke = (el) => {
    const s = el.getAttribute("stroke");
    if (s && s !== "none") return true;
    if (el.getAttribute("stroke-width") !== null) return true;
    const st = el.getAttribute("style");
    if (st && /stroke\s*:\s*(?!none)/.test(st)) return true;
    return false;
  };
  if (usesStroke(svgEl)) return true;
  for (const el of svgEl.querySelectorAll("*")) {
    if (usesStroke(el)) return true;
  }
  return false;
}

function rewriteSvg(raw, strokeWidth, size) {
  const parsed = parseSvg(raw);
  if (!parsed) return raw;
  const { svg, viewBox } = parsed;
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", size);
  clone.setAttribute("height", size);
  clone.setAttribute("viewBox", viewBox.join(" "));
  // Convert strokeWidth (in screen-pixel terms) to the icon's native coordinate space.
  // e.g. Phosphor uses a 256×256 viewBox: stroke-width="2" at 24px → 2*(256/24) ≈ 21.3 native units.
  const nativeSw = Math.round((strokeWidth * (viewBox[2] / size)) * 1000) / 1000;
  // For fill-based icons (e.g. Phosphor regular), inject stroke so the weight slider works.
  if (!hasSvgStrokes(clone)) {
    clone.setAttribute("stroke", "currentColor");
    clone.setAttribute("stroke-linejoin", "round");
    clone.setAttribute("stroke-linecap", "round");
    // Suppress stroke on any fill="none" elements to avoid drawing unwanted box outlines.
    clone.querySelectorAll("[fill='none']").forEach((el) => el.setAttribute("stroke", "none"));
  }
  clone.setAttribute("stroke-width", nativeSw);
  clone.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute("stroke-width") !== null) el.setAttribute("stroke-width", nativeSw);
    const st = el.getAttribute("style");
    if (st && st.includes("stroke-width"))
      el.setAttribute("style", st.replace(/stroke-width:\s*[^;]+/g, `stroke-width: ${nativeSw}`));
  });
  return new XMLSerializer().serializeToString(clone);
}

function detectBaseStroke(raw) {
  const parsed = parseSvg(raw);
  if (!parsed) return 2;
  const { svg, viewBox } = parsed;
  // Normalize raw stroke-width to screen-pixel terms at 24px reference size,
  // so a Phosphor stroke-width="16" in a 256-unit viewBox → 16*(24/256) = 1.5
  const normalize = (sw) => Math.round(sw * (24 / viewBox[2]) * 100) / 100;
  const rootSw = svg.getAttribute("stroke-width");
  if (rootSw) return normalize(parseFloat(rootSw));
  const first = svg.querySelector("[stroke-width]");
  if (first) return normalize(parseFloat(first.getAttribute("stroke-width")));
  return 2;
}

function SvgBox({ svgString, size }) {
  const dim = Math.max(size + 16, 40);
  return (
    <div
      style={{
        width: dim, height: dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 50% / 12px 12px",
        borderRadius: 6, border: "1px solid #232323", flexShrink: 0, color: "#e0e0e0",
      }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}

/* ── Compensation Curve Visualizer ── */
function CurveGraph({ intensity, refSize, refStroke, sizes }) {
  const W = 200, H = 80, pad = 24;
  const minS = Math.min(...sizes, refSize), maxS = Math.max(...sizes, refSize);
  const x = (s) => pad + ((s - minS) / (maxS - minS)) * (W - pad * 2);
  const maxSw = refStroke * Math.pow(refSize / minS, Math.max(intensity, 0.01));
  const minSw = refStroke * Math.pow(refSize / maxS, Math.max(intensity, 0.01));
  const swRange = Math.max(maxSw - minSw, 0.1);
  const y = (sw) => H - pad - ((sw - minSw + 0.2) / (swRange + 0.4)) * (H - pad * 2);

  const pts = [];
  for (let s = minS; s <= maxS; s += 0.5) {
    const sw = calcStroke(refStroke, refSize, s, intensity);
    pts.push(`${x(s)},${y(sw)}`);
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#222" strokeWidth="1" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#222" strokeWidth="1" />
      <polyline points={pts.join(" ")} fill="none" stroke="#c9a55a" strokeWidth="1.5" opacity="0.7" />
      {sizes.map((s) => {
        const sw = calcStroke(refStroke, refSize, s, intensity);
        return (
          <g key={s}>
            <circle cx={x(s)} cy={y(sw)} r={s === refSize ? 3.5 : 2.5} fill={s === refSize ? "#f0f0f0" : "#c9a55a"} />
            <text x={x(s)} y={H - 6} textAnchor="middle" fontSize="7" fill="#888">{s}</text>
          </g>
        );
      })}
      <text x={4} y={10} fontSize="7" fill="#888">sw</text>
      <text x={W - pad} y={H - 6} fontSize="7" fill="#888" textAnchor="end">px</text>
    </svg>
  );
}

/* ── Icon Library Browser ── */
function IconBrowser({ onAddToWorkspace, onClose, existingIds }) {
  const [lib, setLib] = useState("lucide");
  const [icons, setIcons] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set()); // Set<"lib:name">
  const PER_PAGE = 80;
  const cache = useRef({});
  const searchRef = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const loadLibrary = useCallback(async (key) => {
    if (cache.current[key]) { setIcons(cache.current[key]); return; }
    setLoading(true); setError(null);
    try {
      const list = await ICON_LIBRARIES[key].fetchList();
      cache.current[key] = list; setIcons(list);
    } catch { setError("Failed to load icons."); setIcons([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadLibrary(lib); }, [lib, loadLibrary]);
  useEffect(() => {
    const q = search.toLowerCase().trim();
    setFiltered(q ? icons.filter((n) => n.toLowerCase().includes(q)) : icons);
    setPage(0);
  }, [search, icons]);

  const toggleSelect = (name) => {
    const key = `${lib}:${name}`;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAdd = () => {
    const list = Array.from(selected).map((key) => {
      const i = key.indexOf(":");
      return { lib: key.slice(0, i), name: key.slice(i + 1) };
    });
    onAddToWorkspace(list);
    onClose();
  };

  const pageIcons = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "min(740px, 94vw)", maxHeight: "84vh", background: "#0e0e0e", border: "1px solid #222", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f0f0", fontFamily: "'DM Mono', monospace" }}>Icon Library</span>
          <div style={{ flex: 1 }} />
          {selected.size > 0 && (
            <span style={{ fontSize: 10, color: "#999", fontFamily: "'DM Mono', monospace" }}>{selected.size} selected</span>
          )}
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#999", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", padding: "0 18px" }}>
          {Object.entries(ICON_LIBRARIES).map(([key, val]) => (
            <button key={key} onClick={() => { setLib(key); setSearch(""); }}
              style={{ padding: "10px 16px", fontSize: 11, fontFamily: "'DM Mono', monospace", background: "transparent", color: lib === key ? "#f0f0f0" : "#999", border: "none", borderBottom: lib === key ? "2px solid #f0f0f0" : "2px solid transparent", cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "baseline", gap: 6 }}>
              {val.name}<span style={{ fontSize: 9, color: "#888" }}>{val.desc}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 18px 8px" }}>
          <input ref={searchRef} type="text" placeholder="Search icons…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 12, fontFamily: "'DM Mono', monospace", background: "#141414", color: "#ccc", border: "1px solid #252525", borderRadius: 7, outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#888" }}>{loading ? "Loading…" : `${filtered.length} icons`}{search && !loading ? ` matching "${search}"` : ""}</span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={pagBtn(page === 0)}>‹</button>
                <span style={{ fontSize: 10, color: "#999", fontVariantNumeric: "tabular-nums" }}>{page + 1}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pagBtn(page >= totalPages - 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        {error && <div style={{ padding: "6px 18px", fontSize: 11, color: "#e07070" }}>{error}</div>}
        <div style={{ flex: 1, overflow: "auto", padding: "6px 18px 18px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#888", fontSize: 12 }}>Fetching icon list…</div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "#888", fontSize: 12 }}>No icons match "{search}"</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 3 }}>
              {pageIcons.map((name) => {
                const key = `${lib}:${name}`;
                const inWorkspace = existingIds.has(key);
                return (
                  <IconGridItem key={name} name={name} lib={lib}
                    onClick={() => !inWorkspace && toggleSelect(name)}
                    isSelected={selected.has(key)}
                    isInWorkspace={inWorkspace} />
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8, background: "#0a0a0a" }}>
          <span style={{ fontSize: 10, color: selected.size > 0 ? "#999" : "#888", fontFamily: "'DM Mono', monospace" }}>
            {selected.size > 0 ? `${selected.size} icon${selected.size !== 1 ? "s" : ""} selected` : "Click icons to select"}
          </span>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())}
              style={{ fontSize: 9, color: "#999", background: "transparent", border: "1px solid #252525", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
              Clear
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleAdd} disabled={selected.size === 0}
            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'DM Mono', monospace", background: selected.size > 0 ? "linear-gradient(135deg, #161625, #131a2e)" : "transparent", color: selected.size > 0 ? "#7a9ad4" : "#888", border: `1px solid ${selected.size > 0 ? "#253050" : "#1e1e1e"}`, borderRadius: 6, cursor: selected.size > 0 ? "pointer" : "default" }}>
            {selected.size > 0 ? `Add ${selected.size} to workspace →` : "Add to workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconGridItem({ name, lib, onClick, isSelected, isInWorkspace }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} disabled={isInWorkspace} title={isInWorkspace ? `${name} (in workspace)` : name}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "10px 4px 6px",
        background: isInWorkspace ? "#111" : isSelected ? "#0f1a0f" : hovered ? "#171717" : "transparent",
        border: `1px solid ${isInWorkspace ? "#181818" : isSelected ? "#1e3a1e" : hovered ? "#2a2a2a" : "transparent"}`,
        borderRadius: 8, cursor: isInWorkspace ? "default" : "pointer", color: "#bbb",
        transition: "background 0.1s, border-color 0.1s", opacity: isInWorkspace ? 0.35 : 1 }}>
      {isSelected && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 13, height: 13, borderRadius: "50%", background: "#3a7a3a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 8, color: "#fff", lineHeight: 1 }}>✓</span>
        </div>
      )}
      <IconThumb lib={lib} name={name} />
      <span style={{ fontSize: 8, color: isSelected ? "#5a9a5a" : "#888", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>{name}</span>
    </button>
  );
}

function IconThumb({ lib, name }) {
  const [svg, setSvg] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        obs.disconnect();
        ICON_LIBRARIES[lib].fetchSvg(name).then((text) => {
          if (cancelled) return;
          const parsed = parseSvg(text);
          if (parsed) {
            const { svg: el, viewBox } = parsed;
            el.setAttribute("width", "22"); el.setAttribute("height", "22");
            el.setAttribute("viewBox", viewBox.join(" "));
            if (!el.getAttribute("stroke")) el.setAttribute("stroke", "currentColor");
            setSvg(new XMLSerializer().serializeToString(el));
          } else setSvg(text);
        }).catch(() => {});
      }
    }, { rootMargin: "120px" });
    if (ref.current) obs.observe(ref.current);
    return () => { cancelled = true; obs.disconnect(); };
  }, [lib, name]);
  return (
    <div ref={ref} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
      {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span style={{ fontSize: 10, color: "#888" }}>·</span>}
    </div>
  );
}

/* ── Workspace Row ── */
function WorkspaceRow({ item, activeSizes, getStrokeForSize, onRemove }) {
  const { name, lib, svgText, detectedStroke } = item;
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #161616" }}>
      <div style={{ width: 156, flexShrink: 0, paddingRight: 16 }}>
        <div style={{ fontSize: 11, color: "#d0d0d0", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 9, color: "#888", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{ICON_LIBRARIES[lib]?.name ?? lib} · detected:{detectedStroke}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-end", overflowX: "auto", paddingBottom: 2 }}>
        {activeSizes.map((size) => {
          const sw = getStrokeForSize(size);
          const svg = rewriteSvg(svgText, sw, size);
          return (
            <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <SvgBox svgString={svg} size={size} />
              <span style={{ fontSize: 8, color: "#c9a55a", fontFamily: "'DM Mono', monospace" }}>{sw}</span>
            </div>
          );
        })}
      </div>
      <button onClick={onRemove}
        style={{ marginLeft: 14, padding: "4px 8px", fontSize: 12, lineHeight: 1, background: "transparent", color: "#888", border: "1px solid #1a1a1a", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Mono', monospace", flexShrink: 0, transition: "color 0.1s, border-color 0.1s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#bbb"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderColor = "#1a1a1a"; }}>
        ×
      </button>
    </div>
  );
}

/* ── Main App ── */
export default function IconScaler() {
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

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
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

  const workspaceIds = useMemo(() => new Set(workspace.map((item) => `${item.lib}:${item.name}`)), [workspace]);

  // Returns the final stroke for a given size using the global refStroke
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

  const toggleSize = (s) => setActiveSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s].sort((a, b) => a - b));

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
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" /></svg>
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

          {/* Size toggles */}
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
        <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
          {workspace.length === 0 && !loadingWorkspace ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 110px)", color: "#888", fontSize: 12, gap: 14 }}>
              <div style={{ fontSize: 32, opacity: 0.2 }}>◇</div>
              <span>Browse the icon library to add icons</span>
              <button onClick={() => setShowBrowser(true)}
                style={{ padding: "8px 18px", fontSize: 12, background: "#131313", color: "#7a9ad4", border: "1px solid #253050", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                ◇ Browse Icons
              </button>
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

const secLabel = { fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 };

function pagBtn(d) {
  return { padding: "2px 8px", fontSize: 10, background: "transparent", color: d ? "#888" : "#999", border: "1px solid #1e1e1e", borderRadius: 4, cursor: d ? "default" : "pointer", fontFamily: "'DM Mono', monospace" };
}
