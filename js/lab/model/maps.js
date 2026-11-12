// 地図のモデル：等値線（マーチングスクエア）、日本付近の地図、天気図、地形図（等高線）
// 画面に依存しない（ブラウザでも Node でも動く）。地図は学習用の模式図（海岸線は単純化してある）。
export const FILE_VERSION = '0.1.1';

// ---------------------------------------------------------------- 等値線
// f(i, j) の格子（nx × ny）で level の等値線を線分の列にして返す（格子座標）
export function contour(vals, nx, ny, level) {
  const segs = [];
  const v = (i, j) => vals[j * nx + i];
  const lerp = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    const k = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const T = [i + lerp(a, b), j], R = [i + 1, j + lerp(b, c)], B = [i + lerp(d, c), j + 1], L = [i, j + lerp(a, d)];
    const add = (p, q) => { if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-9) segs.push([p, q]); };
    switch (k) {
      case 1: case 14: add(L, T); break;
      case 2: case 13: add(T, R); break;
      case 3: case 12: add(L, R); break;
      case 4: case 11: add(R, B); break;
      case 5: { const m = (a + b + c + d) / 4; if (m > level) { add(L, B); add(T, R); } else { add(L, T); add(R, B); } break; }
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(L, B); break;
      case 10: { const m = (a + b + c + d) / 4; if (m > level) { add(L, T); add(R, B); } else { add(L, B); add(T, R); } break; }
    }
  }
  return joinSegs(segs);
}
// 線分をつないで折れ線に
function joinSegs(segs) {
  const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const ends = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const nxt = (ends.get(key(tip)) || []).find(j => !used[j]);
        if (nxt === undefined) break;
        used[nxt] = 1;
        const s = segs[nxt];
        const other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(other); else line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}
