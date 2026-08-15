/* ============================================================
   算数・数学の問題ジェネレータ（自動生成）
   ============================================================ */

const GEN = {};

GEN.g6_frac = function() {
  let b = randInt(2, 9),
    d = randInt(2, 9);
  let a = randInt(1, b * 2),
    c = randInt(1, d * 2);
  const op = pick(['+', '-', '×', '÷']);
  let rn, rd;
  if (op === '+') {
    rn = a * d + c * b;
    rd = b * d;
  } else if (op === '-') {
    if (a * d < c * b) {
      [a, c] = [c, a];
      [b, d] = [d, b];
    }
    rn = a * d - c * b;
    rd = b * d;
  } else if (op === '×') {
    rn = a * c;
    rd = b * d;
  } else {
    rn = a * d;
    rd = b * c;
  }
  [rn, rd] = reduceFrac(rn, rd);
  const correctText = rd === 1 ? `${rn}` : `${rn}/${rd}`;
  return {
    qHTML: `${fracHTML(a, b)} ${op} ${fracHTML(c, d)} = ?`,
    correctText,
    hint: '例: 3/4 のように分数、整数は 5 のように入力',
    checker(raw) {
      const s = normalize(raw);
      let n, dd;
      if (s.includes('/')) {
        const parts = s.split('/');
        n = parseFloat(parts[0]);
        dd = parseFloat(parts[1]);
      } else {
        n = parseFloat(s);
        dd = 1;
      }
      if (isNaN(n) || isNaN(dd) || dd === 0) return false;
      return Math.abs(n * rd - rn * dd) < 1e-6;
    }
  };
};

GEN.g6_decimal = function() {
  const op = pick(['+', '-', '×']);
  let a = randInt(1, 200) / 10,
    b = randInt(1, 200) / 10;
  a = Math.round(a * 10) / 10;
  b = Math.round(b * 10) / 10;
  if (op === '-' && a < b) [a, b] = [b, a];
  let result;
  if (op === '+') result = a + b;
  else if (op === '-') result = a - b;
  else result = Math.round(a * b * 100) / 100;
  result = Math.round(result * 100) / 100;
  return {
    qHTML: `${a} ${op} ${b} = ?`,
    correctText: `${result}`,
    hint: '小数で入力してください',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && Math.abs(v - result) < 0.01;
    }
  };
};

GEN.g6_percent = function() {
  const type = pick(['a_of_b', 'b_percent_of_a', 'increase']);
  if (type === 'a_of_b') {
    const base = pick([20, 25, 40, 50, 80, 100, 200]),
      pct = randInt(1, 20) * 5,
      part = base * pct / 100;
    return {
      qHTML: `${base} の ${pct}% はいくつですか？`,
      correctText: `${part}`,
      hint: '数値のみ入力',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - part) < 0.01;
      }
    };
  } else if (type === 'b_percent_of_a') {
    const pct = randInt(1, 20) * 5,
      base = pick([20, 25, 40, 50, 80, 100]),
      part = base * pct / 100;
    return {
      qHTML: `${part} は ${base} の何%ですか？`,
      correctText: `${pct}`,
      hint: '%を除いた数値のみ入力',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - pct) < 0.5;
      }
    };
  } else {
    const base = pick([200, 300, 400, 500, 600, 800, 1000]),
      pct = randInt(1, 8) * 5,
      result = Math.round(base * (1 + pct / 100));
    return {
      qHTML: `${base}円の品物を ${pct}%値上げすると何円になりますか？`,
      correctText: `${result}`,
      hint: '円を除いた数値のみ入力',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - result) < 0.5;
      }
    };
  }
};

GEN.g6_speed = function() {
  const type = pick(['speed', 'distance', 'time']);
  const speed = randInt(2, 12) * 5,
    time = randInt(1, 6),
    distance = speed * time;
  if (type === 'speed')
    return {
      qHTML: `${distance}kmの道のりを ${time}時間 で進みました。速さは時速何kmですか？`,
      correctText: `${speed}`,
      hint: 'kmを除いた数値のみ',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - speed) < 0.1;
      }
    };
  if (type === 'distance')
    return {
      qHTML: `時速${speed}kmで ${time}時間 進むと何km進みますか？`,
      correctText: `${distance}`,
      hint: 'kmを除いた数値のみ',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - distance) < 0.1;
      }
    };
  return {
    qHTML: `時速${speed}kmで ${distance}km 進むのに何時間かかりますか？`,
    correctText: `${time}`,
    hint: '時間を除いた数値のみ',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && Math.abs(v - time) < 0.1;
    }
  };
};

