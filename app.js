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

async function loadImage(src) {
  img = src;
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  marker = null; draw();
  $('stage').hidden = false;
  showDominant();
}
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = '';
  await loadImage(await createImageBitmap(f));
});
function draw() {
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (marker) {
    const r = marker.r || 14;
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, r, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, r + 2, 0, 7); ctx.stroke();
  }
}
// Average colour inside a circle, done in linear light; drops the darkest and
// brightest 10% (shadows, glare) before averaging.
function circleAverage(c2d, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
  const w = Math.max(1, Math.ceil(r * 2)), h = w;
  const d = c2d.getImageData(x0, y0, w, h).data, px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x0 + x - cx) ** 2 + (y0 + y - cy) ** 2 > r * r) continue;
    const i = (y * w + x) * 4;
    const l = [lin(d[i]), lin(d[i + 1]), lin(d[i + 2])];
    px.push({ l, y: l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722 });
  }
  if (!px.length) return [0, 0, 0];
  px.sort((a, b) => a.y - b.y);
  const cut = Math.floor(px.length * 0.1), keep = px.slice(cut, px.length - cut || undefined);
  const s = [0, 0, 0];
  keep.forEach((p) => { s[0] += p.l[0]; s[1] += p.l[1]; s[2] += p.l[2]; });
  const enc = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return s.map((v) => Math.min(255, Math.max(0, enc(v / keep.length))));
}
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * canvas.width / r.width;
  const y = (e.clientY - r.top) * canvas.height / r.height;
  const rad = Math.max(6, Math.round(Math.min(canvas.width, canvas.height) * 0.04));
  draw(); // sample from clean image
  const rgb = circleAverage(ctx, x, y, rad);
  marker = { x, y, r: rad }; draw();
  pick(rgb);
});

// --- live camera ---
let stream = null, ringFrac = 0.12, liveTimer = null;
const video = $('video');
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
// Map the on-screen ring (video is object-fit: cover) to video pixel space.
function ringInVideo() {
  const vw = video.videoWidth, vh = video.videoHeight, sw = video.clientWidth, sh = video.clientHeight;
  const s = Math.max(sw / vw, sh / vh);
  return { cx: vw / 2, cy: vh / 2, r: (Math.min(sw, sh) * ringFrac) / s };
}
function layoutRing() {
  const d = Math.min(video.clientWidth, video.clientHeight) * ringFrac * 2;
  Object.assign($('ring').style, { width: d + 'px', height: d + 'px' });
}
function sampleLive() {
  if (!video.videoWidth) return null;
  const { cx, cy, r } = ringInVideo();
  const k = Math.min(1, 60 / r); // downsample for speed
  const size = Math.ceil(r * 2 * k);
  probe.canvas.width = probe.canvas.height = size;
  probe.drawImage(video, cx - r, cy - r, r * 2, r * 2, 0, 0, size, size);
  return circleAverage(probe, size / 2, size / 2, size / 2);
}
async function openCam() {
  $('cam').hidden = false; $('camErr').hidden = true;
  document.body.style.overflow = 'hidden';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = stream; await video.play();
    layoutRing();
    liveTimer = setInterval(() => {
      const rgb = sampleLive(); if (!rgb) return;
      const hx = hex(rgb).toUpperCase();
      const near = COLORS.reduce((b, c) => { const d = deltaE2000(rgbToLab(rgb), c._lab); return d < b.d ? { c, d } : b; }, { d: Infinity });
      $('liveDot').style.background = hx;
      $('liveTxt').textContent = `${hx} · ${near.c.name}`;
    }, 250);
  } catch (err) {
    $('camErr').hidden = false;
    $('camErr').textContent = location.protocol !== 'https:' && location.hostname !== 'localhost'
      ? '카메라는 https 주소에서만 쓸 수 있어요.'
      : '카메라를 열 수 없어요. 브라우저 설정에서 카메라 권한을 허용해 주세요.';
  }
}
function closeCam() {
  clearInterval(liveTimer); liveTimer = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  video.srcObject = null; $('cam').hidden = true; document.body.style.overflow = '';
}
$('camBtn').onclick = openCam;
$('camClose').onclick = closeCam;
window.addEventListener('resize', () => { if (stream) layoutRing(); });
document.querySelectorAll('.sizes button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.sizes button').forEach((x) => x.classList.remove('on'));
  b.classList.add('on'); ringFrac = +b.dataset.r; layoutRing();
});
$('shutter').onclick = async () => {
  if (!video.videoWidth) return;
  const rgb = sampleLive();
  const { cx, cy, r } = ringInVideo();
  const snap = document.createElement('canvas');
  snap.width = video.videoWidth; snap.height = video.videoHeight;
  snap.getContext('2d').drawImage(video, 0, 0);
  closeCam();
  await loadImage(snap);
  const s = canvas.width / snap.width;
  marker = { x: cx * s, y: cy * s, r: r * s }; draw();
  pick(rgb);
};

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
  lastPick = { rgb, sanzo: ranked[0].c };
  $('addItem').hidden = true;
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