// 折れ線 → なめらかな SVG パス（Catmull-Rom）
export function smoothPath(pts, tx, closed = false, dec = 1, step = 1) {
  if (pts.length < 2) return '';
  const f1 = (n) => n.toFixed(dec);
  let P = pts.map(tx);
  if (step > 1 && P.length > 8) P = P.filter((_, i) => i % step === 0 || i === P.length - 1);
  if (P.length < 3) return `M${P.map(p => p.map(f1).join(' ')).join('L')}`;
  let d = `M${f1(P[0][0])} ${f1(P[0][1])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

// ---------------------------------------------------------------- 日本付近の地図（経度・緯度、模式的）
export const COAST = {
  hokkaido: [[141.9, 45.5], [142.6, 45.0], [143.5, 44.3], [144.6, 43.95], [145.3, 44.35], [145.0, 43.6], [145.8, 43.35], [145.0, 43.1], [144.0, 42.9], [143.3, 42.2], [143.25, 41.95], [142.4, 42.3], [141.6, 42.6], [140.95, 42.35], [140.4, 42.5], [140.7, 41.8], [140.1, 41.45], [139.9, 41.9], [139.95, 42.6], [140.4, 43.3], [141.35, 43.2], [141.65, 43.9], [141.6, 44.5], [141.9, 45.5]],
  honshu: [[141.4, 41.45], [141.5, 40.6], [141.95, 40.0], [141.95, 39.3], [141.6, 38.6], [141.05, 38.3], [140.95, 37.6], [140.85, 37.0], [140.6, 36.4], [140.85, 35.75], [140.45, 35.2], [139.85, 34.9], [139.8, 35.3], [139.75, 35.6], [139.65, 35.3], [139.2, 35.25], [138.95, 34.65], [138.75, 34.65], [138.5, 35.0], [138.0, 34.65], [137.3, 34.65], [136.9, 34.75], [136.9, 34.3], [136.4, 34.1], [135.8, 33.45], [135.1, 33.9], [135.2, 34.4], [135.4, 34.7], [134.8, 34.7], [134.0, 34.55], [133.3, 34.45], [132.5, 34.3], [132.1, 33.95], [131.0, 33.95], [130.9, 34.3], [131.4, 34.5], [132.0, 34.95], [132.6, 35.45], [133.3, 35.55], [134.2, 35.55], [135.2, 35.7], [135.9, 35.75], [136.05, 36.2], [136.7, 36.8], [136.8, 37.2], [137.3, 37.5], [137.05, 37.0], [137.4, 36.8], [138.25, 37.15], [138.9, 37.85], [139.45, 38.4], [139.85, 39.1], [139.75, 39.9], [140.0, 40.5], [139.9, 40.75], [140.35, 41.2], [140.7, 40.85], [141.2, 41.15], [141.4, 41.45]],
  shikoku: [[132.4, 33.5], [132.6, 32.8], [133.0, 32.75], [133.3, 33.35], [133.8, 33.5], [134.2, 33.25], [134.75, 33.85], [134.6, 34.2], [134.0, 34.35], [133.4, 34.25], [132.9, 34.05], [132.4, 33.5]],
  kyushu: [[130.9, 33.9], [131.6, 33.6], [131.85, 33.05], [131.5, 32.4], [131.4, 31.6], [131.1, 31.3], [130.7, 31.05], [130.6, 31.35], [130.2, 31.3], [130.15, 31.85], [130.55, 32.5], [130.15, 32.75], [129.75, 32.75], [129.6, 33.25], [130.0, 33.5], [130.4, 33.65], [130.9, 33.9]],
  korea: [[124.7, 40.0], [125.0, 39.4], [125.3, 38.4], [125.2, 37.7], [126.3, 37.0], [126.2, 36.1], [126.5, 35.0], [126.4, 34.4], [127.4, 34.6], [128.6, 34.9], [129.3, 35.3], [129.45, 36.0], [129.4, 36.9], [128.6, 38.1], [128.0, 38.9], [127.5, 39.7], [128.6, 40.3], [129.7, 40.9], [129.9, 41.6], [130.7, 42.3]],
  continent: [[130.7, 42.3], [131.8, 43.1], [133.0, 42.8], [135.3, 43.8], [137.5, 45.6], [138.6, 47.2], [140.4, 48.8], [140.5, 50.5], [141.4, 52.2], [141.3, 53.3], [139.8, 54.2], [137.5, 54.0], [137.0, 55.0]],
  china: [[124.7, 40.0], [123.0, 39.6], [121.6, 38.9], [121.2, 39.5], [122.2, 40.5], [121.0, 40.9], [119.5, 39.9], [118.0, 39.2], [117.7, 38.4], [118.9, 37.5], [119.8, 37.1], [120.7, 37.8], [122.5, 37.4], [120.9, 36.4], [119.4, 35.0], [120.4, 33.5], [120.9, 32.4], [121.9, 31.6], [121.9, 30.8], [121.5, 30.2], [122.1, 29.9], [121.5, 28.4], [120.2, 26.7], [119.5, 25.5], [118.5, 24.5], [117.0, 23.5], [115.5, 22.8], [114.2, 22.3], [113.5, 22.2], [112.0, 21.8], [110.5, 20.9]],
  sakhalin: [[141.6, 46.0], [142.1, 46.5], [143.4, 46.7], [142.7, 47.5], [143.1, 49.2], [144.3, 49.0], [143.2, 50.5], [143.0, 52.5], [143.2, 54.3], [142.6, 54.3], [142.3, 53.4], [141.7, 52.0], [142.0, 50.0], [142.0, 48.2], [141.9, 46.8], [141.6, 46.0]],
  taiwan: [[121.0, 25.1], [121.9, 25.0], [121.6, 23.5], [120.9, 22.0], [120.3, 22.6], [120.1, 23.6], [120.6, 24.6], [121.0, 25.1]],
};
const CLOSED = new Set(['hokkaido', 'honshu', 'shikoku', 'kyushu', 'sakhalin', 'taiwan']);

// 表示範囲と投影（正距円筒。高緯度で横を少し縮める）
export function projector(box, w, h) {
  const [lo0, lo1, la0, la1] = box;
  return ([lon, lat]) => [(lon - lo0) / (lo1 - lo0) * w, (la1 - lat) / (la1 - la0) * h];
}

export function coastSVG(P, { fill = '#e9e4d4', stroke = '#6d6a60' } = {}) {
  return Object.entries(COAST).map(([k, pts]) => {
    const d = 'M' + pts.map(p => P(p).map(n => n.toFixed(1)).join(' ')).join('L') + (CLOSED.has(k) ? 'Z' : '');
    return CLOSED.has(k) ? `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round"/>`;
  }).join('');
}
// 大陸側の陸地（大陸の海岸線より西・北を塗る）
function landMask(P) {
  const pts = [[100, 15], [110.5, 20.9], ...[...COAST.china].reverse(), ...COAST.korea, ...COAST.continent, [137.0, 60], [100, 60]];
  return `<path d="M${pts.map(p => P(p).map(n => n.toFixed(1)).join(' ')).join('L')}Z" fill="#e9e4d4" stroke="none"/>`;
}

