// 天体・宇宙の可視化：天球と日周運動・惑星の見え方・月の満ち欠け・ケプラーの法則・HR図
import { C, Z, $, $$, e, f1, head, tabs, bindTabs, probButton, done, slider, bindSlider, animator } from './common.js';
import { hrSVG, hrFrame, starColor } from './model/charts.js';

export const FILE_VERSION = '0.1.1';

const SKY = [['sphere', '天球'], ['planets', '惑星'], ['moon', '月'], ['kepler', 'ケプラー'], ['hr', 'HR図']];
const D2R = Math.PI / 180;

export function skyPage(view, key) {
  let anim = null;
  const mode = SKY.some(s => s[0] === key) ? key : (C.prefs.skyMode || 'sphere');
  view.innerHTML = `<div class="fade-in lab-sky">${head('天体・宇宙の可視化', '宇宙', '天体の位置関係を動かして、地球からの見え方とつなげます。')}
    ${tabs('skymode', SKY, mode)}
    <div id="skybody"></div><div id="skyprob"></div>
  </div>`;
  const draw = (m) => {
    if (anim) anim.destroy();
    C.prefs.skyMode = m; C.save();
    anim = ({ sphere, planets, moon, kepler, hr })[m]($('#skybody'));
    $('#skyprob').innerHTML = probButton('sky', m, 'この内容の問題を解く');
    done($('#skyprob'));
  };
  bindTabs('skymode', draw);
  draw(mode);
  done(view);
  return { destroy() { if (anim) anim.destroy(); } };
}

