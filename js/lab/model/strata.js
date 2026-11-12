// 地層・地質構造のモデル（画面に依存しない。ブラウザでも Node でも動く）
//   地史（できごとの列）を古い順にたどり、断面のマス目を作り直していく。
//   堆積：空気のマスを、水平な上面まで埋める（侵食面の凹凸の上にも水平に積もる＝不整合）
//   傾動・褶曲・断層：変形後の各マスが、変形前にどこにあったかを逆にたどって写す
//   侵食：ある高さより上のマスを空気にする
//   貫入：岩脈（帯）・深成岩体（楕円）の中の岩石を火成岩に、まわりを接触変成岩にする
// 断面は x：0〜W（左→右）、y：0〜H（下→上）。
export const FILE_VERSION = '0.1.1';

export const MATERIALS = {
  air: { name: '空気', color: null },
  cong: { name: '礫岩', color: '#d9b98c', pat: 'cong' },
  sand: { name: '砂岩', color: '#ecd9a0', pat: 'sand' },
  mud: { name: '泥岩', color: '#b9c2b4', pat: 'mud' },
  lime: { name: '石灰岩', color: '#d6dde6', pat: 'lime' },
  chert: { name: 'チャート', color: '#c9a3a0', pat: 'chert' },
  tuff: { name: '凝灰岩', color: '#f2e8d8', pat: 'tuff' },
  coal: { name: '石炭', color: '#5b5550', pat: null },
  base: { name: '基盤岩（片麻岩）', color: '#a7a0b8', pat: 'gneiss' },
  granite: { name: '花こう岩', color: '#efc7c0', pat: 'granite' },
  dike: { name: '玄武岩（岩脈）', color: '#7f8a6e', pat: 'dike' },
  horn: { name: 'ホルンフェルス', color: '#8f8a93', pat: 'horn' },
  marble: { name: '結晶質石灰岩（大理石）', color: '#f3f3f6', pat: 'lime' },
};

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AIR = 0;

