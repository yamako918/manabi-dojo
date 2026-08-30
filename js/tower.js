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
let lastTowerFeedEntryId = null; // 直近の塔踏破結果画面で投稿したできごとID（ハイライトボタン用）
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

// 6階以降（無限モード）は、5階と同じ「中学生すべて」の範囲を使い続ける。
// 学年別の出題範囲は5階までしか定義していないため、それ以降は最後の階の設定を流用する。
function getTowerFloorGrades(floorIdx) {
  if (floorIdx <= TOWER_TOTAL_FLOORS) return TOWER_FLOOR_GRADES[floorIdx - 1];
  return TOWER_FLOOR_GRADES[TOWER_TOTAL_FLOORS - 1];
}
function getTowerFloorLabel(floorIdx) {
  if (floorIdx <= TOWER_TOTAL_FLOORS) return TOWER_FLOOR_LABEL[floorIdx - 1];
  return `無限モード${floorIdx}階（中学生すべて）`;
}

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
  const grades = getTowerFloorGrades(floorIdx);
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
/* ---------- 文明の塔の門番（かしこまった口調） ---------- */
// 塔の入口で、直近1週間に塔を踏破した人がいたかを教えてくれる。
// 家族内の複数プロフィール（この端末に登録されているもの）をまとめて確認する。
const TOWER_GATEKEEPER_RECENT_DAYS = 7;

