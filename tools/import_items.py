#!/usr/bin/env python3
"""問題管理表の形式（1問1フォルダの item.json ＋ problem.svg / solution.svg）を content/ に取り込む

    python3 tools/import_items.py <content フォルダ> [--sheet GAIA問題管理表.xlsx] [--verify <verify フォルダ>]

  ・<content フォルダ>/<ID>/item.json を読み、content/problems/<分野>/<ID>/problem.json を書く。
    問題ID は item.json の id をそのまま使う（変えない）。同じ ID がすでにあれば上書きする。
  ・単元は item.json の field（単元名）で taxonomy.json から引く（表記ゆれは ALIASES で吸収）。
  ・難易度 1〜5 → level：1=基礎(0)、2=標準(1)、3=国公立2次(3)、4=難関(4)、5=最難関(5)。
  ・問題文の enumerate を小問に、答え "(1) … (2) …" を小問ごとの答えに分ける（入力採点はしない：自己採点）。
  ・参考元（source・src_no）はアプリに出さないので取り込まない。
  ・管理表があれば、作成日・作成方法・検証3項目（二重解答／SymPy等／人間確認）を quality と provenance に写す。
  ・--verify があれば検証スクリプト <ID>.py を verify/ にコピーする。
  ・SVG の id は図ごとに接頭辞を付けて、同じページに並んでも衝突しないようにする。
"""
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_lib import CONTENT, ROOT  # noqa: E402

ALIASES = {'地球の形': '地球の形と大きさ・重力', '重力': '地球の形と大きさ・重力', '内部構造': '地球の内部構造', 'プレート': 'プレートテクトニクス',
           '火山': '火山とマグマ', '火成岩': '鉱物と火成岩', '鉱物': '鉱物と火成岩', '堆積岩': '風化・侵食・堆積と堆積岩', '地層': '地層と地質構造', '地質構造': '地層と地質構造',
           '変成岩': '変成作用と変成岩', '化石': '化石と地質時代', '地質時代': '化石と地質時代', '地球の歴史': '地球と生命の歴史', '生命の歴史': '地球と生命の歴史',
           '日本列島': '日本列島の成り立ち', '大気の構造': '大気の構造と組成', '断熱変化': '大気中の水と雲（断熱変化）', '大気中の水': '大気中の水と雲（断熱変化）',
           '熱収支': '地球の熱収支', '大気の大循環': '大気の大循環と風', '天気': '日本の天気', '海洋': '海洋の構造と海水の運動', '環境': '地球環境と自然災害', '自然災害': '地球環境と自然災害',
           '天球': '天球と天体の動き', '惑星': '惑星の運動と見え方', '太陽系': '太陽系の天体と月', '月': '太陽系の天体と月', '恒星': '恒星の性質と進化', '銀河': '銀河と宇宙', '宇宙': '銀河と宇宙'}
LEVEL = {1: 0, 2: 1, 3: 3, 4: 4, 5: 5}
# item.json の format（任意）：qa 一問一答／choice 正誤・選択／figure 図の読み取り／order 順序・新旧／term 用語の関係／calc 計算／written 記述。無ければ written
FORMATS = {'qa', 'choice', 'figure', 'order', 'term', 'calc', 'written'}