// できごと：
//   {t:'dep', layers:[{m, h, label?}]}           堆積（下から順）
//   {t:'tilt', deg}                               傾動（反時計回りが正）。中心のまわりに回す
//   {t:'fold', amp, wl, ph?}                      褶曲（上下にずらす）
//   {t:'fault', x0, dip, throw, kind:'normal'|'reverse', toward:1|-1, label?}
//   {t:'ero', level, amp?, wl?, ph?}              侵食（level より上を削る）
//   {t:'dike', x0, w, deg, label?}                岩脈（x0 は下端の位置、deg は鉛直からの傾き）
//   {t:'pluton', cx, cy, rx, ry, aureole?, label?} 深成岩体と接触変成
export function simulate(events, W = 200, H = 120, upto = events.length) {
  let g = new Uint16Array(W * H);   // 0 = 空気、1.. = 層の番号
  const units = [{ id: 0, m: 'air' }];
  const notes = [];                 // 断層・岩脈などの位置（ラベル用）
  const at = (arr, x, y) => {
    if (y >= H) return AIR;
    const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
    return arr[yi * W + xi];
  };
  const remap = (fn) => {
    const n = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [sx, sy] = fn(x, y);
      n[y * W + x] = at(g, sx, sy);
    }
    g = n;
  };
  const surfaceMax = () => {
    let top = 0;
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (g[y * W + x] !== AIR) { top = Math.max(top, y + 1); break; }
    return top;
  };
  for (let k = 0; k < Math.min(upto, events.length); k++) {
    const ev = events[k];
    if (ev.t === 'dep') {
      let level = surfaceMax();
      for (const L of ev.layers) {
        const id = units.length;
        units.push({ id, m: L.m, label: L.label || null, ev: k });
        const top = level + L.h;
        for (let y = 0; y < Math.min(H, Math.round(top)); y++) for (let x = 0; x < W; x++) if (g[y * W + x] === AIR) g[y * W + x] = id;
        level = top;
      }
    } else if (ev.t === 'tilt') {
      const a = ev.deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = W / 2, cy = H / 2;
      remap((x, y) => { const dx = x - cx, dy = y - cy; return [cx + c * dx + s * dy, cy - s * dx + c * dy]; });
    } else if (ev.t === 'fold') {
      remap((x, y) => [x, y - ev.amp * Math.sin(2 * Math.PI * x / ev.wl + (ev.ph || 0))]);
    } else if (ev.t === 'fault') {
      const d = ev.dip * Math.PI / 180, dir = ev.toward || 1, yc = H / 2;
      // 断層面：y = yc - dir (x - x0) tan d。上盤 = 面より上の側
      const hang = (x, y) => y > yc - dir * (x - ev.x0) * Math.tan(d);
      // 正断層：上盤が面に沿って下がる。逆断層：上がる
      const sgn = ev.kind === 'reverse' ? -1 : 1;
      const mx = sgn * dir * ev.throw * Math.cos(d), my = -sgn * ev.throw * Math.sin(d);
      remap((x, y) => (hang(x, y) ? [x - mx, y - my] : [x, y]));
      notes.push({ t: 'fault', k, x0: ev.x0, dip: ev.dip, dir, yc, label: ev.label || 'f' });
    } else if (ev.t === 'ero') {
      if (ev.final) {   // 最後の侵食：いちばん低い地表の高さまで平らにする
        let lo = H;
        for (let x = 0; x < W; x++) { let y = H - 1; while (y >= 0 && g[y * W + x] === AIR) y--; lo = Math.min(lo, y + 1); }
        for (let x = 0; x < W; x++) for (let y = lo; y < H; y++) g[y * W + x] = AIR;
        continue;
      }
      for (let x = 0; x < W; x++) {
        const lv = ev.level + (ev.amp || 0) * Math.sin(2 * Math.PI * x / (ev.wl || W) + (ev.ph || 0));
        for (let y = Math.max(0, Math.ceil(lv)); y < H; y++) g[y * W + x] = AIR;
      }
    } else if (ev.t === 'dike' || ev.t === 'pluton') {
      const id = units.length;
      units.push({ id, m: ev.t === 'dike' ? 'dike' : 'granite', label: ev.label || null, ev: k, intrusive: true });
      const inside = ev.t === 'dike'
        ? (() => { const a = ev.deg * Math.PI / 180; return (x, y) => Math.abs((x - ev.x0 - Math.tan(a) * y) * Math.cos(a)) <= ev.w / 2; })()
        : (x, y) => ((x - ev.cx) / ev.rx) ** 2 + ((y - ev.cy) / ev.ry) ** 2 <= 1;
      const was = g.slice();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (was[y * W + x] !== AIR && inside(x, y)) g[y * W + x] = id;
      const au = ev.aureole ?? (ev.t === 'pluton' ? 5 : 0);
      if (au > 0) {
        const metaId = {};
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const u = was[y * W + x];
          if (u === AIR || g[y * W + x] === id) continue;
          const m = units[u].m;
          const to = (m === 'mud' || m === 'sand' || m === 'tuff' || m === 'chert') ? 'horn' : m === 'lime' ? 'marble' : null;
          if (!to) continue;
          let near = false;
          for (let dy = -au; dy <= au && !near; dy++) for (let dx = -au; dx <= au && !near; dx++) {
            if (dx * dx + dy * dy > au * au) continue;
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < W && yy >= 0 && yy < H && g[yy * W + xx] === id) near = true;
          }
          if (near) {
            const key = u + ':' + to;
            if (!metaId[key]) { metaId[key] = units.length; units.push({ id: units.length, m: to, label: null, ev: k, from: u }); }
            g[y * W + x] = metaId[key];
          }
        }
      }
      notes.push({ t: ev.t, k, label: ev.label || null, id });
    }
  }
  return { W, H, g, units, notes };
}

// それぞれの層の、ラベルを置きやすい位置（まわりのマスから最も離れたマス）
export function labelSpots(S) {
  const { W, H, g } = S;
  const best = {};
  const up = new Int16Array(W * H), dn = new Int16Array(W * H), lf = new Int16Array(W * H), rt = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    lf[i] = x > 0 && g[i - 1] === g[i] ? lf[i - 1] + 1 : 0;
    dn[i] = y > 0 && g[i - W] === g[i] ? dn[i - W] + 1 : 0;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    rt[i] = x < W - 1 && g[i + 1] === g[i] ? rt[i + 1] + 1 : 0;
    up[i] = y < H - 1 && g[i + W] === g[i] ? up[i + W] + 1 : 0;
  }
  for (let i = 0; i < W * H; i++) {
    const u = g[i];
    if (!u) continue;
    const s = Math.min(Math.min(lf[i], rt[i]) * 0.55, up[i], dn[i]);
    if (!best[u] || s > best[u].s) best[u] = { s, x: i % W, y: Math.floor(i / W) };
  }
  return best;
}

