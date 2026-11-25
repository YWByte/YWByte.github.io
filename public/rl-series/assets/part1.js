const TOKENS = ['if', 'return', 'try', 'pass', '#'];
const INIT_LOGITS = [1.2, 1.8, 0.2, -0.5, -1.0];

/* 可视化 1：logits → softmax */
(function () {
  const root = document.getElementById('viz-softmax');
  if (!root) return;
  const z = INIT_LOGITS.slice();
  const rows = root.querySelector('.rows');
  const chips = root.querySelector('.samples');

  rows.innerHTML = TOKENS.map((t, i) => `
    <div class="row">
      <span class="tok">${t}</span>
      <input class="slider" type="range" min="-3" max="3" step="0.1" value="${z[i]}" data-i="${i}" aria-label="${t} 的 logit">
      <div class="track"><div class="bar"></div></div>
      <span class="val"></span>
    </div>`).join('');

  const bars = rows.querySelectorAll('.bar');
  const vals = rows.querySelectorAll('.val');
  const logitOut = root.querySelector('.logit-readout');
  const tempIn = root.querySelector('[data-opt=temp]');
  const tempOut = root.querySelector('.temp-readout');
  let T = 1;

  function render() {
    const p = RL.softmax(z.map(v => v / T));
    tempOut.textContent = 'T = ' + T.toFixed(1);
    p.forEach((v, i) => {
      bars[i].style.width = (v * 100) + '%';
      vals[i].textContent = RL.fmt(v);
    });
    logitOut.textContent = 'logits = [' + z.map(v => v.toFixed(1)).join(', ') + ']';
  }

  rows.addEventListener('input', e => {
    const i = +e.target.dataset.i;
    z[i] = +e.target.value;
    chips.innerHTML = '';
    render();
  });

  tempIn.addEventListener('input', () => {
    T = +tempIn.value;
    chips.innerHTML = '';
    render();
  });

  root.querySelector('[data-act=sample]').addEventListener('click', () => {
    const p = RL.softmax(z.map(v => v / T));
    chips.innerHTML = '';
    for (let n = 0; n < 20; n++) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.style.animationDelay = (n * 25) + 'ms';
      c.textContent = TOKENS[RL.sample(p)];
      chips.appendChild(c);
    }
  });

  render();
})();

/* 可视化 2：SFT 一步更新 */
(function () {
  const root = document.getElementById('viz-sft');
  if (!root) return;
  const LR = 1.0;
  let z, target, lastDelta;
  const rows = root.querySelector('.rows');

  function reset() {
    z = INIT_LOGITS.slice();
    target = 0;
    lastDelta = null;
    render();
  }

  function render() {
    const p = RL.softmax(z);
    rows.innerHTML = TOKENS.map((t, i) => {
      let d = '';
      if (lastDelta) {
        const v = lastDelta[i];
        const cls = v >= 0 ? 'c-up' : 'c-down';
        d = `<span class="delta ${cls}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}</span>`;
      } else {
        d = '<span class="delta"></span>';
      }
      return `
        <div class="row sft ${i === target ? 'target' : ''}" data-i="${i}" role="button" tabindex="0">
          <span class="tok">${t}${i === target ? ' ✓' : ''}</span>
          <div class="track"><div class="bar" style="width:${p[i] * 100}%"></div></div>
          <span class="val">${RL.fmt(p[i])}</span>
          ${d}
        </div>`;
    }).join('');
    root.querySelector('.loss-readout').textContent =
      `示范 token：${TOKENS[target]}　　loss = −log p = ${(-Math.log(p[target])).toFixed(3)}`;
  }

  rows.addEventListener('click', e => {
    const row = e.target.closest('.row');
    if (!row) return;
    target = +row.dataset.i;
    lastDelta = null;
    render();
  });

  root.querySelector('[data-act=step]').addEventListener('click', () => {
    const before = RL.softmax(z);
    z = RL.push(z, target, LR);
    const after = RL.softmax(z);
    lastDelta = after.map((v, i) => v - before[i]);
    render();
  });
  root.querySelector('[data-act=reset]').addEventListener('click', reset);
  reset();
})();

