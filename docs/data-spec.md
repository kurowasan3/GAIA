# GAIA データ仕様（v0.1）

正規データ `content/`（マスター）→ `tools/build_data.py` → アプリ用データ `data/`。アプリが読むのは `data/` だけ。
JSON Schema は `tools/schema/`、Schema で見られない関係の検査は `tools/validate_content.py`。

## ID の規則

| ID | 形 | 規則 |
| --- | --- | --- |
| 問題ID | `GEO-STR-003` | `<分野3字>-<単元略号3字>-<番号>`。一度使ったら変えない・再利用しない |
| 分野ID | `SOL` `GEO` `ATM` `AST` | 固体地球・地層と岩石と地球の歴史・大気と海洋・宇宙 |
| 単元ID | `GEO-02` | `taxonomy.json` で固定。使わなくなったら `retired` に残し、再利用しない |
| 概念ID・法則ID | `seismic-waves` `omori` | 英小文字とハイフン |
| 誤概念ID | `MC-CORE-SOLID` | `MC-` で始まる英大文字 |
| 図ID | `q-sec` `a-fig` | 問題の中で一意。英小文字とハイフン |

## 問題（`content/problems/<分野>/<問題ID>/problem.json`、`gaia.problem/1`）

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `id` `schema` `field` `unit` | ○ | 問題ID、`"gaia.problem/1"`、分野ID、単元ID |
| `topic` `course` `minutes` | | テーマ、`地学基礎`／`地学`、想定時間（分） |
| `level` | ○ | 0=基礎 1=標準 2=入試基礎 3=国公立2次 4=難関 5=最難関 |
| `format` | ○ | 出題形式：`qa` 一問一答・`choice` 正誤・選択・`figure` 図の読み取り・`order` 順序・新旧・`term` 用語の関係・`calc` 計算・`written` 記述（複数可）。ホームの「形式ごとに演習」はこれで選ぶ |
| `examStyle` | | `common-test` `national-2nd` `private` `original` |
| `statement.blocks` | ○ | 本文（下の「ブロック」） |
| `figures` | ○ | 図の一覧（下の「図」）。無ければ `[]` |
| `answer.parts` | ○ | 小問ごとの答え `{id, tex, grading?, wrong?}`。小問が無い問題は `id: "main"` 1つ |
| `solutions` | ○ | `{id: "main"|"alt1"|"note", kind, blocks}`。別解・補足を足せる |
| `idea` | | 核となる考え方 `{tex}` |
| `lab` | | 解いたあとに開く探究のページ `{page, key?, label?}`。page と key：`identify`（`rock:granite` `fossil:ammonite` `weather:winter` `topo:fan`）、`strata`（地史の型 `fault-unconf` など、`columns`）、`phenomena`（`seismic` `adiabatic` `hotspot` `isostasy` `radiometric`）、`sky`（`sphere` `planets` `moon` `kepler` `hr`）、`terms`（用語ID）、`laws`（法則ID） |
| `choices` | | 選択問題の選択肢。誤答の選択肢に `misconception` を付けると、選んだときに誤概念として記録できる（Phase 5） |
| `concepts` `laws` `misconceptions` | ○ | 概念・法則・誤概念の ID（無ければ `[]`） |
| `tags` `provenance` `quality` | ○ | `quality.status` は `draft`／`review`／`published`／`hidden`。アプリに出るのは `published` だけ |

### ブロック

```json
{"type": "text", "tex": "文章（LaTeX。$...$ が数式）"}
{"type": "figure", "ref": "図ID", "placement": "block | float-right | side-by-side"}
{"type": "parts", "items": [{"id": "1", "tex": "…", "figures": ["図ID"]}]}
```

並びがそのまま表示順。図の位置も、ブロックの位置で決まる（`order` を手で管理しない）。

### 入力用の答え（`answer.parts[].grading`）

