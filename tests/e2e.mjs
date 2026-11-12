// ブラウザでの通し操作（Playwright・Chromium、iPhone 幅 390×844）
//   node tests/e2e.mjs
// 出題形式ごとの採点、探究の5ページ、一部のデータだけ古いときの警告、オフライン、同期を確かめる。
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createMockSupabase } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
let fakeDataVersion = null;
const mock = createMockSupabase({ key: 'sb_publishable_e2e' });   // 同期のテスト用（このサーバーの /mock/ で応える）   // Service Worker のテスト用：index.json の dataVersion を差し替える
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/mock/')) {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', async () => {
      const r = await mock.handle({ method: req.method, url: req.url, headers: req.headers, body: body || null });
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(r.body);
    });
    return;
  }
  if (p === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    const v = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').match(/FILE_VERSION = '([^']+)'/)[1];
    return res.end(`export const FILE_VERSION = '${v}';
export const SUPABASE_URL = 'http://localhost:${server.address().port}/mock';
export const SUPABASE_KEY = 'sb_publishable_e2e';`);
  }
  if (fakeDataVersion && p === '/data/index.json') {
    const d = JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); d.dataVersion = fakeDataVersion;
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(d));
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const U = `http://localhost:${server.address().port}/`;

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const browser = await chromium.launch();

async function newPage({ state = null, route = null, sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: sw ? 'allow' : 'block' });
  if (state) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('gaia.v1', s); } }, JSON.stringify(state));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  page.requested = [];
  page.on('request', r => page.requested.push(new URL(r.url()).pathname));
  if (route) await route(page);
  return page;
}
const next = (page) => page.locator('button:has-text("次")').first().click();

