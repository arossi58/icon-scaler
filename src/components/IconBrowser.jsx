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
      className="browser-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="browser-modal">

        {/* Header */}
        <div className="browser-header">
          <span className="browser-header-title">Icon Library</span>
          <div className="browser-header-spacer" />
          {selected.size > 0 && (
            <span className="browser-selected-count">{selected.size} selected</span>
          )}
          <button onClick={onClose} className="browser-close-btn">×</button>
        </div>

        {/* Library tabs */}
        <div className="browser-tabs">
          {Object.entries(ICON_LIBRARIES).map(([key, val]) => (
            <button key={key} onClick={() => { setLib(key); setSearch(""); }}
              className={`browser-tab${lib === key ? " browser-tab--active" : ""}`}>
              {val.name}<span className="browser-tab-desc">{val.desc}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="browser-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search icons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="browser-search-input"
          />
          <div className="browser-search-info">
            {loading ? "Loading…" : `${filtered.length} icons`}{search && !loading ? ` matching "${search}"` : ""}
          </div>
        </div>

        {error && <div className="browser-error">{error}</div>}

        {/* Icon grid */}
        <div className="browser-grid-wrap">
          {loading ? (
            <div className="browser-loading">Fetching icon list…</div>
          ) : filtered.length === 0 ? (
            <div className="browser-empty">No icons match "{search}"</div>
          ) : (
            <div className="browser-grid">
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
        <div className="browser-footer">
          {totalPages > 1 && (
            <div className="browser-pagination">
              <button onClick={() => setPage(0)} disabled={page === 0} className="pag-btn">«</button>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="pag-btn-wide">‹</button>
              <span className="pag-page">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="pag-btn-wide">›</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="pag-btn">»</button>
            </div>
          )}
          <div className="browser-footer-bar">
            <span className={`browser-sel-label${selected.size > 0 ? " browser-sel-label--active" : ""}`}>
              {selected.size > 0 ? `${selected.size} icon${selected.size !== 1 ? "s" : ""} selected` : "Click icons to select"}
            </span>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="btn-clear-sel">Clear</button>
            )}
            <div className="browser-header-spacer" />
            <button onClick={handleAdd} disabled={selected.size === 0} className="btn-add">
              {selected.size > 0 ? `Add ${selected.size} to workspace →` : "Add to workspace"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