// ---------------------------------------------------------------- 天気図
// 気圧場 = 基準 + Σ 高気圧・低気圧（ガウス型）。等圧線は 4 hPa ごと、20 hPa ごとに太線
export const WEATHER = {
  winter: {
    name: '西高東低（冬型の気圧配置）', season: '冬',
    centers: [{ k: 'H', lon: 117, lat: 45, amp: 34, s: 13, p: 1052 }, { k: 'L', lon: 152, lat: 47, amp: -30, s: 7.5, p: 968 }, { k: 'L', lon: 146, lat: 40, amp: -8, s: 4 }],
    fronts: [],
    desc: '大陸にシベリア高気圧、日本の東の海上に発達した低気圧。日本付近は等圧線が南北に混み合い、北西の季節風が強い。日本海側は雪、太平洋側は乾燥した晴れ。',
  },
  summer: {
    name: '南高北低（夏型の気圧配置）', season: '夏',
    centers: [{ k: 'H', lon: 150, lat: 31, amp: 13, s: 16, p: 1024 }, { k: 'L', lon: 116, lat: 44, amp: -10, s: 12, p: 996 }],
    fronts: [],
    desc: '太平洋高気圧が日本を覆い、大陸に低気圧。等圧線の間隔は広く、南よりの弱い風。蒸し暑い晴天が続く。',
  },
  spring: {
    name: '移動性高気圧と温帯低気圧（春・秋）', season: '春・秋',
    centers: [{ k: 'H', lon: 132, lat: 34, amp: 10, s: 5.5, p: 1022 }, { k: 'L', lon: 145, lat: 44, amp: -16, s: 5, p: 994 }, { k: 'L', lon: 116, lat: 39, amp: -8, s: 5, p: 1004 }, { k: 'H', lon: 105, lat: 47, amp: 8, s: 8 }],
    fronts: [{ type: 'cold', pts: [[145, 44], [143, 41], [140, 38.5], [137, 36.5]] }, { type: 'warm', pts: [[145, 44], [149, 42], [152, 40.5]] }],
    desc: '高気圧と低気圧が交互に西から東へ移動する。天気は数日の周期で変わる（偏西風に流される）。',
  },
  baiu: {
    name: '梅雨（停滞前線）', season: '梅雨',
    centers: [{ k: 'H', lon: 146, lat: 51, amp: 10, s: 6, p: 1020 }, { k: 'H', lon: 152, lat: 26, amp: 12, s: 12, p: 1020 }, { k: 'L', lon: 129, lat: 31.5, amp: -6, s: 3.5, p: 1002 }],
    fronts: [{ type: 'stat', pts: [[116, 29], [122, 30.5], [129, 31.5], [135, 32.5], [141, 34], [148, 35], [156, 36]] }],
    desc: 'オホーツク海高気圧と太平洋高気圧の間に、梅雨前線（停滞前線）が東西にのびる。前線の付近で雨が続く。',
  },
  typhoon: {
    name: '台風', season: '夏〜秋',
    centers: [{ k: 'T', lon: 131, lat: 28.5, amp: -66, s: 2.6, p: 950 }, { k: 'H', lon: 152, lat: 32, amp: 12, s: 13, p: 1020 }],
    fronts: [],
    desc: '熱帯低気圧が発達したもの（最大風速 17.2 m/s 以上）。等圧線はほぼ同心円で間隔が狭く、前線をともなわない。太平洋高気圧のふちに沿って北上し、偏西風に乗って北東に向きを変える。',
  },
  cyclone: {
    name: '温帯低気圧と前線', season: '春・秋',
    centers: [{ k: 'L', lon: 136, lat: 41, amp: -20, s: 5.5, p: 992 }, { k: 'H', lon: 120, lat: 36, amp: 10, s: 7, p: 1022 }, { k: 'H', lon: 155, lat: 32, amp: 8, s: 9 }],
    fronts: [{ type: 'warm', pts: [[136, 41], [139.5, 39.5], [143, 38.5]] }, { type: 'cold', pts: [[136, 41], [134, 38], [131.5, 35.5], [128.5, 33.5]] }],
    desc: '低気圧の中心から南東に温暖前線、南西に寒冷前線がのびる。寒冷前線の通過で強い雨と気温の低下、風向が南寄りから北寄りに変わる。',
  },
};