1行に1小問（`(1) …`）、小問の中の複数の欄は ` ; ` で区切り、`ラベル：` で欄の名前を付ける（Lemma・CELESTIA と同じ）。足した書き方：

| 書き方 | 入力 | 採点 |
| --- | --- | --- |
| `語{モホロビチッチ不連続面\|モホ面}` | 文字 | `\|` で区切ったどれかと一致。全角半角・ひらがなカタカナ・空白・`^ { } _`・中黒・下付き上付き文字の違いは無視。大文字小文字は区別（Co と CO） |
| `選ぶ{正断層\|逆断層\|横ずれ断層}=1` | ボタンで1つ選ぶ | `=` の後は何番目か |
| `すべて選ぶ{A\|B\|C\|D}=1,3` | ボタンで複数選ぶ | 過不足なく選んだときだけ正解 |
| `並べる{マントル\|内核\|地殻\|外核}=3>1>4>2` | タップした順に並ぶ | `=` の後に正しい順の番号を `>` でつなぐ |
| `約{8.4\|2} [km/s]` | 数値（`1.2e-3`・`1.2×10^-3` も可） | `\|` の後の有効数字の桁で、最後の桁の ±0.55 まで正解（省略すると2桁） |
| `2` | 数（係数など） | 整数だけの答えは小さな欄・数字キーボードになる |
| `記述` | なし | 自己採点 |

選択肢・並べかえの札には `$…$` の数式を書ける（`$\ce{SiO2}$` のような化学式も可）。

### 単位

入力用の答えの `[ ]` に書ける単位は `tools/validate_content.py` の `UNITS`（km・m・s・℃・°・hPa・年・億年・cm/年・天文単位・光年・パーセク・W/m^2・μm など）。足すときはそこに書く。

## 図

```json
{"id": "q-sec", "role": "question", "kind": "section", "format": "svg", "src": "q-sec.svg",
 "alt": "A〜E層が断層 f でずれ、その上を不整合面をはさんで F〜H層がおおっている地質断面図", "caption": "…"}
```

| 項目 | 内容 |
| --- | --- |
| `role` | `question`（問題用）／`answer`（解答用）／`both`。**解答用の図は問題文から参照できない**（検査でエラー）。アプリは答え合わせまで表示もファイルの読み込みもしない |
| `kind` | `diagram` `section`（断面図・柱状図） `map`（天気図・地形図） `specimen`（岩石・化石） `graph` `chart` `table` `scheme` `photo` |
| `format` | `svg`（標準）、`png`／`webp`（写真） |
| `src` | 問題フォルダ内のファイル名。Base64 の埋め込みは不可 |
| `alt` | 代替テキスト（必須。図が見えない人が問題を解けるように） |

### 作図仕様から作る図

図のファイル `<図ID>.svg` の横に `<図ID>.fig.json` を置くと、`node tools/geofig.mjs` が探究と同じモデルから SVG を作る（検査で作り直しと一致するか確かめる）。

| `gen` | 中身 | 例 |
| --- | --- | --- |
| `strata` | 地質断面図（地史の型と乱数） | `{"gen":"strata","template":"fault-unconf","seed":3}`（`upto` で途中まで、`labels:false`） |
| `columns` | 3地点の柱状図 | `{"gen":"columns","seed":3,"link":false}` |
| `weather` | 天気図 | `{"gen":"weather","key":"winter"}` |
| `topo` | 地形図（等高線） | `{"gen":"topo","key":"fan"}` |
| `rock` / `fossil` | 岩石の組織・化石 | `{"gen":"rock","id":"granite","seed":2}` |
| `traveltime` | 走時曲線 | `{"gen":"traveltime","vp":6,"vs":3.5,"maxD":300,"marks":[{"d":120,"label":"X"}]}` |
| `hr` | HR図 | `{"gen":"hr","ids":["sun"],"label":{"sun":"A"},"regions":false}` |