try {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/state-v1.json'), 'utf8'));
  const LS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gaia.v1')));
  const conf = (page) => page.locator('#conf button').nth(1).click();
  // 1. 起動・タブ・出題形式ごとの採点
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    const tabs = await page.locator('.tabbar a span').allInnerTexts();
    ok(tabs.join() === '今日,探究,法則,定着度,設定', `タブの構成 ${tabs}`);
    ok(await page.locator('#lv button').count() === 6, '難易度ボタンが6つ');
    ok(await page.locator('.fmt-card').count() === 6 && await page.locator('.fmt-card:disabled').count() === 0, '「形式ごとに演習」に6つの形式があり、すべて問題がある');
    ok(await page.locator('.banner').count() === 0, '起動時に警告が出ない');
    await page.evaluate("__gaia.open(['SOL-INT-001', 'SOL-IGN-007', 'SOL-INT-004', 'SOL-EQK-008', 'GEO-STR-003'])"); await page.waitForTimeout(1200);
    // 一問一答（語句。別名も正解）
    await conf(page);
    await page.locator('#inputs input').first().fill('モホ面');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '一問一答：別名（モホ面）でも完答');
    ok(await page.locator('.zk-open').count() === 1, '解いたあとに「探究で確かめる」');
    await next(page); await page.waitForTimeout(900);
    // すべて選ぶ：選びすぎると不正解、正しく選ぶと正解
    await conf(page);
    ok(await page.locator('.field.pick .opt').count() === 7, 'すべて選ぶ：選択肢が7つ');
    for (const i of [0, 1, 2]) await page.locator('.field.pick .opt').nth(i).click();
    await page.click('#judge'); await page.waitForTimeout(500);
    ok((await page.locator('#feedback').innerText()).includes('違う'), 'すべて選ぶ：選びすぎは不正解');
    for (const i of [1, 4, 6]) await page.locator('.field.pick .opt').nth(i).click();
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), 'すべて選ぶ：選び直して正解（2回目）');
    await next(page); await page.waitForTimeout(900);
    // 順序（並べかえ）
    await conf(page);
    for (const t of ['地殻', 'マントル', '外核', '内核']) await page.locator(`.field.order .pool button:has-text("${t}")`).click();
    ok(await page.locator('.field.order .placed').count() === 4, '順序：タップした順に並ぶ');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '順序：地殻 → マントル → 外核 → 内核 で完答');
    await next(page); await page.waitForTimeout(900);
    // 計算（有効数字つきの数値）
    await conf(page);
    for (const [i, v] of ['100', '80'].entries()) await page.locator('#inputs input').nth(i).fill(v);
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '計算：震源距離と深さで完答');
    await next(page); await page.waitForTimeout(900);
    // 図の読み取り＋順序（地質断面図）
    await conf(page);
    ok(await page.locator('.question .pfig svg').count() === 1, '断面図が問題文の中に出る');
    for (const t of ['A〜E層の堆積', '断層 f の活動', '隆起・侵食', 'F〜H層の堆積']) await page.locator(`.field.order .pool button:has-text("${t}")`).click();
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '断面図：地史を古い順に並べて完答');
    await page.locator('.zk-open').click(); await page.waitForTimeout(1500);
    ok(page.url().includes('#lab=strata/fault-unconf') && await page.locator('#stfig svg').count() === 1 && await page.locator('#stev li').count() === 4, '「探究で確かめる」で地史の再生が開く');
    const st = await LS(page);
    ok(['SOL-INT-001', 'SOL-IGN-007', 'SOL-INT-004', 'SOL-EQK-008', 'GEO-STR-003'].every(id => st.pstat[id]), '結果が問題ID で記録される');
    ok(st.log.find(l => l.p === 'SOL-IGN-007').g === 2, '2回目で正解した問題は「一部・ヒントあり」と同じ扱い');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 2. 探究の5つのページ
  {
    const page = await newPage();
    await page.goto(U + '#lab'); await page.waitForTimeout(1200);
    ok(await page.locator('.zk-card').count() === 6, '探究のトップに5つのページ＋法則');
    // 識別
    await page.goto(U + '#lab=identify'); await page.waitForTimeout(1200);
    ok(await page.locator('.spec').count() >= 17, '岩石の図鑑に17種以上');
    await page.locator('.spec[data-r="granite"]').click(); await page.waitForTimeout(300);
    ok((await page.locator('#rdetail').innerText()).includes('石英') && await page.locator('#rdetail .minbar span').count() === 4, '岩石をタップすると特徴と鉱物の割合');
    await page.locator('#rsub button[data-t="chart"]').click(); await page.waitForTimeout(300);
    ok((await page.locator('#rbody svg').innerHTML()).includes('閃緑岩'), '火成岩の分類表');
    await page.locator('#rsub button[data-t="quiz"]').click(); await page.waitForTimeout(300);
    await page.locator('.lq-opts .opt').first().click(); await page.waitForTimeout(300);
    ok(await page.locator('.lq-verdict').count() === 1 && await page.locator('.lq-opts .opt.right').count() === 1, 'クイズ：答えると正解が示される');
    await page.locator('#idmode button[data-t="weather"]').click(); await page.waitForTimeout(400);
    ok(await page.locator('#wfig svg path').count() > 20, '天気図が描かれる');
    await page.locator('#idmode button[data-t="topo"]').click(); await page.waitForTimeout(400);
    const box = await page.locator('#tfig svg').boundingBox();
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5); await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5); await page.waitForTimeout(300);
    ok(await page.locator('#tprof svg').count() === 1, '地形図を2回タップすると断面図');
    await page.locator('#idmode button[data-t="fossil"]').click(); await page.waitForTimeout(300);
    await page.locator('#fsub button[data-t="era"]').click(); await page.waitForTimeout(300);
    ok(await page.locator('.era-col').count() === 3, '化石の時代の表');
    // 地層
    await page.goto(U + '#lab=strata'); await page.waitForTimeout(1000);
    await page.click('#stprev'); await page.waitForTimeout(200);
    ok(await page.locator('#stev li.cur').count() === 1, '地史を1つ戻せる');
    await page.locator('#stmode button[data-t="order"]').click(); await page.waitForTimeout(400);
    const cards = await page.locator('.st-pool .chipbtn').count();
    for (let k = 0; k < cards; k++) await page.locator('.st-pool .chipbtn').first().click();
    await page.click('#stchk'); await page.waitForTimeout(300);
    ok(await page.locator('#stres .lq-verdict').count() === 1, '新旧を当てる：答え合わせ');
    await page.locator('#stmode button[data-t="columns"]').click(); await page.waitForTimeout(400);
    await page.click('#clink'); await page.click('#csec'); await page.waitForTimeout(300);
    ok(await page.locator('.lab-strata .lab-fig svg').count() === 2, '柱状図と断面');
    // 地球現象
    await page.goto(U + '#lab=phenomena/seismic'); await page.waitForTimeout(800);
    await page.click('#scirc'); await page.waitForTimeout(300);
    ok((await page.locator('#sqtab').innerText()).includes('km'), '地震：円をかくと震源距離の表が埋まる');
    for (const k of ['adiabatic', 'hotspot', 'isostasy', 'radiometric']) {
      await page.locator(`#phmode button[data-t="${k}"]`).click(); await page.waitForTimeout(400);
      ok(await page.locator('#phbody svg').count() >= 1, `シミュレーション ${k} が描かれる`);
    }
    await page.locator('#phmode button[data-t="adiabatic"]').click(); await page.waitForTimeout(300);
    ok((await page.locator('#aread').innerText()).includes('フェーン'), '断熱変化：フェーン現象の説明');
    // 天体
    for (const k of ['sphere', 'planets', 'moon', 'kepler', 'hr']) {
      await page.goto(U + '#lab=sky/' + k); await page.waitForTimeout(600);
      ok(await page.locator('#skybody svg').count() >= 1, `天体 ${k} が描かれる`);
    }
    await page.locator('#hfig [data-star="betelgeuse"]').click(); await page.waitForTimeout(200);
    ok((await page.locator('#hdet').innerText()).includes('ベテルギウス'), 'HR図の星をタップすると説明');
    // 用語
    await page.goto(U + '#lab=terms/plate'); await page.waitForTimeout(800);
    ok(await page.locator('#trnet .tr-node').count() >= 3, '用語のつながりが描かれる');
    await page.locator('#trnet .tr-node').first().click(); await page.waitForTimeout(300);
    ok(await page.locator('#trback').count() === 1, 'つながった用語に移れる');
    await page.locator('#trmode button[data-t="path"]').click(); await page.waitForTimeout(300);
    await page.click('#prand'); await page.waitForTimeout(300);
    ok(await page.locator('.tr-path li').count() >= 2, '経路さがし');
    await page.locator('#trmode button[data-t="quiz"]').click(); await page.waitForTimeout(300);
    await page.locator('.lq-opts .opt').first().click(); await page.waitForTimeout(300);
    ok(await page.locator('.lq-verdict').count() === 1, '関係を当てる練習');
    await page.goto(U + '#lab=identify'); await page.waitForTimeout(800);
    await page.locator('#idmode button[data-t="rock"]').click(); await page.waitForTimeout(300);
    await page.locator('.zk-prob').click(); await page.waitForTimeout(1200);
    ok(await page.locator('#conf button').count() === 3, '探究から関連する問題を解ける');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 3. 自己採点を含む問題・法則・設定・定着度
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__gaia.open(['SOL-SHP-010'])"); await page.waitForTimeout(1000);
    await conf(page);
    ok(await page.locator('.field.self').count() === 1, '記述の小問は自己採点');
    const inp = page.locator('#inputs input');
    for (const [i, v] of ['6357', '21'].entries()) await inp.nth(i).fill(v);
    await page.click('#judge'); await page.waitForTimeout(600);
    ok(await page.locator('#self button').count() === 3 && await page.locator('#solbox').count() === 1, '記述の小問があると、解説を見てから自己採点');
    await page.locator('#self button').first().click(); await page.waitForTimeout(400);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '自動採点と自己採点を合わせて完答');
    await page.goto(U + '#concepts'); await page.waitForTimeout(800);
    ok(await page.locator('a.law').count() === 27, '「法則」タブに地学の法則（27件）');
    await page.goto(U + '#law=omori'); await page.waitForTimeout(1000);
    ok(await page.locator('ol.derivation li.open').count() === 1, '法則のページ：導出は1段目だけ開いている');
    await page.click('#dall'); await page.waitForTimeout(200);
    ok(await page.locator('ol.derivation li:not(.open)').count() === 0 && await page.locator('.law-page .katex').count() > 5, 'すべて表示で導出が全部出る');
    await page.goto(U + '#law=superposition'); await page.waitForTimeout(800);
    ok((await page.locator('.law-page').innerText()).includes('この法則の根拠'), '経験から得た法則は根拠を出す');
    await page.goto(U + '#settings'); await page.waitForTimeout(600);
    await page.locator('.segment.theme button:has-text("ダーク")').click();
    ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'ダークモード');
    await page.goto(U + '#lab=sky/hr'); await page.waitForTimeout(1000);
    ok(await page.locator('#hfig circle').count() > 25, 'ダークモードでも探究が出る');
    await page.goto(U + '#map'); await page.waitForTimeout(600);
    ok((await page.locator('#view').innerText()).includes('定着度'), '定着度画面');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 4. 学習記録のある端末：CSV・続きに記録
  {
    const page = await newPage({ state: fixture });
    await page.goto(U + '#settings'); await page.waitForTimeout(1200);
    const dl = page.waitForEvent('download');
    await page.click('#csvall');
    const csv = fs.readFileSync(await (await dl).path(), 'utf8');
    ok(csv.split('\n').filter(l => l.trim()).length === fixture.log.length + 1, `CSV に記録 ${fixture.log.length}件がすべて出る`);
    await page.evaluate("__gaia.open(['SOL-EQK-003'])"); await page.waitForTimeout(1000);
    await conf(page);
    await page.locator('#inputs input').nth(0).fill('80');
    await page.click('#judge'); await page.waitForTimeout(600);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '記録のある端末で解ける');
    const st = await LS(page);
    ok(Object.keys(fixture.pstat).every(k => st.pstat[k]), '前の復習状態がすべて残る');
    ok(st.log.length === fixture.log.length + 1, '学習記録が続きに足される');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 5. 一部の data/ だけ古い
  {
    const page = await newPage({ route: (p) => p.route('**/data/f-SOL-01.json', async (r) => {
      const res = await r.fetch(); const d = await res.json(); d._meta = { dataVersion: 'old000000000' };
      await r.fulfill({ response: res, body: JSON.stringify(d) });
    }) });
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__gaia.open(['SOL-SHP-003'])"); await page.waitForTimeout(800);
    const b = page.locator('.banner');
    ok(await b.count() === 1 && (await b.innerText()).includes('data/f-SOL-01.json'), '古い本文ファイルを読むと警告が出る');
    ok(await page.locator('#inputs input').count() > 0, '警告が出ても問題は解ける');
  }
  // 6. 検索・問題セット・共有リンク
  {
    const page = await newPage({ state: fixture });
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    ok(await page.locator('#sets .set-card').count() === 3, '今日の画面に問題セット3つ');
    await page.fill('#sq', 'フェーン'); await page.press('#sq', 'Enter'); await page.waitForTimeout(1200);
    ok(await page.locator('.res-row').count() >= 2, '検索できる');
    await page.goto(U + '#set=col-strata-start'); await page.waitForTimeout(1500);
    ok(page.url().endsWith('#today') && await page.locator('#conf button').count() === 3, '#set= のリンクで問題セットが始まる');
    await page.goto(U + '#ids=GEO-STR-003'); await page.waitForTimeout(1500);
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes('地層と地質構造')), '#ids= のリンクで指定の問題が出る');
    await page.goto(U + '#today'); await page.waitForTimeout(800);
    ok(await page.locator('#conf button').count() === 3 || await page.locator('.hero').count() === 1, '今日の画面へ戻れる');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 7'. Service Worker：自分のキャッシュだけを管理し、同じドメインの他のアプリのキャッシュは消さない。オフラインでも問題・探究が使える
  {
    const page = await newPage({ sw: true });
    await page.goto(U + '#today');
    await page.evaluate(async () => { await (await caches.open('lemma-v0.9.0')).put('/x', new Response('lemma')); await (await caches.open('celestia-v0.5.0')).put('/y', new Response('c')); });
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    await page.reload(); await page.waitForTimeout(1200);
    await page.evaluate("__gaia.open(['SOL-EQK-003'])"); await page.waitForTimeout(1500);
    await page.goto(U + '#lab=identify'); await page.waitForTimeout(1500);
    const v = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8')).dataVersion;
    const keys = await page.evaluate(async () => caches.keys());
    ok(keys.includes('gaia-data-' + v) && keys.includes('gaia-v0.1.0'), `コード用とデータ用のキャッシュ ${keys}`);
    ok(keys.includes('lemma-v0.9.0') && keys.includes('celestia-v0.5.0'), '同じドメインの他のアプリのキャッシュを消さない');
    await page.context().setOffline(true);
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__gaia.open(['SOL-EQK-003'])"); await page.waitForTimeout(1500);
    ok(await page.locator('#inputs input').count() === 1, 'オフラインでも開いた問題が解ける');
    await page.goto(U + '#lab=identify'); await page.waitForTimeout(1500);
    ok(await page.locator('.spec svg').count() >= 17, 'オフラインでも探究（岩石の図鑑）が使える');
    await page.context().setOffline(false);
    fakeDataVersion = 'e2enewversion';
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    await page.evaluate(async () => fetch('data/index.json', { cache: 'no-cache' }));
    await page.waitForTimeout(500);
    const keys2 = await page.evaluate(async () => caches.keys());
    ok(keys2.includes('gaia-data-e2enewversion') && !keys2.includes('gaia-data-' + v) && keys2.includes('lemma-v0.9.0'), `データの版が変わると自分の古いデータ用キャッシュだけを消す ${keys2}`);
    fakeDataVersion = null;
  }
  // 7. アカウントと同期：2台の端末でログインすると記録が合わさる（にせ Supabase）
  {
    const login = async (page) => {
      await page.goto(U + '#settings'); await page.waitForTimeout(1500);
      await page.fill('#acct-email', 'me@example.com'); await page.click('#acct-send'); await page.waitForTimeout(500);
      await page.fill('#acct-code', '123456'); await page.click('#acct-verify'); await page.waitForTimeout(1500);
    };
    const A = await newPage({ state: { ...fixture, log: fixture.log.slice(0, 25) } });
    await login(A);
    ok((await A.locator('#acct').innerText()).includes('Lemma と共通'), 'アカウントが Lemma と共通であることを表示');
    const B = await newPage({ state: { ...fixture, log: fixture.log.slice(20) } });
    await login(B);
    const nB = (await LS(B)).log.length;
    ok(nB === fixture.log.length, `端末B：両方の端末の記録が合わさる（${nB}件）`);
    ok(await B.evaluate(() => !!localStorage.getItem('gaia.auth') && !localStorage.getItem('lemma.auth')), 'ログイン情報は gaia.auth に保存（Lemma と別）');
    ok([...mock.rows.values()][0] && mock.rows.size === 1, 'サーバーの表 gaia_state に1行');
    const real = (es) => es.filter(e => !/status of 403/.test(e));
    ok(real(A.errors).length === 0 && real(B.errors).length === 0, `ページのエラーなし ${A.errors} ${B.errors}`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`e2e: ${pass} 件 OK${fail ? `、${fail} 件失敗` : ''}`);
process.exitCode = fail ? 1 : 0;
