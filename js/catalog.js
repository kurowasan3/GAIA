// 問題カタログ：content/ から書き出した data/*.json を読む（tools/build_data.py）
//   一覧 data/index.json、本文 data/f-<単元ID>.json、概念・法則・誤概念 data/knowledge.json、探究 data/lab.json
import { retrievability, dueAt, TARGET_R } from './scheduler.js';

export const FILE_VERSION = '0.2.0';

// 難易度（data/index.json の levels で上書きされる）
export let LEVELS = { 0: '基礎', 1: '標準', 2: '入試基礎', 3: '国公立2次', 4: '難関', 5: '最難関' };
// 分野（力学・熱力学…）の並び。画面では「分野 → 単元」の2段で出す（FIELDS は単元）
export let SUBJECT_ORDER = ['固体地球', '地層・岩石と地球の歴史', '大気と海洋', '宇宙'];
// 出題形式（問題の format）。ホームの「形式ごとに演習」に並べる
export const FORMATS = [
  { id: 'qa', name: '一問一答', desc: '用語を答える' },
  { id: 'choice', name: '正誤・選択', desc: '正しいもの・誤っているものを選ぶ' },
  { id: 'figure', name: '図の読み取り', desc: '天気図・地形図・断面図・岩石・グラフから読み取る' },
  { id: 'order', name: '順序・新旧', desc: '地史・天体の進化・現象の順番を並べる' },
  { id: 'term', name: '用語の関係', desc: '原因と結果・対比・証拠のつながりを考える' },
  { id: 'calc', name: '計算', desc: '震源距離・断熱変化・年代・天体の計算' },
];

export let FIELDS = [];        // 単元 { key: 'MEC-02', subject: '力学', fieldKey: 'MEC', name: '力とつり合い' }
export let ENTRIES = [];       // { id, f: 単元ID, lv, t?, th?, tg?, fm?, c?, m?, zk?, in?, kind: 'bank' }
export const fieldByKey = {};
export const entryById = new Map();
export let META = { count: 0, generated: null, source: null, ok: false, error: null, format: null, dataVersion: null, warnings: [] };
// このアプリが読めるデータ形式（index.json の format）
export const DATA_FORMATS = ['gaia.data/1'];

export async function loadCatalog() {
  let meta = null;
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`data/index.json を読めません（${res.status}）`);
    meta = await res.json();
    META = { count: meta.count, generated: meta.generated, source: meta.source, ok: true, error: null,
      format: meta.format || null, dataVersion: meta.dataVersion || null, warnings: [] };
    if (!DATA_FORMATS.includes(meta.format)) {
      META.warnings.push(`問題データの形式 ${meta.format} はこの版のアプリでは想定していません（アプリの更新が必要かもしれません）`);
    }
  } catch (e) {
    META = { count: 0, generated: null, source: null, ok: false, error: e.message, format: null, dataVersion: null, warnings: [] };
  }
  if (meta && meta.levels) LEVELS = Object.fromEntries(Object.entries(meta.levels).map(([k, v]) => [+k, v]));
  if (meta && meta.subjects) SUBJECT_ORDER = meta.subjects.slice();
  FIELDS = meta ? meta.fields.slice() : [];
  ENTRIES = meta ? meta.problems.map(e => ({ ...e, kind: 'bank' })) : [];
  for (const k of Object.keys(fieldByKey)) delete fieldByKey[k];
  for (const f of FIELDS) fieldByKey[f.key] = f;
  entryById.clear();
  for (const e of ENTRIES) entryById.set(e.id, e);
  return META;
}

// 概念・法則・誤概念（初めて使うときに読む）
let knowledge = null;
export async function loadKnowledge() {
  if (!knowledge) {
    knowledge = fetch('data/knowledge.json').then(r => { if (!r.ok) throw new Error(`data/knowledge.json を読めません（${r.status}）`); return r.json(); })
      .then(d => {
        if (META.dataVersion && d.dataVersion !== META.dataVersion) staleData.add('data/knowledge.json');
        const by = (list) => Object.fromEntries(list.map(x => [x.id, x]));
        return { ...d, concept: by(d.concepts), law: by(d.laws), misconception: by(d.misconceptions) };
      })
      .catch(e => { knowledge = null; throw e; });
  }
  return knowledge;
}

