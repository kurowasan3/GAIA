// 探究ページの共通部品
export const FILE_VERSION = '0.1.3';

export let C = null;     // アプリから渡される道具（esc・math・toast・prefs・save・problemsFor・openIds）
export let Z = null;     // data/lab.json
export function setCtx(ctx, data) { C = ctx; Z = data; }

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const e = (s) => C.esc(s ?? '');
export const f1 = (n, d = 1) => (+n).toFixed(d);

export function head(title, kicker, sub) {
  return `<a class="back" href="#lab">‹ 探究</a><div class="kicker">探究 · ${e(kicker)}</div><h1>${e(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}`;
}
export function tabs(id, items, cur) {
  return `<div class="segment zk-tabs n${items.length}" id="${id}">${items.map(([k, label]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${e(label)}</button>`).join('')}</div>`;
}
export function bindTabs(id, fn) {
  $$(`#${id} button`).forEach(b => b.addEventListener('click', () => { $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.t); }));
}
export function probButton(page, key, label) {
  const ps = C.problemsFor(page, key);
  if (!ps.length) return '';
  return `<button class="btn primary block zk-prob" data-ids="${ps.map(p => p.id).join(',')}">${e(label || 'この内容の問題を解く')}（${ps.length}問）</button>`;
}
export function bindProb(root) {
  $$('.zk-prob', root).forEach(b => b.addEventListener('click', () => C.openIds(b.dataset.ids.split(','))));
}
export function done(root) { C.math(root); bindProb(root); }

// スライダー：label, id, min, max, step, value, unit
export function slider(id, label, min, max, step, value, unit = '', fmt = null) {
  return `<label class="lab-slider"><span class="ls-name">${e(label)}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="${id}-v">${fmt ? fmt(value) : value}${e(unit)}</output></label>`;
}
export function bindSlider(id, fn, unit = '', fmt = null) {
  const el = document.getElementById(id), out = document.getElementById(id + '-v');
  const on = () => { const v = +el.value; out.textContent = (fmt ? fmt(v) : v) + unit; fn(v); };
  el.addEventListener('input', on);
  return on;
}
// 画面を移るときに止めるアニメーション
export function animator(step) {
  let id = null, last = null, alive = true;
  const loop = (t) => { if (!alive) return; const dt = last === null ? 0 : Math.min(0.1, (t - last) / 1000); last = t; step(dt); id = requestAnimationFrame(loop); };
  return {
    start() { if (id === null && alive) { last = null; id = requestAnimationFrame(loop); } },
    stop() { if (id !== null) cancelAnimationFrame(id); id = null; },
    get running() { return id !== null; },
    destroy() { alive = false; if (id !== null) cancelAnimationFrame(id); id = null; },
  };
}
export function shuffle(a, r = Math.random) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
// 4択クイズの部品。items：[{key, svg, answer, choices?}]、explain(item) で解説の HTML
export function quiz(box, { pick, explain, label = 'これは何？' }) {
  let score = 0, n = 0, cur = null, answered = false;
  const draw = () => {
    cur = pick();
    answered = false;
    box.innerHTML = `<div class="lab-quiz">
      <div class="lq-head"><b>${e(label)}</b><span class="muted small">正解 ${score} / ${n}</span></div>
      <div class="lq-fig">${cur.svg}</div>
      <div class="lq-opts">${cur.choices.map((c, i) => `<button class="opt" data-i="${i}">${e(c)}</button>`).join('')}</div>
      <div class="lq-exp"></div>
    </div>`;
    $$('.lq-opts .opt', box).forEach(b => b.addEventListener('click', () => {
      if (answered) return;
      answered = true; n++;
      const ok = cur.choices[+b.dataset.i] === cur.answer;
      if (ok) score++;
      $$('.lq-opts .opt', box).forEach(x => { x.disabled = true; if (cur.choices[+x.dataset.i] === cur.answer) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      $('.lq-head span', box).textContent = `正解 ${score} / ${n}`;
      $('.lq-exp', box).innerHTML = `<div class="lq-verdict ${ok ? 'ok' : 'ng'}">${ok ? '正解' : `不正解：正しくは「${e(cur.answer)}」`}</div>${explain(cur)}<button class="btn primary block" id="lqnext">次へ</button>`;
      C.math($('.lq-exp', box));
      $('#lqnext', box).addEventListener('click', draw);
    }));
  };
  draw();
}
export function choicesFrom(answer, pool, n = 4, r = Math.random) {
  const others = shuffle(pool.filter(x => x !== answer), r).slice(0, n - 1);
  return shuffle([answer, ...others], r);
}
