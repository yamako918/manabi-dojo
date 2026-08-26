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
  localStorage.removeItem(`kd-weak-${name}`);
  localStorage.removeItem(`kd-streak-${name}`);
  localStorage.removeItem(`kd-weak-cleared-${name}`);
  localStorage.removeItem(`kd-badges-${name}`);
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith(`kd-best-${name}-`) || k.startsWith(`kd-stats-${name}-`)) localStorage.removeItem(k);
  });
  renderProfileList();
}

function selectProfile(name) {
  playClick();
  state.profile = name;
  fieldOutsideActive = false; // 別プロフィールの前回の表示状態を引き継がないようにする
  showScreen('subjects');
}

/* ---------- 画面制御 ---------- */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  switchBGM(bgmThemeForScreen(name));
  if (name === 'profile') renderProfileList();
  if (name === 'subjects') {
    document.getElementById('profileWelcome').textContent = state.profile || '';
    renderLastRecord();
    renderMascotHome();
    renderWeakButton();
    checkNewCheers();
    updateTowerToggleVisibility();
    renderFamilyFeedDigest();
  }
  if (name === 'records') renderRecords();
  if (name === 'achievement') renderAchievement();
  if (name === 'badges') renderBadgeScreen();
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'tower-subject') renderTowerSubjectList();
  if (name === 'tower-difficulty') renderTowerDifficultyScreen();
  if (name === 'tower-monument') renderTowerMonumentScreen();
  if (name === 'guild-register') renderGuildRegisterScreen();
  if (name === 'guild') renderGuildScreen();
  if (name === 'guild-ranking') renderGuildRankingScreen();
  if (name === 'arena-subject') renderArenaSubjectScreen();
  if (name === 'arena-grade') renderArenaGradeScreen();
  if (name === 'arena-timelimit') renderArenaTimeLimitScreen();
  if (name === 'arena-ranking') renderArenaRankingScreen();
  if (name === 'family-feed') renderFamilyFeedScreen();
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
      } else {
        NONMATH_CATEGORIES[subject]()[grade].forEach(cat => {
          defs.push({ subject, grade, catId: cat.id, catName: cat.name });
        });
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

/* ---------- マスコット（応援メッセージ） ----------
   フェーズ2（Firebase等でのクラウド同期）を見据え、
   「profile名で読み書きする」という現行の設計をそのまま踏襲する。
   将来的にはlocalStorageの参照先をFirestoreの該当ドキュメントに
   差し替えるだけで移行できるよう、ロジック（getMascotMessage等）と
   データアクセス（localStorage.getItem）を分離してある。 */
const MASCOT_GENERIC_MESSAGES = [
  '今日もいっしょにがんばろう！',
  'コツコツ続けることが一番の近道だよ。',
  '苦手な単元こそ、伸びしろのサインだよ！',
  '深呼吸してから挑戦してみよう。',
  '前回よりちょっとだけ頑張ってみよう！',
  '一問一問、ていねいに解いていこう。',
  'キミのペースでだいじょうぶ！',
  '今日はどの教科に挑戦する？',
];

function mascotSVG(mood) {
  const eyes = mood === 'happy'
    ? `<path d="M18 30 Q22 25.5 26 30" stroke="#1F3A5F" stroke-width="2.6" fill="none" stroke-linecap="round"/>
       <path d="M30 30 Q34 25.5 38 30" stroke="#1F3A5F" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<circle cx="22" cy="29" r="4" fill="#1F3A5F"/><circle cx="34" cy="29" r="4" fill="#1F3A5F"/>
       <circle cx="23.2" cy="27.8" r="1.1" fill="#fff"/><circle cx="35.2" cy="27.8" r="1.1" fill="#fff"/>`;
  return `
    <svg viewBox="0 0 56 56" width="100%" height="100%">
      <ellipse cx="14" cy="16" rx="7" ry="9" fill="#E8DCC4"/>
      <ellipse cx="42" cy="16" rx="7" ry="9" fill="#E8DCC4"/>
      <ellipse cx="14" cy="17" rx="4" ry="5" fill="#C98A2C"/>
      <ellipse cx="42" cy="17" rx="4" ry="5" fill="#C98A2C"/>
      <ellipse cx="28" cy="30" rx="22" ry="20" fill="#E8DCC4"/>
      <circle cx="22" cy="29" r="9" fill="#fff"/>
      <circle cx="34" cy="29" r="9" fill="#fff"/>
      ${eyes}
      <path d="M28 33 L24.5 39 L31.5 39 Z" fill="#C98A2C"/>
      <ellipse cx="28" cy="47" rx="10" ry="4" fill="#D63447" opacity="0.85"/>
    </svg>
  `;
}

// 達成率が100%まであと1単元、という一番「あと少し」な組み合わせを探す
function findNearestMilestone(profile) {
  let best = null;
  GRADE_ORDER.forEach(grade => {
    const { bySubject } = computeGradeAchievement(profile, grade);
    RADAR_SUBJECT_ORDER.forEach(subject => {
      const b = bySubject[subject];
      if (b.total > 1 && b.perfect > 0 && b.perfect < b.total) {
        const remain = b.total - b.perfect;
        if (!best || remain < best.remain) best = { remain, subject, grade };
      }
    });
  });
  if (!best) return null;
  return `${GRADE_LABEL[best.grade]}の${SUBJECT_LABEL[best.subject]}、あと${best.remain}単元で達成率100%だよ！`;
}

function getMascotMessage(profile) {
  const raw = localStorage.getItem(`kd-last-record-${profile}`);
  if (!raw) {
    return { mood: 'welcome', text: 'はじめまして！いっしょに「まなび道場」でがんばろう！' };
  }
  let r = null;
  try { r = JSON.parse(raw); } catch (e) { r = null; }

  if (r && typeof r.timestamp === 'number') {
    const daysSince = Math.floor((Date.now() - r.timestamp) / 86400000);
    if (daysSince >= 3) {
      return { mood: 'welcome', text: `おかえりなさい！${daysSince}日ぶりだね、待ってたよ。` };
    }
  }
  const streak = loadStreak(profile);
  if (streak.justExtendedToday && streak.count >= 2) {
    return { mood: 'happy', text: `${streak.count}日連続プレイだね！すごい、その調子！` };
  }
  if (r && r.total > 0 && r.correct === r.total) {
    return { mood: 'happy', text: `前回は${r.category}で全問正解だったね！すごいよ！` };
  }
  const milestone = findNearestMilestone(profile);
  if (milestone) return { mood: 'normal', text: milestone };

  const pick = MASCOT_GENERIC_MESSAGES[Math.floor(Math.random() * MASCOT_GENERIC_MESSAGES.length)];
  return { mood: 'normal', text: pick };
}

function renderMascotHome() {
  if (!state.profile) return;
  const { mood, text } = getMascotMessage(state.profile);
  document.getElementById('mascotHomeAvatar').innerHTML = mascotSVG(mood);
  document.getElementById('mascotHomeMessage').textContent = text;
  renderStreakBadge();
}

/* ---------- 連続プレイ日数（ストリーク） ---------- */
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateStrDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadStreak(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-streak-${profile}`)) || { count: 0, lastDate: null, justExtendedToday: false };
  } catch (e) {
    return { count: 0, lastDate: null, justExtendedToday: false };
  }
}

// 通常モードのクイズを1回終えるたびに呼ぶ。同じ日に何度解いても加算されない。
function updateStreak(profile) {
  const streak = loadStreak(profile);
  const today = todayDateStr();
  if (streak.lastDate === today) {
    streak.justExtendedToday = false; // 今日はすでに反映済み
    localStorage.setItem(`kd-streak-${profile}`, JSON.stringify(streak));
    return streak;
  }
  if (streak.lastDate === dateStrDaysAgo(1)) {
    streak.count += 1;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  streak.justExtendedToday = true;
  localStorage.setItem(`kd-streak-${profile}`, JSON.stringify(streak));
  return streak;
}

function renderStreakBadge() {
  const el = document.getElementById('streakBadge');
  if (!el) return;
  const streak = loadStreak(state.profile);
  if (streak.count >= 2 && (streak.lastDate === todayDateStr() || streak.lastDate === dateStrDaysAgo(1))) {
    el.style.display = 'inline-flex';
    el.textContent = `🔥 ${streak.count}日連続`;
  } else {
    el.style.display = 'none';
  }
}

/* ---------- 通算プレイ日数（連続でなくてもよい・バッジ判定用） ---------- */
function loadPlayDays(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-playdays-${profile}`)) || [];
  } catch (e) {
    return [];
  }
}

