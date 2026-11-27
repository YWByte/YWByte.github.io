document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});

window.addEventListener('load', () => {
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }
});

window.RL = {
  softmax(z) {
    const m = Math.max(...z);
    const e = z.map(v => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / s);
  },
  sample(p) {
    let r = Math.random();
    for (let i = 0; i < p.length; i++) {
      r -= p[i];
      if (r < 0) return i;
    }
    return p.length - 1;
  },
  // 交叉熵对 logits 的负梯度：选中的 token 加 (1-p)，其余减 p
  push(z, k, scale) {
    const p = RL.softmax(z);
    return z.map((v, j) => v + scale * ((j === k ? 1 : 0) - p[j]));
  },
  fmt: (x, d = 2) => x.toFixed(d),
};

window.addEventListener('load', function buildSidebar() {
  const prose = document.querySelector('.prose');
  if (!prose) return;
  const heads = [...prose.querySelectorAll('h2, h3')].filter(h => h.querySelector('.num'));
  if (!heads.length) return;

  const nav = document.createElement('nav');
  nav.className = 'sidebar';
  nav.setAttribute('aria-label', '本文目录');
  let html = '<div class="sb-title">目录</div><ol class="sb-list">';
  let open = false;
  const items = [];
  heads.forEach(h => {
    const num = h.querySelector('.num').textContent.trim();
    if (!h.id) h.id = 's' + num.replace(/\./g, '-');
    const c = h.cloneNode(true);
    c.querySelector('.num').remove();
    const text = c.innerHTML.trim();
    const a = `<a href="#${h.id}" data-id="${h.id}"><span class="sb-n">${num}</span>${text}</a>`;
    if (h.tagName === 'H2') {
      if (open) html += '</ol></li>';
      html += `<li class="sb-h2">${a}<ol class="sb-sub">`;
      open = true;
    } else {
      html += `<li class="sb-h3">${a}</li>`;
    }
    items.push(h);
  });
  if (open) html += '</ol></li>';
  html += '</ol>';
  nav.innerHTML = html;
  document.body.appendChild(nav);

  const btn = document.createElement('button');
  btn.className = 'sb-toggle';
  btn.type = 'button';
  btn.textContent = '目录';
  btn.setAttribute('aria-label', '打开目录');
  document.body.appendChild(btn);
  btn.addEventListener('click', () => nav.classList.toggle('open'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) nav.classList.remove('open'); });
  document.addEventListener('click', e => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== btn) nav.classList.remove('open');
  });

  const links = new Map([...nav.querySelectorAll('a')].map(a => [a.dataset.id, a]));
  let current = null;
  function update() {
    let active = items[0];
    for (const h of items) {
      if (h.getBoundingClientRect().top <= 100) active = h; else break;
    }
    if (active === current) return;
    current = active;
    nav.querySelectorAll('.active, .current').forEach(el => el.classList.remove('active', 'current'));
    const link = links.get(active.id);
    link.classList.add('active');
    link.closest('.sb-h2').classList.add('current');
    // 侧栏内容较长时，保持当前条目可见，但不触发页面滚动
    const lr = link.getBoundingClientRect(), nr = nav.getBoundingClientRect();
    if (lr.top < nr.top + 40 || lr.bottom > nr.bottom - 40) nav.scrollTop += lr.top - nr.top - nr.height / 3;
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { update(); ticking = false; }); }
  }, { passive: true });
  update();
});
