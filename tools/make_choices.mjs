// 選択式の選択肢を作る（content/choices.json）。AI ではなく決まった手順なので、何度実行しても同じ結果になる。
//   node tools/make_choices.mjs           作り直して書き出す
//   node tools/make_choices.mjs --check   書き出さずに、今のファイルと同じか確かめる（違えば終了コード 1）
//
// 入力用の答えの欄ごとに [正解, 誤り, 誤り, 誤り]（先頭が正解。アプリが並びを混ぜる）を作る。作れない欄は null。
//   選ぶ{…}・並べる{…} … もともと選んで答える欄なので作らない（null）
//   語{…}   … 手で書いた誤りの選択肢（problem.json の answer.parts[].distractors）→ 用語のつながりで対比・関連する用語
//             → 同じ単元の別の問題の答え → 同じ単元の用語、の順に、アプリの採点で不正解になるものだけ
//   約{…}   … 2倍・半分・10倍など、ありがちな取り違えの値（有効数字で丸めて、正解と重ならないもの）
//   数式    … 作らない（入力のまま）
// 誤りの選択肢は、アプリと同じ採点（js/answer.js の checkField）で必ず不正解になることを確かめる。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSpec, checkField, normWord, sciTeX, roundSig, unitTeX } from '../js/answer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = path.join(root, 'content');
const OUT = path.join(content, 'choices.json');

