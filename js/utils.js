/* ============================================================
   ユーティリティ関数
   ============================================================ */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function zenkakuToHankaku(str) {
  return str
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[－ー−]/g, '-')
    .replace(/／/g, '/')
    .replace(/，/g, ',')
    .replace(/＝/g, '=')
    .replace(/√/g, '√');
}

function normalize(str) {
  return zenkakuToHankaku(String(str))
    .replace(/\s+/g, '')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\*\*/g, '^')
    .trim();
}

function fracHTML(n, d) {
  if (d === 1) return String(n);
  return `<span class="frac"><span class="n">${n}</span><span class="d">${d}</span></span>`;
}

function reduceFrac(n, d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return [n / g, d / g];
}

function simplifySqrt(N) {
  let p = 1,
    q = N;
  for (let i = Math.floor(Math.sqrt(N)); i >= 2; i--) {
    if (N % (i * i) === 0) {
      p = i;
      q = N / (i * i);
      break;
    }
  }
  return [p, q];
}

function sqrtFormText(coef, radical) {
  if (radical === 1) return `${coef}`;
  if (coef === 1) return `√${radical}`;
  if (coef === -1) return `-√${radical}`;
  return `${coef}√${radical}`;
}

function termsToStr(terms) {
  const filtered = terms.filter(t => t.coef !== 0);
  if (filtered.length === 0) return '0';
  return filtered
    .map((t, i) => {
      const abs = Math.abs(t.coef);
      const core =
        t.sym === '' ? `${abs}` : abs === 1 ? t.sym : `${abs}${t.sym}`;
      const sign = t.coef < 0 ? '-' : i === 0 ? '' : '+';
      return sign + core;
    })
    .join('');
}

function linStr(a, b) {
  return termsToStr([
    { coef: a, sym: 'x' },
    { coef: b, sym: '' }
  ]);
}

function polyStr(a1, a0) {
  return termsToStr([
    { coef: 1, sym: 'x^2' },
    { coef: a1, sym: 'x' },
    { coef: a0, sym: '' }
  ]);
}

// 4択問題ヘルパー
function mc(qText, choices) {
  return { type: 'choice', qHTML: qText, choices, correct: 0 };
}

function cloneShuffled(item) {
  const idxs = shuffleArray(item.choices.map((c, i) => i));
  return {
    type: 'choice',
    qHTML: item.qHTML,
    choices: idxs.map(i => item.choices[i]),
    correct: idxs.indexOf(item.correct)
  };
}