/* 可视化 3：REINFORCE 修 bug */
(function () {
  const root = document.getElementById('viz-reinforce');
  if (!root) return;
  const svg = root.querySelector('svg.tree-svg');
  const curve = root.querySelector('svg.curve');
  const logBox = root.querySelector('.log');
  const rateOut = root.querySelector('.big');
  const stepOut = root.querySelector('.step-readout');
  const rewardSel = root.querySelector('[data-opt=reward]');
  const startSel = root.querySelector('[data-opt=start]');
  const LR = 0.5;

  const CHILDREN = { root: ['a', 'b', 'c'], a: ['a1', 'a2'], b: ['b1', 'b2'] };
  const FIRST = { a: 'if', b: 'return', c: 'try' };
  const LEAF = {
    a1: { code: 'if not xs: return 0', pass: true },
    a2: { code: 'if xs is None: return 0', pass: false },
    b1: { code: 'return … if xs else 0', pass: true },
    b2: { code: 'return sum(xs) / len(xs)', pass: false },
    c:  { code: 'try … except: return 0', pass: true },
  };
  const STARTS = {
    normal: { root: [0.30, 0.55, 0.15], a: [0.40, 0.60], b: [0.25, 0.75] },
    cold:   { root: [0.03, 0.95, 0.02], a: [0.05, 0.95], b: [0.015, 0.985] },
  };

  const POS = {
    root: [26, 150],
    a: [150, 58], b: [150, 172], c: [150, 262],
    a1: [300, 30], a2: [300, 86], b1: [300, 144], b2: [300, 200], c_leaf: [300, 262],
  };

  let z, steps, history, busy = false;

  function probs() {
    return { root: RL.softmax(z.root), a: RL.softmax(z.a), b: RL.softmax(z.b) };
  }
  function pathProb(P, leaf) {
    if (leaf === 'c') return P.root[2];
    const parent = leaf[0];
    const i = { a: 0, b: 1 }[parent];
    return P.root[i] * P[parent][+leaf[1] - 1];
  }
  function passRate(P) {
    return ['a1', 'b1', 'c'].reduce((s, l) => s + pathProb(P, l), 0);
  }

  function edgePath(from, to) {
    const [x1, y1] = POS[from], [x2, y2] = POS[to];
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }

  function draw(hot) {
    const P = probs();
    const isHot = (a, b) => hot && hot.path.includes(a) && hot.path.includes(b);
    const hotCls = (a, b) => isHot(a, b) ? ` hot${hot.pass ? '' : ' bad'}` : '';
    let s = '';
    const edge = (a, b, p, lx, ly, anchor = 'start') => {
      s += `<path class="edge${hotCls(a, b)}" d="${edgePath(a, b)}" style="stroke-width:${1 + 13 * p}px"/>`;
      s += `<text class="plabel" x="${lx}" y="${ly}" text-anchor="${anchor}">${p.toFixed(2)}</text>`;
    };
    ['a', 'b', 'c'].forEach((k, i) => {
      const [x, y] = POS[k];
      edge('root', k, P.root[i], x, y - 20, 'middle');
    });
    ['a', 'b'].forEach(k => {
      CHILDREN[k].forEach((leaf, i) => {
        const [, y] = POS[leaf];
        edge(k, leaf, P[k][i], 214, y + (i === 0 ? -6 : 14));
      });
    });
    s += `<path class="edge${hotCls('c', 'c_leaf')}" d="${edgePath('c', 'c_leaf')}" style="stroke-width:2px;stroke-dasharray:3 4"/>`;

    s += `<circle class="node" cx="${POS.root[0]}" cy="${POS.root[1]}" r="9"/>`;
    ['a', 'b', 'c'].forEach(k => {
      const [x, y] = POS[k];
      const h = hot && hot.path.includes(k) ? ' hot' : '';
      s += `<rect class="node${h}" x="${x - 30}" y="${y - 14}" width="60" height="28" rx="6"/>`;
      s += `<text class="code" x="${x}" y="${y + 4}" text-anchor="middle">${FIRST[k]}</text>`;
    });
    Object.entries(LEAF).forEach(([k, leaf]) => {
      const [x, y] = POS[k === 'c' ? 'c_leaf' : k];
      const h = hot && hot.leaf === k ? ' hot' : '';
      s += `<circle class="node${h}" cx="${x}" cy="${y}" r="5"/>`;
      s += `<text class="code" x="${x + 12}" y="${y + 4}">${leaf.code}</text>`;
      s += `<text class="${leaf.pass ? 'pass' : 'fail'}" x="${x + 222}" y="${y + 4}">${leaf.pass ? '✓' : '✗'}</text>`;
      s += `<text class="plabel" x="${x + 236}" y="${y + 4}">${pathProb(P, k).toFixed(2)}</text>`;
    });
    svg.innerHTML = s;
    rateOut.innerHTML = `${(passRate(P) * 100).toFixed(0)}%<small>通过率</small>`;
    stepOut.textContent = `已训练 ${steps} 步`;
  }

  function drawCurve() {
    const W = 560, H = 130, L = 34, B = 18, T = 8;
    const maxX = Math.max(200, history.length - 1);
    const x = i => L + (W - L - 8) * i / maxX;
    const y = v => T + (H - T - B) * (1 - v);
    const pts = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    curve.innerHTML = `
      <line class="axis" x1="${L}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}"/>
      <line class="axis" x1="${L}" y1="${y(1)}" x2="${W - 8}" y2="${y(1)}" stroke-dasharray="3 4"/>
      <text x="${L - 6}" y="${y(1) + 4}" text-anchor="end">1</text>
      <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
      <text x="${W - 8}" y="${H - 2}" text-anchor="end">训练步数 ${maxX}</text>
      <text x="${L}" y="${H - 2}">通过率</text>
      <polyline class="line" points="${pts}"/>`;
  }

  function rollout() {
    const P = probs();
    const i = RL.sample(P.root);
    const first = ['a', 'b', 'c'][i];
    const choices = [['root', i]];
    let leaf = first;
    if (CHILDREN[first]) {
      const j = RL.sample(P[first]);
      choices.push([first, j]);
      leaf = CHILDREN[first][j];
    }
    const pass = LEAF[leaf].pass;
    const failReward = rewardSel.value === 'half' ? 0.5 : 0;
    return { choices, leaf, pass, R: pass ? 1 : failReward, path: ['root', first, leaf, leaf === 'c' ? 'c_leaf' : leaf] };
  }

  function update(ro) {
    ro.choices.forEach(([node, k]) => { z[node] = RL.push(z[node], k, LR * ro.R); });
    steps++;
    history.push(passRate(probs()));
  }

  function reset() {
    const s = STARTS[startSel.value];
    z = { root: s.root.map(Math.log), a: s.a.map(Math.log), b: s.b.map(Math.log) };
    steps = 0;
    history = [passRate(probs())];
    logBox.innerHTML = '点击“采样一次”，让模型写一个补丁。';
    draw();
    drawCurve();
  }

  function setBusy(v) {
    busy = v;
    root.querySelectorAll('button, select').forEach(b => { b.disabled = v; });
  }

  root.querySelector('[data-act=one]').addEventListener('click', () => {
    if (busy) return;
    setBusy(true);
    const ro = rollout();
    const before = pathProb(probs(), ro.leaf);
    draw(ro);
    const leaf = LEAF[ro.leaf];
    const verdict = ro.pass
      ? `<span class="c-up">测试通过</span>`
      : `<span class="c-down">测试失败</span>`;
    logBox.innerHTML = `模型写出：<span class="r">${leaf.code}</span><br>${verdict}，奖励 <span class="c-reward">R = ${ro.R}</span>`;
    setTimeout(() => {
      update(ro);
      const after = pathProb(probs(), ro.leaf);
      let msg;
      if (ro.R === 0) msg = 'R = 0，梯度乘以 0：什么都不变。';
      else if (ro.pass) msg = `沿途每个选择都被推高，这条路径的概率 ${before.toFixed(2)} → <span class="c-up">${after.toFixed(2)}</span>`;
      else msg = `错误补丁也拿到了正奖励，被推高了：${before.toFixed(2)} → <span class="c-down">${after.toFixed(2)}</span>`;
      logBox.innerHTML += `<br>${msg}`;
      draw(ro);
      drawCurve();
      setTimeout(() => { draw(); setBusy(false); }, 700);
    }, 650);
  });

  root.querySelector('[data-act=many]').addEventListener('click', () => {
    if (busy) return;
    setBusy(true);
    let left = 200;
    logBox.innerHTML = '连续训练 200 步：每一步采样一个补丁、跑测试、按奖励更新。';
    (function tick() {
      for (let n = 0; n < 4 && left > 0; n++, left--) update(rollout());
      draw();
      drawCurve();
      if (left > 0) requestAnimationFrame(tick);
      else setBusy(false);
    })();
  });

  root.querySelector('[data-act=reset]').addEventListener('click', reset);
  rewardSel.addEventListener('change', reset);
  startSel.addEventListener('change', reset);
  reset();
})();