# タグ・テーマ・核に含まれる語 → 概念（上から順に、最大3つ）
KEYWORDS = [
    (r'ジオイド|偏平率|楕円体', 'earth-shape'), (r'重力異常|重力', 'gravity-earth'), (r'アイソスタシー|山の根|後氷期', 'isostasy'), (r'シャドーゾーン|走時|内部構造|外核|内核', 'seismic-structure'),
    (r'ホットスポット', 'hotspot'), (r'海洋底拡大|縞模様|古地磁気', 'seafloor-spreading'), (r'プレート|海嶺|海溝|沈み込み', 'plate-boundaries'),
    (r'大森|初期微動|震源', 'hypocenter-location'), (r'マグニチュード|震度', 'magnitude-intensity'), (r'断層', 'faults'), (r'津波|液状化|地震', 'earthquake-types'),
    (r'マグマの発生|部分溶融', 'magma-generation'), (r'火山|噴火|溶岩|カルデラ|粘性', 'volcano-forms'), (r'結晶分化|固溶体|晶出', 'crystallization'),
    (r'火成岩|斑状|等粒状|色指数', 'igneous-rocks'), (r'鉱物', 'rock-forming-minerals'), (r'地磁気|偏角|伏角', 'geomagnetism'),
    (r'不整合', 'unconformity'), (r'褶曲|走向|傾斜', 'geologic-structures'), (r'鍵層|対比|柱状図', 'correlation'), (r'累重|切断|地史|断面図', 'stratigraphy'),
    (r'級化|斜交葉理|リプル', 'sedimentary-structures'), (r'扇状地|三角州|段丘|V字谷', 'landforms'), (r'堆積岩|礫岩|砂岩|泥岩|石灰岩|チャート', 'sedimentary-rocks'), (r'風化|侵食|運搬', 'weathering-erosion'),
    (r'変成', 'metamorphism'), (r'放射年代|半減期', 'radiometric-dating'), (r'示準化石|示相化石|化石', 'fossils'), (r'地質時代', 'geologic-time'),
    (r'先カンブリア|縞状鉄鉱|ストロマトライト|全球凍結', 'early-earth'), (r'古生代|中生代|新生代|大量絶滅', 'life-history'), (r'付加体|日本列島|中央構造線', 'japan-geology'),
    (r'フェーン', 'foehn'), (r'安定|不安定', 'stability'), (r'断熱|凝結高度|雲', 'adiabatic'), (r'湿度|露点|飽和水蒸気', 'humidity'), (r'気圧', 'atm-pressure'),
    (r'対流圏|成層圏|中間圏|熱圏', 'atmosphere-structure'), (r'温室効果|放射平衡|アルベド|太陽定数', 'radiation-balance'), (r'熱の輸送', 'heat-transport'),
    (r'転向力|地衡風|気圧傾度', 'winds'), (r'大循環|偏西風|貿易風|ハドレー', 'general-circulation'), (r'前線|高気圧|低気圧|台風', 'weather-systems'), (r'天気図|梅雨|季節風', 'japan-weather'),
    (r'海流|深層循環|エルニーニョ|潮汐', 'ocean-currents'), (r'塩分|水温躍層', 'ocean-structure'), (r'温暖化|オゾンホール|酸性雨|災害', 'environment'),
    (r'南中|日周|年周|季節', 'diurnal-annual'), (r'天球|赤緯|赤経', 'celestial-sphere'), (r'ケプラー', 'kepler'), (r'会合周期|最大離角|衝|内惑星|外惑星', 'planet-motion'),
    (r'太陽系|惑星の形成|微惑星', 'solar-system'), (r'月|日食|月食', 'moon'), (r'黒点|太陽|フレア|コロナ', 'sun'), (r'HR図', 'hr-diagram'), (r'進化|白色矮星|超新星|巨星', 'stellar-evolution'),
    (r'等級|年周視差|光度|恒星', 'stellar-properties'), (r'銀河', 'galaxy'), (r'ハッブル|膨張|ビッグバン|背景放射', 'cosmology'),
]
# 語が1つも当たらないときの、単元ごとの概念
UNIT_DEFAULT = {
    'SOL-01': 'earth-shape', 'SOL-02': 'earth-interior', 'SOL-03': 'plate-boundaries', 'SOL-04': 'seismic-waves', 'SOL-05': 'volcano-forms', 'SOL-06': 'igneous-rocks', 'SOL-07': 'geomagnetism',
    'GEO-01': 'weathering-erosion', 'GEO-02': 'stratigraphy', 'GEO-03': 'metamorphism', 'GEO-04': 'fossils', 'GEO-05': 'life-history', 'GEO-06': 'japan-geology',
    'ATM-01': 'atmosphere-structure', 'ATM-02': 'adiabatic', 'ATM-03': 'radiation-balance', 'ATM-04': 'general-circulation', 'ATM-05': 'japan-weather', 'ATM-06': 'ocean-currents', 'ATM-07': 'environment',
    'AST-01': 'diurnal-annual', 'AST-02': 'planet-motion', 'AST-03': 'solar-system', 'AST-04': 'sun', 'AST-05': 'stellar-properties', 'AST-06': 'cosmology',
}


def outside_math(s):
    """数式の外の位置だけを True にした配列（$…$・\\[…\\]・\\(…\\)）"""
    mask = [True] * len(s)
    for m in re.finditer(r'\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|\$[^$]*\$', s, flags=re.S):
        for i in range(m.start(), m.end()):
            mask[i] = False
    return mask


def top_envs(text, env='enumerate'):
    """入れ子を考えて、いちばん外側の \\begin{env}…\\end{env} の (開始, 本文開始, 本文終了, 終了) を返す"""
    out, depth, start, body = [], 0, 0, 0
    for m in re.finditer(r'\\(begin|end)\{%s\}(\[[^\]]*\])?' % env, text):
        if m.group(1) == 'begin':
            if depth == 0:
                start, body = m.start(), m.end()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append((start, body, m.start(), m.end()))
    return out


def top_items(body):
    """入れ子の enumerate/itemize の中の \\item は分けない"""
    cuts, depth = [], 0
    for m in re.finditer(r'\\(begin|end)\{(?:enumerate|itemize)\}|\\item\b', body):
        if m.group(1) == 'begin':
            depth += 1
        elif m.group(1) == 'end':
            depth -= 1
        elif depth == 0:
            cuts.append(m)
    return [body[m.end():(cuts[k + 1].start() if k + 1 < len(cuts) else len(body))].strip() for k, m in enumerate(cuts)]


