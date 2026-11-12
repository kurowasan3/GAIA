// 探究のモデル（js/lab/model/）の単体テスト：ブラウザなしで、地学として正しい結果になるか
//   node tests/lab.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ST from '../js/lab/model/strata.js';
import * as MP from '../js/lab/model/maps.js';
import * as SP from '../js/lab/model/specimens.js';
import * as CH from '../js/lab/model/charts.js';
import { horizonVec, riseSet } from '../js/lab/sky.js';
import { columnsHistory } from '../js/lab/strata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = (n) => JSON.parse(fs.readFileSync(path.join(root, 'content/geo', n + '.json'), 'utf8'));
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- 地層：堆積は下から順、断層は上盤を動かす、侵食で空になる、貫入はまわりを変成させる
{
  const ev = [{ t: 'dep', layers: [{ m: 'sand', h: 10, label: 'A' }, { m: 'mud', h: 10, label: 'B' }] }];
  const s = ST.simulate(ev, 40, 40);
  const at = (x, y) => s.units[s.g[y * 40 + x]].label;
  ok(at(5, 2) === 'A' && at(5, 15) === 'B' && s.g[25 * 40 + 5] === 0, '堆積：下に A、上に B、その上は空気');
  const f = ST.simulate([...ev, { t: 'fault', x0: 20, dip: 90 - 1e-6, throw: 5, kind: 'normal', toward: 1 }], 40, 40);
  // 鉛直に近い断層：上盤（右側）が 5 マス下がるので、高さ 8 では左が A、右が B
  ok(f.units[f.g[8 * 40 + 30]].label === 'B' && f.units[f.g[8 * 40 + 5]].label === 'A', '正断層：上盤が下がる');
  const r = ST.simulate([...ev, { t: 'fault', x0: 20, dip: 90 - 1e-6, throw: 5, kind: 'reverse', toward: 1 }], 40, 40);
  ok(r.units[r.g[12 * 40 + 30]].label === 'A' && r.units[r.g[12 * 40 + 5]].label === 'B', '逆断層：上盤が上がる');
  const e = ST.simulate([...ev, { t: 'ero', level: 12 }], 40, 40);
  ok(e.g[13 * 40 + 5] === 0 && e.g[11 * 40 + 5] !== 0, '侵食：基準より上が削られる');
  const t = ST.simulate([...ev, { t: 'tilt', deg: 20 }], 40, 40);
  const top = (x) => { for (let y = 0; y < 40; y++) if (t.units[t.g[y * 40 + x]].label === 'B') return y; return -1; };
  ok(top(35) > top(5), '傾動（反時計回り）：右側が持ち上がる');
  const p = ST.simulate([{ t: 'dep', layers: [{ m: 'mud', h: 30 }, { m: 'lime', h: 10 }] }, { t: 'pluton', cx: 20, cy: 0, rx: 10, ry: 12, aureole: 3 }], 40, 40);
  const mats = new Set([...p.g].map(u => p.units[u].m));
  ok(mats.has('granite') && mats.has('horn') && !mats.has('marble'), '接触変成：泥岩はホルンフェルスに（離れた石灰岩はそのまま）');
}
// ---- 地史の型：どの型・どの乱数でも作れて、できごとの説明がそろう。切断の関係が断面に残る
for (const tpl of Object.keys(ST.TEMPLATES)) for (const seed of [1, 2, 3, 4, 5]) {
  const h = ST.makeHistory(tpl, seed);
  const s = ST.simulate(h.events, h.W, h.H);
  const labels = new Set([...s.g].filter(Boolean).map(u => s.units[u].label).filter(Boolean));
  const d = ST.describe(h.events);
  ok(d.length === h.events.filter(e => !e.final).length && d.length >= 4, `${tpl}/${seed}：できごとの説明`);
  ok(labels.has('A') && labels.size >= 5, `${tpl}/${seed}：断面に地層が見える（${[...labels]}）`);
  const svg = ST.strataSVG(s, { idp: 't' });
  ok(svg.startsWith('<svg') && svg.length < 200000, `${tpl}/${seed}：SVG の大きさ ${svg.length}`);
  if (tpl === 'dike-fault' || tpl === 'fault-dike') {
    // 岩脈と断層が交わっている（新旧が読める）
    const fe = h.events.find(e => e.t === 'fault'), de = h.events.find(e => e.t === 'dike');
    const yc = h.H / 2, dd = fe.dip * Math.PI / 180, a = de.deg * Math.PI / 180;
    let cross = false;
    for (let y = 2; y < 46; y++) { const xf = fe.x0 - fe.toward * (y - yc) / Math.tan(dd), xd = de.x0 + Math.tan(a) * y; if (Math.abs(xf - xd) < de.w) cross = true; }
    ok(cross, `${tpl}/${seed}：岩脈が断層と交わる`);
  }
}
{
  const h = columnsHistory(3);
  const s = ST.simulate(h.events, h.W, h.H);
  const tuffTop = (x) => ST.column(s, x).layers.find(l => l.m === 'tuff').top;
  ok(h.tilt < 0 ? tuffTop(30) > tuffTop(170) : tuffTop(30) < tuffTop(170), '柱状図：鍵層の高さが傾きの向きと合う');
}
// ---- 等値線：円錐の等高線は同心円
{
  const n = 41, v = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = 100 - Math.hypot(i - 20, j - 20) * 5;
  const lines = MP.contour(v, n, n, 50);
  ok(lines.length === 1 && lines[0].every(([x, y]) => near(Math.hypot(x - 20, y - 20), 10, 0.15)), '等値線：円錐の 50 の等高線は半径 10 の円');
}
// ---- 天気図・地形図：すべて描け、冬型は日本付近で等圧線が南北に混む
{
  const I = geo('identify');
  for (const k of I.weather) { const s = MP.weatherSVG(k); ok(s.includes('<svg') && s.length < 200000, `天気図 ${k}（${s.length}）`); }
  for (const k of I.topo) { const s = MP.topoSVG(k); ok(s.includes('<svg') && s.length < 200000, `地形図 ${k}（${s.length}）`); }
  const W = MP.WEATHER.winter;
  const gx = (MP.pressureField(W, 135, 38) - MP.pressureField(W, 140, 38)) / 5, gy = Math.abs(MP.pressureField(W, 137, 36) - MP.pressureField(W, 137, 41)) / 5;
  ok(gx > 2 * gy && gx > 0, '冬型：西が高く東が低い（等圧線は南北）');
  ok(MP.pressureField(MP.WEATHER.typhoon, 131, 28.5) < 960, '台風の中心は 960 hPa より低い');
  ok(Object.keys(MP.WEATHER).every(k => I.weather.includes(k)) && Object.keys(MP.TOPO).every(k => I.topo.includes(k)), 'identify.json の天気図・地形図の一覧がモデルと合う');
  for (const r of I.rocks) ok(SP.rockSVG(r, { idp: r.id }).length < 200000, `岩石 ${r.id}`);
  ok(I.fossils.every(f => SP.FOSSIL_KEYS.includes(f.id)), 'すべての化石に絵がある');
}
// ---- 地震：大森公式と走時
{
  ok(near(CH.omoriK(6, 3.5), 8.4, 0.01), 'k = VpVs/(Vp−Vs) = 8.4');
  const D = 120, T = D / 3.5 - D / 6;
  ok(near(CH.omoriK(6, 3.5) * T, D, 1e-9), '大森公式で震源距離がもどる');
}
// ---- 天球：南中高度・周極星・昼の長さ
{
  const alt = (phi, dec, H) => Math.asin(horizonVec(phi, dec, H)[2]) * 180 / Math.PI;
  ok(near(alt(35, 23.4, 0), 78.4, 1e-9) && near(alt(35, -23.4, 0), 31.6, 1e-9), '南中高度 = 90 − φ + δ');
  ok(near(alt(35, 89.999, 0), 35, 0.01), '天の北極の高度 = 緯度');
  ok(riseSet(40, 55).always && riseSet(40, -55).never && !riseSet(40, 30).always, '周極星・出ない星の判定');
  ok(near(2 * riseSet(35, 0).H0 / 15, 12, 1e-9) && near(2 * riseSet(35, 23.4).H0 / 15, 14.35, 0.05), '春分は昼 12 時間、夏至（北緯 35°）は約 14.3 時間');
  const v = horizonVec(35, 0, 90);
  ok(near(v[0], -1, 1e-9), '天の赤道上の天体は南中の 6 時間後に真西');
}
// ---- 恒星・惑星のデータ：主系列の星は L と T がおおむね合う、ケプラーの第3法則
{
  const S = geo('sky');
  ok(S.planets.every(p => near(p.P * p.P / p.a ** 3, 1, 0.02)), 'すべての惑星で P²/a³ ≒ 1');
  const R = (s) => Math.sqrt(s.L) / (s.T / 5772) ** 2;
  ok(S.stars.filter(s => s.cls === '白色矮星').every(s => R(s) < 0.03) && S.stars.filter(s => s.cls === '超巨星').every(s => R(s) > 30), '白色矮星は小さく、超巨星は大きい（L = R²T⁴）');
  ok(near(R(S.stars.find(s => s.id === 'sun')), 1, 1e-9), '太陽の半径 = 1');
}
// ---- 用語：つながりの参照
{
  const T = geo('terms'), ids = new Set(T.terms.map(t => t.id));
  ok(T.links.every(l => ids.has(l.a) && ids.has(l.b) && l.a !== l.b), '用語のつながりはすべて存在する用語どうし');
}
console.log(`lab.test: ${pass} 件 OK${fail ? `、${fail} 件失敗` : ''}`);
process.exitCode = fail ? 1 : 0;
