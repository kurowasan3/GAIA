// 地層・地質構造：地史の再生・新旧の判定・柱状図の対比
import { C, $, $$, e, head, tabs, bindTabs, probButton, done, shuffle } from './common.js';
import { simulate, strataSVG, makeHistory, describe, reasons, TEMPLATES, MATERIALS, column, patternDefs, rng } from './model/strata.js';

export const FILE_VERSION = '0.1.1';

let uid = 0;
const nextId = () => 'sp' + (++uid);

export function strataPage(view, key) {
  const mode = key === 'columns' ? 'columns' : key && TEMPLATES[key] ? 'replay' : (C.prefs.stMode || 'replay');
  view.innerHTML = `<div class="fade-in lab-strata">${head('地層・地質構造の理解', '地層と地史', '断面図の中で、地層の堆積・傾斜・断層・不整合・貫入を1つずつ再生できます。「新旧を当てる」では、断面図からできごとの順番を考えます。')}
    ${tabs('stmode', [['replay', '地史の再生'], ['order', '新旧を当てる'], ['columns', '柱状図の対比']], mode)}
    <div id="stbody"></div>
    ${probButton('strata', null, '地層・地質構造の問題を解く')}
  </div>`;
  const draw = (m, k) => { C.prefs.stMode = m; C.save(); ({ replay, order, columns })[m]($('#stbody'), k); };
  bindTabs('stmode', (m) => draw(m, null));
  draw(mode, key);
  done(view);
}