def split_statement(text):
    """問題文 → blocks（text / parts）。外側の enumerate の項目を小問にする。\\setcounter{enumi}{k} で番号を続ける"""
    blocks, num, pos = [], 0, 0
    SC = r'\\setcounter\{enumi\}\{(\d+)\}'
    for (st, bs, be, en) in top_envs(text):
        before, body = text[pos:st], text[bs:be]
        head = body.split('\\item', 1)[0]
        sc = re.findall(SC, before) + re.findall(SC, head)
        before = re.sub(SC, '', before).strip()
        if before:
            blocks.append({'type': 'text', 'tex': before})
        if sc:
            num = int(sc[-1])
        parts = []
        for it in top_items(re.sub(SC, '', body)):
            lab = re.match(r'\[([^\]]*)\]\s*', it)   # \item[(3)] は小問 3、\item[I.] は見出し（文章として入れる）
            if lab and not re.fullmatch(r'\(?\d+\)?\.?', lab.group(1).strip()):
                if parts:
                    blocks.append({'type': 'parts', 'items': parts})
                    parts = []
                blocks.append({'type': 'text', 'tex': f'\\textbf{{{lab.group(1).strip()}}}　' + it[lab.end():]})
                continue
            if lab:
                num = int(re.sub(r'\D', '', lab.group(1)))
                it = it[lab.end():]
            else:
                num += 1
            parts.append({'id': str(num), 'tex': it})
        if parts:
            blocks.append({'type': 'parts', 'items': parts})
        pos = en
    rest = re.sub(SC, '', text[pos:]).strip()
    if rest:
        blocks.append({'type': 'text', 'tex': rest})
    return blocks


def split_answer(ans, ids):
    """"(1) … (2) …" → 小問ごとの答え。小問番号は先頭か空白の直後にあるものだけを区切りとみなす。
    番号が小問と合わなければ 1つにまとめる"""
    mask = outside_math(ans)
    cands = [m for m in re.finditer(r'(?:^|(?<=[\s　]))\((\d+)\)', ans) if mask[m.start()]]
    cuts, k = [], 0
    for want in ids:
        while k < len(cands) and cands[k].group(1) != want:
            k += 1
        if k == len(cands):
            break
        cuts.append(cands[k])
        k += 1
    if ids and len(cuts) == len(ids) and cuts[0].start() == len(ans) - len(ans.lstrip()):
        out = []
        for j, m in enumerate(cuts):
            end = cuts[j + 1].start() if j + 1 < len(cuts) else len(ans)
            out.append({'id': m.group(1), 'tex': ans[m.end():end].strip().strip('　').strip()})
        return out, True
    return [{'id': 'main', 'tex': ans.strip()}], False


def prefix_svg_ids(svg, pre):
    ids = set(re.findall(r'\bid="([^"]+)"', svg))
    for i in sorted(ids, key=len, reverse=True):
        svg = re.sub(r'\bid="%s"' % re.escape(i), f'id="{pre}-{i}"', svg)
        svg = svg.replace(f'url(#{i})', f'url(#{pre}-{i})').replace(f'href="#{i}"', f'href="#{pre}-{i}"')
    return svg


def concepts_for(item, unit):
    text = ' '.join([item.get('tags', ''), item.get('theme', ''), item.get('core', '')])
    out = []
    for pat, cid in KEYWORDS:
        if re.search(pat, text) and cid not in out:
            out.append(cid)
    if unit.startswith('WAV-03') and 'interference' in out and 'light-interference' not in out:
        out[out.index('interference')] = 'light-interference'
    d = UNIT_DEFAULT[unit]
    if d in out:   # 単元の代表概念を先頭に
        out.remove(d)
    return ([d] + out)[:3]