/* 可视化：误差累积 */
(function () {
  const root = document.getElementById('viz-compound');
  if (!root) return;
  const epsIn = root.querySelector('[data-opt=eps]');
  const tIn = root.querySelector('[data-opt=steps]');
  const svg = root.querySelector('svg');
  const out = root.querySelector('.compound-readout');
  const W = 600, H = 200, L = 40, B = 24, TOP = 10, MAXT = 500;

  function render() {
    const eps = +epsIn.value / 100;
    const T = +tIn.value;
    const x = t => L + (W - L - 10) * t / MAXT;
    const y = v => TOP + (H - TOP - B) * (1 - v);
    let pts = [];
    for (let t = 0; t <= MAXT; t += 5) pts.push(`${x(t).toFixed(1)},${y(Math.pow(1 - eps, t)).toFixed(1)}`);
    const v = Math.pow(1 - eps, T);
    svg.innerHTML = `
      <line class="axis" x1="${L}" y1="${y(0)}" x2="${W - 10}" y2="${y(0)}"/>
      <line class="axis" x1="${L}" y1="${y(1)}" x2="${W - 10}" y2="${y(1)}" stroke-dasharray="3 4"/>
      <text x="${L - 6}" y="${y(1) + 4}" text-anchor="end">1</text>
      <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
      <text x="${W - 10}" y="${H - 4}" text-anchor="end">步数 ${MAXT}</text>
      <text x="${L}" y="${H - 4}">0</text>
      <polyline class="line" points="${pts.join(' ')}"/>
      <line x1="${x(T)}" y1="${y(0)}" x2="${x(T)}" y2="${y(v)}" stroke="var(--reward)" stroke-dasharray="3 3"/>
      <circle cx="${x(T)}" cy="${y(v)}" r="5" fill="var(--reward)"/>`;
    out.innerHTML = `每步出错概率 ε = ${(eps * 100).toFixed(1)}%，连续 ${T} 步都不出错的概率 = <span class="c-reward">${(v * 100).toFixed(1)}%</span>`;
  }
  epsIn.addEventListener('input', render);
  tIn.addEventListener('input', render);
  render();
})();