export function pressureField(W, lon, lat) {
  let p = 1012;
  for (const c of W.centers) p += c.amp * Math.exp(-((lon - c.lon) ** 2 * Math.cos(lat * Math.PI / 180) ** 2 + (lat - c.lat) ** 2) / (2 * c.s * c.s));
  return p;
}

export function weatherSVG(key, opts = {}) {
  const W = WEATHER[key];
  const box = opts.box || [112, 158, 22, 52];
  const w = opts.w || 520, h = opts.h || 420;
  const P = projector(box, w, h);
  const nx = 93, ny = 61;
  const vals = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lon = box[0] + (box[1] - box[0]) * i / (nx - 1), lat = box[3] - (box[3] - box[2]) * j / (ny - 1);
    vals[j * nx + i] = pressureField(W, lon, lat);
  }
  const tx = ([i, j]) => [i / (nx - 1) * w, j / (ny - 1) * h];
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  let iso = '';
  for (let L = Math.ceil(lo / 4) * 4; L <= hi; L += 4) {
    const bold = L % 20 === 0;
    for (const line of contour(vals, nx, ny, L)) {
      if (line.length < 4) continue;
      iso += `<path d="${smoothPath(line, tx)}" fill="none" stroke="#3b4f7a" stroke-width="${bold ? 1.7 : 0.9}"/>`;
    }
  }
  const grid = [];
  for (let lon = Math.ceil(box[0] / 10) * 10; lon <= box[1]; lon += 10) { const [x] = P([lon, 0]); grid.push(`<path d="M${x} 0V${h}" stroke="#b9c3cf" stroke-width=".5" stroke-dasharray="3 3"/><text x="${x + 2}" y="${h - 4}" font-size="10" fill="#7d8796">${lon}°E</text>`); }
  for (let lat = Math.ceil(box[2] / 10) * 10; lat <= box[3]; lat += 10) { const [, y] = P([0, lat]); grid.push(`<path d="M0 ${y}H${w}" stroke="#b9c3cf" stroke-width=".5" stroke-dasharray="3 3"/><text x="3" y="${y - 2}" font-size="10" fill="#7d8796">${lat}°N</text>`); }
  const marks = W.centers.filter(c => c.p).map(c => {
    const [x, y] = P([c.lon, c.lat]);
    const col = c.k === 'H' ? '#1f5fbf' : '#c0392b';
    const lab = c.k === 'H' ? '高' : c.k === 'T' ? '台' : '低';
    if (x < 0 || x > w || y < 0 || y > h) return '';
    return `<g font-family="sans-serif" font-weight="700"><text x="${x}" y="${y + 7}" font-size="21" text-anchor="middle" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${lab}</text><text x="${x}" y="${y + 23}" font-size="11" text-anchor="middle" fill="${col}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${c.p}</text></g>`;
  }).join('');
  const fronts = (W.fronts || []).map(f => frontSVG(f, P)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${opts.alt || '天気図'}">
<defs><clipPath id="wx-${key}"><rect width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#wx-${key})"><rect width="${w}" height="${h}" fill="#f4f8fb"/>${landMask(P)}${coastSVG(P)}${grid.join('')}${iso}${fronts}${marks}</g><rect width="${w}" height="${h}" fill="none" stroke="#6d6a60"/></svg>`;
}