// ---------------------------------------------------------------- 天球と日周運動
// 地平座標（東 E・北 N・天頂 U）。時角 H（南中で 0、西へ増える）、赤緯 δ、緯度 φ
export function horizonVec(phi, dec, H) {
  const p = phi * D2R, d = dec * D2R, h = H * D2R;
  const P = [0, Math.cos(p), Math.sin(p)], M = [0, -Math.sin(p), Math.cos(p)], W = [-1, 0, 0];
  return [0, 1, 2].map(i => Math.cos(d) * (Math.cos(h) * M[i] + Math.sin(h) * W[i]) + Math.sin(d) * P[i]);
}
export function riseSet(phi, dec) {
  const c = -Math.tan(phi * D2R) * Math.tan(dec * D2R);
  if (c <= -1) return { always: true };
  if (c >= 1) return { never: true };
  return { H0: Math.acos(c) / D2R };
}
function sphere(box) {
  let phi = C.prefs.skyLat ?? 35, obj = 'sun-summer', dec = 23.4, H = -60;
  const O = Z.sky.objects;
  box.innerHTML = `${slider('sphi', '観測地の緯度', -60, 90, 1, phi, '°', (v) => v >= 0 ? `北緯 ${v}` : `南緯 ${-v}`)}
    <div class="toggles" id="sobj">${O.map(o => `<button class="tog ${o.id === obj ? 'on' : ''}" data-o="${o.id}">${e(o.name)}</button>`).join('')}</div>
    ${slider('sdec', '赤緯', -90, 90, 0.1, dec, '°')}
    ${slider('sH', '時刻（時角）', -180, 180, 1, H, '', (v) => v === 0 ? '南中' : v < 0 ? `南中の ${f1(-v / 15)} 時間前` : `南中の ${f1(v / 15)} 時間後`)}
    <div class="btn-row"><button class="btn primary" id="splay">1日を再生</button></div>
    <div class="lab-fig" id="sfig"></div><div id="sread"></div>`;
  // 斜めから見た投影
  const az = 205 * D2R, el = 20 * D2R;
  const cam = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
  const v = cam.map(x => -x);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const L = Math.hypot(...a); return a.map(x => x / L); };
  const right = norm(cross(v, [0, 0, 1])), up = cross(right, v);
  const R = 150, cx = 260, cy = 185;
  const P = (p) => [cx + R * (p[0] * right[0] + p[1] * right[1] + p[2] * right[2]), cy - R * (p[0] * up[0] + p[1] * up[1] + p[2] * up[2])];
  const depth = (p) => p[0] * cam[0] + p[1] * cam[1] + p[2] * cam[2];   // 大きいほど手前
  const curve = (pts, col, w = 1.6, fillBelow = true) => {
    let out = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const below = (a[2] + b[2]) / 2 < 0, back = (depth(a) + depth(b)) / 2 < 0;
      const [x1, y1] = P(a), [x2, y2] = P(b);
      out += `<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="${col}" stroke-width="${w}" ${below && fillBelow ? 'stroke-dasharray="3 3" opacity=".55"' : back ? 'opacity=".55"' : ''}/>`;
    }
    return out;
  };
  const draw = () => {
    let g = `<rect width="520" height="380" fill="#0f1b2d"/>`;
    // 地平面
    const hz = [...Array(73)].map((_, i) => [Math.cos(i * 5 * D2R), Math.sin(i * 5 * D2R), 0]);
    g += `<path d="M${hz.map(p => P(p).map(n => f1(n)).join(' ')).join('L')}Z" fill="#2e4a2b" fill-opacity=".55" stroke="#8fbf7a"/>`;
    // 天球の輪郭
    g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#3d5576"/>`;
    // 子午線・天の赤道・日周円
    const mer = [...Array(73)].map((_, i) => { const t = i * 5 * D2R; return [0, Math.cos(t), Math.sin(t)]; });
    g += curve(mer, '#5f7aa3', 1, false);
    const eq = [...Array(73)].map((_, i) => horizonVec(phi, 0, i * 5));
    g += curve(eq, '#c08ad6', 1.4);
    const dc = [...Array(73)].map((_, i) => horizonVec(phi, dec, i * 5 - 180));
    g += curve(dc, '#f6c94f', 2.4);
    // 天の北極と地軸
    const pole = horizonVec(phi, 90, 0), sp = pole.map(x => -x);
    g += `<path d="M${P(sp).map(f1).join(' ')}L${P(pole).map(f1).join(' ')}" stroke="#9fb6d6" stroke-dasharray="5 4"/>`;
    g += `<circle cx="${f1(P(pole)[0])}" cy="${f1(P(pole)[1])}" r="3" fill="#fff"/><text x="${f1(P(pole)[0] + 6)}" y="${f1(P(pole)[1] - 4)}" font-size="11" fill="#dfe8f5">天の北極</text>`;
    const lab = (p, s, col = '#dfe8f5') => { const [x, y] = P(p); return `<text x="${f1(x)}" y="${f1(y + 4)}" font-size="13" font-weight="700" text-anchor="middle" fill="${col}">${s}</text>`; };
    g += lab([0, -1.12, 0], '南') + lab([0, 1.12, 0], '北') + lab([1.12, 0, 0], '東') + lab([-1.12, 0, 0], '西') + lab([0, 0, 1.08], '天頂', '#9fb6d6');
    // 観測者
    g += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#fff"/>`;
    // 天体
    const s = horizonVec(phi, dec, H);
    const [sx, sy] = P(s);
    const isSun = obj.startsWith('sun');
    g += `<path d="M${cx} ${cy}L${f1(sx)} ${f1(sy)}" stroke="#ffffff55"/>`;
    g += `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${isSun ? 10 : 6}" fill="${isSun ? '#ffb43a' : '#fff'}" stroke="#fff" ${s[2] < 0 ? 'opacity=".45"' : ''}/>`;
    $('#sfig').innerHTML = `<svg viewBox="0 0 520 380" role="img" aria-label="天球と天体の日周運動（黄：天体の通り道、紫：天の赤道）" font-family="sans-serif">${g}</svg>`;
    const alt = Math.asin(s[2]) / D2R;
    const azi = (Math.atan2(s[0], s[1]) / D2R + 360) % 360;
    const culm = 90 - Math.abs(phi - dec);
    const rs = riseSet(phi, dec);
    const dir = (a) => ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'][Math.round(a / 22.5) % 16];
    $('#sread').innerHTML = `<div class="panel small">
      いま：高度 <b>${f1(alt)}°</b>・方位 ${dir(azi)}（${f1(azi, 0)}°）<br>
      南中高度：90° − ${phi}° + (${f1(dec)}°) ＝ <b>${f1(culm)}°</b>（${phi - dec >= 0 ? '南' : '北'}の空）<br>
      ${rs.always ? '一日じゅう沈まない（周極星）。赤緯 ≧ 90° − 緯度。' : rs.never ? '一日じゅう地平線の下（のぼらない）。' : `地平線の上にいる時間：<b>${f1(2 * rs.H0 / 15)} 時間</b>（cos H₀ ＝ −tanφ tanδ）。出る方位は真東から${dec > 0 ? '北' : dec < 0 ? '南' : ''}${dec === 0 ? '（真東）' : 'へずれる'}。`}
      ${isSun ? '<br>太陽の赤緯は季節で −23.4°〜＋23.4° に変わる（地軸の傾き）。夏至には南中高度が高く、昼が長い。' : ''}</div>`;
  };
  const A = animator((dt) => { H += dt * 60; if (H > 180) H = -180; $('#sH').value = Math.round(H); $('#sH-v').textContent = Math.round(H) === 0 ? '南中' : H < 0 ? `南中の ${f1(-H / 15)} 時間前` : `南中の ${f1(H / 15)} 時間後`; draw(); });
  bindSlider('sphi', (x) => { phi = x; C.prefs.skyLat = x; C.save(); draw(); }, '°', (v) => v >= 0 ? `北緯 ${v}` : `南緯 ${-v}`);
  const setDec = (x) => { dec = x; $('#sdec').value = x; $('#sdec-v').textContent = x + '°'; };
  bindSlider('sdec', (x) => { dec = x; obj = null; $$('#sobj .tog').forEach(b => b.classList.remove('on')); draw(); }, '°');
  bindSlider('sH', (x) => { H = x; draw(); }, '', (v) => v === 0 ? '南中' : v < 0 ? `南中の ${f1(-v / 15)} 時間前` : `南中の ${f1(v / 15)} 時間後`);
  $$('#sobj .tog').forEach(b => b.addEventListener('click', () => { obj = b.dataset.o; setDec(O.find(o => o.id === obj).dec); $$('#sobj .tog').forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  $('#splay').addEventListener('click', () => (A.running ? A.stop() : A.start()));
  draw();
  return A;
}

// ---------------------------------------------------------------- 惑星の見え方
function planets(box) {
  const PL = Z.sky.planets.filter(p => p.id !== 'earth');
  let pid = C.prefs.skyPlanet || 'venus', t = 0;
  box.innerHTML = `<div class="toggles" id="ppl">${PL.map(p => `<button class="tog ${p.id === pid ? 'on' : ''}" data-p="${p.id}">${e(p.name)}</button>`).join('')}</div>
    ${slider('pt', '時間', 0, 4, 0.005, t, ' 年', (v) => f1(v, 2))}
    <div class="btn-row"><button class="btn primary" id="pplay">再生</button></div>
    <div class="ph-grid"><div class="lab-fig sq" id="ptop"></div><div class="lab-fig" id="pview"></div></div><div id="pread"></div>`;
  const draw = () => {
    const p = PL.find(x => x.id === pid);
    const inner = p.a < 1;
    const sc = 130 / Math.max(1, p.a);
    const ang = (P, a0 = 0) => 2 * Math.PI * t / P + a0;
    const ae = ang(1, Math.PI / 2), ap = ang(p.P, Math.PI / 2 + (inner ? 0.9 : -0.5));
    const E = [Math.cos(ae), Math.sin(ae)], Pp = [p.a * Math.cos(ap), p.a * Math.sin(ap)];
    const T = (v) => [160 + v[0] * sc, 160 - v[1] * sc];
    let g = `<rect width="320" height="320" fill="#0f1b2d"/>`;
    g += `<circle cx="160" cy="160" r="${f1(sc)}" fill="none" stroke="#4d6a92"/><circle cx="160" cy="160" r="${f1(p.a * sc)}" fill="none" stroke="#8a6db0"/>`;
    g += `<circle cx="160" cy="160" r="9" fill="#ffb43a"/>`;
    const [ex, ey] = T(E), [px, py] = T(Pp);
    g += `<path d="M${f1(ex)} ${f1(ey)}L160 160" stroke="#ffb43a66"/><path d="M${f1(ex)} ${f1(ey)}L${f1(px)} ${f1(py)}" stroke="#ffffff88" stroke-dasharray="3 3"/>`;
    g += `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="6" fill="#4ea3ff"/><text x="${f1(ex + 8)}" y="${f1(ey - 6)}" font-size="11" fill="#cfe3ff">地球</text>`;
    g += `<circle cx="${f1(px)}" cy="${f1(py)}" r="5" fill="#e6d3a3"/><text x="${f1(px + 8)}" y="${f1(py - 6)}" font-size="11" fill="#f2e6c9">${e(p.name)}</text>`;
    g += `<text x="6" y="314" font-size="10" fill="#8aa">北極側から見た図（反時計回りに公転）</text>`;
    $('#ptop').innerHTML = `<svg viewBox="0 0 320 320" role="img" aria-label="太陽・地球・惑星の位置（上から見た図）" font-family="sans-serif">${g}</svg>`;
    // 地球から見た方向：太陽との角（東が正）
    const toS = [-E[0], -E[1]], toP = [Pp[0] - E[0], Pp[1] - E[1]];
    const cr = toS[0] * toP[1] - toS[1] * toP[0], dt2 = toS[0] * toP[0] + toS[1] * toP[1];
    const elong = Math.atan2(cr, dt2) / D2R;   // 正：太陽の東
    const dist = Math.hypot(...toP);
    // 位相（太陽−惑星−地球の角）
    const pS = [-Pp[0], -Pp[1]], pE = [E[0] - Pp[0], E[1] - Pp[1]];
    const phase = Math.acos((pS[0] * pE[0] + pS[1] * pE[1]) / (Math.hypot(...pS) * Math.hypot(...pE))) / D2R;
    const lit = (1 + Math.cos(phase * D2R)) / 2;
    let name = '';
    const ae2 = Math.abs(elong);
    if (inner) {
      const maxE = Math.asin(p.a) / D2R;
      if (ae2 < 4) name = dist < 1 ? '内合' : '外合';
      else if (ae2 > maxE - 1.5) name = elong > 0 ? '東方最大離角' : '西方最大離角';
    } else {
      if (ae2 < 4) name = '合'; else if (ae2 > 176) name = '衝'; else if (Math.abs(ae2 - 90) < 2) name = elong > 0 ? '東矩' : '西矩';
    }
    // 見え方：位相と大きさ
    const r = Math.min(70, 18 / dist * (p.R / 0.95) ** 0.35);
    const k = -Math.cos(phase * D2R);   // 明暗境界の楕円の幅（正：三日月形、負：半月より太い）
    const sideL = elong > 0 ? 1 : 0;    // 太陽の東にあれば、太陽は西（右）側にあるので右側が光る
    const discPath = `M150 ${f1(110 - r)}A${f1(r)} ${f1(r)} 0 0 ${sideL} 150 ${f1(110 + r)}A${f1(Math.abs(k) * r)} ${f1(r)} 0 0 ${k > 0 ? 1 - sideL : sideL} 150 ${f1(110 - r)}Z`;
    let vg = `<rect width="300" height="230" fill="#0f1b2d"/><circle cx="150" cy="110" r="${f1(r)}" fill="#2a3446"/><path d="${discPath}" fill="#f0e2b6"/>`;
    vg += `<text x="150" y="214" font-size="12" text-anchor="middle" fill="#dfe8f5">${e(p.name)}の見え方（望遠鏡、${elong > 0 ? '太陽は右（西）側' : '太陽は左（東）側'}）</text>`;
    $('#pview').innerHTML = `<svg viewBox="0 0 300 230" role="img" aria-label="地球から見た惑星の形と大きさ" font-family="sans-serif">${vg}</svg>`;
    const S = 1 / Math.abs(1 - 1 / p.P);
    const when = inner ? (ae2 < 4 ? '太陽と同じ方向で見えない' : elong > 0 ? '夕方、西の空（宵の明星）' : '明け方、東の空（明けの明星）')
      : (ae2 > 150 ? '真夜中に南中し、一晩じゅう見える' : elong > 0 ? '夕方〜宵の空' : '明け方の空');
    $('#pread').innerHTML = `<div class="panel small">
      太陽からの角距離（離角）：<b>${f1(ae2, 0)}°</b>（太陽の${elong > 0 ? '東' : '西'}）${name ? `　<b class="tag-name">${name}</b>` : ''}　見え方：${when}<br>
      地球からの距離 ${f1(dist, 2)} 天文単位、光って見える割合 ${Math.round(lit * 100)}%。${inner ? `最大離角は sin θ ＝ ${p.a} より <b>${f1(Math.asin(p.a) / D2R)}°</b>。` : ''}<br>
      公転周期 ${p.P} 年、会合周期 S：1/S ＝ |1/1 − 1/${p.P}| より <b>S ＝ ${f1(S, 2)} 年</b>（${Math.round(S * 365)} 日）。</div>`;
  };
  const A = animator((dt) => { t += dt * 0.15; if (t > 4) t = 0; $('#pt').value = t; $('#pt-v').textContent = f1(t, 2) + ' 年'; draw(); });
  bindSlider('pt', (v) => { t = v; draw(); }, ' 年', (v) => f1(v, 2));
  $$('#ppl .tog').forEach(b => b.addEventListener('click', () => { pid = b.dataset.p; C.prefs.skyPlanet = pid; C.save(); $$('#ppl .tog').forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  $('#pplay').addEventListener('click', () => (A.running ? A.stop() : A.start()));
  draw();
  return A;
}

// ---------------------------------------------------------------- 月の満ち欠け
function moon(box) {
  let age = 7.4;
  const SYN = 29.53;
  box.innerHTML = `${slider('mage', '月齢', 0, 29.5, 0.1, age, ' 日', (v) => f1(v))}
    <div class="ph-grid"><div class="lab-fig sq" id="mtop"></div><div class="lab-fig" id="mview"></div></div><div id="mread"></div>`;
  const draw = () => {
    const th = age / SYN * 2 * Math.PI;      // 太陽方向（右）から反時計回り
    let g = `<rect width="320" height="320" fill="#0f1b2d"/>`;
    for (let y = 30; y < 320; y += 40) g += `<path d="M318 ${y}h-40" stroke="#ffb43a88" marker-end="url(#mar)"/>`;
    g += `<text x="314" y="16" font-size="10" text-anchor="end" fill="#ffcf7a">太陽の光 ←</text>`;
    g += `<circle cx="150" cy="160" r="110" fill="none" stroke="#4d6a92" stroke-dasharray="3 4"/>`;
    g += `<circle cx="150" cy="160" r="22" fill="#2b5c99"/><path d="M150 138A22 22 0 0 1 150 182Z" fill="#4ea3ff"/>`;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 2 * Math.PI, x = 150 + 110 * Math.cos(a), y = 160 - 110 * Math.sin(a);
      g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="7" fill="#333a48"/><path d="M${f1(x)} ${f1(y - 7)}A7 7 0 0 1 ${f1(x)} ${f1(y + 7)}Z" fill="#cfd3da" opacity=".35"/>`;
    }
    const mx = 150 + 110 * Math.cos(th), my = 160 - 110 * Math.sin(th);
    g += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="11" fill="#333a48" stroke="#fff"/><path d="M${f1(mx)} ${f1(my - 11)}A11 11 0 0 1 ${f1(mx)} ${f1(my + 11)}Z" fill="#f0e2b6"/>`;
    g += `<text x="150" y="312" font-size="10" text-anchor="middle" fill="#8aa">北極側から見た図（月は反時計回り）</text>`;
    $('#mtop').innerHTML = `<svg viewBox="0 0 320 320" role="img" aria-label="太陽・地球・月の位置" font-family="sans-serif"><defs><marker id="mar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffb43a"/></marker></defs>${g}</svg>`;
    // 見え方（北半球で南の空を見たとき：右が西）
    const ph = th;   // 0：新月、π：満月
    const k = Math.cos(ph);
    const r = 70, cx = 150, cy = 105;
    const waxing = age < SYN / 2;
    const side = waxing ? 1 : 0;     // 満ちていくときは右（西）側が光る
    const d = `M${cx} ${cy - r}A${r} ${r} 0 0 ${side} ${cx} ${cy + r}A${f1(Math.abs(k) * r)} ${r} 0 0 ${k > 0 ? 1 - side : side} ${cx} ${cy - r}Z`;
    $('#mview').innerHTML = `<svg viewBox="0 0 300 230" role="img" aria-label="地球から見た月の形" font-family="sans-serif"><rect width="300" height="230" fill="#0f1b2d"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#262d3a"/><path d="${d}" fill="#f0e2b6"/><text x="150" y="214" font-size="12" text-anchor="middle" fill="#dfe8f5">南の空で見た形（右が西）</text></svg>`;
    const names = [[0.6, '新月'], [2.5, '三日月のころ'], [6.4, '（上弦に向かう）'], [8.4, '上弦の月'], [13.5, '（満月に向かう）'], [16, '満月'], [21.1, '（下弦に向かう）'], [23.1, '下弦の月'], [28.8, '（新月に向かう）'], [29.6, '新月']];
    const nm = (names.find(([a]) => age <= a) || names[names.length - 1])[1];
    const south = (12 + age / SYN * 24) % 24;
    const fmtH = (h) => `${Math.floor(h)}時${String(Math.round((h % 1) * 60)).padStart(2, '0')}分ごろ`;
    $('#mread').innerHTML = `<div class="panel small">月齢 ${f1(age)}：<b>${nm}</b>（光って見える割合 ${Math.round((1 - k) / 2 * 100)}%）<br>
      南中する時刻：<b>${fmtH(south)}</b>、月の出 ${fmtH((south + 18) % 24)}、月の入り ${fmtH((south + 6) % 24)}（月は毎日約50分ずつ遅れて南中する）<br>
      ${age < 1 || age > 28.5 ? '新月：月が太陽と同じ方向。月が太陽の前を通ると日食。' : Math.abs(age - SYN / 2) < 1 ? '満月：月が太陽と反対方向。月が地球の影に入ると月食。' : ''}
      <span class="muted">月の公転面は地球の公転面に約5°傾いているので、新月・満月のたびに日食・月食が起こるわけではない。</span></div>`;
  };
  bindSlider('mage', (v) => { age = v; draw(); }, ' 日', (v) => f1(v));
  draw();
  return { destroy() {} };
}

// ---------------------------------------------------------------- ケプラーの法則
function kepler(box) {
  let ecc = 0.5, M = 0, sectors = 12;
  box.innerHTML = `${slider('ke', '離心率 e', 0, 0.9, 0.01, ecc, '', (v) => f1(v, 2))}
    <div class="btn-row"><button class="btn primary" id="kplay">再生</button></div>
    <div class="lab-fig" id="kfig"></div><div id="kread"></div><div id="ktab"></div>`;
  const solve = (Mm, e2) => { let E = Mm; for (let i = 0; i < 30; i++) E -= (E - e2 * Math.sin(E) - Mm) / (1 - e2 * Math.cos(E)); return E; };
  const pos = (Mm) => { const E = solve(Mm, ecc); return [Math.cos(E) - ecc, Math.sqrt(1 - ecc * ecc) * Math.sin(E)]; };   // 太陽が原点、a = 1
  const draw = () => {
    const sc = 140, cx = 250 + ecc * sc, cy = 160;
    const T = (p) => [cx + p[0] * sc, cy - p[1] * sc];
    let g = `<rect width="520" height="320" fill="#0f1b2d"/>`;
    // 等しい時間の扇形
    for (let s = 0; s < sectors; s++) {
      let d = `M${cx} ${cy}`;
      for (let i = 0; i <= 20; i++) { const [x, y] = T(pos(2 * Math.PI * (s + i / 20) / sectors)); d += `L${f1(x)} ${f1(y)}`; }
      g += `<path d="${d}Z" fill="${s % 2 ? '#3b5b8a' : '#2c4568'}" stroke="#5f7aa3" stroke-width=".5"/>`;
    }
    g += `<ellipse cx="${f1(cx - ecc * sc)}" cy="${cy}" rx="${sc}" ry="${f1(sc * Math.sqrt(1 - ecc * ecc))}" fill="none" stroke="#9fb6d6"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="9" fill="#ffb43a"/><circle cx="${f1(cx - 2 * ecc * sc)}" cy="${cy}" r="2.5" fill="#9fb6d6"/>`;
    const [px, py] = T(pos(M));
    g += `<path d="M${cx} ${cy}L${f1(px)} ${f1(py)}" stroke="#fff8"/><circle cx="${f1(px)}" cy="${f1(py)}" r="7" fill="#4ea3ff"/>`;
    g += `<text x="${f1(cx + (1 - ecc) * sc + 6)}" y="${cy - 6}" font-size="11" fill="#dfe8f5">近日点</text><text x="${f1(cx - (1 + ecc) * sc - 6)}" y="${cy - 6}" font-size="11" text-anchor="end" fill="#dfe8f5">遠日点</text>`;
    g += `<text x="10" y="310" font-size="10" fill="#8aa">色分けした扇形は、どれも同じ時間（周期の 1/${sectors}）に惑星が掃く部分。面積はすべて等しい。</text>`;
    $('#kfig').innerHTML = `<svg viewBox="0 0 520 320" role="img" aria-label="ケプラーの第1・第2法則" font-family="sans-serif">${g}</svg>`;
    $('#kread').innerHTML = `<div class="panel small">第1法則：太陽は楕円の焦点の1つにある。近日点距離 a(1−e) ＝ ${f1(1 - ecc, 2)}a、遠日点距離 a(1+e) ＝ ${f1(1 + ecc, 2)}a。<br>
      第2法則（面積速度一定）：近日点での速さ ÷ 遠日点での速さ ＝ (1+e)/(1−e) ＝ <b>${f1((1 + ecc) / (1 - ecc), 2)}</b> 倍。太陽に近いほど速く動く。</div>`;
  };
  $('#ktab').innerHTML = `<h2>第3法則：P² ÷ a³</h2><table class="ph-table"><thead><tr><th>惑星</th><th>a [天文単位]</th><th>P [年]</th><th>P² ÷ a³</th></tr></thead><tbody>${Z.sky.planets.map(p => `<tr><th>${e(p.name)}</th><td>${p.a}</td><td>${p.P}</td><td>${f1(p.P * p.P / p.a ** 3, 3)}</td></tr>`).join('')}</tbody></table><p class="muted small">太陽のまわりを回るどの惑星でも P²/a³ ≒ 1（年・天文単位で表したとき）。</p>`;
  const A = animator((dt) => { M = (M + dt * 1.2) % (2 * Math.PI); draw(); });
  bindSlider('ke', (v) => { ecc = v; draw(); }, '', (v) => f1(v, 2));
  $('#kplay').addEventListener('click', () => (A.running ? A.stop() : A.start()));
  draw();
  A.start();
  return A;
}

// ---------------------------------------------------------------- HR図
function hr(box) {
  const S = Z.sky.stars;
  let sel = 'sun', R = 1, T = 5772, track = false;
  box.innerHTML = `<div class="lab-fig" id="hfig"></div>
    <div class="btn-row"><button class="btn" id="htrack">太陽程度の星の一生をかく</button></div>
    <div id="hdet"></div>
    <h2>半径と表面温度から光度を求める</h2>
    ${slider('hR', '半径（太陽 = 1）', -2, 3, 0.05, 0, '', (v) => f1(10 ** v, v < 0 ? 3 : 1))}
    ${slider('hT', '表面温度', 2500, 30000, 100, T, ' K')}
    <div id="hcalc"></div>`;
  const draw = () => {
    let svg = hrSVG(S, { ids: ['sun', 'sirius-a', 'sirius-b', 'betelgeuse', 'rigel', 'antares', 'spica', 'aldebaran', 'procyon-b', 'proxima', 'vega', 'deneb'], alt: 'HR図' });
    const F = hrFrame();
    const L = R * R * (T / 5772) ** 4;
    let extra = `<circle cx="${f1(F.X(T))}" cy="${f1(F.Y(L))}" r="7" fill="none" stroke="#c0392b" stroke-width="2.5"/>`;
    if (track) {
      const pts = [[4000, 3], [5772, 1], [5000, 2.5], [4500, 30], [4200, 2000], [8000, 3000], [60000, 600], [40000, 1], [20000, 0.01]];
      extra += `<path d="M${pts.map(([t, l]) => f1(F.X(Math.min(t, 39000))) + ' ' + f1(F.Y(l))).join('L')}" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="5 3" marker-end="url(#htar)"/>`;
      extra += `<text x="${f1(F.X(4000))}" y="${f1(F.Y(3) + 14)}" font-size="10" fill="#c0392b">原始星</text><text x="${f1(F.X(4200) + 6)}" y="${f1(F.Y(2000))}" font-size="10" fill="#c0392b">赤色巨星</text><text x="${f1(F.X(20000))}" y="${f1(F.Y(0.01) + 14)}" font-size="10" fill="#c0392b">白色矮星</text>`;
    }
    svg = svg.replace('</svg>', `<defs><marker id="htar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c0392b"/></marker></defs>${extra}</svg>`);
    $('#hfig').innerHTML = svg;
    $$('#hfig [data-star]').forEach(c => { c.style.cursor = 'pointer'; c.addEventListener('click', () => { sel = c.dataset.star; detail(); }); });
    $('#hcalc').innerHTML = `<div class="panel small">L ＝ 4πR²σT⁴ より、太陽を1とすると L ＝ R² × (T / 5772)⁴ ＝ ${f1(R, 3)}² × (${T} / 5772)⁴ ＝ <b>${L >= 100 ? Math.round(L).toLocaleString() : L >= 0.01 ? f1(L, 3) : L.toExponential(2)}</b>（赤い○）</div>`;
  };
  const detail = () => {
    const s = S.find(x => x.id === sel);
    const Rr = Math.sqrt(s.L) / (s.T / 5772) ** 2;
    $('#hdet').innerHTML = `<div class="panel zk-detail"><div class="zk-dhead"><span class="star-dot" style="background:${starColor(s.T)}"></span>${e(s.name)}</div>
      <div class="small">${e(s.cls)}・スペクトル型 ${e(s.sp)}・表面温度 約 ${s.T.toLocaleString()} K・光度 約 ${s.L >= 1 ? s.L.toLocaleString() : s.L} 倍・絶対等級 ${s.M} 等${s.ly > 0.001 ? `・距離 約 ${s.ly.toLocaleString()} 光年` : ''}</div>
      <div class="small">半径は L ＝ R²T⁴ から 約 <b>${Rr >= 10 ? Math.round(Rr) : f1(Rr, Rr < 0.1 ? 3 : 2)}</b> 倍（太陽 = 1）</div></div>`;
  };
  bindSlider('hR', (v) => { R = 10 ** v; draw(); }, '', (v) => f1(10 ** v, v < 0 ? 3 : 1));
  bindSlider('hT', (v) => { T = v; draw(); }, ' K');
  $('#htrack').addEventListener('click', () => { track = !track; draw(); });
  draw(); detail();
  return { destroy() {} };
}