function legend(sim) {
  const used = [...new Set([...sim.g].filter(Boolean).map(u => sim.units[u].m))];
  const id = nextId();
  return `<div class="st-legend">${used.map(m => `<span class="lg"><svg viewBox="0 0 24 16" width="24" height="16"><defs>${patternDefs(id)}</defs><rect width="24" height="16" fill="${MATERIALS[m].color}"/>${MATERIALS[m].pat ? `<rect width="24" height="16" fill="url(#${id}-${MATERIALS[m].pat})"/>` : ''}<rect width="24" height="16" fill="none" stroke="#555"/></svg>${e(MATERIALS[m].name)}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- 地史の再生
function replay(box, key) {
  let tpl = key && TEMPLATES[key] ? key : (C.prefs.stTpl || 'fault-unconf');
  let seed = C.prefs.stSeed || 1;
  let hist = makeHistory(tpl, seed);
  const evs = () => hist.events.filter(x => !x.final);
  let k = evs().length;
  box.innerHTML = `<div class="toggles" id="sttpl">${Object.entries(TEMPLATES).map(([t, v]) => `<button class="tog ${t === tpl ? 'on' : ''}" data-t="${t}">${e(v.name)}</button>`).join('')}</div>
    <div class="muted small" id="stdesc"></div>
    <div class="lab-fig strata-fig" id="stfig"></div>
    <div class="st-ctrl"><button class="btn" id="stprev" aria-label="1つ戻す">‹</button><input type="range" id="stk" min="0" step="1"><button class="btn" id="stnext" aria-label="1つ進める">›</button><button class="btn ghost" id="stnew">別の例</button></div>
    <ol class="st-events" id="stev"></ol>
    <div id="stlg"></div>
    <details class="panel"><summary><b>新旧を判断する根拠</b></summary><ul class="small" id="streason"></ul></details>`;
  const draw = () => {
    const E = evs();
    const upto = k >= E.length ? hist.events.length : k;
    const sim = simulate(hist.events, hist.W, hist.H, upto);
    $('#stfig').innerHTML = strataSVG(sim, { idp: nextId(), cell: 3, alt: '地質断面図' });
    $('#stk').max = E.length; $('#stk').value = k;
    const D = describe(hist.events);
    $('#stev').innerHTML = D.map((d, i) => `<li class="${i < k ? 'done' : ''} ${i === k - 1 ? 'cur' : ''}" data-i="${i}">${e(d)}</li>`).join('') + (k === 0 ? '' : '');
    $('#stdesc').textContent = TEMPLATES[tpl].desc + (k === 0 ? '（まだ何も起きていない）' : '');
    $('#stlg').innerHTML = legend(sim);
    $('#streason').innerHTML = reasons(hist.events).map(r => `<li>${e(r)}</li>`).join('');
    $$('#stev li').forEach(li => li.addEventListener('click', () => { k = +li.dataset.i + 1; draw(); }));
  };
  $('#stk').addEventListener('input', (ev) => { k = +ev.target.value; draw(); });
  $('#stprev').addEventListener('click', () => { k = Math.max(0, k - 1); draw(); });
  $('#stnext').addEventListener('click', () => { k = Math.min(evs().length, k + 1); draw(); });
  $('#stnew').addEventListener('click', () => { seed++; C.prefs.stSeed = seed; C.save(); hist = makeHistory(tpl, seed); k = evs().length; draw(); });
  $$('#sttpl .tog').forEach(b => b.addEventListener('click', () => {
    tpl = b.dataset.t; C.prefs.stTpl = tpl; C.save();
    $$('#sttpl .tog').forEach(x => x.classList.toggle('on', x === b));
    hist = makeHistory(tpl, seed); k = 0; draw();
  }));
  draw();
}

// ---------------------------------------------------------------- 新旧を当てる
function order(box) {
  const tpls = Object.keys(TEMPLATES);
  const make = () => {
    const tpl = tpls[Math.floor(Math.random() * tpls.length)], seed = 1 + Math.floor(Math.random() * 999);
    const hist = makeHistory(tpl, seed);
    const sim = simulate(hist.events, hist.W, hist.H);
    const D = describe(hist.events);
    return { tpl, seed, hist, sim, D, cards: shuffle(D.map((d, i) => i)), seq: [], checked: false };
  };
  let q = make();
  const draw = () => {
    const rest = q.cards.filter(i => !q.seq.includes(i));
    box.innerHTML = `<p class="small">次の断面図ができるまでのできごとを、<b>古い順</b>にタップして並べてください。</p>
      <div class="lab-fig strata-fig">${strataSVG(q.sim, { idp: nextId(), cell: 3, alt: '地質断面図' })}</div>
      ${legend(q.sim)}
      <div class="seq st-seq">${q.seq.length ? q.seq.map((i, n) => {
        const cls = q.checked ? (i === n ? 'right' : 'wrong') : '';
        return `<button class="chipbtn placed ${cls}" data-un="${n}" ${q.checked ? 'disabled' : ''}><b>${n + 1}</b>${e(q.D[i])}</button>`;
      }).join('') : '<span class="muted small">ここに古い順に並びます</span>'}</div>
      ${rest.length ? `<div class="opts pool st-pool">${rest.map(i => `<button class="chipbtn" data-i="${i}">${e(q.D[i])}</button>`).join('')}</div>` : ''}
      <div class="btn-row">
        ${!q.checked && q.seq.length === q.D.length ? '<button class="btn primary" id="stchk">答え合わせ</button>' : ''}
        ${!q.checked && q.seq.length ? '<button class="btn ghost" id="streset">並べ直す</button>' : ''}
        ${q.checked ? '<button class="btn primary" id="stagain">次の断面図</button>' : ''}
      </div>
      <div id="stres"></div>`;
    $$('[data-i]', box).forEach(b => b.addEventListener('click', () => { q.seq.push(+b.dataset.i); draw(); }));
    $$('[data-un]', box).forEach(b => b.addEventListener('click', () => { q.seq.splice(+b.dataset.un, 1); draw(); }));
    $('#streset')?.addEventListener('click', () => { q.seq = []; draw(); });
    $('#stagain')?.addEventListener('click', () => { q = make(); draw(); });
    $('#stchk')?.addEventListener('click', () => {
      q.checked = true;
      draw();
      const ok = q.seq.every((i, n) => i === n);
      $('#stres').innerHTML = `<div class="lq-verdict ${ok ? 'ok' : 'ng'}">${ok ? '正解！' : '順番が違うところがあります（赤）'}</div>
        <ol class="small">${q.D.map(d => `<li>${e(d)}</li>`).join('')}</ol>
        <ul class="small muted">${reasons(q.hist.events).map(r => `<li>${e(r)}</li>`).join('')}</ul>
        <a class="btn ghost block" href="#lab=strata/${q.tpl}" id="streplay">地史の再生で1つずつ確かめる</a>`;
      $('#streplay').addEventListener('click', () => { C.prefs.stSeed = q.seed; C.save(); });
    });
  };
  draw();
}

// ---------------------------------------------------------------- 柱状図の対比
export function columnsHistory(seed) {
  const r = rng(seed * 104729 + 7);
  const seds = ['sand', 'mud', 'cong', 'lime', 'sand', 'mud', 'chert'];
  const layers = [];
  let prev = null;
  const tuffAt = 2 + Math.floor(r() * 3);
  for (let i = 0; i < 8; i++) {
    let m;
    do { m = seds[Math.floor(r() * seds.length)]; } while (m === prev);
    if (i === tuffAt) m = 'tuff';
    prev = m;
    layers.push({ m, h: i === tuffAt ? 3 : 7 + Math.floor(r() * 6) });
  }
  const tilt = (r() < 0.5 ? -1 : 1) * (2.5 + r() * 3);
  const top = layers.reduce((s, l) => s + l.h, 0);
  return { W: 200, H: 120, tilt, tuffAt, events: [{ t: 'dep', layers }, { t: 'tilt', deg: tilt }, { t: 'ero', level: top - 18, amp: 9 + r() * 5, wl: 150 + r() * 80, ph: r() * 6 }] };
}
export function columnsSVG(sim, xs, opts = {}) {
  const cm = 2;   // 1マス = 2 m
  const cols = xs.map(x => column(sim, x));
  const depth = opts.depth || 34;
  const hiS = Math.max(...cols.map(c => c.surface)), loB = Math.min(...cols.map(c => c.surface - depth));
  const W = opts.w || 420, H = opts.h || 340, L = 54, T = 26, B = 16, cw = 46;
  const Y = (y) => T + (hiS - y) / (hiS - loB) * (H - T - B);
  const gap = (W - L - 20 - cw * xs.length) / Math.max(1, xs.length - 1);
  const idp = opts.idp || 'cl';
  let g = '';
  const elev = (y) => Math.round((y - 20) * cm + 100);
  for (let m = Math.ceil(elev(loB) / 10) * 10; m <= elev(hiS); m += 10) {
    const y = (m - 100) / cm + 20;
    g += `<path d="M${L} ${Y(y).toFixed(1)}H${W - 10}" stroke="#ddd" stroke-dasharray="2 3"/><text x="${L - 6}" y="${(Y(y) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#666">${m}</text>`;
  }
  const tuffs = [];
  cols.forEach((c, i) => {
    const x0 = L + 10 + i * (cw + gap);
    for (const l of c.layers) {
      const top = Math.min(l.top, c.surface), bot = Math.max(l.bottom, c.surface - depth);
      if (top <= bot) continue;
      const M = MATERIALS[l.m];
      g += `<rect x="${x0}" y="${Y(top).toFixed(1)}" width="${cw}" height="${(Y(bot) - Y(top)).toFixed(1)}" fill="${M.color}" stroke="#444" stroke-width=".7"/>`;
      if (M.pat) g += `<rect x="${x0}" y="${Y(top).toFixed(1)}" width="${cw}" height="${(Y(bot) - Y(top)).toFixed(1)}" fill="url(#${idp}-${M.pat})"/>`;
      if (l.m === 'tuff') tuffs.push([x0, Y(top), Y(bot), i]);
    }
    g += `<text x="${x0 + cw / 2}" y="${T - 10}" font-size="12" text-anchor="middle" font-weight="700" fill="#333">${'PQRST'[i]}</text>`;
    g += `<path d="M${x0 - 4} ${Y(c.surface).toFixed(1)}h${cw + 8}" stroke="#2f7d32" stroke-width="2.5"/>`;
  });
  if (opts.link) {
    const byCol = {};
    for (const t of tuffs) (byCol[t[3]] = byCol[t[3]] || []).push(t);
    const ks = Object.keys(byCol).map(Number).sort();
    for (let i = 0; i < ks.length - 1; i++) {
      const a = byCol[ks[i]][0], b = byCol[ks[i + 1]][0];
      g += `<path d="M${a[0] + cw} ${a[1].toFixed(1)}L${b[0]} ${b[1].toFixed(1)}M${a[0] + cw} ${a[2].toFixed(1)}L${b[0]} ${b[2].toFixed(1)}" stroke="#c0392b" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    }
  }
  g += `<text x="14" y="${(T + H) / 2}" font-size="11" text-anchor="middle" fill="#333" transform="rotate(-90 14 ${(T + H) / 2})">標高 [m]</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${opts.alt || '柱状図'}" font-family="sans-serif"><defs>${patternDefs(idp)}</defs><rect width="${W}" height="${H}" fill="#fff"/>${g}</svg>`;
}

function columns(box) {
  let seed = C.prefs.colSeed || 3;
  let link = false, section = false;
  const draw = () => {
    const h = columnsHistory(seed);
    const sim = simulate(h.events, h.W, h.H);
    const xs = [30, 100, 170];
    const sec = strataSVG(sim, { idp: nextId(), cell: 3, labels: false, alt: '断面図' });
    box.innerHTML = `<p class="small">3地点 P・Q・R（東西に並ぶ）でボーリングした柱状図です。凝灰岩層（鍵層）を手がかりに、地層がどちらに傾いているか考えましょう。緑の線は地表。</p>
      <div class="lab-fig">${columnsSVG(sim, xs, { idp: nextId(), link })}</div>
      <div class="btn-row"><button class="btn ${link ? 'primary' : ''}" id="clink">鍵層を結ぶ</button><button class="btn ${section ? 'primary' : ''}" id="csec">断面を見る</button><button class="btn ghost" id="cnew">別の例</button></div>
      ${section ? `<div class="lab-fig strata-fig">${sec}</div><p class="muted small">P は左端、R は右端（左が西）。地層は${h.tilt > 0 ? '西' : '東'}に向かって低くなっている（${h.tilt > 0 ? '西' : '東'}に傾斜）。</p>` : ''}
      ${legend(sim)}
      <p class="muted small">鍵層：火山灰（凝灰岩）は、一度の噴火で広い範囲にほぼ同時に積もるので、離れた地点の地層が同じ時代であることを示す。鍵層の標高を比べると、地層の傾きがわかる。</p>`;
    $('#clink').addEventListener('click', () => { link = !link; draw(); });
    $('#csec').addEventListener('click', () => { section = !section; draw(); });
    $('#cnew').addEventListener('click', () => { seed++; C.prefs.colSeed = seed; C.save(); link = section = false; draw(); });
  };
  draw();
}
