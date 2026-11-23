import { mountFigures, setFigureEsc } from './problem/figures.js';
// 版の確認用（古いファイルに FILE_VERSION が無くても読み込みが止まらないよう名前空間で取り込む）
import * as M_FIG from './problem/figures.js';
import * as M_SCHED from './scheduler.js';
import * as M_PARSER from './parser.js';
import * as M_CAT from './catalog.js';
import * as M_ANS from './answer.js';
import * as M_UI from './ui.js';
import * as M_STORE from './store.js';
import * as M_MAST from './mastery.js';
import { freshState, createStore, audit, makeBackup, readBackup, restoreState, counts, mergeState, BROKEN_PREFIX } from './store.js';
import { parseSpec, checkField, fieldHint, fieldUnit, fieldTeX, condTeX, exprTeX, fieldAnswerHTML, ceFix, CHEM_KINDS } from './answer.js';
import { ICON, play, setSound, applyTheme, MASCOT_SVG, MASCOT_NAME, mascotMessage } from './ui.js';
import { review, retrievability, dayKey } from './scheduler.js';
import {
  LEVELS, SUBJECT_ORDER, FIELDS, ENTRIES, META, FORMATS, VALUES, fieldByKey, entryById, loadCatalog, ensureBodies, getBody,
  subjectsWithFields, pool, pickPractice, pickReview, dueEntries, nextReviewTime, loadKnowledge, loadLab, pickToday, similarTo,
} from './catalog.js';
import { techMastery, techCandidates, masterChecklist, makeCtx, transferTargets, transferWhy, MASTER, STATUS, TRANSFER, TRANSFER_KIND } from './mastery.js';

const VERSION = '0.2.0';
const KEY = M_STORE.KEY;   // gaia.v1（同じドメインの Lemma（lemma.v2）・ぶつりば・CELESTIA と混ざらない名前）
let sync = null, syncApplying = false, syncStatus = null;   // アカウントと同期（initSync で用意）
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// ---------- 保存（読み書き・移行・控えは js/store.js。Lemma v0.23〜 と同じ仕組み） ----------
//   読めない記録は上書きせずに退避、保存に失敗したら前の記録のまま、別のタブの保存とは合わせてから保存する。
// localStorage そのものを使えない環境（一部のプライベートモード・保存を禁止した設定）だけ、この画面の中だけで動く。
let LS, noStorage = false;
try { LS = window.localStorage; if (!LS) throw new Error('no localStorage'); } catch {
  noStorage = true;
  const m = new Map();
  LS = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const store = createStore(LS, { app: VERSION });
const boot = store.load();
let state = boot.state;
// 設定・選んだ分野などが変わった時刻（端末どうしで食い違ったら新しい方を採る）
let lwwSig = null;
let saveWarned = false;
let persistAsked = false;
const SAVE_MSG = {
  quota: 'この端末の保存領域がいっぱいで、記録を保存できませんでした（前に保存した記録は残っています）。設定から書き出しておいてください。',
  write: 'この端末に記録を書き込めませんでした（前に保存した記録は残っています）。設定から書き出しておいてください。',
  read: 'この端末に保存した記録を読めないため、上書きしないよう保存を止めています。しばらくしてから再読み込みしてください。',
  verify: '記録を保存できたか確かめられませんでした。設定から書き出しておいてください。',
  verify_read: '記録を保存できたか確かめられませんでした。設定から書き出しておいてください。',
  conflict: 'ほかの画面と同時に保存が重なりました。この画面の記録は残っています。もう一度操作すると保存します。',
  invalid: '記録の形が正しくないため、保存を止めました（前に保存した記録は残っています）。設定から書き出しておいてください。',
  broken: '読めなかった記録を退避できなかったため、この端末への保存を止めています。設定から書き出しておいてください。',
  migrate: '記録を新しい形に移せなかったため、元の記録を守るよう保存を止めています。アプリを更新してから再読み込みしてください。',
  newer: '新しい版の GAIA で保存された記録なので、この版では保存しません（元の記録はそのまま）。ページを再読み込みしてアプリを更新してください。',
  serialize: '記録を保存できませんでした。設定から書き出しておいてください。',
};
const BIG = 3e6;   // 保存している記録がこの文字数を超えたら1回知らせる（localStorage は多くのブラウザで約500万文字）
let bigWarned = false;
const lwwOf = (st) => JSON.stringify([st.settings, st.practice, st.labPrefs]);
function save() {
  const sig = lwwOf(state);
  if (lwwSig !== null && sig !== lwwSig) state.settingsAt = Date.now();
  lwwSig = sig;
  const r = store.save(state);
  // 別のタブが先に保存していた：その記録と合わせた結果を、この画面の記録にも入れる（同じオブジェクトのまま）
  if (r.merged) {
    for (const k of Object.keys(state)) if (!(k in r.merged)) delete state[k];
    for (const k of Object.keys(r.merged)) state[k] = r.merged[k];
    lwwSig = lwwOf(state);   // ほかのタブで変えた設定を、この画面で変えたことにしない
  }
  if (!r.ok && !saveWarned) {   // 黙って失うと気づけないので、1回だけ知らせる
    saveWarned = true; setTimeout(() => toast(SAVE_MSG[r.reason] || SAVE_MSG.serialize), 0);
  }
  if (r.ok) saveWarned = false;
  if (r.ok && r.size > BIG && !bigWarned) { bigWarned = true; setTimeout(() => toast('保存している学習記録が大きくなり、この端末の保存領域の上限に近づいています。設定から書き出しておいてください。'), 0); }
  if (sync && !syncApplying) sync.schedule();
  return r.ok;
}

// ---------- アカウントと同期（js/sync.js を読めないときは、この機能なしで動く）
function initSync() {
  import('./sync.js').then((M) => {
    if (M.FILE_VERSION !== VERSION) showBanner(`<b>古いファイルが混ざっています（v${VERSION}）</b>js/sync.js が更新されていません。リポジトリにzipの中身をすべて上書きアップロードしてください。`);
    if (!M.enabled()) return;
    sync = M.createSync({
      getState: () => state,
      applyState: (merged) => {
        syncApplying = true;
        // 通信している間にこの端末で解いた分を落とさないよう、今の記録ともう一度合わせてから入れる
        merged = mergeState(state, merged);
        for (const k of Object.keys(merged)) state[k] = merged[k];
        save();
        syncApplying = false;
        // 解いている途中でなければ、画面を描き直して新しい記録を見せる
        const tab = (location.hash || '#today').slice(1).split('=')[0];
        if (!session && ['today', 'map', 'settings'].includes(tab) && !document.activeElement?.matches('input, textarea')) route();
      },
      onStatus: (s) => { syncStatus = s; const el = $('#acct'); if (el) drawAccount(); },
    });
    syncStatus = sync.status();
    if ((location.hash || '').startsWith('#settings')) renderSettings();
    if (sync.loggedIn()) sync.syncNow({ auto: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync.syncNow({ auto: true }); });
    window.addEventListener('online', () => sync.syncNow({ auto: true }));
  }).catch(() => { /* 同期なし */ });
}
// ログイン直後：端末とアカウントの両方に記録があるときだけ、合わせるかを聞く（共用の端末で他人の記録が混ざらないように）
async function firstSyncAfterLogin() {
  let remote = null;
  try { remote = await sync.peek(); } catch { /* 取れなければいつもの同期に任せる */ }
  if (remote && remote.n && hasRecords(state)) {
    const ln = state.log.length, last = remote.last ? new Date(remote.last).toLocaleDateString('ja-JP') : '';
    const k = await choose({ title: 'この端末の記録をアカウントに合わせますか？',
      body: `この端末に解答の記録が ${ln}件、アカウントに ${remote.n}件（最後は ${esc(last)}）あります。`,
      options: [{ key: 'merge', label: '合わせる（両方の記録を残す）', cls: 'primary' },
        { key: 'remote', label: 'アカウントの記録だけを使う（この端末の分は書き出してから消す）' }] });
    if (k === 'remote') {
      download(`gaia-この端末の記録-${dayKey()}.json`, JSON.stringify(makeBackup(state, VERSION), null, 1), 'application/json');
      // 端末の記録を空にしてから同期すると、アカウントの記録だけになる（設定は端末のまま）
      //   fence：ほかのタブに残っている古い記録が、あとで持ち込まれないようにする
      const next = { ...freshState(), settings: state.settings, practice: state.practice, settingsAt: state.settingsAt, labPrefs: state.labPrefs };
      const r = store.replace(state, next, null, { fence: true });
      if (!r.ok) { toast(`${SAVE_MSG[r.reason] || SAVE_MSG.write}（切り替えていません）`); await sync.logout(); return; }
      state = r.state; lwwSig = null; session = null;
      await sync.syncNow(); toast('アカウントの記録に切り替えました'); route(); return;
    }
    if (!k) { await sync.logout(); toast('ログインを取りやめました'); return; }
  }
  await sync.syncNow(); toast('ログインしました'); route();
}
function drawAccount() {
  const box = $('#acct');
  if (!box) return;
  if (!sync) { box.innerHTML = '<p class="muted" style="margin:0">この版では同期を使えません。</p>'; return; }
  const s = syncStatus || sync.status();
  if (!sync.loggedIn()) {
    box.innerHTML = `
      <p style="margin:0 0 10px">ログインすると、学習記録を複数の端末で使え、サーバーにも保存されます。ログインしなくても、今まで通りこの端末だけで使えます。</p>
      <div id="acct-step1">
        <input class="field-in" type="email" id="acct-email" placeholder="メールアドレス" autocomplete="email" inputmode="email">
        <button class="btn primary block" id="acct-send" style="margin-top:8px">ログイン用のコードを送る</button>
      </div>
      <div id="acct-step2" hidden>
        <p class="muted" style="margin:0 0 6px"><span id="acct-to"></span> に届いたコード（数字）を入れてください（届くまで1分ほどかかることがあります）。</p>
        <input class="field-in code" type="text" id="acct-code" placeholder="123456" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
        <button class="btn primary block" id="acct-verify" style="margin-top:8px">ログイン</button>
        <button class="linkbtn" id="acct-back" style="margin-top:6px">メールアドレスを入れ直す</button>
      </div>
      <p class="acct-err" id="acct-err">${s.error ? esc(s.error) : ''}</p>
      <p class="muted small" style="margin:6px 0 0">保存するのはメールアドレスと学習記録だけです。<a href="privacy.html">プライバシーポリシー</a>・<a href="terms.html">利用規約</a></p>`;
    const err = (m) => { $('#acct-err').textContent = m || ''; };
    $('#acct-send').addEventListener('click', async (ev) => {
      const email = $('#acct-email').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err('メールアドレスを確かめてください。'); return; }
      ev.target.disabled = true; err('');
      try {
        await sync.sendCode(email);
        $('#acct-step1').hidden = true; $('#acct-step2').hidden = false; $('#acct-to').textContent = email;
        $('#acct-code').focus();
      } catch (e) { err(e.message); }
      ev.target.disabled = false;
    });
    $('#acct-email').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('#acct-send').click(); });
    $('#acct-code').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('#acct-verify').click(); });
    $('#acct-back').addEventListener('click', () => { $('#acct-step1').hidden = false; $('#acct-step2').hidden = true; err(''); });
    $('#acct-verify').addEventListener('click', async (ev) => {
      ev.target.disabled = true; err('');
      try {
        await sync.verify($('#acct-email').value.trim(), $('#acct-code').value, { autoSync: false });
        await firstSyncAfterLogin();
        drawAccount();
      } catch (e) { err(e.message); ev.target.disabled = false; }
    });
    return;
  }
  const when = s.lastSync ? new Date(s.lastSync).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'まだ';
  const label = { syncing: '同期しています…', ok: `最後の同期：${when}`, idle: `最後の同期：${when}`, offline: `オフラインのため同期待ち（最後の同期：${when}）`, error: '同期できませんでした' }[s.status] || '';
  box.innerHTML = `
    <div class="setting" style="padding-top:0"><span><b>${esc(s.email || '')}</b><br><span class="muted small" id="acct-state">${esc(label)}</span></span>
      <button class="btn" id="acct-now" ${s.status === 'syncing' ? 'disabled' : ''}>今すぐ同期</button></div>
    ${s.error && s.status !== 'offline' ? `<p class="acct-err">${esc(s.error)}${s.halted ? '<br>同じ失敗を繰り返さないよう、自動の同期を止めています。対処したら「今すぐ同期」を押してください。' : ''}</p>` : ''}
    <p class="muted small" style="margin:8px 0">アカウントは Lemma と共通です（記録は別々に保存）。この端末の記録とサーバーの記録は、解答の記録を足し合わせ、復習の予定は新しい方を使って合わせます。</p>
    <div class="btn-row" style="margin-top:4px"><button class="btn ghost" id="acct-out">ログアウト</button><button class="btn ghost danger" id="acct-del">退会する</button></div>
    <p class="muted small" style="margin:6px 0 0"><a href="privacy.html">プライバシーポリシー</a>・<a href="terms.html">利用規約</a></p>`;
  $('#acct-now').addEventListener('click', () => sync.syncNow());
  $('#acct-out').addEventListener('click', async () => {
    const k = await choose({ title: 'ログアウト', body: 'サーバーの記録はそのまま残ります。この端末の記録をどうしますか？（家族や学校の共用の端末なら、消すのがおすすめです）',
      options: [{ key: 'keep', label: 'この端末の記録は残してログアウト', cls: 'primary' }, { key: 'wipe', label: 'この端末の記録も消してログアウト' }] });
    if (!k) return;
    const synced = await sync.syncNow();
    // 消す前に、サーバーに送れたことを確かめる（送れていない記録を消さない）
    if (k === 'wipe' && !synced) { toast('サーバーと同期できなかったため、この端末の記録は消していません（ログアウトもしていません）'); drawAccount(); return; }
    await sync.logout();
    if (k === 'wipe') {
      const r = store.replace(state, { ...freshState(), settings: state.settings }, null, { fence: true });
      if (!r.ok) { toast(`${SAVE_MSG[r.reason] || SAVE_MSG.write}（この端末の記録は消していません）`); route(); return; }
      state = r.state; lwwSig = null; session = null; clearSavedSession();
    }
    toast(k === 'wipe' ? 'ログアウトし、この端末の記録を消しました' : 'ログアウトしました'); route();
  });
  $('#acct-del').addEventListener('click', async () => {
    if (!confirm('アカウントは Lemma（受験数学）と共通です。退会すると、アカウントと、GAIA・Lemma の両方でサーバーに保存した学習記録がすべて消えます（この端末の記録は残ります）。元に戻せません。')) return;
    try { await sync.deleteAccount(); toast('退会しました'); } catch (e) { toast(e.message); }
    drawAccount();
  });
}