// 前線の記号：寒冷（三角・青）、温暖（半円・赤）、停滞（交互）、閉塞（三角と半円が同じ側・紫）
function frontSVG(f, P) {
  const pts = f.pts.map(P);
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(L); total += L; }
  const at = (s) => {
    for (let i = 0; i < seg.length; i++) {
      if (s <= seg[i]) { const t = s / seg[i], a = pts[i], b = pts[i + 1]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / seg[i], uy: (b[1] - a[1]) / seg[i] }; }
      s -= seg[i];
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1], L = seg[seg.length - 1];
    return { x: b[0], y: b[1], ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L };
  };
  const BLUE = '#1f5fbf', RED = '#c0392b', PURP = '#7d3c98';
  const d = 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join('L');
  let out = '';
  const step = 26, sz = 8;
  let n = 0;
  for (let s = 12; s < total - 6; s += step, n++) {
    const p = at(s);
    const side = f.side || 1;
    const nx = p.uy * side, ny = -p.ux * side;     // 進む向き（線の左側）
    let kind = f.type === 'cold' ? 'tri' : f.type === 'warm' ? 'semi' : f.type === 'occl' ? (n % 2 ? 'semi' : 'tri') : (n % 2 ? 'semi' : 'tri');
    let flip = f.type === 'stat' && kind === 'semi' ? -1 : 1;
    const col = f.type === 'cold' ? BLUE : f.type === 'warm' ? RED : f.type === 'occl' ? PURP : (kind === 'tri' ? BLUE : RED);
    const ax = p.x - p.ux * sz / 2, ay = p.y - p.uy * sz / 2, bx = p.x + p.ux * sz / 2, by = p.y + p.uy * sz / 2;
    if (kind === 'tri') out += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${(p.x + nx * sz * flip).toFixed(1)} ${(p.y + ny * sz * flip).toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}Z" fill="${col}"/>`;
    else out += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}A${sz / 2} ${sz / 2} 0 0 ${flip * (side) > 0 ? 0 : 1} ${bx.toFixed(1)} ${by.toFixed(1)}Z" fill="${col}"/>`;
  }
  const col = f.type === 'cold' ? BLUE : f.type === 'warm' ? RED : f.type === 'occl' ? PURP : null;
  const line = col ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2"/>`
    : `<path d="${d}" fill="none" stroke="${BLUE}" stroke-width="2.2"/><path d="${d}" fill="none" stroke="${RED}" stroke-width="2.2" stroke-dasharray="${step / 2} ${step / 2}" stroke-dashoffset="${-12 + step / 4}"/>`;
  return line + out;
}

