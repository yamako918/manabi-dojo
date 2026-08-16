/* ============================================================
   UI制御・状態管理
   ============================================================ */

let state = {
  profile: null,
  subject: null,
  grade: null,
  catId: null,
  catName: null,
  qIndex: 0,
  total: 10,
  correctCount: 0,
  current: null,
  startTime: 0,
  timerHandle: null,
  locked: false,
  mode: 'normal',
  missed: [],
  reviewQueue: [],
  sessionQueue: [],
  activeBank: []
};

/* ---------- プロフィール管理 ---------- */
function getProfiles() {
  try {
    return JSON.parse(localStorage.getItem('kd-profiles') || '[]');
  } catch (e) {
    return [];
  }
}

function saveProfiles(list) {
  localStorage.setItem('kd-profiles', JSON.stringify(list));
}

function renderProfileList() {
  const wrap = document.getElementById('profileList');
  wrap.innerHTML = '';
  const profiles = getProfiles();
  if (profiles.length === 0) {
    const p = document.createElement('div');
    p.className = 'profile-empty';
    p.textContent = 'まだプロフィールがありません。下のボタンから作成してください。';
    wrap.appendChild(p);
    return;
  }
  profiles.forEach(name => {
    const div = document.createElement('div');
    div.className = 'cat-card';
    const body = document.createElement('div');
    body.className = 'cat-body';
    body.style.cursor = 'pointer';
    const h3 = document.createElement('h3');
    h3.textContent = name;
    const span = document.createElement('span');
    span.textContent = lastPlayedSummary(name);
    body.appendChild(h3);
    body.appendChild(span);
    body.onclick = () => selectProfile(name);
    const del = document.createElement('button');
    del.className = 'profile-delete';
    del.textContent = '✕';
    del.title = '削除';
    del.onclick = e => {
      e.stopPropagation();
      deleteProfile(name);
    };
    div.appendChild(body);
    div.appendChild(del);
    wrap.appendChild(div);
  });
}

function lastPlayedSummary(name) {
  const raw = localStorage.getItem(`kd-last-record-${name}`);
  if (!raw) return 'まだ記録がありません';
  try {
    const r = JSON.parse(raw);
    return `前回: ${r.date}　${r.correct}/${r.total}問正解`;
  } catch (e) {
    return '';
  }
}

function toggleAddProfile() {
  playClick();
  const row = document.getElementById('addProfileRow');
  const willShow = row.style.display === 'none';
  row.style.display = willShow ? 'flex' : 'none';
  if (willShow) document.getElementById('newProfileName').focus();
}

function createProfile() {
  const input = document.getElementById('newProfileName');
  const name = input.value.trim();
  if (!name) return;
  const profiles = getProfiles();
  if (profiles.includes(name)) {
    alert('同じ名前のプロフィールがすでにあります。別の名前にしてください。');
    return;
  }
  if (profiles.length >= 8) {
    alert('プロフィールは最大8人まで作成できます。');
    return;
  }
  playClick();
  profiles.push(name);
  saveProfiles(profiles);
  input.value = '';
  document.getElementById('addProfileRow').style.display = 'none';
  selectProfile(name);
}

function deleteProfile(name) {
  if (!confirm(`「${name}」のプロフィールを削除しますか？記録もすべて消えます。`))
    return;
  playClick();
  saveProfiles(getProfiles().filter(n => n !== name));
  localStorage.removeItem(`kd-last-record-${name}`);
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith(`kd-best-${name}-`) || k.startsWith(`kd-stats-${name}-`)) localStorage.removeItem(k);
  });
  renderProfileList();
}

function selectProfile(name) {
  playClick();
  state.profile = name;
  showScreen('subjects');
}

/* ---------- 画面制御 ---------- */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  if (name === 'profile') renderProfileList();
  if (name === 'subjects') {
    document.getElementById('profileWelcome').textContent = state.profile || '';
    renderLastRecord();
  }
  if (name === 'records') renderRecords();
  if (name === 'achievement') renderAchievement();
}

function goToRecords() {
  playClick();
  showScreen('records');
}

function goToAchievement() {
  playClick();
  showScreen('achievement');
}