// クイズ（通常・復習・にがて克服・文明の塔いずれも）が1回終わるたびに呼ぶ。
// 同じ日に何度呼んでも重複加算されない。
function recordPlayDay(profile) {
  const days = loadPlayDays(profile);
  const today = todayDateStr();
  if (!days.includes(today)) {
    days.push(today);
    localStorage.setItem(`kd-playdays-${profile}`, JSON.stringify(days));
  }
}

/* ---------- 苦手問題の永続化 ---------- */
// 数学（自動生成・checker関数を持つ）は保存できないため対象外。
// 国語・理科・社会・英語の4択問題（type:'choice'）のみを対象にする。
function loadWeakList(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-weak-${profile}`)) || [];
  } catch (e) {
    return [];
  }
}
function saveWeakList(profile, list) {
  localStorage.setItem(`kd-weak-${profile}`, JSON.stringify(list));
}
function addToWeakList(profile, catId, catName, q) {
  if (q.type !== 'choice') return;
  const list = loadWeakList(profile);
  const idx = list.findIndex(w => w.catId === catId && w.qHTML === q.qHTML);
  if (idx >= 0) {
    list[idx].missCount = (list[idx].missCount || 1) + 1;
    list[idx].lastMissed = Date.now();
    list[idx].choices = q.choices.slice();
    list[idx].correct = q.correct;
  } else {
    list.push({
      catId, catName,
      qHTML: q.qHTML,
      choices: q.choices.slice(),
      correct: q.correct,
      missCount: 1,
      lastMissed: Date.now()
    });
  }
  saveWeakList(profile, list);
}
function removeFromWeakList(profile, catId, qHTML) {
  const list = loadWeakList(profile);
  const next = list.filter(w => !(w.catId === catId && w.qHTML === qHTML));
  if (next.length !== list.length) {
    saveWeakList(profile, next);
    const key = `kd-weak-cleared-${profile}`;
    const count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, String(count));
  }
}

/* ---------- 実績バッジ ---------- */
const BADGE_DEFS = [
  { id: 'first_quiz', name: 'はじめの一歩', desc: 'はじめてクイズに挑戦した', icon: '🥉',
    check: ctx => ctx.hasLastRecord },
  { id: 'first_perfect', name: 'はじめての三段', desc: 'どれか1つの単元で三段（全問正解）を達成', icon: '🏅',
    check: ctx => ctx.perfectCount >= 1 },
  { id: 'perfect_5', name: '三段コレクター', desc: '5つの単元で三段を達成', icon: '🌟',
    check: ctx => ctx.perfectCount >= 5 },
  { id: 'perfect_15', name: '三段マスター', desc: '15の単元で三段を達成', icon: '👑',
    check: ctx => ctx.perfectCount >= 15 },
  { id: 'streak_3', name: '続けるって大事', desc: '3日連続でプレイした', icon: '🔥',
    check: ctx => ctx.streakCount >= 3 },
  { id: 'streak_7', name: '継続は力なり', desc: '7日連続でプレイした', icon: '🔥🔥',
    check: ctx => ctx.streakCount >= 7 },
  { id: 'streak_14', name: '継続の匠', desc: '14日連続でプレイした', icon: '🔥🔥🔥',
    check: ctx => ctx.streakCount >= 14 },
  { id: 'streak_30', name: '継続の鬼', desc: '30日連続でプレイした', icon: '🔥🔥🔥🔥',
    check: ctx => ctx.streakCount >= 30 },
  { id: 'correct_100', name: '百問正解', desc: '累計100問正解した', icon: '💯',
    check: ctx => ctx.totalCorrect >= 100 },
  { id: 'correct_300', name: '三百問正解', desc: '累計300問正解した', icon: '💯💯',
    check: ctx => ctx.totalCorrect >= 300 },
  { id: 'weak_clear_1', name: 'にがて克服デビュー', desc: '苦手だった問題を1問克服した', icon: '🎯',
    check: ctx => ctx.weakCleared >= 1 },
  { id: 'weak_clear_10', name: 'にがて克服マスター', desc: '苦手だった問題を10問克服した', icon: '🎯🎯',
    check: ctx => ctx.weakCleared >= 10 },
  { id: 'all_subjects', name: '5教科チャレンジャー', desc: '5教科すべてに挑戦した', icon: '🌈',
    check: ctx => ctx.subjectsPlayed >= 5 },
  { id: 'play_days_10', name: '道場の常連', desc: '（連続でなくてよい）累計10日プレイした', icon: '🏮',
    check: ctx => ctx.totalPlayDays >= 10 },
  { id: 'play_days_30', name: '道場の主', desc: '（連続でなくてよい）累計30日プレイした', icon: '⛩️',
    check: ctx => ctx.totalPlayDays >= 30 },
  { id: 'play_days_100', name: '生涯修行者', desc: '（連続でなくてよい）累計100日プレイした', icon: '🗻',
    check: ctx => ctx.totalPlayDays >= 100 },
  { id: 'early_bird', name: '早起き修行', desc: '朝6時より前にクイズに挑戦した', icon: '🌅',
    check: ctx => ctx.hourOfCompletion < 6 },
  { id: 'night_owl', name: '夜ふかし修行', desc: '夜23時以降にクイズに挑戦した', icon: '🌙',
    check: ctx => ctx.hourOfCompletion >= 23 },
  { id: 'full_pentagon', name: '五角形マスター', desc: 'いずれかの学年で5教科すべての達成率を100%にした', icon: '🔷',
    check: ctx => ctx.fullPentagonGrade },
  { id: 'tower_solo_clear', name: '孤高の塔登り', desc: '完璧主義（ノーミス）難易度でいずれかの塔を制覇', icon: '⚔️',
    check: ctx => ctx.towerClearedDifficulties.has('solo') },
  { id: 'tower_amulet_clear', name: '加護の塔登り', desc: '魔法のお守り難易度でいずれかの塔を制覇', icon: '🧿',
    check: ctx => ctx.towerClearedDifficulties.has('amulet') },
  { id: 'tower_unlimited_clear', name: '塔の踏破者', desc: '鋼のメンタル難易度でいずれかの塔を制覇', icon: '🏯',
    check: ctx => ctx.towerClearedDifficulties.has('unlimited') },
  { id: 'tower_all_subjects', name: '五塔制覇', desc: '5科目すべての塔を1つ以上の難易度で制覇した', icon: '🏰',
    check: ctx => ctx.towerAnyClearedSubjects >= 5 },
  { id: 'tower_master_single', name: '塔の極意', desc: 'いずれかの科目の塔を、全難易度（3種）で制覇した', icon: '💠',
    check: ctx => ctx.towerAllDifficultySubjects >= 1 },
  { id: 'guild_license', name: 'ギルド登録', desc: 'ギルドに登録し冒険者ライセンスを受け取った', icon: '📜',
    check: ctx => ctx.guildRegistered },
  { id: 'guild_first_quest', name: '初めての依頼達成', desc: 'ギルドの依頼を初めて達成した', icon: '📋',
    check: ctx => ctx.guildQuestsCompleted >= 1 },
  { id: 'guild_quest_10', name: '頼れる冒険者', desc: 'ギルド依頼を累計10件達成した', icon: '🗡️',
    check: ctx => ctx.guildQuestsCompleted >= 10 },
  { id: 'guild_quest_50', name: 'ベテラン冒険者', desc: 'ギルド依頼を累計50件達成した', icon: '🛡️',
    check: ctx => ctx.guildQuestsCompleted >= 50 },
  { id: 'guild_points_100', name: 'ポイントハンター', desc: 'ギルドポイントを累計100pt獲得した', icon: '💰',
    check: ctx => ctx.guildTotalPoints >= 100 },
  { id: 'guild_points_500', name: 'ポイントマスター', desc: 'ギルドポイントを累計500pt獲得した', icon: '💎',
    check: ctx => ctx.guildTotalPoints >= 500 },
  // クラウド上の他プレイヤーのデータに依存するため、通常のctx方式では判定しない。
  // ランキング画面を開いた瞬間に guild.js の awardBadgeDirect() から個別に付与される。
  { id: 'guild_rank_1', name: 'ギルド週間ランキング1位', desc: '週が終了し、確定した最終結果でウィークリーのギルドポイントランキング1位だった', icon: '🥇',
    check: () => false },
];


function loadBadges(profile) {
  try { return JSON.parse(localStorage.getItem(`kd-badges-${profile}`)) || []; }
  catch (e) { return []; }
}
function saveBadges(profile, list) {
  localStorage.setItem(`kd-badges-${profile}`, JSON.stringify(list));
}

function buildBadgeContext(profile) {
  const hasLastRecord = !!localStorage.getItem(`kd-last-record-${profile}`);
  const streak = loadStreak(profile);
  let perfectCount = 0, totalCorrect = 0;
  const subjectsSeen = new Set();
  getAllCatDefs().forEach(d => {
    const bestIdx = parseInt(localStorage.getItem(`kd-best-${profile}-${d.catId}`) || '-1', 10);
    if (bestIdx === PERFECT_RANK_IDX) perfectCount++;
    let stats = null;
    try { stats = JSON.parse(localStorage.getItem(`kd-stats-${profile}-${d.catId}`)); } catch (e) { stats = null; }
    if (stats) {
      totalCorrect += stats.correct || 0;
      subjectsSeen.add(d.subject);
    }
  });
  const weakCleared = parseInt(localStorage.getItem(`kd-weak-cleared-${profile}`) || '0', 10);

  const towerProgress = loadTowerProgress(profile);
  const towerClearedDifficulties = new Set();
  let towerAnyClearedSubjects = 0;
  let towerAllDifficultySubjects = 0;
  const towerDifficultyCount = Object.keys(TOWER_DIFFICULTY).length;
  Object.values(towerProgress).forEach(p => {
    const cleared = p.clearedDifficulties || [];
    cleared.forEach(d => towerClearedDifficulties.add(d));
    if (cleared.length > 0) towerAnyClearedSubjects++;
    if (cleared.length >= towerDifficultyCount) towerAllDifficultySubjects++;
  });

  const totalPlayDays = loadPlayDays(profile).length;

  // いずれかの学年で5教科すべてが三段（達成率100%）＝レーダーチャートが正五角形になったか
  let fullPentagonGrade = false;
  GRADE_ORDER.forEach(grade => {
    const { totalUnits, totalPerfect } = computeGradeAchievement(profile, grade);
    if (totalUnits > 0 && totalPerfect === totalUnits) fullPentagonGrade = true;
  });

  const hourOfCompletion = new Date().getHours();

  const guildLicense = loadGuildLicense(profile);
  const guildProgress = loadGuildProgress(profile);

  return {
    hasLastRecord, streakCount: streak.count, perfectCount, totalCorrect,
    subjectsPlayed: subjectsSeen.size, weakCleared, towerClearedDifficulties,
    totalPlayDays, towerAnyClearedSubjects, towerAllDifficultySubjects,
    fullPentagonGrade, hourOfCompletion,
    guildRegistered: !!guildLicense,
    guildQuestsCompleted: guildProgress.totalQuestsCompleted,
    guildTotalPoints: guildProgress.totalPointsAllTime
  };
}

// 新たに条件を満たしたバッジを付与し、そのリストを返す
function checkAndAwardBadges(profile) {
  const earned = loadBadges(profile);
  const ctx = buildBadgeContext(profile);
  const newlyEarned = [];
  BADGE_DEFS.forEach(b => {
    if (!earned.includes(b.id) && b.check(ctx)) {
      earned.push(b.id);
      newlyEarned.push(b);
    }
  });
  if (newlyEarned.length > 0) saveBadges(profile, earned);
  return newlyEarned;
}

function renderBadgeScreen() {
  const wrap = document.getElementById('badgeGrid');
  wrap.innerHTML = '';
  const earned = new Set(loadBadges(state.profile));
  BADGE_DEFS.forEach(b => {
    const got = earned.has(b.id);
    const card = document.createElement('div');
    card.className = 'badge-card' + (got ? ' badge-earned' : ' badge-locked');
    card.innerHTML = `
      <div class="badge-icon">${got ? b.icon : '🔒'}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    `;
    wrap.appendChild(card);
  });
  document.getElementById('badgeSummary').textContent = `獲得数：${earned.size} / ${BADGE_DEFS.length}`;
}

function goToBadges() {
  playClick();
  showScreen('badges');
}

/* ---------- みんなの記録・応援スタンプ（Firebase、任意機能） ---------- */
function goToLeaderboard() {
  playClick();
  showScreen('leaderboard');
}

async function renderLeaderboard() {
  const wrap = document.getElementById('leaderboardList');
  const notice = document.getElementById('leaderboardNotice');
  wrap.innerHTML = '';
  if (!isCloudConfigured()) {
    notice.style.display = 'block';
    notice.textContent = 'クラウド連携がまだ設定されていません（js/firebase-config.js を設定すると使えるようになります）。';
    return;
  }
  notice.style.display = 'none';
  wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">読み込み中…</div>`;
  const list = await loadLeaderboard();
  wrap.innerHTML = '';
  if (list.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">まだ誰も記録を送っていません。クイズに挑戦すると自動的に登録されます。</div>`;
    return;
  }
  list.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'cat-card';
    const isSelf = entry.name === state.profile;
    const cheerBtns = isSelf
      ? ''
      : CHEER_EMOJIS.map(e => `<button class="cheer-btn" data-emoji="${e}">${e}</button>`).join('');
    row.innerHTML = `
      <div class="cat-body">
        <h3>${entry.name}${isSelf ? '（自分）' : ''}</h3>
        <span>累計${entry.totalCorrect || 0}問正解・連続${entry.streakCount || 0}日・バッジ${entry.badgeCount || 0}個</span>
        ${!isSelf ? `<div class="cheer-row">${cheerBtns}</div>` : ''}
      </div>
    `;
    if (!isSelf) {
      row.querySelectorAll('.cheer-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          playClick();
          btn.disabled = true;
          const ok = await sendCheer(state.profile, entry.name, btn.dataset.emoji);
          btn.textContent = ok ? '送った！' : '失敗…';
        });
      });
    }
    wrap.appendChild(row);
  });
}

