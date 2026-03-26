import { useState, useRef, useCallback, useEffect, useMemo } from "react";

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="11" cy="11" r="8"/>
  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
</svg>`;

const PRESET_SIZES = [12, 16, 20, 24, 32, 40, 48, 64];

const SCALE_MODES = {
  none: { label: "None", desc: "Uniform stroke at all sizes", intensity: 0 },
  subtle: { label: "Subtle", desc: "Light optical correction", intensity: 0.25 },
  sqrt: { label: "Moderate", desc: "Square-root compensation", intensity: 0.5 },
  linear: { label: "Aggressive", desc: "Full inverse scaling", intensity: 1.0 },
  custom: { label: "Custom", desc: "Set your own curve", intensity: null },
};

function calcStroke(refStroke, refSize, targetSize, intensity) {
  if (intensity === 0 || targetSize === refSize) return refStroke;
  const ratio = refSize / targetSize;
  const compensated = refStroke * Math.pow(ratio, intensity);
  return Math.round(compensated * 100) / 100;
}

const ICON_LIBRARIES = {
  lucide: {
    name: "Lucide",
    desc: "1400+ icons",
    fetchList: async () => {
      const r = await fetch("https://unpkg.com/lucide-static@latest/icons/?meta");
      const d = await r.json();
      return d.files.filter((f) => f.path.endsWith(".svg")).map((f) => f.path.replace(/\.svg$/, ""));
    },
    fetchSvg: async (n) => {
      const r = await fetch(`https://unpkg.com/lucide-static@latest/icons/${n}.svg`);
      return r.text();
    },
  },
  phosphor: {
    name: "Phosphor",
    desc: "1500+ icons",
    fetchList: async () => {
      const r = await fetch("https://unpkg.com/@phosphor-icons/core@latest/assets/regular/?meta");
      const d = await r.json();
      return d.files.filter((f) => f.path.endsWith(".svg")).map((f) => f.path.replace(/\.svg$/, ""));
    },
    fetchSvg: async (n) => {
      const r = await fetch(`https://unpkg.com/@phosphor-icons/core@latest/assets/regular/${n}.svg`);
      return r.text();
    },
  },
  heroicons: {
    name: "Heroicons",
    desc: "300+ icons",
    fetchList: async () => {
      const r = await fetch("https://unpkg.com/heroicons@latest/24/outline/?meta");
      const d = await r.json();
      return d.files.filter((f) => f.path.endsWith(".svg")).map((f) => f.path.replace(/\.svg$/, ""));
    },
    fetchSvg: async (n) => {
      const r = await fetch(`https://unpkg.com/heroicons@latest/24/outline/${n}.svg`);
      return r.text();
    },
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

function rewriteSvg(raw, strokeWidth, size) {
  const parsed = parseSvg(raw);
  if (!parsed) return raw;
  const { svg, viewBox } = parsed;
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", size);
  clone.setAttribute("height", size);
  clone.setAttribute("viewBox", viewBox.join(" "));
  clone.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute("stroke-width") !== null) el.setAttribute("stroke-width", strokeWidth);
    const st = el.getAttribute("style");
    if (st && st.includes("stroke-width"))
      el.setAttribute("style", st.replace(/stroke-width:\s*[^;]+/g, `stroke-width: ${strokeWidth}`));
  });
  if (clone.getAttribute("stroke-width") !== null) clone.setAttribute("stroke-width", strokeWidth);
  return new XMLSerializer().serializeToString(clone);
}

function detectBaseStroke(raw) {
  const parsed = parseSvg(raw);
  if (!parsed) return 2;
  const { svg } = parsed;
  const rootSw = svg.getAttribute("stroke-width");
  if (rootSw) return parseFloat(rootSw);
  const first = svg.querySelector("[stroke-width]");
  if (first) return parseFloat(first.getAttribute("stroke-width"));
  return 2;
}

function SvgBox({ svgString, size }) {
  const dim = Math.max(size + 16, 48);
  return (
    <div
      style={{
        width: dim, height: dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 50% / 12px 12px",
        borderRadius: 8, border: "1px solid #232323",
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
            <text x={x(s)} y={H - 6} textAnchor="middle" fontSize="7" fill="#444">{s}</text>
          </g>
        );
      })}
      <text x={4} y={10} fontSize="7" fill="#444">sw</text>
      <text x={W - pad} y={H - 6} fontSize="7" fill="#444" textAnchor="end">px</text>
    </svg>
  );
}