/* ---------- 単元ごとの記録一覧 ---------- */
const SUBJECT_ORDER = ['math', 'kokugo', 'science', 'social', 'english'];
const GRADE_ORDER = ['g6', 'g7', 'g8', 'g9'];

function getAllCatDefs() {
  const defs = [];
  SUBJECT_ORDER.forEach(subject => {
    GRADE_ORDER.forEach(grade => {
      if (subject === 'math') {
        CATEGORIES[grade].forEach(cat => {
          defs.push({ subject, grade, catId: cat.id, catName: cat.name });
        });
      } else if (subject === 'kokugo') {
        KOKUGO_CATEGORIES[grade].forEach(cat => {
          defs.push({ subject, grade, catId: cat.id, catName: cat.name });
        });
      } else {
        defs.push({ subject, grade, catId: `${subject}_${grade}`, catName: CATEGORY_LABEL[subject] });
      }
    });
  });
  return defs;
}

function renderRecords() {
  const wrap = document.getElementById('recordsList');
  wrap.innerHTML = '';
  if (!state.profile) return;

  const defs = getAllCatDefs();
  let totalAttempted = 0, totalCorrect = 0, anyData = false;

  SUBJECT_ORDER.forEach(subject => {
    const subjectDefs = defs.filter(d => d.subject === subject);
    const rows = [];

    GRADE_ORDER.forEach(grade => {
      subjectDefs.filter(d => d.grade === grade).forEach(d => {
        const raw = localStorage.getItem(`kd-stats-${state.profile}-${d.catId}`);
        if (!raw) return;
        let stats;
        try { stats = JSON.parse(raw); } catch (e) { return; }
        if (!stats || !stats.attempted) return;

        anyData = true;
        totalAttempted += stats.attempted;
        totalCorrect += stats.correct;
        const bestIdx = parseInt(localStorage.getItem(`kd-best-${state.profile}-${d.catId}`) || '-1');

        rows.push({ grade, catName: d.catName, stats, bestIdx });
      });
    });

    if (rows.length === 0) return;

    const section = document.createElement('div');
    section.className = 'record-section';
    const heading = document.createElement('div');
    heading.className = 'record-subject-heading';
    heading.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
    heading.textContent = SUBJECT_LABEL[subject];
    section.appendChild(heading);

    rows.forEach(r => {
      const rate = Math.round((r.stats.correct / r.stats.attempted) * 100);
      const row = document.createElement('div');
      row.className = 'cat-card record-row';
      row.innerHTML = `
        <div class="cat-body">
          <h3>${GRADE_LABEL[r.grade]}　${r.catName}</h3>
          <span>累計 ${r.stats.correct} / ${r.stats.attempted} 問正解（正答率 ${rate}%）・挑戦回数 ${r.stats.sessions}回</span>
        </div>
        ${r.bestIdx >= 0 ? `<div class="cat-rank">${RANKS[r.bestIdx]}</div>` : ''}
      `;
      section.appendChild(row);
    });

    wrap.appendChild(section);
  });

  const summary = document.getElementById('recordsSummary');
  if (!anyData) {
    summary.textContent = 'まだ記録がありません。教科を選んでクイズに挑戦してみましょう。';
  } else {
    const rate = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    summary.textContent = `全体：累計 ${totalCorrect} / ${totalAttempted} 問正解（正答率 ${rate}%）`;
  }
}

/* ---------- 学年別・科目横断の達成率（五角形レーダーチャート） ---------- */
// 達成率の定義: その科目・学年の単元総数を分母、段位が三段（＝過去に10問全問正解）
// に達した単元の数を分子とする。
const GRADE_ACCENT = { g6: '#3F7A56', g7: '#2E6B8A', g8: '#B0722D', g9: '#1F3A5F' };
const RADAR_SUBJECT_ORDER = ['math', 'kokugo', 'science', 'social', 'english'];
const RADAR_SUBJECT_SHORT = { math: '算', kokugo: '国', science: '理', social: '社', english: '英' };
const PERFECT_RANK_IDX = RANKS.length - 1; // 三段（10/10）

