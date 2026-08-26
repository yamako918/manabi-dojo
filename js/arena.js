/* ============================================================
   闘技場（Arena）
   ・冒険者同士の腕試し。科目・学年・制限時間（1分/3分）を選び、
     時間内に正解数を競う。
   ・一度出した問題は同じ回の中で出さない（数学は都度動的生成のため
     生成後に既出チェック、それ以外は事前にシャッフルしたプールから
     出し切っていく方式）。
   ・誤答すると残り時間が減る（ARENA_WRONG_PENALTY_SEC 秒）。
   ・ランキングは1分間・3分間それぞれで、プロフィールごとの自己ベスト
     （最高正解数）のみを保持する（同じ人の何度もの挑戦で埋まらないように）。
   ------------------------------------------------------------
   js/firebase-config.js が未設定の場合、ランキングの送受信は何もせず
   安全に終了する（対戦自体はローカルで完結してプレイできる）。
   ============================================================ */

const ARENA_TIME_LIMITS = { '1min': 60, '3min': 180 };
const ARENA_TIME_LIMIT_LABEL = { '1min': '1分間', '3min': '3分間' };
const ARENA_TIME_LIMIT_ORDER = ['1min', '3min'];
const ARENA_WRONG_PENALTY_SEC = 5;
let lastArenaFeedEntryId = null; // 直近の闘技場結果画面で投稿したできごとID（ハイライトボタン用）
const ARENA_SUBJECT_KANJI = { math: '算', kokugo: '国', science: '理', social: '社', english: '英' };

let arenaRankingTab = '1min'; // ランキング画面でどちらの時間帯を表示中か

/* ---------- 出題プール ---------- */
// 数学以外：あらかじめシャッフルした「その学年・その科目」の全問題を
// 先頭から出し切っていく（tower.jsのbuildTowerNonMathPoolを1学年分だけ使う）。
function buildArenaPool(subject, grade) {
  if (subject === 'math') return null; // 数学は都度動的生成するため事前プール不要
  const bankPool = buildTowerNonMathPool(subject, [grade]);
  return shuffleArray(bankPool).map(cloneShuffledTagged);
}

// 次の1問を引く。プールが尽きた（数学の場合は十分な試行をしても
// 新しい問題を作れなかった）場合はnullを返し、その回はそこで終了とする。
function drawNextArenaQuestion() {
  if (state.subject === 'math') {
    const catPool = CATEGORIES[state.grade];
    const usedTexts = state.arenaUsedMathTexts;
    const MAX_RETRY = 20;
    for (let i = 0; i < MAX_RETRY; i++) {
      const q = pick(catPool).gen();
      q.type = 'text';
      if (!usedTexts.has(q.qHTML)) {
        usedTexts.add(q.qHTML);
        return q;
      }
    }
    return null;
  }
  if (!state.arenaPool || state.arenaPool.length === 0) return null;
  return state.arenaPool.shift();
}