async function checkNewCheers() {
  if (!state.profile || !isCloudConfigured()) return;
  const cheers = await loadNewCheers(state.profile);
  if (cheers.length === 0) return;
  const box = document.getElementById('cheerNotice');
  if (!box) return;
  const names = [...new Set(cheers.map(c => c.from))].join('、');
  const emojis = cheers.map(c => c.emoji).join(' ');
  box.style.display = 'block';
  box.textContent = `${names}さんから応援がとどいたよ！ ${emojis}`;
}

function startWeakReview() {
  playClick();
  const list = loadWeakList(state.profile);
  if (list.length === 0) return;
  const picked = shuffleArray(list).slice(0, Math.min(10, list.length));
  state.subject = null;
  state.catId = `weak_${state.profile}`;
  state.catName = 'にがて克服';
  state.mode = 'weak';
  state.activeBank = null;
  state.sessionQueue = picked.map(item => ({
    type: 'choice',
    qHTML: item.qHTML,
    choices: item.choices.slice(),
    correct: item.correct,
    _origCatId: item.catId,
    _origCatName: item.catName
  }));
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

function renderWeakButton() {
  const btn = document.getElementById('weakReviewBtn');
  if (!btn) return;
  const count = loadWeakList(state.profile).length;
  if (count > 0) {
    btn.style.display = 'flex';
    btn.textContent = `🎯 にがてを克服する（${count}問）`;
  } else {
    btn.style.display = 'none';
  }
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

// 学年ごとに複数単元を持つ「非数学」科目の登録表
const NONMATH_CATEGORIES = {
  kokugo: () => KOKUGO_CATEGORIES,
  science: () => SCIENCE_CATEGORIES,
  social: () => SOCIAL_CATEGORIES,
  english: () => ENGLISH_CATEGORIES,
};

function onGradeChosen(subject, grade) {
  playClick();
  state.subject = subject;
  state.grade = grade;
  if (subject === 'math') {
    renderCategoryList();
  } else {
    renderSubjectCategoryList(subject);
  }
  showScreen('level');
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

// 国語・理科・社会・英語（すべて学年ごとに複数単元）共通のカテゴリ一覧描画
function renderSubjectCategoryList(subject) {
  const list = document.getElementById('catList');
  list.innerHTML = '';
  const cats = NONMATH_CATEGORIES[subject]()[state.grade];
  cats.forEach((cat, idx) => {
    const bestIdx = parseInt(localStorage.getItem(`kd-best-${state.profile}-${cat.id}`) || '-1');
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => {
      playClick();
      startBankQuiz(cat.id, cat.name, cat.bank);
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
// 国語・理科・社会・英語の各単元がすべてこれを使う。
// 出題の重み付け：この単元の苦手リストにある問題があれば優先的に混ぜる（最大4問）。
function startBankQuiz(catId, catName, bank) {
  state.catId = catId;
  state.catName = catName;
  state.activeBank = bank;

  const targetTotal = Math.min(10, bank.length);
  const weakQHTMLs = new Set(loadWeakList(state.profile).filter(w => w.catId === catId).map(w => w.qHTML));
  const weakItems = bank.filter(q => weakQHTMLs.has(q.qHTML));
  const restItems = bank.filter(q => !weakQHTMLs.has(q.qHTML));

  const weakSlots = Math.min(4, weakItems.length);
  const chosenWeak = shuffleArray(weakItems).slice(0, weakSlots);
  const chosenRest = shuffleArray(restItems).slice(0, targetTotal - chosenWeak.length);
  let picked = [...chosenWeak, ...chosenRest];

  // 苦手問題が多く、restItems だけでは targetTotal に届かない場合は
  // 残りの苦手問題（4問の枠を超えた分）で埋める（必ず10問＝段位満点の基準を保つため）
  if (picked.length < targetTotal) {
    const usedQHTMLs = new Set(picked.map(q => q.qHTML));
    const extraWeak = shuffleArray(weakItems.filter(q => !usedQHTMLs.has(q.qHTML)));
    picked = picked.concat(extraWeak.slice(0, targetTotal - picked.length));
  }
  picked = shuffleArray(picked);

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
  else if (state.mode === 'weak') startWeakReview();
  else startBankQuiz(state.catId, state.catName, state.activeBank);
}

// クイズ画面の「もどる」。選んだ単元の一覧（or 学年選択）に戻る。
// 途中で抜けると今回の記録は保存されないので確認を挟む。
function quitQuiz() {
  if (!confirm('クイズを中断してもどりますか？（今回の記録は保存されません）')) return;
  playClick();
  clearInterval(state.timerHandle);
  if (state.mode === 'tower') {
    showScreen('tower-subject');
    return;
  }
  if (state.mode === 'arena') {
    state.arenaFinished = true; // 中断後にタイマーが遅れて発火しても二重処理しないようにする
    showScreen('arena-subject');
    return;
  }
  if (state.subject === 'math') {
    renderCategoryList();
  } else {
    renderSubjectCategoryList(state.subject);
  }
  showScreen('level');
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

/* ---------- けいさんメモ（手書きスクラッチパッド） ---------- */
let scratchCtx = null;
let scratchInitialized = false;
let scratchDrawing = false;
let scratchLastX = 0;
let scratchLastY = 0;

function scratchPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function scratchStart(e) {
  scratchDrawing = true;
  const pos = scratchPos(e, e.currentTarget);
  scratchLastX = pos.x;
  scratchLastY = pos.y;
  e.preventDefault();
}

function scratchMove(e) {
  if (!scratchDrawing || !scratchCtx) return;
  const pos = scratchPos(e, e.currentTarget);
  scratchCtx.beginPath();
  scratchCtx.moveTo(scratchLastX, scratchLastY);
  scratchCtx.lineTo(pos.x, pos.y);
  scratchCtx.stroke();
  scratchLastX = pos.x;
  scratchLastY = pos.y;
  e.preventDefault();
}

function scratchEnd() {
  scratchDrawing = false;
}

function initScratchpad() {
  if (scratchInitialized) return;
  const canvas = document.getElementById('scratchCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return; // まだ表示されておらず幅が取れない場合は次回に持ち越す
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  scratchCtx = canvas.getContext('2d');
  scratchCtx.scale(dpr, dpr);
  scratchCtx.strokeStyle = '#1F3A5F';
  scratchCtx.lineWidth = 2.4;
  scratchCtx.lineCap = 'round';
  scratchCtx.lineJoin = 'round';

  canvas.addEventListener('pointerdown', scratchStart);
  canvas.addEventListener('pointermove', scratchMove);
  canvas.addEventListener('pointerup', scratchEnd);
  canvas.addEventListener('pointerleave', scratchEnd);
  canvas.addEventListener('pointercancel', scratchEnd);

  scratchInitialized = true;
}

function resetScratchCanvas() {
  const canvas = document.getElementById('scratchCanvas');
  if (!canvas || !scratchCtx) return;
  scratchCtx.save();
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.clearRect(0, 0, canvas.width, canvas.height);
  scratchCtx.restore();
}

function clearScratchpad() {
  playClick();
  resetScratchCanvas();
}

function nextQuestion() {
  state.locked = false;

  if (state.mode === 'arena' && !state.sessionQueue[state.qIndex]) {
    const q = drawNextArenaQuestion();
    if (!q) {
      finishArenaRound('exhausted');
      return;
    }
    state.sessionQueue[state.qIndex] = q;
  }

  if (state.qIndex >= state.total) {
    if (state.mode === 'tower') {
      finishTowerFloor();
    } else {
      finishQuiz();
    }
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
  if (state.mode === 'arena') {
    document.getElementById('qCounter').textContent = `正解 ${state.correctCount}問`;
    const pct = state.arenaTimeLimit > 0 ? (state.arenaRemainingSec / state.arenaTimeLimit) * 100 : 0;
    document.getElementById('qProgressFill').style.width = `${Math.max(pct, 0)}%`;
  } else {
    document.getElementById('qCounter').textContent = `第${state.qIndex + 1}問 / ${state.total}`;
    document.getElementById('qProgressFill').style.width = `${(state.qIndex / state.total) * 100}%`;
  }
  document.getElementById('feedbackText').innerHTML =
    q.type !== 'choice' && q.hint ? `<span>${q.hint}</span>` : '';

  const answerRow = document.querySelector('.answer-row');
  const helperBtns = document.getElementById('helperBtns');
  const choiceGrid = document.getElementById('choiceGrid');
  const input = document.getElementById('answerInput');
  const scratchpadWrap = document.getElementById('scratchpadWrap');

  if (q.type === 'choice') {
    answerRow.style.display = 'none';
    helperBtns.style.display = 'none';
    choiceGrid.style.display = 'flex';
    choiceGrid.innerHTML = '';
    scratchpadWrap.style.display = 'none';
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

    // 算数（自由記述の計算問題）のときだけ、ひっ算・計算メモ欄を表示する
    scratchpadWrap.style.display = 'block';
    initScratchpad();
    resetScratchCanvas();
  }
  updateTowerLivesHUD();
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

  // 選んだ答え・正解のボタンを見た目で強調し、それ以外は押せなくする
  const buttons = document.querySelectorAll('#choiceGrid .choice-btn');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === state.current.correct) btn.classList.add('choice-correct');
    if (i === idx) btn.classList.add(ok ? 'choice-correct' : 'choice-wrong');
  });

  handleResult(ok);
}

function handleResult(ok) {
  const cid = state.current._origCatId || state.catId;
  const cname = state.current._origCatName || state.catName;
  if (ok) {
    state.correctCount++;
    if (state.current.type === 'choice') removeFromWeakList(state.profile, cid, state.current.qHTML);
  } else {
    state.missed.push(state.current);
    if (state.current.type === 'choice') addToWeakList(state.profile, cid, cname, state.current);
    if (state.mode === 'tower') {
      state.towerFloorMisses++;
      updateTowerLivesHUD();
      playTowerLifeLost();
    }
    if (state.mode === 'arena') {
      state.arenaRemainingSec = Math.max(state.arenaRemainingSec - ARENA_WRONG_PENALTY_SEC, 0);
      updateArenaTimerDisplay();
    }
  }
  showMark(ok);
  playResultSound(ok);
  const correctDisplay =
    state.current.type === 'choice' ? state.current.choices[state.current.correct] : state.current.correctText;
  const fb = document.getElementById('feedbackText');
  fb.innerHTML = ok
    ? `<span style="color:var(--green); font-weight:700;">せいかい！</span>`
    : `正解は <b>${correctDisplay}</b> でした`;
  state.qIndex++;

  if (state.mode === 'tower' && !ok) {
    const rule = TOWER_DIFFICULTY[state.towerDifficulty];
    if (state.towerFloorMisses > rule.maxMisses) {
      setTimeout(expelFromTower, 2400);
      return;
    }
  }

  if (state.mode === 'arena' && state.arenaRemainingSec <= 0) {
    setTimeout(() => finishArenaRound('timeup'), ok ? 700 : 1200);
    return;
  }

  setTimeout(nextQuestion, ok ? 700 : 2400);
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
  recordPlayDay(state.profile);
  const rankIdx = state.correctCount;
  // 「まちがえた問題を復習する」（mode:'review'）も、ホーム画面の
  // 「にがて克服する」（mode:'weak'）と同じ扱いにする
  // （認定証の表示・ギルド依頼「にがて克服モードに1回挑戦する」の達成判定を統一するため）。
  const isWeak = state.mode === 'weak' || state.mode === 'review';
  const isScored = state.mode === 'normal'; // 復習・にがて克服は段位/累計統計の対象外
  const isPerfect = state.total > 0 && state.correctCount === state.total;

  if (isPerfect) playFanfare();

  if (isScored) {
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

    // 連続プレイ日数の更新（通常モードの1セッション完了のみでカウント）
    updateStreak(state.profile);
  }

  // クラウド連携が設定されていれば、みんなの記録へ送信する（未設定なら何もしない）
  if (isCloudConfigured()) {
    syncLeaderboard(state.profile);
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  localStorage.setItem(
    `kd-last-record-${state.profile}`,
    JSON.stringify({
      date: dateStr,
      timestamp: Date.now(),
      grade: state.grade ? GRADE_LABEL[state.grade] : '',
      category: state.subject ? `${SUBJECT_LABEL[state.subject]}「${state.catName}」` : state.catName,
      correct: state.correctCount,
      total: state.total,
      weak: isWeak
    })
  );

  document.getElementById('certEyebrow').textContent = isScored ? 'CERTIFICATE OF ACHIEVEMENT' : (isWeak ? 'WEAK POINT TRAINING' : 'REVIEW COMPLETE');
  document.getElementById('certTitle').textContent = isWeak ? 'にがて克服けっか' : '認定証';
  document.getElementById('certName').textContent = state.profile;
  document.getElementById('certRank').textContent = isScored ? RANKS[rankIdx] : `${state.correctCount}/${state.total} 正解`;
  document.getElementById('certMeta').innerHTML = isScored
    ? `${SUBJECT_LABEL[state.subject]}　${GRADE_LABEL[state.grade]}「${state.catName}」<br>${state.correctCount} / ${state.total} 問正解<br>${dateStr}`
    : `${state.catName}${isWeak ? '（にがて克服）' : ''}<br>${state.correctCount} / ${state.total} 問正解<br>${dateStr}`;

  const reviewBtn = document.getElementById('reviewBtn');
  if (state.missed.length > 0) {
    reviewBtn.style.display = 'block';
    reviewBtn.textContent = `まちがえた問題を復習する（${state.missed.length}問）`;
  } else {
    reviewBtn.style.display = 'none';
  }

  // ギルド依頼の達成判定（未登録なら何もしない）
  const guildCompleted = evaluateGuildQuests(state.profile, {
    kind: 'quiz',
    subject: state.subject,
    grade: state.grade,
    mode: state.mode,
    correctCount: state.correctCount,
    total: state.total,
    isPerfect
  });
  renderGuildQuestNotice(document.getElementById('guildQuestResultNotice'), guildCompleted);

  // 実績バッジの判定（累計データに基づくため、モードを問わず毎回チェックする）
  const newBadges = checkAndAwardBadges(state.profile);
  const badgeNotice = document.getElementById('newBadgeNotice');
  const certHighlightBtn = document.getElementById('certHighlightBtn');
  certHighlightBtn.style.display = 'none';
  certHighlightBtn.disabled = false;
  certHighlightBtn.textContent = '⭐ タイムラインでハイライトする';
  lastQuizFeedEntryId = null;
  if (newBadges.length > 0) {
    playBadgeGet();
    badgeNotice.style.display = 'block';
    badgeNotice.innerHTML = newBadges
      .map(b => `<div class="new-badge-line">${b.icon} 新しいバッジ「${b.name}」を獲得！</div>`)
      .join('');
    if (isCloudConfigured()) {
      newBadges.forEach(b => {
        postFeedEvent(state.profile, 'badge', `「${b.name}」バッジを獲得！`, b.desc, b.icon, id => {
          lastQuizFeedEntryId = id;
          certHighlightBtn.style.display = 'block';
        });
      });
    }
  } else {
    badgeNotice.style.display = 'none';
    badgeNotice.innerHTML = '';
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
    const modeLabel = r.weak ? '（にがて克服）' : r.review ? '（復習）' : '';
    box.innerHTML = `前回の記録：<b>${r.date}</b>　${r.grade || ''}　${r.category}${modeLabel}　<b>${r.correct}/${r.total}</b>問正解`;
  } catch (e) {
    box.style.display = 'none';
  }
}

/* ---------- 初期化 ---------- */
renderProfileList();

/* ---------- PWA更新の検知・反映 ----------
   GitHub Pagesはsw.js自体にキャッシュ無効化のHTTPヘッダーを付けられないため、
   特にiOSのSafari（ホーム画面追加時）で更新に気づきにくいことがある。
   新しいバージョンを検知したら画面上部にバナーを出し、
   タップで即座に新しいsw.jsへ切り替えて再読み込みする。 */
function showUpdateBanner(registration) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.style.display = 'flex';
  banner.onclick = () => applyUpdate(registration);
}

function applyUpdate(registration) {
  if (!registration || !registration.waiting) {
    window.location.reload();
    return;
  }
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then(reg => {
        // ページを開くたびに新しいsw.jsが無いか能動的に確認する
        reg.update().catch(() => {});

        // 既に新しいsw.jsが「待機中」の場合（ページを開いた直後に検知）
        if (reg.waiting) showUpdateBanner(reg);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(reg);
            }
          });
        });
      })
      .catch(() => {});
  });
}