function computeGradeAchievement(profile, grade) {
  const defs = getAllCatDefs().filter(d => d.grade === grade);
  const bySubject = {};
  RADAR_SUBJECT_ORDER.forEach(s => { bySubject[s] = { total: 0, perfect: 0 }; });

  defs.forEach(d => {
    const bucket = bySubject[d.subject];
    bucket.total += 1;
    const bestIdx = parseInt(localStorage.getItem(`kd-best-${profile}-${d.catId}`) || '-1');
    if (bestIdx === PERFECT_RANK_IDX) bucket.perfect += 1;
  });

  const rates = RADAR_SUBJECT_ORDER.map(s => (bySubject[s].total > 0 ? bySubject[s].perfect / bySubject[s].total : 0));
  const totalUnits = RADAR_SUBJECT_ORDER.reduce((sum, s) => sum + bySubject[s].total, 0);
  const totalPerfect = RADAR_SUBJECT_ORDER.reduce((sum, s) => sum + bySubject[s].perfect, 0);

  return { bySubject, rates, totalUnits, totalPerfect };
}

// rates: [算,国,理,社,英] の順で 0〜1 の配列
function buildRadarSVG(rates, accentColor) {
  const size = 220;
  const cx = size / 2;
  const cy = 112;
  const R = 72;
  const N = 5;

  function pt(fracRadius, i) {
    const angle = -Math.PI / 2 + i * ((2 * Math.PI) / N);
    return [cx + R * fracRadius * Math.cos(angle), cy + R * fracRadius * Math.sin(angle)];
  }
  function pointsAttr(fracRadius) {
    return Array.from({ length: N }, (_, i) => pt(fracRadius, i).join(',')).join(' ');
  }

  // 目安の五角形（25/50/75/100%）
  const guideRings = [0.25, 0.5, 0.75, 1]
    .map(f => `<polygon points="${pointsAttr(f)}" fill="none" stroke="rgba(31,58,95,0.15)" stroke-width="1"/>`)
    .join('');

  // 中心から各頂点への軸線
  const axisLines = Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(1, i);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(31,58,95,0.15)" stroke-width="1"/>`;
  }).join('');

  // 実績（データ）ポリゴン
  const dataPoints = rates.map((r, i) => pt(Math.max(r, 0.03), i)); // 0%でも中心の点で潰れないよう最低限の見た目を確保
  const dataPointsAttr = dataPoints.map(p => p.join(',')).join(' ');
  const dataDots = dataPoints
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${accentColor}"/>`)
    .join('');

  // ラベル（科目の頭文字、科目カラーで着色）
  const labels = Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(1.22, i);
    const subject = RADAR_SUBJECT_ORDER[i];
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
      font-size="13" font-weight="700" fill="${SUBJECT_STRIPE[subject]}">${RADAR_SUBJECT_SHORT[subject]}</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${size} ${size - 10}" width="100%" style="max-width:240px;">
      ${guideRings}
      ${axisLines}
      <polygon points="${dataPointsAttr}" fill="${accentColor}" fill-opacity="0.32" stroke="${accentColor}" stroke-width="2.2" stroke-linejoin="round"/>
      ${dataDots}
      ${labels}
    </svg>
  `;
}

function renderAchievement() {
  const wrap = document.getElementById('achievementGrid');
  wrap.innerHTML = '';
  if (!state.profile) return;

  GRADE_ORDER.forEach(grade => {
    const { bySubject, rates, totalUnits, totalPerfect } = computeGradeAchievement(state.profile, grade);
    const accent = GRADE_ACCENT[grade];
    const overallPct = totalUnits > 0 ? Math.round((totalPerfect / totalUnits) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'achievement-card';

    const heading = document.createElement('h3');
    heading.textContent = `${GRADE_LABEL[grade]}`;
    card.appendChild(heading);

    const totalLine = document.createElement('div');
    totalLine.className = 'achievement-total';
    totalLine.textContent = `総合達成率 ${totalPerfect} / ${totalUnits} 単元（${overallPct}%）`;
    card.appendChild(totalLine);

    const chartWrap = document.createElement('div');
    chartWrap.innerHTML = buildRadarSVG(rates, accent);
    card.appendChild(chartWrap);

    const chips = document.createElement('div');
    chips.className = 'achievement-chips';
    RADAR_SUBJECT_ORDER.forEach(subject => {
      const b = bySubject[subject];
      const pct = b.total > 0 ? Math.round((b.perfect / b.total) * 100) : 0;
      const chip = document.createElement('div');
      chip.className = 'achievement-chip';
      chip.innerHTML = `<span class="dot" style="background:${SUBJECT_STRIPE[subject]}"></span>${SUBJECT_LABEL[subject]} ${b.perfect}/${b.total}（${pct}%）`;
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    wrap.appendChild(card);
  });
}

function selectSubject(subject) {
  playClick();
  state.subject = subject;
  renderGradeList(subject);
  showScreen('grade');
}

function renderGradeList(subject) {
  const list = document.getElementById('gradeList');
  list.innerHTML = '';
  ['g6', 'g7', 'g8', 'g9'].forEach(g => {
    const div = document.createElement('div');
    div.className = 'grade-card';
    div.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
    div.onclick = () => onGradeChosen(subject, g);
    div.innerHTML = `
      <div class="kanji">${GRADE_KANJI[g]}</div>
      <h2>${GRADE_LABEL[g]}${subject === 'math' ? 'コース' : ''}</h2>
      <p>${GRADE_DESC[subject][g]}</p>
    `;
    list.appendChild(div);
  });
}

function onGradeChosen(subject, grade) {
  playClick();
  state.subject = subject;
  state.grade = grade;
  if (subject === 'math') {
    renderCategoryList();
    showScreen('level');
  } else if (subject === 'kokugo') {
    renderKokugoCategoryList();
    showScreen('level');
  } else {
    startKnowledgeQuiz(subject, grade);
  }
}

function renderCategoryList() {
  const list = document.getElementById('catList');
  list.innerHTML = '';
  CATEGORIES[state.grade].forEach((cat, idx) => {
    const bestIdx = parseInt(localStorage.getItem(`kd-best-${state.profile}-${cat.id}`) || '-1');
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => {
      playClick();
      startQuiz(cat.id);
    };
    div.innerHTML = `
      <div class="cat-num">${String(idx + 1).padStart(2, '0')}</div>
      <div class="cat-body">
        <h3>${cat.name}</h3>
        <span>${cat.desc}</span>
      </div>
      ${bestIdx >= 0 ? `<div class="cat-rank">${RANKS[bestIdx]}</div>` : ''}
    `;
    list.appendChild(div);
  });
}

function renderKokugoCategoryList() {
  const list = document.getElementById('catList');
  list.innerHTML = '';
  KOKUGO_CATEGORIES[state.grade].forEach((cat, idx) => {
    const bestIdx = parseInt(localStorage.getItem(`kd-best-${state.profile}-${cat.id}`) || '-1');
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => {
      playClick();
      startKokugoCategoryQuiz(cat);
    };
    div.innerHTML = `
      <div class="cat-num">${String(idx + 1).padStart(2, '0')}</div>
      <div class="cat-body">
        <h3>${cat.name}</h3>
        <span>${cat.desc}</span>
      </div>
      ${bestIdx >= 0 ? `<div class="cat-rank">${RANKS[bestIdx]}</div>` : ''}
    `;
    list.appendChild(div);
  });
}

function startQuiz(catId) {
  const cat = CATEGORIES[state.grade].find(c => c.id === catId);
  state.subject = 'math';
  state.catId = catId;
  state.catName = cat.name;
  state.qIndex = 0;
  state.correctCount = 0;
  state.total = 10;
  state.mode = 'normal';
  state.missed = [];
  state.reviewQueue = [];
  state.sessionQueue = [];
  document.getElementById('qReviewBadge').style.display = 'none';
  showScreen('quiz');
  nextQuestion();
  startTimer();
}

// 「単元固定の問題プールから10問サンプリングして出題する」系のクイズ共通処理。
// 国語の追加単元（ことわざ・四字熟語・故事成語）と、
// 理科・社会・英語（学年ごとに単元1つ）の両方から使う。
function startBankQuiz(catId, catName, bank) {
  state.catId = catId;
  state.catName = catName;
  state.activeBank = bank;
  const picked = shuffleArray(bank).slice(0, Math.min(10, bank.length));
  state.sessionQueue = picked.map(cloneShuffled);
  state.mode = 'normal';
  state.qIndex = 0;
  state.correctCount = 0;
  state.total = state.sessionQueue.length;
  state.missed = [];
  state.reviewQueue = [];
  document.getElementById('qReviewBadge').style.display = 'none';
  showScreen('quiz');
  nextQuestion();
  startTimer();
}

function startKnowledgeQuiz(subject, grade) {
  state.subject = subject;
  state.grade = grade;
  startBankQuiz(`${subject}_${grade}`, CATEGORY_LABEL[subject], QUESTION_BANKS[subject][grade]);
}

function startKokugoCategoryQuiz(cat) {
  state.subject = 'kokugo';
  startBankQuiz(cat.id, cat.name, cat.bank);
}

function retrySameCategory() {
  playClick();
  if (state.subject === 'math') startQuiz(state.catId);
  else startBankQuiz(state.catId, state.catName, state.activeBank);
}

function reviewMissed() {
  playClick();
  state.reviewQueue = state.missed.slice();
  state.missed = [];
  state.mode = 'review';
  state.qIndex = 0;
  state.correctCount = 0;
  state.total = state.reviewQueue.length;
  document.getElementById('qReviewBadge').style.display = 'inline';
  showScreen('quiz');
  nextQuestion();
  startTimer();
}

function startTimer() {
  clearInterval(state.timerHandle);
  state.startTime = Date.now();
  state.timerHandle = setInterval(() => {
    const sec = Math.floor((Date.now() - state.startTime) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    document.getElementById('qTimer').textContent = `${m}:${s}`;
  }, 1000);
}

function currentCatDef() {
  return CATEGORIES[state.grade].find(c => c.id === state.catId);
}

function nextQuestion() {
  state.locked = false;
  if (state.qIndex >= state.total) {
    finishQuiz();
    return;
  }

  let q;
  if (state.subject === 'math' && state.mode === 'normal') {
    q = currentCatDef().gen();
    q.type = 'text';
  } else if (state.mode === 'review') {
    q = state.reviewQueue[state.qIndex];
  } else {
    q = state.sessionQueue[state.qIndex];
  }
  state.current = q;

  document.getElementById('qCatLabel').textContent = state.catName;
  document.getElementById('qText').innerHTML = q.qHTML;
  document.getElementById('qCounter').textContent = `第${state.qIndex + 1}問 / ${state.total}`;
  document.getElementById('qProgressFill').style.width = `${(state.qIndex / state.total) * 100}%`;
  document.getElementById('feedbackText').innerHTML =
    q.type !== 'choice' && q.hint ? `<span>${q.hint}</span>` : '';

  const answerRow = document.querySelector('.answer-row');
  const helperBtns = document.getElementById('helperBtns');
  const choiceGrid = document.getElementById('choiceGrid');
  const input = document.getElementById('answerInput');

  if (q.type === 'choice') {
    answerRow.style.display = 'none';
    helperBtns.style.display = 'none';
    choiceGrid.style.display = 'flex';
    choiceGrid.innerHTML = '';
    q.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = c;
      b.onclick = () => submitChoice(i);
      choiceGrid.appendChild(b);
    });
  } else {
    choiceGrid.style.display = 'none';
    answerRow.style.display = 'flex';
    helperBtns.style.display = 'flex';
    input.value = '';
    input.focus();
    helperBtns.innerHTML = '';
    (q.buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.onclick = () => {
        playClick();
        input.value += b.insert;
        input.focus();
      };
      helperBtns.appendChild(btn);
    });
  }
}

function submitAnswer() {
  if (state.locked) return;
  const input = document.getElementById('answerInput');
  const raw = input.value.trim();
  if (raw === '') return;
  state.locked = true;
  playClick();
  const ok = state.current.checker(raw);
  handleResult(ok);
}

function submitChoice(idx) {
  if (state.locked) return;
  state.locked = true;
  playClick();
  const ok = idx === state.current.correct;
  handleResult(ok);
}

function handleResult(ok) {
  if (ok) state.correctCount++;
  else state.missed.push(state.current);
  showMark(ok);
  playResultSound(ok);
  const correctDisplay =
    state.current.type === 'choice' ? state.current.choices[state.current.correct] : state.current.correctText;
  const fb = document.getElementById('feedbackText');
  fb.innerHTML = ok
    ? `<span style="color:var(--green); font-weight:700;">せいかい！</span>`
    : `正解は <b>${correctDisplay}</b> でした`;
  state.qIndex++;
  setTimeout(nextQuestion, ok ? 700 : 1600);
}

document.getElementById('answerInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAnswer();
});

function showMark(ok) {
  const overlay = document.createElement('div');
  overlay.className = 'mark-overlay';
  overlay.innerHTML = ok
    ? `<svg viewBox="0 0 120 120"><circle class="mark-circle" cx="60" cy="60" r="46"/></svg>`
    : `<svg viewBox="0 0 120 120" class="mark-cross"><line x1="30" y1="30" x2="90" y2="90"/><line x1="90" y1="30" x2="30" y2="90"/></svg>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 700);
}

