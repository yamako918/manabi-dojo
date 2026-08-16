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
  sessionQueue: []
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
}

function goToRecords() {
  playClick();
  showScreen('records');
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

function startKnowledgeQuiz(subject, grade) {
  state.subject = subject;
  state.grade = grade;
  state.catId = subject + '_' + grade;
  state.catName = CATEGORY_LABEL[subject];
  const bank = QUESTION_BANKS[subject][grade];
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

function retrySameCategory() {
  playClick();
  if (state.subject === 'math') startQuiz(state.catId);
  else startKnowledgeQuiz(state.subject, state.grade);
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