// ---------------------------------------------------------------- 地形図（等高線）
// 範囲 0〜1 × 0〜1（上が北）。高さは m。等高線 10 m ごと（主曲線）、50 m ごとに計曲線（太線）
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const TOPO = {
  valley: {
    name: 'V字谷', interval: 10,
    desc: '川の侵食（下刻）で深くなった谷。等高線は上流（高い方）に向かって V 字にとがる。谷の両側の斜面は急で、等高線の間隔がせまい。',
    h: (x, y) => 120 + 260 * y + 520 * Math.abs(x - 0.5 - 0.05 * Math.sin(y * 7)) * (0.4 + y * 0.8),
    river: [[0.5, 0], [0.52, 0.2], [0.48, 0.4], [0.53, 0.6], [0.5, 0.8], [0.47, 1]],
  },
  ridge: {
    name: '尾根と谷', interval: 10,
    desc: '尾根では等高線が低い方（下流側）に向かって張り出し、谷では高い方に向かって入り込む。',
    h: (x, y) => 100 + 300 * y + 45 * Math.cos(2 * Math.PI * (x * 2.2 + 0.25 * y)) * (0.4 + y),
  },
  fan: {
    name: '扇状地', interval: 5,
    desc: '山地から平地に出たところで、川が運んだ礫や砂が扇形にたまった地形。等高線は谷の出口（扇頂）を中心とする同心円状の弧になる。扇央は水はけがよく、扇端で湧水が出る。',
    h: (x, y) => { const r = Math.hypot(x - 0.5, (y - 0.9) * 1.15); return Math.max(8, 170 - 190 * r) + 320 * sm(0.86, 1.02, y) * Math.min(1, 0.25 + Math.abs(x - 0.5) * 5); },
  },
  terrace: {
    name: '河岸段丘', interval: 5,
    desc: '川に沿って階段状に並ぶ平坦面（段丘面）と急な崖（段丘崖）。等高線が段丘崖に集まり、段丘面ではまばらになる。土地の隆起や海面の低下で、川が再び下刻して作られる。',
    h: (x, y) => { const d = Math.abs(x - 0.5 - 0.04 * Math.sin(y * 5)); let z = 8 + 10 * y + 18 * d; z += 22 * sm(0.08, 0.12, d) + 22 * sm(0.22, 0.26, d) + 22 * sm(0.36, 0.40, d) + 160 * sm(0.45, 0.6, d); return z; },
    river: [[0.5, 0], [0.54, 0.25], [0.5, 0.5], [0.46, 0.75], [0.5, 1]],
  },
  volcano: {
    name: '成層火山', interval: 20,
    desc: '溶岩と火山砕屑物が交互に積み重なった円錐形の火山。等高線は山頂を中心とする同心円で、山頂付近ほど間隔がせまい（傾斜が急）。山頂に火口。',
    h: (x, y) => { const r = Math.hypot(x - 0.5, y - 0.5); return 190 + 1500 * Math.pow(Math.max(0, 1 - r / 0.48), 1.6) - 40 * r - 80 * Math.exp(-((r) ** 2) / 0.0012); },
  },
  caldera: {
    name: 'カルデラ', interval: 20,
    desc: '大規模な噴火のあとに陥没してできた、直径数 km 以上の円形のくぼ地。等高線は外輪山の内側で急に下がる。内部に湖（カルデラ湖）や中央火口丘ができることがある。',
    h: (x, y) => { const r = Math.hypot(x - 0.5, y - 0.5); const cone = 170 * Math.exp(-((x - 0.6) ** 2 + (y - 0.45) ** 2) / 0.0018);
      return r < 0.3 ? 290 + 380 * sm(0.22, 0.3, r) + cone : Math.max(180, 670 - 1100 * (r - 0.3)); },
    lake: true,
  },
  coastal: {
    name: '海岸段丘', interval: 10,
    desc: '海岸に沿って階段状に並ぶ平坦面。波の侵食でできた平坦面（海食台）が、地震などによる隆起でくり返し陸上に持ち上げられてできる。',
    h: (x, y) => { const d = y; return -20 + 32 * d + 30 * sm(0.12, 0.16, d) + 40 * sm(0.36, 0.40, d) + 40 * sm(0.58, 0.62, d) + 240 * sm(0.8, 1.0, d) + 3 * Math.sin(x * 6) * sm(0.7, 0.9, d); },
    sea: true,
  },
};