function finishQuiz() {
  clearInterval(state.timerHandle);
  const rankIdx = state.correctCount;
  const isReview = state.mode === 'review';
  const isPerfect = state.total > 0 && state.correctCount === state.total;

  if (isPerfect) playFanfare();

  if (!isReview) {
    const prevBest = parseInt(localStorage.getItem(`kd-best-${state.profile}-${state.catId}`) || '-1');
    if (rankIdx > prevBest) localStorage.setItem(`kd-best-${state.profile}-${state.catId}`, rankIdx);

    // 単元ごとの累計正解数・挑戦数を記録
    const statsKey = `kd-stats-${state.profile}-${state.catId}`;
    let stats;
    try {
      stats = JSON.parse(localStorage.getItem(statsKey)) || { attempted: 0, correct: 0, sessions: 0 };
    } catch (e) {
      stats = { attempted: 0, correct: 0, sessions: 0 };
    }
    stats.attempted = (stats.attempted || 0) + state.total;
    stats.correct = (stats.correct || 0) + state.correctCount;
    stats.sessions = (stats.sessions || 0) + 1;
    localStorage.setItem(statsKey, JSON.stringify(stats));
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  localStorage.setItem(
    `kd-last-record-${state.profile}`,
    JSON.stringify({
      date: dateStr,
      grade: GRADE_LABEL[state.grade],
      category: `${SUBJECT_LABEL[state.subject]}「${state.catName}」`,
      correct: state.correctCount,
      total: state.total,
      review: isReview
    })
  );

  document.getElementById('certEyebrow').textContent = isReview ? 'REVIEW COMPLETE' : 'CERTIFICATE OF ACHIEVEMENT';
  document.getElementById('certTitle').textContent = isReview ? '復習けっか' : '認定証';
  document.getElementById('certName').textContent = state.profile;
  document.getElementById('certRank').textContent = isReview ? `${state.correctCount}/${state.total} 正解` : RANKS[rankIdx];
  document.getElementById('certMeta').innerHTML = `${SUBJECT_LABEL[state.subject]}　${GRADE_LABEL[state.grade]}「${state.catName}」${isReview ? '（復習）' : ''}<br>${state.correctCount} / ${state.total} 問正解<br>${dateStr}`;

  const reviewBtn = document.getElementById('reviewBtn');
  if (state.missed.length > 0) {
    reviewBtn.style.display = 'block';
    reviewBtn.textContent = `まちがえた問題を復習する（${state.missed.length}問）`;
  } else {
    reviewBtn.style.display = 'none';
  }

  showScreen('result');
}

function renderLastRecord() {
  const box = document.getElementById('lastRecord');
  if (!state.profile) {
    box.style.display = 'none';
    return;
  }
  const raw = localStorage.getItem(`kd-last-record-${state.profile}`);
  if (!raw) {
    box.style.display = 'none';
    return;
  }
  try {
    const r = JSON.parse(raw);
    box.style.display = 'block';
    box.innerHTML = `前回の記録：<b>${r.date}</b>　${r.grade}　${r.category}${r.review ? '（復習）' : ''}　<b>${r.correct}/${r.total}</b>問正解`;
  } catch (e) {
    box.style.display = 'none';
  }
}

/* ---------- 初期化 ---------- */
renderProfileList();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
