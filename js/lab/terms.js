// 地学用語の関連付け：用語のネットワーク・関係を当てる練習・経路さがし・単元ごとの一覧
import { C, Z, $, $$, e, f1, head, tabs, bindTabs, probButton, done, quiz, choicesFrom, shuffle } from './common.js';

export const FILE_VERSION = '0.1.3';

// 向きのある関係（A → B）。そのほかは向きなし（説明文で読む）
const DIRECTED = { cause: '原因', form: 'できる', evidence: '証拠' };
const SHORT = { cause: '原因', part: '部分', example: '例', contrast: '対比', measure: '測る', form: 'できる', evidence: '証拠', same: '同じ', related: '関係' };
const COLORS = { cause: '#c0392b', form: '#b9770e', evidence: '#7d3c98', contrast: '#1f5fbf', same: '#117a65', part: '#5d6d7e', example: '#5d6d7e', measure: '#2e86c1', related: '#95a5a6' };

let T = null, by = null, adj = null;
function index() {
  if (T === Z.terms) return;
  T = Z.terms;
  by = Object.fromEntries(T.terms.map(t => [t.id, t]));
  adj = Object.fromEntries(T.terms.map(t => [t.id, []]));
  for (const l of T.links) { adj[l.a].push({ l, other: l.b, out: true }); adj[l.b].push({ l, other: l.a, out: false }); }
}
const unitName = (u) => (Z.units.find(x => x.key === u) || {}).name || u;

export function termsPage(view, key) {
  index();
  const mode = key && by[key] ? 'net' : (C.prefs.trMode || 'net');
  view.innerHTML = `<div class="fade-in lab-terms">${head('地学用語の関連付け', '用語', `${T.terms.length}語の用語が、「原因 → 結果」「対比」「証拠」などの ${T.links.length} 本の関係でつながっています。用語は単独で覚えるより、つながりで覚える方が忘れにくくなります。`)}
    ${tabs('trmode', [['net', 'つながり'], ['quiz', '関係を当てる'], ['path', '経路さがし'], ['list', '単元ごと']], mode)}
    <div id="trbody"></div>
  </div>`;
  const draw = (m, k) => { C.prefs.trMode = m; C.save(); ({ net, quiz: practice, path, list })[m]($('#trbody'), k); };
  bindTabs('trmode', (m) => draw(m, null));
  draw(mode, key);
  done(view);
}

function linkText(l, from) {
  const a = by[l.a].name, b = by[l.b].name;
  if (DIRECTED[l.rel]) return `${e(a)} <span class="rel r-${l.rel}">─${SHORT[l.rel]}→</span> ${e(b)}`;
  return `${e(from === l.b ? b : a)} <span class="rel r-${l.rel}">─${SHORT[l.rel]}─</span> ${e(from === l.b ? a : b)}`;
}

function searchBox(id, ph) {
  return `<input class="tr-search" id="${id}" list="${id}-dl" placeholder="${e(ph)}" autocomplete="off"><datalist id="${id}-dl">${T.terms.flatMap(t => [t.name, ...(t.aka || [])]).map(n => `<option value="${e(n)}"></option>`).join('')}</datalist>`;
}
function findTerm(q) {
  const s = q.trim();
  if (!s) return null;
  return T.terms.find(t => t.name === s) || T.terms.find(t => (t.aka || []).includes(s)) || T.terms.find(t => t.name.includes(s)) || T.terms.find(t => (t.aka || []).some(a => a.includes(s))) || T.terms.find(t => t.def.includes(s)) || null;
}