// 本文（分野ごとのファイル）を必要な分だけ読み込む
const bodies = new Map();
const loaded = new Map();
export async function ensureBodies(ids) {
  const need = new Set();
  for (const id of ids) {
    const e = entryById.get(id);
    if (e && !bodies.has(id)) need.add(e.f);
  }
  await Promise.all([...need].map(f => {
    if (!loaded.has(f)) {
      loaded.set(f, fetch(`data/f-${f}.json`).then(r => {
        if (!r.ok) throw new Error(`data/f-${f}.json を読めません（${r.status}）`);
        return r.json();
      }).then(d => {
        // 本文ファイルの版が一覧（index.json）と違う＝一部のファイルだけ古い
        const v = d._meta && d._meta.dataVersion;
        if (META.dataVersion && v !== META.dataVersion) staleData.add(`data/f-${f}.json`);
        for (const [id, b] of Object.entries(d)) if (id !== '_meta') bodies.set(id, b);
      })
        .catch(e => { loaded.delete(f); throw e; }));
    }
    return loaded.get(f);
  }));
}
export const getBody = (id) => bodies.get(id);

// 一覧と版が合わなかった本文ファイル（ensureBodies のあとに見る）
const staleData = new Set();
export const staleDataFiles = () => [...staleData];

// 共通の問題ビュー（本文が未読み込みなら html は null）
//   { id, field, subject, fieldName, level, levelName, minutes, theme, tags, formats, concepts, misconceptions, lab,
//     verified, html: {q, a, s, k} | null, figs, grading: {format, spec} | null, hints, laws, choices }
export function getProblem(id) {
  const e = entryById.get(id);
  if (!e) return undefined;
  const f = fieldByKey[e.f] || {};
  const b = bodies.get(id);
  return { id, kind: 'written', field: e.f, subject: f.subject, fieldName: f.name, level: e.lv, levelName: LEVELS[e.lv],
    minutes: e.t || null, theme: e.th || null, tags: e.tg || [], formats: e.fm || [], concepts: e.c || [], misconceptions: e.m || [],
    lab: b ? b.zk || null : (e.zk ? { page: e.zk.split('/')[0], key: e.zk.split('/')[1] } : null), verified: !!e.ok,
    html: b ? { q: b.q, a: b.a, s: b.s, k: b.k } : null, figs: b ? b.figs || {} : null,
    grading: e.in ? { format: 'lemma-input/1', spec: b ? b.in : null } : null,
    hints: b && b.k ? [b.k] : [], laws: b ? b.laws || [] : [], choices: b ? b.choices || null : null };
}

export const subjectsWithFields = () =>
  SUBJECT_ORDER.map(s => ({ name: s, fields: FIELDS.filter(f => f.subject === s) })).filter(x => x.fields.length);

export function pool({ fields = null, levels = null, formats = null } = {}) {
  const fs = fields && new Set(fields), ls = levels && new Set(levels), ms = formats && new Set(formats);
  return ENTRIES.filter(e => (!fs || fs.has(e.f)) && (!ls || ls.has(e.lv)) && (!ms || (e.fm || []).some(x => ms.has(x))));
}

