// グラフ：走時曲線（地震）、HR図（恒星）。画面に依存しない
export const FILE_VERSION = '0.1.3';

const f1 = (n) => (+n).toFixed(1);

// 大森公式の比例定数 k = Vp·Vs / (Vp − Vs)（震源距離 D = k × 初期微動継続時間）
export const omoriK = (vp, vs) => vp * vs / (vp - vs);

// 走時曲線：横軸 震源距離 [km]、縦軸 到着までの時間 [s]。marks：[{d, label}] の観測点
export function travelTimeSVG({ vp = 6, vs = 3.5, maxD = 300, marks = [], w = 460, h = 300, showPS = true, alt } = {}) {
  const L = 46, B = 36, T = 14, Rr = 16;
  const maxT = Math.ceil(maxD / vs / 10) * 10;
  const X = (d) => L + d / maxD * (w - L - Rr), Y = (t) => h - B - t / maxT * (h - B - T);
  let g = '';
  for (let d = 0; d <= maxD; d += maxD / 6) g += `<path d="M${f1(X(d))} ${T}V${h - B}" stroke="#e3e1da"/><text x="${f1(X(d))}" y="${h - B + 15}" font-size="11" text-anchor="middle" fill="#666">${Math.round(d)}</text>`;
  for (let t = 0; t <= maxT; t += 10) g += `<path d="M${L} ${f1(Y(t))}H${w - Rr}" stroke="#e3e1da"/><text x="${L - 5}" y="${f1(Y(t) + 4)}" font-size="11" text-anchor="end" fill="#666">${t}</text>`;
  const line = (v, col, lab) => `<path d="M${X(0)} ${Y(0)}L${f1(X(maxD))} ${f1(Y(maxD / v))}" stroke="${col}" stroke-width="2.2"/><text x="${f1(X(maxD * 0.92))}" y="${f1(Y(maxD * 0.92 / v) - 7)}" font-size="13" font-weight="700" fill="${col}">${lab}</text>`;
  let m = '';
  for (const k of marks) {
    const tp = k.d / vp, ts = k.d / vs;
    m += `<path d="M${f1(X(k.d))} ${f1(Y(tp))}V${f1(Y(ts))}" stroke="#7a5b16" stroke-width="2" stroke-dasharray="3 2"/>`;
    if (showPS) m += `<text x="${f1(X(k.d) + 5)}" y="${f1((Y(tp) + Y(ts)) / 2 + 4)}" font-size="11" fill="#7a5b16">${k.label || ''}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${alt || '走時曲線'}" font-family="sans-serif">
<rect width="${w}" height="${h}" fill="#fff"/>${g}<path d="M${L} ${T}V${h - B}H${w - Rr}" stroke="#333" fill="none" stroke-width="1.2"/>
${line(vp, '#1f5fbf', 'P波')}${line(vs, '#c0392b', 'S波')}${m}
<text x="${(L + w - Rr) / 2}" y="${h - 4}" font-size="12" text-anchor="middle" fill="#333">震源距離 [km]</text>
<text x="12" y="${(T + h - B) / 2}" font-size="12" text-anchor="middle" fill="#333" transform="rotate(-90 12 ${(T + h - B) / 2})">時間 [s]</text></svg>`;
}

// HR図：横軸 表面温度（左が高温、対数）、縦軸 光度（太陽 = 1、対数）
export const SPECTRAL = [['O', 30000, 50000], ['B', 10000, 30000], ['A', 7500, 10000], ['F', 6000, 7500], ['G', 5200, 6000], ['K', 3700, 5200], ['M', 2400, 3700]];
export function starColor(T) {
  if (T > 25000) return '#9db4ff'; if (T > 10000) return '#b8c9ff'; if (T > 7500) return '#e4e8ff'; if (T > 6000) return '#fff6e8';
  if (T > 5200) return '#ffeab0'; if (T > 3700) return '#ffc27a'; return '#ff8f5a';
}
export function hrFrame({ w = 480, h = 400 } = {}) {
  const L = 52, B = 46, T = 12, R = 14;
  const lt0 = Math.log10(40000), lt1 = Math.log10(2400), ll0 = -4.5, ll1 = 6;
  const X = (t) => L + (Math.log10(t) - lt0) / (lt1 - lt0) * (w - L - R);
  const Y = (l) => h - B - (Math.log10(l) - ll0) / (ll1 - ll0) * (h - B - T);
  return { X, Y, L, B, T, R, w, h };
}
// opts：{ labels: true（星の名前）, ids: [名前を出す星], radii: true（半径の線）, regions: true }
export function hrSVG(stars, opts = {}) {
  const F = hrFrame(opts), { X, Y, L, B, T, R, w, h } = F;
  let g = `<rect width="${w}" height="${h}" fill="${opts.dark ? '#14161c' : '#fbfaf6'}"/>`;
  const ink = opts.dark ? '#c8ccd6' : '#444', grid = opts.dark ? '#2a2e37' : '#e8e5dc';
  for (const [k, a, b] of SPECTRAL) {
    const x = (X(Math.min(a, 40000)) + X(Math.min(b, 40000))) / 2;
    g += `<path d="M${f1(X(a))} ${T}V${h - B}" stroke="${grid}"/><text x="${f1(x)}" y="${h - B + 27}" font-size="12" text-anchor="middle" fill="${ink}" font-weight="700">${k}</text>`;
  }
  for (const t of [30000, 10000, 6000, 3000]) g += `<text x="${f1(X(t))}" y="${h - B + 13}" font-size="10" text-anchor="middle" fill="${ink}">${t}</text>`;
  for (let e = -4; e <= 6; e += 2) g += `<path d="M${L} ${f1(Y(10 ** e))}H${w - R}" stroke="${grid}"/><text x="${L - 5}" y="${f1(Y(10 ** e) + 4)}" font-size="10" text-anchor="end" fill="${ink}">10${sup(e)}</text>`;
  const cid = 'hrc' + Math.round(w + h + (opts.ids || []).length * 7);
  g += `<clipPath id="${cid}"><rect x="${L}" y="${T}" width="${w - L - R}" height="${h - B - T}"/></clipPath><g clip-path="url(#${cid})">`;
  if (opts.radii !== false) {
    // L = R² T⁴（太陽単位）。半径 0.01, 1, 100, 1000 倍の線
    for (const r of [0.01, 1, 100, 1000]) {
      const pts = [40000, 2400].map(t => [X(t), Y(r * r * (t / 5772) ** 4)]);
      g += `<path d="M${f1(pts[0][0])} ${f1(pts[0][1])}L${f1(pts[1][0])} ${f1(pts[1][1])}" stroke="${opts.dark ? '#3d4250' : '#cfd6e0'}" stroke-dasharray="4 3"/>`;
      const tl = r >= 100 ? 9000 : r === 1 ? 4000 : 20000;
      const yl = Y(r * r * (tl / 5772) ** 4);
      if (yl > T + 8 && yl < h - B - 4) g += `<text x="${f1(X(tl))}" y="${f1(yl - 4)}" font-size="9.5" fill="${opts.dark ? '#7d8596' : '#8a96a8'}">半径 ${r} 倍</text>`;
    }
  }
  if (opts.regions !== false) {
    const lab = (t, l, s) => `<text x="${f1(X(t))}" y="${f1(Y(l))}" font-size="12" fill="${opts.dark ? '#9aa3b5' : '#6b7280'}" font-weight="700">${s}</text>`;
    const ms = [[38000, 2e5], [22400, 1.6e4], [15000, 2.5e3], [9600, 50], [7400, 7], [5772, 1], [4500, 0.15], [3500, 0.02], [2900, 0.0012]];
    g += `<path d="M${ms.map(([t, l]) => f1(X(t)) + ' ' + f1(Y(l))).join('L')}" stroke="${opts.dark ? '#4c5a73' : '#b7c3d6'}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".55"/>`;
    g += lab(17000, 2, '主系列星') + lab(4300, 3000, '巨星') + lab(9000, 3.5e5, '超巨星') + lab(30000, 3e-4, '白色矮星');
  }
  g += '</g>';
  const show = new Set(opts.ids || (opts.labels ? stars.map(s => s.id) : []));
  for (const s of stars) {
    const x = X(s.T), y = Y(s.L), r = s.id === 'sun' ? 5.5 : 4.2;
    g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${starColor(s.T)}" stroke="${opts.dark ? '#ffffff55' : '#555'}" stroke-width=".8" data-star="${s.id}"><title>${s.name}</title></circle>`;
    if (show.has(s.id)) g += s.short ? `<text x="${f1(x + 8)}" y="${f1(y + 6)}" font-size="17" font-weight="700" fill="${opts.dark ? '#fff' : '#b0281a'}">${s.short}</text>`
      : `<text x="${f1(x + 7)}" y="${f1(y + 4)}" font-size="10.5" fill="${ink}">${s.name.replace(/（.*?）/, '')}</text>`;
  }
  g += `<path d="M${L} ${T}V${h - B}H${w - R}" stroke="${ink}" fill="none"/>`;
  g += `<text x="${(L + w - R) / 2}" y="${h - 2}" font-size="11" text-anchor="middle" fill="${ink}">表面温度 [K]（スペクトル型）</text>`;
  g += `<text x="13" y="${(T + h - B) / 2}" font-size="11" text-anchor="middle" fill="${ink}" transform="rotate(-90 13 ${(T + h - B) / 2})">光度（太陽 = 1）</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${opts.alt || 'HR図'}" font-family="sans-serif">${g}</svg>`;
}
function sup(e) { const m = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }; return String(e).split('').map(c => m[c]).join(''); }