// FNV-1a（並びを決めるための値。乱数は使わない）
function h32(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
const byHash = (seed) => (a, b) => h32(seed + '|' + a) - h32(seed + '|' + b);

function problems() {
  const out = [];
  for (const f of fs.readdirSync(path.join(content, 'problems')).sort()) {
    for (const id of fs.readdirSync(path.join(content, 'problems', f)).sort()) {
      const p = JSON.parse(fs.readFileSync(path.join(content, 'problems', f, id, 'problem.json'), 'utf8'));
      if (p.quality.status === 'published') out.push(p);
    }
  }
  return out;
}
// build_data.py の grading_spec と同じまとめ方（1行1小問）
function specText(p) {
  const lines = p.answer.parts.filter(x => x.grading).map(x => (x.id === 'main' ? x.grading : `(${x.id}) ${x.grading}`));
  return lines.length ? lines.join('\n') : null;
}
// 語の形：時刻・方位・走向・傾斜・回る向きは、同じ形の語どうしでしか誤りの選択肢にしない
function shape(w) {
  const t = String(w).normalize('NFKC');
  if (/^\d+時\d+分$|^\d+:\d+$/.test(t)) return 'time';
  if (/^[東西南北]$/.test(t)) return 'dir';
  if (/^[NS]\d+°?[EW]$|^(EW|NS)$/.test(t)) return 'strike';
  if (/^\d+°?[NSEW]{1,2}$/.test(t)) return 'dip';
  if (/回り$|回転しない/.test(t)) return 'turn';
  if (/\d/.test(t)) return 'num';
  return 'text';
}
const wrongFor = (f, text) => { try { const r = checkField(f, { mode: 'plain', text }); return r.ok === false && !r.syntax; } catch { return false; } };

export function build() {
  const terms = JSON.parse(fs.readFileSync(path.join(content, 'geo', 'terms.json'), 'utf8'));
  const tById = new Map(terms.terms.map(t => [t.id, t]));
  const tByNorm = new Map();
  for (const t of terms.terms) for (const n of [t.name, ...(t.aka || [])]) if (!tByNorm.has(normWord(n))) tByNorm.set(normWord(n), t);
  const nb = new Map();   // 用語 → [{ id, rel }]
  for (const l of terms.links) {
    for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) { if (!nb.has(a)) nb.set(a, []); nb.get(a).push({ id: b, rel: l.rel }); }
  }
  const P = problems();
  // 単元ごとの語句の答え（別の問題の答えを誤りの候補にする）
  const wordsByUnit = new Map();
  const specs = new Map();
  for (const p of P) {
    const s = specText(p);
    if (!s) continue;
    const spec = parseSpec(s);
    specs.set(p.id, spec);
    for (const part of spec.parts) for (const f of part.fields) if (f.kind === 'word') {
      if (!wordsByUnit.has(p.unit)) wordsByUnit.set(p.unit, []);
      wordsByUnit.get(p.unit).push(f.accept[0]);
    }
  }
  const out = {};
  const stat = { word: 0, approx: 0, none: 0 };
  for (const p of P) {
    const spec = specs.get(p.id);
    if (!spec) continue;
    const partsWithGrading = p.answer.parts.filter(x => x.grading);
    const list = [];
    spec.parts.forEach((part, pi) => part.fields.forEach((f, fi) => {
      const seed = `${p.id}#${pi}.${fi}`;
      const hand = part.fields.length === 1 ? (partsWithGrading[pi].distractors || []) : [];
      let ch = null;
      if (f.kind === 'word') ch = wordChoices(f, p, seed, hand);
      else if (f.kind === 'approx') ch = approxChoices(f, seed, hand);
      if (ch) stat[f.kind]++; else if (f.kind === 'word' || f.kind === 'approx') stat.none++;
      list.push(ch);
    }));
    if (list.some(Boolean)) out[p.id] = list;
  }
  return { out, stat };

  function wordChoices(f, p, seed, hand) {
    const acc = new Set(f.norm);
    const t0 = f.norm.map(n => tByNorm.get(n)).find(Boolean);
    const shape0 = shape(f.accept[0]);
    const cands = [];   // [優先度, 語]
    hand.forEach((w, i) => cands.push([0, w, i]));
    if (shape0 === 'dir') for (const d of '東西南北') cands.push([1, d]);
    if (shape0 === 'text') {
      // 用語のつながりで「対比」の相手だけを使う。ほかの関係（例・部分・関連）は、上位の分類や言いかえで
      // 正解とも言えてしまうことがあるので使わない。代わりに、同じ単元で正解とつながっていない用語を使う
      const linked = new Set(t0 ? (nb.get(t0.id) || []).map(x => x.id) : []);
      if (t0) {
        for (const x of nb.get(t0.id) || []) if (x.rel === 'contrast') { const t = tById.get(x.id); if (t) cands.push([1, t.name]); }
        for (const t of terms.terms) if (t.unit === t0.unit && t.id !== t0.id && !linked.has(t.id)) cands.push([2, t.name]);
      }
      for (const w of wordsByUnit.get(p.unit) || []) if (!t0 || !linked.has((tByNorm.get(normWord(w)) || {}).id)) cands.push([3, w]);
      for (const t of terms.terms) if (t.unit === p.unit && !linked.has(t.id)) cands.push([4, t.name]);
    }
    const accText = f.accept.map(normWord);
    const ok = (w, pr) => {
      const n = normWord(w);
      if (!n || acc.has(n)) return false;
      if (pr > 0 && shape(w) !== shape0) return false;   // 時刻・方位・走向などは同じ形の語どうしだけ
      // 正解の言いかえ（どちらかがもう一方を含む）や、正解と同じ用語の別名は誤りにしない
      if (pr > 0 && accText.some(a => a.includes(n) || n.includes(a))) return false;
      const t = tByNorm.get(n);
      if (t && t0 && t.id === t0.id) return false;
      if (t && [t.name, ...(t.aka || [])].some(x => acc.has(normWord(x)))) return false;
      return wrongFor(f, w);
    };
    const picked = [], seen = new Set();
    const sorted = cands.sort((a, b) => a[0] - b[0] || (a[0] === 0 ? a[2] - b[2] : byHash(seed)(a[1], b[1])));
    for (const [pr, w] of sorted) {
      const n = normWord(w);
      if (seen.has(n)) continue;
      seen.add(n);
      // 長さが極端に違う語は、見た目で正解が分かるので避ける（手で書いたものは除く）
      if (pr > 0 && (w.length > Math.max(12, f.accept[0].length * 3) || /[$\\]/.test(w))) continue;
      if (ok(w, pr)) picked.push(w);
      if (picked.length === 3) break;
    }
    return picked.length === 3 ? [f.accept[0], ...picked] : null;
  }

  function approxChoices(f, seed, hand) {
    const v = f.value;
    if (!Number.isFinite(v) || v === 0) return null;
    const tex = (x) => `$${sciTeX(x, f.sig)}${unitTeX(f.unit)}$`;
    const r = (x) => roundSig(x, f.sig);
    // ありがちな取り違え：2倍・半分・10倍・10分の1・4倍・4分の1（正解だけが「真ん中」にならない組を選ぶ）
    const SETS = [[2, 0.5, 10], [0.5, 2, 0.1], [2, 4, 0.5], [0.5, 0.25, 2], [10, 0.1, 2], [4, 2, 0.5]];
    const vals = [];
    for (const w of hand) { const x = Number(w); if (Number.isFinite(x)) vals.push(x); }
    for (const k of SETS[h32(seed) % SETS.length]) vals.push(v * k);
    for (const k of [3, 1 / 3, 100, 0.01]) vals.push(v * k);
    const used = new Set([tex(r(v))]), picked = [];
    for (const x of vals) {
      const t = tex(r(x));
      if (used.has(t) || !wrongFor(f, String(r(x)))) continue;
      if (f.unit === '%' && Math.abs(r(x)) > 100) continue;   // 100% を超える割合は選択肢にしない
      used.add(t); picked.push(t);
      if (picked.length === 3) break;
    }
    return picked.length === 3 ? [tex(r(v)), ...picked] : null;
  }
}

const stable = (v) => JSON.stringify(v, null, 1) + '\n';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { out, stat } = build();
  const text = stable({ schema: 'gaia.choices/1', note: 'tools/make_choices.mjs が作る（手で編集しない）。先頭が正解', choices: out });
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.log('content/choices.json が古くなっています → node tools/make_choices.mjs'); process.exit(1); }
    console.log(`選択肢は最新です（語句 ${stat.word}・数値 ${stat.approx}・作れない欄 ${stat.none}）`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`content/choices.json：語句 ${stat.word}欄・数値 ${stat.approx}欄（作れない欄 ${stat.none}）`);
  }
}