GEN.g6_circle = function() {
  const r = randInt(2, 15),
    type = pick(['area', 'circumference']);
  if (type === 'area') {
    const area = Math.round(r * r * 3.14 * 100) / 100;
    return {
      qHTML: `半径 ${r}cm の円の面積は何cm²ですか？（円周率は3.14）`,
      correctText: `${area}`,
      hint: 'cm²を除いた数値のみ',
      checker(raw) {
        const v = parseFloat(normalize(raw));
        return !isNaN(v) && Math.abs(v - area) < 0.05;
      }
    };
  }
  const circ = Math.round(r * 2 * 3.14 * 100) / 100;
  return {
    qHTML: `半径 ${r}cm の円の円周は何cmですか？（円周率は3.14）`,
    correctText: `${circ}`,
    hint: 'cmを除いた数値のみ',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && Math.abs(v - circ) < 0.05;
    }
  };
};

GEN.g7_signed = function() {
  const op = pick(['+', '-', '×', '÷']);
  let a, b, result;
  if (op === '÷') {
    b = pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
    const q = (() => {
      let x;
      do {
        x = randInt(-9, 9);
      } while (x === 0);
      return x;
    })();
    a = b * q;
    result = q;
  } else {
    a = (() => {
      let x;
      do {
        x = randInt(-15, 15);
      } while (x === 0);
      return x;
    })();
    b = (() => {
      let x;
      do {
        x = randInt(-15, 15);
      } while (x === 0);
      return x;
    })();
    if (op === '+') result = a + b;
    else if (op === '-') result = a - b;
    else result = a * b;
  }
  const term = n => (n < 0 ? `(${n})` : `${n}`);
  return {
    qHTML: `${term(a)} ${op} ${term(b)} = ?`,
    correctText: `${result}`,
    hint: '負の数はそのまま「-3」のように入力',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && v === result;
    }
  };
};

GEN.g7_like_terms = function() {
  const a = randInt(-9, 9),
    b = randInt(-9, 9),
    c = randInt(-9, 9),
    d = randInt(-9, 9),
    op = pick(['+', '-']);
  const P = op === '+' ? a + c : a - c,
    Q = op === '+' ? b + d : b - d;
  const correctText = linStr(P, Q);
  return {
    qHTML: `(${linStr(a, b)}) ${op} (${linStr(c, d)}) を計算しなさい`,
    correctText,
    hint: '例: 5x+3 の形（xの項→数の項の順）',
    checker(raw) {
      return normalize(raw).toLowerCase() === normalize(correctText).toLowerCase();
    }
  };
};

GEN.g7_linear_eq = function() {
  const a = (() => {
    let x;
    do {
      x = randInt(-9, 9);
    } while (x === 0);
    return x;
  })();
  const x0 = randInt(-12, 12),
    b = randInt(-15, 15),
    c = a * x0 + b;
  return {
    qHTML: `${linStr(a, b)} = ${c} を解きなさい`,
    correctText: `x=${x0}`,
    hint: '例: x=4 のように入力',
    buttons: [{ label: 'x=', insert: 'x=' }],
    checker(raw) {
      const s = normalize(raw);
      const m = s.match(/^x=(-?\d+)$/);
      if (m) return parseInt(m[1]) === x0;
      const v = parseFloat(s);
      return !isNaN(v) && v === x0;
    }
  };
};

GEN.g7_exponent = function() {
  const SUP = { 2: '²', 3: '³' };
  const a = randInt(2, 6),
    n = pick([2, 3]),
    term1 = Math.pow(a, n);
  const b = randInt(2, 9),
    c = randInt(2, 9),
    term2 = b * c,
    op = pick(['+', '-']);
  const result = op === '+' ? term1 + term2 : term1 - term2;
  return {
    qHTML: `${a}${SUP[n]} ${op} ${b}×${c} = ?`,
    correctText: `${result}`,
    hint: '数値のみ入力',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && v === result;
    }
  };
};