/* ============================================================
   できごとタイムライン
   ============================================================ */
let lastQuizFeedEntryId = null; // 直近の通常クイズ結果画面で投稿したバッジのできごとID

async function highlightLastQuizFeedEvent(btn) {
  playClick();
  if (!lastQuizFeedEntryId) return;
  const ok = await highlightFeedEvent(lastQuizFeedEntryId);
  if (ok) {
    btn.textContent = '⭐ ハイライトしました';
    btn.disabled = true;
  }
}

// ホーム画面に、直近1件のできごとをちらっと表示する（タップで全体表示へ）
async function renderFamilyFeedDigest() {
  const box = document.getElementById('familyFeedDigest');
  if (!box) return;
  if (!isCloudConfigured()) {
    box.style.display = 'none';
    return;
  }
  const entry = await loadLatestFeedEntry();
  if (!entry) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = `${entry.icon || '🎉'} 最新のできごと：<b>${entry.profile}</b>さんが${entry.title}`;
}

async function renderFamilyFeedScreen() {
  const notice = document.getElementById('familyFeedNotice');
  const wrap = document.getElementById('familyFeedList');
  if (!isCloudConfigured()) {
    notice.style.display = 'block';
    notice.textContent = 'クラウド連携がまだ設定されていないため、できごとタイムラインは表示できません。';
    wrap.innerHTML = '';
    return;
  }
  notice.style.display = 'none';
  wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">読み込み中…</div>`;

  const entries = await loadFamilyFeed();
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">まだできごとがありません。バッジを取ったり、塔を踏破したり、闘技場で自己ベストを更新すると、ここに流れます。</div>`;
    return;
  }

  // リアクション集計は各できごとごとに問い合わせが必要なので、まとめて並行取得する
  const reactionCountsList = await Promise.all(entries.map(e => loadFeedReactionCounts(e.id)));

  wrap.innerHTML = '';
  entries.forEach((entry, i) => {
    const counts = reactionCountsList[i];
    const d = entry.createdAt && typeof entry.createdAt.toDate === 'function' ? entry.createdAt.toDate() : null;
    const dateStr = d ? `${d.getMonth() + 1}/${d.getDate()}` : '';
    const countsHTML = Object.entries(counts)
      .map(([emoji, count]) => `${emoji}${count}`)
      .join(' ');

    const card = document.createElement('div');
    card.className = 'cat-card';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'stretch';
    if (entry.highlighted) {
      card.style.border = '2px solid var(--gold)';
      card.style.background = 'rgba(201,138,44,0.08)';
    }
    card.innerHTML = `
      <div class="cat-body">
        <h3>${entry.highlighted ? '⭐ ' : ''}${entry.icon || ''} ${entry.profile}さん</h3>
        <span>${entry.title}${entry.detail ? '　' + entry.detail : ''}　${dateStr}</span>
      </div>
      <div class="cheer-row" style="margin-top:6px;">
        ${FEED_REACTION_EMOJIS.map(e => `<button class="cheer-btn" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      ${countsHTML ? `<div class="footnote" style="text-align:left; padding:4px 0 0;">${countsHTML}</div>` : ''}
    `;
    card.querySelectorAll('.cheer-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        playClick();
        btn.disabled = true;
        const ok = await sendFeedReaction(state.profile, entry.id, btn.dataset.emoji);
        btn.textContent = ok ? btn.dataset.emoji + '済' : btn.dataset.emoji;
      });
    });
    wrap.appendChild(card);
  });
}
