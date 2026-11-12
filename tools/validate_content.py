#!/usr/bin/env python3
"""正規データ（content/）の整合検査。JSON Schema では見られない「ファイルどうし・データどうし」の関係を調べる。

    python3 tools/validate_content.py                 いつもの検査（CI でも実行）
    python3 tools/validate_content.py --write-golden  問題ID の台帳 tests/golden/ids.txt を今のデータで作り直す

調べること
  ID      問題ID の重複、フォルダ名・分野フォルダとの一致、台帳（tests/golden/ids.txt）にある ID が消えていないか
  分類    unit が field の下にあるか（taxonomy.json）
  図      ID の重複、参照先ファイルの有無、参照されない図・フォルダ内の孤立ファイル、
          問題文が解答用の図を参照していないか（解答図の漏れ）、解答用の図が解説から参照されているか
  SVG     XML として読めるか、viewBox、script・foreignObject・on* 属性・外部 URL・埋め込み画像（base64）が無いか、大きさ
  探究    探究のデータ（content/geo/）の ID の重複・用語のつながりの参照、問題から探究へのリンク（lab）
  参照    concepts / laws / misconceptions / remedy / 探究へのリンク（lab）
  小問    問題文の小問 ID と答えの小問 ID の一致
  単位    入力用の答えに書いた単位 [ ] が単位表にあるか
エラーが1件でもあれば終了コード 1。警告は表示するだけ。
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_lib import CONTENT, ROOT, figure_refs, load_geo, load_knowledge, load_problems, part_ids  # noqa: E402

GOLDEN = ROOT / 'tests' / 'golden' / 'ids.txt'
SVGNS = '{http://www.w3.org/2000/svg}'
MAX_SVG = 200_000
MAX_IMG = 600_000

# 高校地学で使う単位（入力用の答えの [ ] に書けるもの）
UNITS = set('''km m mm cm km/s m/s s 秒 分 時間 日 年 万年 億年 百万年 cm/年 ℃ °C ° K hPa Pa % ％ ‰ 倍 等 等級 天文単位 光年 パーセク pc
g/cm^3 kg/m^3 W/m^2 kW/m^2 J g/kg g/m^3 km/h km^2 個 回 本 度 時 方向 nT μm m^3 L kg W'''.split())


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f'{where}: {msg}')

    def warn(self, where, msg):
        self.warnings.append(f'{where}: {msg}')


# ---------------------------------------------------------------- SVG
def tag(el):
    return el.tag.replace(SVGNS, '')


def check_svg_file(path, R, where):
    data = path.read_bytes()
    if len(data) > MAX_SVG:
        R.err(where, f'{path.name} が大きすぎます（{len(data)} バイト、上限 {MAX_SVG}）')
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        R.err(where, f'{path.name} を XML として読めません：{e}')
        return None
    if tag(root) != 'svg':
        R.err(where, f'{path.name} の最上位が <svg> ではありません')
    if not root.get('viewBox'):
        R.err(where, f'{path.name} に viewBox がありません（拡大縮小できない）')
    for el in root.iter():
        t = tag(el)
        if t in ('script', 'foreignObject', 'iframe', 'object', 'embed'):
            R.err(where, f'{path.name} に <{t}> があります（使えません）')
        for k, v in el.attrib.items():
            name = k.split('}')[-1]
            if name.lower().startswith('on'):
                R.err(where, f'{path.name} にイベント属性 {name} があります')
            if name == 'href' and not v.startswith('#'):
                R.err(where, f'{path.name} が外部を参照しています（{v[:40]}）')
            if 'base64' in v:
                R.err(where, f'{path.name} に埋め込み画像（base64）があります。画像は別ファイルにしてください')
    return root


# ---------------------------------------------------------------- 問題
def check_problem(d, p, K, R, ids_seen):
    pid = p['id']
    where = f'{pid}'
    if pid in ids_seen:
        R.err(where, f'問題ID が重複しています（{ids_seen[pid]} と {d}）')
    ids_seen[pid] = d
    if d.name != pid:
        R.err(where, f'フォルダ名 {d.name} が問題ID と違います')
    if d.parent.name != p['field']:
        R.err(where, f'分野フォルダ {d.parent.name} と field {p["field"]} が違います（分野を移すときはフォルダも移す。ID は変えない）')
    units = {u['key']: u for u in K['taxonomy']['units']}
    if p['unit'] not in units:
        R.err(where, f'単元 {p["unit"]} が taxonomy.json にありません')
    elif units[p['unit']]['field'] != p['field']:
        R.err(where, f'単元 {p["unit"]} は分野 {units[p["unit"]]["field"]} のものです（field は {p["field"]}）')

    # 図
    figs = {}
    for fg in p['figures']:
        if fg['id'] in figs:
            R.err(where, f'図ID {fg["id"]} が重複しています')
        figs[fg['id']] = fg
    q_refs = figure_refs(p['statement']['blocks'])
    s_refs = [r for s in p['solutions'] for r in figure_refs(s['blocks'])]
    for r in q_refs + s_refs:
        if r not in figs:
            R.err(where, f'図 {r} を参照していますが、figures にありません')
    for r in q_refs:
        if r in figs and figs[r]['role'] == 'answer':
            R.err(where, f'問題文が解答用の図 {r} を参照しています（答え合わせ前に見えてしまう）')
    for fid, fg in figs.items():
        if fid not in q_refs and fid not in s_refs:
            R.err(where, f'図 {fid} がどこからも参照されていません')
        if fg['role'] == 'question' and fid not in q_refs:
            R.warn(where, f'問題用の図 {fid} が問題文で使われていません')
        if fg['role'] == 'answer' and fid not in s_refs:
            R.err(where, f'解答用の図 {fid} が解説で使われていません')
    used_files = {'problem.json'}
    for fg in p['figures']:
        if fg.get('src'):
            f = d / fg['src']
            used_files.add(fg['src'])
            if not f.exists():
                R.err(where, f'図 {fg["id"]} のファイル {fg["src"]} がありません')
                continue
            if f.suffix == '.svg':
                spec = f.with_name(f.name.replace('.svg', '.fig.json'))
                if spec.exists():
                    used_files.add(spec.name)
                check_svg_file(f, R, where)
            elif f.stat().st_size > MAX_IMG:
                R.err(where, f'{fg["src"]} が大きすぎます（{f.stat().st_size} バイト。長辺 1600px 以下の WebP に）')
    for f in d.iterdir():
        if f.is_file() and f.name not in used_files:
            R.err(where, f'フォルダに使われていないファイル {f.name} があります')

    # 小問
    q_parts = part_ids(p['statement']['blocks'])
    a_parts = [x['id'] for x in p['answer']['parts']]
    if q_parts and q_parts != a_parts:
        R.err(where, f'問題文の小問 {q_parts} と答えの小問 {a_parts} が対応していません')
    if not q_parts and a_parts != ['main']:
        R.err(where, f'小問の無い問題の答えは id "main" 1つにしてください（今は {a_parts}）')

    # 参照
    concepts = {c['id'] for c in K['concepts']}
    laws = {x['id'] for x in K['laws']}
    mcs = {m['id'] for m in K['misconceptions']}
    for c in p['concepts']:
        if c not in concepts:
            R.err(where, f'概念 {c} が concepts.json にありません')
    for x in p['laws']:
        if x not in laws:
            R.err(where, f'法則 {x} が laws.json にありません')
    mc_refs = list(p['misconceptions'])
    mc_refs += [c['misconception'] for c in (p.get('choices') or []) if c.get('misconception')]
    mc_refs += [c['misconception'] for c in (p.get('predict') or {}).get('choices', []) if c.get('misconception')]
    mc_refs += [w['misconception'] for x in p['answer']['parts'] for w in x.get('wrong', [])]
    for m in mc_refs:
        if m not in mcs:
            R.err(where, f'誤概念 {m} が misconceptions.json にありません')
    if not p['concepts']:
        R.warn(where, 'concepts が空です')

    # 探究へのリンク
    if p.get('lab'):
        check_lab_ref(p['lab'], R, where, lab_keys(load_geo(), K))

    # 単位
    for x in p['answer']['parts']:
        for u in re.findall(r'\[([^\[\]]+)\]\s*$', x.get('grading', '')):
            if u.strip() not in UNITS:
                R.err(where, f'({x["id"]}) の単位 [{u}] が単位表にありません（tools/validate_content.py の UNITS）')

    # 公開状態
    q = p['quality']
    if q['status'] == 'published' and any(f.get('format') in ('png', 'webp') for f in p['figures']) and not q['checks'].get('human'):
        R.warn(where, '写真・画像の図は人の確認（checks.human）を付けてから公開してください')


def problem_texts(p):
    """問題の中の文章（LaTeX）を [(場所, 文章)] で"""
    out = []
    def blocks(bs, where):
        for b in bs:
            if b['type'] == 'text':
                out.append((where, b['tex']))
            elif b['type'] == 'parts':
                for it in b['items']:
                    out.append((f'{where}({it["id"]})', it['tex']))
    blocks(p['statement']['blocks'], '問題文')
    for s in p['solutions']:
        blocks(s['blocks'], '解説')
    for x in p['answer']['parts']:
        out.append((f'答え({x["id"]})', x['tex']))
    for c in p.get('choices') or []:
        out.append(('選択肢', c['tex']))
    return out


LAB_PAGES = ('identify', 'strata', 'phenomena', 'sky', 'terms', 'laws')
# js/lab/model/strata.js の TEMPLATES と同じ（tests/catalog.test.mjs で照合）
STRATA_KEYS = ('fault-unconf', 'tilt-unconf-dike', 'dike-fault', 'fold-unconf-fault', 'pluton', 'fault-dike', 'two-unconf', 'columns')
PHEN_KEYS = ('seismic', 'adiabatic', 'hotspot', 'isostasy', 'radiometric')
SKY_KEYS = ('sphere', 'planets', 'moon', 'kepler', 'hr')


def lab_keys(G, K):
    I = G['identify']
    ident = {f'rock:{x["id"]}' for x in I['rocks']} | {f'fossil:{x["id"]}' for x in I['fossils']} \
        | {f'weather:{x}' for x in I['weather']} | {f'topo:{x}' for x in I['topo']} | {'rock', 'fossil', 'weather', 'topo'}
    return {'identify': ident, 'strata': set(STRATA_KEYS), 'phenomena': set(PHEN_KEYS), 'sky': set(SKY_KEYS),
            'terms': {t['id'] for t in G['terms']['terms']}, 'laws': {x['id'] for x in K['laws']}}


def check_lab_ref(z, R, where, keys):
    page, key = z.get('page'), z.get('key')
    if page not in LAB_PAGES:
        R.err(where, f'探究のページ {page} がありません（{"・".join(LAB_PAGES)}）')
        return
    if key and key not in keys[page]:
        R.err(where, f'探究 {page} に {key} がありません')


def check_geo_data(R):
    """探究のデータ（content/geo/）：ID の重複・用語のつながり・単元"""
    G = load_geo()
    I = G['identify']
    for name in ('rocks', 'minerals', 'fossils'):
        ids = [x['id'] for x in I[name]]
        for d in {x for x in ids if ids.count(x) > 1}:
            R.err('geo/identify.json', f'{name} の ID {d} が重複しています')
    minerals = {m['id'] for m in I['minerals']} | {'C'}
    for r in I['rocks']:
        for k in list(r.get('minerals', {})) + list(r.get('groundMinerals', {})):
            if k not in minerals:
                R.err('geo/identify.json', f'{r["id"]} の鉱物 {k} がありません')
    T = G['terms']
    ids = [t['id'] for t in T['terms']]
    for d in {x for x in ids if ids.count(x) > 1}:
        R.err('geo/terms.json', f'用語 {d} が重複しています')
    units = {u['key'] for u in load_knowledge()['taxonomy']['units']}
    for t in T['terms']:
        if t['unit'] not in units:
            R.err('geo/terms.json', f'{t["id"]} の単元 {t["unit"]} がありません')
    for l in T['links']:
        for k in ('a', 'b'):
            if l[k] not in ids:
                R.err('geo/terms.json', f'つながり {l["a"]}–{l["b"]} の {l[k]} がありません')
        if l['rel'] not in T['relations']:
            R.err('geo/terms.json', f'つながり {l["a"]}–{l["b"]} の関係 {l["rel"]} がありません')
    lone = [t['id'] for t in T['terms'] if not any(l['a'] == t['id'] or l['b'] == t['id'] for l in T['links'])]
    for x in lone:
        R.warn('geo/terms.json', f'用語 {x} がどの用語ともつながっていません')
    S = G['sky']
    for name in ('stars', 'planets', 'objects'):
        ids = [x['id'] for x in S[name]]
        for d in {x for x in ids if ids.count(x) > 1}:
            R.err('geo/sky.json', f'{name} の ID {d} が重複しています')


# ---------------------------------------------------------------- 知識（概念・法則・誤概念）
def check_knowledge(K, problem_ids, R):
    for name, items in (('concepts', K['concepts']), ('laws', K['laws']), ('misconceptions', K['misconceptions'])):
        seen = set()
        for it in items:
            if it['id'] in seen:
                R.err(f'{name}.json', f'ID {it["id"]} が重複しています')
            seen.add(it['id'])
    concepts = {c['id']: c for c in K['concepts']}
    laws = {x['id'] for x in K['laws']}
    fields = {f['key'] for f in K['taxonomy']['fields']}
    for c in K['concepts']:
        if c['field'] not in fields:
            R.err('concepts.json', f'{c["id"]} の分野 {c["field"]} がありません')
        for r in c['requires']:
            if r not in concepts:
                R.err('concepts.json', f'{c["id"]} の前提 {r} がありません')
        for x in c['laws']:
            if x not in laws:
                R.err('concepts.json', f'{c["id"]} の法則 {x} が laws.json にありません')
    # 前提関係に循環が無いか
    state = {}

    def visit(cid, path):
        if state.get(cid) == 1:
            R.err('concepts.json', f'前提関係が循環しています：{" → ".join(path + [cid])}')
            return
        if state.get(cid) == 2 or cid not in concepts:
            return
        state[cid] = 1
        for r in concepts[cid]['requires']:
            visit(r, path + [cid])
        state[cid] = 2
    for cid in concepts:
        visit(cid, [])
    for x in K['laws']:
        for c in x['concepts']:
            if c not in concepts:
                R.err('laws.json', f'{x["id"]} の概念 {c} が concepts.json にありません')
    for m in K['misconceptions']:
        for c in m['concepts']:
            if c not in concepts:
                R.err('misconceptions.json', f'{m["id"]} の概念 {c} がありません')
        for pid in m['remedy']:
            if pid not in problem_ids:
                R.err('misconceptions.json', f'{m["id"]} の補強問題 {pid} がありません')

def main():
    R = Report()
    K = load_knowledge()
    probs = load_problems()
    ids_seen = {}
    for d, p in probs:
        check_problem(d, p, K, R, ids_seen)
    check_knowledge(K, set(ids_seen), R)
    check_geo_data(R)
    ids = sorted(ids_seen)
    if '--write-golden' in sys.argv:
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        old = set(GOLDEN.read_text(encoding='utf-8').split()) if GOLDEN.exists() else set()
        GOLDEN.write_text('\n'.join(sorted(old | set(ids))) + '\n', encoding='utf-8')
        print(f'台帳 tests/golden/ids.txt を更新しました（{len(old | set(ids))}件）')
    elif GOLDEN.exists():
        lost = sorted(set(GOLDEN.read_text(encoding='utf-8').split()) - set(ids))
        for x in lost:
            R.err('台帳', f'問題ID {x} が消えています（ID は消さない。出さないときは quality.status を hidden に）')
    nfig = sum(len(p['figures']) for _, p in probs)
    print(f'問題 {len(probs)}問・図 {nfig}枚・概念 {len(K["concepts"])}・法則 {len(K["laws"])}・誤概念 {len(K["misconceptions"])}・'
          f'探究のデータ を検査：エラー {len(R.errors)}件、警告 {len(R.warnings)}件')
    for e in R.errors[:60]:
        print('  ✗', e)
    for w in R.warnings[:30]:
        print('  ・', w)
    sys.exit(1 if R.errors else 0)


if __name__ == '__main__':
    main()