GEN.g7_substitution = function() {
  const p = (() => {
    let x;
    do {
      x = randInt(-8, 8);
    } while (x === 0);
    return x;
  })();
  const q = randInt(-9, 9);
  const v = (() => {
    let x;
    do {
      x = randInt(-6, 6);
    } while (x === 0);
    return x;
  })();
  const value = p * v + q;
  return {
    qHTML: `${linStr(p, q)} で、x=${v} のときの式の値を求めなさい`,
    correctText: `${value}`,
    hint: '数値のみ入力',
    checker(raw) {
      const vv = parseFloat(normalize(raw));
      return !isNaN(vv) && vv === value;
    }
  };
};

GEN.g8_poly = function() {
  const sub = pick(['addsub2var', 'monomial_mul', 'monomial_div']);
  if (sub === 'addsub2var') {
    const a1 = randInt(-9, 9),
      b1 = randInt(-9, 9),
      a2 = randInt(-9, 9),
      b2 = randInt(-9, 9),
      op = pick(['+', '-']);
    const Rx = op === '+' ? a1 + a2 : a1 - a2,
      Ry = op === '+' ? b1 + b2 : b1 - b2;
    const correctText = termsToStr([
      { coef: Rx, sym: 'x' },
      { coef: Ry, sym: 'y' }
    ]);
    return {
      qHTML: `(${termsToStr([
        { coef: a1, sym: 'x' },
        { coef: b1, sym: 'y' }
      ])}) ${op} (${termsToStr([
        { coef: a2, sym: 'x' },
        { coef: b2, sym: 'y' }
      ])}) を計算しなさい`,
      correctText,
      hint: '例: 5x+3y の形（xの項→yの項の順）',
      checker(raw) {
        return normalize(raw).toLowerCase() === normalize(correctText).toLowerCase();
      }
    };
  } else if (sub === 'monomial_mul') {
    const coefA = randInt(2, 9),
      coefB = randInt(2, 9),
      expB = pick([1, 2]);
    const coefR = coefA * coefB,
      expR = 1 + expB;
    const correctText = `${coefR}x${expR > 1 ? '^' + expR : ''}`;
    return {
      qHTML: `${coefA}x × ${coefB}x${expB > 1 ? '^' + expB : ''} を計算しなさい`,
      correctText,
      hint: '例: 12x^2 のように入力（1乗は^をつけない）',
      checker(raw) {
        return normalize(raw) === normalize(correctText);
      }
    };
  } else {
    const divExp = pick([1, 2]),
      dividExp = divExp + pick([1, 2]);
    const divCoef = randInt(2, 6),
      quotCoef = randInt(2, 6),
      dividCoef = divCoef * quotCoef,
      quotExp = dividExp - divExp;
    const correctText = `${quotCoef}x${quotExp > 1 ? '^' + quotExp : ''}`;
    return {
      qHTML: `${dividCoef}x${dividExp > 1 ? '^' + dividExp : ''} ÷ ${divCoef}x${divExp > 1 ? '^' + divExp : ''} を計算しなさい`,
      correctText,
      hint: '例: 4x^2 のように入力（1乗は^をつけない）',
      checker(raw) {
        return normalize(raw) === normalize(correctText);
      }
    };
  }
};

