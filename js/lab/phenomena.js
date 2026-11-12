// 地球現象のシミュレーション：地震波と震源決定・断熱変化とフェーン・ホットスポット・アイソスタシー・放射年代
import { C, $, $$, e, f1, head, tabs, bindTabs, probButton, done, slider, bindSlider, animator } from './common.js';
import { travelTimeSVG, omoriK } from './model/charts.js';

export const FILE_VERSION = '0.1.2';

const SIMS = [['seismic', '地震波'], ['adiabatic', '断熱変化'], ['hotspot', 'ホットスポット'], ['isostasy', 'アイソスタシー'], ['radiometric', '放射年代']];

export function phenomenaPage(view, key) {
  let anim = null;
  const mode = SIMS.some(s => s[0] === key) ? key : (C.prefs.phMode || 'seismic');
  view.innerHTML = `<div class="fade-in lab-ph">${head('地球現象のシミュレーション', '固体地球・大気・地質', '条件を変えると、図とグラフが同じモデルから一緒に変わります。')}
    ${tabs('phmode', SIMS, mode)}
    <div id="phbody"></div>
    <div id="phprob"></div>
  </div>`;
  const draw = (m) => {
    if (anim) anim.destroy();
    C.prefs.phMode = m; C.save();
    anim = ({ seismic, adiabatic, hotspot, isostasy, radiometric })[m]($('#phbody'));
    $('#phprob').innerHTML = probButton('phenomena', m, 'このシミュレーションに関係する問題を解く');
    done($('#phprob'));
  };
  bindTabs('phmode', draw);
  draw(mode);
  done(view);
  return { destroy() { if (anim) anim.destroy(); } };
}

