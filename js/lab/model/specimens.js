// 岩石の組織（ルーペで見たようす）と化石の絵を SVG で描く。画面に依存しない。
// 岩石の性質・説明は content/geo/identify.json。ここは描き方だけ（同じ seed なら同じ絵）。
import { rng } from './strata.js';
export const FILE_VERSION = '0.1.0';

// 造岩鉱物の色と形
export const MINERAL_LOOK = {
  Q: { c: '#d9d8d2', e: '#9a988e', shape: 'anhedral' },     // 石英：灰白色・ガラス光沢、不定形
  K: { c: '#efc0a6', e: '#b98a72', shape: 'block' },        // カリ長石：淡桃色
  P: { c: '#f7f6f0', e: '#b7b4a8', shape: 'lath' },         // 斜長石：白、短冊形
  B: { c: '#2a2421', e: '#000000', shape: 'hex' },          // 黒雲母：黒、六角板状
  H: { c: '#24332a', e: '#0c130f', shape: 'prism' },        // 角閃石：黒緑、長柱状
  X: { c: '#3d3b2c', e: '#16150f', shape: 'stubby' },       // 輝石：黒褐〜暗緑、短柱状
  O: { c: '#8faa3c', e: '#5a6d22', shape: 'round' },        // かんらん石：黄緑、粒状
  C: { c: '#f1f0ec', e: '#c9c7bf', shape: 'anhedral' },     // 方解石：白
};

const f1 = (n) => n.toFixed(1);
function poly(pts) { return 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L') + 'Z'; }
function crystal(r, kind, x, y, s) {
  const a = r() * Math.PI;
  const rot = (px, py) => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)];
  switch (kind) {
    case 'lath': return poly([[-s, -s * 0.32], [s, -s * 0.32], [s, s * 0.32], [-s, s * 0.32]].map(p => rot(...p)));
    case 'prism': return poly([[-s, -s * 0.22], [s * 0.85, -s * 0.22], [s, 0], [s * 0.85, s * 0.22], [-s, s * 0.22], [-s * 1.12, 0]].map(p => rot(...p)));
    case 'hex': return poly([...Array(6)].map((_, i) => rot(Math.cos(i * Math.PI / 3) * s * 0.7, Math.sin(i * Math.PI / 3) * s * 0.7)));
    case 'stubby': return poly([[-s * 0.6, -s * 0.45], [s * 0.4, -s * 0.5], [s * 0.65, 0], [s * 0.45, s * 0.5], [-s * 0.5, s * 0.45], [-s * 0.7, 0]].map(p => rot(...p)));
    case 'block': return poly([[-s * 0.7, -s * 0.5], [s * 0.75, -s * 0.45], [s * 0.7, s * 0.55], [-s * 0.65, s * 0.5]].map(p => rot(...p)));
    case 'round': { const n = 7; return poly([...Array(n)].map((_, i) => { const t = i / n * 2 * Math.PI, q = s * (0.45 + 0.15 * r()); return [x + q * Math.cos(t), y + q * Math.sin(t)]; })); }
    default: { const n = 6 + Math.floor(r() * 3); return poly([...Array(n)].map((_, i) => { const t = i / n * 2 * Math.PI + r() * 0.3, q = s * (0.55 + 0.35 * r()); return [x + q * Math.cos(t), y + q * Math.sin(t)]; })); }
  }
}
function pickW(r, weights) {
  const ent = Object.entries(weights);
  let t = r() * ent.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of ent) { t -= w; if (t <= 0) return k; }
  return ent[ent.length - 1][0];
}