// 断面の SVG。opts：{ cell, labels, legend, idp（パターンの id の接頭辞）, faultLines, frame }
export function strataSVG(S, opts = {}) {
  const { W, H, g, units } = S;
  const c = opts.cell || 3, idp = opts.idp || 'st';
  const w = W * c, h = H * c;
  const byMat = {};
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const u = g[y * W + x];
      let x2 = x + 1;
      while (x2 < W && g[y * W + x2] === u) x2++;
      if (u) {
        const m = units[u].m;
        (byMat[m] = byMat[m] || []).push(`M${x * c} ${(H - 1 - y) * c}h${(x2 - x) * c}v${c}h${-(x2 - x) * c}z`);
      }
      x = x2;
    }
  }
  // 境界線（層が違うマスの間）
  const edges = [];
  for (let y = 0; y < H; y++) {
    let run = null;
    for (let x = 0; x <= W; x++) {
      const diff = x < W && y < H - 1 && g[y * W + x] !== g[(y + 1) * W + x] && (g[y * W + x] || g[(y + 1) * W + x]);
      if (diff && run === null) run = x;
      if (!diff && run !== null) { edges.push(`M${run * c} ${(H - 1 - y) * c}H${x * c}`); run = null; }
    }
  }
  for (let x = 0; x < W - 1; x++) {
    let run = null;
    for (let y = 0; y <= H; y++) {
      const diff = y < H && g[y * W + x] !== g[y * W + x + 1] && (g[y * W + x] || g[y * W + x + 1]);
      if (diff && run === null) run = y;
      if (!diff && run !== null) { edges.push(`M${(x + 1) * c} ${(H - run) * c}V${(H - y) * c}`); run = null; }
    }
  }
  const mats = Object.keys(byMat);
  const fills = mats.map(m => {
    const M = MATERIALS[m];
    return `<path d="${byMat[m].join('')}" fill="${M.color}"/>${M.pat ? `<path d="${byMat[m].join('')}" fill="url(#${idp}-${M.pat})"/>` : ''}`;
  }).join('');
  let labels = '';
  if (opts.labels !== false) {
    const spots = labelSpots(S);
    const fs = opts.font || 21;
    for (const u of units) {
      if (!u.label || !spots[u.id]) continue;
      const p = spots[u.id];
      labels += `<g class="lbl"><rect x="${p.x * c - fs * 0.62}" y="${(H - 1 - p.y) * c - fs * 0.72}" width="${fs * 1.24}" height="${fs * 1.3}" rx="3" fill="#fff" fill-opacity=".85"/><text x="${p.x * c}" y="${(H - 1 - p.y) * c + fs * 0.38}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="#222" font-family="sans-serif">${u.label}</text></g>`;
    }
    for (const n of S.notes) {
      if (n.t !== 'fault') continue;
      // 断層ラベル：断層面の両側で層が食い違っている範囲のいちばん上
      const d = n.dip * Math.PI / 180;
      let pos = null;
      for (let y = 2; y < H - 2; y++) {
        const x = n.x0 - n.dir * (y - n.yc) / Math.tan(d);
        if (x < 4 || x > W - 5) continue;
        const a = g[y * W + Math.round(x - 3)], b = g[y * W + Math.round(x + 3)];
        if (a && b && a !== b) pos = [x, y];
      }
      if (pos) pos = [pos[0], pos[1] - 3];
      if (pos) labels += `<text x="${pos[0] * c + 8}" y="${(H - 1 - pos[1]) * c}" font-size="${fs}" font-style="italic" font-weight="700" fill="#b0281a" font-family="serif">${n.label}</text>`;
    }
  }
  // 上の空を切りつめる（いちばん高い岩石の上に少しだけ空を残す）
  let top = 0;
  for (let i = 0; i < W * H; i++) if (g[i]) top = Math.max(top, Math.floor(i / W) + 1);
  const Ht = opts.crop === false ? H : Math.min(H, top + 6), oy = (H - Ht) * c, hh = Ht * c;
  const sky = opts.sky === false ? '' : `<rect y="${oy}" width="${w}" height="${hh}" fill="#eef5fb"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${oy} ${w} ${hh}" width="${w}" height="${hh}" role="img"${opts.alt ? ` aria-label="${opts.alt}"` : ''}>
<defs>${patternDefs(idp)}</defs>${sky}${fills}<path d="${edges.join('')}" fill="none" stroke="#3a3530" stroke-width="0.9" stroke-linecap="square"/>${labels}<rect y="${oy}" width="${w}" height="${hh}" fill="none" stroke="#3a3530" stroke-width="1.2"/></svg>`;
}

