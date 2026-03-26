export default function SvgBox({ svgString, size }) {
  const dim = Math.max(size + 16, 40);
  return (
    <div
      className="svg-box"
      style={{ width: dim, height: dim }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}