GEN.g8_system = function() {
  let x0, y0, a1, b1, a2, b2;
  do {
    x0 = randInt(-8, 8);
    y0 = randInt(-8, 8);
    a1 = randInt(-5, 5);
    b1 = randInt(-5, 5);
    a2 = randInt(-5, 5);
    b2 = randInt(-5, 5);
  } while (
    a1 === 0 ||
    b1 === 0 ||
    a2 === 0 ||
    b2 === 0 ||
    a1 * b2 - a2 * b1 === 0 ||
    (x0 === 0 && y0 === 0)
  );
  const c1 = a1 * x0 + b1 * y0,
    c2 = a2 * x0 + b2 * y0;
  function eqStr(a, b, c) {
    let s = a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
    s += b > 0 ? `+${b === 1 ? 'y' : b + 'y'}` : `-${Math.abs(b) === 1 ? 'y' : Math.abs(b) + 'y'}`;
    s += `=${c}`;
    return s;
  }
  return {
    qHTML: `${eqStr(a1, b1, c1)}<br>${eqStr(a2, b2, c2)}`,
    correctText: `x=${x0}, y=${y0}`,
    hint: '例: x=2,y=-1 のように入力',
    buttons: [
      { label: 'x=', insert: 'x=' },
      { label: 'y=', insert: 'y=' },
      { label: ',', insert: ',' }
    ],
    checker(raw) {
      const s = normalize(raw);
      const mx = s.match(/x=(-?\d+)/),
        my = s.match(/y=(-?\d+)/);
      if (!mx || !my) return false;
      return parseInt(mx[1]) === x0 && parseInt(my[1]) === y0;
    }
  };
};

GEN.g8_slope = function() {
  let sn, sd;
  do {
    sn = randInt(-6, 6);
    sd = pick([1, 1, 2, 3, 4]);
  } while (sn === 0 || gcd(sn, sd) !== 1);
  const k = randInt(1, 4),
    dx = sd * k,
    dy = sn * k;
  const x1 = randInt(-6, 6),
    y1 = randInt(-10, 10),
    x2 = x1 + dx,
    y2 = y1 + dy;
  const correctText = sd === 1 ? `${sn}` : `${sn}/${sd}`;
  return {
    qHTML: `2点 (${x1}, ${y1}), (${x2}, ${y2}) を通る直線の変化の割合を求めなさい`,
    correctText,
    hint: '例: 3/4 のように分数、整数はそのまま',
    checker(raw) {
      const s = normalize(raw);
      let n, dd;
      if (s.includes('/')) {
        const parts = s.split('/');
        n = parseFloat(parts[0]);
        dd = parseFloat(parts[1]);
      } else {
        n = parseFloat(s);
        dd = 1;
      }
      if (isNaN(n) || isNaN(dd) || dd === 0) return false;
      return Math.abs(n * sd - sn * dd) < 1e-6;
    }
  };
};

GEN.g8_expand_linear = function() {
  const a = (() => {
    let x;
    do {
      x = randInt(-6, 6);
    } while (x === 0);
    return x;
  })();
  const b = randInt(-9, 9);
  const c = (() => {
    let x;
    do {
      x = randInt(-6, 6);
    } while (x === 0);
    return x;
  })();
  const d = randInt(-9, 9),
    op = pick(['+', '-']);
  const Px = op === '+' ? a + c : a - c,
    Pc = op === '+' ? a * b + c * d : a * b - c * d;
  const correctText = linStr(Px, Pc);
  return {
    qHTML: `${a}(x${b >= 0 ? '+' : ''}${b}) ${op} ${c}(x${d >= 0 ? '+' : ''}${d}) を計算しなさい`,
    correctText,
    hint: '例: x+8 の形',
    checker(raw) {
      return normalize(raw).toLowerCase() === normalize(correctText).toLowerCase();
    }
  };
};

GEN.g8_substitution = function() {
  const p = (() => {
    let x;
    do {
      x = randInt(-6, 6);
    } while (x === 0);
    return x;
  })();
  const q = (() => {
    let x;
    do {
      x = randInt(-6, 6);
    } while (x === 0);
    return x;
  })();
  const r = randInt(-9, 9),
    xv = randInt(-5, 5),
    yv = randInt(-5, 5);
  const value = p * xv + q * yv + r;
  const exprText = termsToStr([
    { coef: p, sym: 'x' },
    { coef: q, sym: 'y' },
    { coef: r, sym: '' }
  ]);
  return {
    qHTML: `${exprText} で、x=${xv}, y=${yv} のときの式の値を求めなさい`,
    correctText: `${value}`,
    hint: '数値のみ入力',
    checker(raw) {
      const v = parseFloat(normalize(raw));
      return !isNaN(v) && v === value;
    }
  };
};