export function patternDefs(p) {
  const P = (id, w, h, body) => `<pattern id="${p}-${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern>`;
  const st = (w = 0.8) => `stroke="#4a4038" stroke-width="${w}" fill="none"`, s = st();
  return [
    P('cong', 12, 10, `<circle cx="3" cy="3" r="2.1" ${s}/><circle cx="9" cy="8" r="1.7" ${s}/>`),
    P('sand', 6, 6, '<circle cx="1.5" cy="1.5" r=".7" fill="#5a4a38"/><circle cx="4.5" cy="4.5" r=".7" fill="#5a4a38"/>'),
    P('mud', 10, 6, `<path d="M1 3h5" ${s}/>`),
    P('lime', 12, 8, `<path d="M0 .5h12M0 4.5h12M3 .5v4M9 4.5v4" ${s}/>`),
    P('chert', 6, 6, `<path d="M0 6L6 0" ${st(0.6)}/>`),
    P('tuff', 10, 8, `<path d="M2 2l2 3 2-3" ${s}/>`),
    P('gneiss', 14, 6, `<path d="M0 3q3.5-2 7 0t7 0" ${s}/>`),
    P('granite', 10, 10, `<path d="M3 1v4M1 3h4M8 6v4M6 8h4" ${s}/>`),
    P('dike', 5, 5, `<path d="M0 5L5 0M0 0l5 5" ${st(0.55)}/>`),
    P('horn', 5, 5, '<circle cx="2.5" cy="2.5" r=".9" fill="#2e2a30"/>'),
  ].join('');
}

// 柱状図用：x の位置で、地表から下へ層の並び [{u, m, label, top, bottom}]（標高はマス単位）
export function column(S, x) {
  const { W, H, g, units } = S;
  const out = [];
  let y = H - 1;
  while (y >= 0 && g[y * W + x] === AIR) y--;
  const surface = y + 1;
  while (y >= 0) {
    const u = g[y * W + x];
    let y2 = y;
    while (y2 - 1 >= 0 && g[(y2 - 1) * W + x] === u) y2--;
    out.push({ u, m: units[u].m, label: units[u].label, top: y + 1, bottom: y2 });
    y = y2 - 1;
  }
  return { surface, layers: out };
}

// ---------------------------------------------------------------- 地史の型（問題・クイズ用）
// できごとの説明（並べかえの札）。堆積はひとまとまりで「A〜D層の堆積」
export function describe(events) {
  const out = [];
  for (const ev of events) {
    if (ev.final) continue;
    if (ev.t === 'dep') {
      const ls = ev.layers.map(l => l.label).filter(Boolean);
      out.push(ls.length > 1 ? `${ls[0]}〜${ls[ls.length - 1]}層の堆積` : `${ls[0]}層の堆積`);
    } else if (ev.t === 'tilt') out.push('地層の傾斜（傾動）');
    else if (ev.t === 'fold') out.push('褶曲');
    else if (ev.t === 'fault') out.push(`断層 ${ev.label || 'f'} の活動（${ev.kind === 'reverse' ? '逆断層' : '正断層'}）`);
    else if (ev.t === 'ero') out.push(ev.final ? '隆起して地表が侵食される' : '隆起・侵食（不整合面の形成）・沈降');
    else if (ev.t === 'dike') out.push(`岩脈 ${ev.label} の貫入`);
    else if (ev.t === 'pluton') out.push(`花こう岩 ${ev.label} の貫入（接触変成）`);
  }
  return out;
}

const SEDS = ['cong', 'sand', 'mud', 'lime', 'chert', 'sand', 'mud'];
function layerSet(r, letters, n, opt = {}) {
  const out = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    let m;
    do { m = SEDS[Math.floor(r() * SEDS.length)]; } while (m === prev);
    if (opt.tuffAt === i) m = 'tuff';
    prev = m;
    out.push({ m, h: (opt.hmin || 8) + Math.floor(r() * (opt.hvar || 6)), label: letters.shift() });
  }
  return out;
}

