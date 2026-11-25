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
