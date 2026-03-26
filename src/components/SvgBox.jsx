export default function SvgBox({ svgString, size, color }) {
  const dim = Math.max(size + 16, 40);
  return (
    <div
      className="svg-box"
      style={{ width: dim, height: dim, ...(color ? { color } : {}) }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}