// ---------- 表示ユーティリティ ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
function math(el) {
  if (!window.renderMathInElement) { setTimeout(() => math(el), 60); return; }
  window.renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });
}
function tex(el, src, display = false) {
  if (!window.katex) { el.textContent = src; return; }
  window.katex.render(src, el, { throwOnError: false, displayMode: display });
}
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 1800);
}
function relTime(t) {
  const d = (t - Date.now()) / 86400000;
  if (d <= 0) return '今';
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))}分後`;
  if (d < 1) return `${Math.round(d * 24)}時間後`;
  return `${Math.round(d)}日後`;
}

const view = $('#view');
let knowledgeCache = null;   // data/knowledge.json（概念・法則・誤概念）
let activeGraphs = [];   // 画面を移るときに止めるもの（探究の操作など。destroy() を持つ）
function clearGraphs() { activeGraphs.forEach(g => g.destroy()); activeGraphs = []; }

// ---------- ルーティング ----------
let session = null; // { steps, i, results: [], extra }
// 中断した演習：端末の中だけに保存（同期はしない）。答え終えた問題の次から再開する
const SKEY = 'gaia.session.v1';
function saveSession() {
  if (!session) return;
  const cur = session.steps[session.i];
  const answered = cur && session.results.length && session.results[session.results.length - 1].pid === cur.pid;
  const i = session.i + (answered ? 1 : 0);
  try {
    if (i >= session.steps.length) localStorage.removeItem(SKEY);
    else localStorage.setItem(SKEY, JSON.stringify({ steps: session.steps, i, results: session.results, cfg: session.cfg, t: Date.now() }));
  } catch { /* 保存できない環境では再開できないだけ */ }
}
function clearSavedSession() { try { localStorage.removeItem(SKEY); } catch { /* なし */ } }
function savedSession() {
  try {
    const d = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (!d || !Array.isArray(d.steps) || !Number.isInteger(d.i) || d.i >= d.steps.length) return null;
    if (Date.now() - d.t > 14 * 86400000) { clearSavedSession(); return null; }   // 2週間たったら捨てる
    const left = d.steps.slice(d.i).filter(st => st.kind !== 'problem' || entryById.has(st.pid));
    return left.some(st => st.kind === 'problem') ? d : null;
  } catch { return null; }
}

let ready = false;
let greeted = false;
let timer = null;
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function route() {
  stopTimer();
  if (!ready) { view.innerHTML = '<p class="muted" style="padding:40px 4px">問題データを読み込んでいます…</p>'; return; }
  let tab = (location.hash || '#today').slice(1);
  let arg = '';
  if (tab.includes('=')) { arg = decodeURIComponent(tab.slice(tab.indexOf('=') + 1)); tab = tab.slice(0, tab.indexOf('=')); }
  // 共有リンク：#set=<問題セットID>、#ids=<問題ID,…>（開いたら「今日」に戻してから出題）
  if (tab === 'set' || tab === 'ids') {
    history.replaceState(null, '', '#today');
    if (tab === 'set') openCollection(arg); else openIds(arg.split(',').map(x => x.trim()).filter(Boolean));
    return;
  }
  const tabOf = { practice: 'today', search: 'today', concept: 'concepts', law: 'concepts' };
  $$('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tabOf[tab] || tab)));
  document.body.dataset.tab = tab;
  clearGraphs();
  document.body.classList.remove('immersive');
  window.scrollTo(0, 0);
  $('#mascot')?.classList.remove('talk'); // 画面を移ったら吹き出しは閉じる
  if (tab === 'lab') return renderLabTab(arg);
  if (tab === 'concepts') return renderConcepts(arg);
  if (tab === 'concept') return renderConcept(arg);
  if (tab === 'law') return renderLaw(arg);
  if (tab === 'map') return renderMap();
  if (tab === 'settings') return renderSettings();
  if (tab === 'practice') return renderPractice();
  if (tab === 'search') return renderSearch(arg);
  // 結果画面を見たあとに「今日」へ戻ったら、ホームを出す
  if (session && session.shown && !session.steps[session.i]) session = null;
  if (session) return renderStep();
  return renderToday();
}
window.addEventListener('hashchange', route);

// ---------- 概念（data/knowledge.json の concepts）と概念の習熟（mastery.js） ----------
// Lemma の「解法カード」にあたるもの。問題の concepts の先頭が主な概念、残りが補助。必須の前提は concepts.json の requires。
let CON = null;   // { list, byId, byProblem, groups }
const buildCon = (K) => M_CAT.conceptIndex(K);
async function withCon(fn) {
  if (!CON) {
    try { const K = await loadKnowledge(); knowledgeCache = K; CON = buildCon(K); }
    catch (e) { view.innerHTML = `<p class="muted" style="padding:40px 4px">概念のデータを読み込めませんでした（${esc(e.message)}）。</p>`; return; }
  }
  fn();
}
const conName = (id) => { const c = CON && CON.byId.get(id); return c ? c.name : id; };
const STATUS_CLS = { none: 'st-none', learning: 'st-learning', review: 'st-review', mastered: 'st-mastered' };
const statusChip = (m) => `<span class="chip st ${STATUS_CLS[m.status]}">${STATUS[m.status]}</span>`;
const CTX = new Map();
function ctxFor(c) { if (!CTX.has(c.id)) CTX.set(c.id, makeCtx(c, entryById, CON.byProblem)); return CTX.get(c.id); }
function conM(c) { return techMastery(state, c, entryById, Date.now(), ctxFor(c)); }
function candidates() { return techCandidates(state, CON.list, entryById, Date.now(), ctxFor); }
function conChipsHTML(pid) {
  const cs = CON && CON.byProblem.get(pid);
  if (!cs || !cs.length) return '';
  return `<div class="tech-chips"><span class="muted small">この問題の概念</span>${cs.map(x => `<a class="chip tech${x.main ? ' main' : ''}" href="#concept=${esc(x.id)}" title="${x.main ? '主な概念' : '補助的に使う概念'}">${esc(conName(x.id))}</a>`).join('')}</div>`;
}
// 概念の問題から出題：選んだ難易度の中で、主な概念の問題を先に、未着手（やさしい順・頻出度の高い順）→ 久しぶりの順
function pickFromIds(ids, { levels = null, size = 8, main = null, pred = null } = {}) {
  const ls = levels && new Set(levels);
  const ms = main ? new Set(main) : null;
  return ids.map(id => entryById.get(id)).filter(e => e && (!ls || ls.has(e.lv)) && (!pred || pred(e)))
    .map(e => { const rec = state.problems[e.id]; return { e, key: [rec ? 1 : 0, ms && !ms.has(e.id) ? 1 : 0, rec ? rec.last : e.lv, -(e.v || 2)] }; })
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.key[3] - b.key[3])
    .slice(0, size).map(x => ({ kind: 'problem', pid: x.e.id }));
}

function renderConcept(id) {
  if (!CON) return withCon(() => renderConcept(id));
  const c = CON.byId.get(id);
  if (!c) { location.hash = '#concepts'; return; }
  const K = knowledgeCache;
  const pr = state.practice;
  const m = conM(c);
  const mainSet = new Set(c.main);
  const byLv = {};
  for (const pid of c.ids) { const e = entryById.get(pid); (byLv[e.lv] = byLv[e.lv] || []).push(e); }
  for (const lv in byLv) byLv[lv].sort((a, b) => mainSet.has(b.id) - mainSet.has(a.id));
  const link = (x) => { const u = CON.byId.get(x); return u ? `<a class="chip tech" href="#concept=${esc(u.id)}">${esc(u.name)}</a>` : ''; };
  const next = CON.list.filter(u => u.pre.includes(c.id)).map(u => u.id);
  const relRow = (label, ids) => ids.length ? `<dt>${label}</dt><dd class="chips">${ids.map(link).join('')}</dd>` : '';
  const laws = (c.laws || []).map(x => K && K.law[x]).filter(Boolean);
  const miscs = K ? K.misconceptions.filter(x => (x.concepts || []).includes(c.id)) : [];
  const cx = ctxFor(c);
  const inLv = pickFromIds(c.ids, { levels: pr.levels, size: pr.size, main: c.main });
  const tSet = new Set(transferTargets(state, c, cx, m));
  const transfer = m.transfer.stage === 'none' ? pickFromIds([...tSet], { levels: pr.levels, size: pr.size }) : [];
  const due = new Set(dueEntries(state).map(e => e.id));
  const dueHere = c.ids.filter(x => due.has(x));
  const checks = masterChecklist(m);
  const group = (CON.groups.find(g => g.id === c.field) || {}).name || '';
  view.innerHTML = `
    <div class="fade-in tech-page">
      <a class="back" href="#concepts">‹ 概念の一覧</a>
      <div class="kicker">${esc(group)}・概念</div>
      <h1>${esc(c.name)}</h1>
      ${c.pre.length + next.length ? `<dl class="tech-dl rel">${relRow('先に学ぶ概念', c.pre)}${relRow('この概念のあとに学ぶ', next)}</dl>` : ''}
      ${laws.length ? `<h2>使う法則</h2><div class="laws">${laws.map(lawRow).join('')}</div>` : ''}
      ${miscs.length ? `<h2>よくある誤解</h2><div class="misc-list">${miscs.map(x => `<div class="misc"><span class="wrong">✗ ${esc(x.wrong)}</span><span class="right">→ ${esc(x.right)}</span></div>`).join('')}</div>` : ''}
      <h2>あなたの習熟</h2>
      <div class="panel">
        <p style="margin:0">${statusChip(m)}　${m.n ? `${c.ids.length}問のうち ${m.n}問を解いた・最後に完答 ${m.full.length}問${m.score != null ? `・得意度 ${Math.round(m.score * 100)}` : ''}` : `${c.ids.length}問のうち、まだ1問も解いていません。`}</p>
        ${m.status === 'review' ? `<p class="small" style="margin:6px 0 0">${m.lapses.length ? `一度完答した問題を最近解けませんでした（${m.lapses.length}問）。` : m.twoMiss ? 'この概念の問題が2回続けて完答できませんでした。' : '完答できない問題が多くなっています。'}法則と誤解を読み直してから、もう一度解いてください。</p>` : ''}
        ${m.n ? recallBreakdownHTML(m) : ''}
        ${m.full.length ? transferHTML(m) : ''}
        ${dueHere.length ? `<p class="muted small" style="margin:6px 0 0">復習の時期が来ている問題：${dueHere.length}問</p>` : ''}
        ${m.status !== 'none' && m.status !== 'mastered' ? `<details class="checks"><summary>「習得」までの基準</summary><ul>${checks.map(x => `<li class="${x.ok ? 'ok' : ''}">${x.ok ? '✓' : '・'} ${esc(x.label)}<span class="muted">（いま ${x.now}）</span></li>`).join('')}</ul></details>` : ''}
        <div class="btn-row">
          <button class="btn primary" id="tgo" ${inLv.length ? '' : 'disabled'}>この概念の問題を解く ${inLv.length}問</button>
          ${m.wrong.length ? `<button class="btn" id="twrong">完答できなかった問題 ${Math.min(m.wrong.length, 20)}問</button>` : ''}
          ${transfer.length ? `<button class="btn" id="ttransfer">違う文脈で使う ${transfer.length}問</button>` : ''}
        </div>
        <p class="muted small" style="margin:8px 0 0">ホームで選んでいる難易度（${pr.levels.map(l => LEVELS[l]).join('・') || 'なし'}）の中から、この概念を主に使う問題を、まだ解いていないものからやさしい順に出します。ここから解いた結果は「概念を知らされて解いた」として記録し、習得の判定では区別します。</p>
      </div>
      <h2>この概念を使う問題</h2>
      <p class="muted small" style="margin:-4px 0 6px">主に使う ${c.main.length}問・補助的に使う ${c.ids.length - c.main.length}問。</p>
      ${Object.keys(byLv).length ? Object.keys(byLv).map(Number).sort((a, b) => a - b).map(lv => {
        const es = byLv[lv];
        const solvedN = es.filter(e => state.problems[e.id]).length;
        return `<details class="tech-lv">
          <summary><span class="chip lv${lv}">${LEVELS[lv]}</span> ${es.length}問<span class="muted small">（解いた ${solvedN}）</span><button class="btn small" data-lv="${lv}">解く</button></summary>
          <div class="results">${es.slice(0, 60).map(e => resRow(e, mainSet.has(e.id) ? '' : '補助')).join('')}</div>
        </details>`;
      }).join('') : '<p class="muted">この概念に結びついた問題はまだありません。</p>'}
    </div>`;
  math(view);
  const go = (steps) => { if (steps.length) startSession(steps.map(st => ({ ...st, why: `概念「${c.name}」の練習` })), { concept: c.id, size: steps.length }); };
  $('#tgo').addEventListener('click', () => go(inLv));
  $('#twrong')?.addEventListener('click', () => go(m.wrong.slice(0, 20).map(pid => ({ kind: 'problem', pid }))));
  $('#ttransfer')?.addEventListener('click', () => { if (transfer.length) startSession(transfer.map(st => ({ ...st, why: transferWhy(cx, st.pid, c.name) })), { concept: c.id, size: transfer.length }); });
  $$('.tech-lv summary .btn').forEach(b => b.addEventListener('click', (ev) => {
    ev.preventDefault();
    go(pickFromIds(c.ids, { levels: [+b.dataset.lv], size: pr.size, main: c.main }));
  }));
  $$('.tech-page .res-row').forEach(b => b.addEventListener('click', () => openIds([b.dataset.pid])));
}

// 想起の内訳。答えていない回は「未回答」として別に数える
function recallBreakdownHTML(m) {
  const rows = [
    ['概念を知らされずに完答', m.solo.length, '「浮かばなかった」と答えた問題を除く'],
    ['想起を確認（浮かんで完答）', m.recalled.length, '本人の回答'],
    ['浮かばなかったが完答', m.noRecall.length, '別の考え方で解けた可能性'],
    ['浮かんだが完答できず', m.missed.length, '計算・読み取りで崩れた'],
    ['想起は未回答', m.unanswered.length, '成功にも失敗にも数えない'],
  ].filter(([, n]) => n);
  if (!rows.length) return '';
  return `<table class="recall-table">${rows.map(([l, n, note]) => `<tr><th>${l}</th><td>${n}問</td><td class="muted">${note}</td></tr>`).join('')}</table>`;
}
// 転用の段階と根拠（代理の指標であることを明記）
function transferHTML(m) {
  const t = m.transfer;
  const kinds = t.kinds.map(k => TRANSFER_KIND[k]).join('・');
  const msg = {
    unavailable: 'この概念の収録問題は文脈が1種類なので、転用は判定できません（習得の条件から外しています）。',
    none: '違う2つの文脈の問題を、概念を知らされずに完答した記録がまだありません。力が足りないという意味ではなく、まだ確かめていないということです。',
    candidate: `違う文脈（${kinds}）の問題で完答しています。問題の分類からの判断で、その概念を実際に使ったかは確認していません。`,
    recalled: `違う文脈（${kinds}）の問題で完答し、その問題で概念が浮かんだという回答もあります。問題の分類と本人の回答からの判断です。`,
  }[t.stage];
  return `<p class="small" style="margin:6px 0 0"><b>違う文脈：${TRANSFER[t.stage]}</b>　${msg}</p>${m.retention === 'unknown' && m.full.length ? '<p class="small muted" style="margin:4px 0 0">今も覚えているか：問題ごとの復習の記録がない古い記録だけなので、確認できません（習得の条件を満たしません）。</p>' : ''}`;
}

// 定着度の「次にやること」：記録から当てはまる規則を上から3つまで。各規則の根拠をそのまま文にする
let NEXT_ACTS = [];
function nextActions() {
  const acts = [];
  const n = state.log.length;
  if (n < 10) return [{ text: `まだ判定に使える記録が少ないため（${n}回）、得意・苦手や概念の習熟は保留しています。あと${10 - n}問ほど解くと判定が始まります。`, label: '今日の演習へ', href: '#today' }];
  const now = Date.now(), cut = now - 14 * 86400000;
  const recent = state.log.filter(l => l.t >= cut), before = state.log.filter(l => l.t < cut);
  const rate = (ls) => ls.filter(l => l.g >= 3).length / ls.length;
  const lastOf = new Map(); for (const l of state.log) lastOf.set(l.p, l);
  if (recent.length >= 10 && before.length >= 10 && rate(recent) - rate(before) <= -0.15) {
    const ids = [...lastOf.values()].filter(l => l.t >= cut && l.g < 3 && entryById.has(l.p)).map(l => l.p).slice(-8);
    if (ids.length) acts.push({ text: `直近2週間の完答率（${Math.round(rate(recent) * 100)}%）が、それ以前（${Math.round(rate(before) * 100)}%）より下がっています。`, label: `最近完答できなかった問題を解き直す ${ids.length}問`, steps: ids.map(pid => ({ kind: 'problem', pid, why: '最近完答できなかった問題の解き直し' })) });
  }
  const due = dueEntries(state).length;
  if (due > 2 * state.practice.size) acts.push({ text: `復習の時期が来た問題が ${due}問たまっています。今日の演習では新しい問題の枠を残すため、一部しか出しません。`, label: '復習だけ解く', review: true });
  if (CON) {
    const cand = candidates();
    const rv = cand.review[0];
    if (rv) {
      const steps = pickFromIds(rv.main, { size: state.practice.size, main: rv.main }).map(st => ({ ...st, why: `要復習の概念「${rv.name}」の問題` }));
      acts.push({ text: `概念「${rv.name}」が要復習です（${STATUS_REASON(cand.ms.get(rv.id))}）。`, label: 'この概念の問題をやさしい順に', steps, concept: rv.id, card: rv.id });
    }
    const tr = cand.transfer.find(t => cand.ms.get(t.id).full.length >= 3);
    if (tr) acts.push({ text: `概念「${tr.name}」は ${cand.ms.get(tr.id).full.length}問完答していますが、転用（違う文脈の問題で、概念を知らされずに完答）はまだ確認できていません。今日の演習で、そうした問題を混ぜて出します。`, label: '今日の演習へ', href: '#today', card: tr.id });
    const nr = CON.list.find(t => cand.ms.get(t.id).noRecall.length >= 2);
    if (nr) acts.push({ text: `概念「${nr.name}」は、解けても使う概念が浮かばなかった問題が ${cand.ms.get(nr.id).noRecall.length}問あります。概念のページで法則とよくある誤解を読んでおくと、問題を見たときに浮かびやすくなります。`, label: '概念のページを開く', href: '#concept=' + nr.id });
    const fr = cand.fresh[0];
    if (fr && !acts.length) acts.push({ text: `まだ学んでいない概念のうち「${fr.name}」から始めるのがおすすめです（先に学ぶ概念を学び始めていて、問題が多い概念）。`, label: '概念のページを開く', href: '#concept=' + fr.id });
  }
  if (!acts.length) acts.push({ text: '今のところ、特に手当てが必要な点は見つかっていません。今日の演習を続けてください。', label: '今日の演習へ', href: '#today' });
  return acts.slice(0, 3);
}
function STATUS_REASON(m) {
  return m.lapses.length ? '一度完答した問題を最近解けなかった' : m.twoMiss ? '2回続けて完答できなかった' : '完答できない問題が多い';
}
function nextActionsHTML() {
  if (!NEXT_ACTS.length) return '';
  return `<div class="next-acts"><h2 style="margin-top:0">次にやること</h2>${NEXT_ACTS.map((a, i) => `<div class="next-act"><p>${esc(a.text)}</p>${a.href ? `<a class="btn small" href="${esc(a.href)}">${esc(a.label)}</a>` : `<button class="btn small primary" data-act="${i}">${esc(a.label)}</button>`}${a.card ? ` <a class="small" href="#concept=${esc(a.card)}">概念のページ ›</a>` : ''}</div>`).join('')}</div>`;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('.next-act [data-act]');
  if (!b) return;
  const a = NEXT_ACTS[+b.dataset.act];
  if (!a) return;
  if (a.review) { const steps = pickReview(state, { size: state.practice.size }); if (steps.length) startSession(steps, { review: true, size: state.practice.size }); return; }
  if (a.steps && a.steps.length) startSession(a.steps, a.concept ? { concept: a.concept, size: a.steps.length } : { size: a.steps.length });
});

// 定着度：概念の習熟（状態ごとの数・分野ごと・要復習の概念・次に学ぶとよい概念）
function conStrengthHTML() {
  if (!CON) return '';
  const cand = candidates();
  const cnt = { mastered: 0, learning: 0, review: 0, none: 0 };
  for (const m of cand.ms.values()) cnt[m.status]++;
  const touched = CON.list.length - cnt.none;
  const row = (t, extra = '') => `<a class="tech-row" href="#concept=${esc(t.id)}"><span class="nm">${esc(t.name)}</span><span class="small">${extra}</span></a>`;
  return `
    <h2>概念の習熟</h2>
    <div class="panel">
      ${touched ? `
      <div class="st-counts">${['mastered', 'learning', 'review', 'none'].map(k => `<div class="${STATUS_CLS[k]}"><b>${cnt[k]}</b><span>${STATUS[k]}</span></div>`).join('')}</div>
      <table class="st-table"><thead><tr><th></th><th>習得</th><th>学習中</th><th>要復習</th><th>未学習</th></tr></thead><tbody>
        ${CON.groups.map(g => { const ts = CON.list.filter(t => t.field === g.id); const c = { mastered: 0, learning: 0, review: 0, none: 0 }; ts.forEach(t => c[cand.ms.get(t.id).status]++); return `<tr><th>${esc(g.name)}</th>${['mastered', 'learning', 'review', 'none'].map(k => `<td class="${c[k] && k !== 'none' ? STATUS_CLS[k] : 'muted'}">${c[k]}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table>
      ${cand.review.length ? `<h3>要復習の概念</h3><div class="tech-list">${cand.review.slice(0, 5).map(t => row(t, statusChip(cand.ms.get(t.id)))).join('')}</div>` : ''}
      ${cand.fresh.length ? `<h3>次に学ぶとよい概念</h3><p class="muted small" style="margin:0 0 4px">まだ学んでいない概念のうち、先に学ぶ概念を学び始めているもの（問題の多い順）。</p><div class="tech-list">${cand.fresh.slice(0, 3).map(t => row(t, `<span class="muted">${t.main.length}問</span>`)).join('')}</div>` : ''}
      ` : `<p class="muted" style="margin:0">解いた問題に結びつく概念ごとに、未学習・学習中・要復習・習得を判定します。</p>`}
      <details class="checks"><summary>判定の基準</summary><ul>
        <li><b>習得</b>：完答 ${MASTER.full}問以上・概念を知らされずに完答 ${MASTER.solo}問以上（「浮かばなかった」と答えた問題を除く）・転用（違う2つの文脈で知らされずに完答）・3日以上あけて同じ問題をもう一度完答・得意度 ${Math.round(MASTER.score * 100)} 以上・完答した問題のどれかがまだ解き直しの時期になっていない。想起の質問に答えていない回は、想起の成功にも失敗にも数えません</li>
        <li><b>転用</b>の「違う文脈」は、問題データから分かる代理の指標（その概念の主な単元以外の問題か、ほかの概念も結びつく問題か）で、その概念を実際に使ったことを確かめたものではありません</li>
        <li><b>要復習</b>：3問以上解いて得意度 50 未満、一度完答した問題を直近30日に解けなかった、または最後の2回が続けて完答でない</li>
        <li><b>学習中</b>：解いたことがあり、上のどちらでもない</li>
      </ul><p class="muted small">問題ごとの復習（いつもう一度解くか）は、これとは別に問題ごとの記録で決めています。</p></details>
      <a class="btn ghost block" href="#concepts" style="margin-top:10px">概念の一覧へ</a>
    </div>`;
}

// ---------- 今日 ----------
function levelToolbar(pr, onChange) {
  return {
    html: `<div class="toolbar">
        <div class="toggles" id="lv">${Object.entries(LEVELS).map(([k, v]) => `<button class="tog lv${k} ${pr.levels.includes(+k) ? 'on' : ''}" data-l="${k}">${v}</button>`).join('')}</div>
        <select id="tsize" aria-label="問題数">${[4, 6, 8, 10, 15, 20].map(k => `<option value="${k}" ${k === pr.size ? 'selected' : ''}>${k}問</option>`).join('')}</select>
      </div>`,
    bind() {
      $$('#lv .tog').forEach(b => b.addEventListener('click', () => {
        const k = +b.dataset.l, set = new Set(pr.levels);
        if (set.has(k) && set.size === 1) { toast('難易度は1つ以上選んでください'); return; }
        set.has(k) ? set.delete(k) : set.add(k);
        pr.levels = [...set].sort((x, y) => x - y); save(); onChange();
      }));
      $('#tsize').addEventListener('change', (e) => { pr.size = +e.target.value; save(); onChange(); });
    },
  };
}

// 今日の演習：復習（scheduler）＋概念の習熟（mastery.js）＋苦手な単元＋新しい問題。概念のデータを読む前は概念の部分なし
function todayPlan(pr, weak) {
  const tech = CON ? { ...candidates(), name: conName, transferWhy: (id, pid) => transferWhy(ctxFor(CON.byId.get(id)), pid, conName(id)) } : null;
  return pickToday(state, { levels: pr.levels.slice(), size: pr.size, weak: weak ? weak.f.key : null, weakName: weak ? weak.f.name : '', tech });
}
function planSummary(plan) {
  const c = plan.count;
  return [c.due ? `復習 ${c.due}問` : '', c.tech ? `要復習の概念 ${c.tech}問` : '', c.new ? `新しい概念 ${c.new}問` : '',
    c.transfer ? `違う文脈の問題 ${c.transfer}問` : '', c.weak ? `苦手な単元 ${c.weak}問` : '', c.fresh ? `新しい問題 ${c.fresh}問` : ''].filter(Boolean).join('・')
    + (plan.short ? `（${plan.short.text}）` : '');
}
function renderToday() {
  const pr = state.practice;
  const solved = (list) => list.filter(e => state.problems[e.id]).length;
  const all = pool({ levels: pr.levels });
  const due = dueEntries(state).length;
  const marked = markedIds();
  const bar = levelToolbar(pr, renderToday);
  const today = dayKey();
  const doneN = state.log.filter(l => dayKey(l.t) === today).length;
  const goal = pr.size;
  const resume = savedSession();
  const weak = weakestField();
  // 今日の演習の中身をここで決め、ボタンの説明と実際の出題を一致させる
  if (!CON) loadKnowledge().then(K => { knowledgeCache = K; CON = buildCon(K); if ((location.hash || '#today') === '#today' && !session) renderToday(); }).catch(() => {});
  const plan = todayPlan(pr, weak);
  const firstRun = !state.log.length && !resume;   // 初めて：説明と「まず8問」だけを大きく出す
  const planText = planSummary(plan);
  view.innerHTML = `
    <div class="fade-in">
      <div class="kicker">GAIA · 高校地学</div>
      <h1>今日の学習</h1>
      ${firstRun ? `<div class="panel first-run">
        <p style="margin:0;line-height:1.8"><b>GAIA は、地学の問題を解きながら、現象のつながり（概念）を身につけるアプリです。</b>解いた結果から、問題ごとに解き直す時期と、概念ごとの身につき具合を記録し、次に解く問題を選びます。</p>
        <button class="hero" id="firstgo" style="margin-top:12px"><b>まず8問解いてみる</b><span>基礎〜入試基礎の問題を、単元を混ぜて出します。</span></button>
        <p class="muted small" style="margin:8px 0 0">慣れてきたら、下の難易度ボタンで範囲を変えられます。概念の一覧は下のタブの「概念」から見られます。</p>
      </div>` : ''}
      ${firstRun ? '' : `<div class="goal" aria-label="今日の進み具合">
        <span>今日 <b>${doneN}</b> / ${goal}問${doneN >= goal ? '　目標達成' : ''}</span>
        <span class="bar"><div style="width:${Math.min(100, Math.round(doneN / Math.max(1, goal) * 100))}%"></div></span>
      </div>`}
      ${resume ? `<div class="resume-row">
        <button class="hero alt" id="resume"><b>前回の続き</b><span>全${resume.steps.length}問の ${resume.i + 1}問目から再開します。</span></button>
        <button class="btn ghost small" id="dropresume">続きを破棄</button>
      </div>` : ''}
      <button class="${firstRun ? 'hero alt' : 'hero'}" id="todaygo" ${plan.steps.length ? '' : 'disabled'}>
        <b>今日の演習を始める</b>
        <span>${planText || '今は出題できる問題がありません'}。単元を混ぜて出すので、どの知識を使うかを見抜く練習になります。</span>
      </button>
      ${weak ? `<p class="weak-note">苦手な単元：<b>${esc(weak.f.name)}</b>（得意度 ${Math.round(weak.score * 100)}・${weak.n}問の結果${weak.n < 10 ? '・暫定' : ''}）<button class="linkbtn" id="weakgo">この単元だけ演習 ›</button></p>` : ''}
      ${bar.html}
      <div class="btn-row" style="margin-top:0">
        <button class="btn" id="random">全分野ランダム</button>
        ${due ? `<button class="btn" id="review">復習だけ ${due}問</button>` : ''}
        ${marked.length ? `<button class="btn" id="bmset">★ ブックマーク ${marked.length}問</button>` : ''}
      </div>
      <p class="sub" style="margin:12px 2px 0">解いた問題 ${solved(all)} / ${all.length}（選んだ難易度）</p>
      <form class="search" id="sform" role="search">
        <input type="search" id="sq" placeholder="問題を探す（例：フェーン現象、示準化石、HR図）" enterkeyhint="search" autocomplete="off">
        <button class="btn" type="submit">検索</button>
      </form>
      <div id="sets"></div>
      <h2>形式ごとに演習</h2>
      <div class="fmt-grid">${FORMATS.map(fm => {
        const list = pool({ formats: [fm.id], levels: pr.levels });
        return `<button class="fmt-card" data-fm="${fm.id}" ${list.length ? '' : 'disabled'}><b>${esc(fm.name)}</b><span>${esc(fm.desc)}</span><i>${solved(list)} / ${list.length}</i></button>`;
      }).join('')}</div>
      <h2>単元ごとに演習</h2>
      ${subjectsWithFields().map(sub => {
        const subAll = pool({ fields: sub.fields.map(f => f.key), levels: pr.levels });
        return `<div class="subj-block">
          <button class="subj-row" data-s="${esc(sub.name)}" ${subAll.length ? '' : 'disabled'}>
            <b>${esc(sub.name)}</b><span>${solved(subAll)} / ${subAll.length}</span><i>まとめて ›</i>
          </button>
          ${sub.fields.map(f => {
            const list = pool({ fields: [f.key], levels: pr.levels }), d = solved(list);
            return `<button class="unit-row" data-f="${esc(f.key)}" ${list.length ? '' : 'disabled'}>
              <span class="nm">${esc(f.name)}</span><span class="ct">${d} / ${list.length}</span>
              <span class="bar"><div style="width:${list.length ? Math.round(d / list.length * 100) : 0}%"></div></span>
            </button>`;
          }).join('')}
        </div>`;
      }).join('')}
      <div class="btn-row">
        <a class="btn ghost" href="#concepts">概念から選ぶ</a>
        <button class="btn ghost" id="pick">複数の単元を組み合わせて選ぶ</button>
      </div>
      <details class="howto">
        <summary>このアプリの学び方</summary>
        <ol style="margin:0;padding-left:1.2em">
          <li><strong>現象を「見える形」で思い浮かべてから解く。</strong>断面図なら何が何を切っているか、天体なら上から見た位置関係を先に描きます。</li>
          <li><strong>覚えたことは探究で確かめる。</strong>解いたあと「探究で確かめる」で、識別・断面図・シミュレーション・天体の図・用語のつながりに戻れます。</li>
          <li><strong>ヒントは答えを出さない。</strong>詰まったら「考え方」だけを見られます。</li>
          <li><strong>答え合わせの前に自信度を選ぶ。</strong>「わかったつもり」とのズレを定着度ページで見られます。</li>
          <li><strong>忘れかけた頃に復習。</strong>解けなかった問題・自信なく正解した問題ほど早く、解けた問題は間をあけて復習に出します。</li>
        </ol>
      </details>
    </div>`;
  bar.bind();
  if (!greeted) { greeted = true; setTimeout(() => mascotSay(mascotMessage('greet'), { sound: false }), 700); }
  const go = (fields, formats = null) => {
    const cfg = { fields, formats, levels: pr.levels.slice(), size: pr.size };
    const st = pickPractice(state, cfg);
    if (st.length) startSession(st, cfg); else toast('この条件の問題はありません');
  };
  $('#random').addEventListener('click', () => go(null));
  $('#todaygo').addEventListener('click', () => {
    if (plan.steps.length) startSession(plan.steps, { today: true, levels: pr.levels.slice(), size: pr.size }); else toast('今は出題できる問題がありません');
  });
  $('#resume')?.addEventListener('click', () => resumeSession(resume));
  $('#firstgo')?.addEventListener('click', () => {
    const steps = pickPractice(state, { levels: [0, 1, 2], size: 8 }).map(st => ({ ...st, why: 'はじめての演習（基礎〜入試基礎）' }));
    if (steps.length) startSession(steps, { levels: [0, 1, 2], size: 8 });
  });
  $('#dropresume')?.addEventListener('click', () => { if (confirm('中断した演習の続きを破棄しますか？（解いた記録は残ります）')) { clearSavedSession(); renderToday(); } });
  $('#weakgo')?.addEventListener('click', () => go([weak.f.key]));
  $$('.fmt-card').forEach(b => b.addEventListener('click', () => go(null, [b.dataset.fm])));
  $$('.unit-row').forEach(b => b.addEventListener('click', () => go([b.dataset.f])));
  $$('.subj-row').forEach(b => b.addEventListener('click', () => go(FIELDS.filter(f => f.subject === b.dataset.s).map(f => f.key))));
  $('#pick').addEventListener('click', () => { location.hash = '#practice'; });
  $('#sform').addEventListener('submit', (ev) => { ev.preventDefault(); const q = $('#sq').value.trim(); if (q) location.hash = '#search=' + encodeURIComponent(q); });
  drawSets();
  $('#review')?.addEventListener('click', () => {
    const st = pickReview(state, { size: pr.size });
    if (st.length) startSession(st, { review: true, size: pr.size });
  });
  // ブックマーク：混ぜて最大30問（交互練習になるように、付けた順ではなく混ぜる）
  $('#bmset')?.addEventListener('click', () => openIds(shuffle(marked).slice(0, 30)));
}

// ---------- 問題セット・共有リンク・検索 ----------
const shareURL = (frag) => location.href.split('#')[0] + '#' + frag;
async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
  catch { toast(url); }
}
async function drawSets() {
  const box = $('#sets');
  if (!box || !M_CAT.loadCollections) return;
  const cols = await M_CAT.loadCollections();
  if (!cols.length || !document.body.contains(box)) return;
  box.innerHTML = `<h2>問題セット</h2>${cols.map(c => {
    const done = M_CAT.collectionProgress(state, c), n = c.items.length;
    return `<div class="set-card">
      <button class="set-main" data-set="${esc(c.id)}">
        <span class="set-head"><b>${esc(c.title)}</b><span class="ct">${done} / ${n}問</span></span>
        ${c.description ? `<span class="muted set-desc">${esc(c.description)}</span>` : ''}
        <span class="bar"><div style="width:${Math.round(done / n * 100)}%"></div></span>
      </button>
      <div class="set-foot"><span class="set-go">${done >= n ? 'もう一周 ›' : done ? '続きから ›' : '始める ›'}</span><button class="linkbtn" data-share="${esc(c.id)}">リンクをコピー</button></div>
    </div>`;
  }).join('')}`;
  $$('[data-set]', box).forEach(b => b.addEventListener('click', () => openCollection(b.dataset.set)));
  $$('.set-go', box).forEach(x => x.addEventListener('click', () => openCollection(x.closest('.set-card').querySelector('[data-set]').dataset.set)));
  $$('[data-share]', box).forEach(b => b.addEventListener('click', () => copyLink(shareURL('set=' + b.dataset.share))));
}
async function openCollection(id) {
  const col = (await M_CAT.loadCollections()).find(c => c.id === id);
  if (!col) { toast('この問題セットは見つかりません'); route(); return; }
  const steps = M_CAT.pickCollection(state, col, state.practice.size);
  startSession(steps, { collection: id, size: state.practice.size });
}
function openIds(ids) {
  const ok = ids.filter(id => entryById.has(id)).slice(0, 50);
  if (!ok.length) { toast('リンクの問題が見つかりません'); route(); return; }
  startSession(ok.map(pid => ({ kind: 'problem', pid })), { ids: ok, size: ok.length });
}
function resRow(e, note = '') {
  const f = fieldByKey[e.f] || {};
  return `<button class="res-row" data-pid="${esc(e.id)}">
        <span class="nm">${e.th || esc(e.id)}${note ? `<span class="muted small note">${esc(note)}</span>` : ''}</span>
        <span class="muted small">${esc(f.subject || '')}・${esc(f.name || '')}　<span class="chip lv${e.lv}">${LEVELS[e.lv]}</span>${valueChip(e)}${state.problems[e.id] ? '　✓ 解いた' : ''}${isMarked(e.id) ? '　★' : ''}${(e.tg || []).length ? '　' + e.tg.slice(0, 3).map(esc).join('・') : ''}</span>
      </button>`;
}
let searchShown = 30;
// 検索結果の並べ方（関連度＝検索の順。同じ値どうしは関連度の順のまま）
const SORTS = { rel: '関連度', freq: '頻出度', easy: 'やさしい', hard: '難しい' };
const sortKey = () => (SORTS[state.practice.sort] ? state.practice.sort : 'rel');
// 学習状態での絞り込み：未着手・間違えた（最後の結果が完答でない）・復習待ち・ブックマーク
const SFILTERS = { all: 'すべて', fresh: '未着手', wrong: '間違えた', due: '復習待ち', marked: 'ブックマーク' };
const sfilterKey = () => (SFILTERS[state.practice.sfilter] ? state.practice.sfilter : 'all');
function filterResults(res) {
  const k = sfilterKey();
  if (k === 'all') return res;
  if (k === 'fresh') return res.filter(e => !state.problems[e.id]);
  if (k === 'marked') return res.filter(e => isMarked(e.id));
  if (k === 'due') { const d = new Set(dueEntries(state).map(e => e.id)); return res.filter(e => d.has(e.id)); }
  const last = new Map(); for (const l of state.log) last.set(l.p, l);
  return res.filter(e => { const l = last.get(e.id); return l && l.g < 3; });
}
function sortResults(res) {
  const k = sortKey(), v = (e) => (e && e.v) || 2;
  const cmp = { freq: (a, b) => v(b) - v(a) || a.lv - b.lv, easy: (a, b) => a.lv - b.lv || v(b) - v(a), hard: (a, b) => b.lv - a.lv || v(b) - v(a) }[k];
  return cmp ? res.map((e, i) => [e, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map(x => x[0]) : res;
}
async function renderSearch(q) {
  const pr = state.practice;
  const bar = levelToolbar(pr, () => renderSearch(q));
  view.innerHTML = `<div class="fade-in">
    <div class="kicker">問題を探す</div>
    <h1>検索</h1>
    <form class="search" id="sform" role="search">
      <input type="search" id="sq" value="${esc(q)}" placeholder="例：フェーン現象、示準化石、HR図" enterkeyhint="search" autocomplete="off">
      <button class="btn" type="submit">検索</button>
    </form>
    ${bar.html}
    <div id="sres"><p class="muted">探しています…</p></div>
  </div>`;
  bar.bind();
  $('#sform').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('#sq').value.trim(); searchShown = 30; location.hash = '#search=' + encodeURIComponent(v); });
  const box = $('#sres');
  if (!q) { box.innerHTML = '<p class="muted">テーマ・タグ・問題文の言葉で探せます。空白で区切ると、すべてを含む問題を探します。</p>'; return; }
  let res;
  try { res = await M_CAT.searchProblems(q, { levels: pr.levels }); }
  catch (e) { box.innerHTML = `<p class="muted">検索の索引を読めませんでした（${esc(e.message)}）。</p>`; return; }
  dataWarn();
  const found = res.length;
  res = sortResults(filterResults(res));
  const tools = `<div class="sres-tools"><select id="sfilter" aria-label="絞り込み">${Object.entries(SFILTERS).map(([k, v]) => `<option value="${k}" ${sfilterKey() === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="ssort" aria-label="並べ方">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${sortKey() === k ? 'selected' : ''}>${v}順</option>`).join('')}</select></div>`;
  const bindTools = () => {
    $('#ssort').addEventListener('change', (ev) => { pr.sort = ev.target.value; save(); renderSearch(q); });
    $('#sfilter').addEventListener('change', (ev) => { pr.sfilter = ev.target.value; save(); searchShown = 30; renderSearch(q); });
  };
  if (!found) { box.innerHTML = '<p class="muted">見つかりませんでした。言葉を短くするか、難易度の選択を広げてみてください。</p>'; return; }
  if (!res.length) { box.innerHTML = `<div class="toolbar" style="margin:4px 0 10px"><p class="sub" style="margin:0">${found}問のうち「${SFILTERS[sfilterKey()]}」の問題はありません</p>${tools}</div>`; bindTools(); return; }
  const fresh = res.filter(e => !state.problems[e.id]);
  const pickIds = [...fresh, ...res.filter(e => state.problems[e.id])].slice(0, pr.size).map(e => e.id);
  const conHits = CON ? CON.list.filter(c => c.name.includes(q.replace(/\s+/g, '')) || q.replace(/\s+/g, '').includes(c.name)).slice(0, 3) : [];
  box.innerHTML = `<div class="toolbar" style="margin:4px 0 10px"><p class="sub" style="margin:0">${sfilterKey() === 'all' ? `${res.length}問 見つかりました（未着手 ${fresh.length}問）` : `${found}問のうち「${SFILTERS[sfilterKey()]}」${res.length}問`}</p>
      ${tools}</div>
    <div class="btn-row" style="margin-top:0"><button class="btn primary" id="sgo">${pickIds.length}問 演習する</button><button class="btn ghost" id="sshare">リンクをコピー</button></div>
    ${conHits.length ? `<div class="tech-hits">${conHits.map(c => `<a class="tech-row" href="#concept=${esc(c.id)}"><b>概念</b><span>${esc(c.name)}</span><span class="muted small">${c.ids.length}問 ›</span></a>`).join('')}</div>` : ''}
    <div class="results">${res.slice(0, searchShown).map(e => resRow(e)).join('')}</div>
    ${res.length > searchShown ? `<button class="btn ghost block" id="smore">さらに表示（残り ${res.length - searchShown}問）</button>` : ''}`;
  math(box);
  $('#sgo').addEventListener('click', () => startSession(pickIds.map(pid => ({ kind: 'problem', pid })), { ids: pickIds, size: pickIds.length }));
  bindTools();
  $('#sshare').addEventListener('click', () => copyLink(shareURL('search=' + encodeURIComponent(q))));
  $('#smore')?.addEventListener('click', () => { searchShown += 60; renderSearch(q); });
  $$('.res-row', box).forEach(b => b.addEventListener('click', () => openIds([b.dataset.pid])));
}

async function startSession(steps, cfg = null) {
  view.innerHTML = '<p class="muted" style="padding:40px 4px">問題を読み込んでいます…</p>';
  // 本文と、概念・法則の登録簿（knowledge.json）をそろえてから出題する
  try {
    await Promise.all([ensureBodies(steps.map(s => s.pid).filter(Boolean)), loadKnowledge().then(k => { knowledgeCache = k; if (!CON) CON = buildCon(k); }).catch(() => {})]);
    dataWarn();
  } catch (e) { showBanner(`<b>問題を読み込めませんでした</b>${esc(e.message)}`); route(); return; }
  session = { steps, i: 0, results: [], cfg };
  saveSession();
  if (!studyStart || Date.now() - lastActivity > 15 * 60000) { studyStart = Date.now(); breakNotified = 0; }
  lastActivity = Date.now();
  const hr = new Date().getHours();
  if (hr >= 0 && hr < 4) setTimeout(() => mascotSay(mascotMessage('late')), 800);
  if (location.hash !== '#today') location.hash = '#today'; else route();
}

async function resumeSession(d) {
  const steps = d.steps.slice(d.i).filter(st => st.kind !== 'problem' || entryById.has(st.pid));
  view.innerHTML = '<p class="muted" style="padding:40px 4px">問題を読み込んでいます…</p>';
  try {
    await Promise.all([ensureBodies(steps.map(s => s.pid).filter(Boolean)), loadKnowledge().then(k => { knowledgeCache = k; if (!CON) CON = buildCon(k); }).catch(() => {})]);
    dataWarn();
  } catch (e) { showBanner(`<b>問題を読み込めませんでした</b>${esc(e.message)}`); route(); return; }
  // 進み具合の表示を保つため、解き終えた分も steps に残して i から始める
  session = { steps: [...d.steps.slice(0, d.i), ...steps], i: d.i, results: Array.isArray(d.results) ? d.results : [], cfg: d.cfg || null };
  saveSession();
  studyStart = Date.now(); breakNotified = 0; lastActivity = Date.now();
  if (location.hash !== '#today') location.hash = '#today'; else route();
}

// ---------- セッション ----------
function renderStep() {
  document.body.classList.add('immersive');
  const step = session.steps[session.i];
  if (!step) { session.shown = true; clearSavedSession(); return renderSummary(); }
  return renderProblem(step);
}

function topBar() {
  const done = session.i, total = session.steps.length;
  return `<div class="player-top">
    <button class="icon-btn" id="quit" aria-label="中断">×</button>
    <div class="progress"><div style="width:${Math.round(done / total * 100)}%"></div></div>
  </div>`;
}
function bindQuit() {
  $('#quit').addEventListener('click', () => {
    if (session.results.length && !confirm('中断しますか？ここまでの結果は保存されています。ホームの「前回の続き」から再開できます。')) return;
    saveSession(); session = null; route();
  });
}
function nextStep() { lastActivity = Date.now(); stopTimer(); session.i++; saveSession(); clearGraphs(); window.scrollTo(0, 0); renderStep(); }

const CONF = [{ id: 'low', label: '自信なし' }, { id: 'mid', label: 'たぶん' }, { id: 'high', label: '確実' }];
const FEEL = [
  { k: 1, label: '手が出ない' }, { k: 2, label: '苦戦' }, { k: 3, label: 'ふつう' }, { k: 4, label: 'ほぼ解けた' }, { k: 5, label: '余裕' },
];

// 解説を読みやすく：文の終わりで改行し、∫・Σ・lim を大きく表示する
function bigOps(html) {
  return html.replace(/\$([^$]+)\$/g, (m, body) => /\\(int|iint|sum|prod|lim)\b/.test(body) && !/\\displaystyle/.test(body) ? `$\\displaystyle ${body}$` : m);
}
function formatSolution(html) {
  if (!html) return '';
  const keep = [];
  // 数式とタグを退避してから、文末の「．」「。」の後で改行
  let t = html.replace(/\$[^$]*\$|\\\[[\s\S]*?\\\]|<[^>]+>/g, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  t = t.replace(/([．。])(?=\s*[^\s<\u0000)）」』．。,，、]|\s*\u0000\d+\u0000\s*[^<\s])/g, '$1<br>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, k) => keep[+k]);
  // 数式の直後の句読点だけが次の行に送られないようにする
  t = t.replace(/\$([^$]+)\$([．。，、])/g, (m, body, p) => `$${body}\\text{${p}}$`);
  t = t.replace(/(<br>\s*){2,}/g, '<br>').replace(/<br>\s*(<\/?(div|ol|ul|li|table)\b)/g, '$1').replace(/<br>\s*$/, '');
  return bigOps(t);
}
// 解説を小問ごとの枠に分ける（見出しバー・別解の枠・点線の区切り・答の枠）。
// 区切るのは入れ子の外の改行だけで、数式とタグの中では区切らない。
function solutionSections(html) {
  if (!html) return '';
  const lines = []; let cur = '', depth = 0, sep = null;
  const re = /\$[^$]*\$|\\\[[\s\S]*?\\\]|<br\b[^>]*>|<\/?([a-zA-Z]+)\b[^>]*>|[^$<\\]+|[\s\S]/g;
  for (const m of html.matchAll(re)) {
    const tok = m[0];
    if (/^<br\b/i.test(tok) && depth === 0) { lines.push({ sep, html: cur }); cur = ''; sep = /class="p"/.test(tok) ? 'p' : 'br'; continue; }
    const tag = m[1] && m[1].toLowerCase();
    if (tag && /^(div|ol|ul|li|table|tr|td|span|details|p)$/.test(tag) && !tok.endsWith('/>')) depth += tok[1] === '/' ? -1 : 1;
    cur += tok;
  }
  lines.push({ sep, html: cur });
  const secs = []; let sec = null, next = 1;
  for (const ln of lines) {
    const t = ln.html.replace(/^\s+/, '');
    // 小問の見出しは次の番号の (n) だけ（まとめの「(1)：…」などで区切らない）
    let num = t.match(/^\((\d+)\)\s*/);
    if (num && +num[1] !== next) num = null;
    const alt = t.match(/^<b>\s*(別解[^<]*)<\/b>\s*[：:．.]?\s*/) || t.match(/^（(別解\d*)[：:]\s*/);
    if (num || alt || !sec) {
      if (num) next++;
      const back = sec && sec.kind !== 'bekkai' ? sec : null;
      sec = { head: num ? `(${num[1]})` : alt ? alt[1].trim() : '', kind: alt ? 'bekkai' : '', paren: !!(alt && t.startsWith('（')), lines: [] };
      secs.push(sec);
      if (num || alt) { ln.html = t.slice((num || alt)[0].length); ln.sep = null; }
    }
    if (ln.html.trim()) sec.lines.push(ln);
    // 「（別解：…）」は閉じ括弧で枠を終え、続きは元の小問に戻す
    if (sec.paren && /）\s*$/.test(ln.html)) {
      ln.html = ln.html.replace(/）\s*$/, '');
      sec.paren = false;
      const prev = secs.slice(0, -1).reverse().find(x => x.kind !== 'bekkai');
      sec = { head: '', kind: 'cont', lines: [], ofHead: prev ? prev.head : '' };
      secs.push(sec);
    }
  }
  const lineHTML = (h) => {
    const a = h.replace(/^\s*(?:<b>)?答[：:](?:<\/b>)?\s*/, '');
    return a !== h || /\\boldsymbol/.test(h) ? `<div class="ansrow"><span class="al">答</span><span class="aa">${a}</span></div>` : h;
  };
  return secs.filter(x => x.lines.length || (x.head && x.kind !== 'cont')).map(x => {
    let body = '';
    x.lines.forEach((ln, i) => {
      const h = lineHTML(ln.html), box = h.startsWith('<div class="ansrow">');
      if (i) body += ln.sep === 'p' ? '<hr class="sdash">' : box || body.endsWith('</div>') ? '' : '<br>';
      body += h;
    });
    return `<section class="solsec${x.kind ? ' ' + x.kind : ''}${x.head ? '' : ' nohead'}"${x.kind === 'bekkai' ? ' aria-label="別解"' : ''}>${x.head ? `<div class="sh">${x.head}</div>` : ''}<div class="sb">${body}</div></section>`;
  }).join('');
}


// ---------- マスコット
let mascotTimer = null;
function mascotSay(msg, { sound = true, ms = 9000 } = {}) {
  let el = $('#mascot');
  if (!el) return;
  const bub = $('#mascot .bubble');
  bub.innerHTML = `<b>${MASCOT_NAME}</b>${esc(msg).replace(/\n/g, '<br>')}`;
  el.classList.add('talk');
  if (sound && state.settings.sound !== false) play('mascot');
  clearTimeout(mascotTimer);
  mascotTimer = setTimeout(() => el.classList.remove('talk'), ms);
}
function mountMascot() {
  if ($('#mascot') || state.settings.mascot === false) return;
  const el = document.createElement('div');
  el.id = 'mascot';
  el.innerHTML = `<div class="bubble" role="status"></div><button class="mascot-btn" aria-label="${MASCOT_NAME}に話しかける">${MASCOT_SVG}</button>`;
  document.body.appendChild(el);
  $('.mascot-btn', el).addEventListener('click', () => {
    if (el.classList.contains('talk')) { el.classList.remove('talk'); return; }
    mascotSay(mascotMessage('random'));
  });
  $('.bubble', el).addEventListener('click', () => el.classList.remove('talk'));
}
let studyStart = null, breakNotified = 0, lastActivity = 0;
function mascotCheckBreak() {
  if (!studyStart) return;
  const min = Math.floor((Date.now() - studyStart) / 60000);
  const step = min >= 50 ? 2 : min >= 25 ? 1 : 0;
  if (step > breakNotified) { breakNotified = step; mascotSay(mascotMessage('break', { min }), { ms: 12000 }); }
}

// 共通の問題ビュー（catalog.js が古いときは一覧の項目から作る：一部だけ更新された場合でも動くように）
function problemView(e) {
  if (M_CAT.getProblem) return M_CAT.getProblem(e.id);
  const f = fieldByKey[e.f] || {};
  return { id: e.id, kind: e.kind === 'bank' ? 'written' : 'interactive', subject: f.subject, fieldName: f.name,
    level: e.lv, levelName: LEVELS[e.lv], minutes: e.t || null, grading: e.in ? {} : null };
}
// 頻出度（難易度とは別。高・中・低。付いていない問題は中）
function valueChip(e) {
  const v = (e && e.v) || 2;
  return `<span class="chip val v${v}" title="頻出度：問題集・入試で繰り返し使われる考え方を扱う問題ほど高い">頻出度 ${VALUES[v]}</span>`;
}
// この問題を出した理由（今日の演習・概念のページ・類題）。理由のない演習（単元・検索など）では出さない
function whyHTML() {
  const st = session && session.steps[session.i];
  return st && st.why ? `<p class="why">${esc(st.why)}</p>` : '';
}
function metaChips(e) {
  const p = problemView(e);
  return `<span class="chip">${esc(p.subject)}・${esc(p.fieldName)}</span>
        <span class="chip lv${p.level}">${p.levelName}</span>
        ${valueChip(e)}
        ${p.minutes ? `<span class="chip plain">目安 ${p.minutes}分</span>` : ''}
        ${p.kind === 'written' ? `<span class="chip plain">${gradingLabel(e, p)}</span>` : ''}`;
}
// ---------- ブックマーク：{ 問題ID: { on, t } }（外したときも on:false で残し、同期でよみがえらないようにする）
function isMarked(id) { const b = (state.bookmarks || {})[id]; return !!(b && b.on); }
function markedIds() {
  return Object.entries(state.bookmarks || {}).filter(([id, b]) => b && b.on && entryById.has(id)).sort((a, b) => b[1].t - a[1].t).map(([id]) => id);
}
function bmButton(id) {
  const on = isMarked(id);
  return `<button class="chip bm ${on ? 'on' : ''}" data-bm="${esc(id)}" aria-pressed="${on}" title="ブックマーク">${on ? '★' : '☆'}<span> ブックマーク</span></button>`;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-bm]');
  if (!b) return;
  const id = b.dataset.bm, on = !isMarked(id);
  state.bookmarks = { ...(state.bookmarks || {}), [id]: { on, t: Date.now() } };
  save(); play('tap');
  b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.firstChild.textContent = on ? '★' : '☆';
  toast(on ? 'ブックマークしました' : 'ブックマークを外しました');
});

// ---------- 選択肢つきの確認（confirm の代わり。ボタンの文言で何が起きるかを書けるように）
// choose({ title, body, options: [{ key, label, cls }] }) → 押したボタンの key（閉じたら null）
function choose({ title, body, options }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'chooser';
    wrap.innerHTML = `<div class="chooser-box" role="dialog" aria-modal="true" aria-labelledby="ch-title">
        <h3 id="ch-title">${esc(title)}</h3>
        ${body ? `<p>${body}</p>` : ''}
        <div class="chooser-btns">${options.map(o => `<button class="btn block ${o.cls || ''}" data-k="${esc(o.key)}">${esc(o.label)}</button>`).join('')}
          <button class="btn ghost block" data-k="">キャンセル</button></div>
      </div>`;
    const done = (k) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(k || null); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return done(null);
      const btn = e.target.closest('button[data-k]');
      if (btn) done(btn.dataset.k);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('button')?.focus();
  });
}
const hasRecords = (st) => !!(st && ((st.log || []).length || Object.keys(st.pstat || {}).length));

// 解答の形式（設定）：input＝記述式（答えを入力して自動採点）・choice＝選択式・self＝自己採点（答え合わせで自分で採点）
const ANSWER_MODES = [['input', '記述式'], ['choice', '選択式'], ['self', '自己採点']];
function answerMode() { return ['input', 'choice', 'self'].includes(state.settings.answer) ? state.settings.answer : 'input'; }
function gradingLabel(e, p) {
  const m = answerMode();
  if (m === 'self' || !p.grading) return '自己採点';
  if (m === 'choice') return '選択式';
  return '入力して採点';
}

function recordResult(pid, grade, extra) {
  // 初めて解いたとき：ブラウザに「この記録を勝手に消さないで」と頼む（対応していない環境では何もしない）
  if (!persistAsked) { persistAsked = true; try { navigator.storage?.persist?.(); } catch { /* なし */ } }
  const now = Date.now();
  state.pstat[pid] = review(state.pstat[pid], grade, now);
  state.problems[pid] = { last: now, n: ((state.problems[pid] || {}).n || 0) + 1 };
  // 概念のページから始めた演習（概念を知らされて解いた）は k:'t' を付ける。概念の習得判定で区別する
  state.log.push({ p: pid, t: now, g: grade, ...extra, ...(session && session.cfg && session.cfg.concept ? { k: 't' } : {}) });
  // 5000件での切り捨てはしない（古い記録が消えていた）。保存できなくなったら save() が知らせる
  const today = dayKey(now);
  if (state.streak.last !== today) {
    const y = dayKey(now - 86400000);
    state.streak = { last: today, count: state.streak.last === y ? state.streak.count + 1 : 1 };
  }
  save();
  session.results.push({ pid, grade });
  saveSession();
  return state.log[state.log.length - 1];
}

function renderProblem(step) {
  const entry = entryById.get(step.pid);
  if (!entry) { nextStep(); return; }
  return renderWritten(step, entry);
}

// 自己採点のボタン：並びは左から 不正解 → 一部正解 → 完答（良い方が右）
const SELF = [
  { id: 'none', label: '不正解', icon: 'none' },
  { id: 'part', label: '一部正解', icon: 'part' },
  { id: 'full', label: '完答', icon: 'full' },
];
const CONF_ICON = { low: 'low', mid: 'mid', high: 'high' };
const KEYS = ['^', '_', '(', ')', '/', '√', 'π', 'sin', 'cos', 'tan', 'log', ',', '<', '>', '≦', '≧', '±'];
// 語句・数値を入れる欄のキー
const CHEM_KEYS = ['×10^', '-', '.', '/', '°', '℃', '%', '(', ')'];

// 選択肢・並べかえの札：数式（$...$）はそのまま、化学式だけの札は \ce で
function optHTML(o) {
  if (/\$/.test(o)) return o;
  if (/^[A-Z\[(][A-Za-z0-9()\[\]+\-^·.=#]*$/.test(o)) return `$\\ce{${ceFix(o)}}$`;
  return rich(o);
}
function labelHTML(label) {
  if (!label) return '';
  // 物理量の名前（t_1、v_{max}、θ など）は数式として表示する。$...$ や文章はそのまま
  if (/^[A-Za-zα-ωΑ-Ω](_(\{[A-Za-z0-9]+\}|[A-Za-z0-9]+))?$/.test(label)) {
    const t = exprTeX(label);
    if (t) return `$${t}$`;
  }
  return esc(label);
}

// 解説の下：使う法則（法則のページへ）・確かめる概念・よくある誤解
function conceptBlock(e) {
  const K = knowledgeCache;
  if (!K || !((getBody(e.id) || {}).laws || e.m)) return '';
  const cs = (e.c || []).map(id => K.concept[id]).filter(Boolean);
  const ms = (e.m || []).map(id => K.misconception[id]).filter(Boolean);
  return `<div class="concept-box">
    ${(getBody(e.id) || {}).laws ? `<div class="methods"><b class="cb-label">使う法則（導出つき）</b>${getBody(e.id).laws.map(id => K.law[id]).filter(Boolean).map(l => `<a class="chip plain" href="#law=${esc(l.id)}">${esc(l.name)}</a>`).join('')}</div>` : ''}
    ${ms.length ? `<div class="misc-list"><b class="cb-label">よくある誤解</b>${ms.map(m => `<div class="misc"><span class="wrong">✗ ${esc(m.wrong)}</span><span class="right">→ ${esc(m.right)}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function renderWritten(step, e) {
  const b = getBody(e.id);
  if (!b) { showBanner('<b>問題本文がありません</b>' + esc(e.id)); nextStep(); return; }
  let spec = null;
  try { spec = b.in ? parseSpec(b.in) : null; } catch (err) { spec = null; }
  const mode = answerMode();
  if (mode === 'self') spec = null;                       // 自己採点：入力用の答えがあっても使わない
  const useChoice = mode === 'choice' && !!spec;
  const t0 = Date.now();
  const a = { conf: null, hint: false, revealed: false, sg: null, feel: null, log: null, min: null, attempts: 0, results: null, firstAllOk: null, disputes: [] };
  // 入力欄の状態：fields[k] = { f, part, mode: 'plain'|'cases'|'choice', text, rows }
  const fields = [];
  if (spec) spec.parts.forEach((p, pi) => p.fields.forEach(f => fields.push({ f, part: p.n, pi, mode: 'plain', text: '', rows: [{ cond: '', val: '' }, { cond: '', val: '' }], sel: new Set(), seq: [] })));
  // 選択式：選択肢のある欄（語句・数値）はボタンで選ぶ（b.ch[k] の先頭が正解。並びは毎回混ぜる）。
  //   もともと選ぶ欄（選ぶ・並べる）はそのまま。選択肢のない欄は入力のまま
  if (useChoice) fields.forEach((x, k) => {
    const opts = b.ch && b.ch[k];
    if (opts && !['self', 'pick', 'order'].includes(x.f.kind)) { x.mode = 'choice'; x.opts = opts; x.order = shuffle(opts.map((_, i) => i)); x.pick = null; }
  });
  const choiceN = fields.filter(x => x.mode === 'choice').length;
  const inputNote = useChoice && fields.some(x => !['self', 'pick', 'order'].includes(x.f.kind) && x.mode !== 'choice') ? '<p class="muted pen">選択肢のない欄は、答えを入力します。</p>' : '';
  const inputOf = (x) => x.mode === 'cases' ? { mode: 'cases', rows: x.rows } : { mode: 'plain', text: x.text, sel: x.sel, seq: x.seq };
  const isText = (f) => !['self', 'pick', 'order'].includes(f.kind);
  // 係数など、答えがただの数の欄（数字キーボードで入れる・場合分けは使わない）
  const isInt = (f) => f.kind === 'expr' && /^-?\d+$/.test(String(f.value.src).trim());
  const autoFields = fields.filter(x => x.f.kind !== 'self');
  const typed = (x) => isText(x.f) && x.mode !== 'choice';
  const selfParts = spec ? [...new Set(fields.filter(x => x.f.kind === 'self').map(x => x.part))] : [];
  let focused = null;

  view.innerHTML = `
    <div class="fade-in written">
      ${topBar()}
      <div class="meta">
        ${metaChips(e)}
        <span class="chip plain timer" id="clock">0:00</span>${bmButton(e.id)}
        <span class="count">${session.i + 1} / ${session.steps.length}</span>
      </div>
      ${whyHTML()}
      <div class="question qhtml">${bigOps(b.q)}</div>

      ${spec ? inputNote + '<div id="inputs" class="inputs"></div>' : '<p class="muted pen">この問題は答えを考えて（必要なら紙に書いて）から、答え合わせで自己採点します。</p>'}
      <div id="conf"><div class="label">${spec ? '判定の前に' : '答え合わせの前に'}：どのくらい自信がある？</div>
        <div class="segment conf">${CONF.map(c => `<button data-c="${c.id}">${ICON[CONF_ICON[c.id]]}<span>${c.label}</span></button>`).join('')}</div></div>
      <div class="btn-row" id="actions"></div>
      <div class="hint-list" id="hints"></div>
      <div id="feedback"></div>
      <div class="pid muted">${esc(e.id)}</div>
    </div>`;
  math($('.question'));
  mountFigures($('.question'), b.figs, { onDone: (box) => math(box) });
  bindQuit();
  const clock = $('#clock');
  const tick = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (e.t && sec > e.t * 60) clock.classList.add('over');
    mascotCheckBreak();
  };
  timer = setInterval(tick, 1000);

  // ---------- 入力欄
  function drawInputs() {
    if (!spec) return;
    const box = $('#inputs');
    const byPart = {};
    fields.forEach((x, k) => { (byPart[x.part] = byPart[x.part] || []).push(k); });
    box.innerHTML = Object.entries(byPart).map(([n, ks]) => `
      <div class="part">
        ${n ? `<div class="pn">(${esc(n)})</div>` : ''}
        <div class="pf">${ks.map(k => fieldHTML(k)).join('')}</div>
      </div>`).join('') + keypadHTML();
    math(box);
    bindInputs();
  }
  function keypadHTML() {
    const txt = fields.filter(x => typed(x) && !isInt(x.f));
    const kinds = new Set(txt.map(x => x.f.kind));
    // 語句だけの欄にはキーを出さない（地学の語句は記号を使わず、キーが選択肢に重なるのを防ぐ）
    if (!kinds.size || [...kinds].every(k => k === 'word')) return '';
    const mathy = [...kinds].some(k => !CHEM_KINDS.has(k));
    if (!mathy) return `<div class="keypad sticky" id="kp">${CHEM_KEYS.map(k => `<button type="button" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>`;
    return `<div class="keypad sticky" id="kp">${KEYS.map(k => `<button type="button" data-k="${esc(k)}">${esc(k)}</button>`).join('')}${extraKeys()}</div>`;
  }
  function extraKeys() {
    const letters = new Set();
    for (const x of autoFields) for (const ch of (x.f.src || '').match(/[α-ω]/g) || []) letters.add(ch);
    return [...letters].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('') + '<button type="button" data-k="または" class="wide">または</button>';
  }
  function fieldHTML(k) {
    const x = fields[k], f = x.f;
    const res = a.results && a.results[k];
    const mark = res ? (res.ok === true ? `<span class="fmark ok">${ICON.ok}</span>` : res.ok === false ? `<span class="fmark ng">${ICON.ng}</span>` : '') : '';
    const lab = f.label ? `<span class="flabel">${labelHTML(f.label)}</span>` : '';
    if (f.kind === 'self') {
      return `<div class="field self">${lab}<span class="selfnote">${ICON.self} ${esc(f.sub === '証明' ? '証明' : f.sub === '図示' ? '図示' : '記述')}：紙に書いて、答え合わせで自己採点</span></div>`;
    }
    const lockedC = a.revealed || (res && res.ok === true);
    const errC = res && res.error ? `<div class="inline-err">${esc(res.error)}</div>` : '';
    if (x.mode === 'choice') {
      const done = !!res || a.revealed;
      return `<div class="field pick ${res ? (res.ok ? 'is-ok' : 'is-ng') : ''}" data-k="${k}">
        <div class="frow">${lab}<span class="muted small">1つ選ぶ</span>${mark}</div>
        <div class="opts ${x.opts.every(o => o.replace(/\$[^$]*\$/g, 'xxxxxx').length <= 14) ? 'compact' : ''}">${x.order.map(i => {
          const cls = ['opt', done ? (i === 0 ? 'right' : i === x.pick ? 'wrong' : '') : (i === x.pick ? 'on' : '')].join(' ');
          return `<button type="button" class="${cls}" data-cpick="${k}" data-i="${i}" ${done ? 'disabled' : ''}><span class="ob">${i === x.pick ? '●' : '○'}</span><span class="ot qhtml">${optHTML(x.opts[i])}</span></button>`;
        }).join('')}</div></div>`;
    }
    if (f.kind === 'pick') {
      const show = a.revealed;
      return `<div class="field pick ${res ? (res.ok ? 'is-ok' : 'is-ng') : ''}" data-k="${k}">
        <div class="frow">${lab}<span class="muted small">${f.multi ? '当てはまるものをすべて選ぶ' : '1つ選ぶ'}</span>${mark}</div>
        <div class="opts ${f.options.every(o => o.replace(/\$\\ce\{|\}\$|\$/g, '').length <= 14) ? 'compact' : ''}">${f.options.map((o, i) => {
          const on = x.sel.has(i), right = f.answer.includes(i);
          const cls = ['opt', on ? 'on' : '', show && right ? 'right' : '', show && on && !right ? 'wrong' : ''].join(' ');
          return `<button type="button" class="${cls}" data-pick="${k}" data-i="${i}" ${lockedC ? 'disabled' : ''}><span class="ob">${f.multi ? (on ? '☑' : '☐') : (on ? '●' : '○')}</span><span class="ot qhtml">${optHTML(o)}</span></button>`;
        }).join('')}</div>${errC}</div>`;
    }
    if (f.kind === 'order') {
      const rest = f.options.map((o, i) => i).filter(i => !x.seq.includes(i));
      return `<div class="field order ${res ? (res.ok ? 'is-ok' : 'is-ng') : ''}" data-k="${k}">
        <div class="frow">${lab}<span class="muted small">順にタップして並べる（並べた札をタップすると戻す）</span>${mark}</div>
        <div class="seq">${x.seq.length ? x.seq.map((i, n) => `<button type="button" class="chipbtn placed" data-unseq="${k}" data-i="${i}" ${lockedC ? 'disabled' : ''}><b>${n + 1}</b><span class="qhtml">${optHTML(f.options[i])}</span></button>`).join('<span class="gt">＞</span>') : '<span class="muted small">ここに並びます</span>'}</div>
        ${rest.length && !lockedC ? `<div class="opts pool">${rest.map(i => `<button type="button" class="chipbtn" data-seq="${k}" data-i="${i}"><span class="qhtml">${optHTML(f.options[i])}</span></button>`).join('')}</div>` : ''}
        ${x.seq.length && !lockedC ? `<button class="mini" data-act="reset" data-k="${k}">並べ直す</button>` : ''}
        ${errC}</div>`;
    }
    const canCases = false;   // 地学では場合分けの入力を使わない（書式としては読める）
    const unit = fieldUnit(f);
    const locked = a.revealed || (res && res.ok === true);
    if (x.mode === 'cases') {
      return `<div class="field cases ${res ? (res.ok ? 'is-ok' : 'is-ng') : ''}" data-k="${k}">
        <div class="frow">${lab}<span class="muted">場合分け</span>${mark}${canCases && !locked ? `<button class="mini" data-act="plain" data-k="${k}">場合分けをやめる</button>` : ''}</div>
        ${x.rows.map((r, i) => `<div class="caserow">
          <input class="answer-input cond" data-k="${k}" data-row="${i}" data-part="cond" value="${esc(r.cond)}" placeholder="条件　例：a<0" ${locked ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          <span class="arrow">→</span>
          <input class="answer-input val" data-k="${k}" data-row="${i}" data-part="val" value="${esc(r.val)}" placeholder="値" ${locked ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          ${!locked && x.rows.length > 1 ? `<button class="mini del" data-act="delrow" data-k="${k}" data-row="${i}" aria-label="この場合を消す">×</button>` : ''}
        </div>`).join('')}
        ${!locked ? `<button class="mini add" data-act="addrow" data-k="${k}">＋ 場合を追加</button>` : ''}
        ${res && res.error ? `<div class="inline-err">${esc(res.error)}</div>` : ''}
      </div>`;
    }
    const short = isInt(f), ph = short ? '' : f.kind === 'word' ? '語句' : f.kind === 'approx' ? '数値（例 2.4、1.2×10^-3）' : (fieldHint(f) || (f.kind === 'expr' ? '答えを入力' : ''));
    return `<div class="field ${short ? 'short' : ''} ${res ? (res.ok ? 'is-ok' : 'is-ng') : ''}" data-k="${k}">
      <div class="answer-row">
        ${lab}
        <input class="answer-input" data-k="${k}" value="${esc(x.text)}" placeholder="${esc(ph)}" ${locked ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="${short ? 'numeric' : 'text'}">
        ${unit ? `<span class="unit">${esc(unit)}</span>` : ''}
        ${mark}
      </div>
      <div class="preview" data-pv="${k}"></div>
      ${canCases && !locked ? `<button class="mini" data-act="cases" data-k="${k}">${ICON.cases} 場合分けする</button>` : ''}
      ${res && res.error ? `<div class="inline-err">${esc(res.error)}</div>` : ''}
    </div>`;
  }
  function preview(k) {
    const x = fields[k], pv = $(`[data-pv="${k}"]`);
    if (!pv) return;
    const v = x.text.trim();
    if (!v || /^-?\d+(\.\d+)?$/.test(v)) { pv.textContent = ''; return; }
    if (x.f.kind === 'word') {
      // 化学式らしいものだけ下付き・上付きで見せる（日本語の語句はそのまま）
      const w = v.normalize('NFKC').replace(/\s+/g, '');
      if (/^[A-Z\[(][A-Za-z0-9()\[\]+\-^·.=#{}]*$/.test(w)) { tex(pv, `\\ce{${ceFix(w)}}`); pv.className = 'preview'; } else pv.textContent = '';
      return;
    }
    if (x.f.kind === 'approx') { pv.textContent = ''; return; }
    try {
      const t = x.f.kind === 'range' ? condTeX(v) : x.f.kind === 'set' ? v.split(/[,，、]/).map(s => exprTeX(s.trim()) ?? s).join(',\\ ') : (exprTeX(v.replace(/^[^=<>]*=(?!=)/, '')) ?? null);
      if (t == null) throw new Error();
      tex(pv, t); pv.className = 'preview';
    } catch { pv.textContent = '…'; pv.className = 'preview err'; }
  }
  function bindInputs() {
    $$('#inputs input').forEach(inp => {
      const k = +inp.dataset.k, x = fields[k];
      inp.addEventListener('focus', () => { focused = inp; });
      inp.addEventListener('input', () => {
        if (inp.dataset.row != null) x.rows[+inp.dataset.row][inp.dataset.part] = inp.value;
        else { x.text = inp.value; preview(k); }
        if (a.results && a.results[k]) { a.results[k] = null; }
        actions();
      });
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('#judge')?.click(); } });
      if (inp.dataset.row == null) preview(k);
    });
    $$('#inputs [data-cpick]').forEach(btn => btn.addEventListener('click', () => {
      const x = fields[+btn.dataset.cpick];
      if (a.results || a.revealed) return;
      x.pick = +btn.dataset.i;
      play('tap'); drawInputs(); actions();
    }));
    $$('#inputs [data-pick]').forEach(btn => btn.addEventListener('click', () => {
      const k = +btn.dataset.pick, x = fields[k], i = +btn.dataset.i;
      if (x.f.multi) { x.sel.has(i) ? x.sel.delete(i) : x.sel.add(i); } else x.sel = new Set(x.sel.has(i) ? [] : [i]);
      if (a.results) a.results[k] = null;
      play('tap'); drawInputs(); actions();
    }));
    $$('#inputs [data-seq]').forEach(btn => btn.addEventListener('click', () => {
      const k = +btn.dataset.seq, x = fields[k];
      x.seq.push(+btn.dataset.i); if (a.results) a.results[k] = null;
      play('tap'); drawInputs(); actions();
    }));
    $$('#inputs [data-unseq]').forEach(btn => btn.addEventListener('click', () => {
      const k = +btn.dataset.unseq, x = fields[k];
      x.seq = x.seq.filter(i => i !== +btn.dataset.i); if (a.results) a.results[k] = null;
      drawInputs(); actions();
    }));
    $$('#inputs [data-act]').forEach(btn => btn.addEventListener('click', () => {
      const k = +btn.dataset.k, x = fields[k];
      if (btn.dataset.act === 'reset') { x.seq = []; if (a.results) a.results[k] = null; drawInputs(); actions(); return; }
      if (btn.dataset.act === 'cases') { x.mode = 'cases'; if (x.text) x.rows[0].val = x.text; }
      if (btn.dataset.act === 'plain') x.mode = 'plain';
      if (btn.dataset.act === 'addrow') x.rows.push({ cond: '', val: '' });
      if (btn.dataset.act === 'delrow') x.rows.splice(+btn.dataset.row, 1);
      if (a.results) a.results[k] = null;
      drawInputs(); actions();
      const target = $(`#inputs [data-k="${k}"] input:not([readonly])`); target && target.focus();
    }));
    $$('#kp button').forEach(btn => btn.addEventListener('mousedown', (ev) => ev.preventDefault()));
    $$('#kp button').forEach(btn => btn.addEventListener('click', () => {
      const inp = focused && document.body.contains(focused) ? focused : $('#inputs input:not([readonly])');
      if (!inp || inp.readOnly) return;
      const key = btn.dataset.k;
      const ins = { 'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(', 'log': 'log(', '√': 'sqrt(', '≦': '<=', '≧': '>=', 'または': ' または ', '×10^': '×10^' }[key] ?? key;
      const st = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? st;
      inp.value = inp.value.slice(0, st) + ins + inp.value.slice(en);
      inp.focus(); inp.setSelectionRange(st + ins.length, st + ins.length);
      inp.dispatchEvent(new Event('input'));
    }));
  }

  $$('#conf button').forEach(btn => btn.addEventListener('click', () => {
    if (a.revealed || a.attempts) return;
    a.conf = btn.dataset.c;
    $$('#conf button').forEach(x => x.classList.toggle('on', x === btn));
    play('tap');
    actions();
  }));

  function filled() {
    return autoFields.every(x => x.mode === 'choice' ? x.pick !== null : x.f.kind === 'pick' ? x.sel.size > 0 : x.f.kind === 'order' ? x.seq.length === x.f.options.length
      : x.mode === 'cases' ? x.rows.some(r => r.cond.trim() && r.val.trim()) : x.text.trim());
  }
  function actions() {
    const box = $('#actions');
    if (a.revealed) { box.innerHTML = ''; return; }
    const hintBtn = b.k && !a.hint ? `<button class="btn ghost" id="hint">${ICON.hint} ヒント：考え方</button>` : '';
    if (!spec) {
      box.innerHTML = `${hintBtn}<button class="btn primary" id="reveal" ${a.conf ? '' : 'disabled'}>答え合わせ</button>`;
      $('#reveal').addEventListener('click', () => reveal());
    } else {
      const ready = a.conf && filled();
      box.innerHTML = `${hintBtn}<button class="btn primary" id="judge" ${ready ? '' : 'disabled'}>${a.attempts ? 'もう一度判定' : '判定'}</button>
        ${a.attempts ? '<button class="btn" id="giveup">答えを見る</button>' : ''}`;
      $('#judge').addEventListener('click', judge);
      $('#giveup')?.addEventListener('click', () => reveal());
    }
    $('#hint')?.addEventListener('click', () => {
      a.hint = true;
      const h = document.createElement('div');
      h.className = 'hint fade-in';
      h.innerHTML = `<b>考え方</b>${b.k}`;
      $('#hints').appendChild(h);
      math(h);
      actions();
    });
  }

  function checkOne(x) {
    if (x.f.kind === 'self') return { ok: null };
    if (x.mode === 'choice') return { ok: x.pick === 0, choice: true };
    return checkField(x.f, inputOf(x));
  }
  function judge() {
    const res = fields.map(checkOne);
    // 書き方の誤りだけなら、試行に数えずに知らせる
    if (res.some(r => r.syntax)) {
      a.results = res.map(r => r.syntax ? r : null);
      drawInputs(); actions(); play('wrong');
      return;
    }
    a.attempts++;
    a.results = res;
    const auto = res.filter(r => r.ok !== null);
    const allOk = auto.every(r => r.ok);
    if (a.firstAllOk === null) a.firstAllOk = allOk;
    drawInputs();
    if (allOk) { play('correct'); reveal(); return; }
    play('wrong');
    if (choiceN) { reveal(); return; }                       // 選択式はやり直しなし（当てずっぽうで正解にならないように）
    const fb = $('#feedback');
    const nOk = auto.filter(r => r.ok).length;
    fb.innerHTML = `<div class="result ng fade-in"><span class="mark">${ICON.ng}</span><div>${nOk ? `${auto.length}つのうち${nOk}つ正解` : '違うようです'}<small>×の欄を見直して、もう一度判定できます。</small></div></div>`;
    actions();
  }

  function reveal() {
    a.revealed = true;
    a.min = Math.max(1, Math.round((Date.now() - t0) / 60000));
    stopTimer();
    $$('#conf button').forEach(x => x.disabled = true);
    if (spec) {
      // 判定していない欄は、いま判定する（答えを見る前の最終状態）
      a.results = fields.map((x, k) => (a.results && a.results[k]) || checkOne(x));
      drawInputs();
    }
    actions();
    const fb = $('#feedback');
    const autoRes = spec ? a.results.filter(r => r.ok !== null) : [];
    const autoAll = autoRes.length && autoRes.every(r => r.ok);
    const answerKey = spec ? specAnswerHTML() : `<div class="ans qhtml">${b.a}</div>`;
    const needSelf = !spec || selfParts.length > 0;   // 自己採点がある＝先に解答・解説を見せてから聞く
    fb.innerHTML = `
      ${spec && autoRes.length ? `<div id="autores">${autoBanner()}</div>` : ''}
      <div class="solution anskey-box fade-in">
        <div class="ansrow big"><span class="al">答</span><div class="aa">${answerKey}</div></div>
        ${spec ? `<details class="orig"><summary>答えの表記（問題データ）</summary><div class="qhtml">${b.a}</div></details>` : ''}
      </div>
      ${spec && autoRes.some(r => !r.ok && !r.choice) ? '<p class="muted dispute-note">自分の答えも正しいはずなのに×のときは、欄の横の「判定がおかしい？」を押してください。記録に残り、テスト記録のCSVにも出ます。</p>' : ''}
      ${needSelf ? solutionHTML() : ''}
      ${needSelf ? `<div class="label">${spec ? `解答と見比べて、自己採点の小問（${selfParts.map(n => n ? `(${n})` : '').join('')}）はどうだった？` : '解答と見比べて、自分の答案はどうだった？'}</div>
        <div class="segment self" id="self">${SELF.map(x => `<button data-g="${x.id}">${ICON[x.icon]}<span>${x.label}</span></button>`).join('')}</div>` : ''}
      <div id="after"></div>`;
    math(fb);
    mountFigures(fb, b.figs, { allowAnswer: true, onDone: (box) => math(box) });
    if ($('#solbox')) labButton($('#solbox'), b.zk);
    addDisputeButtons();
    $$('#self button').forEach(btn => btn.addEventListener('click', () => grade(btn.dataset.g)));
    if (spec && !selfParts.length) grade(null);
  }

  function solutionHTML() {
    return `<div class="solution fade-in" id="solbox">
        <div class="title">解答・解説</div>
        <div class="qhtml sol">${solutionSections(formatSolution(b.s)) || '（解説なし）'}</div>
        ${b.k ? `<div class="keypoint"><b>核となる考え方</b>${b.k}</div>` : ''}
        ${conceptBlock(e)}
        ${conChipsHTML(e.id)}
        ${e.th || e.tg ? `<div class="methods">${e.th ? `<span class="chip plain">${e.th}</span>` : ''}${(e.tg || []).filter(t => t !== e.th).map(t => `<span class="chip plain">${esc(t)}</span>`).join('')}</div>` : ''}

      </div>`;
  }

  function specAnswerHTML() {
    return `<div class="anskey">${spec.parts.map(p => `<div class="akrow">${p.n ? `<span class="pn">(${esc(p.n)})</span>` : ''}<span>${p.fields.map(f => {
      if (f.kind === 'self') return `<span class="muted">${esc(f.sub)}${f.text ? '：' + esc(f.text) : '（解説を参照）'}</span>`;
      const lab = f.label ? `${labelHTML(f.label)} ＝ ` : '';
      const h = fieldAnswerHTML(f);
      if (h != null) return `<span class="akf">${f.label ? `${labelHTML(f.label)}：` : ''}${h}</span>`;
      return `<span class="akf">${lab}$\\displaystyle ${esc(fieldTeX(f))}$</span>`;
    }).join('')}</span></div>`).join('')}</div>`;
  }

  function addDisputeButtons() {
    if (!spec || !a.results) return;
    fields.forEach((x, k) => {
      const r = a.results[k];
      if (!r || r.ok !== false || x.mode === 'choice') return;
      const el = $(`#inputs .field[data-k="${k}"]`);
      if (!el || el.querySelector('.dispute')) return;
      const btn = document.createElement('button');
      btn.className = 'mini dispute';
      btn.textContent = '判定がおかしい？';
      btn.addEventListener('click', () => {
        a.results[k] = { ok: true, disputed: true };
        const said = x.f.kind === 'pick' ? [...x.sel].map(i => x.f.options[i]).join(',') : x.f.kind === 'order' ? x.seq.map(i => x.f.options[i]).join('>')
          : x.mode === 'cases' ? x.rows.map(r2 => `${r2.cond}→${r2.val}`).join(' | ') : x.text;
        a.disputes.push(`(${x.part || '-'})${x.f.label ? ' ' + x.f.label : ''}：${said}`);
        btn.replaceWith(Object.assign(document.createElement('span'), { className: 'muted small', textContent: '正解として記録しました' }));
        if (a.log) { a.log.disp = a.disputes.slice(); save(); }
        el.classList.remove('is-ng'); el.classList.add('is-ok');
        const m = el.querySelector('.fmark'); if (m) { m.className = 'fmark ok'; m.innerHTML = ICON.ok; }
        if (a.sg) regrade();
      });
      el.appendChild(btn);
    });
  }

  function autoScore() {
    const auto = (a.results || []).filter(r => r && r.ok !== null);
    return { n: auto.length, ok: auto.filter(r => r.ok).length };
  }
  function combine(selfSg) {
    const { n, ok } = autoScore();
    if (!spec) return selfSg;
    const autoSg = !n ? null : ok === n ? 'full' : ok === 0 ? 'none' : 'part';
    if (!selfSg) return autoSg;
    if (!autoSg) return selfSg;
    if (autoSg === selfSg) return autoSg;
    return (autoSg === 'none' && selfSg === 'none') ? 'none' : 'part';
  }
  let selfChoice = null;
  function autoBanner() {
    const autoRes = (a.results || []).filter(r => r && r.ok !== null);
    const autoAll = autoRes.every(r => r.ok);
    return `<div class="result ${autoAll ? 'ok' : 'ng'} fade-in"><span class="mark">${autoAll ? ICON.ok : ICON.ng}</span><div>${autoAll ? (a.attempts > 1 ? '正解（2回目以降）' : '正解') : `${choiceN ? '答え' : '入力した答え'}：${autoRes.filter(r => r.ok).length} / ${autoRes.length} 正解`}${a.hint ? '<small>ヒントあり</small>' : ''}</div></div>`;
  }
  // 「判定がおかしい？」で採点が変わったとき：記録と表示を直す（復習の予定は、この回の前の状態から計算し直す）
  function regrade() {
    const sg = combine(selfChoice);
    const ar = $('#autores'); if (ar) ar.innerHTML = autoBanner();
    if (sg === a.sg) return;
    a.sg = sg;
    const v = $('.verdict');
    if (v) { v.className = `verdict v-${sg}`; v.innerHTML = `${ICON[sg]}<b>${SELF.find(x => x.id === sg).label}</b>`; }
    if (a.log) {
      a.log.sg = sg; a.log.ok = sg === 'full';
      a.log.g = gradeOf(sg);
      state.pstat[e.id] = review(a.prevStat, a.log.g, a.log.t);
      const r = [...session.results].reverse().find(x => x.pid === e.id);
      if (r) r.grade = a.log.g;
      save();
    }
  }
  function gradeOf(sg) {
    // 選択式で正解したときは、思い出して書けたときより定着が弱いとみて「確実」でも 3 まで。
    // 自信なしで正解したときは「ヒントあり」と同じ 2（早めに復習）
    return sg === 'full' ? (a.hint || a.attempts > 1 || a.conf === 'low' ? 2 : a.conf === 'high' && !choiceN ? 4 : 3) : sg === 'part' ? 2 : 1;
  }

  function grade(selfSg) {
    if (a.sg) return;
    selfChoice = selfSg;
    const sg = combine(selfSg);
    a.sg = sg;
    a.prevStat = state.pstat[e.id];
    $$('#self button').forEach(x => { x.disabled = true; x.classList.toggle('on', x.dataset.g === selfSg); });
    play(sg === 'full' ? 'full' : sg === 'part' ? 'part' : 'wrong');
    a.log = recordResult(e.id, gradeOf(sg), { h: a.hint ? 1 : 0, c: a.conf, ok: sg === 'full', sg, min: a.min, in: spec ? 1 : 0, md: choiceN ? 'choice' : spec ? 'input' : 'self', disp: a.disputes.length ? a.disputes.slice() : undefined });
    const after = $('#after');
    after.innerHTML = `
      <div class="verdict v-${sg} fade-in">${ICON[sg]}<b>${SELF.find(x => x.id === sg).label}</b></div>
      ${confNoteHTML(sg, a.conf, $('#solbox') ? '' : b.k)}
      ${recallHTML(e.id)}
      ${$('#solbox') ? '' : solutionHTML()}
      <div class="label">手応え（任意）</div>
      <div class="feel" id="feel">${FEEL.map(f => `<button data-k="${f.k}"><b>${f.k}</b><span>${f.label}</span></button>`).join('')}</div>
      <div class="label">${sg === 'full' ? 'この問題で最初に気づくべきことを1行で（任意）' : 'どこで詰まった？（任意）'}</div>
      <textarea class="explain" id="explain" placeholder="${sg === 'full' ? '例：古い地層を切る断層は、その地層より新しい' : '例：(2) で偏西風の向きを逆にしていた'}"></textarea>
      <div class="btn-row">
        ${similarTo(state, e.id, session.steps.map(st => st.pid), CON && CON.byProblem) ? `<button class="btn" id="similar">類題を1問追加</button>` : ''}
        <button class="btn primary" id="next">${session.i + 1 < session.steps.length ? '次へ' : '結果を見る'}</button>
      </div>`;
    math(after);
    $('#similar')?.addEventListener('click', (ev) => addSimilar(e.id, ev.currentTarget));
    bindRecall(e.id, sg);
    mountFigures(after, b.figs, { allowAnswer: true, onDone: (box) => math(box) });
    if ($('#solbox', after)) labButton($('#solbox', after), b.zk);
    $$('#feel button').forEach(btn => btn.addEventListener('click', () => {
      a.feel = +btn.dataset.k;
      $$('#feel button').forEach(x => x.classList.toggle('on', x === btn));
    }));
    $('#next').addEventListener('click', () => {
      const t = $('#explain').value.trim();
      if (a.log) { if (t) a.log.note = t; if (a.feel) a.log.feel = a.feel; if (a.disputes.length) a.log.disp = a.disputes.slice(); }
      if (t) state.explains[e.id] = [...(state.explains[e.id] || []), { t: Date.now(), text: t }].slice(-5);
      save();
      nextStep();
    });
  }

  drawInputs();
  actions();
}

