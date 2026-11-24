// Works out what a freehand mark is from its strokes alone (no DOM), so it can be unit-tested.
// Injected before overlay.js; also imported by the tests. Exposes globalThis.annotShapes.
(() => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const length = (s) => s.slice(1).reduce((sum, p, i) => sum + dist(s[i], p), 0);
  const bbox = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

  // Arrow ending at the last point of s; direction from the last ~30px of shaft.
  function arrow(s) {
    const tip = s.at(-1);
    let i = s.length - 1;
    while (i > 0 && dist(s[i], tip) < 30) i--;
    const d = dist(s[i], tip) || 1;
    return { shape: 'arrow', tip, dir: [(tip[0] - s[i][0]) / d, (tip[1] - s[i][1]) / d] };
  }

  // Returns { shape: 'underline' | 'circle' | 'arrow' | 'drawing', tip?, dir? }.
  function classify(strokes) {
    const [shaft, ...head] = [...strokes].sort((a, b) => length(b) - length(a));
    const shaftLen = length(shaft);
    if (!head.length) {
      const { w, h } = bbox(shaft);
      const span = Math.max(w, h);
      // Closed loops first: a loop around a wide heading is flat too, but it doubles back.
      if (span >= 16 && dist(shaft[0], shaft.at(-1)) < span * 0.35 && shaftLen > span * 2) return { shape: 'circle' };
      if (w >= 20 && h <= Math.max(14, w * 0.2) && shaftLen < w * 1.6) return { shape: 'underline' };
      // One-stroke arrow: the tip is the point farthest from where drawing started.
      const far = shaft.reduce((best, p, i) => (dist(p, shaft[0]) > dist(shaft[best], shaft[0]) ? i : best), 0);
      return far > 0 ? arrow(shaft.slice(0, far + 1)) : { shape: 'drawing' };
    }
    // The longest stroke is the shaft and the shorter ones form the head, so the tip is
    // the shaft end nearest the head, whichever order or direction they were drawn in.
    if (head.every((s) => length(s) < shaftLen * 0.6)) {
      const c = centroid(head.flat());
      return arrow(dist(shaft.at(-1), c) <= dist(shaft[0], c) ? shaft : [...shaft].reverse());
    }
    return { shape: 'drawing' };
  }

  globalThis.annotShapes = { classify };
})();