// --- wardrobe ---
let lastPick = null;
const CATS = ['상의', '하의', '겉옷', '신발', '가방', '액세서리'];
const MAIN_CATS = ['상의', '하의', '겉옷', '신발'];
const load = (k) => JSON.parse(localStorage.getItem(k) || '[]');
let items = load('sanzo-items'), outfits = load('sanzo-outfits');
const saveItems = () => localStorage.setItem('sanzo-items', JSON.stringify(items));
const saveOutfits = () => localStorage.setItem('sanzo-outfits', JSON.stringify(outfits));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sel = {}; // cat -> item id

$('itemCat').innerHTML = CATS.map((c) => `<option>${c}</option>`).join('');
$('toWard').onclick = () => { $('addItem').hidden = !$('addItem').hidden; $('itemName').focus(); };
$('saveItem').onclick = () => {
  if (!lastPick) return;
  const cat = $('itemCat').value;
  items.push({ id: Date.now(), cat, name: $('itemName').value.trim() || cat, hex: hex(lastPick.rgb) });
  saveItems(); $('itemName').value = ''; $('addItem').hidden = true;
  toast(`${cat}에 저장됨`); renderWard();
};
$('wardBtn').onclick = () => { $('ward').hidden = !$('ward').hidden; renderWard(); if (!$('ward').hidden) $('ward').scrollIntoView({ behavior: 'smooth' }); };

function itemChip(it, { onclick, active, del } = {}) {
  const el = document.createElement('div');
  el.className = 'item' + (active ? ' active' : '');
  el.innerHTML = `<span class="dot" style="background:${it.hex}"></span><span class="iname">${esc(it.name)}</span>`;
  if (onclick) el.onclick = onclick;
  if (del) {
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '×' });
    x.onclick = (e) => { e.stopPropagation(); del(); };
    el.append(x);
  }
  return el;
}

function renderWard() {
  const list = $('wardList'); list.innerHTML = '';
  if (!items.length) list.innerHTML = '<p class="hint">아직 저장한 옷이 없어요.</p>';
  const selBox = $('outfitSel'); selBox.innerHTML = '';
  CATS.forEach((cat) => {
    const its = items.filter((i) => i.cat === cat);
    if (!its.length) return;
    const row = document.createElement('div'); row.className = 'catrow';
    row.innerHTML = `<div class="cat">${cat}</div>`;
    const wrap = document.createElement('div'); wrap.className = 'items';
    its.forEach((it) => wrap.append(itemChip(it, { del: () => {
      if (!confirm(`'${it.name}' 삭제할까요?`)) return;
      items = items.filter((x) => x.id !== it.id); if (sel[cat] === it.id) delete sel[cat];
      saveItems(); renderWard();
    } })));
    row.append(wrap); list.append(row);
    const srow = document.createElement('div'); srow.className = 'catrow';
    srow.innerHTML = `<div class="cat">${cat}</div>`;
    const swrap = document.createElement('div'); swrap.className = 'items';
    its.forEach((it) => swrap.append(itemChip(it, { active: sel[cat] === it.id, onclick: () => {
      if (sel[cat] === it.id) delete sel[cat]; else sel[cat] = it.id;
      renderWard();
    } })));
    srow.append(swrap); selBox.append(srow);
  });
  renderOutfitResults();
  renderOutfits();
}

// Score every Sanzo combination against the chosen garments.
function matchOutfit(chosen) {
  const labs = chosen.map((it) => rgbToLab(hexToRgb(it.hex)));
  const out = [];
  for (const [k, members] of COMBOS) {
    if (members.length < chosen.length) continue;
    const pairs = [];
    labs.forEach((l, i) => members.forEach((m, j) => pairs.push({ i, j, d: deltaE2000(l, m._lab) })));
    pairs.sort((a, b) => a.d - b.d);
    const ui = new Set(), uj = new Set(), assign = {};
    let sum = 0;
    for (const p of pairs) {
      if (ui.has(p.i) || uj.has(p.j)) continue;
      ui.add(p.i); uj.add(p.j); assign[p.i] = p.j; sum += p.d;
      if (ui.size === labs.length) break;
    }
    out.push({ k, members, assign, score: sum / labs.length, free: members.filter((_, j) => !uj.has(j)) });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 8);
}