/* 可视化：用采样估计梯度 */
(function () {
  const root = document.getElementById('viz-estimator');
  if (!root) return;
  const PATCHES = [
    { code: 'if not xs: return 0', R: 1, p: 0.2 },
    { code: 'if xs is None: return 0', R: 0, p: 0.3 },
    { code: 'return … if xs else 0', R: 1, p: 0.1 },
    { code: 'return sum(xs) / len(xs)', R: 0, p: 0.4 },
  ];
  const p = PATCHES.map(x => x.p);
  const J = PATCHES.reduce((s, x) => s + x.p * x.R, 0);
  const truth = PATCHES.map(x => x.p * (x.R - J));
  const SCALE_ONE = 1.0, SCALE_AVG = 0.2;
  const rowsEl = root.querySelector('.est-rows');
  const info = root.querySelector('.est-info');
  let sum, n, last, lastK;

  function bar(v, scale) {
    const w = Math.min(Math.abs(v) / scale, 1) * 50;
    const left = v >= 0 ? 50 : 50 - w;
    return `<div class="bar ${v >= 0 ? 'pos' : 'neg'}" style="left:${left}%;width:${w}%"></div>`;
  }

  function render() {
    rowsEl.innerHTML = `
      <div class="est-row est-head"><span>补丁</span><span></span><span>概率</span><span>这一次的估计</span><span>${n} 次的平均</span></div>` +
      PATCHES.map((x, k) => {
        const avg = n ? sum[k] / n : 0;
        const tick = 50 + truth[k] / SCALE_AVG * 50;
        return `
        <div class="est-row ${lastK === k ? 'picked' : ''}">
          <span class="tok">${x.code}</span>
          <span class="${x.R ? 'c-up' : 'c-down'}">${x.R ? '✓' : '✗'}</span>
          <span class="val">${x.p.toFixed(1)}</span>
          <div class="track ztrack">${last ? bar(last[k], SCALE_ONE) : ''}<span class="zero"></span></div>
          <div class="track ztrack">${n ? bar(avg, SCALE_AVG) : ''}<span class="zero"></span><span class="truth" style="left:${tick}%"></span></div>
        </div>`;
      }).join('');
    if (!n) {
      info.innerHTML = '每次采样一个补丁，算出 R·∇log π 对 4 个 logit 的分量。黄色竖线是真实梯度。';
      return;
    }
    const err = Math.sqrt(truth.reduce((s, t, k) => s + (sum[k] / n - t) ** 2, 0));
    const x = PATCHES[lastK];
    info.innerHTML = `最近一次采到 <span class="tok">${x.code}</span>，R = <span class="c-reward">${x.R}</span>。` +
      `平均值与真实梯度的距离：<span class="tok">${err.toFixed(3)}</span>`;
  }

  function draw() {
    const k = RL.sample(p);
    const R = PATCHES[k].R;
    const g = p.map((pj, j) => R * ((j === k ? 1 : 0) - pj));
    g.forEach((v, j) => { sum[j] += v; });
    n++;
    last = g;
    lastK = k;
  }

  function reset() {
    sum = [0, 0, 0, 0];
    n = 0;
    last = null;
    lastK = -1;
    render();
  }

  root.querySelector('[data-act=one]').addEventListener('click', () => { draw(); render(); });
  root.querySelector('[data-act=many]').addEventListener('click', () => {
    for (let i = 0; i < 100; i++) draw();
    render();
  });
  root.querySelector('[data-act=reset]').addEventListener('click', reset);
  reset();
})();