// ---------------------------------------------------------------- 地震波と震源決定
function seismic(box) {
  const ST = [{ n: 'A', x: 60, y: 70 }, { n: 'B', x: 250, y: 90 }, { n: 'C', x: 140, y: 255 }];
  let vp = 6.0, ratio = 6 / 3.5, depth = 20, ep = { x: 120 + Math.random() * 80, y: 110 + Math.random() * 70 };
  let t = 0, guess = null, showCircles = false;
  box.innerHTML = `<div class="ph-grid">
    <div class="lab-fig sq" id="sqmap"></div>
    <div><div class="lab-fig" id="sqseis"></div>
      ${slider('svp', 'P波の速さ', 5, 8, 0.1, vp, ' km/s')}
      ${slider('sdep', '震源の深さ', 0, 60, 1, depth, ' km')}
      <div class="btn-row"><button class="btn primary" id="splay">地震を起こす</button><button class="btn" id="scirc">円をかいて震央を求める</button><button class="btn ghost" id="snew">別の地震</button></div>
      <p class="muted small">地図をタップすると、震央の位置を予想して置けます（✕）。円をかくと答えがわかります。</p>
    </div></div>
    <div id="sqtab"></div>
    <div class="lab-fig" id="sqtt"></div>`;
  const vs = () => vp / ratio;
  const hypo = (s) => Math.hypot(Math.hypot(s.x - ep.x, s.y - ep.y), depth);
  const tMax = () => Math.max(...ST.map(s => hypo(s) / vs())) + 6;
  const drawAll = () => {
    const k = omoriK(vp, vs());
    const rP = (vp * t) ** 2 - depth ** 2 > 0 ? Math.sqrt((vp * t) ** 2 - depth ** 2) : 0;
    const rS = (vs() * t) ** 2 - depth ** 2 > 0 ? Math.sqrt((vs() * t) ** 2 - depth ** 2) : 0;
    let g = `<rect width="300" height="300" fill="#eef3ea"/>`;
    for (let i = 50; i < 300; i += 50) g += `<path d="M${i} 0V300M0 ${i}H300" stroke="#d5dccf" stroke-width=".6"/>`;
    g += `<text x="296" y="296" font-size="9" text-anchor="end" fill="#777">1目盛り 50 km</text>`;
    if (t > 0) {
      if (rP > 0) g += `<circle cx="${ep.x}" cy="${ep.y}" r="${f1(rP)}" fill="#1f5fbf18" stroke="#1f5fbf" stroke-width="1.5"/>`;
      if (rS > 0) g += `<circle cx="${ep.x}" cy="${ep.y}" r="${f1(rS)}" fill="#c0392b14" stroke="#c0392b" stroke-width="1.5"/>`;
    }
    if (showCircles) {
      for (const s of ST) {
        g += `<circle cx="${s.x}" cy="${s.y}" r="${f1(hypo(s))}" fill="none" stroke="#7a5b16" stroke-dasharray="4 3"/>`;
      }
      // 共通弦（3本は震央で交わる）
      const chord = (a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
        const ra = hypo(a), rb = hypo(b);
        const xa = (L * L + ra * ra - rb * rb) / (2 * L);
        const px = a.x + dx / L * xa, py = a.y + dy / L * xa;
        return `<path d="M${f1(px - dy / L * 400)} ${f1(py + dx / L * 400)}L${f1(px + dy / L * 400)} ${f1(py - dx / L * 400)}" stroke="#7a5b16" stroke-width="1.2"/>`;
      };
      g += chord(ST[0], ST[1]) + chord(ST[1], ST[2]) + chord(ST[0], ST[2]);
      g += `<circle cx="${f1(ep.x)}" cy="${f1(ep.y)}" r="6" fill="#c0392b"/><text x="${f1(ep.x + 9)}" y="${f1(ep.y - 7)}" font-size="12" font-weight="700" fill="#c0392b">震央</text>`;
    }
    for (const s of ST) {
      const arrived = t * vp >= hypo(s);
      g += `<path d="M${s.x} ${s.y - 9}l7 12h-14z" fill="${arrived ? '#1f5fbf' : '#555'}"/><text x="${s.x}" y="${s.y + 18}" font-size="12" font-weight="700" text-anchor="middle" fill="#333">${s.n}</text>`;
    }
    if (guess) g += `<path d="M${guess.x - 6} ${guess.y - 6}l12 12M${guess.x + 6} ${guess.y - 6}l-12 12" stroke="#7d3c98" stroke-width="2.5"/>`;
    $('#sqmap').innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="観測点と地震波の広がり（上から見た図）" font-family="sans-serif">${g}</svg>`;
    $('#sqmap svg').addEventListener('click', (ev) => { const r = ev.currentTarget.getBoundingClientRect(); guess = { x: (ev.clientX - r.left) / r.width * 300, y: (ev.clientY - r.top) / r.height * 300 }; drawAll(); });
    // 地震計の記録
    const TM = tMax(), W = 340, H = 180, L = 26;
    let sg = '';
    ST.forEach((s, i) => {
      const y0 = 30 + i * 55, tp = hypo(s) / vp, ts = hypo(s) / vs();
      const X = (tt) => L + tt / TM * (W - L - 6);
      let d = `M${L} ${y0}`;
      const end = Math.min(t, TM);
      for (let tt = 0; tt <= end; tt += TM / 400) {
        let a = 0;
        if (tt > tp) a += 5 * Math.exp(-(tt - tp) / 6) * Math.sin(tt * 9.1);
        if (tt > ts) a += 16 * Math.exp(-(tt - ts) / 5) * Math.sin(tt * 5.3 + 1);
        d += `L${f1(X(tt))} ${f1(y0 - a)}`;
      }
      sg += `<text x="4" y="${y0 + 4}" font-size="12" font-weight="700" fill="#333">${s.n}</text><path d="${d}" fill="none" stroke="#333" stroke-width="1"/>`;
      if (t >= tp) sg += `<path d="M${f1(X(tp))} ${y0 - 22}V${y0 + 22}" stroke="#1f5fbf"/><text x="${f1(X(tp) + 2)}" y="${y0 - 14}" font-size="9" fill="#1f5fbf">P</text>`;
      if (t >= ts) sg += `<path d="M${f1(X(ts))} ${y0 - 22}V${y0 + 22}" stroke="#c0392b"/><text x="${f1(X(ts) + 2)}" y="${y0 - 14}" font-size="9" fill="#c0392b">S</text><text x="${f1((X(tp) + X(ts)) / 2)}" y="${y0 + 20}" font-size="9" text-anchor="middle" fill="#7a5b16">${f1(ts - tp)} s</text>`;
    });
    sg += `<text x="${W - 4}" y="${H - 4}" font-size="9" text-anchor="end" fill="#777">時間 →（発生から ${f1(t)} s）</text>`;
    $('#sqseis').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="3つの観測点の地震計の記録" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${sg}</svg>`;
    const done3 = ST.every(s => t >= hypo(s) / vs());
    $('#sqtab').innerHTML = `<table class="ph-table"><thead><tr><th>観測点</th><th>P波の到着</th><th>S波の到着</th><th>初期微動継続時間</th><th>震源距離 = k × PS</th></tr></thead><tbody>${ST.map(s => {
      const tp = hypo(s) / vp, ts = hypo(s) / vs(), ok = t >= ts;
      return `<tr><th>${s.n}</th><td>${t >= tp ? f1(tp) + ' s' : '—'}</td><td>${ok ? f1(ts) + ' s' : '—'}</td><td>${ok ? f1(ts - tp) + ' s' : '—'}</td><td>${ok ? `${f1(k)} × ${f1(ts - tp)} = <b>${Math.round(k * (ts - tp))} km</b>` : '—'}</td></tr>`;
    }).join('')}</tbody></table>
      <p class="muted small">大森公式：D = kT、k = V<sub>P</sub>V<sub>S</sub> / (V<sub>P</sub> − V<sub>S</sub>) = ${f1(k)} km/s（V<sub>S</sub> = ${f1(vs())} km/s）。${done3 && guess ? `予想した位置と震央のずれ：約 ${Math.round(Math.hypot(guess.x - ep.x, guess.y - ep.y))} km` : ''}</p>`;
    $('#sqtt').innerHTML = travelTimeSVG({ vp, vs: vs(), maxD: 300, marks: ST.filter(s => t >= hypo(s) / vs()).map(s => ({ d: hypo(s), label: s.n })), w: 460, h: 240 });
  };
  const A = animator((dt) => { t += dt * 12; if (t >= tMax()) { t = tMax(); A.stop(); } drawAll(); });
  bindSlider('svp', (v) => { vp = v; drawAll(); }, ' km/s');
  bindSlider('sdep', (v) => { depth = v; drawAll(); }, ' km');
  $('#splay').addEventListener('click', () => { t = 0; A.start(); });
  $('#scirc').addEventListener('click', () => { showCircles = !showCircles; if (showCircles && t < tMax()) t = tMax(); drawAll(); });
  $('#snew').addEventListener('click', () => { ep = { x: 90 + Math.random() * 120, y: 100 + Math.random() * 100 }; t = 0; guess = null; showCircles = false; drawAll(); });
  drawAll();
  return A;
}

