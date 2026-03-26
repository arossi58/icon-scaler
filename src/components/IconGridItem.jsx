import IconThumb from "./IconThumb.jsx";

export default function IconGridItem({ name, lib, onClick, isSelected, isInWorkspace }) {
  return (
    <button
      onClick={onClick}
      disabled={isInWorkspace}
      title={isInWorkspace ? `${name} (in workspace)` : name}
      className={`icon-grid-item${isSelected ? " icon-grid-item--selected" : ""}`}
    >
      {isSelected && (
        <div className="icon-grid-item-check">
          <span className="icon-grid-item-check-mark">✓</span>
        </div>
      )}
      <IconThumb lib={lib} name={name} />
      <span className={`icon-grid-item-name${isSelected ? " icon-grid-item-name--selected" : ""}`}>
        {name}
      </span>
    </button>
  );
}