function renderOutfitResults() {
  const box = $('outfitRes'); box.innerHTML = '';
  const chosen = CATS.filter((c) => sel[c]).map((c) => items.find((i) => i.id === sel[c])).filter(Boolean);
  if (!chosen.length) { box.innerHTML = '<p class="hint">위에서 입을 옷을 하나 이상 고르세요.</p>'; return; }
  const empty = MAIN_CATS.filter((c) => !sel[c]);
  matchOutfit(chosen).forEach((r) => {
    const el = document.createElement('div'); el.className = 'ores';
    const bars = r.members.map((m) => `<div class="obar" style="background:${m.hex};color:${textOn(m.rgb)}">${m.name}</div>`).join('');
    const mine = chosen.map((it, i) => `<span class="mini"><span class="dot" style="background:${it.hex}"></span>${esc(it.name)} → <span class="dot" style="background:${r.members[r.assign[i]].hex}"></span></span>`).join('');
    let sugg = '';
    if (r.free.length && empty.length) {
      const tips = [];
      empty.forEach((cat) => {
        let best = null;
        items.filter((i) => i.cat === cat).forEach((it) => r.free.forEach((m) => {
          const d = deltaE2000(rgbToLab(hexToRgb(it.hex)), m._lab);
          if (d < 15 && (!best || d < best.d)) best = { it, d };
        }));
        if (best) tips.push(`${cat}: ${esc(best.it.name)}`);
      });
      sugg = `<div class="hint">남은 색: ${r.free.map((m) => `<span class="dot" style="background:${m.hex}"></span>`).join('')}${tips.length ? ' · 옷장에서 추천 → ' + tips.join(', ') : ''}</div>`;
    }
    el.innerHTML = `<div class="obars">${bars}</div><div class="ometa">${mine}<span class="de">ΔE ${r.score.toFixed(1)} · #${r.k}</span></div>${sugg}`;
    const save = Object.assign(document.createElement('button'), { className: 'btn small', textContent: '이 코디 저장' });
    save.onclick = () => {
      const name = prompt('코디 이름', `코디 ${outfits.length + 1}`); if (name === null) return;
      outfits.push({ id: Date.now(), name: name || `코디 ${outfits.length + 1}`, items: chosen.map((i) => i.id), k: r.k });
      saveOutfits(); renderOutfits(); toast('코디 저장됨');
    };
    el.append(save); box.append(el);
  });
}

function renderOutfits() {
  const box = $('outfitList'); box.innerHTML = '';
  if (!outfits.length) { box.innerHTML = '<p class="hint">저장한 코디가 없어요.</p>'; return; }
  outfits.forEach((o) => {
    const its = o.items.map((id) => items.find((i) => i.id === id)).filter(Boolean);
    const el = document.createElement('div'); el.className = 'ores';
    el.innerHTML = `<div class="oname">${esc(o.name)} <span class="de">#${o.k}</span></div>
      <div class="obars">${COMBOS.get(o.k).map((m) => `<div class="obar" style="background:${m.hex};color:${textOn(m.rgb)}">${m.name}</div>`).join('')}</div>
      <div class="ometa">${its.map((it) => `<span class="mini"><span class="dot" style="background:${it.hex}"></span>${it.cat} · ${esc(it.name)}</span>`).join('')}</div>`;
    const del = Object.assign(document.createElement('button'), { className: 'btn small', textContent: '삭제' });
    del.onclick = () => { if (!confirm('삭제할까요?')) return; outfits = outfits.filter((x) => x.id !== o.id); saveOutfits(); renderOutfits(); };
    el.append(del); box.append(el);
  });
}

// --- backup ---
$('exportBtn').onclick = () => {
  const data = { app: 'sanzo-match', v: 1, at: new Date().toISOString(), items, outfits, favs };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `sanzo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'sanzo-match') throw 0;
    const merge = (cur, inc, key) => { const ids = new Set(cur.map(key)); return [...cur, ...(inc || []).filter((x) => !ids.has(key(x)))]; };
    items = merge(items, d.items, (x) => x.id);
    outfits = merge(outfits, d.outfits, (x) => x.id);
    favs = merge(favs, d.favs, (x) => x);
    saveItems(); saveOutfits(); saveFavs(); renderWard(); renderFavs();
    toast(`불러옴: 옷 ${d.items?.length || 0}, 코디 ${d.outfits?.length || 0}`);
  } catch { toast('백업 파일이 아니에요'); }
});
navigator.storage?.persist?.();

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 1400);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
