// Sanzo Match: photo -> nearest Sanzo Wada colour (CIEDE2000) -> combinations
const $ = (id) => document.getElementById(id);
const COLORS = await (await fetch('colors.json')).json();

// --- colour math ---
const lin = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function rgbToLab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { const v = Math.atan2(b, a) * deg; return v < 0 ? v + 360 : v; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p) { hb = Math.abs(h1p - h2p) > 180 ? (hb < 360 ? hb + 360 : hb - 360) / 2 : hb / 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad)
    + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const textOn = ([r, g, b]) => (r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#222' : '#fff');

COLORS.forEach((c, i) => { c.id = i; c._lab = rgbToLab(c.rgb); });
// combination id -> member colours
const COMBOS = new Map();
COLORS.forEach((c) => c.combinations.forEach((k) => {
  if (!COMBOS.has(k)) COMBOS.set(k, []);
  COMBOS.get(k).push(c);
}));

// --- state ---
let favs = JSON.parse(localStorage.getItem('sanzo-favs') || '[]');
const saveFavs = () => localStorage.setItem('sanzo-favs', JSON.stringify(favs));

// --- image handling ---
const canvas = $('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
let marker = null, img = null;

$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  img = await createImageBitmap(f);
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  canvas.width = img.width * scale; canvas.height = img.height * scale;
  marker = null; draw();
  $('stage').hidden = false;
  showDominant();
});
function draw() {
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (marker) {
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, 14, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, 16, 0, 7); ctx.stroke();
  }
}
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * canvas.width / r.width;
  const y = (e.clientY - r.top) * canvas.height / r.height;
  const rad = Math.max(3, Math.round(canvas.width / 150));
  draw(); // sample from clean image
  const d = ctx.getImageData(Math.max(0, x - rad), Math.max(0, y - rad), rad * 2, rad * 2).data;
  // median per channel resists highlights / specks
  const ch = [[], [], []];
  for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
  const rgb = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  marker = { x, y }; draw();
  pick(rgb);
});

function showDominant() {
  // k-means (k=6) on downsampled pixels in Lab
  const w = 80, h = Math.round(80 * canvas.height / canvas.width);
  const t = new OffscreenCanvas(w, h).getContext('2d');
  t.drawImage(img, 0, 0, w, h);
  const d = t.getImageData(0, 0, w, h).data, pts = [];
  for (let i = 0; i < d.length; i += 4) pts.push([d[i], d[i + 1], d[i + 2]]);
  const labs = pts.map(rgbToLab), k = 6;
  let cents = Array.from({ length: k }, (_, i) => labs[Math.floor((i + 0.5) * labs.length / k)]);
  let assign = new Array(labs.length).fill(0);
  for (let it = 0; it < 12; it++) {
    labs.forEach((p, i) => {
      let best = 0, bd = Infinity;
      cents.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } });
      assign[i] = best;
    });
    cents = cents.map((c, j) => {
      const m = pts.filter((_, i) => assign[i] === j);
      if (!m.length) return c;
      return rgbToLab([0, 1, 2].map((ci) => m.reduce((s, p) => s + p[ci], 0) / m.length));
    });
  }
  const counts = cents.map((_, j) => assign.filter((a) => a === j).length);
  const out = cents.map((_, j) => {
    const m = pts.filter((_, i) => assign[i] === j);
    return m.length ? [0, 1, 2].map((ci) => m.reduce((s, p) => s + p[ci], 0) / m.length) : null;
  }).map((rgb, j) => ({ rgb, n: counts[j] })).filter((o) => o.rgb).sort((a, b) => b.n - a.n);
  $('dominant').innerHTML = '<span class="hint" style="width:100%">대표 색</span>';
  out.forEach(({ rgb }) => {
    const el = document.createElement('div');
    el.className = 'chip'; el.style.background = hex(rgb); el.title = hex(rgb);
    el.onclick = () => pick(rgb.map(Math.round));
    $('dominant').append(el);
  });
}

