/* ============================================================
   文明の塔（Tower of Civilization）
   ・全5階、各階20問。学年別に出題する。
     1階:小6 → 2階:中1 → 3階:中2 → 4階:中3 → 5階:中学すべて（中1〜3混在）
   ・難易度＝各階で許容されるミス回数（ライフ制）
     ソロ:0回／魔法のお守り:2回／制限なし:∞
   ・「三段マスター」バッジ（perfect_15）取得で「場外へ」ボタンが解禁される。
   ・記録（kd-stats-系／kd-best-系）や達成率レーダーには一切影響しない
     （state.mode='tower' は finishQuiz() の isScored 判定を通らないため）。
   ・非数学の出題には元カテゴリ（_origCatId/_origCatName）を付与し、
     既存の弱点リスト・復習モードにそのまま統合される。
   ============================================================ */

const TOWER_TOTAL_FLOORS = 5;
const TOWER_QUESTIONS_PER_FLOOR = 20;

// 階ごとの出題学年（questions.js/generator.js/expansion*.js のグレードキーと共通）
const TOWER_FLOOR_GRADES = [
  ['g6'],
  ['g7'],
  ['g8'],
  ['g9'],
  ['g7', 'g8', 'g9'],
];
const TOWER_FLOOR_LABEL = [GRADE_LABEL.g6, GRADE_LABEL.g7, GRADE_LABEL.g8, GRADE_LABEL.g9, '中学生すべて'];

const TOWER_DIFFICULTY = {
  solo: { label: '完璧主義', maxMisses: 0, desc: '1問でも間違えると塔から追い出される' },
  amulet: { label: '魔法のお守り', maxMisses: 2, desc: '各階で2問まで間違えても次の階へ進める（3問目の失敗で追い出される）' },
  unlimited: { label: '鋼のメンタル', maxMisses: Infinity, desc: '何問間違えても次の階へ進める' },
};

const TOWER_UNLOCK_BADGE_ID = 'perfect_15'; // 三段マスター
const TOWER_SUBJECT_KANJI = { math: '算', kokugo: '国', science: '理', social: '社', english: '英' };

function isTowerUnlocked(profile) {
  return loadBadges(profile).includes(TOWER_UNLOCK_BADGE_ID);
}

