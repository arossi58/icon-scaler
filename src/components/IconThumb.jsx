import { useState, useRef, useEffect } from "react";
import { ICON_LIBRARIES } from "../constants.js";
import { parseSvg } from "../svg.js";

export default function IconThumb({ lib, name }) {
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
            el.setAttribute("width", "22");
            el.setAttribute("height", "22");
            el.setAttribute("viewBox", viewBox.join(" "));
            if (!el.getAttribute("stroke")) el.setAttribute("stroke", "currentColor");
            setSvg(new XMLSerializer().serializeToString(el));
          } else {
            setSvg(text);
          }
        }).catch(() => {});
      }
    }, { rootMargin: "120px" });
    if (ref.current) obs.observe(ref.current);
    return () => { cancelled = true; obs.disconnect(); };
  }, [lib, name]);

  return (
    <div ref={ref} className="icon-thumb">
      {svg
        ? <span dangerouslySetInnerHTML={{ __html: svg }} />
        : <span className="icon-thumb-placeholder">·</span>}
    </div>
  );
}