// 自信度と結果のずれへの一言：正解だが自信なし → 早めに復習／確実なのに解けず → 思い込みの確認
function confNoteHTML(sg, conf, key) {
  if (sg === 'full' && conf === 'low') return `<p class="conf-note fade-in">自信がないまま正解しました。定着しきっていないので、早めに復習に出します。</p>`;
  if (sg !== 'full' && conf === 'high') return `<div class="conf-note warn fade-in"><b>「確実」だったのに解けませんでした。</b>思い込みや見落としがなかったか、解説の「核となる考え方」と「よくある誤解」に照らし合わせてください。復習でも優先して出します。${key ? `<div class="keypoint">${key}</div>` : ''}</div>`;
  return '';
}
// 概念の想起（任意の1タップ）：主な概念がある問題で、概念を知らされていない演習のときだけ聞く。
// 答えは直前の記録に r（1=すぐ浮かんだ 2=考えるうちに気づいた 3=浮かばなかった・別の考え方）として残し、概念の習熟の判定に使う
const RECALL = [[1, 'すぐ浮かんだ'], [2, '考えるうちに気づいた'], [3, '浮かばなかった・別の考え方']];
function recallMain(pid) {
  if (!CON || (session && session.cfg && session.cfg.concept)) return null;
  const m = (CON.byProblem.get(pid) || []).find(x => x.main);
  return m ? CON.byId.get(m.id) : null;
}
function recallHTML(pid) {
  const t = recallMain(pid);
  if (!t) return '';
  return `<div class="recall" id="recall"><p class="small" style="margin:0 0 6px">この問題の主な概念「<a href="#concept=${esc(t.id)}">${esc(t.name)}</a>」は、問題を見て浮かびましたか？<span class="muted">（任意）</span></p>
    <div class="seg3">${RECALL.map(([v, l]) => `<button class="btn small" data-r="${v}">${l}</button>`).join('')}</div><p class="small recall-msg" id="recallmsg"></p></div>`;
}
function bindRecall(pid, sg) {
  const t = recallMain(pid);
  if (!t) return;
  $$('#recall [data-r]').forEach(b => b.addEventListener('click', () => {
    const v = +b.dataset.r;
    const l = [...state.log].reverse().find(x => x.p === pid);
    if (!l) return;
    l.r = v; save();
    $$('#recall [data-r]').forEach(x => x.classList.toggle('on', x === b));
    const full = sg === 'full';
    const tn = esc(t.name);
    $('#recallmsg').innerHTML = full
      ? (v === 3 ? `記録しました。概念が浮かばずに解けた回は、概念の習熟では「知らされずに完答」に数えません。<a href="#concept=${esc(t.id)}">「${tn}」のページ</a>で法則とよくある誤解を読んでおくと、次は浮かびやすくなります。` : '記録しました。')
      : (v === 3 ? `記録しました。まず<a href="#concept=${esc(t.id)}">「${tn}」のページ</a>で法則とよくある誤解を確認してから、類題で使ってみてください。` : '記録しました。概念は浮かんでいたので、解説と自分の答えのどこで分かれたか（読み取り・計算・条件の確認）を見直してください。');
  }));
}