// 単元が連続しないように並べる（交互練習）
function interleave(list) {
  const out = [], rest = list.slice();
  while (rest.length) {
    const prev = out.length ? out[out.length - 1].f : null;
    let i = rest.findIndex(e => e.f !== prev);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// 頻出度（難易度とは別。1=低 2=中 3=高。付いていない問題は 2）
export const VALUES = { 1: '低', 2: '中', 3: '高' };
export const valueOf = (e) => (e && e.v) || 2;
// 演習：まだ解いていない問題を無作為に、次に久しぶりの問題を優先。
// まだ解いていない問題は、頻出度の高いものほど先に選ばれやすい（重み 1・2・4 の重みつき無作為抽出）
const VALUE_WEIGHT = { 1: 1, 2: 2, 3: 4 };
export function pickPractice(state, { fields = null, levels = null, formats = null, size = 8 } = {}) {
  const cand = pool({ fields, levels, formats }).map(e => {
    const rec = state.problems[e.id];
    return { e, key: rec ? rec.last : -1e15 - 1e14 * Math.pow(Math.random(), 1 / VALUE_WEIGHT[valueOf(e)]) };
  }).sort((a, b) => a.key - b.key).slice(0, size).map(x => x.e);
  // 分野の偏りを避けるため、選んだ問題をシャッフルしてから交互に並べる
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  return interleave(cand).map(e => ({ kind: 'problem', pid: e.id }));
}

// 復習：問題ごとの記憶の見込みが下がったもの
export function dueEntries(state, { fields = null } = {}, now = Date.now()) {
  const fs = fields && new Set(fields);
  return ENTRIES.filter(e => state.pstat[e.id] && (!fs || fs.has(e.f)))
    .map(e => ({ e, R: retrievability(state.pstat[e.id], now) }))
    .filter(x => x.R < TARGET_R).sort((a, b) => a.R - b.R).map(x => x.e);
}
export function pickReview(state, { fields = null, size = 8 } = {}) {
  return interleave(dueEntries(state, { fields }).slice(0, size)).map(e => ({ kind: 'problem', pid: e.id }));
}
export function nextReviewTime(state) {
  const ts = Object.values(state.pstat || {}).map(dueAt);
  return ts.length ? Math.min(...ts) : null;
}

// 今日の演習：復習待ちを先に（忘れかけ順）、残りを新しい問題で埋める。
// weak（苦手分野のキー）があれば、新しい問題のうち最大2問をその分野から選ぶ。分野が続かないよう交互に並べる。
// 推薦の順：復習の時期が来た問題（scheduler。新しい学習の枠を残す）→ 要復習の概念 → 未学習の概念 → 概念を違う文脈で
// → 苦手分野 → 新しい問題。復習以外は、1つの分野から1回の3分の1まで（偏らせない）。
// 各問題に、選んだ理由（why）を付ける。理由は選んだ規則そのもので、ランダムに選んだものは「新しい問題」とだけ書く。
// tech（省略可）：mastery.js の techCandidates の結果（GAIA では概念）に { name(id), transferWhy(techId, pid) } を足したもの
export function pickToday(state, { levels = null, size = 8, weak = null, weakName = '', tech = null } = {}) {
  const lv = levels && new Set(levels);
  const last = new Map(); for (const l of state.log) last.set(l.p, l);
  const out = [];
  const used = new Set();
  const add = (e, why, tag) => { out.push({ e, why, tag }); used.add(e.id); };
  // 復習が積み上がっても新しい学習が止まらないようにする（残りの復習は「復習だけ」から解ける）
  const dueAll = dueEntries(state);
  // 新しい学習の枠は最低 3問（復習が1回分の4倍より多くたまっているときは 2問）。残りを復習に使う。
  // 復習も1つの分野から1回の半分まで（1分野に偏った過去の記録で、復習が1分野で埋まらないように）
  const newMin = Math.min(size, dueAll.length > 4 * size ? 2 : 3);
  const dueFieldCap = Math.max(2, Math.ceil(size / 2));
  const dueN = {};
  for (const e of dueAll) {
    if (out.length >= Math.max(0, size - newMin)) break;
    if ((dueN[e.f] || 0) >= dueFieldCap) continue;
    dueN[e.f] = (dueN[e.f] || 0) + 1;
    add(e, (last.get(e.id) || {}).g < 3 ? '前回完答できなかった問題の復習' : '復習の時期', 'due');
  }
  const room = () => size - out.length;
  const fieldCap = Math.max(2, Math.ceil(size / 3));
  // 復習以外：1つの分野から1回の3分の1まで、かつ復習と合わせて半分まで
  const fieldN = (f) => {
    const nd = out.filter(x => x.tag !== 'due' && x.e.f === f).length, all = out.filter(x => x.e.f === f).length;
    return all >= dueFieldCap ? Infinity : nd;
  };
  // 概念の問題から1問：選んだ難易度の中で、未着手をやさしい順（頻出度の高い順）
  const fromTech = (t, pred = () => true) => {
    const c = t.main.map(id => entryById.get(id)).filter(e => e && !used.has(e.id) && (!lv || lv.has(e.lv)) && !state.problems[e.id] && fieldN(e.f) < fieldCap && pred(e));
    c.sort((a, b) => a.lv - b.lv || ((b.v || 2) - (a.v || 2)));
    return c[0] || null;
  };
  if (tech) {
    // 復習以外の枠：要復習の概念・新しい概念・転用を1問ずつ（枠が5問以上あるときだけ要復習の概念を2問）
    const free = room(), revMax = free >= 5 ? 2 : 1;
    let nRev = 0;
    // 直近24時間にその概念の問題を解いていれば次の概念へ（同じ概念を毎回続けて出さない）
    const recentT = (t) => t.ids.some(id => state.problems[id] && Date.now() - state.problems[id].last < 86400000);
    for (const t of tech.review) { if (room() <= 0 || nRev >= revMax) break; if (recentT(t)) continue; const e = fromTech(t); if (e) { add(e, `要復習の概念「${tech.name(t.id)}」を立て直す`, 'tech'); nRev++; } }
    for (const t of tech.fresh.slice(0, 3)) { if (room() <= 0 || out.some(x => x.tag === 'new')) break; const e = fromTech(t); if (e) add(e, `まだ学んでいない概念「${tech.name(t.id)}」を学ぶ`, 'new'); }
    // 転用：mastery.js の transferTargets（知らされずに完答した文脈と違う文脈の、主な概念の未着手問題）から
    for (const t of tech.transfer.slice(0, 3)) {
      if (room() <= 0 || out.some(x => x.tag === 'transfer')) break;
      const set = new Set(tech.targets.get(t.id) || []);
      const e = fromTech(t, (x) => set.has(x.id));
      if (e) add(e, tech.transferWhy(t.id, e.id), 'transfer');
    }
  }
  const take = (cfg, n) => {
    const got = [];
    // 分野の上限で飛ばす分があるので、候補は選んだ難易度の問題すべてから順に見る（制限は越えない）
    for (const st of pickPractice(state, { ...cfg, size: Number.MAX_SAFE_INTEGER })) {
      const e = entryById.get(st.pid);
      if (!e || used.has(e.id) || got.includes(e)) continue;
      // 未着手が尽きたときは解いたことのある問題も候補になるが、3日以内に解いた問題は出さない
      if (state.problems[e.id] && Date.now() - state.problems[e.id].last < 3 * 86400000) continue;
      if (fieldN(e.f) + got.filter(x => x.f === e.f).length >= fieldCap) continue;
      got.push(e);
      if (got.length >= n) break;
    }
    return got;
  };
  if (weak && room() > 0) for (const e of take({ fields: [weak], levels }, Math.min(2, room()))) add(e, `苦手な分野「${weakName}」を補う`, 'weak');
  if (room() > 0) for (const e of take({ levels }, room())) add(e, state.problems[e.id] ? '解いてから日がたった問題（選んだ難易度の未着手が残っていない）' : '新しい問題', 'fresh');
  const byE = new Map(out.map(x => [x.e.id, x]));
  const count = {}; for (const x of out) count[x.tag] = (count[x.tag] || 0) + 1;
  // 出題数が足りないときの理由（制限は越えずに、足りないまま出す）
  let short = null;
  if (out.length < size) {
    const rest = pool({ levels }).filter(e => !used.has(e.id) && !(state.problems[e.id] && Date.now() - state.problems[e.id].last < 3 * 86400000)).length;
    short = { want: size, got: out.length, cause: rest === 0 ? 'pool' : 'field',
      text: rest === 0 ? `選んだ難易度で今出せる問題（未着手か、解いてから3日以上たった問題）がこれ以上ないため ${out.length}問です`
        : `1回の中で同じ分野に偏らないよう（新しい問題は1つの分野から3分の1、復習と合わせて半分まで）、${out.length}問になりました。難易度の選択を広げると増えます` };
  }
  return {
    short,
    steps: interleave(out.map(x => x.e)).map(e => ({ kind: 'problem', pid: e.id, why: byE.get(e.id).why })),
    due: count.due || 0, fresh: (count.fresh || 0) + (count.weak || 0), count, items: out.map(x => ({ pid: x.e.id, why: x.why, tag: x.tag })),
  };
}

// 類題：同じ分野で、共通のタグが多く、難易度が近い問題。未着手を優先し、次に最後に解いてから久しい順。
export function similarTo(state, id, exclude = [], techOf = null) {
  const e0 = entryById.get(id);
  if (!e0) return null;
  const ex = new Set([id, ...exclude]);
  const tg0 = new Set(e0.tg || []);
  // 概念が分かっていれば、同じ主な概念を共有する問題を強く優先（共通の概念1つ＝タグ3つ分）
  const mainOf = (pid) => ((techOf && techOf.get(pid)) || []).filter(x => x.main).map(x => x.id);
  const tc0 = new Set(((techOf && techOf.get(id)) || []).map(x => x.id));
  const main0 = new Set(mainOf(id));
  let best = null, bestKey = null;
  for (const e of ENTRIES) {
    if (e.f !== e0.f || ex.has(e.id)) continue;
    const d = Math.abs(e.lv - e0.lv);
    if (d > 1) continue;
    const common = (e.tg || []).filter(t => tg0.has(t)).length
      + 3 * mainOf(e.id).filter(x => main0.has(x)).length
      + ((techOf && techOf.get(e.id)) || []).filter(x => tc0.has(x.id)).length;
    const rec = state.problems[e.id];
    // 比べる順：共通タグ（多いほど先）→ 未着手 → 難易度の差 → 久しぶり
    const key = [-common, rec ? 1 : 0, d, rec ? rec.last : 0, e.id];
    if (!best || cmpKey(key, bestKey) < 0) { best = e; bestKey = key; }
  }
  return best && bestKey[0] < 0 ? best : null;
}
const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };

// ---------- 概念（Lemma の「解法カード」にあたるもの）：data/knowledge.json の concepts と問題の結びつき ----------
//   問題の concepts の先頭が主な概念、残りが補助。必須の前提（pre）は concepts.json の requires。
//   戻り値：{ list: [{ id, name, field, pre, laws, ids, main }], byId, byProblem: 問題ID → [{ id, main }], groups: [{ id, name }] }
export function conceptIndex(K) {
  const byProblem = new Map();
  const list = K.concepts.map(c => ({ id: c.id, name: c.name, field: c.field, pre: (c.requires || []).slice(), rec: [], rel: [], alt: [], laws: c.laws || [], ids: [], main: [] }));
  const byId = new Map(list.map(c => [c.id, c]));
  for (const e of ENTRIES) {
    (e.c || []).forEach((cid, i) => {
      const c = byId.get(cid); if (!c) return;
      c.ids.push(e.id); if (i === 0) c.main.push(e.id);
      if (!byProblem.has(e.id)) byProblem.set(e.id, []);
      byProblem.get(e.id).push({ id: cid, main: i === 0 });
    });
  }
  for (const c of list) c.pre = c.pre.filter(x => byId.has(x));
  const fieldName = {}; for (const f of FIELDS) fieldName[f.fieldKey] = f.subject;
  const groups = [...new Set(list.map(c => c.field))].map(k => ({ id: k, name: fieldName[k] || k }))
    .sort((x, y) => (SUBJECT_ORDER.indexOf(x.name) + 1 || 99) - (SUBJECT_ORDER.indexOf(y.name) + 1 || 99));
  return { list, byId, byProblem, groups };
}
export async function loadConcepts() { return conceptIndex(await loadKnowledge()); }

// ---------- 探究（data/lab.json を初めて使うときに読む） ----------
let lab = null;
export async function loadLab() {
  if (!lab) {
    lab = fetch('data/lab.json').then(r => { if (!r.ok) throw new Error(`data/lab.json を読めません（${r.status}）`); return r.json(); })
      .then(d => { if (META.dataVersion && d.dataVersion !== META.dataVersion) staleData.add('data/lab.json'); return d; })
      .catch(e => { lab = null; throw e; });
  }
  return lab;
}

// ---------- 検索（data/search.json を初めて使うときに読む） ----------
// 比較用の正規化：tools/tags.py の norm() と同じ規則（全角半角・大文字小文字・中黒や空白の違いを無視）
export const normText = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[・･\s、,／/()（）「」\-−ー~〜]/g, '');
let searchIndex = null;
export async function loadSearch() {
  if (!searchIndex) {
    searchIndex = fetch('data/search.json').then(r => { if (!r.ok) throw new Error(`data/search.json を読めません（${r.status}）`); return r.json(); })
      .then(d => { if (META.dataVersion && d.dataVersion !== META.dataVersion) staleData.add('data/search.json'); return d.items; })
      .catch(e => { searchIndex = null; throw e; });
  }
  return searchIndex;
}
// 空白で区切った語をすべて含む問題を返す。タグが語と一致 > テーマに含む > 本文に含む の順、同点は易しい順
export async function searchProblems(query, { levels = null } = {}) {
  const terms = String(query || '').split(/[\s　]+/).map(normText).filter(Boolean);
  if (!terms.length) return [];
  const items = await loadSearch();
  const ls = levels && new Set(levels);
  const out = [];
  for (const [id, text] of items) {
    if (!terms.every(t => text.includes(t))) continue;
    const e = entryById.get(id);
    if (!e || (ls && !ls.has(e.lv))) continue;
    const tags = (e.tg || []).map(normText), theme = normText((e.th || '').replace(/<[^>]+>|\$[^$]*\$/g, ''));
    let score = 0;
    for (const t of terms) score += tags.includes(t) ? 3 : theme.includes(t) ? 2 : tags.some(x => x.includes(t)) ? 1.5 : 1;
    out.push({ e, score });
  }
  out.sort((a, b) => b.score - a.score || a.e.lv - b.e.lv || (a.e.id < b.e.id ? -1 : 1));
  return out.map(x => x.e);
}

// ---------- 問題セット（data/collections.json） ----------
let collections = null;
export async function loadCollections() {
  if (!collections) {
    collections = fetch('data/collections.json').then(r => r.ok ? r.json() : { collections: [] })
      .then(d => (d.collections || []).map(c => ({ ...c, items: c.items.filter(it => entryById.has(it.id)) })).filter(c => c.items.length))
      .catch(() => { collections = null; return []; });
  }
  return collections;
}
// セットの順番どおりに、まだ解いていない問題から。全部解いたら、最後に解いてから久しい順
export function pickCollection(state, col, size = 8) {
  const ids = col.items.map(it => it.id);
  const fresh = ids.filter(id => !state.problems[id]);
  const done = ids.filter(id => state.problems[id]).sort((a, b) => state.problems[a].last - state.problems[b].last);
  return [...fresh, ...done].slice(0, size).map(pid => ({ kind: 'problem', pid }));
}
export const collectionProgress = (state, col) => col.items.filter(it => state.problems[it.id]).length;