/* ---------- 自己ベスト（ローカル） ---------- */
function loadArenaLocalBest(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-arena-best-${profile}`)) || {};
  } catch (e) {
    return {};
  }
}
function saveArenaLocalBest(profile, data) {
  localStorage.setItem(`kd-arena-best-${profile}`, JSON.stringify(data));
}
// 新記録なら保存して true を返す
function updateArenaLocalBest(profile, timeLimitKey, correctCount, subject, grade) {
  const all = loadArenaLocalBest(profile);
  const prev = all[timeLimitKey];
  if (prev && prev.correctCount >= correctCount) return false;
  all[timeLimitKey] = { correctCount, subject, grade, achievedAt: Date.now() };
  saveArenaLocalBest(profile, all);
  return true;
}

function openArena() {
  playClick();
  showScreen('arena-subject');
}

/* ---------- 闘技場の受付（ぶっきらぼう口調） ---------- */
function arenaReceptionistSVG(mood) {
  // 角刈り・鋭い目つきのキャラクター（闘技場の色＝赤を基調にした簡素なSVG）
  const eyes = mood === 'happy'
    ? `<path d="M20 30 Q24 27 28 30" stroke="#3A1414" stroke-width="2.4" fill="none" stroke-linecap="round"/>
       <path d="M30 30 Q34 27 38 30" stroke="#3A1414" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M19 27 L27 29" stroke="#3A1414" stroke-width="2.4" stroke-linecap="round"/>
       <path d="M37 27 L29 29" stroke="#3A1414" stroke-width="2.4" stroke-linecap="round"/>
       <circle cx="23" cy="31" r="2.6" fill="#3A1414"/><circle cx="33" cy="31" r="2.6" fill="#3A1414"/>`;
  return `
    <svg viewBox="0 0 56 56" width="100%" height="100%">
      <path d="M10 14 L46 14 L42 6 L14 6 Z" fill="#8A2A2A"/>
      <ellipse cx="28" cy="32" rx="20" ry="19" fill="#E8B98F"/>
      <path d="M8 24 Q28 8 48 24 L48 20 Q28 4 8 20 Z" fill="#3A1414"/>
      <path d="M16 38 Q28 44 40 38" stroke="#3A1414" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      ${eyes}
    </svg>
  `;
}

function getArenaReceptionistMessage(profile) {
  const bests = loadArenaLocalBest(profile);
  const has1 = bests['1min'];
  const has3 = bests['3min'];

  if (!has1 && !has3) {
    const messages = [
      'まだ闘技場に出たことないのか。冷やかしじゃないなら、さっさと挑んでみろ。',
      '腕試しの場だぞ、ここは。科目と学年、時間を選んだらすぐ始まる。構えなくていい。',
    ];
    return { mood: 'neutral', text: pick(messages) };
  }

  const parts = [];
  if (has1) parts.push(`1分間は${has1.correctCount}問`);
  if (has3) parts.push(`3分間は${has3.correctCount}問`);
  const record = parts.join('、');

  const messages = [
    `${record}か。まあ、悪くない数字だ。`,
    `${record}。上等だ。もっと上を目指すならランキングも見ておけ。`,
    'ランキング、まだ見てないのか？行ってこい。',
    '記録更新したけりゃ、迷ってる暇はないぞ。',
  ];
  return { mood: 'neutral', text: pick(messages) };
}

function renderArenaReceptionist() {
  const avatar = document.getElementById('arenaReceptionistAvatar');
  const bubble = document.getElementById('arenaReceptionistMessage');
  if (!avatar || !bubble) return;
  const { mood, text } = getArenaReceptionistMessage(state.profile);
  avatar.innerHTML = arenaReceptionistSVG(mood);
  bubble.textContent = text;
}

/* ---------- 画面：闘技場への入口・科目選択 ---------- */
function renderArenaSubjectScreen() {
  renderArenaReceptionist();
  const wrap = document.getElementById('arenaSubjectList');
  wrap.innerHTML = '';
  SUBJECT_ORDER.forEach(subject => {
    const div = document.createElement('div');
    div.className = 'grade-card';
    div.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
    div.onclick = () => selectArenaSubject(subject);
    div.innerHTML = `
      <div class="kanji">${ARENA_SUBJECT_KANJI[subject]}</div>
      <h2>${SUBJECT_LABEL[subject]}</h2>
      <p>この科目で腕試しに挑戦する</p>
    `;
    wrap.appendChild(div);
  });
}

function selectArenaSubject(subject) {
  playClick();
  state.arenaSubject = subject;
  showScreen('arena-grade');
}

/* ---------- 画面：学年選択 ---------- */
function renderArenaGradeScreen() {
  const subject = state.arenaSubject;
  const header = document.getElementById('arenaGradeHeader');
  header.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
  header.innerHTML = `
    <div class="kanji">${ARENA_SUBJECT_KANJI[subject]}</div>
    <h2>${SUBJECT_LABEL[subject]}の闘技場</h2>
    <p>挑戦する学年を選ぼう</p>
  `;
  const list = document.getElementById('arenaGradeList');
  list.innerHTML = '';
  GRADE_ORDER.forEach((grade, idx) => {
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => selectArenaGrade(grade);
    div.innerHTML = `
      <div class="cat-num">${String(idx + 1).padStart(2, '0')}</div>
      <div class="cat-body">
        <h3>${GRADE_LABEL[grade]}</h3>
        <span>この学年の問題で挑戦する</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function selectArenaGrade(grade) {
  playClick();
  state.arenaGrade = grade;
  showScreen('arena-timelimit');
}

/* ---------- 画面：制限時間選択 ---------- */
function renderArenaTimeLimitScreen() {
  const subject = state.arenaSubject;
  const grade = state.arenaGrade;
  const header = document.getElementById('arenaTimeLimitHeader');
  header.style.setProperty('--stripe', SUBJECT_STRIPE[subject]);
  header.innerHTML = `
    <div class="kanji">${ARENA_SUBJECT_KANJI[subject]}</div>
    <h2>${SUBJECT_LABEL[subject]}・${GRADE_LABEL[grade]}</h2>
    <p>制限時間を選んで挑戦を開始しよう（誤答すると残り時間が${ARENA_WRONG_PENALTY_SEC}秒減ります）</p>
  `;
  const list = document.getElementById('arenaTimeLimitList');
  list.innerHTML = '';
  ARENA_TIME_LIMIT_ORDER.forEach(key => {
    const best = (loadArenaLocalBest(state.profile)[key] || {}).correctCount;
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => confirmStartArena(subject, grade, key);
    div.innerHTML = `
      <div class="cat-body">
        <h3>${ARENA_TIME_LIMIT_LABEL[key]}</h3>
        <span>${best ? `自己ベスト：${best}問正解` : 'まだ記録がありません'}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function confirmStartArena(subject, grade, timeLimitKey) {
  playClick();
  startArenaRound(subject, grade, timeLimitKey);
}

/* ---------- 挑戦の開始・進行 ---------- */
function startArenaRound(subject, grade, timeLimitKey) {
  state.subject = subject;
  state.grade = grade;
  state.mode = 'arena';
  state.catId = `arena_${subject}_${grade}_${timeLimitKey}`;
  state.catName = `闘技場　${SUBJECT_LABEL[subject]}・${GRADE_LABEL[grade]}`;

  state.arenaSubject = subject;
  state.arenaGrade = grade;
  state.arenaTimeLimitKey = timeLimitKey;
  state.arenaTimeLimit = ARENA_TIME_LIMITS[timeLimitKey];
  state.arenaRemainingSec = state.arenaTimeLimit;
  state.arenaPool = buildArenaPool(subject, grade);
  state.arenaUsedMathTexts = new Set();
  state.arenaFinished = false;
  state.arenaEndReason = null;

  state.sessionQueue = [];
  state.qIndex = 0;
  state.correctCount = 0;
  state.total = 999999; // 実質無制限（時間切れ・出題枯渇のいずれかで終了する）
  state.missed = [];
  state.reviewQueue = [];

  document.getElementById('qReviewBadge').style.display = 'none';
  showScreen('quiz');
  nextQuestion();
  startArenaTimer();
}

// 通常クイズの経過時間カウントアップ（startTimer）とは別の、
// 残り時間をカウントダウンする専用タイマー。
function startArenaTimer() {
  clearInterval(state.timerHandle);
  updateArenaTimerDisplay();
  state.timerHandle = setInterval(() => {
    state.arenaRemainingSec -= 1;
    if (state.arenaRemainingSec <= 0) {
      state.arenaRemainingSec = 0;
      updateArenaTimerDisplay();
      finishArenaRound('timeup');
      return;
    }
    updateArenaTimerDisplay();
  }, 1000);
}

function updateArenaTimerDisplay() {
  const el = document.getElementById('qTimer');
  if (!el) return;
  const sec = Math.max(state.arenaRemainingSec, 0);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

/* ---------- 終了・結果 ---------- */
function finishArenaRound(reason) {
  if (state.arenaFinished) return; // タイマーとペナルティの両方から呼ばれても二重終了しないようにする
  state.arenaFinished = true;
  state.arenaEndReason = reason;
  state.locked = true;
  clearInterval(state.timerHandle);

  recordPlayDay(state.profile);

  const profile = state.profile;
  const timeLimitKey = state.arenaTimeLimitKey;
  const correctCount = state.correctCount;
  const subject = state.arenaSubject;
  const grade = state.arenaGrade;

  const isNewLocalBest = updateArenaLocalBest(profile, timeLimitKey, correctCount, subject, grade);

  // クラウド連携が設定されていれば、自己ベストの更新時のみ送信する
  if (isCloudConfigured() && isNewLocalBest) {
    syncArenaResult(profile, timeLimitKey, correctCount, subject, grade);
  }

  const newBadges = checkAndAwardBadges(profile);
  if (newBadges.length > 0) playBadgeGet();

  const arenaHighlightBtn = document.getElementById('arenaResultHighlightBtn');
  arenaHighlightBtn.style.display = 'none';
  arenaHighlightBtn.disabled = false;
  arenaHighlightBtn.textContent = '⭐ タイムラインでハイライトする';
  lastArenaFeedEntryId = null;

  if (isCloudConfigured()) {
    // 自己ベスト更新そのものをタイムラインへ（ハイライトの対象はこちらを優先する）
    if (isNewLocalBest) {
      postFeedEvent(
        profile,
        'arena',
        '闘技場で自己ベスト更新！',
        `${SUBJECT_LABEL[subject]}・${GRADE_LABEL[grade]}・${ARENA_TIME_LIMIT_LABEL[timeLimitKey]}で${correctCount}問正解`,
        '⚔️',
        id => {
          lastArenaFeedEntryId = id;
          arenaHighlightBtn.style.display = 'block';
        }
      );
    }
    // このタイミングで獲得した新規バッジも合わせて投稿する
    postBadgeFeedEvents(profile, newBadges);
  }

  renderArenaResultScreen(isNewLocalBest, newBadges);
  showScreen('arena-result');
}

async function highlightLastArenaFeedEvent(btn) {
  playClick();
  if (!lastArenaFeedEntryId) return;
  const ok = await highlightFeedEvent(lastArenaFeedEntryId);
  if (ok) {
    btn.textContent = '⭐ ハイライトしました';
    btn.disabled = true;
  }
}

function renderArenaResultScreen(isNewLocalBest, newBadges) {
  const reasonLabel =
    state.arenaEndReason === 'exhausted' ? '出題できる問題がなくなりました' : '時間切れ！';
  document.getElementById('arenaResultEyebrow').textContent = 'ARENA CHALLENGE';
  document.getElementById('arenaResultTitle').textContent = reasonLabel;
  document.getElementById('arenaResultRank').textContent =
    `${SUBJECT_LABEL[state.arenaSubject]}・${GRADE_LABEL[state.arenaGrade]}・${ARENA_TIME_LIMIT_LABEL[state.arenaTimeLimitKey]}`;

  const best = loadArenaLocalBest(state.profile)[state.arenaTimeLimitKey];
  document.getElementById('arenaResultMeta').innerHTML =
    `正解数：<b>${state.correctCount}</b> 問` +
    (isNewLocalBest
      ? '<br>🎉 自己ベストを更新しました！'
      : best
      ? `<br>自己ベスト：${best.correctCount}問`
      : '');

  const badgeNotice = document.getElementById('arenaNewBadgeNotice');
  if (newBadges.length > 0) {
    badgeNotice.style.display = 'block';
    badgeNotice.innerHTML = newBadges
      .map(b => `<div class="new-badge-line">${b.icon} 新しいバッジ「${b.name}」を獲得！</div>`)
      .join('');
  } else {
    badgeNotice.style.display = 'none';
    badgeNotice.innerHTML = '';
  }

  const reviewBtn = document.getElementById('arenaReviewBtn');
  if (state.missed.length > 0) {
    reviewBtn.style.display = 'block';
    reviewBtn.textContent = `まちがえた問題を復習する（${state.missed.length}問）`;
  } else {
    reviewBtn.style.display = 'none';
  }
}

function retryArenaRound() {
  playClick();
  startArenaRound(state.arenaSubject, state.arenaGrade, state.arenaTimeLimitKey);
}

/* ---------- 画面：ランキング（1分間・3分間） ---------- */
function goToArenaRankingTab(key) {
  playClick();
  arenaRankingTab = key;
  renderArenaRankingScreen();
}

async function renderArenaRankingScreen() {
  const tabWrap = document.getElementById('arenaRankingTabs');
  tabWrap.innerHTML = ARENA_TIME_LIMIT_ORDER.map(key => {
    const active = key === arenaRankingTab;
    return `<button class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="flex:1;" onclick="goToArenaRankingTab('${key}')">${ARENA_TIME_LIMIT_LABEL[key]}</button>`;
  }).join('');

  const notice = document.getElementById('arenaRankingNotice');
  const wrap = document.getElementById('arenaRankingList');

  if (!isCloudConfigured()) {
    notice.style.display = 'block';
    notice.textContent = 'クラウド連携がまだ設定されていないため、みんなのランキングは表示できません（自己ベストは制限時間の選択画面で確認できます）。';
    wrap.innerHTML = '';
    return;
  }
  notice.style.display = 'none';
  wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">読み込み中…</div>`;

  const list = await loadArenaRanking(arenaRankingTab);
  wrap.innerHTML = '';
  if (list.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">まだ記録がありません。挑戦すると自動的に登録されます。</div>`;
    return;
  }
  list.forEach((entry, idx) => {
    const isSelf = entry.name === state.profile;
    const row = document.createElement('div');
    row.className = 'cat-card';
    row.innerHTML = `
      <div class="cat-num">${rankMedalHTML(idx + 1)}</div>
      <div class="cat-body">
        <h3>${entry.name}${isSelf ? '（自分）' : ''}</h3>
        <span>${entry.correctCount || 0}問正解・${SUBJECT_LABEL[entry.subject] || ''}${entry.grade ? '　' + GRADE_LABEL[entry.grade] : ''}</span>
      </div>
    `;
    wrap.appendChild(row);
  });
}