// --- custom colour picker (HSV) ---
const P = { h: 40, s: 0.94, v: 0.72 };
function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255));
}
function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
function renderPicker(fromHex) {
  const rgb = hsvToRgb(P.h, P.s, P.v), hx = hex(rgb).toUpperCase();
  $('sv').style.setProperty('--h', P.h);
  $('svKnob').style.left = P.s * 100 + '%';
  $('svKnob').style.top = (1 - P.v) * 100 + '%';
  $('svKnob').style.background = hx;
  $('hue').value = P.h;
  $('preview').style.background = hx;
  $('pickDot').style.background = hx;
  if (!fromHex) $('hexIn').value = hx;
}
const svDrag = (e) => {
  const r = $('sv').getBoundingClientRect();
  P.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  P.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  renderPicker();
};
$('sv').addEventListener('pointerdown', (e) => { $('sv').setPointerCapture(e.pointerId); svDrag(e); });
$('sv').addEventListener('pointermove', (e) => { if (e.buttons) svDrag(e); });
$('hue').addEventListener('input', (e) => { P.h = +e.target.value; renderPicker(); });
$('hexIn').addEventListener('input', (e) => {
  let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-f]{6}$/i.test(v)) { Object.assign(P, rgbToHsv(hexToRgb(v))); renderPicker(true); }
});
$('hexIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('applyPick').click(); });
$('pickBtn').onclick = () => { $('pickerPanel').hidden = !$('pickerPanel').hidden; renderPicker(); };
$('applyPick').onclick = () => pick(hsvToRgb(P.h, P.s, P.v));
renderPicker();

// --- matching & rendering ---
function pick(rgb) {
  const lab = rgbToLab(rgb);
  const ranked = COLORS.map((c) => ({ c, de: deltaE2000(lab, c._lab) })).sort((a, b) => a.de - b.de).slice(0, 5);
  $('result').hidden = false;
  $('pickedSwatch').style.background = hex(rgb);
  $('pickedHex').textContent = hex(rgb).toUpperCase();
  const box = $('matches'); box.innerHTML = '';
  ranked.forEach(({ c, de }, i) => {
    const el = document.createElement('div');
    el.className = 'match' + (i === 0 ? ' active' : '');
    el.innerHTML = `<div class="swatch" style="background:${c.hex}"></div>
      <div class="name">${c.name}</div><div class="de">ΔE ${de.toFixed(1)} · ${c.hex}</div>`;
    el.onclick = () => { box.querySelectorAll('.match').forEach((m) => m.classList.remove('active')); el.classList.add('active'); showCombos(c); };
    box.append(el);
  });
  showCombos(ranked[0].c);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function comboEl(k, highlight) {
  const members = COMBOS.get(k);
  const el = document.createElement('div'); el.className = 'combo';
  const bars = document.createElement('div'); bars.className = 'bars';
  members.forEach((m) => {
    const b = document.createElement('div'); b.className = 'bar';
    b.style.background = m.hex; b.style.color = textOn(m.rgb);
    if (highlight && m.id === highlight.id) b.classList.add('hl');
    b.innerHTML = `${m.name}<br>${m.hex}`;
    b.title = '탭하여 HEX 복사';
    b.onclick = () => { navigator.clipboard?.writeText(m.hex); toast(`${m.hex} 복사됨`); };
    bars.append(b);
  });
  const meta = document.createElement('div'); meta.className = 'meta';
  const star = document.createElement('button'); star.className = 'star';
  const sync = () => (star.textContent = favs.includes(k) ? '★' : '☆');
  sync();
  star.onclick = () => { favs = favs.includes(k) ? favs.filter((f) => f !== k) : [...favs, k]; saveFavs(); sync(); renderFavs(); };
  meta.append(star, Object.assign(document.createElement('span'), { textContent: `#${k}` }));
  el.append(bars, meta);
  return el;
}

function showCombos(c) {
  const ks = [...c.combinations].sort((a, b) => COMBOS.get(a).length - COMBOS.get(b).length || a - b);
  $('comboTitle').textContent = `${c.name} 조합 (${ks.length})`;
  const box = $('combos'); box.innerHTML = '';
  ks.forEach((k) => box.append(comboEl(k, c)));
}

function renderFavs() {
  const box = $('favList'); box.innerHTML = '';
  if (!favs.length) box.innerHTML = '<p class="hint">조합 옆의 ☆를 눌러 저장하세요.</p>';
  favs.forEach((k) => box.append(comboEl(k)));
}
$('favBtn').onclick = () => { $('favs').hidden = !$('favs').hidden; renderFavs(); if (!$('favs').hidden) $('favs').scrollIntoView({ behavior: 'smooth' }); };

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 1400);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