GEN.g9_sqrt = function() {
  const sub = pick(['simplify', 'addsub', 'multiply']);
  const SQFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];
  if (sub === 'simplify') {
    const q = pick(SQFREE),
      p = randInt(2, 6),
      N = p * p * q;
    return {
      qHTML: `√${N} を簡単にしなさい`,
      correctText: sqrtFormText(p, q),
      hint: '例: 3√2 (√ボタンで√を入力)',
      buttons: [{ label: '√', insert: '√' }],
      checker(raw) {
        const s = normalize(raw);
        const m = s.match(/^(-?\d*)√(\d+)$/);
        if (!m) {
          const v = parseFloat(s);
          return !isNaN(v) && q === 1 && v === p;
        }
        const coef = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseInt(m[1]);
        return coef === p && parseInt(m[2]) === q;
      }
    };
  } else if (sub === 'addsub') {
    const k = pick(SQFREE),
      a = randInt(2, 9),
      b = randInt(1, a - 1),
      op = pick(['+', '-']);
    const c = op === '+' ? a + b : a - b;
    return {
      qHTML: `${a}√${k} ${op} ${b}√${k} を計算しなさい`,
      correctText: sqrtFormText(c, k),
      hint: '例: 5√2 (√ボタンで√を入力)',
      buttons: [{ label: '√', insert: '√' }],
      checker(raw) {
        const s = normalize(raw);
        const m = s.match(/^(-?\d*)√(\d+)$/);
        if (!m) {
          const v = parseFloat(s);
          return !isNaN(v) && k === 1 && v === c;
        }
        const coef = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseInt(m[1]);
        return coef === c && parseInt(m[2]) === k;
      }
    };
  } else {
    const a = randInt(2, 10),
      b = randInt(2, 10),
      N = a * b;
    const [p, q] = simplifySqrt(N);
    return {
      qHTML: `√${a} × √${b} を計算しなさい`,
      correctText: sqrtFormText(p, q),
      hint: '例: 2√6、整数なら整数のみ (√ボタンで√を入力)',
      buttons: [{ label: '√', insert: '√' }],
      checker(raw) {
        const s = normalize(raw);
        const m = s.match(/^(-?\d*)√(\d+)$/);
        if (!m) {
          const v = parseFloat(s);
          return !isNaN(v) && q === 1 && v === p;
        }
        const coef = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseInt(m[1]);
        return coef === p && parseInt(m[2]) === q;
      }
    };
  }
};

GEN.g9_expand = function() {
  const type = pick(['general', 'square', 'diffsq']);
  let a, b, B, C, qHTML;
  if (type === 'general') {
    a = randInt(-9, 9);
    if (a === 0) a = randInt(1, 9);
    do {
      b = randInt(-9, 9);
    } while (b === 0);
    B = a + b;
    C = a * b;
    qHTML = `(x${a >= 0 ? '+' : ''}${a})(x${b >= 0 ? '+' : ''}${b}) を展開しなさい`;
  } else if (type === 'square') {
    do {
      a = randInt(-9, 9);
    } while (a === 0);
    B = 2 * a;
    C = a * a;
    qHTML = `(x${a >= 0 ? '+' : ''}${a})² を展開しなさい`;
  } else {
    a = randInt(2, 9);
    B = 0;
    C = -(a * a);
    qHTML = `(x+${a})(x-${a}) を展開しなさい`;
  }
  const correctText = polyStr(B, C);
  return {
    qHTML,
    correctText,
    hint: '例: x^2+5x+6 の形（^2はそのまま入力）',
    checker(raw) {
      return normalize(raw).toLowerCase() === normalize(correctText).toLowerCase();
    }
  };
};

GEN.g9_factor = function() {
  let p, q;
  do {
    p = randInt(-9, 9);
    q = randInt(-9, 9);
  } while (p === 0 || q === 0 || p === q);
  const B = p + q,
    C = p * q;
  const correctText = `(x${p >= 0 ? '+' : ''}${p})(x${q >= 0 ? '+' : ''}${q})`;
  return {
    qHTML: `${polyStr(B, C)} を因数分解しなさい`,
    correctText,
    hint: '例: (x+2)(x-3) の形',
    checker(raw) {
      const s = normalize(raw);
      const m = s.match(/^\(x([+-]\d+)\)\(x([+-]\d+)\)$/);
      if (!m) return false;
      const n1 = parseInt(m[1]),
        n2 = parseInt(m[2]);
      return (n1 === p && n2 === q) || (n1 === q && n2 === p);
    }
  };
};