// ---------------------------------------------------------------- つながり（中心の用語とその近く）
function net(box, key) {
  let cur = key && by[key] ? key : (C.prefs.trCur && by[C.prefs.trCur] ? C.prefs.trCur : 'plate');
  const hist = [];
  box.innerHTML = `${searchBox('trq', '用語を探す（例：フェーン現象、示準化石）')}
    <div class="tr-hist" id="trhist"></div>
    <div class="lab-fig tr-net" id="trnet"></div>
    <div id="trdet"></div>`;
  const draw = () => {
    C.prefs.trCur = cur; C.save();
    const t = by[cur], ns = adj[cur];
    const W = 560, H = 420, cx = W / 2, cy = H / 2;
    const n = ns.length, rad = n > 10 ? 168 : 150;
    let g = '';
    const nodes = ns.map((x, i) => { const a = -Math.PI / 2 + i / n * 2 * Math.PI; return { ...x, x: cx + rad * 1.18 * Math.cos(a), y: cy + rad * Math.sin(a) }; });
    for (const nd of nodes) {
      const col = COLORS[nd.l.rel];
      const dir = DIRECTED[nd.l.rel];
      const [x1, y1, x2, y2] = nd.out ? [cx, cy, nd.x, nd.y] : [nd.x, nd.y, cx, cy];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const sx = x1 + dx / L * 42, sy = y1 + dy / L * 26, ex = x2 - dx / L * 46, ey = y2 - dy / L * 24;
      g += `<path d="M${f1(sx)} ${f1(sy)}L${f1(ex)} ${f1(ey)}" stroke="${col}" stroke-width="${dir ? 2 : 1.4}" ${dir ? `marker-end="url(#ta-${nd.l.rel})"` : ''} ${nd.l.rel === 'related' ? 'stroke-dasharray="4 3"' : ''}/>`;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      g += `<text x="${f1(mx)}" y="${f1(my - 3)}" font-size="10.5" text-anchor="middle" fill="${col}" font-weight="700" class="tr-elabel">${SHORT[nd.l.rel]}</text>`;
    }
    for (const nd of nodes) {
      const name = by[nd.other].name;
      const w = Math.min(150, 16 + name.length * 12.5);
      g += `<g class="tr-node" data-t="${nd.other}" tabindex="0" role="button" aria-label="${e(name)}"><rect x="${f1(nd.x - w / 2)}" y="${f1(nd.y - 15)}" width="${f1(w)}" height="30" rx="15"/><text x="${f1(nd.x)}" y="${f1(nd.y + 5)}" font-size="${name.length > 10 ? 11 : 13}" text-anchor="middle">${e(name)}</text></g>`;
    }
    const w0 = Math.min(220, 30 + t.name.length * 15);
    g += `<g class="tr-center"><rect x="${f1(cx - w0 / 2)}" y="${cy - 21}" width="${f1(w0)}" height="42" rx="21"/><text x="${cx}" y="${cy + 6}" font-size="16" text-anchor="middle" font-weight="700">${e(t.name)}</text></g>`;
    const markers = Object.keys(DIRECTED).map(r => `<marker id="ta-${r}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COLORS[r]}"/></marker>`).join('');
    $('#trnet').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(t.name)}とつながる用語" font-family="sans-serif"><defs>${markers}</defs>${g}</svg>`;
    $$('#trnet .tr-node').forEach(nd => {
      const go = () => { hist.push(cur); cur = nd.dataset.t; draw(); };
      nd.addEventListener('click', go);
      nd.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
    });
    $('#trhist').innerHTML = hist.length ? `<button class="linkbtn" id="trback">‹ ${e(by[hist[hist.length - 1]].name)} に戻る</button>` : '';
    $('#trback')?.addEventListener('click', () => { cur = hist.pop(); draw(); });
    $('#trdet').innerHTML = `<div class="panel zk-detail"><div class="zk-dhead">${e(t.name)}</div><div class="muted small">${e(unitName(t.unit))}</div><p>${e(t.def)}</p>${t.aka && t.aka.length ? `<p class="muted small">別名・旧称：${e(t.aka.join('、'))}</p>` : ''}
      <h3>つながり（${ns.length}）</h3><ul class="tr-links">${ns.map(x => `<li><a class="linkbtn" data-go="${x.other}">${linkText(x.l, cur)}</a>${x.l.note ? `<small class="muted">${e(x.l.note)}</small>` : ''}</li>`).join('')}</ul>
      ${probButton('terms', cur, `「${t.name}」の問題を解く`)}</div>`;
    $$('#trdet [data-go]').forEach(a => a.addEventListener('click', () => { hist.push(cur); cur = a.dataset.go; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    done($('#trdet'));
  };
  $('#trq').addEventListener('change', () => { const t = findTerm($('#trq').value); if (t) { hist.push(cur); cur = t.id; $('#trq').value = ''; draw(); } else C.toast('見つかりませんでした'); });
  draw();
}

// ---------------------------------------------------------------- 関係を当てる
function practice(box) {
  const units = [...new Set(T.terms.map(t => t.unit))];
  let unit = C.prefs.trUnit || '';
  box.innerHTML = `<div class="zk-toolbar"><label class="zk-label" for="trunit">範囲</label><select id="trunit"><option value="">すべての単元</option>${units.map(u => `<option value="${u}" ${u === unit ? 'selected' : ''}>${e(unitName(u))}</option>`).join('')}</select></div><div id="trq2"></div>`;
  const start = () => {
    const inU = (t) => !unit || by[t].unit === unit;
    const links = T.links.filter(l => l.rel !== 'related' && (inU(l.a) || inU(l.b)) && l.note);
    const terms = T.terms.filter(t => inU(t.id));
    quiz($('#trq2'), {
      label: '用語のつながり',
      pick: () => {
        const kind = Math.random();
        if (kind < 0.4 && links.length) {
          const l = links[Math.floor(Math.random() * links.length)];
          const rels = ['原因 → 結果', '対比（ちがいを比べる）', '証拠', '〜から〜ができる', '全体と部分・種類と例', '測る・求める', '同じもの・言いかえ'];
          const ans = { cause: rels[0], contrast: rels[1], evidence: rels[2], form: rels[3], part: rels[4], example: rels[4], measure: rels[5], same: rels[6] }[l.rel];
          return { item: { l }, svg: `<div class="tr-q"><b>${e(by[l.a].name)}</b>　と　<b>${e(by[l.b].name)}</b><div class="muted small">この2つの関係は？</div></div>`, answer: ans, choices: choicesFrom(ans, rels) };
        }
        if (kind < 0.75) {
          const t = terms[Math.floor(Math.random() * terms.length)];
          const pool = T.terms.filter(x => x.unit === t.unit).map(x => x.name);
          const all = pool.length >= 4 ? pool : T.terms.map(x => x.name);
          return { item: { t }, svg: `<div class="tr-q"><div class="muted small">次の説明にあてはまる用語は？</div><p>${e([t.name, ...(t.aka || [])].reduce((d, w) => d.split(w).join('〇〇'), t.def))}</p></div>`, answer: t.name, choices: choicesFrom(t.name, all) };
        }
        const cs = links.filter(l => DIRECTED[l.rel] === '原因' || l.rel === 'form');
        const l = cs[Math.floor(Math.random() * cs.length)] || links[0];
        const wrong = T.terms.filter(x => x.id !== l.b && !adj[l.a].some(n => n.other === x.id) && (by[x.id].unit === by[l.b].unit || Math.random() < 0.05)).map(x => x.name);
        return { item: { l }, svg: `<div class="tr-q"><b>${e(by[l.a].name)}</b>${l.rel === 'cause' ? ' が原因で起こる（生じる）のは？' : ' からできるのは？'}</div>`, answer: by[l.b].name, choices: choicesFrom(by[l.b].name, wrong.length >= 3 ? wrong : T.terms.map(x => x.name)) };
      },
      explain: (q) => q.item.l ? `<p class="small">${linkText(q.item.l, q.item.l.a)}：${e(q.item.l.note)}</p><a class="linkbtn" href="#lab=terms/${q.item.l.a}">つながりを見る ›</a>`
        : `<p class="small"><b>${e(q.item.t.name)}</b>：${e(q.item.t.def)}</p><a class="linkbtn" href="#lab=terms/${q.item.t.id}">つながりを見る ›</a>`,
    });
  };
  $('#trunit').addEventListener('change', (ev) => { unit = ev.target.value; C.prefs.trUnit = unit; C.save(); start(); });
  start();
}

// ---------------------------------------------------------------- 経路さがし
export function findPath(a, b) {
  const prev = new Map([[a, null]]), q = [a];
  while (q.length) {
    const u = q.shift();
    if (u === b) break;
    for (const x of adj[u]) if (!prev.has(x.other)) { prev.set(x.other, { from: u, l: x.l }); q.push(x.other); }
  }
  if (!prev.has(b)) return null;
  const out = [];
  for (let v = b; prev.get(v); v = prev.get(v).from) out.unshift({ from: prev.get(v).from, to: v, l: prev.get(v).l });
  return out;
}
function path(box) {
  box.innerHTML = `<p class="small">2つの用語を選ぶと、それをつなぐ最短の道すじを表示します。説明の文章を作る練習に使えます（例：「シアノバクテリア」と「生物の陸上進出」）。</p>
    <div class="tr-pair">${searchBox('pa', 'はじめの用語')}<span>→</span>${searchBox('pb', 'おわりの用語')}</div>
    <div class="btn-row"><button class="btn primary" id="pgo">つなぐ</button><button class="btn ghost" id="prand">おまかせ</button></div><div id="pres"></div>`;
  const run = (a, b) => {
    const p = findPath(a.id, b.id);
    $('#pres').innerHTML = !p ? '<p class="muted">この2つはつながっていません。</p>'
      : `<ol class="tr-path">${p.map(s => `<li><div>${linkText(s.l, s.from)}</div>${s.l.note ? `<small class="muted">${e(s.l.note)}</small>` : ''}</li>`).join('')}</ol>`;
  };
  $('#pgo').addEventListener('click', () => { const a = findTerm($('#pa').value), b = findTerm($('#pb').value); if (!a || !b) { C.toast('用語を2つ選んでください'); return; } run(a, b); });
  $('#prand').addEventListener('click', () => {
    let a, b, p;
    for (let i = 0; i < 40; i++) { [a, b] = shuffle(T.terms).slice(0, 2); p = findPath(a.id, b.id); if (p && p.length >= 3 && p.length <= 6) break; }
    $('#pa').value = a.name; $('#pb').value = b.name; run(a, b);
  });
}

// ---------------------------------------------------------------- 単元ごとの一覧
function list(box) {
  const units = Z.units.filter(u => T.terms.some(t => t.unit === u.key));
  box.innerHTML = units.map(u => `<details class="tr-unit"><summary><b>${e(u.name)}</b><span class="muted small">${T.terms.filter(t => t.unit === u.key).length}語</span></summary>
    <dl>${T.terms.filter(t => t.unit === u.key).map(t => `<dt><a class="linkbtn" href="#lab=terms/${t.id}">${e(t.name)}</a></dt><dd>${e(t.def)}</dd>`).join('')}</dl></details>`).join('');
}