export function topoValues(key, n = 81) {
  const T = TOPO[key];
  const vals = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = T.h(i / (n - 1), 1 - j / (n - 1));
  return vals;
}

export function topoSVG(key, opts = {}) {
  const T = TOPO[key];
  const n = 81, w = opts.w || 400, h = opts.h || 400;
  const vals = topoValues(key, n);
  const tx = ([i, j]) => [i / (n - 1) * w, j / (n - 1) * h];
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const iv = T.interval, major = iv * 5;
  let lines = '', labels = '';
  for (let L = Math.ceil(lo / iv) * iv; L <= hi; L += iv) {
    if (T.sea && L <= 0) continue;
    const bold = L % major === 0;
    for (const line of contour(vals, n, n, L + 0.013)) {
      if (line.length < 3) continue;
      lines += `<path d="${smoothPath(line, tx, false, 0, 2)}" fill="none" stroke="#9a5b2a" stroke-width="${bold ? 1.6 : 0.75}"/>`;
      if (bold && opts.labels !== false && line.length > 20) {
        const p = tx(line[Math.floor(line.length * 0.37)]);
        labels += `<text x="${p[0].toFixed(1)}" y="${(p[1] + 3).toFixed(1)}" font-size="10" text-anchor="middle" fill="#7a4520" stroke="#fffdf6" stroke-width="3" paint-order="stroke" font-family="sans-serif">${L}</text>`;
      }
    }
  }
  let water = '';
  if (T.sea) for (const line of contour(vals, n, n, 0.013)) water += `<path d="${smoothPath(line, tx)}" fill="none" stroke="#2f6fb0" stroke-width="1.6"/>`;
  if (T.sea) {
    // 海（0 m 以下）を塗る
    let d = '';
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) if (vals[j * n + i] < 0) { const [x, y] = tx([i, j]); d += `M${x.toFixed(1)} ${y.toFixed(1)}h${(w / (n - 1) + .3).toFixed(1)}v${(h / (n - 1) + .3).toFixed(1)}h${(-(w / (n - 1) + .3)).toFixed(1)}z`; }
    water = `<path d="${d}" fill="#cfe4f5"/>` + water;
  }
  if (T.lake) {
    let d = '';
    const lv = 295;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const x = i / (n - 1), y = 1 - j / (n - 1);
      if (vals[j * n + i] < lv && Math.hypot(x - 0.5, y - 0.5) < 0.3) { const [px, py] = tx([i, j]); d += `M${px.toFixed(1)} ${py.toFixed(1)}h${(w / (n - 1) + .3).toFixed(1)}v${(h / (n - 1) + .3).toFixed(1)}h${(-(w / (n - 1) + .3)).toFixed(1)}z`; }
    }
    water = `<path d="${d}" fill="#cfe4f5"/>` + water;
  }
  const river = T.river ? `<path d="${smoothPath(T.river.map(([x, y]) => [x * (n - 1), (1 - y) * (n - 1)]), tx)}" fill="none" stroke="#2f6fb0" stroke-width="1.8"/>` : '';
  const scale = `<g font-family="sans-serif" font-size="10" fill="#555"><path d="M${w - 92} ${h - 12}h80" stroke="#555" stroke-width="2"/><text x="${w - 52}" y="${h - 16}" text-anchor="middle">${opts.scale || '500 m'}</text><path d="M${w - 18} 34V12M${w - 18} 12l-4 8M${w - 18} 12l4 8" stroke="#555" stroke-width="1.4" fill="none"/><text x="${w - 18}" y="46" text-anchor="middle">N</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${opts.alt || '地形図'}">
<defs><clipPath id="tp-${key}"><rect width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#tp-${key})"><rect width="${w}" height="${h}" fill="#fffdf6"/>${water}${lines}${river}${labels}${scale}</g><rect width="${w}" height="${h}" fill="none" stroke="#777"/></svg>`;
}