// rock：identify.json の rocks の1件。opts：{ size, seed, idp }
export function rockSVG(rock, opts = {}) {
  const S = opts.size || 240, R = S / 2, r = rng((opts.seed || 1) * 131 + rock.id.length * 17 + rock.id.charCodeAt(0));
  const idp = opts.idp || 'rk';
  const out = [];
  const tex = rock.texture;
  const add = (d, c, e, sw = 0.6) => out.push(`<path d="${d}" fill="${c}" stroke="${e}" stroke-width="${sw}"/>`);
  out.push(`<rect width="${S}" height="${S}" fill="${rock.ground || '#bbb'}"/>`);
  if (tex === 'equigranular' || tex === 'granoblastic') {
    const n = Math.round((rock.n || 150) * 1.8 * (S / 240) ** 2);
    for (let i = 0; i < n; i++) {
      const m = pickW(r, rock.minerals), L = MINERAL_LOOK[m];
      const s = (rock.grain || 14) * (0.6 + 0.7 * r());
      add(crystal(r, L.shape, r() * S, r() * S, s), L.c, L.e);
    }
  } else if (tex === 'porphyritic') {
    // 石基：細かい粒とガラス
    for (let i = 0; i < 900 * (S / 240) ** 2; i++) {
      const m = pickW(r, rock.groundMinerals || { P: 3, X: 1 });
      const L = MINERAL_LOOK[m];
      out.push(`<rect x="${f1(r() * S)}" y="${f1(r() * S)}" width="${f1(1 + r() * 2.4)}" height="${f1(0.8 + r() * 1.2)}" fill="${L.c}" opacity=".55"/>`);
    }
    const n = rock.n || 22;
    for (let i = 0; i < n; i++) {
      const m = pickW(r, rock.minerals), L = MINERAL_LOOK[m];
      const s = (rock.grain || 12) * (0.6 + 0.8 * r());
      add(crystal(r, L.shape, r() * S, r() * S, s), L.c, L.e, 0.8);
    }
  } else if (tex === 'clastic') {
    const n = Math.round((rock.n || 300) * (S / 240) ** 2);
    const cols = rock.clasts || ['#b9a789', '#8c7d68', '#d8cdb5'];
    for (let i = 0; i < n; i++) {
      const s = (rock.grain || 4) * (0.6 + 0.8 * r());
      const c = cols[Math.floor(r() * cols.length)];
      const x = r() * S, y = r() * S, a = r() * 180;
      out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(s)}" ry="${f1(s * (0.6 + 0.35 * r()))}" transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})" fill="${c}" stroke="#5a4c3c" stroke-width="${s > 6 ? 0.9 : 0.3}"/>`);
    }
    if (rock.lamina) for (let y = 8; y < S; y += 9 + r() * 10) out.push(`<path d="M0 ${f1(y)}Q${S / 2} ${f1(y + (r() - 0.5) * 6)} ${S} ${f1(y)}" stroke="#00000022" stroke-width="${f1(1 + r() * 2)}" fill="none"/>`);
  } else if (tex === 'bio') {
    for (let i = 0; i < 260; i++) out.push(`<circle cx="${f1(r() * S)}" cy="${f1(r() * S)}" r="${f1(0.6 + r())}" fill="#00000014"/>`);
    for (let i = 0; i < (rock.n || 18); i++) {
      const x = r() * S, y = r() * S, s = (rock.grain || 8) * (0.6 + 0.8 * r()), a = r() * 360;
      if (rock.fossil === 'radiolaria') out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s * 0.35)}" fill="none" stroke="#f3e2d4" stroke-width="1"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s * 0.15)}" fill="#f3e2d4" opacity=".6"/>`);
      else out.push(`<path d="M${f1(x - s)} ${f1(y)}A${f1(s)} ${f1(s * 0.6)} 0 0 1 ${f1(x + s)} ${f1(y)}" transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})" fill="none" stroke="#8a8a84" stroke-width="1.6"/>`);
    }
  } else if (tex === 'pyroclastic') {
    for (let i = 0; i < 500; i++) out.push(`<circle cx="${f1(r() * S)}" cy="${f1(r() * S)}" r="${f1(0.5 + r() * 0.8)}" fill="#00000018"/>`);
    for (let i = 0; i < (rock.n || 40); i++) {
      const x = r() * S, y = r() * S, s = (rock.grain || 7) * (0.5 + r());
      const pts = [...Array(3 + Math.floor(r() * 2))].map((_, k, A) => { const t = k / A.length * 2 * Math.PI + r(); return [x + s * Math.cos(t), y + s * Math.sin(t)]; });
      add(poly(pts), r() < 0.5 ? '#f7f2e6' : r() < 0.6 ? '#9c9284' : '#d9cbb0', '#7a6e5e', 0.5);
    }
  } else if (tex === 'foliated') {
    for (let y = 0; y < S + 6; y += 3.2 + r() * 2.5) {
      const c = r() < (rock.dark || 0.45) ? '#4b5a4a' : r() < 0.5 ? '#9fb19a' : '#d6dcd0';
      let d = `M-5 ${f1(y)}`;
      for (let x = 0; x <= S + 10; x += 20) d += `Q${f1(x + 10)} ${f1(y + (r() - 0.5) * 5)} ${f1(x + 20)} ${f1(y + (r() - 0.5) * 2)}`;
      out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${f1(2.4 + r() * 2.5)}" stroke-linecap="round"/>`);
    }
    for (let i = 0; i < 40; i++) out.push(`<ellipse cx="${f1(r() * S)}" cy="${f1(r() * S)}" rx="${f1(3 + r() * 4)}" ry="1" fill="#e9eef0" opacity=".7"/>`);
  } else if (tex === 'banded') {
    let y = 0;
    let dark = r() < 0.5;
    while (y < S) {
      const h = 10 + r() * 18;
      const weights = dark ? { B: 6, H: 2, P: 1 } : { Q: 3, K: 2, P: 3, B: 0.3 };
      for (let i = 0; i < h * S / 55; i++) {
        const m = pickW(r, weights), L = MINERAL_LOOK[m];
        const s = 5 * (0.6 + 0.7 * r());
        const x = r() * S, yy = y + r() * h;
        add(`M${f1(x - s)} ${f1(yy)}L${f1(x)} ${f1(yy - s * 0.4)}L${f1(x + s)} ${f1(yy)}L${f1(x)} ${f1(yy + s * 0.4)}Z`, L.c, L.e, 0.4);
      }
      y += h; dark = !dark;
    }
  } else if (tex === 'hornfels') {
    for (let i = 0; i < 1600 * (S / 240) ** 2; i++) out.push(`<rect x="${f1(r() * S)}" y="${f1(r() * S)}" width="1.6" height="1.2" fill="${r() < 0.5 ? '#2f2b2e' : '#6e6870'}" opacity=".6"/>`);
    for (let i = 0; i < 26; i++) out.push(`<circle cx="${f1(r() * S)}" cy="${f1(r() * S)}" r="${f1(2 + r() * 2.5)}" fill="#3a3238" opacity=".55"/>`);
  }
  // ルーペの円
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${opts.alt || rock.name + 'の組織'}">
<defs><clipPath id="${idp}-c"><circle cx="${R}" cy="${R}" r="${R - 3}"/></clipPath></defs>
<g clip-path="url(#${idp}-c)">${out.join('')}</g><circle cx="${R}" cy="${R}" r="${R - 3}" fill="none" stroke="#3b3a36" stroke-width="5"/></svg>`;
}

// ---------------------------------------------------------------- 化石
const STW = (w) => `stroke="#4a3b2c" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
const ST = STW(1.6);
const STF = `fill="#e8dcc5" stroke="#4a3b2c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const FILL = '#e8dcc5';
function spiral(cx, cy, a, b, turns, n = 220) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n * turns * 2 * Math.PI; const r = a * Math.exp(b * t); pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return pts;
}
const D = (pts) => 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L');
const FOSSIL_DRAW = {
  trilobite: () => {
    let s = `<path d="M100 20C70 20 52 34 50 52C40 54 34 70 36 92L44 70C48 66 52 64 56 63L64 138C72 150 128 150 136 138L144 63C148 64 152 66 156 70L164 92C166 70 160 54 150 52C148 34 130 20 100 20Z" ${STF}/>`;
    s += `<path d="M86 30C86 48 88 56 90 140M114 30C114 48 112 56 110 140" ${ST}/>`;
    s += `<path d="M52 56C70 60 130 60 148 56" ${ST}/>`;
    for (let i = 0; i < 9; i++) { const y = 70 + i * 7.5, w = 42 - i * 1.6; s += `<path d="M${100 - w - 6} ${y}Q100 ${y + 4} ${100 + w + 6} ${y}" ${STW(1.2)}/>`; }
    s += `<ellipse cx="72" cy="44" rx="6" ry="4" fill="#4a3b2c"/><ellipse cx="128" cy="44" rx="6" ry="4" fill="#4a3b2c"/>`;
    return s;
  },
  graptolite: () => {
    let s = `<path d="M30 130C70 110 120 70 175 30" ${STW(2.2)}/>`;
    for (let i = 0; i < 14; i++) { const t = i / 14, x = 34 + t * 136, y = 128 - t * 96 - Math.sin(t * 3) * 4; s += `<path d="M${f1(x)} ${f1(y)}l9 1 -5 -9" ${STW(1.3)}/>`; }
    return s;
  },
  fusulina: () => {
    let s = `<path d="M20 80C40 52 160 52 180 80C160 108 40 108 20 80Z" ${STF}/>`;
    for (let k = 1; k <= 5; k++) { const h = 28 * k / 6, w = 80 * k / 6 + 6; s += `<path d="M${100 - w} 80C${100 - w / 2} ${80 - h} ${100 + w / 2} ${80 - h} ${100 + w} 80C${100 + w / 2} ${80 + h} ${100 - w / 2} ${80 + h} ${100 - w} 80Z" ${STW(.9)}/>`; }
    for (let i = -7; i <= 7; i++) s += `<path d="M${100 + i * 10} ${66 + Math.abs(i)}V${94 - Math.abs(i)}" ${STW(.6)}/>`;
    return s;
  },
  lepidodendron: () => {
    let s = `<rect x="45" y="12" width="110" height="136" rx="8" ${STF}/>`;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) { const x = 58 + i * 22 + (j % 2) * 11, y = 26 + j * 22; s += `<path d="M${x} ${y - 9}L${x + 8} ${y}L${x} ${y + 9}L${x - 8} ${y}Z" ${STW(1.2)}/><circle cx="${x}" cy="${y}" r="1.6" fill="#4a3b2c"/>`; }
    return s;
  },
  ammonite: () => {
    const sp = spiral(100, 80, 3.2, 0.152, 3.1);
    let s = `<circle cx="100" cy="80" r="66" ${STF}/>`;
    s += `<path d="${D(sp)}" ${STW(1.8)}/>`;
    for (let i = 40; i < sp.length; i += 6) { const [x, y] = sp[i]; const dx = x - 100, dy = y - 80, L = Math.hypot(dx, dy); const k = Math.min(66, L * 1.6); s += `<path d="M${f1(x)} ${f1(y)}L${f1(100 + dx / L * k)} ${f1(80 + dy / L * k)}" ${STW(.9)}/>`; }
    return s;
  },
  dinosaur: () => {
    const toe = (a) => { const r = a * Math.PI / 180; return `<path d="M${f1(100 + Math.sin(r) * 20)} ${f1(104 - Math.cos(r) * 20)}Q${f1(100 + Math.sin(r) * 50 - Math.cos(r) * 12)} ${f1(104 - Math.cos(r) * 50 - Math.sin(r) * 12)} ${f1(100 + Math.sin(r) * 74)} ${f1(104 - Math.cos(r) * 74)}Q${f1(100 + Math.sin(r) * 50 + Math.cos(r) * 12)} ${f1(104 - Math.cos(r) * 50 + Math.sin(r) * 12)} ${f1(100 + Math.sin(r) * 20)} ${f1(104 - Math.cos(r) * 20)}" ${STF}/>`; };
    return `<ellipse cx="100" cy="112" rx="26" ry="30" ${STF}/>` + toe(-32) + toe(0) + toe(32);
  },
  inoceramus: () => {
    let s = `<path d="M60 30C30 50 24 110 60 136C100 156 160 140 176 100C180 70 150 36 110 26C90 22 72 24 60 30Z" ${STF}/>`;
    for (let k = 1; k < 8; k++) { const t = k / 8; s += `<path d="M${f1(60 - 28 * t)} ${f1(32 + 30 * t)}C${f1(40 - 10 * t)} ${f1(90 + 30 * t)} ${f1(100 + 30 * t)} ${f1(120 + 22 * t)} ${f1(120 + 50 * t)} ${f1(70 + 30 * t)}" ${STW(1)}/>`; }
    return s;
  },
  trigonia: () => {
    let s = `<path d="M70 24C50 40 34 90 40 130C80 142 150 140 176 118C160 80 110 40 70 24Z" ${STF}/>`;
    for (let k = 0; k < 9; k++) { const x = 58 + k * 13; s += `<path d="M${70 + k * 2} ${30 + k * 3}C${x - 10} ${70} ${x - 6} ${110} ${x} ${134 - k}" ${STW(1.1)}/>`; }
    for (let k = 0; k < 5; k++) s += `<circle cx="${62 + k * 22}" cy="${120 - k * 3}" r="2" fill="#4a3b2c"/>`;
    return s;
  },
  nummulites: () => `<circle cx="100" cy="80" r="56" ${STF}/><path d="${D(spiral(100, 80, 3, 0.085, 5.4))}" ${STW(1)}/>` +
    [...Array(28)].map((_, i) => { const t = i / 28 * 2 * Math.PI; return `<path d="M${f1(100 + 30 * Math.cos(t))} ${f1(80 + 30 * Math.sin(t))}L${f1(100 + 54 * Math.cos(t))} ${f1(80 + 54 * Math.sin(t))}" ${STW(.5)}/>`; }).join(''),
  vicaria: () => {
    let s = `<path d="M100 8L132 140C120 152 80 152 68 140Z" ${STF}/>`;
    for (let k = 1; k < 9; k++) { const y = 8 + k * 16, w = (y - 8) * 0.24; s += `<path d="M${f1(100 - w)} ${y}Q100 ${y + 5} ${f1(100 + w)} ${y}" ${STW(1.1)}/>`; for (let i = -1; i <= 1; i++) s += `<circle cx="${f1(100 + i * w * 0.6)}" cy="${y - 6}" r="${f1(1 + w * 0.08)}" fill="#4a3b2c"/>`; }
    return s;
  },
  desmostylus: () => {
    let s = '';
    const cs = [[70, 60], [100, 52], [130, 60], [80, 92], [112, 90], [96, 120]];
    for (const [x, y] of cs) s += `<ellipse cx="${x}" cy="${y}" rx="17" ry="17" ${STF}/><ellipse cx="${x}" cy="${y}" rx="9" ry="9" ${STW(1)}/>`;
    return s;
  },
  naumann: () => {
    let s = `<rect x="34" y="40" width="132" height="80" rx="30" ${STF}/>`;
    for (let i = 0; i < 11; i++) s += `<path d="M${46 + i * 11} 50C${42 + i * 11} 70 ${42 + i * 11} 90 ${46 + i * 11} 110" ${STW(1.4)}/>`;
    return s;
  },
  coral: () => {
    let s = `<rect x="22" y="18" width="156" height="124" rx="14" ${STF}/>`;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) {
      const x = 36 + i * 19 + (j % 2) * 9.5, y = 32 + j * 19;
      if (x > 168) continue;
      s += `<path d="${poly([...Array(6)].map((_, k) => [x + 10 * Math.cos(k * Math.PI / 3 + Math.PI / 6), y + 10 * Math.sin(k * Math.PI / 3 + Math.PI / 6)]))}" ${STW(1)}/>`;
    }
    return s;
  },
  shijimi: () => {
    const o = 'M100 28C60 30 32 70 36 104C44 132 156 132 164 104C168 70 140 30 100 28Z';
    let s = `<path d="${o}" ${STF}/>`;
    for (let k = 1; k < 8; k++) { const t = k / 8; s += `<path d="${o}" transform="translate(100 30) scale(${t}) translate(-100 -30)" stroke="#4a3b2c" stroke-width="${f1(0.8 / t)}" fill="none"/>`; }
    return s;
  },
  beech: () => {
    let d = 'M100 18';
    for (let i = 0; i <= 10; i++) { const t = i / 10, y = 18 + t * 110, w = 46 * Math.sin(Math.PI * Math.pow(t, 0.8)); d += `L${f1(100 + w)} ${f1(y)}L${f1(100 + w - 4)} ${f1(y + 5)}`; }
    for (let i = 10; i >= 0; i--) { const t = i / 10, y = 18 + t * 110, w = 46 * Math.sin(Math.PI * Math.pow(t, 0.8)); d += `L${f1(100 - w + 4)} ${f1(y + 5)}L${f1(100 - w)} ${f1(y)}`; }
    let s = `<path d="${d}Z" ${STF}/><path d="M100 18V150" ${ST}/>`;
    for (let i = 1; i < 10; i++) { const y = 22 + i * 11, w = 44 * Math.sin(Math.PI * Math.pow(i / 10, 0.8)); s += `<path d="M100 ${y + 6}L${f1(100 + w - 3)} ${y - 2}M100 ${y + 6}L${f1(100 - w + 3)} ${y - 2}" ${STW(.9)}/>`; }
    return s;
  },
};
export const FOSSIL_KEYS = Object.keys(FOSSIL_DRAW);
export function fossilSVG(key, opts = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" width="${opts.w || 200}" height="${(opts.w || 200) * 0.8}" role="img" aria-label="${opts.alt || '化石'}"><rect width="200" height="160" rx="10" fill="#f6f1e6"/>${FOSSIL_DRAW[key]()}</svg>`;
}
