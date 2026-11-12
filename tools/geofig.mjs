// 問題の図を、探究と同じモデル（js/lab/model/）から作る
//   node tools/geofig.mjs           content/problems/**/<図>.fig.json → <図>.svg を書く
//   node tools/geofig.mjs --check   作り直したものと今の SVG が同じか調べる（違えば終了コード 1）
// 作図仕様（*.fig.json）の例
//   {"gen": "strata", "template": "fault-unconf", "seed": 3}          地質断面図（upto で途中まで、labels:false でラベルなし）
//   {"gen": "columns", "seed": 4}                                     柱状図（3地点）
//   {"gen": "weather", "key": "winter"}                               天気図
//   {"gen": "topo", "key": "fan"}                                     地形図
//   {"gen": "rock", "id": "granite", "seed": 2}                       岩石の組織
//   {"gen": "fossil", "id": "ammonite"}                               化石
//   {"gen": "traveltime", "vp": 6, "vs": 3.5, "maxD": 300, "marks": [{"d": 120, "label": "A"}]}   走時曲線
//   {"gen": "hr", "ids": ["sun", "sirius-b"], "label": {"sun": "X"}}  HR図
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { simulate, strataSVG, makeHistory } from '../js/lab/model/strata.js';
import { weatherSVG, topoSVG } from '../js/lab/model/maps.js';
import { rockSVG, fossilSVG } from '../js/lab/model/specimens.js';
import { travelTimeSVG, hrSVG } from '../js/lab/model/charts.js';
import { columnsHistory, columnsSVG } from '../js/lab/strata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = (n) => JSON.parse(fs.readFileSync(path.join(root, 'content/geo', n + '.json'), 'utf8'));

export function render(spec, idp) {
  switch (spec.gen) {
    case 'strata': {
      const h = makeHistory(spec.template, spec.seed);
      const sim = simulate(h.events, h.W, h.H, spec.upto ?? h.events.length);
      return strataSVG(sim, { idp, cell: 3, labels: spec.labels !== false, alt: spec.alt || '地質断面図' });
    }
    case 'columns': {
      const h = columnsHistory(spec.seed);
      return columnsSVG(simulate(h.events, h.W, h.H), spec.xs || [30, 100, 170], { idp, link: !!spec.link, alt: spec.alt });
    }
    case 'weather': return weatherSVG(spec.key, { alt: spec.alt });
    case 'topo': return topoSVG(spec.key, { alt: spec.alt, labels: spec.labels });
    case 'rock': return rockSVG(geo('identify').rocks.find(r => r.id === spec.id), { seed: spec.seed || 1, size: 220, idp, alt: spec.alt || '岩石の組織' });
    case 'fossil': return fossilSVG(spec.id, { w: 220, alt: spec.alt || '化石' });
    case 'traveltime': return travelTimeSVG({ ...spec, alt: spec.alt });
    case 'hr': {
      const stars = geo('sky').stars.map(s => spec.label && spec.label[s.id] ? { ...s, short: spec.label[s.id] } : s);
      const only = spec.only ? stars.filter(s => spec.only.includes(s.id)) : stars;
      return hrSVG(only, { ids: spec.ids || [], alt: spec.alt, regions: spec.regions !== false, radii: spec.radii !== false });
    }
    default: throw new Error('gen がありません：' + spec.gen);
  }
}

function* specs(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* specs(p);
    else if (f.name.endsWith('.fig.json')) yield p;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let n = 0, bad = 0;
  for (const p of specs(path.join(root, 'content/problems'))) {
    const spec = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = p.replace(/\.fig\.json$/, '.svg');
    const id = path.basename(path.dirname(p)).toLowerCase() + '-' + path.basename(p, '.fig.json');
    const svg = render(spec, id) + '\n';
    n++;
    if (check) {
      if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== svg) { bad++; console.log('作り直すと違う：', path.relative(root, out)); }
    } else fs.writeFileSync(out, svg);
  }
  console.log(check ? `作図仕様 ${n}件を確認、違い ${bad}件${bad ? '（node tools/geofig.mjs を実行）' : ''}` : `作図仕様 ${n}件から SVG を書きました`);
  process.exitCode = bad ? 1 : 0;
}