def load_sheet(path):
    if not path:
        return {}
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['問題一覧']
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    col = {h: i for i, h in enumerate(head) if h}
    out = {}
    for r in rows[1:]:
        pid = r[col['ID']]
        if not pid or str(r[col.get('メモ', 0)] or '').startswith('記入例'):
            continue
        out[str(pid).strip()] = {h: r[i] for h, i in col.items()}
    return out


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    src = Path(argv[0])
    sheet = verify = None
    if '--sheet' in argv:
        sheet = argv[argv.index('--sheet') + 1]
    if '--verify' in argv:
        verify = Path(argv[argv.index('--verify') + 1])
    S = load_sheet(sheet)
    tax = json.loads((CONTENT / 'taxonomy.json').read_text(encoding='utf-8'))
    units = {u['name']: u for u in tax['units']}
    concepts = {c['id'] for c in json.loads((CONTENT / 'concepts.json').read_text(encoding='utf-8'))['concepts']}
    n, merged, problems = 0, [], []
    for d in sorted(p for p in src.iterdir() if (p / 'item.json').exists()):
        it = json.loads((d / 'item.json').read_text(encoding='utf-8'))
        pid = it['id']
        if not re.fullmatch(r'[A-Z]{3}-[A-Z]{3}-\d{3,}', pid) or pid != d.name:
            raise SystemExit(f'{d.name}: 問題ID {pid!r} が規則（ABC-DEF-001）に合わないか、フォルダ名と違います')
        uname = ALIASES.get(it['field'], it['field'])
        u = units.get(uname) or next((v for k, v in units.items() if ALIASES.get(k) == uname), None)
        if not u:
            raise SystemExit(f'{pid}: 単元「{it["field"]}」が taxonomy.json にありません')
        blocks = split_statement(it['problem'])
        ids = [x['id'] for b in blocks if b['type'] == 'parts' for x in b['items']]
        parts, ok = split_answer(it['answer'], ids)
        if not ok and ids:   # 答えを小問に分けられない → 小問は本文のまま（text）にする
            merged.append(pid)
            blocks = [{'type': 'text', 'tex': it['problem']}]
        figs, sol_blocks = [], []
        out = CONTENT / 'problems' / u['field'] / pid
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        if it.get('problem_fig'):
            svg = prefix_svg_ids((d / it['problem_fig']).read_text(encoding='utf-8'), 'q')
            (out / 'q-fig.svg').write_text(svg, encoding='utf-8')
            figs.append({'id': 'q-fig', 'role': 'question', 'kind': 'diagram', 'format': 'svg', 'src': 'q-fig.svg',
                         'alt': f'問題図：{it["theme"]}', 'caption': ''})
            k = 1 if blocks and blocks[0]['type'] == 'text' else 0
            blocks.insert(k, {'type': 'figure', 'ref': 'q-fig'})
        if it.get('solution_fig'):
            svg = prefix_svg_ids((d / it['solution_fig']).read_text(encoding='utf-8'), 'a')
            (out / 'a-fig.svg').write_text(svg, encoding='utf-8')
            figs.append({'id': 'a-fig', 'role': 'answer', 'kind': 'diagram', 'format': 'svg', 'src': 'a-fig.svg',
                         'alt': f'解答図：{it["theme"]}', 'caption': '解答図'})
            sol_blocks.append({'type': 'figure', 'ref': 'a-fig'})
        sol_blocks.append({'type': 'text', 'tex': it['solution']})
        row = S.get(pid, {})
        done = lambda k: str(row.get(k) or '').strip() == '済'   # noqa: E731
        created = row.get('作成日')
        created = created.strftime('%Y-%m-%d') if hasattr(created, 'strftime') else '2026-11-07'
        cs = [c for c in concepts_for(it, u['key']) if c in concepts]
        syn = False
        p = {
            'id': pid, 'schema': 'gaia.problem/1', 'field': u['field'], 'unit': u['key'], 'topic': it['theme'], 'course': '地学',
            'level': LEVEL[int(it['difficulty'])], 'minutes': int(it.get('time_min') or 20),
            'format': [f for f in re.split(r'[,，、\s]+', str(it.get('format') or '')) if f in FORMATS] or ['written'], 'examStyle': 'national-2nd',
            'statement': {'blocks': blocks}, 'figures': figs,
            'answer': {'parts': parts},
            'solutions': [{'id': 'main', 'kind': 'main', 'blocks': sol_blocks}],
            'idea': {'tex': it['core']} if it.get('core') else None,
            'concepts': cs, 'laws': [], 'misconceptions': [],
            'tags': [t.strip() for t in re.split(r'[,，、]', it.get('tags') or '') if t.strip()],
            'provenance': {'created': created, 'method': str(row.get('作成方法') or 'AI生成') + '（問題管理表から取り込み）'},
            'quality': {'status': 'published',
                        'checks': {'schema': True, 'units': False, 'figures': False,
                                   'facts': bool(it.get('verified')) or done('検証:SymPy等'), 'human': done('検証:人間確認')},
                        'verified': all(done(k) for k in ('検証:二重解答', '検証:SymPy等', '検証:人間確認'))},
        }
        if p['idea'] is None:
            del p['idea']
        (out / 'problem.json').write_text(json.dumps(p, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        if verify and (verify / f'{pid}.py').exists():
            (ROOT / 'verify').mkdir(exist_ok=True)
            shutil.copy(verify / f'{pid}.py', ROOT / 'verify' / f'{pid}.py')
        problems.append(pid)
        n += 1
    print(f'{n}問を取り込みました')
    if merged:
        print(f'答えを小問に分けられず、1つにまとめた問題 {len(merged)}問：' + ' '.join(merged))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