// ---------------------------------------------------------------- 断熱変化とフェーン
function adiabatic(box) {
  let T0 = 25, Td = 17, Hm = 2000, dewDrop = true, pos = 1;
  box.innerHTML = `${slider('aT', 'ふもとの気温', 5, 35, 1, T0, ' ℃')}${slider('aTd', 'ふもとの露点', -5, 30, 1, Td, ' ℃')}${slider('aH', '山の高さ', 400, 3000, 100, Hm, ' m')}
    <label class="sw-toggle small"><input type="checkbox" id="adew" checked> 上昇するとき露点も 0.2℃/100 m 下がるとする</label>
    <div class="lab-fig" id="amtn"></div>
    ${slider('apos', '空気塊の位置', 0, 1, 0.01, pos, '', (v) => v < 0.5 ? '風上' : '風下')}
    <div class="lab-fig" id="achart"></div><div id="aread"></div>`;
  const model = () => {
    const rate = dewDrop ? 0.8 : 1.0;   // 気温と露点の差が縮む速さ（℃/100 m）
    const zc = Math.max(0, (T0 - Td) / rate * 100);
    const cloud = zc < Hm;
    const zTop = Hm;
    const Ttop = cloud ? T0 - zc / 100 - 0.5 * (zTop - zc) / 100 : T0 - zTop / 100;
    const T1 = Ttop + zTop / 100;
    return { zc, cloud, Ttop, T1 };
  };
  const tempAt = (M, z, up) => (up ? (z <= M.zc || !M.cloud ? T0 - z / 100 : T0 - M.zc / 100 - 0.5 * (z - M.zc) / 100) : M.Ttop + (Hm - z) / 100);
  const draw = () => {
    const M = model();
    // 山の図
    const W = 520, H = 220, base = 190, top = 40;
    const Z = (z) => base - z / 3000 * (base - top);
    const mx = (s) => 40 + s * (W - 80);
    const hill = (s) => Hm * Math.exp(-((s - 0.5) ** 2) / 0.03);
    let d = `M0 ${base}`;
    for (let i = 0; i <= 100; i++) { const s = i / 100; d += `L${f1(mx(s))} ${f1(Z(hill(s)))}`; }
    d += `L${W} ${base}Z`;
    const path = (s) => { const z = Math.max(hill(s), 0) + 30; return [mx(s), Z(z)]; };
    let g = `<rect width="${W}" height="${H}" fill="#eaf3fb"/>`;
    if (M.cloud) {
      const zc = M.zc;
      g += `<path d="M0 ${f1(Z(zc))}H${W}" stroke="#7c8aa0" stroke-dasharray="5 4"/><text x="6" y="${f1(Z(zc) - 4)}" font-size="10" fill="#566">凝結高度 ${Math.round(zc)} m</text>`;
      // 風上側の雲
      let s0 = 0; for (let i = 0; i <= 50; i++) { const s = i / 100; if (hill(s) + 30 >= zc) { s0 = s; break; } }
      for (let i = 0; i < 6; i++) { const s = s0 + (0.5 - s0) * i / 5; const [x, y] = path(s); g += `<ellipse cx="${f1(x)}" cy="${f1(y - 6)}" rx="22" ry="11" fill="#fff" stroke="#c9d3df"/>`; }
      g += `<path d="M${f1(mx(s0) + 6)} ${f1(Z(hill(s0) + 40))}l-5 14M${f1(mx(s0) + 26)} ${f1(Z(hill(s0 + 0.05) + 40))}l-5 14" stroke="#4b7bc0" stroke-width="1.4"/>`;
    }
    g += `<path d="${d}" fill="#a9c48f" stroke="#5b7a41"/>`;
    let pd = ''; for (let i = 0; i <= 100; i++) { const [x, y] = path(i / 100); pd += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`; }
    g += `<path d="${pd}" fill="none" stroke="#c0392b" stroke-width="1.4" stroke-dasharray="6 4" marker-end="url(#aarr)"/>`;
    const [px, py] = path(pos);
    const Tnow = tempAt(M, Math.max(0, hill(pos)), pos <= 0.5);
    g += `<circle cx="${f1(px)}" cy="${f1(py)}" r="9" fill="#f5b041" stroke="#a04000"/><text x="${f1(px)}" y="${f1(py - 14)}" font-size="11" text-anchor="middle" font-weight="700" fill="#a04000">${f1(Tnow)}℃</text>`;
    g += `<text x="8" y="${base + 20}" font-size="11" fill="#333">風上 ${T0}℃</text><text x="${W - 8}" y="${base + 20}" font-size="11" text-anchor="end" fill="#c0392b" font-weight="700">風下 ${f1(M.T1)}℃</text>`;
    $('#amtn').innerHTML = `<svg viewBox="0 0 ${W} ${H + 10}" role="img" aria-label="山を越える空気塊" font-family="sans-serif"><defs><marker id="aarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c0392b"/></marker></defs>${g}</svg>`;
    // 高度と気温のグラフ
    const CW = 520, CH = 240, L = 46, B = 30;
    const tl = Math.floor(Math.min(M.Ttop, Td - Hm / 500) - 2), th = Math.ceil(Math.max(M.T1, T0) + 2);
    const X = (T) => L + (T - tl) / (th - tl) * (CW - L - 12), Y = (z) => CH - B - z / Hm * (CH - B - 14);
    let c = '';
    for (let T = Math.ceil(tl / 5) * 5; T <= th; T += 5) c += `<path d="M${f1(X(T))} 10V${CH - B}" stroke="#e6e3da"/><text x="${f1(X(T))}" y="${CH - B + 14}" font-size="10" text-anchor="middle" fill="#666">${T}</text>`;
    for (let z = 0; z <= Hm; z += Hm > 1500 ? 500 : 200) c += `<path d="M${L} ${f1(Y(z))}H${CW - 12}" stroke="#e6e3da"/><text x="${L - 4}" y="${f1(Y(z) + 4)}" font-size="10" text-anchor="end" fill="#666">${z}</text>`;
    const up = [], down = [], dew = [];
    for (let i = 0; i <= 60; i++) { const z = Hm * i / 60; up.push([X(tempAt(M, z, true)), Y(z)]); down.push([X(tempAt(M, z, false)), Y(z)]); if (z <= M.zc || !M.cloud) dew.push([X(Td - (dewDrop ? 0.2 : 0) * z / 100), Y(z)]); }
    const pl = (a) => 'M' + a.map(p => p.map(f1).join(' ')).join('L');
    c += `<path d="${pl(up)}" fill="none" stroke="#1f5fbf" stroke-width="2.2"/><path d="${pl(down)}" fill="none" stroke="#c0392b" stroke-width="2.2"/><path d="${pl(dew)}" fill="none" stroke="#2e8b57" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    if (M.cloud) c += `<path d="M${L} ${f1(Y(M.zc))}H${CW - 12}" stroke="#7c8aa0" stroke-dasharray="5 4"/>`;
    c += `<text x="${f1(up[30][0] - 6)}" y="${f1(up[30][1])}" font-size="11" text-anchor="end" fill="#1f5fbf" font-weight="700">上昇（風上）</text><text x="${f1(down[30][0] + 6)}" y="${f1(down[30][1])}" font-size="11" fill="#c0392b" font-weight="700">下降（風下）</text>`;
    c += `<text x="${(L + CW) / 2}" y="${CH - 4}" font-size="11" text-anchor="middle" fill="#333">気温 [℃]　（緑の点線：露点）</text><text x="12" y="${(CH - B) / 2}" font-size="11" text-anchor="middle" fill="#333" transform="rotate(-90 12 ${(CH - B) / 2})">高さ [m]</text>`;
    $('#achart').innerHTML = `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="高さと空気塊の温度" font-family="sans-serif"><rect width="${CW}" height="${CH}" fill="#fff"/>${c}</svg>`;
    $('#aread').innerHTML = `<div class="panel small">${M.cloud
      ? `凝結高度 <b>${Math.round(M.zc)} m</b>（= (${T0} − ${Td}) ÷ ${dewDrop ? '0.8' : '1.0'} × 100）。そこまでは乾燥断熱減率 1℃/100 m、山頂までは湿潤断熱減率 0.5℃/100 m で下がり、山頂で <b>${f1(M.Ttop)}℃</b>。雨を降らせて水蒸気を失った空気は、乾燥断熱減率で下りるので風下のふもとで <b>${f1(M.T1)}℃</b>（<b>+${f1(M.T1 - T0)}℃</b>：フェーン現象）。`
      : `凝結高度（${Math.round(M.zc)} m）が山より高いので雲ができない。上りも下りも乾燥断熱減率で、風下でも ${f1(M.T1)}℃（気温は変わらない）。`}</div>`;
  };
  bindSlider('aT', (v) => { T0 = v; if (Td > T0) { Td = T0; $('#aTd').value = Td; $('#aTd-v').textContent = Td + ' ℃'; } draw(); }, ' ℃');
  bindSlider('aTd', (v) => { Td = Math.min(v, T0); draw(); }, ' ℃');
  bindSlider('aH', (v) => { Hm = v; draw(); }, ' m');
  bindSlider('apos', (v) => { pos = v; draw(); }, '', (v) => v < 0.5 ? '風上' : v > 0.5 ? '風下' : '山頂');
  $('#adew').addEventListener('change', (ev) => { dewDrop = ev.target.checked; draw(); });
  draw();
  return { destroy() {} };
}

// ---------------------------------------------------------------- ホットスポット
function hotspot(box) {
  let v = 8, change = 47, now = 0, bend = true;   // v：cm/年、now：「いま」が何百万年前か（0 = 現在）
  const span = 80, every = 3;
  box.innerHTML = `${slider('hv', 'プレートの速さ', 2, 12, 0.5, v, ' cm/年')}
    <label class="sw-toggle small"><input type="checkbox" id="hbend" checked> 約 ${change} 百万年前にプレートの動く向きが変わった（北北西 → 西北西）</label>
    ${slider('hnow', '時刻', -span, 0, 1, now, '', (t) => t === 0 ? '現在' : `${-t} 百万年前`)}
    <div class="btn-row"><button class="btn primary" id="hplay">再生</button></div>
    <div class="lab-fig" id="hmap"></div><div id="hread"></div>`;
  const W = 520, H = 420, hs = { x: 400, y: 330 };
  // 速さ v cm/年 = v × 10 km/百万年。画面 1 px = 10 km
  const vel = (t) => { const dir = bend && t > -change ? -70 : -15; const a = (dir - 90) * Math.PI / 180; return [Math.cos(a) * v * 10 / 15, Math.sin(a) * v * 10 / 15]; };   // px/百万年（1 px = 15 km。北が上、角は北からの向き）
  const posOf = (born, t) => { let x = hs.x, y = hs.y; for (let s = born; s < t; s += 0.5) { const [vx, vy] = vel(s); x += vx * 0.5; y += vy * 0.5; } return [x, y]; };
  const draw = () => {
    let g = `<rect width="${W}" height="${H}" fill="#cfe3f3"/>`;
    for (let i = 0; i < W; i += 100) g += `<path d="M${i} 0V${H}" stroke="#b7d0e4"/>`;
    for (let i = 0; i < H; i += 100) g += `<path d="M0 ${i}H${W}" stroke="#b7d0e4"/>`;
    g += `<text x="${W - 4}" y="${H - 6}" font-size="10" text-anchor="end" fill="#567">1目盛り 1500 km</text>`;
    const isl = [];
    for (let age = 0; now - age >= -span; age += every) {
      const b = now - age, [x, y] = posOf(b, now);
      const r = Math.max(2.5, 12 - age * 0.35);
      isl.push({ x, y, age, r });
    }
    let chain = '';
    isl.forEach((s, i) => { chain += `${i ? 'L' : 'M'}${f1(s.x)} ${f1(s.y)}`; });
    g += `<path d="${chain}" stroke="#7f9db8" stroke-width="1" fill="none" stroke-dasharray="3 3"/>`;
    for (const s of isl) {
      if (s.x < -20 || s.y < -20) continue;
      g += `<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}" fill="${s.age < 1 ? '#e67e22' : '#a1887f'}" stroke="#5d4037" stroke-width=".8"/>`;
      if (Math.round(s.age) % 12 === 0 && s.age > 0) g += `<text x="${f1(s.x + s.r + 4)}" y="${f1(s.y + 4)}" font-size="10" fill="#3e2723">${Math.round(s.age)}</text>`;
    }
    g += `<circle cx="${hs.x}" cy="${hs.y}" r="18" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="4 3"/><text x="${hs.x}" y="${hs.y + 34}" font-size="11" text-anchor="middle" fill="#c0392b" font-weight="700">ホットスポット（動かない）</text>`;
    const [vx, vy] = vel(now - 0.1);
    g += `<path d="M60 380l${f1(vx * 6)} ${f1(vy * 6)}" stroke="#333" stroke-width="2.5" marker-end="url(#harr)"/><text x="60" y="404" font-size="11" fill="#333">プレートの動き</text>`;
    g += `<path d="M${W - 24} 40V14M${W - 24} 14l-4 8M${W - 24} 14l4 8" stroke="#333" stroke-width="1.5" fill="none"/><text x="${W - 24}" y="54" font-size="10" text-anchor="middle">N</text>`;
    $('#hmap').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ホットスポットと火山島の列（数字は島ができてからの年数、百万年）" font-family="sans-serif"><defs><marker id="harr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#333"/></marker></defs>${g}</svg>`;
    $('#hread').innerHTML = `<div class="panel small">島の数字は、できてからの時間（百万年）。島はホットスポットの上でだけ噴火してでき、プレートに乗って運ばれながら、侵食と沈降で小さくなる。<br>
      島の列の向き＝プレートの動く向き（の逆に古くなる）。<b>距離 ÷ 年代 ＝ プレートの速さ</b>（いまは ${v} cm/年 ＝ ${v * 10} km/百万年）。${bend ? `列が「く」の字に曲がっているところ（約 ${change} 百万年前の島）で、プレートの動く向きが変わったとわかる（ハワイ諸島と天皇海山列）。` : ''}</div>`;
  };
  const A = animator((dt) => { now = Math.min(0, now + dt * 12); $('#hnow').value = Math.round(now); $('#hnow-v').textContent = now >= 0 ? '現在' : `${-Math.round(now)} 百万年前`; draw(); if (now >= 0) A.stop(); });
  bindSlider('hv', (x) => { v = x; draw(); }, ' cm/年');
  bindSlider('hnow', (x) => { now = x; draw(); }, '', (t) => t === 0 ? '現在' : `${-t} 百万年前`);
  $('#hbend').addEventListener('change', (ev) => { bend = ev.target.checked; draw(); });
  $('#hplay').addEventListener('click', () => { if (now >= 0) now = -span; A.start(); });
  draw();
  return A;
}

// ---------------------------------------------------------------- アイソスタシー
function isostasy(box) {
  let hMtn = 3, ice = 2, melt = 0;
  const rc = 2.7, rm = 3.3, ri = 0.9, crust = 30;
  box.innerHTML = `<div class="segment lab-sub" id="isub"><button data-t="mtn" class="on">山の根</button><button data-t="ice">氷床と隆起</button></div><div id="ibody"></div>`;
  const mtn = () => {
    $('#ibody').innerHTML = `${slider('imh', '山の高さ', 0, 8, 0.5, hMtn, ' km')}<div class="lab-fig" id="ifig"></div><div id="iread"></div>`;
    const draw = () => {
      const root = hMtn * rc / (rm - rc);
      const W = 520, H = 330, S = 4.2, sea = 50;
      const Y = (z) => sea - z * S;   // z：海面からの高さ（km、上が正）
      let g = `<rect width="${W}" height="${H}" fill="#eef5fb"/><rect y="${Y(0)}" width="${W}" height="${H}" fill="#e7b38a"/>`;
      g += `<rect x="40" y="${Y(0)}" width="140" height="${crust * S}" fill="#c9b79c" stroke="#6b5a45"/>`;
      g += `<rect x="300" y="${f1(Y(hMtn))}" width="140" height="${f1((hMtn + crust + root) * S)}" fill="#c9b79c" stroke="#6b5a45"/>`;
      g += `<path d="M300 ${f1(Y(hMtn))}l70 -14 70 14" fill="#b9a585" stroke="#6b5a45"/>`;
      const comp = -(crust + root) - 2;
      g += `<path d="M0 ${f1(Y(comp))}H${W}" stroke="#c0392b" stroke-dasharray="6 4"/><text x="${W - 6}" y="${f1(Y(comp) + 14)}" font-size="11" text-anchor="end" fill="#c0392b">補償面（ここでの圧力が等しい）</text>`;
      g += `<text x="110" y="${f1(Y(-crust / 2))}" font-size="12" text-anchor="middle">地殻 ${crust} km</text><text x="370" y="${f1(Y(-crust / 2))}" font-size="12" text-anchor="middle">地殻</text>`;
      g += `<path d="M452 ${f1(Y(-crust))}V${f1(Y(-crust - root))}" stroke="#333" marker-start="url(#iar)" marker-end="url(#iar)"/><text x="458" y="${f1(Y(-crust - root / 2) + 4)}" font-size="12" font-weight="700">山の根 ${f1(root)} km</text>`;
      g += `<text x="20" y="${H - 10}" font-size="12">マントル（密度 ${rm} g/cm³）　地殻 ${rc} g/cm³</text>`;
      $('#ifig').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="アイソスタシー：山の根" font-family="sans-serif"><defs><marker id="iar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${g}</svg>`;
      $('#iread').innerHTML = `<div class="panel small">補償面で、左の柱と右の柱の重さ（圧力）が等しい：<br>${rc}×${crust} + ${rm}×r ＝ ${rc}×(${hMtn} + ${crust} + r)　→　r ＝ ${hMtn}×${rc}/(${rm}−${rc}) ＝ <b>${f1(root)} km</b>。<br>高い山ほど、その下に深く地殻が沈みこんでいる（山の根）。山の高さの約 ${f1(rc / (rm - rc))} 倍。</div>`;
    };
    bindSlider('imh', (v) => { hMtn = v; draw(); }, ' km');
    draw();
  };
  const iceTab = () => {
    $('#ibody').innerHTML = `${slider('iice', '氷床の厚さ', 0, 3, 0.1, ice, ' km')}${slider('imelt', '氷がとけた割合', 0, 1, 0.05, melt, '', (v) => Math.round(v * 100) + '%')}<div class="lab-fig" id="ifig"></div><div id="iread"></div>`;
    const draw = () => {
      const iceNow = ice * (1 - melt);
      const sink = iceNow * ri / rm;
      const W = 520, H = 280, S = 40, base = 120;
      let g = `<rect width="${W}" height="${H}" fill="#eef5fb"/>`;
      const crustTop = base + sink * S, edgeTop = base;
      g += `<path d="M0 ${edgeTop}H120C170 ${edgeTop} 170 ${f1(crustTop)} 220 ${f1(crustTop)}H300C350 ${f1(crustTop)} 350 ${edgeTop} 400 ${edgeTop}H${W}V${base + 90}H0Z" fill="#c9b79c" stroke="#6b5a45"/>`;
      g += `<path d="M0 ${base + 90}H${W}V${H}H0Z" fill="#e7b38a"/>`;
      if (iceNow > 0.01) g += `<path d="M150 ${f1(crustTop - 2)}C180 ${f1(crustTop - iceNow * S)} 340 ${f1(crustTop - iceNow * S)} 370 ${f1(crustTop - 2)}Z" fill="#f4fbff" stroke="#8fb7d6"/>`;
      g += `<path d="M0 ${base}H${W}" stroke="#c0392b" stroke-dasharray="4 4"/><text x="6" y="${base - 4}" font-size="11" fill="#c0392b">氷がないときの地表</text>`;
      g += `<text x="260" y="${f1(crustTop + 20)}" font-size="12" text-anchor="middle">沈み ${f1(sink * 1000, 0)} m</text>`;
      $('#ifig').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="氷床の重さで地殻が沈む" font-family="sans-serif">${g}</svg>`;
      $('#iread').innerHTML = `<div class="panel small">氷の重さとつり合うまで地殻が沈む：沈む深さ ＝ 氷の厚さ × ${ri}/${rm} ＝ <b>${f1(sink * 1000, 0)} m</b>。<br>氷がとけると地殻はゆっくり隆起して元にもどる（後氷期の隆起。スカンジナビア半島やカナダでは今も隆起が続いている）。マントルは粘性が大きいので、隆起には数千〜1万年以上かかる。</div>`;
    };
    bindSlider('iice', (v) => { ice = v; draw(); }, ' km');
    bindSlider('imelt', (v) => { melt = v; draw(); }, '', (v) => Math.round(v * 100) + '%');
    draw();
  };
  $$('#isub button').forEach(b => b.addEventListener('click', () => { $$('#isub button').forEach(x => x.classList.toggle('on', x === b)); (b.dataset.t === 'mtn' ? mtn : iceTab)(); }));
  mtn();
  return { destroy() {} };
}

// ---------------------------------------------------------------- 放射年代
const ISO = [
  { id: 'c14', name: '¹⁴C → ¹⁴N', T: 5730, unit: '年', use: '数万年前までの生物の遺骸（木片・骨・貝殻）' },
  { id: 'k40', name: '⁴⁰K → ⁴⁰Ar', T: 1.25e9, unit: '年', use: '火山岩（数十万年〜数十億年）' },
  { id: 'u238', name: '²³⁸U → ²⁰⁶Pb', T: 4.47e9, unit: '年', use: 'ジルコンなど（古い岩石・いん石）' },
  { id: 'rb87', name: '⁸⁷Rb → ⁸⁷Sr', T: 4.9e10, unit: '年', use: '古い岩石・いん石' },
];
function radiometric(box) {
  let iso = 'c14', n = 1;   // n：経過時間（半減期の何倍か）
  box.innerHTML = `<div class="toggles" id="riso">${ISO.map(x => `<button class="tog ${x.id === iso ? 'on' : ''}" data-i="${x.id}">${x.name}</button>`).join('')}</div>
    ${slider('rn', '経過した時間', 0, 5, 0.05, n, '', (v) => `半減期の ${f1(v, 2)} 倍`)}
    <div class="ph-grid"><div class="lab-fig" id="rdots"></div><div class="lab-fig" id="rgraph"></div></div><div id="rread"></div>`;
  const fmt = (y) => y >= 1e8 ? `${f1(y / 1e8, 2)} 億年` : y >= 1e4 ? `${f1(y / 1e4, 2)} 万年` : `${Math.round(y)} 年`;
  const draw = () => {
    const I = ISO.find(x => x.id === iso);
    const P = Math.pow(0.5, n), D = 1 - P;
    // 100個の原子（減り方は決まった順に：毎回同じ並び）
    let g = '';
    const order = [...Array(100).keys()].sort((a, b) => ((a * 37) % 101) - ((b * 37) % 101));
    const decayed = new Set(order.slice(0, Math.round(D * 100)));
    for (let i = 0; i < 100; i++) { const x = 16 + (i % 10) * 24, y = 16 + Math.floor(i / 10) * 24; g += `<circle cx="${x}" cy="${y}" r="9" fill="${decayed.has(i) ? '#e9a23b' : '#3b74c4'}"/>`; }
    $('#rdots').innerHTML = `<svg viewBox="0 0 252 260" role="img" aria-label="親核種と娘核種の数" font-family="sans-serif">${g}<text x="6" y="256" font-size="11" fill="#3b74c4">● 親 ${Math.round(P * 100)}</text><text x="120" y="256" font-size="11" fill="#e9a23b">● 娘 ${Math.round(D * 100)}</text></svg>`;
    const W = 300, H = 260, L = 34, B = 30;
    const X = (t) => L + t / 5 * (W - L - 8), Y = (f) => H - B - f * (H - B - 12);
    let c = '';
    for (let k = 0; k <= 5; k++) c += `<path d="M${X(k)} 12V${H - B}" stroke="#eee"/><text x="${X(k)}" y="${H - B + 13}" font-size="10" text-anchor="middle" fill="#666">${k}</text>`;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) c += `<path d="M${L} ${Y(f)}H${W - 8}" stroke="#eee"/><text x="${L - 4}" y="${Y(f) + 4}" font-size="10" text-anchor="end" fill="#666">${f}</text>`;
    let pp = '', dd = '';
    for (let i = 0; i <= 100; i++) { const t = i / 20; pp += `${i ? 'L' : 'M'}${f1(X(t))} ${f1(Y(Math.pow(0.5, t)))}`; dd += `${i ? 'L' : 'M'}${f1(X(t))} ${f1(Y(1 - Math.pow(0.5, t)))}`; }
    c += `<path d="${pp}" fill="none" stroke="#3b74c4" stroke-width="2"/><path d="${dd}" fill="none" stroke="#e9a23b" stroke-width="2"/><path d="M${f1(X(n))} 12V${H - B}" stroke="#c0392b" stroke-dasharray="4 3"/>`;
    c += `<text x="${(L + W) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="#333">経過時間（半減期の何倍か）</text>`;
    $('#rgraph').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="親核種と娘核種の割合の変化" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${c}</svg>`;
    $('#rread').innerHTML = `<div class="panel small">${I.name}（半減期 ${fmt(I.T)}）：${e(I.use)}。<br>
      いま 親：娘 ＝ ${f1(P * 100, 0)}：${f1(D * 100, 0)}。親の割合 (1/2)<sup>t/T</sup> ＝ ${f1(P, 3)} なので、t ＝ ${f1(n, 2)} T ＝ <b>${fmt(n * I.T)}</b>。<br>
      娘核種の量 D と親核種の量 P から：t ＝ T × log₂(1 + D/P)（はじめに娘核種がなかったとき）。</div>`;
  };
  bindSlider('rn', (v) => { n = v; draw(); }, '', (v) => `半減期の ${f1(v, 2)} 倍`);
  $$('#riso .tog').forEach(b => b.addEventListener('click', () => { iso = b.dataset.i; $$('#riso .tog').forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  draw();
  return { destroy() {} };
}
