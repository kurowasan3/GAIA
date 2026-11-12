// 地図・画像からの識別：岩石（ルーペで見た組織）・化石・天気図・地形図（等高線）
import { C, Z, $, $$, e, f1, head, tabs, bindTabs, probButton, done, quiz, choicesFrom } from './common.js';
import { rockSVG, fossilSVG, MINERAL_LOOK } from './model/specimens.js';
import { weatherSVG, WEATHER, topoSVG, TOPO } from './model/maps.js';

export const FILE_VERSION = '0.1.2';

const MODES = [['rock', '岩石'], ['fossil', '化石'], ['weather', '天気図'], ['topo', '地形図']];

export function identifyPage(view, key) {
  const [kind, id] = key ? key.split(':') : [null, null];
  const mode = MODES.some(m => m[0] === kind) ? kind : (C.prefs.idMode || 'rock');
  view.innerHTML = `<div class="fade-in lab-id">${head('地図・画像からの識別', '固体地球・大気・地質', '特徴を言葉にしてから見分ける練習です。「図鑑」で特徴を確かめ、「クイズ」で見分けられるか試せます。')}
    ${tabs('idmode', MODES, mode)}
    <div id="idbody"></div>
  </div>`;
  const draw = (m, sel) => { C.prefs.idMode = m; C.save(); ({ rock: rockTab, fossil: fossilTab, weather: weatherTab, topo: topoTab })[m]($('#idbody'), sel); };
  bindTabs('idmode', (m) => draw(m, null));
  draw(mode, kind === mode ? id : null);
}