GEN.g9_quadratic = function() {
  let r1, r2;
  do {
    r1 = randInt(-9, 9);
    r2 = randInt(-9, 9);
  } while (r1 === 0 && r2 === 0);
  const B = -(r1 + r2),
    C = r1 * r2;
  return {
    qHTML: `${polyStr(B, C)} = 0 を解きなさい`,
    correctText: `x=${r1},${r2}`,
    hint: '例: x=2,3 のように入力（順不同）',
    buttons: [
      { label: 'x=', insert: 'x=' },
      { label: ',', insert: ',' }
    ],
    checker(raw) {
      const s = normalize(raw);
      const nums = (s.match(/-?\d+/g) || []).map(Number);
      if (nums.length !== 2) return false;
      const got = nums.slice().sort((a, b) => a - b),
        exp = [r1, r2].slice().sort((a, b) => a - b);
      return got[0] === exp[0] && got[1] === exp[1];
    }
  };
};

GEN.g9_system = GEN.g8_system;

const CATEGORIES = {
  g6: [
    { id: 'g6_frac', name: '分数の計算', desc: 'たし算・ひき算・かけ算・わり算', gen: GEN.g6_frac },
    { id: 'g6_decimal', name: '小数の計算', desc: 'たし算・ひき算・かけ算', gen: GEN.g6_decimal },
    { id: 'g6_percent', name: '割合の計算', desc: '○%はいくつ、何%かを求める', gen: GEN.g6_percent },
    { id: 'g6_speed', name: '速さの計算', desc: '速さ・時間・道のり', gen: GEN.g6_speed },
    { id: 'g6_circle', name: '円の面積・円周', desc: '円周率3.14を使った計算', gen: GEN.g6_circle }
  ],
  g7: [
    { id: 'g7_signed', name: '正負の数の計算', desc: 'たし算・ひき算・かけ算・わり算', gen: GEN.g7_signed },
    { id: 'g7_like_terms', name: '文字式の計算', desc: '同類項をまとめる', gen: GEN.g7_like_terms },
    { id: 'g7_linear_eq', name: '一次方程式', desc: 'xの値を求める', gen: GEN.g7_linear_eq },
    { id: 'g7_exponent', name: '累乗の計算', desc: '指数を含む四則計算', gen: GEN.g7_exponent },
    { id: 'g7_substitution', name: '式の値', desc: 'xに数を代入する', gen: GEN.g7_substitution }
  ],
  g8: [
    { id: 'g8_poly', name: '式の計算', desc: '多項式の加減・単項式の乗除', gen: GEN.g8_poly },
    { id: 'g8_system', name: '連立方程式', desc: 'x, yの値を求める', gen: GEN.g8_system },
    { id: 'g8_slope', name: '変化の割合', desc: '一次関数の傾きを求める', gen: GEN.g8_slope },
    { id: 'g8_expand_linear', name: '分配法則の計算', desc: 'かっこをはずして整理する', gen: GEN.g8_expand_linear },
    { id: 'g8_substitution', name: '式の値', desc: 'x, yに数を代入する', gen: GEN.g8_substitution }
  ],
  g9: [
    { id: 'g9_sqrt', name: '平方根の計算', desc: '簡単化・加減・乗法', gen: GEN.g9_sqrt },
    { id: 'g9_expand', name: '式の展開', desc: '乗法公式を使った展開', gen: GEN.g9_expand },
    { id: 'g9_factor', name: '因数分解', desc: 'x²+bx+c の因数分解', gen: GEN.g9_factor },
    { id: 'g9_quadratic', name: '二次方程式', desc: '因数分解を使って解く', gen: GEN.g9_quadratic },
    { id: 'g9_system', name: '連立方程式', desc: 'x, yの値を求める', gen: GEN.g9_system }
  ]
};
