// Colour area-ratio suggestion module (port of the reference Python spec).
// Pure functions, no DOM. Works in the browser and in Node for tests.

const lin = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export function oklab(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklch(hex) {
  const [L, A, B] = oklab(hex);
  return [L, Math.hypot(A, B)];
}

// Visual weight: bright + saturated = heavy (should get less area).
export function weight(hex) {
  const [L, C] = oklch(hex);
  return Math.max(L * (0.15 + 0.85 * Math.min(C / 0.15, 1)), 0.05);
}

export function deltaE(h1, h2) {
  const a = oklab(h1), b = oklab(h2);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function mergeSimilar(hexes, thr = 0.04) {
  const out = [];
  for (const hx of hexes) if (!out.some((o) => deltaE(o, hx) < thr)) out.push(hx);
  return out;
}

export const ROLE_RATIOS = {
  ui:           { 2: [70, 30], 3: [60, 30, 10], 4: [55, 25, 15, 5] },
  fashion_6030: { 2: [70, 30], 3: [60, 30, 10], 4: [50, 30, 15, 5] },
  fashion_7025: { 2: [75, 25], 3: [70, 25, 5],  4: [60, 25, 10, 5] },
};
export const ROLE_NAMES = ['지배', '보조', '강조', '추가'];

function checkCount(n) {
  if (n < 2 || n > 4) throw new RangeError('2-4 colors only');
}

// Lightest visual weight -> dominant role. Returns % per input colour + role index.
export function suggestRoleRatios(hexes, profile = 'ui') {
  checkCount(hexes.length);
  const order = hexes.map((_, i) => i).sort((a, b) => weight(hexes[a]) - weight(hexes[b]) || a - b);
  const base = ROLE_RATIOS[profile][hexes.length];
  const ratios = new Array(hexes.length), roles = new Array(hexes.length);
  order.forEach((idx, rank) => { ratios[idx] = base[rank]; roles[idx] = rank; });
  return { ratios, roles };
}

// Itten / Goethe: area inversely proportional to weight^gamma, clamped to [lo, hi].
export function suggestIttenRatios(hexes, gamma = 2.0, lo = 0.05, hi = 0.70) {
  checkCount(hexes.length);
  let r = hexes.map((h) => 1 / weight(h) ** gamma);
  const norm = () => { const s = r.reduce((a, b) => a + b, 0); r = r.map((x) => x / s); };
  norm();
  for (let i = 0; i < 30; i++) { r = r.map((x) => Math.min(hi, Math.max(lo, x))); norm(); }
  return r.map((x) => Math.round(x * 1000) / 10);
}

export function suggest(hexes, profile = 'ui') {
  const colors = mergeSimilar(hexes.map((h) => h.toUpperCase()));
  const { ratios, roles } = suggestRoleRatios(colors, profile);
  return {
    colors,
    role_ratios: ratios,
    roles,
    itten_ratios: suggestIttenRatios(colors),
    weights: colors.map((h) => Math.round(weight(h) * 1000) / 1000),
  };
}

// Largest per-colour gap (in %p) between two ratio arrays.
export const maxGap = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
export const WARN_GAP = 15;

// WCAG relative luminance contrast.
export function contrast(h1, h2) {
  const Y = (h) => { const x = h.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(x.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const a = Y(h1), b = Y(h2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