function subTabs(id, cur, extra = []) {
  return `<div class="segment lab-sub" id="${id}">${[['book', '図鑑'], ...extra, ['quiz', 'クイズ']].map(([k, l]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- 岩石
function rockTab(box, sel) {
  const R = Z.identify.rocks;
  let sub = sel ? 'book' : (C.prefs.rockSub || 'book');
  box.innerHTML = `${subTabs('rsub', sub, [['chart', '火成岩の分類表']])}<div id="rbody"></div>${probButton('identify', null, '識別の問題を解く')}`;
  const draw = (s) => {
    sub = s; C.prefs.rockSub = s; C.save();
    const b = $('#rbody');
    if (s === 'chart') { b.innerHTML = `<div class="lab-fig wide">${igneousChart()}</div><p class="muted small">同じ化学組成のマグマでも、地表付近で急に冷えると火山岩（斑状組織）、地下深くでゆっくり冷えると深成岩（等粒状組織）になる。左ほど SiO₂ が少なく、有色鉱物が多い（色指数が大きい）。</p>`; return; }
    if (s === 'quiz') {
      const r = Math.random;
      quiz(b, {
        label: 'この岩石は何？（ルーペで見たようす）',
        pick: () => { const k = R[Math.floor(r() * R.length)]; return { item: k, svg: rockSVG(k, { size: 220, seed: 1 + Math.floor(r() * 50), idp: 'q' + Date.now() }), answer: k.name, choices: choicesFrom(k.name, R.map(x => x.name)) }; },
        explain: (q) => `<p class="small"><b>${e(q.item.name)}</b>（${e(q.item.group)}・${e(q.item.sub)}）：${e(q.item.points.join('・'))}</p><p class="muted small">${e(q.item.desc)}</p>`,
      });
      return;
    }
    const groups = ['火成岩', '堆積岩', '変成岩'];
    b.innerHTML = groups.map(g => `<h2>${g}</h2><div class="spec-grid">${R.filter(x => x.group === g).map(x => `<button class="spec ${x.id === sel ? 'on' : ''}" data-r="${x.id}">${rockSVG(x, { size: 120, idp: 's-' + x.id })}<b>${e(x.name)}</b><small>${e(x.sub)}</small></button>`).join('')}</div>`).join('') + '<div id="rdetail"></div>';
    const show = (id) => {
      const x = R.find(y => y.id === id);
      $$('.spec', b).forEach(s2 => s2.classList.toggle('on', s2.dataset.r === id));
      const mins = x.minerals && x.group === '火成岩' ? Object.entries(x.minerals) : null;
      const tot = mins ? mins.reduce((s3, [, v]) => s3 + v, 0) : 0;
      const MN = Object.fromEntries(Z.identify.minerals.map(m => [m.id, m]));
      $('#rdetail').innerHTML = `<div class="panel zk-detail spec-detail">
        <div class="sd-fig">${rockSVG(x, { size: 220, idp: 'd-' + x.id })}</div>
        <div><div class="zk-dhead">${e(x.name)}</div><div class="muted small">${e(x.group)}・${e(x.sub)}${x.sio2 ? `・SiO₂ ${e(x.sio2)}` : ''}</div>
          <div class="tchips">${x.points.map(p => `<span class="chip plain">${e(p)}</span>`).join('')}</div>
          <p class="small">${e(x.desc)}</p>
          ${mins ? `<div class="minbar">${mins.map(([m, v]) => `<span style="flex:${v};background:${MINERAL_LOOK[m].c}" title="${e(MN[m].name)}"></span>`).join('')}</div>
            <div class="muted small">${mins.map(([m, v]) => `${e(MN[m].name)} ${Math.round(v / tot * 100)}%`).join('・')}（体積のおよその割合）</div>` : ''}
        </div></div>`;
      $('#rdetail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    $$('.spec', b).forEach(s2 => s2.addEventListener('click', () => show(s2.dataset.r)));
    if (sel && R.some(x => x.id === sel)) show(sel);
    b.insertAdjacentHTML('beforeend', `<h2>造岩鉱物</h2><div class="min-list">${Z.identify.minerals.map(m => `<div class="min-row"><span class="mswatch" style="background:${MINERAL_LOOK[m.id].c}"></span><div><b>${e(m.name)}</b> <span class="muted small">${e(m.kind)}・${e(m.color)}・${e(m.shape)}</span><div class="muted small">${e(m.sio2)}。${e(m.note)}</div></div></div>`).join('')}</div>`);
  };
  $$('#rsub button').forEach(bt => bt.addEventListener('click', () => { $$('#rsub button').forEach(x => x.classList.toggle('on', x === bt)); draw(bt.dataset.t); }));
  draw(sub);
  done(box);
}

// 火成岩の分類表（SiO₂ の量と鉱物の割合）
export function igneousChart() {
  const W = 620, H = 360, L = 70, Rr = 20, T = 70, B = 40;
  const xs = [0, 0.25, 0.5, 0.75, 1];
  const stack = [
    ['O', 'かんらん石', [30, 10, 0, 0, 0]], ['X', '輝石', [25, 30, 10, 0, 0]], ['H', '角閃石', [0, 5, 20, 8, 2]], ['B', '黒雲母', [0, 0, 5, 10, 8]],
    ['P', '斜長石', [45, 55, 55, 40, 25]], ['K', 'カリ長石', [0, 0, 5, 20, 30]], ['Q', '石英', [0, 0, 5, 22, 35]],
  ];
  const X = (t) => L + t * (W - L - Rr), Y = (p) => H - B - p / 100 * (H - B - T);
  let acc = [0, 0, 0, 0, 0], g = '';
  for (const [k, name, v] of stack) {
    const lo = acc.slice(), hi = acc.map((a, i) => a + v[i]);
    const pts = xs.map((t, i) => [X(t), Y(hi[i])]).concat(xs.map((t, i) => [X(t), Y(lo[i])]).reverse());
    const col = MINERAL_LOOK[k].c;
    g += `<path d="M${pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join('L')}Z" fill="${col}" stroke="#555" stroke-width=".7"/>`;
    // ラベル：いちばん厚いところ
    let bi = 0; v.forEach((a, i) => { if (a > v[bi]) bi = i; });
    const tx = X(xs[bi] === 0 ? 0.08 : xs[bi] === 1 ? 0.92 : xs[bi]), ty = Y((lo[bi] + hi[bi]) / 2) + 4;
    const dark = ['B', 'H', 'X'].includes(k);
    g += `<text x="${tx}" y="${ty}" font-size="12" text-anchor="middle" fill="${dark ? '#fff' : '#222'}" font-weight="700">${name}</text>`;
    acc = hi;
  }
  const lab = (t, y, s, sz = 13) => `<text x="${X(t)}" y="${y}" font-size="${sz}" text-anchor="middle" fill="currentColor" font-weight="700">${s}</text>`;
  g += `<text x="${L - 8}" y="22" font-size="12" text-anchor="end" fill="currentColor">火山岩</text>${lab(0.12, 22, '玄武岩')}${lab(0.5, 22, '安山岩')}${lab(0.88, 22, '流紋岩')}`;
  g += `<text x="${L - 8}" y="44" font-size="12" text-anchor="end" fill="currentColor">深成岩</text>${lab(0.12, 44, 'はんれい岩')}${lab(0.5, 44, '閃緑岩')}${lab(0.88, 44, '花こう岩')}`;
  g += `<path d="M${X(0.3)} 10V52M${X(0.7)} 10V52" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/>`;
  g += `<text x="${X(0)}" y="${H - B + 16}" font-size="11" fill="currentColor">苦鉄質（SiO₂ 約45%）</text><text x="${X(1)}" y="${H - B + 16}" font-size="11" text-anchor="end" fill="currentColor">ケイ長質（約70%）</text>`;
  g += `<text x="${(X(0) + X(1)) / 2}" y="${H - 6}" font-size="11.5" text-anchor="middle" fill="currentColor">← 色指数大・黒っぽい・高温・粘性小　　SiO₂　　色指数小・白っぽい・低温・粘性大 →</text>`;
  g += `<text x="16" y="${(T + H - B) / 2}" font-size="11" text-anchor="middle" fill="currentColor" transform="rotate(-90 16 ${(T + H - B) / 2})">鉱物の体積の割合 [%]</text>`;
  for (const p of [0, 50, 100]) g += `<text x="${L - 6}" y="${Y(p) + 4}" font-size="10" text-anchor="end" fill="currentColor">${p}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="火成岩の分類表：SiO₂ の量と鉱物の割合" font-family="sans-serif">${g}</svg>`;
}

// ---------------------------------------------------------------- 化石
function fossilTab(box, sel) {
  const F = Z.identify.fossils;
  const sub = sel ? 'book' : (C.prefs.fossilSub || 'book');
  box.innerHTML = `${subTabs('fsub', sub, [['era', '時代の表']])}<div id="fbody"></div>${probButton('identify', null, '識別の問題を解く')}`;
  const draw = (s) => {
    C.prefs.fossilSub = s; C.save();
    const b = $('#fbody');
    if (s === 'quiz') {
      quiz(b, {
        label: 'この化石は何？（そして時代・環境は？）',
        pick: () => { const k = F[Math.floor(Math.random() * F.length)]; return { item: k, svg: fossilSVG(k.id, { w: 240 }), answer: k.name, choices: choicesFrom(k.name, F.map(x => x.name)) }; },
        explain: (q) => `<p class="small"><b>${e(q.item.name)}</b>：${e(q.item.kind)}　${q.item.era ? `${e(q.item.era)}（${e(q.item.period)}）` : e(q.item.env)}</p><p class="muted small">${e(q.item.desc)}</p>`,
      });
      return;
    }
    if (s === 'era') {
      const eras = ['古生代', '中生代', '新生代'];
      b.innerHTML = `<div class="era-table">${eras.map(er => `<div class="era-col"><b>${er}</b>${F.filter(x => x.era === er).map(x => `<div class="era-item">${fossilSVG(x.id, { w: 84 })}<span>${e(x.name)}<small>${e(x.period)}</small></span></div>`).join('')}</div>`).join('')}</div>
        <h2>示相化石</h2><div class="era-table">${F.filter(x => x.kind === '示相化石').map(x => `<div class="era-item">${fossilSVG(x.id, { w: 84 })}<span>${e(x.name)}<small>${e(x.env)}</small></span></div>`).join('')}</div>
        <p class="muted small">示準化石の条件：生存期間が短い（種の入れかわりが速い）・分布が広い・個体数が多い。示相化石の条件：すむ環境が限られている・現在も近い仲間が生きていて環境がわかる。</p>`;
      return;
    }
    b.innerHTML = `<div class="spec-grid">${F.map(x => `<button class="spec ${x.id === sel ? 'on' : ''}" data-f="${x.id}">${fossilSVG(x.id, { w: 130 })}<b>${e(x.name)}</b><small>${e(x.kind)}${x.era ? '・' + e(x.era) : ''}</small></button>`).join('')}</div><div id="fdetail"></div>`;
    const show = (id) => {
      const x = F.find(y => y.id === id);
      $$('.spec', b).forEach(s2 => s2.classList.toggle('on', s2.dataset.f === id));
      $('#fdetail').innerHTML = `<div class="panel zk-detail spec-detail"><div class="sd-fig">${fossilSVG(x.id, { w: 220 })}</div><div><div class="zk-dhead">${e(x.name)}</div>
        <div class="muted small">${e(x.kind)}　${x.era ? `${e(x.era)}・${e(x.period)}` : `環境：${e(x.env)}`}</div><p class="small">${e(x.desc)}</p></div></div>`;
      $('#fdetail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    $$('.spec', b).forEach(s2 => s2.addEventListener('click', () => show(s2.dataset.f)));
    if (sel && F.some(x => x.id === sel)) show(sel);
  };
  $$('#fsub button').forEach(bt => bt.addEventListener('click', () => { $$('#fsub button').forEach(x => x.classList.toggle('on', x === bt)); draw(bt.dataset.t); }));
  draw(sub);
  done(box);
}

// ---------------------------------------------------------------- 天気図
function weatherTab(box, sel) {
  const keys = Z.identify.weather;
  let cur = sel && keys.includes(sel) ? sel : (C.prefs.wxKey || 'winter');
  const sub = sel ? 'book' : (C.prefs.wxSub || 'book');
  box.innerHTML = `${subTabs('wsub', sub)}<div id="wbody"></div>${probButton('identify', null, '識別の問題を解く')}`;
  const draw = (s) => {
    C.prefs.wxSub = s; C.save();
    const b = $('#wbody');
    if (s === 'quiz') {
      quiz(b, {
        label: 'この天気図の気圧配置（季節）は？',
        pick: () => { const k = keys[Math.floor(Math.random() * keys.length)]; return { item: k, svg: `<div class="lab-fig">${weatherSVG(k)}</div>`, answer: WEATHER[k].name, choices: choicesFrom(WEATHER[k].name, keys.map(x => WEATHER[x].name)) }; },
        explain: (q) => `<p class="small">${e(WEATHER[q.item].desc)}</p>`,
      });
      return;
    }
    b.innerHTML = `<div class="toggles">${keys.map(k => `<button class="tog ${k === cur ? 'on' : ''}" data-w="${k}">${e(WEATHER[k].name.replace(/（.*）/, ''))}</button>`).join('')}</div>
      <div class="lab-fig" id="wfig"></div><div class="panel zk-detail" id="wdesc"></div>
      <p class="muted small">学習用の模式図です（気圧の値・海岸線は単純化してあります）。等圧線は 4 hPa ごと、20 hPa ごとに太線。前線の記号：寒冷前線（▲）・温暖前線（●）・停滞前線（交互）。</p>`;
    const show = () => {
      $('#wfig').innerHTML = weatherSVG(cur);
      $('#wdesc').innerHTML = `<div class="zk-dhead">${e(WEATHER[cur].name)}</div><div class="muted small">季節：${e(WEATHER[cur].season)}</div><p class="small">${e(WEATHER[cur].desc)}</p>`;
      $$('[data-w]', b).forEach(x => x.classList.toggle('on', x.dataset.w === cur));
    };
    $$('[data-w]', b).forEach(x => x.addEventListener('click', () => { cur = x.dataset.w; C.prefs.wxKey = cur; C.save(); show(); }));
    show();
  };
  $$('#wsub button').forEach(bt => bt.addEventListener('click', () => { $$('#wsub button').forEach(x => x.classList.toggle('on', x === bt)); draw(bt.dataset.t); }));
  draw(sub);
  done(box);
}

// ---------------------------------------------------------------- 地形図
function topoTab(box, sel) {
  const keys = Z.identify.topo;
  let cur = sel && keys.includes(sel) ? sel : (C.prefs.topoKey || 'fan');
  const sub = sel ? 'book' : (C.prefs.topoSub || 'book');
  box.innerHTML = `${subTabs('tsub', sub)}<div id="tbody"></div>${probButton('identify', null, '識別の問題を解く')}`;
  const draw = (s) => {
    C.prefs.topoSub = s; C.save();
    const b = $('#tbody');
    if (s === 'quiz') {
      quiz(b, {
        label: 'この等高線が表す地形は？',
        pick: () => { const k = keys[Math.floor(Math.random() * keys.length)]; return { item: k, svg: `<div class="lab-fig sq">${topoSVG(k, { labels: true })}</div>`, answer: TOPO[k].name, choices: choicesFrom(TOPO[k].name, keys.map(x => TOPO[x].name)) }; },
        explain: (q) => `<p class="small">${e(TOPO[q.item].desc)}</p>`,
      });
      return;
    }
    b.innerHTML = `<div class="toggles">${keys.map(k => `<button class="tog ${k === cur ? 'on' : ''}" data-k="${k}">${e(TOPO[k].name)}</button>`).join('')}</div>
      <p class="muted small" style="margin:6px 0">地図を2回タップすると、その2点を結ぶ断面（地形断面図）を描きます。</p>
      <div class="lab-fig sq" id="tfig"></div><div id="tprof"></div><div class="panel zk-detail" id="tdesc"></div>`;
    let pts = [];
    const show = () => {
      const T = TOPO[cur];
      $('#tfig').innerHTML = topoSVG(cur);
      const svg = $('#tfig svg');
      svg.style.cursor = 'crosshair';
      svg.addEventListener('click', (ev) => {
        const r = svg.getBoundingClientRect();
        const p = [(ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height];
        pts = pts.length >= 2 ? [p] : [...pts, p];
        mark(svg); profile();
      });
      $('#tdesc').innerHTML = `<div class="zk-dhead">${e(T.name)}</div><p class="small">${e(T.desc)}</p><p class="muted small">等高線の間隔：${T.interval} m（太線は ${T.interval * 5} m ごと）。等高線の間隔がせまいほど傾斜が急。</p>`;
      $$('[data-k]', b).forEach(x => x.classList.toggle('on', x.dataset.k === cur));
      pts = []; profile();
    };
    const mark = (svg) => {
      svg.querySelectorAll('.pmark').forEach(x => x.remove());
      const vb = svg.viewBox.baseVal;
      const ns = 'http://www.w3.org/2000/svg';
      pts.forEach((p, i) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', p[0] * vb.width); c.setAttribute('cy', (1 - p[1]) * vb.height); c.setAttribute('r', 5); c.setAttribute('class', 'pmark'); c.setAttribute('fill', i ? '#c0392b' : '#1f5fbf');
        svg.appendChild(c);
      });
      if (pts.length === 2) {
        const l = document.createElementNS(ns, 'path');
        l.setAttribute('d', `M${pts[0][0] * vb.width} ${(1 - pts[0][1]) * vb.height}L${pts[1][0] * vb.width} ${(1 - pts[1][1]) * vb.height}`);
        l.setAttribute('stroke', '#c0392b'); l.setAttribute('stroke-width', 2); l.setAttribute('class', 'pmark'); l.setAttribute('stroke-dasharray', '5 3');
        svg.appendChild(l);
      }
    };
    const profile = () => {
      const box2 = $('#tprof');
      if (pts.length < 2) { box2.innerHTML = ''; return; }
      const T = TOPO[cur], n = 120, hs = [];
      for (let i = 0; i <= n; i++) { const t = i / n; hs.push(T.h(pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t)); }
      const lo = Math.min(...hs, T.sea ? 0 : Infinity), hi = Math.max(...hs);
      const W = 400, H = 150, Lm = 40, Bm = 18;
      const X = (i) => Lm + i / n * (W - Lm - 8), Y = (h) => H - Bm - (h - lo) / (hi - lo || 1) * (H - Bm - 10);
      const d = hs.map((h, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(h))}`).join('');
      box2.innerHTML = `<div class="lab-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="地形断面図" font-family="sans-serif">
        <path d="${d}L${X(n)} ${H - Bm}L${X(0)} ${H - Bm}Z" fill="#d9c7a8" opacity=".55"/><path d="${d}" fill="none" stroke="#7a4520" stroke-width="2"/>
        <path d="M${Lm} 6V${H - Bm}H${W - 6}" stroke="currentColor" fill="none" opacity=".6"/>
        <text x="${Lm - 4}" y="${f1(Y(hi) + 4)}" font-size="10" text-anchor="end" fill="currentColor">${Math.round(hi)}</text><text x="${Lm - 4}" y="${f1(Y(lo) + 4)}" font-size="10" text-anchor="end" fill="currentColor">${Math.round(lo)}</text>
        <text x="${X(0)}" y="${H - 4}" font-size="10" fill="#1f5fbf">A</text><text x="${X(n)}" y="${H - 4}" font-size="10" text-anchor="end" fill="#c0392b">B</text>
        <text x="${(Lm + W) / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="currentColor">標高 [m]（縦は強調してある）</text></svg></div>`;
    };
    $$('[data-k]', b).forEach(x => x.addEventListener('click', () => { cur = x.dataset.k; C.prefs.topoKey = cur; C.save(); show(); }));
    show();
  };
  $$('#tsub button').forEach(bt => bt.addEventListener('click', () => { $$('#tsub button').forEach(x => x.classList.toggle('on', x === bt)); draw(bt.dataset.t); }));
  draw(sub);
  done(box);
}
