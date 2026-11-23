// GAIA の検査をまとめて実行する（GitHub Actions でも同じものを実行）
//   node tests/run.mjs          データと単体テスト
//   node tests/run.mjs --e2e    ブラウザでの通し操作も（Playwright が必要）
// どれか1つでも失敗したら終了コード 1。
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = process.env.PYTHON || 'python3';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-'));

const steps = [
  ['正規データの Schema（問題・概念・法則・誤概念・問題セット）', py, ['tools/check_schema.py']],
  ['正規データの整合（ID の台帳・図の参照と漏れ・SVG の安全性・探究のデータ・参照・単位）', py, ['tools/validate_content.py']],
  ['問題の図（作図仕様から作った SVG）が作り直したものと同じ', 'node', ['tools/geofig.mjs', '--check']],
  ['探究のモデル（地層・地図・天体）の単体テスト', 'node', ['tests/lab.test.mjs']],
  ['content/ から data/ を作り直すと同じになる', py, ['-c', `
import filecmp, sys
from pathlib import Path
sys.path.insert(0, 'tools')
import build_data as BD
t = Path(${JSON.stringify(path.join(tmp, 'data'))})
BD.build('content', t)
def files(d):
    return sorted(str(p.relative_to(d)) for p in Path(d).rglob('*') if p.is_file())
a, b = files('data'), files(t)
ok = a == b
if not ok:
    print('ファイルの違い：', sorted(set(a) ^ set(b))[:10])
for f in a:
    if f in b and not filecmp.cmp(Path('data') / f, t / f, shallow=False):
        print('中身が違う：', f); ok = False
if not ok:
    print('→ python3 tools/build_data.py を実行して data/ を作り直してください')
sys.exit(0 if ok else 1)`]],
  ['入力用の答え（読める・正解を入れると正解になる）', 'node', ['tools/check_answers.mjs', 'data']],
  ['すべての数式を KaTeX で描画できる', 'node', ['tools/check_katex.cjs']],
  ['自動採点の回帰テスト', 'node', ['tests/answer.test.mjs']],
  ['catalog.js の単体テスト（共通ビュー・図・概念・探究・出題形式・検索・問題セット）', 'node', ['tests/catalog.test.mjs']],
  ['選択式の選択肢（content/choices.json）が作り直したものと同じ', 'node', ['tools/make_choices.mjs', '--check']],
  ['学習記録の保存・点検・バックアップ・移行（store.js）', 'node', ['tests/store.test.mjs']],
  ['学習記録の保全の境界条件（容量不足・複数タブ・新しい版の記録・壊れたファイル）', 'node', ['tests/store_edge.test.mjs']],
  ['同期の単体テスト（記録の合わせ方・にせ Supabase との通信・失敗の分類）', 'node', ['tests/sync.test.mjs']],
  ['概念の習熟（mastery.js）：実力を過大評価しない', 'node', ['tests/mastery.test.mjs']],
  ['今日の演習の推薦（架空の学習者8人・境界条件）', 'node', ['tests/recommend.test.mjs']],
  ['すべての JS モジュールを読み込める（構文エラーがない）', 'node', ['tests/syntax.test.mjs']],
];
// サーバー側の保全（supabase/guard.sql）：PGlite（@electric-sql/pglite）があるときだけ
//   npm install --no-save --no-package-lock @electric-sql/pglite（CI では入れる）
let hasPg = false;
try { (await import('module')).createRequire(import.meta.url).resolve('@electric-sql/pglite'); hasPg = true; } catch { /* なし */ }
if (hasPg) steps.push(['サーバー側の保全（guard.sql をトリガーつきの表で）', 'node', ['tests/server_guard.test.mjs']]);
else console.log('（@electric-sql/pglite が無いので、guard.sql の検査は飛ばします）');
if (process.argv.includes('--e2e')) steps.push(['ブラウザでの通し操作', 'node', ['tests/e2e.mjs']], ['配信用 dist を CSP つきで配信して動く・配信してはいけないものが無い', 'node', ['tests/e2e_dist.mjs']]);

let failed = 0;
for (const [name, cmd, args] of steps) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  const ok = r.status === 0;
  const out = ((r.stdout || '') + (r.stderr || '')).split('\n')
    .filter(l => l.trim() && !/No character metrics|UserWarning|warn\(msg\)/.test(l));
  console.log(`${ok ? '✓' : '✗'} ${name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
  if (!ok) {
    failed++;
    console.log(out.slice(-25).map(l => '    ' + l).join('\n') || `    ${r.error || '終了コード ' + r.status}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} 件失敗しました` : '\nすべて通りました');
process.exitCode = failed ? 1 : 0;