function towerGatekeeperSVG(mood) {
  // フード付きローブの人物のシルエット（塔の色＝紫を基調にした簡素なSVG）
  const eyes = mood === 'happy'
    ? `<path d="M20 30 Q24 26 28 30" stroke="#F4EAFB" stroke-width="2.2" fill="none" stroke-linecap="round"/>
       <path d="M30 30 Q34 26 38 30" stroke="#F4EAFB" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : `<line x1="21" y1="29" x2="27" y2="29" stroke="#F4EAFB" stroke-width="2.2" stroke-linecap="round"/>
       <line x1="31" y1="29" x2="37" y2="29" stroke="#F4EAFB" stroke-width="2.2" stroke-linecap="round"/>`;
  return `
    <svg viewBox="0 0 56 56" width="100%" height="100%">
      <path d="M28 4 C14 4 8 20 8 34 L8 52 L48 52 L48 34 C48 20 42 4 28 4 Z" fill="#5B2472"/>
      <path d="M28 10 C18 10 13 22 13 34 L13 46 L43 46 L43 34 C43 22 38 10 28 10 Z" fill="#7A2E8A"/>
      <ellipse cx="28" cy="30" rx="13" ry="12" fill="#3C1C4D"/>
      ${eyes}
      <rect x="46" y="18" width="4" height="30" rx="2" fill="#C98A2C"/>
      <circle cx="48" cy="16" r="5" fill="#F2CB6A"/>
    </svg>
  `;
}

// この端末に登録されている全プロフィールを対象に、直近1週間で
// いずれかの科目の塔を「踏破」（cleared:true）した人を集める。
async function findTowerConquerorsThisWeek() {
  const cutoff = Date.now() - TOWER_GATEKEEPER_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const conquerors = new Set();

  // この端末に登録されている全プロフィール（ローカル）
  getProfiles().forEach(profile => {
    SUBJECT_ORDER.forEach(subject => {
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem(`kd-tower-history-${profile}-${subject}`)) || [];
      } catch (e) {
        history = [];
      }
      const hasRecentClear = history.some(h => h.cleared && typeof h.timestamp === 'number' && h.timestamp >= cutoff);
      if (hasRecentClear) conquerors.add(profile);
    });
  });

  // クラウド連携が設定されていれば、別端末のプロフィールも横断して確認する
  if (isCloudConfigured()) {
    const cloudNames = await loadRecentTowerConquerors(cutoff);
    cloudNames.forEach(name => conquerors.add(name));
  }

  return Array.from(conquerors);
}

async function getTowerGatekeeperMessage(profile) {
  const conquerors = await findTowerConquerorsThisWeek();
  if (conquerors.length === 0) {
    return {
      mood: 'neutral',
      text: 'この一週間、塔を踏破された方はまだいらっしゃらないようです。最初の踏破者となる栄誉は、あなたに委ねられているのかもしれません。',
    };
  }
  const others = conquerors.filter(name => name !== profile);
  if (others.length === 0) {
    return {
      mood: 'happy',
      text: 'この一週間、塔を踏破されたのはあなただけでございます。誠に見事な成果と申し上げます。',
    };
  }
  if (conquerors.includes(profile)) {
    return {
      mood: 'happy',
      text: `この一週間、あなたと${others.join('様・')}様が塔を踏破されました。両者とも見事な健闘でございます。`,
    };
  }
  return {
    mood: 'neutral',
    text: `この一週間、${others.join('様・')}様が塔を踏破されました。あなたも挑まれてはいかがでしょうか。`,
  };
}

async function renderTowerGatekeeper() {
  const avatar = document.getElementById('towerGatekeeperAvatar');
  const bubble = document.getElementById('towerGatekeeperMessage');
  if (!avatar || !bubble) return;
  // クラウドへの問い合わせを待つ間は、暫定の表情・文言を出しておく
  avatar.innerHTML = towerGatekeeperSVG('neutral');
  bubble.textContent = 'この一週間の踏破者を確認しています…';
  const { mood, text } = await getTowerGatekeeperMessage(state.profile);
  avatar.innerHTML = towerGatekeeperSVG(mood);
  bubble.textContent = text;
}

/* ---------- 画面：踏破の石碑 ----------
   ランキングとは異なり、期間でリセットされない永続的な記録。
   「完璧主義」「魔法のお守り」で踏破した人だけを、日付の昇順（古い順）で並べる。 */
async function renderTowerMonumentScreen() {
  const notice = document.getElementById('towerMonumentNotice');
  const wrap = document.getElementById('towerMonumentList');
  if (!isCloudConfigured()) {
    notice.style.display = 'block';
    notice.textContent = 'クラウド連携がまだ設定されていないため、踏破の石碑は表示できません。';
    wrap.innerHTML = '';
    return;
  }
  notice.style.display = 'none';
  wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">読み込み中…</div>`;

  const list = await loadTowerMonument();
  wrap.innerHTML = '';
  if (list.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">まだ「完璧主義」または「魔法のお守り」での踏破記録がありません。最初の1人になれるかもしれません。</div>`;
    return;
  }
  list.forEach((entry, idx) => {
    const d = entry.achievedAt.toDate();
    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const diffLabel = TOWER_DIFFICULTY[entry.difficulty] ? TOWER_DIFFICULTY[entry.difficulty].label : entry.difficulty;
    const row = document.createElement('div');
    row.className = 'cat-card';
    row.innerHTML = `
      <div class="cat-num">${idx + 1}</div>
      <div class="cat-body">
        <h3>${entry.name}</h3>
        <span>${SUBJECT_LABEL[entry.subject] || ''}・${diffLabel}・${dateStr}</span>
      </div>
    `;
    wrap.appendChild(row);
  });
}