/* 可视化 0：h · w_i → logit → 概率 */
(function () {
  const root = document.getElementById('viz-dot');
  if (!root) return;
  const DIMS = ['条件判断', '结束函数', '空列表'];
  const TOK = ['if', 'return', 'try', 'pass'];
  const W = [[1.0, 0.0, 0.5], [0.2, 1.0, 0.1], [0.3, 0.0, 0.6], [-0.5, 0.2, -0.3]];
  const PRESETS = [[0.9, 0.1, 0.8], [0.1, 1.4, 0.0], [0, 0, 0]];
  const h = PRESETS[0].slice();

  root.querySelector('.hvec').innerHTML = '<div class="hvec-title">隐状态 h</div>' + DIMS.map((d, k) => `
    <label class="hdim"><span>h<sub>${k + 1}</sub> ${d}</span>
      <input type="range" min="-1" max="1.5" step="0.05" value="${h[k]}" data-k="${k}" aria-label="h 第 ${k + 1} 维">
      <span class="readout"></span></label>`).join('');
  const inputs = root.querySelectorAll('.hdim input');
  const outs = root.querySelectorAll('.hdim .readout');

  const rowsEl = root.querySelector('.dot-rows');
  rowsEl.innerHTML = '<div class="dot-row dot-head"><span>token</span><span>w<sub>i</sub></span><span>逐维相乘再相加</span><span>logit</span><span>概率</span></div>' +
    TOK.map((t, i) => `
    <div class="dot-row">
      <span class="tok">${t}</span>
      <span class="wvec">[${W[i].map(v => v.toFixed(1)).join(', ')}]</span>
      <span class="terms"></span>
      <span class="zval"></span>
      <span class="pcell"><span class="track"><span class="bar"></span></span><span class="val"></span></span>
    </div>`).join('');
  const terms = rowsEl.querySelectorAll('.terms');
  const zv = rowsEl.querySelectorAll('.zval');
  const bars = rowsEl.querySelectorAll('.bar');
  const vals = rowsEl.querySelectorAll('.val');

  const sgn = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);

  function render() {
    h.forEach((v, k) => { inputs[k].value = v; outs[k].textContent = v.toFixed(2); });
    const z = W.map(w => w.reduce((s, v, k) => s + v * h[k], 0));
    const p = RL.softmax(z);
    const top = p.indexOf(Math.max(...p));
    W.forEach((w, i) => {
      terms[i].innerHTML = w.map((v, k) => {
        const t = v * h[k];
        const cls = Math.abs(t) < 0.005 ? '' : t > 0 ? 'c-up' : 'c-down';
        return `<span class="${cls}">${k ? sgn(t) : (t < 0 ? '−' : '') + Math.abs(t).toFixed(2)}</span>`;
      }).join(' ');
      zv[i].textContent = z[i].toFixed(2);
      bars[i].style.width = (p[i] * 100) + '%';
      vals[i].textContent = (p[i] * 100).toFixed(1) + '%';
      rowsEl.children[i + 1].classList.toggle('top', i === top);
    });
  }

  root.querySelector('.hvec').addEventListener('input', e => {
    h[+e.target.dataset.k] = +e.target.value;
    render();
  });
  root.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    PRESETS[+b.dataset.preset].forEach((v, k) => { h[k] = v; });
    render();
  }));
  render();
})();
