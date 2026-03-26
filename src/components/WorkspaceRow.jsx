import { ICON_LIBRARIES } from "../constants.js";
import { rewriteSvg } from "../svg.js";
import SvgBox from "./SvgBox.jsx";

export default function WorkspaceRow({ item, activeSizes, getStrokeForSize, onRemove }) {
  const { name, lib, svgText, detectedStroke } = item;
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #161616" }}>
      <div style={{ width: 156, flexShrink: 0, paddingRight: 16 }}>
        <div style={{ fontSize: 11, color: "#d0d0d0", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 9, color: "#888", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
          {ICON_LIBRARIES[lib]?.name ?? lib} · detected:{detectedStroke}
        </div>
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
      <button
        onClick={onRemove}
        style={{ marginLeft: 14, padding: "4px 8px", fontSize: 12, lineHeight: 1, background: "transparent", color: "#888", border: "1px solid #1a1a1a", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Mono', monospace", flexShrink: 0, transition: "color 0.1s, border-color 0.1s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#bbb"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderColor = "#1a1a1a"; }}
      >
        ×
      </button>
    </div>
  );
}