### 手描き・AI 生成の SVG の決まり

- `viewBox` を付ける。`script`・`foreignObject`・`on*` 属性・外部参照・埋め込み画像は使わない（検査でエラー）
- 色は `currentColor`（明暗の設定に合わせて変わる）。色を直接指定した図はダークモードでも白い紙の上に出る

## 概念・法則・誤概念

| ファイル | 1件の形 |
| --- | --- |
| `concepts.json` | `{id, name, field, requires: [前提の概念], laws: [法則]}`（前提関係の循環は検査でエラー） |
| `laws.json` | `{id, name, tex, conditions, concepts, origin, basis?, derivation?}`。`origin` は `fundamental`／`empirical`／`derived`／`definition`。`derived` は `derivation`（1段ずつ）が必須、`fundamental`・`empirical` は `basis` が必須 |
| `misconceptions.json` | `{id, wrong, right, concepts, remedy: [補強問題の ID]}` |

## 探究のデータ（`content/geo/`）

| ファイル | 中身 |
| --- | --- |
| `identify.json` | `rocks[{id, name, group, sub, texture, ground, minerals{鉱物: 割合}, grain, n, sio2?, color?, desc, points}]`（texture：`porphyritic` 斑状・`equigranular` 等粒状・`clastic` 砕屑・`bio` 生物岩・`pyroclastic`・`foliated` 片理・`banded` 片麻状・`hornfels`・`granoblastic`）、`minerals[{id: O X H B P K Q, name, kind, color, shape, sio2, note}]`、`fossils[{id, name, kind, era, period, env?, desc}]`、`weather`・`topo`（js/lab/model/maps.js の WEATHER・TOPO のキー） |
| `sky.json` | `stars[{id, name, T, L, sp, cls, M, ly}]`（L は太陽 = 1）、`planets[{id, name, a, P, e, R, M, rho, type}]`、`objects[{id, name, dec}]` |
| `terms.json` | `terms[{id, name, unit, def}]`、`links[{a, b, rel, note}]`（rel：`cause` 原因→結果・`form` A から B ができる・`evidence` A は B の証拠＝この3つは向きがある／`contrast` 対比・`same` 同じ・`part` 部分・`example` 例・`measure` 測る・`related` 関係） |

## アプリ用データ（`data/`、`gaia.data/1`）

| ファイル | 中身 |
| --- | --- |
| `index.json` | `format` `dataVersion` `levels` `subjects`（分野の並び）`fields`（単元）`problems`（一覧：`id f lv t th tg fm c m zk in ok`。`zk` は探究へのリンク `page/key`） |
| `f-<単元ID>.json` | 本文：`q a s k`（HTML）、`figs`（図の情報）、`in`（入力用の答え）、`zk` `choices` `laws` `alt`（別解） |
| `knowledge.json` | 概念・法則・誤概念 |
| `lab.json` | 探究のデータ（content/geo/ をまとめたもの）と単元の一覧 `units` |
| `search.json` `collections.json` | 検索の索引（概念名・法則名も入る）、問題セット |
| `assets/<問題ID>/` | 図のファイル。名前に中身のハッシュ（`q-setup-35755270.svg`）が付くので、図を直すとキャッシュも入れ替わる |

本文の HTML では、図は `<figure class="pfig" data-fig="図ID"></figure>` の空の枠で、`js/problem/figures.js` が中身を入れる。

## 版は3つを分ける（Lemma と同じ）

| 版 | 場所 | いつ上げるか |
| --- | --- | --- |
| コードの版 | 各 JS の `FILE_VERSION`、CSS の `--gaia-version`、`sw.js` の `VERSION` | アプリを更新したとき（食い違うと赤い警告） |
| データ形式の版 | `index.json` の `format` | `data/` の項目の意味を変えたとき |
| 学習記録の版 | localStorage `gaia.v1` の `schema`（今は 1） | 学習記録の形を変えたとき |