// 類題を今の問題の次に差し込む
async function addSimilar(pid, btn) {
  const sim = similarTo(state, pid, session.steps.map(st => st.pid), CON && CON.byProblem);
  if (!sim) { btn.disabled = true; btn.textContent = '類題が見つかりません'; return; }
  btn.disabled = true; btn.textContent = '読み込んでいます…';
  try { await ensureBodies([sim.id]); } catch (err) { btn.disabled = false; btn.textContent = '類題を1問追加'; toast('類題を読み込めませんでした'); return; }
  const shared = CON ? (CON.byProblem.get(sim.id) || []).filter(x => (CON.byProblem.get(pid) || []).some(y => y.id === x.id)).map(x => x.id) : [];
  session.steps.splice(session.i + 1, 0, { kind: 'problem', pid: sim.id, why: shared.length ? `類題（概念「${conName(shared[0])}」が共通）` : '類題（同じ単元・共通のタグ）' });
  saveSession();
  btn.textContent = `類題を追加しました（${LEVELS[sim.lv]}）`;
  const nx = $('#next'); if (nx) nx.textContent = '次へ（類題）';
}

function renderSummary() {
  const r = session.results;
  const solo = r.filter(x => x.grade >= 3).length;
  const withHint = r.filter(x => x.grade === 2).length;
  const missed = r.filter(x => x.grade === 1).length;
  const next = nextReviewTime(state);
  const today = dayKey();
  const doneN = state.log.filter(l => dayKey(l.t) === today).length, goal = state.practice.size;
  const first = state.log.length === r.length;
  // 完答できなかった問題の主な概念（重複なし・最大2つ）：次に読むとよい概念
  const missCon = CON ? [...new Set(r.filter(x => x.grade < 3).map(x => ((CON.byProblem.get(x.pid) || []).find(y => y.main) || {}).id).filter(Boolean))].slice(0, 2) : [];
  view.innerHTML = `
    <div class="fade-in">
      <div class="kicker">おつかれさま</div>
      <h1>${r.length}問 解きました</h1>
      <div class="stat-row">
        <div class="stat"><b>${solo}</b><span>自力で完答</span></div>
        <div class="stat"><b>${withHint}</b><span>一部・ヒントあり</span></div>
        <div class="stat"><b>${missed}</b><span>解けず</span></div>
      </div>
      <div class="panel">
        <p style="margin:0">解けなかった問題は近いうちに、解けた問題は間をあけて復習に出します。${next ? `次の復習は <strong>${relTime(next)}</strong>。` : ''}</p>
        <p class="muted" style="margin:8px 0 0">難しく感じた日の方が、あとで解ける力は伸びています。</p>
      </div>
      ${first ? `<div class="panel"><p style="margin:0"><b>記録の使われ方</b></p><p class="small" style="margin:6px 0 0;line-height:1.8">いま解いた結果から、問題ごとに次に解き直す時期を決め、問題に結びつく概念ごとに「学習中」などの状態を記録しました。明日からの「今日の演習」は、解き直しの時期が来た問題と、まだ学んでいない概念の問題を組み合わせて出します。様子は<a href="#map">定着度</a>で見られます。</p></div>` : ''}
      ${missCon.length ? `<h2>次に読むとよい概念</h2><p class="muted small" style="margin:-4px 0 6px">完答できなかった問題の主な概念です。法則とよくある誤解を確認してから類題に進むと、同じところでつまずきにくくなります。</p><div class="tech-list">${missCon.map(id => `<a class="tech-row" href="#concept=${esc(id)}"><span class="nm">${esc(conName(id))}</span><span class="muted small">›</span></a>`).join('')}</div>` : ''}
      <p class="sub" style="margin:14px 2px 0">今日 ${doneN} / ${goal}問${doneN >= goal ? '　今日の目標を達成しました。' : `　あと ${goal - doneN}問で今日の目標です。`}</p>
      <div class="btn-row">
        <button class="btn${doneN < goal ? ' primary' : ''}" id="more">${session.cfg && session.cfg.today ? (doneN < goal ? '続けて今日の演習' : 'もう一度今日の演習') : '同じ条件でもう一度'}</button>
        <button class="btn${doneN >= goal ? ' primary' : ''}" id="home">ホームへ</button>
      </div>
    </div>`;
  play('finish');
  setTimeout(() => mascotSay(mascotMessage('summary', { solo, missed, n: r.length }), { sound: false }), 600);
  $('#home').addEventListener('click', () => { session = null; route(); });
  $('#more').addEventListener('click', () => {
    const cfg = session.cfg || { size: 8 };
    if (cfg.collection) { openCollection(cfg.collection); return; }
    if (cfg.ids) { openIds(cfg.ids); return; }
    const steps = cfg.today ? todayPlan({ levels: cfg.levels, size: cfg.size }, weakestField()).steps : cfg.review ? pickReview(state, cfg) : pickPractice(state, cfg);
    if (!steps.length) { toast('今は出題できる問題がありません'); return; }
    startSession(steps, cfg);
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- 探究（js/lab.js）----------
// 解いたあとに「探究で確かめる」：問題が指す探究のページ（岩石の図鑑・断面図・シミュレーションなど）へ
const LAB_NAME = { identify: '地図・画像からの識別', strata: '地層・地質構造', phenomena: '地球現象のシミュレーション', sky: '天体・宇宙の可視化', terms: '用語のつながり', laws: '法則' };
const ICON_LAB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18"/></svg>';
function labButton(host, zk) {
  if (!host || !zk || host.querySelector('.zk-open')) return;
  const a = document.createElement('a');
  a.className = 'btn ghost block zk-open';
  a.href = zk.page === 'laws' ? (zk.key ? `#law=${encodeURIComponent(zk.key)}` : '#concepts') : `#lab=${zk.page}${zk.key ? '/' + encodeURIComponent(zk.key) : ''}`;
  a.innerHTML = `${ICON_LAB} 探究で確かめる：${esc(zk.label || LAB_NAME[zk.page] || '')}`;
  a.addEventListener('click', () => { session = null; });
  host.appendChild(a);
}
async function renderLabTab(arg) {
  view.innerHTML = '<p class="muted" style="padding:40px 4px">探究を読み込んでいます…</p>';
  try {
    const [M, Z] = await Promise.all([import('./lab.js'), loadLab()]);
    if (M.FILE_VERSION !== VERSION) showBanner(`<b>古いファイルが混ざっています（v${VERSION}）</b>js/lab.js が更新されていません。`);
    dataWarn();
    const g = M.renderLab(view, Z, arg, {
      esc, math, toast, prefs: state.labPrefs || (state.labPrefs = {}), save,
      problemsFor: (page, key) => ENTRIES.filter(e => e.zk && (key ? e.zk === `${page}/${key}` : e.zk.split('/')[0] === page)),
      openIds, entryById, LEVELS,
    });
    if (g) activeGraphs.push(g);
  } catch (e) { view.innerHTML = `<p class="muted">探究を読めませんでした（${esc(e.message)}）。</p>`; }
}

// ---------- 「概念」タブ：概念の一覧（習熟つき）と法則の一覧 ----------
async function renderConcepts(q = '') {
  view.innerHTML = '<p class="muted" style="padding:40px 4px">読み込んでいます…</p>';
  let K;
  try { K = await loadKnowledge(); knowledgeCache = K; if (!CON) CON = buildCon(K); } catch (e) { view.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const k = String(q || '').trim();
  const match = (c) => !k || c.name.includes(k);
  // 法則の分野は、その法則が結びつく概念の分野から決める
  const subjOf = (l) => { const c = (l.concepts || []).map(id => K.concept[id]).find(Boolean); const f = c && FIELDS.find(x => x.fieldKey === c.field); return f ? f.subject : 'その他'; };
  const groups = new Map();
  for (const l of K.laws) { const sj = subjOf(l); if (!groups.has(sj)) groups.set(sj, []); groups.get(sj).push(l); }
  const order = [...groups.keys()].sort((x, y) => (SUBJECT_ORDER.indexOf(x) + 1 || 99) - (SUBJECT_ORDER.indexOf(y) + 1 || 99));
  const cand = candidates();
  view.innerHTML = `
    <div class="fade-in">
      <div class="kicker">概念と法則</div>
      <h1>概念から選ぶ</h1>
      <p class="sub">地学の概念 ${CON.list.length}個。概念のページには、使う法則・よくある誤解・あなたの習熟と、その概念を使う問題があります。</p>
      <form class="search" id="cform" role="search"><input id="cq" type="search" placeholder="概念を探す（例：断熱、地震波、HR図）" value="${esc(k)}" aria-label="概念を探す"><button class="btn">探す</button></form>
      ${CON.groups.map(g => {
        const cs = CON.list.filter(c => c.field === g.id && match(c));
        if (!cs.length) return '';
        return `<h2>${esc(g.name)}</h2><div class="tech-list">${cs.map(c => {
          const m = cand.ms.get(c.id);
          return `<a class="tech-row" href="#concept=${esc(c.id)}"><span class="nm">${esc(c.name)}</span><span class="small">${m.status === 'none' ? `<span class="muted">${c.ids.length}問</span>` : statusChip(m)}</span></a>`;
        }).join('')}</div>`;
      }).join('') || '<p class="muted">見つかりませんでした。</p>'}
      <h1 style="margin-top:30px">使う法則と導出</h1>
      <p class="sub">法則をタップすると、成り立つ条件・導出（または根拠）・使う問題が出ます。</p>
      ${order.map(sj => `<h2>${esc(sj)}</h2><div class="laws">${groups.get(sj).map(lawRow).join('')}</div>`).join('')}
    </div>`;
  math(view);
  $('#cform').addEventListener('submit', (ev) => { ev.preventDefault(); location.hash = '#concepts=' + encodeURIComponent($('#cq').value.trim()); });
}

// 法則の1行（概念ページ・一覧）。タップで法則のページへ
const ORIGIN = { fundamental: '出発点となる法則', empirical: '実験から得た法則', derived: '導出できる', definition: '定義' };
function lawRow(l) {
  return `<a class="law" href="#law=${esc(l.id)}"><b>${esc(l.name)}</b><span class="qhtml">${l.html}</span>
    <small class="muted"><span class="origin o-${esc(l.origin)}">${ORIGIN[l.origin] || ''}</span>${l.condHtml || esc(l.conditions)}</small></a>`;
}

// ---------- 法則のページ（式・適用条件・導出または根拠・関連する概念・問題） ----------
async function renderLaw(id) {
  view.innerHTML = '<p class="muted" style="padding:40px 4px">読み込んでいます…</p>';
  let K;
  try { K = await loadKnowledge(); knowledgeCache = K; } catch (e) { view.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const l = K.law[id];
  if (!l) { location.hash = '#concepts'; return; }
  const ps = ENTRIES.filter(e => (e.l || []).includes(l.id));
  const uses = K.laws.filter(x => x.id !== l.id && (x.steps || []).join(' ').includes(l.name));
  view.innerHTML = `
    <div class="fade-in law-page">
      <a class="back" href="#concepts">‹ 法則の一覧</a>
      <div class="kicker">法則 · <span class="origin o-${esc(l.origin)}">${ORIGIN[l.origin] || ''}</span></div>
      <h1>${esc(l.name)}</h1>
      <div class="law-formula qhtml">\\[${l.tex}\\]</div>
      <div class="panel law-cond"><b>成り立つ条件</b><div class="qhtml">${l.condHtml || esc(l.conditions)}</div></div>
      ${l.basisHtml ? `<h2>${l.origin === 'derived' ? 'もとになる事実' : 'この法則の根拠'}</h2><div class="panel qhtml">${l.basisHtml}</div>` : ''}
      ${l.steps ? `<h2>導出</h2>
        <p class="sub">1段ずつ開いて、次の段を自分で考えてから確かめよう。</p>
        <ol class="derivation">${l.steps.map((st, i) => `<li class="${i === 0 ? 'open' : ''}"><div class="qhtml">${st}</div></li>`).join('')}</ol>
        <div class="btn-row"><button class="btn" id="dnext">次の段を見る</button><button class="btn ghost" id="dall">すべて表示</button></div>` : ''}
      ${uses.length ? `<h2>この法則から導かれるもの</h2><div class="laws">${uses.map(lawRow).join('')}</div>` : ''}
      ${ps.length ? `<button class="btn primary block" id="lprob" style="margin-top:18px">この法則を使う問題を解く（${ps.length}問）</button>` : ''}
    </div>`;
  math(view);
  const items = $$('.derivation li');
  const reveal = () => { const n = items.find(li => !li.classList.contains('open')); if (n) n.classList.add('open'); if (!items.some(li => !li.classList.contains('open'))) { $('#dnext')?.remove(); $('#dall')?.remove(); } };
  $('#dnext')?.addEventListener('click', reveal);
  $('#dall')?.addEventListener('click', () => { items.forEach(li => li.classList.add('open')); $('#dnext')?.remove(); $('#dall')?.remove(); });
  if (items.length === 1) { $('#dnext')?.remove(); $('#dall')?.remove(); }
  $('#lprob')?.addEventListener('click', () => openIds(ps.map(e => e.id)));
}

// ---------- 定着度 ----------
function fieldStats(keys) {
  const set = new Set(keys);
  const list = ENTRIES.filter(e => set.has(e.f));
  const logs = state.log.filter(l => { const e = entryById.get(l.p); return e && set.has(e.f); });
  // 各問題の最新の結果
  const last = new Map();
  for (const l of logs) last.set(l.p, l);
  const latest = [...last.values()];
  return {
    total: list.length,
    solved: list.filter(e => state.problems[e.id]).length,
    full: latest.filter(l => l.g >= 3).length,
    tried: latest.length,
    due: dueEntries(state, { fields: keys }).length,
  };
}

// 得意度：各問題の最新の結果（完答 1・一部やヒント 0.5・解けず 0）を難易度で重みづけした平均。
// 少ない回数で極端にならないよう 0.5 に2問分寄せる。5問未満は「データ不足」、10問未満は「暫定」。
function strength(keys) {
  const set = new Set(keys);
  const last = new Map();
  for (const l of state.log) { const e = entryById.get(l.p); if (e && set.has(e.f)) last.set(l.p, { l, e }); }
  let sw = 0, ss = 0;
  for (const { l, e } of last.values()) {
    const w = 1 + 0.25 * e.lv;
    const sc = l.g >= 3 ? 1 : l.g === 2 ? 0.5 : 0;
    sw += w; ss += w * sc;
  }
  const n = last.size;
  return { n, score: n >= MIN_JUDGE ? (ss + 1) / (sw + 2) : null };
}
const MIN_JUDGE = 5;
// いちばん苦手な単元（得意度 0.5 未満で、5問以上の結果があるもの）
function weakestField() {
  let w = null;
  for (const f of FIELDS) {
    const st = strength([f.key]);
    if (st.score != null && st.score < 0.5 && (!w || st.score < w.score)) w = { f, ...st };
  }
  return w;
}
const SUBJ_SHORT = { '地層・岩石と地球の歴史': '地層・歴史', '大気と海洋': '大気・海洋' };
// 得意度 → タイルの色（苦手＝赤系、得意＝緑系、データ不足＝無地）
function strengthStyle(sc) {
  if (sc == null) return '';
  const t = Math.round(Math.min(1, Math.abs(sc - 0.5) * 2) * 55 + 8);
  return `background:color-mix(in srgb, var(${sc >= 0.5 ? '--good' : '--bad'}) ${t}%, var(--card));`;
}
// 科目のレーダー図（SVG）：外側ほど得意。データ不足の科目は中心に点線
function radarSVG(items) {
  const N = items.length, R = 104, cx = 150, cy = 136;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (f) => items.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
  const val = items.map((it, i) => pt(i, R * (it.score ?? 0)).map(v => v.toFixed(1)).join(',')).join(' ');
  const has = items.some(it => it.score != null);
  return `<svg class="radar" viewBox="0 0 300 278" role="img" aria-label="科目ごとの得意度">
    ${[0.25, 0.5, 0.75, 1].map(f => `<polygon points="${ring(f)}" class="rg${f === 0.5 ? ' mid' : ''}"/>`).join('')}
    ${items.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rg"/>`; }).join('')}
    ${has ? `<polygon points="${val}" class="rv"/>` : ''}
    ${items.map((it, i) => it.score == null ? '' : (() => { const [x, y] = pt(i, R * it.score); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="rp"/>`; })()).join('')}
    ${items.map((it, i) => { const [x, y] = pt(i, R + 20); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="rl${it.score == null ? ' none' : ''}">${esc(it.label)}<tspan class="rs" x="${x.toFixed(1)}" dy="13">${it.score == null ? '—' : Math.round(it.score * 100)}</tspan></text>`; }).join('')}
    <text x="${cx + 4}" y="${cy - R * 0.5 + 3}" class="rt">50</text>
  </svg>`;
}
function strengthHTML() {
  const subs = subjectsWithFields();
  const fs = FIELDS.map(f => ({ f, ...strength([f.key]) }));
  const judged = fs.filter(x => x.score != null).sort((a, b) => b.score - a.score);
  const good = judged.filter(x => x.score >= 0.6).slice(0, 3);
  const weak = judged.filter(x => x.score < 0.5).slice(-3).reverse();
  const radar = radarSVG(subs.map(s => ({ label: SUBJ_SHORT[s.name] || s.name, ...strength(s.fields.map(f => f.key)) })));
  const name = (x) => `${esc(SUBJ_SHORT[x.f.subject] || x.f.subject)}・${esc(x.f.name)}`;
  return `
    <h2>得意・苦手</h2>
    <div class="panel strength">
      ${judged.length ? '' : `<p class="muted" style="margin:0 0 8px">1つの単元で${MIN_JUDGE}問以上解くと、その単元の得意・苦手が出ます（10問までは暫定）。</p>`}
      ${radar}
      <div class="sw-cols">
        <div><b class="sw-good">得意</b>${good.length ? good.map(x => `<span>${name(x)} <em>${Math.round(x.score * 100)}</em>${x.n < 10 ? '<small>暫定</small>' : ''}</span>`).join('') : '<span class="muted">まだありません</span>'}</div>
        <div><b class="sw-weak">苦手</b>${weak.length ? weak.map(x => `<span>${name(x)} <em>${Math.round(x.score * 100)}</em>${x.n < 10 ? '<small>暫定</small>' : ''}</span>`).join('') : '<span class="muted">まだありません</span>'}</div>
      </div>
      <div class="tiles">${subs.map(s => `<div class="tile-row"><span class="tile-sub">${esc(SUBJ_SHORT[s.name] || s.name)}</span><div class="tile-grid">${s.fields.map(f => {
        const x = fs.find(y => y.f.key === f.key);
        return `<button class="tile" data-f="${esc(f.key)}" style="${strengthStyle(x.score)}"><span>${esc(f.name)}</span><b>${x.score == null ? (x.n ? `${x.n}問` : '—') : Math.round(x.score * 100) + (x.n < 10 ? '?' : '')}</b></button>`;
      }).join('')}</div></div>`).join('')}</div>
      <p class="muted legend"><i class="lg-weak"></i>苦手<i class="lg-mid"></i>ふつう<i class="lg-good"></i>得意　数字は得意度（0〜100）。最後に解いた結果を難しい問題ほど重く数えます。「?」は10問未満の暫定値。タップでその単元を演習。</p>
      ${trendHTML()}
    </div>`;
}
// 最近の伸び：直近14日とそれ以前の完答率。どちらも10回以上あるときだけ比べる
function trendHTML(now = Date.now()) {
  const cut = now - 14 * 86400000;
  const rate = (ls) => ls.filter(l => l.g >= 3).length / ls.length;
  const recent = state.log.filter(l => l.t >= cut), before = state.log.filter(l => l.t < cut);
  if (recent.length < 10 || before.length < 10) return `<p class="muted trend">最近の伸びは、直近2週間とそれ以前にそれぞれ10回以上の解答がたまると表示します。</p>`;
  const a = rate(recent), b = rate(before), d = Math.round((a - b) * 100);
  return `<p class="trend">完答率：直近2週間 <b>${Math.round(a * 100)}%</b>（${recent.length}回）／それ以前 ${Math.round(b * 100)}%（${before.length}回）${Math.abs(d) < 5 ? '　ほぼ同じ' : d > 0 ? `　<span class="up">+${d}</span>` : `　<span class="down">${d}</span>`}<br><span class="muted small">解く問題の難易度が変わると完答率も変わります。目安として見てください。</span></p>`;
}

function renderMap() {
  if (!CON) loadKnowledge().then(K => { knowledgeCache = K; CON = buildCon(K); if (location.hash.startsWith('#map')) renderMap(); }).catch(() => {});
  const withConf = state.log.filter(l => l.c);
  NEXT_ACTS = nextActions();
  const high = withConf.filter(l => l.c === 'high');
  const low = withConf.filter(l => l.c === 'low');
  const over = high.filter(l => !l.ok).length;
  const under = low.filter(l => l.ok).length;
  const total = state.log.length;
  const solo = state.log.filter(l => l.g >= 3).length;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  view.innerHTML = `
    <div class="fade-in">
      <div class="kicker">${FIELDS.length}単元・${ENTRIES.length}問</div>
      <h1>定着度</h1>
      <p class="sub">単元ごとの進み具合と、最後に解いたときに完答できた割合です。</p>
      ${nextActionsHTML()}
      ${strengthHTML()}
      ${conStrengthHTML()}
      <h2>自信と結果のズレ</h2>
      <div class="calib">
        <div class="stat"><b>${pct(over, high.length)}</b><span>「確実」で完答できず（過信）</span></div>
        <div class="stat"><b>${pct(under, low.length)}</b><span>「自信なし」で完答</span></div>
      </div>
      <p class="muted" style="margin:8px 2px 0">${total ? `これまで ${total}回解答、うち自力で完答 ${solo}回。` : 'まだ記録がありません。'}過信が多いときは、解き終えたら検算する習慣を。</p>
      ${subjectsWithFields().map(sub => `
        <h2>${esc(sub.name)}</h2>
        ${sub.fields.map(f => {
          const st = fieldStats([f.key]);
          const rate = st.tried ? st.full / st.tried : 0;
          return `<button class="card-row" data-f="${esc(f.key)}">
            <span><span class="nm">${esc(f.name)}</span><br>
              <span class="muted">解いた ${st.solved} / ${st.total}問・完答率 ${pct(st.full, st.tried)}${st.due ? `・復習待ち ${st.due}問` : ''}</span></span>
            <span class="chip ${st.due ? 'st-due' : st.tried ? 'st-learning' : 'st-new'}">${st.due ? '復習' : st.tried ? '学習中' : '未着手'}</span>
            <span class="bar"><div style="width:${Math.round(st.solved / Math.max(1, st.total) * 100)}%;background:${rate >= 0.7 ? 'var(--good)' : 'var(--accent)'}"></div></span>
          </button>`;
        }).join('')}`).join('')}
    </div>`;
  $$('.card-row, .tile').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f;
    const rev = pickReview(state, { fields: [f], size: state.practice.size });
    if (rev.length) { startSession(rev, { review: true, fields: [f], size: state.practice.size }); return; }
    const cfg = { fields: [f], levels: state.practice.levels.slice(), size: state.practice.size };
    const st = pickPractice(state, cfg);
    if (st.length) startSession(st, cfg); else toast('この条件の問題はありません');
  }));
}

// ---------- 分野を選ぶ ----------
function renderPractice() {
  const pr = state.practice;
  // 保存された選択のうち、今はない単元は外す
  const saved = (pr.fields || []).filter(k => fieldByKey[k]);
  let fields = new Set(saved.length ? saved : FIELDS.map(f => f.key));
  const draw = () => {
    const n = pool({ fields: [...fields], levels: pr.levels }).length;
    const bar = levelToolbar(pr, draw);
    view.innerHTML = `
      <div class="fade-in">
        <div class="kicker">演習モード</div>
        <h1>分野を選ぶ</h1>
        <p class="sub">選んだ範囲から、まだ解いていない問題・久しぶりの問題を優先して、分野を混ぜて出します。</p>
        ${bar.html}
        <div class="btn-row" style="margin-top:4px"><button class="btn ghost" id="all">すべて選択</button><button class="btn ghost" id="none">すべて解除</button></div>
        ${subjectsWithFields().map(sub => {
          const allOn = sub.fields.every(f => fields.has(f.key));
          return `<div class="subject">
            <button class="subj ${allOn ? 'on' : ''}" data-s="${esc(sub.name)}">${esc(sub.name)}</button>
            <div class="toggles">${sub.fields.map(f => `<button class="tog ${fields.has(f.key) ? 'on' : ''}" data-f="${esc(f.key)}">${esc(f.name)}<small>${pool({ fields: [f.key], levels: pr.levels }).length}</small></button>`).join('')}</div>
          </div>`;
        }).join('')}
        <button class="btn primary block" id="go" style="margin-top:20px" ${n ? '' : 'disabled'}>${n ? `始める（該当 ${n}問から ${Math.min(n, pr.size)}問）` : '該当する問題がありません'}</button>
      </div>`;
    bar.bind();
    const persist = () => { pr.fields = [...fields]; save(); draw(); };
    $$('.tog[data-f]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.f; fields.has(k) ? fields.delete(k) : fields.add(k); persist(); }));
    $$('.subj').forEach(b => b.addEventListener('click', () => {
      const ks = FIELDS.filter(f => f.subject === b.dataset.s).map(f => f.key);
      const allOn = ks.every(k => fields.has(k));
      ks.forEach(k => allOn ? fields.delete(k) : fields.add(k));
      persist();
    }));
    $('#all').addEventListener('click', () => { fields = new Set(FIELDS.map(f => f.key)); persist(); });
    $('#none').addEventListener('click', () => { fields = new Set(); persist(); });
    $('#go').addEventListener('click', () => {
      const cfg = { fields: [...fields], levels: pr.levels.slice(), size: pr.size };
      const st = pickPractice(state, cfg);
      if (st.length) startSession(st, cfg);
    });
  };
  draw();
}

// ---------- 設定 ----------
// 問題管理表の「弟テスト記録」シートと同じ列で書き出す
function testLogCSV(since = 0) {
  const head = ['日付', '問題ID', '科目', '分野', '難易度', '正誤', '所要時間(分)', '手応え(1-5)', 'どこで詰まったか', '感想・改善点'];
  const q = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const mark = (l) => l.sg ? { full: '○', part: '△', none: '×' }[l.sg] : (l.g >= 3 ? '○' : l.g === 2 ? '△' : '×');
  const rows = state.log.filter(l => l.t > since).map(l => {
    const e = entryById.get(l.p), f = e && fieldByKey[e.f];
    const d = new Date(l.t);
    const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const disp = l.disp && l.disp.length ? `判定に異議：${l.disp.join(' / ')}` : '';
    const comment = [l.sg === 'full' ? (l.note || '') : '', disp].filter(Boolean).join('　');
    return [date, l.p, f ? f.subject : '', f ? f.name : '', e ? e.lv : '', mark(l), l.min || '', l.feel || '', l.sg === 'full' ? '' : (l.note || ''), comment].map(q).join(',');
  });
  return '﻿' + [head.join(','), ...rows].join('\r\n');
}
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 記録の点検に使う ID の一覧（今の問題データ・解法カード）
function idContext() {
  return { problemIds: new Set(ENTRIES.map(e => e.id)) };
}
function backupFile() {
  download(`gaia-${dayKey()}.json`, JSON.stringify(makeBackup(state, VERSION), null, 1), 'application/json');
}
const REASON_LABEL = (r) => esc(r || '');
// 読み込み・控えへの復帰の共通部分：今の記録の控えを残す → 新しい記録を保存 → 点検。失敗したら元のまま
async function applyRestore(incoming, mode, reason) {
  const before = counts(state);
  const next = restoreState(state, incoming, mode);
  const rep = audit(next, idContext());
  if (rep.errors.length) { toast('読み込んだ結果に正しくない値があるため、取りやめました（今の記録はそのままです）'); return false; }
  const r = store.replace(state, next, reason);
  if (!r.ok) { toast(`${SAVE_MSG[r.reason] || SAVE_MSG.write}（読み込みは取りやめました。今の記録はそのままです）`); return false; }
  if (!r.snapshotted) backupFile();   // 端末に控えを残せなかったときは、置き換える前の記録をファイルで残す（この時点では保存前の state）
  state = r.state; lwwSig = null; session = null;
  const after = counts(state);
  const warn = rep.warnings.reduce((a, w) => a + w.count, 0);
  await choose({ title: '読み込みました',
    body: `解答の記録 ${before.log} → ${after.log}件、復習状態 ${before.pstat} → ${after.pstat}問、ブックマーク ${before.bookmarks} → ${after.bookmarks}件。${warn ? `注意 ${warn}件（今のデータに無い問題IDの記録など。記録は残してあります）。` : '点検で問題はありませんでした。'}${r.snapshotted ? '読み込む前の記録は、設定の「自動の控え」から戻せます。' : '読み込む前の記録はファイルに書き出しました。'}`,
    options: [{ key: 'ok', label: 'OK', cls: 'primary' }] });
  route();
  if (sync && sync.loggedIn()) sync.syncNow();
  return true;
}

// 設定の「学習記録のバックアップ」：点検の結果・自動の控え・読めなかった記録
function integrityHTML() {
  const rep = audit(state, idContext());
  const nw = rep.warnings.reduce((a, w) => a + w.count, 0), ne = rep.errors.reduce((a, w) => a + w.count, 0);
  const items = [...rep.errors.map(x => ['bad', x]), ...rep.warnings.map(x => ['', x])];
  const snaps = store.snapshots(), broken = store.brokenKeys(), use = store.usage();
  const kb = (n) => `${Math.round(n / 1024).toLocaleString('ja-JP')}KB`;
  return `<details class="integrity" style="margin-top:10px"><summary class="muted small">記録の点検：${ne ? `<b style="color:var(--bad)">正しくない値 ${ne}件</b>` : '正しくない値はありません'}${nw ? `・注意 ${nw}件` : ''}（解答の記録 ${rep.stats.log}件）</summary>
      ${items.length ? `<ul class="small" style="margin:6px 0;padding-left:1.1em">${items.map(([c, x]) => `<li${c ? ' style="color:var(--bad)"' : ''}>${esc(x.msg)}：${x.count}件（${esc(x.ids.slice(0, 5).join(', '))}${x.count > 5 ? ' ほか' : ''}）</li>`).join('')}</ul>
        <p class="muted small" style="margin:0">記録は自動では直しません（消える記録が出ないように）。今のデータに無い問題の記録は、そのまま残してあります。</p>` : ''}
      <p class="muted small" style="margin:4px 0 0">この端末に保存している量：記録 ${kb(use.main)}・控え ${kb(use.snaps)}${use.broken ? `・退避 ${kb(use.broken)}` : ''}（多くのブラウザの上限は約5MB）</p>
    </details>
    ${snaps.length || broken.length ? `<div class="small" style="margin-top:10px"><b>自動の控え</b>（この端末の中だけ。移行・読み込み・消去の前に残します）
      <ul style="margin:6px 0;padding-left:1.1em">${snaps.map((sn, i) => `<li>${new Date(sn.at).toLocaleString('ja-JP')}：${esc(sn.reason || '')}（解答 ${sn.n}件） <button class="btn ghost snap-back" data-i="${i}" style="padding:2px 10px">戻す</button></li>`).join('')}
      ${broken.map(k => `<li>読めなかった記録（${new Date(+k.slice(BROKEN_PREFIX.length)).toLocaleString('ja-JP')}） <button class="btn ghost broken-dl" data-k="${esc(k)}" style="padding:2px 10px">書き出す</button></li>`).join('')}</ul>
      <button class="btn ghost" id="snap-clear" style="padding:2px 10px">控えを消す</button></div>` : ''}`;
}

function renderSettings() {
  const since = state.csvExportedAt || 0;
  const newCount = state.log.filter(l => l.t > since).length;
  view.innerHTML = `
    <div class="fade-in">
      <div class="kicker">v${VERSION}</div>
      <h1>設定</h1>
      ${sync ? '<h2>アカウントと同期</h2><div class="panel" id="acct"></div>' : ''}
      <h2>解答の形式</h2>
      <div class="panel">
        <div class="setting"><span>答え方</span>
          <div class="segment amode" id="amode">${ANSWER_MODES.map(([k, v]) => `<button data-m="${k}" class="${answerMode() === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        <p class="muted" style="margin:8px 0 0">${{
          input: '<b>記述式</b>：語句・数値を入力して自動で採点します（選ぶ・並べる問題はそのまま）。記述の小問は自己採点です。',
          choice: '<b>選択式</b>：語句・数値の欄も4つの選択肢から選びます（やり直しはなし）。記述の小問は自己採点です。',
          self: '<b>自己採点</b>：答えを考えてから、答えと解説を見て自分で採点します。',
        }[answerMode()]}</p>
      </div>
      <h2>表示と音</h2>
      <div class="panel">
        <div class="setting"><span>画面のテーマ</span>
          <div class="segment theme" id="theme">${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, v]) => `<button data-t="${k}" class="${(state.settings.theme || 'auto') === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        <div class="setting"><span>効果音</span><button class="switch ${state.settings.sound !== false ? 'on' : ''}" id="snd" role="switch" aria-checked="${state.settings.sound !== false}"><i></i></button></div>
        <div class="setting"><span>${MASCOT_NAME}（モグラ）の声かけ</span><button class="switch ${state.settings.mascot !== false ? 'on' : ''}" id="brd" role="switch" aria-checked="${state.settings.mascot !== false}"><i></i></button></div>
      </div>
      <h2>テスト記録の書き出し</h2>
      <div class="panel">
        <div class="btn-row" style="margin-top:0">
          <button class="btn primary" id="csvnew" ${newCount ? '' : 'disabled'}>新しい${newCount}件</button>
          <button class="btn" id="csvall" ${state.log.length ? '' : 'disabled'}>すべて（${state.log.length}件）</button>
        </div>
        ${since ? `<p class="muted" style="margin:8px 0 0">前回の書き出し：${new Date(since).toLocaleString('ja-JP')}</p>` : ''}
      </div>
      <h2>学習記録のバックアップ</h2>
      <div class="panel">
        <p class="muted" style="margin:0 0 10px">${sync && sync.loggedIn() ? '学習記録はこの端末とアカウント（サーバー）に保存されています。手元にも残したいときは書き出してください。' : '学習記録はこの端末のブラウザ内だけに保存されます。機種変更の前に書き出してください。Safari で使っていて7日以上開かないと、記録が消えることがあります（ホーム画面に追加すると消えにくくなります）。'}</p>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" id="exp">書き出す</button>
          <label class="btn" for="imp">読み込む</label>
          <input type="file" id="imp" accept="application/json" hidden>
        </div>
        ${integrityHTML()}
        <button class="btn ghost block" id="reset" style="margin-top:10px;color:var(--bad)">記録をすべて消す</button>
      </div>
      <h2>設計の根拠</h2>
      <div class="panel">
        <ul class="refs" style="margin:0;padding-left:1.1em">
          <li><strong>想起練習・分散学習</strong>：学習法10種の比較で最も評価が高い2つ。<a href="https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html" target="_blank" rel="noopener">Dunlosky ほか 2013</a></li>
          <li><strong>交互練習</strong>：中学1年787人の無作為化試験で、1か月後のテストが 61% 対 38%。<a href="https://www.structural-learning.com/research-briefings/mix-it-up" target="_blank" rel="noopener">Rohrer ほか 2020</a></li>
          <li><strong>答えを出さないヒント</strong>：制限なしのAIで練習した生徒は、AIなしの試験で成績が下がった。<a href="https://papers.ssrn.com/abstract=4895486" target="_blank" rel="noopener">Bastani ほか 2025</a></li>
        </ul>
        <p class="muted" style="margin:10px 0 0">復習間隔は FSRS の考え方を簡略化したモデルで推定しています。難関・最難関レベルでの効果は未検証です。</p>
      </div>
    </div>`;
  drawAccount();
  $$('#amode button').forEach(b => b.addEventListener('click', () => {
    state.settings.answer = b.dataset.m; save(); play('tap'); renderSettings();
  }));
  $$('#theme button').forEach(b => b.addEventListener('click', () => {
    state.settings.theme = b.dataset.t; save(); applyTheme(b.dataset.t); renderSettings();
  }));
  $('#snd').addEventListener('click', () => {
    state.settings.sound = state.settings.sound === false; save(); setSound(state.settings.sound); if (state.settings.sound) play('correct'); renderSettings();
  });
  $('#brd').addEventListener('click', () => {
    state.settings.mascot = state.settings.mascot === false; save();
    if (state.settings.mascot) { mountMascot(); mascotSay('よろしくね。'); } else $('#mascot')?.remove();
    renderSettings();
  });
  const csv = (from) => {
    download(`gaia-テスト記録-${dayKey()}.csv`, testLogCSV(from), 'text/csv');
    state.csvExportedAt = Date.now(); save(); renderSettings();
  };
  $('#csvnew').addEventListener('click', () => csv(since));
  $('#csvall').addEventListener('click', () => csv(0));
  $('#exp').addEventListener('click', backupFile);
  $('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let data;
    try {
      if (f.size > 50e6) throw new Error('大きすぎるファイルです');
      let obj;
      try { obj = JSON.parse(await f.text()); } catch { throw new Error('ファイルが壊れていて読めません（JSON ではありません）'); }
      data = readBackup(obj, idContext());
    } catch (err) { toast(err && err.message ? err.message : '読み込めないファイルです'); return; }
    const k = hasRecords(state) ? await choose({ title: 'バックアップを読み込む',
      body: `ファイルには解答の記録が ${data.state.log.length}件あります${data.meta.createdAt ? `（${new Date(data.meta.createdAt).toLocaleString('ja-JP')} に書き出し）` : ''}。今の記録（${state.log.length}件）をどうしますか？`,
      options: [{ key: 'merge', label: '今の記録と合わせる', cls: 'primary' }, { key: 'replace', label: '今の記録を、ファイルの記録に置き換える' }] }) : 'replace';
    if (!k) return;
    await applyRestore(data.state, k, k === 'merge' ? 'バックアップと合わせる前' : 'バックアップで置き換える前');
  });
  $$('.snap-back').forEach(b => b.addEventListener('click', async () => {
    const sn = store.snapshots()[+b.dataset.i];
    if (!sn) return;
    let data;
    try { data = readBackup(JSON.parse(sn.raw), idContext()); } catch (err) { toast(`この控えは読めません：${err.message}`); return; }
    const k = await choose({ title: '控えの時点に戻す', body: `${new Date(sn.at).toLocaleString('ja-JP')}（${REASON_LABEL(sn.reason)}）の記録 ${data.state.log.length}件に戻します。今の記録（${state.log.length}件）は新しい控えとして残します。`,
      options: [{ key: 'replace', label: 'この時点に戻す', cls: 'primary' }, { key: 'merge', label: '今の記録と合わせる' }] });
    if (!k) return;
    await applyRestore(data.state, k, '控えに戻す前');
  }));
  $('#snap-clear')?.addEventListener('click', async () => {
    const k = await choose({ title: '自動の控えを消す', body: 'この端末に残している控え（と、読めなかった記録の退避）を消します。学習記録の本体は消えません。',
      options: [{ key: 'y', label: '消す', cls: 'danger' }] });
    if (!k) return;
    const r = store.clearSnapshots();
    if (!r.ok) toast(`${r.failed.length}件の控えを消せませんでした（学習記録の本体は変わっていません）`);
    renderSettings();
  });
  $$('.broken-dl').forEach(b => b.addEventListener('click', () => {
    const v = store.get(b.dataset.k);
    if (v) download(`gaia-読めなかった記録-${b.dataset.k.slice(BROKEN_PREFIX.length)}.json`, v, 'application/json');
  }));
  $('#reset').addEventListener('click', async () => {
    const logged = sync && sync.loggedIn();
    const k = await choose({ title: '記録をすべて消す',
      body: (logged ? '解答の記録・復習の予定・ブックマーク・メモを消します（設定は残ります）。' : '学習記録をすべて消します（設定は残ります）。')
        + '消す前の記録は、この端末に控えとして残ります（設定の「自動の控え」から戻せます。控えも消すには「控えを消す」）。',
      options: logged
        ? [{ key: 'all', label: 'この端末とアカウントの記録を消す', cls: 'danger' }, { key: 'device', label: 'ログアウトして、この端末の記録だけ消す' }]
        : [{ key: 'all', label: '消す', cls: 'danger' }] });
    if (!k) return;
    const keep = { settings: state.settings, practice: state.practice, settingsAt: state.settingsAt, labPrefs: state.labPrefs };
    if (k === 'device') {
      // この端末の分だけ消す：先にサーバーへ送れたことを確かめる（送れていない記録を消さない）
      if (!(await sync.syncNow())) { toast('サーバーと同期できなかったため、消していません'); return; }
      await sync.logout();
      const r = store.replace(state, { ...freshState(), ...keep }, null, { fence: true });
      if (!r.ok) { toast(`${SAVE_MSG[r.reason] || SAVE_MSG.write}（消していません）`); return; }
      state = r.state;
    } else {
      const next = { ...freshState(), ...keep, resetAt: Date.now() };   // 消した印：同期で、ほかの端末・サーバーの古い記録を持ち込まない
      const r = store.replace(state, next, '消去の前');
      if (!r.ok) { toast(`${SAVE_MSG[r.reason] || SAVE_MSG.write}（消していません）`); return; }
      if (!r.snapshotted) backupFile();
      state = r.state;
    }
    lwwSig = null; session = null; clearSavedSession(); toast('消去しました'); route();
    if (k === 'all' && logged) sync.syncNow();
  });
}

// テスト・確認用：指定した問題IDでセットを始める（例：__gaia.open(['SOL-SHP-001'])）
window.__gaia = { open: (ids) => startSession(ids.map(pid => ({ kind: 'problem', pid })), { size: ids.length }) };

// ---------- 起動 ----------
applyTheme(state.settings.theme || 'auto');
setSound(state.settings.sound !== false);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(state.settings.theme || 'auto'));
mountMascot();
route();
bootWarn();
loadCatalog().then((meta) => {
  ready = true;
  loadKnowledge().then(k => { knowledgeCache = k; }).catch(() => {});
  route();
  initSync();
  if (meta.ok) dataWarn();
  if (!meta.ok) showBanner(`<b>問題データを読み込めませんでした</b>${esc(meta.error || '')}。リポジトリに data フォルダがアップロードされているか確認してください。`);
});
// アップロード漏れの検出：各ファイルの版が app.js と一致するか
function staleFiles() {
  const cssV = getComputedStyle(document.documentElement).getPropertyValue('--gaia-version').replace(/['"\s]/g, '');
  const list = { 'js/answer.js': M_ANS.FILE_VERSION, 'js/ui.js': M_UI.FILE_VERSION, 'js/catalog.js': M_CAT.FILE_VERSION, 'js/scheduler.js': M_SCHED.FILE_VERSION, 'js/parser.js': M_PARSER.FILE_VERSION, 'js/problem/figures.js': M_FIG.FILE_VERSION, 'js/store.js': M_STORE.FILE_VERSION, 'js/mastery.js': M_MAST.FILE_VERSION, 'css/style.css': cssV };
  return Object.entries(list).filter(([, v]) => v !== VERSION).map(([k]) => k);
}
// 起動時の記録の読み込みで起きたこと（読めない・一部壊れていた・新しい版の記録）
function bootWarn() {
  const where = '設定の「学習記録のバックアップ」から書き出せます。';
  const msg = {
    broken: boot.quarantined ? `<b>保存されていた記録を読めませんでした</b>元の記録は消さずに退避してあります（${where}）。` : '<b>保存されていた記録を読めませんでした</b>元の記録を退避できなかったため、この端末への保存を止めています。新しく解いた記録は、この画面を閉じると残りません。',
    salvaged: `<b>記録の一部が壊れていました</b>壊れていた部分（${esc(boot.issues.map(i => i.key || i.code).join('・'))}）だけを初期値に戻し、ほかの記録はそのまま使います。元の記録は退避してあります（${where}）。`,
    newer: '<b>新しい版の GAIA で保存された記録です</b>この版のアプリは古いため、記録を守るよう<b>保存も同期もしません</b>（解いた結果は残りません）。ページを再読み込みしてアプリを更新してください。',
    migrate_failed: `<b>記録を新しい形に移せませんでした</b>元の記録を守るため、この端末への保存を止めています（解いた結果は残りません）。アプリを更新してから再読み込みすると、もう一度移します。元の記録は退避もしてあります（${where}）。`,
    unavailable: '<b>この端末に保存した記録を読めませんでした</b>記録を上書きしないよう、保存を止めています。しばらくしてから再読み込みしてください（保存できるようになれば、保存されている記録と合わせてから保存します）。',
  }[boot.status] || (noStorage ? '<b>この環境では記録を保存できません</b>プライベートモードなどで、ブラウザの保存領域が使えません。解いた結果は画面を閉じると残りません。' : '');
  if (msg) showBanner(msg);
}
// 同じ端末の別のタブが記録を保存した：この画面の記録と合わせる（解いている途中なら、画面は描き直さない）
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || e.storageArea !== LS) return;
  save();
  if (!session && !document.activeElement?.matches('input, textarea')) route();
});
function showBanner(html) {
  let b = $('.banner');
  if (!b) { b = document.createElement('div'); b.className = 'banner'; document.body.prepend(b); }
  b.innerHTML = html;
}
// 問題データの版の食い違い（一部の data/ ファイルだけ古い、形式が新しすぎる）
function dataWarn() {
  const files = M_CAT.staleDataFiles ? M_CAT.staleDataFiles() : [];
  const msgs = [...(META.warnings || [])];
  if (files.length) msgs.push(`${files.map(esc).join('、')} が data/index.json と違う版です。data フォルダをすべて上書きアップロードしてください。`);
  if (msgs.length) showBanner(`<b>問題データの版が揃っていません</b>${msgs.join('<br>')}`);
}
setTimeout(() => {
  const stale = staleFiles();
  if (stale.length) showBanner(`<b>古いファイルが混ざっています（v${VERSION}）</b>${stale.map(esc).join('、')} が更新されていません。リポジトリにzipの中身をすべて上書きアップロードしてください。`);
}, 400);
// 予期しないエラーを画面に出す（報告用）
window.addEventListener('error', (e) => showBanner(`<b>エラー</b>${esc(e.message || '')} <small>${esc((e.filename || '').split('/').pop())}:${e.lineno || ''}</small>`));
window.addEventListener('unhandledrejection', (e) => showBanner(`<b>エラー</b>${esc(String(e.reason && e.reason.message || e.reason))}`));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !/claude|claudeusercontent/.test(location.hostname)) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
