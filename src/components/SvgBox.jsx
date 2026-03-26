export default function SvgBox({ svgString, size }) {
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
