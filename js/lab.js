// 探究：CELESTIA のシミュレーションの代わりに、地学の「見る・動かす・つなげる」ページ
//   #lab                      トップ（5つのページ）
//   #lab=identify[/種類:ID]    地図・画像からの識別（岩石・化石・天気図・地形図）
//   #lab=strata[/型]           地層・地質構造（地史の組み立て・新旧の判定・柱状図の対比）
//   #lab=phenomena[/ID]       地球現象のシミュレーション（地震波・断熱変化・ホットスポット・アイソスタシー・放射年代）
//   #lab=sky[/ID]             天体・宇宙の可視化（天球・惑星・月・ケプラー・HR図）
//   #lab=terms[/用語ID]        地学用語の関連付け（ネットワーク・関係の練習・経路さがし）
// データは data/lab.json（tools/build_data.py が content/geo/ から作る）
import { setCtx, C, e } from './lab/common.js';
import { identifyPage } from './lab/identify.js';
import { strataPage } from './lab/strata.js';
import { phenomenaPage } from './lab/phenomena.js';
import { skyPage } from './lab/sky.js';
import { termsPage } from './lab/terms.js';

export const FILE_VERSION = '0.1.0';

export const PAGES = [
  { id: 'identify', name: '地図・画像からの識別', desc: '岩石の組織・化石・天気図・地形図（等高線）を見分ける。図鑑とクイズ', icon: 'lens' },
  { id: 'strata', name: '地層・地質構造の理解', desc: '断面図で地史を1つずつ再生。断層・不整合・貫入の新旧を当てる。柱状図の対比', icon: 'layers' },
  { id: 'phenomena', name: '地球現象のシミュレーション', desc: '地震波と震源決定、断熱変化とフェーン、ホットスポット、アイソスタシー、放射年代', icon: 'wave' },
  { id: 'sky', name: '天体・宇宙の可視化', desc: '天球と日周運動、惑星の見え方、月の満ち欠け、ケプラーの法則、HR図', icon: 'orbit' },
  { id: 'terms', name: '地学用語の関連付け', desc: '用語どうしの「原因・対比・証拠…」のつながりをたどる。関係を当てる練習', icon: 'net' },
  { id: 'laws', name: '地学の法則', desc: '地層累重・大森公式・ケプラーの法則・シュテファン・ボルツマンの法則など（成り立つ条件・根拠・導出）', icon: 'law', href: '#concepts' },
];
const ICONS = {
  lens: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/><path d="M7.5 9.5l2 2 3-4"/>',
  layers: '<path d="M3 7h18M3 12h18M3 17h18"/><path d="M13 3l-4 18" stroke-dasharray="2 2"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><circle cx="12" cy="20" r="1.2"/><path d="M8.5 20a3.5 3.5 0 0 1 7 0"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="5" transform="rotate(-20 12 12)"/><circle cx="20" cy="9" r="1.4"/>',
  net: '<circle cx="5" cy="6" r="2.3"/><circle cx="19" cy="7" r="2.3"/><circle cx="12" cy="18" r="2.3"/><circle cx="12" cy="10" r="1.6"/><path d="M7 7l3.6 2.3M17 8l-3.6 1.6M12 11.6v4.1"/>',
  law: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

export function renderLab(view, data, arg, ctx) {
  setCtx(ctx, data);
  const s = String(arg || '');
  const i = s.indexOf('/');
  const page = i < 0 ? s : s.slice(0, i);
  const key = i < 0 ? null : decodeURIComponent(s.slice(i + 1)) || null;
  const fn = { identify: identifyPage, strata: strataPage, phenomena: phenomenaPage, sky: skyPage, terms: termsPage }[page];
  if (!fn) return topPage(view);
  C.prefs.page = page; C.save();
  return fn(view, key);
}

function topPage(view) {
  view.innerHTML = `<div class="fade-in">
    <div class="kicker">GAIA · 探究</div>
    <h1>探究</h1>
    <p class="sub">見分ける・動かす・つなげることで、覚えたことを確かめる場所です。解いた問題の「探究で確かめる」からもここに来られます。</p>
    <div class="zk-grid">${PAGES.map(p => `<a class="zk-card" href="${p.href || '#lab=' + p.id}">${icon(p.icon)}<b>${e(p.name)}</b><span>${e(p.desc)}</span></a>`).join('')}</div>
  </div>`;
}