// 型ごとに、パラメータを乱数で決めた地史を作る（seed が同じなら同じもの）
export const TEMPLATES = {
  'fault-unconf': { name: '断層 → 不整合', desc: '地層が断層で切られ、侵食されたあとに新しい地層が重なる' },
  'tilt-unconf-dike': { name: '傾斜 → 不整合 → 岩脈', desc: '傾いた地層が侵食され、その上に水平な地層。最後に岩脈がすべてを切る' },
  'dike-fault': { name: '岩脈 → 断層 → 不整合', desc: '岩脈が断層でずれている。断層は不整合面より上を切らない' },
  'fold-unconf-fault': { name: '褶曲 → 不整合 → 断層', desc: '褶曲した地層の上に不整合で地層が重なり、最後に断層がすべてを切る' },
  'pluton': { name: '深成岩の貫入 → 不整合', desc: '花こう岩が貫入して周りが接触変成を受け、侵食されたあと地層が重なる' },
  'fault-dike': { name: '逆断層 → 岩脈 → 不整合', desc: '逆断層を岩脈が切っている' },
  'two-unconf': { name: '不整合が2つ', desc: '傾斜・侵食が2回くり返され、不整合面が2つある' },
};

export function makeHistory(template, seed = 1) {
  const r = rng(seed * 7919 + template.length * 31);
  const L = 'ABCDEFGHIJ'.split('');
  const W = 200, H = 120;
  const pick = (a, b) => a + r() * (b - a);
  const tuff = r() < 0.5;
  let ev = [];
  switch (template) {
    case 'fault-unconf': {
      const lo = layerSet(r, L, 5, { hmin: 9, hvar: 5, tuffAt: tuff ? 2 : -1 });
      ev = [{ t: 'dep', layers: lo },
        { t: 'fault', x0: pick(80, 120), dip: pick(55, 72), throw: pick(12, 20), kind: r() < 0.5 ? 'normal' : 'reverse', toward: r() < 0.5 ? 1 : -1, label: 'f' },
        { t: 'ero', level: pick(42, 52), amp: pick(1.5, 3), wl: pick(70, 120), ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 4 }) }];
      break;
    }
    case 'tilt-unconf-dike': {
      ev = [{ t: 'dep', layers: layerSet(r, L, 6, { hmin: 9, hvar: 4, tuffAt: tuff ? 3 : -1 }) },
        { t: 'tilt', deg: (r() < 0.5 ? 1 : -1) * pick(18, 30) },
        { t: 'ero', level: pick(52, 60), amp: pick(1, 3), wl: 90, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 4 }) },
        { t: 'dike', x0: pick(60, 140), w: pick(7, 10), deg: pick(-18, 18), label: 'X' }];
      break;
    }
    case 'dike-fault': {
      const x0 = pick(85, 115);
      ev = [{ t: 'dep', layers: layerSet(r, L, 5, { hmin: 9, hvar: 5, tuffAt: tuff ? 1 : -1 }) },
        { t: 'dike', x0: x0 + (r() < 0.5 ? -1 : 1) * pick(28, 40), w: pick(7, 9), deg: pick(-8, 8), aureole: 0, label: 'X' },
        { t: 'fault', x0, dip: pick(55, 70), throw: pick(14, 20), kind: r() < 0.5 ? 'normal' : 'reverse', toward: 1, label: 'f' },
        { t: 'ero', level: pick(46, 54), amp: pick(1, 2.5), wl: 100, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 4 }) }];
      // 岩脈が断層面と交わるように：断層の上盤側に置く
      const f = ev[2], d = ev[1], yi = pick(16, 34);
      const xi = f.x0 - f.toward * (yi - H / 2) / Math.tan(f.dip * Math.PI / 180);
      d.x0 = xi - Math.tan(d.deg * Math.PI / 180) * yi;
      break;
    }
    case 'fold-unconf-fault': {
      ev = [{ t: 'dep', layers: layerSet(r, L, 5, { hmin: 8, hvar: 4, tuffAt: tuff ? 2 : -1 }) },
        { t: 'fold', amp: pick(9, 14), wl: pick(110, 170), ph: r() * 6 },
        { t: 'ero', level: pick(44, 52), amp: pick(1, 2), wl: 80, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 4 }) },
        { t: 'fault', x0: pick(80, 120), dip: pick(58, 75), throw: pick(10, 16), kind: r() < 0.5 ? 'normal' : 'reverse', toward: r() < 0.5 ? 1 : -1, label: 'f' },
        { t: 'ero', level: 0, final: true }];
      break;
    }
    case 'pluton': {
      const lo = layerSet(r, L, 5, { hmin: 9, hvar: 4 });
      if (!lo.some(l => l.m === 'lime')) lo[1].m = 'lime';
      if (!lo.some(l => l.m === 'mud')) lo[3].m = lo[2].m === 'mud' ? 'sand' : 'mud';
      ev = [{ t: 'dep', layers: lo },
        { t: 'pluton', cx: pick(80, 120), cy: pick(4, 12), rx: pick(36, 50), ry: pick(28, 36), aureole: 6, label: 'Y' },
        { t: 'ero', level: pick(38, 44), amp: pick(1, 2), wl: 90, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 10, hvar: 4 }) }];
      break;
    }
    case 'fault-dike': {
      const x0 = pick(70, 100);
      ev = [{ t: 'dep', layers: layerSet(r, L, 5, { hmin: 9, hvar: 4, tuffAt: tuff ? 2 : -1 }) },
        { t: 'fault', x0, dip: pick(50, 62), throw: pick(14, 20), kind: 'reverse', toward: 1, label: 'f' },
        { t: 'dike', x0: x0 + pick(30, 50), w: pick(7, 9), deg: pick(-6, 6), aureole: 0, label: 'X' },
        { t: 'ero', level: pick(48, 54), amp: pick(1, 2), wl: 100, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 4 }) }];
      // 岩脈は断層の地表付近を横切るように置く（どちらが新しいか読めるように）
      const f = ev[1], yc = H / 2, d = f.dip * Math.PI / 180;
      ev[2].x0 = f.x0 - (40 - yc) / Math.tan(d) - Math.tan(ev[2].deg * Math.PI / 180) * 40;
      break;
    }
    case 'two-unconf': {
      ev = [{ t: 'dep', layers: layerSet(r, L, 4, { hmin: 9, hvar: 3 }) },
        { t: 'fold', amp: pick(8, 12), wl: pick(90, 130), ph: r() * 6 },
        { t: 'ero', level: pick(34, 40), amp: pick(1, 2), wl: 70, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 3, { hmin: 9, hvar: 3 }) },
        { t: 'tilt', deg: (r() < 0.5 ? 1 : -1) * pick(10, 16) },
        { t: 'ero', level: pick(60, 66), amp: pick(1, 2), wl: 90, ph: r() * 6 },
        { t: 'dep', layers: layerSet(r, L, 2, { hmin: 9, hvar: 3 }) }];
      break;
    }
    default: throw new Error('型がありません：' + template);
  }
  // 褶曲するときは、いちばん下の層を厚くする（背斜の芯の下に別の層が見えないように）
  const fold = ev.find(e => e.t === 'fold');
  if (fold) {
    const add = Math.max(0, Math.ceil(fold.amp + 6 - ev[0].layers[0].h));
    ev[0].layers[0].h += add;
    for (const e of ev) if (e.t === 'ero' && !e.final) e.level += add;
  }
  return { template, seed, W, H, events: ev };
}

// 時代の新旧を判断する根拠（解説用）
export function reasons(events) {
  const out = [];
  const D = describe(events);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.t === 'dep' && i === 0) out.push(`${D[i]}：地層累重の法則により、下の層ほど古い。`);
    if (ev.t === 'fault') {
      const cut = events.slice(0, i).filter(e => e.t === 'dep').flatMap(e => e.layers.map(l => l.label));
      const after = events.slice(i + 1).find(e => e.t === 'ero' && !e.final);
      out.push(`${D[i]}：${cut[0]}〜${cut[cut.length - 1]}層を切っているので、それらより新しい（切断の法則）${after && events.indexOf(after) > i ? '。不整合面より上の地層は切っていないので、不整合より古い' : ''}。`);
    }
    if (ev.t === 'dike') out.push(`${D[i]}：貫いている地層・断層より新しい。`);
    if (ev.t === 'pluton') out.push(`${D[i]}：まわりの地層を接触変成させているので、それらより新しい。花こう岩の上を不整合で覆う地層より古い。`);
    if (ev.t === 'ero' && !ev.final) out.push(`${D[i]}：下の地層の傾き・ずれ・侵食の跡を、上の地層が覆っている。`);
  }
  return out;
}