/* ---------- 画面：塔（科目）選択 ---------- */
function renderTowerSubjectList() {
  renderTowerGatekeeper(); // 非同期だが待たずに描画を進める（完了次第セリフが差し替わる）
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
      <p>最高到達：${towerBestFloorLabel(prog.bestFloor)}　${clearedLabel}</p>
    `;
    wrap.appendChild(div);
  });
}

// 最高到達階の表示文言。5階を超えている（無限モードで到達した）場合は
// 「5階 / 全5階」という誤解を招く表記を避け、無限モードの到達として表示する。
function towerBestFloorLabel(bestFloor) {
  if (bestFloor <= 0) return '未挑戦';
  if (bestFloor <= TOWER_TOTAL_FLOORS) return `${bestFloor}階 / 全${TOWER_TOTAL_FLOORS}階`;
  return `無限モード${bestFloor}階（制覇＋${bestFloor - TOWER_TOTAL_FLOORS}）`;
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
  const infiniteToggle = document.getElementById('towerInfiniteModeCheckbox');
  if (infiniteToggle) infiniteToggle.checked = false; // 毎回、通常モードを既定にする
  const list = document.getElementById('towerDifficultyList');
  list.innerHTML = '';
  Object.keys(TOWER_DIFFICULTY).forEach(diffId => {
    const diff = TOWER_DIFFICULTY[diffId];
    const cleared = prog.clearedDifficulties.includes(diffId);
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => {
      playClick();
      const infiniteMode = infiniteToggle ? infiniteToggle.checked : false;
      startTowerRun(subject, diffId, infiniteMode);
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
function startTowerRun(subject, difficultyId, infiniteMode) {
  state.towerSubject = subject;
  state.towerDifficulty = difficultyId;
  state.towerInfiniteMode = !!infiniteMode;
  state.towerConquestSynced = false; // 5階制覇の踏破記録を二重送信しないためのフラグ
  state.towerFloorResults = [];
  state.towerLastGuildCompleted = [];
  state.missed = [];
  state.subject = subject;
  startTowerFloor(1);
}

function retryTowerRun() {
  playClick();
  startTowerRun(state.towerSubject, state.towerDifficulty, state.towerInfiniteMode);
}

function startTowerFloor(floorIdx) {
  state.mode = 'tower';
  state.towerFloor = floorIdx;
  state.towerFloorMisses = 0;
  state.catId = `tower_${state.towerSubject}_f${floorIdx}`;
  state.catName = `${SUBJECT_LABEL[state.towerSubject]}の塔　${floorIdx}階（${getTowerFloorLabel(floorIdx)}）`;
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
    grade: getTowerFloorLabel(state.towerFloor),
    correct: state.correctCount,
    total: state.total,
    misses: state.towerFloorMisses,
  });
  state.towerLastGuildCompleted = evaluateGuildQuests(state.profile, { kind: 'tower_floor' });

  const clearedBaseTower = state.towerFloor >= TOWER_TOTAL_FLOORS;

  // 5階制覇は無限モードでもこの時点で確定させる（踏破記録は最初の1回だけ送信する）
  if (clearedBaseTower && !state.towerConquestSynced) {
    state.towerConquestSynced = true;
    if (isCloudConfigured()) {
      syncTowerConquest(state.profile, state.towerSubject, state.towerDifficulty, TOWER_TOTAL_FLOORS);
    }
  }

  if (clearedBaseTower && !state.towerInfiniteMode) {
    completeTowerRun(true);
  } else {
    showTowerFloorClearScreen();
  }
}

function expelFromTower() {
  clearInterval(state.timerHandle);
  state.towerFloorResults.push({
    floor: state.towerFloor,
    grade: getTowerFloorLabel(state.towerFloor),
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
  const nextBtn = document.getElementById('towerNextFloorBtn');
  if (nextFloor <= TOWER_TOTAL_FLOORS) {
    nextBtn.textContent = `${nextFloor}階へ進む`;
  } else if (state.towerInfiniteMode) {
    nextBtn.textContent = `${nextFloor}階へ進む（無限モード）`;
  } else {
    nextBtn.textContent = '塔を制覇する'; // 通常モードはfinishTowerFloor側でここに来ないための保険
  }
  // 無限モードで5階を制覇したあとは、いつでも「ここで終わりにする」ことができる
  const stopBtn = document.getElementById('towerStopHereBtn');
  stopBtn.style.display = state.towerInfiniteMode && state.towerFloor >= TOWER_TOTAL_FLOORS ? 'block' : 'none';
  showScreen('tower-floor-clear');
}

function stopInfiniteTowerRun() {
  playClick();
  completeTowerRun(true);
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
  const reachedFloor = state.towerFloor;
  // 5階制覇済みかどうか（無限モードで6階以降に追放されても、この実績は取り消さない）
  const baseCleared = state.towerConquestSynced;

  const all = loadTowerProgress(profile);
  if (!all[subject]) all[subject] = { bestFloor: 0, clearedDifficulties: [] };
  const prog = all[subject];
  if (reachedFloor > prog.bestFloor) prog.bestFloor = reachedFloor;
  if (baseCleared && !prog.clearedDifficulties.includes(difficulty)) {
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
    timestamp: today.getTime(), // 「直近1週間」の判定に使う生の時刻（門番のコメント用）
    difficulty,
    cleared: baseCleared,
    reachedFloor,
    floorResults: state.towerFloorResults.slice(),
  });
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 20)));

  // 塔踏破そのもののクラウド送信は、5階を制覇した瞬間（finishTowerFloor側）で
  // 既に1回行っている。無限モードで後から追放されても、その送信は取り消さない。

  // バッジ判定（既存のBADGE_DEFS + buildBadgeContextの仕組みに乗せる）
  const newBadges = checkAndAwardBadges(profile);
  if (newBadges.length > 0) playBadgeGet();

  const towerHighlightBtn = document.getElementById('towerResultHighlightBtn');
  towerHighlightBtn.style.display = 'none';
  towerHighlightBtn.disabled = false;
  towerHighlightBtn.textContent = '⭐ タイムラインでハイライトする';
  lastTowerFeedEntryId = null;

  if (isCloudConfigured()) {
    // 塔の踏破そのものをタイムラインへ（ハイライトの対象はこちらを優先する）
    if (baseCleared) {
      const infiniteNote = reachedFloor > TOWER_TOTAL_FLOORS ? `（無限モードで${reachedFloor}階まで到達）` : '';
      postFeedEvent(
        profile,
        'tower',
        '文明の塔を制覇！',
        `${SUBJECT_LABEL[subject]}・${TOWER_DIFFICULTY[difficulty].label}${infiniteNote}`,
        '🗼',
        id => {
          lastTowerFeedEntryId = id;
          towerHighlightBtn.style.display = 'block';
        }
      );
    }
    // このタイミングで獲得した新規バッジも合わせて投稿する
    postBadgeFeedEvents(profile, newBadges);
  }

  renderTowerResultScreen(cleared, baseCleared, newBadges);
  showScreen('tower-result');
}

async function highlightLastTowerFeedEvent(btn) {
  playClick();
  if (!lastTowerFeedEntryId) return;
  const ok = await highlightFeedEvent(lastTowerFeedEntryId);
  if (ok) {
    btn.textContent = '⭐ ハイライトしました';
    btn.disabled = true;
  }
}

function renderTowerResultScreen(cleared, baseCleared, newBadges) {
  const infiniteBeyondFive = state.towerInfiniteMode && state.towerFloor > TOWER_TOTAL_FLOORS;
  document.getElementById('towerResultEyebrow').textContent = baseCleared ? 'TOWER CLEARED' : 'TOWER CHALLENGE';
  document.getElementById('towerResultTitle').textContent = baseCleared
    ? (infiniteBeyondFive || !cleared ? '塔を制覇し、さらに無限モードに挑んだ！' : '塔を制覇した！')
    : '塔から追い出された…';
  document.getElementById('towerResultHanko').textContent = baseCleared ? '制覇' : '挑戦';
  document.getElementById('towerResultRank').textContent =
    `${SUBJECT_LABEL[state.towerSubject]}の塔　${TOWER_DIFFICULTY[state.towerDifficulty].label}`;

  const totalCorrect = state.towerFloorResults.reduce((s, r) => s + r.correct, 0);
  const totalQuestions = state.towerFloorResults.reduce((s, r) => s + r.total, 0);
  const floorLine = state.towerFloor > TOWER_TOTAL_FLOORS
    ? `到達：${state.towerFloor}階（無限モードで全${TOWER_TOTAL_FLOORS}階を突破後、+${state.towerFloor - TOWER_TOTAL_FLOORS}階）`
    : `到達：${state.towerFloorResults.length}階 / 全${TOWER_TOTAL_FLOORS}階`;
  document.getElementById('towerResultMeta').innerHTML =
    `${floorLine}<br>累計 ${totalCorrect} / ${totalQuestions} 問正解`;

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

/* ---------- ホーム画面：「冒険へ旅立つ」トグル ---------- */
// 道場の外（文明の塔・ギルド・闘技場の一覧）を表示中かどうかを記憶しておく。
// 各画面から「もどる」で戻ってきたときも、道場（算数〜英語）
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
    btn.textContent = '🚪 冒険へ旅立つ';
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

