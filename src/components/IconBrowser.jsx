import { useState, useRef, useCallback, useEffect } from "react";
import { ICON_LIBRARIES } from "../constants.js";
import IconGridItem from "./IconGridItem.jsx";

export default function IconBrowser({ onAddToWorkspace, onClose, existingIds }) {
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
      cache.current[key] = list;
      setIcons(list);
    } catch {
      setError("Failed to load icons.");
      setIcons([]);
    }
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

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f0f0", fontFamily: "'DM Mono', monospace" }}>Icon Library</span>
          <div style={{ flex: 1 }} />
          {selected.size > 0 && (
            <span style={{ fontSize: 10, color: "#999", fontFamily: "'DM Mono', monospace" }}>{selected.size} selected</span>
          )}
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#999", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Library tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", padding: "0 18px" }}>
          {Object.entries(ICON_LIBRARIES).map(([key, val]) => (
            <button key={key} onClick={() => { setLib(key); setSearch(""); }}
              style={{ padding: "10px 16px", fontSize: 11, fontFamily: "'DM Mono', monospace", background: "transparent", color: lib === key ? "#f0f0f0" : "#999", border: "none", borderBottom: lib === key ? "2px solid #f0f0f0" : "2px solid transparent", cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "baseline", gap: 6 }}>
              {val.name}<span style={{ fontSize: 9, color: "#888" }}>{val.desc}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "12px 18px 8px" }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search icons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 12, fontFamily: "'DM Mono', monospace", background: "#141414", color: "#ccc", border: "1px solid #252525", borderRadius: 7, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#888" }}>
              {loading ? "Loading…" : `${filtered.length} icons`}{search && !loading ? ` matching "${search}"` : ""}
            </span>
          </div>
        </div>

        {error && <div style={{ padding: "6px 18px", fontSize: 11, color: "#e07070" }}>{error}</div>}

        {/* Icon grid */}
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
                  <IconGridItem
                    key={name}
                    name={name}
                    lib={lib}
                    onClick={() => !inWorkspace && toggleSelect(name)}
                    isSelected={selected.has(key)}
                    isInWorkspace={inWorkspace}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #1e1e1e", background: "#0a0a0a" }}>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 18px 8px", borderBottom: "1px solid #161616" }}>
              <button onClick={() => setPage(0)} disabled={page === 0}
                style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: page === 0 ? "#333" : "#999", border: "1px solid #1e1e1e", borderRadius: 5, cursor: page === 0 ? "default" : "pointer", fontFamily: "'DM Mono', monospace" }}>«</button>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: "6px 12px", fontSize: 14, background: "transparent", color: page === 0 ? "#333" : "#999", border: "1px solid #1e1e1e", borderRadius: 5, cursor: page === 0 ? "default" : "pointer", fontFamily: "'DM Mono', monospace" }}>‹</button>
              <span style={{ fontSize: 11, color: "#ccc", fontVariantNumeric: "tabular-nums", minWidth: 72, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding: "6px 12px", fontSize: 14, background: "transparent", color: page >= totalPages - 1 ? "#333" : "#999", border: "1px solid #1e1e1e", borderRadius: 5, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "'DM Mono', monospace" }}>›</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: page >= totalPages - 1 ? "#333" : "#999", border: "1px solid #1e1e1e", borderRadius: 5, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "'DM Mono', monospace" }}>»</button>
            </div>
          )}
          <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 8 }}>
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
    </div>
  );
}
