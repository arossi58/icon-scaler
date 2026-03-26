import { useState } from "react";
import IconThumb from "./IconThumb.jsx";

export default function IconGridItem({ name, lib, onClick, isSelected, isInWorkspace }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={isInWorkspace}
      title={isInWorkspace ? `${name} (in workspace)` : name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 3, padding: "10px 4px 6px",
        background: isInWorkspace ? "#111" : isSelected ? "#0f1a0f" : hovered ? "#171717" : "transparent",
        border: `1px solid ${isInWorkspace ? "#181818" : isSelected ? "#1e3a1e" : hovered ? "#2a2a2a" : "transparent"}`,
        borderRadius: 8, cursor: isInWorkspace ? "default" : "pointer", color: "#bbb",
        transition: "background 0.1s, border-color 0.1s", opacity: isInWorkspace ? 0.35 : 1,
      }}
    >
      {isSelected && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 13, height: 13, borderRadius: "50%", background: "#3a7a3a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 8, color: "#fff", lineHeight: 1 }}>✓</span>
        </div>
      )}
      <IconThumb lib={lib} name={name} />
      <span style={{ fontSize: 8, color: isSelected ? "#5a9a5a" : "#888", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>
        {name}
      </span>
    </button>
  );
}