/* ---------- 進捗の永続化 ---------- */
function loadTowerProgress(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-tower-${profile}`)) || {};
  } catch (e) {
    return {};
  }
}
function saveTowerProgress(profile, data) {
  localStorage.setItem(`kd-tower-${profile}`, JSON.stringify(data));
}
function getTowerSubjectProgress(profile, subject) {
  const all = loadTowerProgress(profile);
  return all[subject] || { bestFloor: 0, clearedDifficulties: [] };
}

/* ---------- 出題プール構築 ---------- */
function buildTowerMathPool(grades) {
  const pool = [];
  grades.forEach(g => CATEGORIES[g].forEach(cat => pool.push(cat)));
  return pool;
}

function buildTowerNonMathPool(subject, grades) {
  const cats = NONMATH_CATEGORIES[subject]();
  const pool = [];
  grades.forEach(g => {
    cats[g].forEach(cat => {
      cat.bank.forEach(q => {
        // 弱点リスト連携のため、出典カテゴリを問題に持たせておく
        pool.push({ ...q, _origCatId: cat.id, _origCatName: cat.name });
      });
    });
  });
  return pool;
}

// cloneShuffled（utils.js）は選択肢の並びをシャッフルするが、
// _origCatId/_origCatName を落としてしまうため、それらを維持する版を用意する
function cloneShuffledTagged(item) {
  const c = cloneShuffled(item);
  c._origCatId = item._origCatId;
  c._origCatName = item._origCatName;
  return c;
}

function buildTowerFloorQuestions(subject, floorIdx) {
  const grades = TOWER_FLOOR_GRADES[floorIdx - 1];
  if (subject === 'math') {
    const catPool = buildTowerMathPool(grades);
    const qs = [];
    for (let i = 0; i < TOWER_QUESTIONS_PER_FLOOR; i++) {
      const q = pick(catPool).gen();
      q.type = 'text';
      qs.push(q);
    }
    return qs;
  }
  const bankPool = buildTowerNonMathPool(subject, grades);
  const picked = shuffleArray(bankPool).slice(0, Math.min(TOWER_QUESTIONS_PER_FLOOR, bankPool.length));
  return picked.map(cloneShuffledTagged);
}

/* ---------- 画面：塔（科目）選択 ---------- */
function renderTowerSubjectList() {
  const wrap = document.getElementById('towerSubjectList');
  wrap.innerHTML = '';
  SUBJECT_ORDER.forEach(subject => {
    const prog = getTowerSubjectProgress(state.profile, subject);
    const clearedLabel =
      prog.clearedDifficulties.length > 0
        ? `${prog.clearedDifficulties.map(d => TOWER_DIFFICULTY[d].label).join('・')} 制覇済み`
        : 'まだ制覇していません';
    const div = document.createElement('div');
    div.className = 'grade-card';
    div.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
    div.onclick = () => selectTowerSubject(subject);
    div.innerHTML = `
      <div class="kanji">${TOWER_SUBJECT_KANJI[subject]}</div>
      <h2>${SUBJECT_LABEL[subject]}の塔</h2>
      <p>最高到達：${prog.bestFloor > 0 ? `${prog.bestFloor}階 / 全${TOWER_TOTAL_FLOORS}階` : '未挑戦'}　${clearedLabel}</p>
    `;
    wrap.appendChild(div);
  });
}

function selectTowerSubject(subject) {
  playClick();
  state.towerSubject = subject;
  showScreen('tower-difficulty');
}

/* ---------- 画面：難易度選択 ---------- */
function renderTowerDifficultyScreen() {
  const subject = state.towerSubject;
  const prog = getTowerSubjectProgress(state.profile, subject);
  const header = document.getElementById('towerDifficultyHeader');
  header.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
  header.innerHTML = `
    <div class="kanji">塔</div>
    <h2>${SUBJECT_LABEL[subject]}の塔</h2>
    <p>全5階・各階20問（1階:小6 → 2階:中1 → 3階:中2 → 4階:中3 → 5階:中学すべて）</p>
  `;
  const list = document.getElementById('towerDifficultyList');
  list.innerHTML = '';
  Object.keys(TOWER_DIFFICULTY).forEach(diffId => {
    const diff = TOWER_DIFFICULTY[diffId];
    const cleared = prog.clearedDifficulties.includes(diffId);
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => {
      playClick();
      startTowerRun(subject, diffId);
    };
    div.innerHTML = `
      <div class="cat-body">
        <h3>${diff.label}${cleared ? '　🏆制覇済み' : ''}</h3>
        <span>${diff.desc}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

/* ---------- 挑戦の開始・階の進行 ---------- */
function startTowerRun(subject, difficultyId) {
  state.towerSubject = subject;
  state.towerDifficulty = difficultyId;
  state.towerFloorResults = [];
  state.towerLastGuildCompleted = [];
  state.missed = [];
  state.subject = subject;
  startTowerFloor(1);
}

function retryTowerRun() {
  playClick();
  startTowerRun(state.towerSubject, state.towerDifficulty);
}

function startTowerFloor(floorIdx) {
  state.mode = 'tower';
  state.towerFloor = floorIdx;
  state.towerFloorMisses = 0;
  state.catId = `tower_${state.towerSubject}_f${floorIdx}`;
  state.catName = `${SUBJECT_LABEL[state.towerSubject]}の塔　${floorIdx}階（${TOWER_FLOOR_LABEL[floorIdx - 1]}）`;
  state.sessionQueue = buildTowerFloorQuestions(state.towerSubject, floorIdx);
  state.qIndex = 0;
  state.correctCount = 0;
  state.total = state.sessionQueue.length;
  document.getElementById('qReviewBadge').style.display = 'none';
  showScreen('quiz');
  nextQuestion();
  startTimer();
}

function updateTowerLivesHUD() {
  const el = document.getElementById('towerLives');
  if (!el) return;
  if (state.mode !== 'tower') {
    el.style.display = 'none';
    return;
  }
  const rule = TOWER_DIFFICULTY[state.towerDifficulty];
  el.style.display = 'inline';
  if (rule.maxMisses === Infinity) {
    el.textContent = '💫 制限なし';
    return;
  }
  const totalLives = rule.maxMisses + 1;
  const remain = Math.max(totalLives - state.towerFloorMisses, 0);
  el.textContent = '❤️'.repeat(remain) + '🖤'.repeat(totalLives - remain);
}

/* ---------- 階のクリア・追放・全体の結果 ---------- */
function finishTowerFloor() {
  clearInterval(state.timerHandle);
  playFanfare();
  state.towerFloorResults.push({
    floor: state.towerFloor,
    grade: TOWER_FLOOR_LABEL[state.towerFloor - 1],
    correct: state.correctCount,
    total: state.total,
    misses: state.towerFloorMisses,
  });
  state.towerLastGuildCompleted = evaluateGuildQuests(state.profile, { kind: 'tower_floor' });
  if (state.towerFloor >= TOWER_TOTAL_FLOORS) {
    completeTowerRun(true);
  } else {
    showTowerFloorClearScreen();
  }
}

function expelFromTower() {
  clearInterval(state.timerHandle);
  state.towerFloorResults.push({
    floor: state.towerFloor,
    grade: TOWER_FLOOR_LABEL[state.towerFloor - 1],
    correct: state.correctCount,
    total: state.total,
    misses: state.towerFloorMisses,
  });
  // 追放された階は突破していないので、直前の階で表示済みのギルド通知を持ち越さない
  state.towerLastGuildCompleted = [];
  completeTowerRun(false);
}

function showTowerFloorClearScreen() {
  document.getElementById('towerFloorClearTitle').textContent = `${state.towerFloor}階　突破！`;
  const r = state.towerFloorResults[state.towerFloorResults.length - 1];
  document.getElementById('towerFloorClearMeta').innerHTML =
    `${SUBJECT_LABEL[state.towerSubject]}の塔　${r.grade}<br>${r.correct} / ${r.total} 問正解（ミス${r.misses}回）`;
  renderGuildQuestNotice(document.getElementById('towerFloorGuildNotice'), state.towerLastGuildCompleted);
  const nextFloor = state.towerFloor + 1;
  document.getElementById('towerNextFloorBtn').textContent =
    nextFloor <= TOWER_TOTAL_FLOORS ? `${nextFloor}階へ進む` : '塔を制覇する';
  showScreen('tower-floor-clear');
}

function advanceTowerFloor() {
  playClick();
  startTowerFloor(state.towerFloor + 1);
}

function completeTowerRun(cleared) {
  clearInterval(state.timerHandle);
  recordPlayDay(state.profile);
  const profile = state.profile;
  const subject = state.towerSubject;
  const difficulty = state.towerDifficulty;
  const reachedFloor = cleared ? TOWER_TOTAL_FLOORS : state.towerFloor;

  const all = loadTowerProgress(profile);
  if (!all[subject]) all[subject] = { bestFloor: 0, clearedDifficulties: [] };
  const prog = all[subject];
  if (reachedFloor > prog.bestFloor) prog.bestFloor = reachedFloor;
  if (cleared && !prog.clearedDifficulties.includes(difficulty)) {
    prog.clearedDifficulties.push(difficulty);
  }
  saveTowerProgress(profile, all);

  // いつ・何階まで到達したかの履歴（直近20件）
  const historyKey = `kd-tower-history-${profile}-${subject}`;
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(historyKey)) || [];
  } catch (e) {
    history = [];
  }
  const today = new Date();
  history.unshift({
    date: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`,
    difficulty,
    cleared,
    reachedFloor,
    floorResults: state.towerFloorResults.slice(),
  });
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 20)));

  // バッジ判定（既存のBADGE_DEFS + buildBadgeContextの仕組みに乗せる）
  const newBadges = checkAndAwardBadges(profile);
  if (newBadges.length > 0) playBadgeGet();
  renderTowerResultScreen(cleared, newBadges);
  showScreen('tower-result');
}

function renderTowerResultScreen(cleared, newBadges) {
  document.getElementById('towerResultEyebrow').textContent = cleared ? 'TOWER CLEARED' : 'TOWER CHALLENGE';
  document.getElementById('towerResultTitle').textContent = cleared ? '塔を制覇した！' : '塔から追い出された…';
  document.getElementById('towerResultHanko').textContent = cleared ? '制覇' : '挑戦';
  document.getElementById('towerResultRank').textContent =
    `${SUBJECT_LABEL[state.towerSubject]}の塔　${TOWER_DIFFICULTY[state.towerDifficulty].label}`;

  const totalCorrect = state.towerFloorResults.reduce((s, r) => s + r.correct, 0);
  const totalQuestions = state.towerFloorResults.reduce((s, r) => s + r.total, 0);
  document.getElementById('towerResultMeta').innerHTML =
    `到達：${state.towerFloorResults.length}階 / 全${TOWER_TOTAL_FLOORS}階<br>累計 ${totalCorrect} / ${totalQuestions} 問正解`;

  renderGuildQuestNotice(document.getElementById('towerResultGuildNotice'), state.towerLastGuildCompleted);

  const breakdown = document.getElementById('towerFloorBreakdown');
  breakdown.innerHTML = state.towerFloorResults
    .map(
      r => `
    <div class="cat-card record-row">
      <div class="cat-body">
        <h3>${r.floor}階（${r.grade}）</h3>
        <span>${r.correct} / ${r.total} 問正解・ミス${r.misses}回</span>
      </div>
    </div>
  `
    )
    .join('');

  const badgeNotice = document.getElementById('towerNewBadgeNotice');
  if (newBadges.length > 0) {
    badgeNotice.style.display = 'block';
    badgeNotice.innerHTML = newBadges
      .map(b => `<div class="new-badge-line">${b.icon} 新しいバッジ「${b.name}」を獲得！</div>`)
      .join('');
  } else {
    badgeNotice.style.display = 'none';
    badgeNotice.innerHTML = '';
  }

  const reviewBtn = document.getElementById('towerReviewBtn');
  if (state.missed.length > 0) {
    reviewBtn.style.display = 'block';
    reviewBtn.textContent = `まちがえた問題を復習する（${state.missed.length}問）`;
  } else {
    reviewBtn.style.display = 'none';
  }
}

/* ---------- ホーム画面：「道場からでる」トグル ---------- */
// 道場の外（文明の塔・ギルドの一覧）を表示中かどうかを記憶しておく。
// 塔・ギルドの各画面から「もどる」で戻ってきたときも、道場（算数〜英語）
// ではなくこちらの一覧が再表示されるようにするためのフラグ。
let fieldOutsideActive = false;

function updateTowerToggleVisibility() {
  const btn = document.getElementById('towerToggleBtn');
  const subjectsWrap = document.getElementById('subjectCardsWrap');
  const towerEntryWrap = document.getElementById('towerEntryWrap');
  if (!btn || !subjectsWrap || !towerEntryWrap) return;
  const unlocked = isTowerUnlocked(state.profile);
  btn.style.display = unlocked ? 'block' : 'none';
  if (fieldOutsideActive && unlocked) {
    subjectsWrap.style.display = 'none';
    towerEntryWrap.style.display = 'flex';
    btn.textContent = '🏠 道場へもどる';
  } else {
    fieldOutsideActive = false; // 未解禁時に誤ってフラグが残らないようにする
    subjectsWrap.style.display = 'flex';
    towerEntryWrap.style.display = 'none';
    btn.textContent = '🚪 道場からでる';
  }
}

function toggleFieldOutside() {
  playClick();
  fieldOutsideActive = !fieldOutsideActive;
  updateTowerToggleVisibility();
}

// 文明の塔・ギルドの画面から「もどる」で戻るときに使う。
// 道場（算数〜英語）ではなく、文明の塔・ギルドの一覧を表示した状態で
// subjects画面に戻る。
function backToFieldOutside() {
  playClick();
  fieldOutsideActive = true;
  showScreen('subjects');
}

