import { ICON_LIBRARIES } from "../constants.js";
import { rewriteSvg } from "../svg.js";
import SvgBox from "./SvgBox.jsx";

export default function WorkspaceRow({ item, activeSizes, getStrokeForSize, onRemove }) {
  const { name, lib, svgText, detectedStroke } = item;
  return (
    <div className="workspace-row">
      <div className="workspace-row-info">
        <div className="workspace-row-name">{name}</div>
        <div className="workspace-row-meta">
          {ICON_LIBRARIES[lib]?.name ?? lib} · detected:{detectedStroke}
        </div>
      </div>
      <div className="workspace-row-previews">
        {activeSizes.map((size) => {
          const sw = getStrokeForSize(size);
          const svg = rewriteSvg(svgText, sw, size);
          return (
            <div key={size} className="workspace-row-preview">
              <SvgBox svgString={svg} size={size} />
              <span className="workspace-row-stroke">{sw}</span>
            </div>
          );
        })}
      </div>
      <button onClick={onRemove} className="btn-remove">×</button>
    </div>
  );
}
