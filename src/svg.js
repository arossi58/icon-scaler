export function calcStroke(refStroke, refSize, targetSize, intensity) {
  if (intensity === 0 || targetSize === refSize) return refStroke;
  const ratio = targetSize / refSize;
  const scaled = refStroke * Math.pow(ratio, intensity);
  return Math.round(scaled * 100) / 100;
}

export function parseSvg(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  const vb = svg.getAttribute("viewBox");
  let viewBox = null;
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4) viewBox = parts;
  }
  const w = parseFloat(svg.getAttribute("width")) || (viewBox ? viewBox[2] : 24);
  const h = parseFloat(svg.getAttribute("height")) || (viewBox ? viewBox[3] : 24);
  return { svg, width: w, height: h, viewBox: viewBox || [0, 0, w, h] };
}

// Returns true if any element in the SVG uses stroke painting.
export function hasSvgStrokes(svgEl) {
  const usesStroke = (el) => {
    const s = el.getAttribute("stroke");
    if (s && s !== "none") return true;
    if (el.getAttribute("stroke-width") !== null) return true;
    const st = el.getAttribute("style");
    if (st && /stroke\s*:\s*(?!none)/.test(st)) return true;
    return false;
  };
  if (usesStroke(svgEl)) return true;
  for (const el of svgEl.querySelectorAll("*")) {
    if (usesStroke(el)) return true;
  }
  return false;
}

export function rewriteSvg(raw, strokeWidth, size) {
  const parsed = parseSvg(raw);
  if (!parsed) return raw;
  const { svg, viewBox } = parsed;
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", size);
  clone.setAttribute("height", size);
  clone.setAttribute("viewBox", viewBox.join(" "));
  // Convert strokeWidth (in screen-pixel terms) to the icon's native coordinate space.
  const nativeSw = Math.round((strokeWidth * (viewBox[2] / size)) * 1000) / 1000;
  // For fill-based icons, inject stroke so the weight slider works.
  if (!hasSvgStrokes(clone)) {
    clone.setAttribute("stroke", "currentColor");
    clone.setAttribute("stroke-linejoin", "round");
    clone.setAttribute("stroke-linecap", "round");
    // Suppress stroke on fill="none" elements to avoid unwanted box outlines.
    clone.querySelectorAll("[fill='none']").forEach((el) => el.setAttribute("stroke", "none"));
  }
  clone.setAttribute("stroke-width", nativeSw);
  clone.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute("stroke-width") !== null) el.setAttribute("stroke-width", nativeSw);
    const st = el.getAttribute("style");
    if (st && st.includes("stroke-width"))
      el.setAttribute("style", st.replace(/stroke-width:\s*[^;]+/g, `stroke-width: ${nativeSw}`));
  });
  return new XMLSerializer().serializeToString(clone);
}

export function detectBaseStroke(raw) {
  const parsed = parseSvg(raw);
  if (!parsed) return 2;
  const { svg, viewBox } = parsed;
  // Normalize to screen-pixel terms at 24px reference size.
  const normalize = (sw) => Math.round(sw * (24 / viewBox[2]) * 100) / 100;
  const rootSw = svg.getAttribute("stroke-width");
  if (rootSw) return normalize(parseFloat(rootSw));
  const first = svg.querySelector("[stroke-width]");
  if (first) return normalize(parseFloat(first.getAttribute("stroke-width")));
  return 2;
}