/* ── Icon Library Browser ── */
function IconBrowser({ onSelect, onClose }) {
  const [lib, setLib] = useState("lucide");
  const [icons, setIcons] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSvg, setLoadingSvg] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
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

  const handlePick = async (name) => {
    setLoadingSvg(name);
    try {
      const svg = await ICON_LIBRARIES[lib].fetchSvg(name);
      onSelect(svg, `${ICON_LIBRARIES[lib].name} / ${name}`);
    } catch { setError("Failed to fetch icon."); }
    setLoadingSvg(null);
  };

  const pageIcons = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "min(740px, 94vw)", maxHeight: "84vh", background: "#0e0e0e", border: "1px solid #222", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f0f0", fontFamily: "'DM Mono', monospace" }}>Icon Library</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#555", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", padding: "0 18px" }}>
          {Object.entries(ICON_LIBRARIES).map(([key, val]) => (
            <button key={key} onClick={() => { setLib(key); setSearch(""); }}
              style={{ padding: "10px 16px", fontSize: 11, fontFamily: "'DM Mono', monospace", background: "transparent", color: lib === key ? "#f0f0f0" : "#555", border: "none", borderBottom: lib === key ? "2px solid #f0f0f0" : "2px solid transparent", cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "baseline", gap: 6 }}>
              {val.name}<span style={{ fontSize: 9, color: "#3a3a3a" }}>{val.desc}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 18px 8px" }}>
          <input ref={searchRef} type="text" placeholder="Search icons…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 12, fontFamily: "'DM Mono', monospace", background: "#141414", color: "#ccc", border: "1px solid #252525", borderRadius: 7, outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#3a3a3a" }}>{loading ? "Loading…" : `${filtered.length} icons`}{search && !loading ? ` matching "${search}"` : ""}</span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={pagBtn(page === 0)}>‹</button>
                <span style={{ fontSize: 10, color: "#555", fontVariantNumeric: "tabular-nums" }}>{page + 1}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pagBtn(page >= totalPages - 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        {error && <div style={{ padding: "6px 18px", fontSize: 11, color: "#e07070" }}>{error}</div>}
        <div style={{ flex: 1, overflow: "auto", padding: "6px 18px 18px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#3a3a3a", fontSize: 12 }}>Fetching icon list…</div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "#333", fontSize: 12 }}>No icons match "{search}"</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 3 }}>
              {pageIcons.map((name) => (
                <IconGridItem key={name} name={name} lib={lib} loading={loadingSvg === name} onClick={() => handlePick(name)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IconGridItem({ name, lib, loading, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} disabled={loading} title={name} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "10px 4px 6px", background: loading ? "#191919" : hovered ? "#171717" : "transparent", border: `1px solid ${hovered ? "#2a2a2a" : "transparent"}`, borderRadius: 8, cursor: loading ? "wait" : "pointer", color: "#bbb", transition: "background 0.1s, border-color 0.1s" }}>
      <IconThumb lib={lib} name={name} />
      <span style={{ fontSize: 8, color: "#4a4a4a", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>{name}</span>
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
    <div ref={ref} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}>
      {!svg && <span style={{ fontSize: 10, color: "#2a2a2a" }}>·</span>}
    </div>
  );
}

/* ── Main App ── */
export default function IconScaler() {
  const [rawSvg, setRawSvg] = useState(DEFAULT_SVG);
  const [iconLabel, setIconLabel] = useState(null);
  const [baseStroke, setBaseStroke] = useState(2);
  const [refStroke, setRefStroke] = useState(2);
  const [refSize, setRefSize] = useState(24);
  const [scaleMode, setScaleMode] = useState("sqrt");
  const [customIntensity, setCustomIntensity] = useState(0.5);
  const [activeSizes, setActiveSizes] = useState([12, 16, 20, 24, 32, 48]);
  const [manualOverrides, setManualOverrides] = useState({});
  const [tab, setTab] = useState("preview");
  const [showInput, setShowInput] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [copied, setCopied] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
  }, []);

  const intensity = scaleMode === "custom" ? customIntensity : SCALE_MODES[scaleMode].intensity;

  const getAutoStroke = useCallback((size) => calcStroke(refStroke, refSize, size, intensity), [refStroke, refSize, intensity]);

  const getFinalStroke = useCallback((size) => {
    if (manualOverrides[size] !== undefined) return manualOverrides[size];
    return getAutoStroke(size);
  }, [manualOverrides, getAutoStroke]);

  const computedStrokes = useMemo(() => {
    const map = {};
    activeSizes.forEach((s) => { map[s] = getFinalStroke(s); });
    return map;
  }, [activeSizes, getFinalStroke]);

  const handleSvgInput = useCallback((text, label) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    setRawSvg(cleaned);
    setIconLabel(label || null);
    const detected = detectBaseStroke(cleaned);
    setBaseStroke(detected);
    setRefStroke(detected);
    setManualOverrides({});
  }, []);

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleSvgInput(ev.target.result, file.name.replace(/\.svg$/i, ""));
    reader.readAsText(file);
  }, [handleSvgInput]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith(".svg")) {
      const reader = new FileReader();
      reader.onload = (ev) => handleSvgInput(ev.target.result, file.name.replace(/\.svg$/i, ""));
      reader.readAsText(file);
    } else {
      const text = e.dataTransfer.getData("text");
      if (text) handleSvgInput(text);
    }
  }, [handleSvgInput]);

  const toggleSize = (s) => setActiveSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s].sort((a, b) => a - b));

  const exportSvg = (size) => {
    const sw = computedStrokes[size];
    const svg = rewriteSvg(rawSvg, sw, size);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${(iconLabel || "icon").replace(/[^a-zA-Z0-9-_]/g, "-")}-${size}px.svg`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportAll = () => activeSizes.forEach((s, i) => setTimeout(() => exportSvg(s), i * 100));

  const copySvg = (size) => {
    const sw = computedStrokes[size];
    navigator.clipboard.writeText(rewriteSvg(rawSvg, sw, size));
    setCopied(size); setTimeout(() => setCopied(null), 1500);
  };

  const isValid = parseSvg(rawSvg) !== null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'DM Mono', monospace" }}
      onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>

      {showBrowser && <IconBrowser onSelect={(svg, label) => { handleSvgInput(svg, label); setShowBrowser(false); }} onClose={() => setShowBrowser(false)} />}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e1e", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg, #f0f0f0, #888)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f0f0" }}>Icon Scaler</span>
          {iconLabel && <span style={{ fontSize: 11, color: "#4a4a4a" }}>{iconLabel}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setShowBrowser(true)} style={{ padding: "6px 14px", fontSize: 11, background: "linear-gradient(135deg, #161625, #131a2e)", color: "#7a9ad4", border: "1px solid #253050", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>◇ Icon Library</button>
          <button onClick={() => setShowInput(!showInput)} style={{ padding: "6px 14px", fontSize: 11, background: showInput ? "#1e1e1e" : "transparent", color: showInput ? "#f0f0f0" : "#555", border: "1px solid #2a2a2a", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Paste SVG</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "6px 14px", fontSize: 11, background: "transparent", color: "#555", border: "1px solid #2a2a2a", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Upload</button>
          <input ref={fileInputRef} type="file" accept=".svg" onChange={handleFile} style={{ display: "none" }} />
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 51px)" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 268, minWidth: 268, borderRight: "1px solid #1e1e1e", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>

          {/* Reference settings */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={secLabel}>Reference Point</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#3a3a3a", marginBottom: 4 }}>Size (px)</div>
                <select value={refSize} onChange={(e) => setRefSize(Number(e.target.value))}
                  style={{ width: "100%", padding: "5px 6px", fontSize: 11, background: "#181818", color: "#ccc", border: "1px solid #252525", borderRadius: 5, outline: "none", fontFamily: "'DM Mono', monospace" }}>
                  {PRESET_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#3a3a3a", marginBottom: 4 }}>Stroke</div>
                <input type="number" min="0.25" max="8" step="0.25" value={refStroke}
                  onChange={(e) => setRefStroke(parseFloat(e.target.value) || 1)}
                  style={{ width: "100%", padding: "5px 6px", fontSize: 11, background: "#181818", color: "#ccc", border: "1px solid #252525", borderRadius: 5, outline: "none", fontFamily: "'DM Mono', monospace", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ fontSize: 9, color: "#333" }}>Icon is designed at {refSize}px with stroke {refStroke}</div>
          </div>

          {/* Scaling mode */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={secLabel}>Auto Scaling</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
              {Object.entries(SCALE_MODES).map(([key, m]) => (
                <button key={key} onClick={() => setScaleMode(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    background: scaleMode === key ? "#1a1a1a" : "transparent",
                    border: `1px solid ${scaleMode === key ? "#2a2a2a" : "transparent"}`,
                    borderRadius: 6, cursor: "pointer", textAlign: "left",
                  }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${scaleMode === key ? "#c9a55a" : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {scaleMode === key && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a55a" }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: scaleMode === key ? "#f0f0f0" : "#777", fontFamily: "'DM Mono', monospace" }}>{m.label}</div>
                    <div style={{ fontSize: 9, color: "#3a3a3a" }}>{m.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {scaleMode === "custom" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="range" min="0" max="1.5" step="0.05" value={customIntensity}
                    onChange={(e) => setCustomIntensity(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#c9a55a" }} />
                  <span style={{ fontSize: 11, color: "#c9a55a", minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{customIntensity}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#333", marginTop: 2 }}>
                  <span>No compensation</span><span>Aggressive</span>
                </div>
              </div>
            )}

            {/* Curve viz */}
            <div style={{ background: "#0e0e0e", borderRadius: 6, padding: "6px 4px 2px", border: "1px solid #191919" }}>
              <CurveGraph intensity={intensity} refSize={refSize} refStroke={refStroke} sizes={activeSizes} />
            </div>
            <div style={{ fontSize: 8, color: "#2a2a2a", marginTop: 4, textAlign: "center" }}>
              stroke = {refStroke} × ({refSize}/size)^{intensity.toFixed(2)}
            </div>
          </div>

          {/* Size toggles */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={secLabel}>Export Sizes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {PRESET_SIZES.map((s) => {
                const active = activeSizes.includes(s);
                return (
                  <button key={s} onClick={() => toggleSize(s)}
                    style={{ padding: "4px 9px", fontSize: 11, background: active ? "#1e1e1e" : "transparent", color: active ? "#f0f0f0" : "#333", border: `1px solid ${active ? "#333" : "#191919"}`, borderRadius: 5, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual overrides */}
          <div style={{ background: "#111", borderRadius: 8, padding: "12px 12px 14px", border: "1px solid #1a1a1a" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={secLabel}>Manual Overrides</div>
              {Object.keys(manualOverrides).length > 0 && (
                <button onClick={() => setManualOverrides({})}
                  style={{ fontSize: 9, color: "#555", background: "transparent", border: "1px solid #222", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                  Clear all
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {activeSizes.map((size) => {
                const auto = getAutoStroke(size);
                const final = computedStrokes[size];
                const isOverridden = manualOverrides[size] !== undefined;
                return (
                  <div key={size} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: size === refSize ? "#f0f0f0" : "#4a4a4a", width: 22, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{size}</span>
                    <input type="range" min="0.25" max="6" step="0.25" value={final}
                      onChange={(e) => setManualOverrides((p) => ({ ...p, [size]: parseFloat(e.target.value) }))}
                      style={{ flex: 1, accentColor: isOverridden ? "#e07070" : "#3a3a3a" }} />
                    <span style={{ fontSize: 10, color: isOverridden ? "#e07070" : "#4a4a4a", minWidth: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {final}
                    </span>
                    {isOverridden ? (
                      <button onClick={() => setManualOverrides((p) => { const n = { ...p }; delete n[size]; return n; })}
                        title={`Reset to auto (${auto})`}
                        style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 3, color: "#555", cursor: "pointer", fontSize: 10, padding: 0 }}>
                        ×
                      </button>
                    ) : (
                      <div style={{ width: 16 }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 8, color: "#2a2a2a", marginTop: 6 }}>Drag to override auto value · red = manual</div>
          </div>

          {/* Export button */}
          <button onClick={exportAll} disabled={!isValid || activeSizes.length === 0}
            style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 500, fontFamily: "'DM Mono', monospace", background: isValid ? "#f0f0f0" : "#161616", color: isValid ? "#0a0a0a" : "#3a3a3a", border: "none", borderRadius: 7, cursor: isValid ? "pointer" : "not-allowed", marginTop: 4 }}>
            Export All ({activeSizes.length})
          </button>
        </div>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
          {showInput && (
            <div style={{ marginBottom: 16 }}>
              <textarea defaultValue={rawSvg} placeholder="Paste SVG code here…" onBlur={(e) => handleSvgInput(e.target.value)}
                style={{ width: "100%", height: 105, background: "#111", color: "#777", border: "1px solid #1e1e1e", borderRadius: 8, padding: 12, fontSize: 11, fontFamily: "'DM Mono', monospace", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {!isValid ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, border: "1px dashed #1e1e1e", borderRadius: 12, color: "#3a3a3a", fontSize: 12, gap: 14 }}>
              <span>Drop an .svg, paste code, or browse the library</span>
              <button onClick={() => setShowBrowser(true)} style={{ padding: "8px 18px", fontSize: 12, background: "#131313", color: "#7a9ad4", border: "1px solid #253050", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>◇ Browse Icons</button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid #1e1e1e" }}>
                {["preview", "compare", "code"].map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{ padding: "7px 14px", fontSize: 11, textTransform: "capitalize", background: "transparent", color: tab === t ? "#f0f0f0" : "#3a3a3a", border: "none", borderBottom: tab === t ? "1px solid #f0f0f0" : "1px solid transparent", cursor: "pointer", marginBottom: -1, fontFamily: "'DM Mono', monospace" }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Preview Tab */}
              {tab === "preview" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" }}>
                  {activeSizes.map((size) => {
                    const sw = computedStrokes[size];
                    const svg = rewriteSvg(rawSvg, sw, size);
                    const isOverridden = manualOverrides[size] !== undefined;
                    const isRef = size === refSize;
                    return (
                      <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ position: "relative" }}>
                          <SvgBox svgString={svg} size={size} />
                          {isRef && <div style={{ position: "absolute", top: -4, right: -4, width: 8, height: 8, borderRadius: "50%", background: "#f0f0f0", border: "2px solid #0a0a0a" }} />}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                          <span style={{ color: isRef ? "#f0f0f0" : "#4a4a4a" }}>{size}px</span>
                          <span style={{ color: "#222" }}>·</span>
                          <span style={{ color: isOverridden ? "#e07070" : "#c9a55a" }}>{sw}</span>
                        </div>
                        <div style={{ display: "flex", gap: 3 }}>
                          <button onClick={() => copySvg(size)} style={tinyBtn(copied === size)}>{copied === size ? "✓" : "Copy"}</button>
                          <button onClick={() => exportSvg(size)} style={tinyBtn(false)}>.svg</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Compare Tab */}
              {tab === "compare" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#3a3a3a", marginBottom: 10, padding: "3px 8px", background: "#131313", borderRadius: 4, display: "inline-block" }}>
                      Naive · uniform stroke: {baseStroke}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
                      {activeSizes.map((size) => (
                        <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <SvgBox svgString={rewriteSvg(rawSvg, baseStroke, size)} size={size} />
                          <span style={{ fontSize: 9, color: "#3a3a3a" }}>{size}px · sw:{baseStroke}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#c9a55a", marginBottom: 10, padding: "3px 8px", background: "#16140e", borderRadius: 4, display: "inline-block" }}>
                      Compensated · {SCALE_MODES[scaleMode].label} ({intensity})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
                      {activeSizes.map((size) => {
                        const sw = computedStrokes[size];
                        const isOverridden = manualOverrides[size] !== undefined;
                        return (
                          <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <SvgBox svgString={rewriteSvg(rawSvg, sw, size)} size={size} />
                            <span style={{ fontSize: 9, color: isOverridden ? "#e07070" : "#c9a55a" }}>{size}px · sw:{sw}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Code Tab */}
              {tab === "code" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Token map */}
                  <div style={{ background: "#111", borderRadius: 6, padding: 12, border: "1px solid #1a1a1a", marginBottom: 4 }}>
                    <div style={{ fontSize: 10, color: "#4a4a4a", marginBottom: 6 }}>Design token map</div>
                    <pre style={{ margin: 0, fontSize: 10, color: "#888", whiteSpace: "pre-wrap" }}>
{`{
${activeSizes.map((s) => `  "icon-${s}": { size: ${s}, strokeWidth: ${computedStrokes[s]} }`).join(",\n")}
}`}
                    </pre>
                  </div>
                  {activeSizes.map((size) => {
                    const sw = computedStrokes[size];
                    const svg = rewriteSvg(rawSvg, sw, size);
                    return (
                      <div key={size}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: "#555" }}>{size}px</span>
                          <span style={{ fontSize: 10, color: "#333" }}>stroke-width: {sw}</span>
                          <button onClick={() => copySvg(size)} style={{ ...tinyBtn(copied === size), marginLeft: "auto" }}>{copied === size ? "Copied!" : "Copy"}</button>
                        </div>
                        <pre style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 6, padding: 10, fontSize: 10, color: "#4a4a4a", overflow: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{svg}</pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const secLabel = { fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 };

function pagBtn(d) {
  return { padding: "2px 8px", fontSize: 10, background: "transparent", color: d ? "#2a2a2a" : "#666", border: "1px solid #1e1e1e", borderRadius: 4, cursor: d ? "default" : "pointer", fontFamily: "'DM Mono', monospace" };
}
function tinyBtn(a) {
  return { padding: "3px 8px", fontSize: 9, background: a ? "#152015" : "#131313", color: a ? "#6fcf6f" : "#4a4a4a", border: "1px solid #1e1e1e", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Mono', monospace" };
}
