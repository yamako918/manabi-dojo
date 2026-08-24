/* ============================================================
   ギルド（Guild）
   ・冒険者ランクを登録してライセンスを受け取る
   ・登録ランクに応じた依頼が毎日3つランダムに表示される
   ・依頼を達成するとギルドポイントを獲得する
   ・ギルドポイントはウィークリーでランキング表示される（Firestore経由）
   ------------------------------------------------------------
   週の境界について：
   仕様上は「日曜08:00に開始し土曜20:00に終了する」だが、開始・終了を
   別々の境界として判定すると、土曜20:00〜日曜08:00の12時間の隙間で
   時系列の前後が入れ替わる不整合が起きる（例：土曜21時のポイントが
   翌週扱いになる一方、日曜3時のポイントが前週扱いになってしまう）。
   そのため実装上は「日曜08:00を起点とする7日間隔の単純な周期境界」
   に単純化し、単調性（時系列が前後しないこと）を保証する。
   「土曜20:00終了」という説明は、ランキング画面上の受付案内の文言
   として表示する（実際の集計・リセット境界は日曜08:00固定）。
   ------------------------------------------------------------
   js/firebase-config.js が未設定の場合、ランキング関連の関数は
   何もせず安全に終了する（ローカルの依頼・ポイントは通常通り機能する）。
   ============================================================ */

// 冒険者ランク：アプリの学習内容が小6〜中3までのため、
// 「高校生以上」は中3相当の内容を対象にする。
const GUILD_RANKS = {
  elem: { label: '小学生', grade: 'g6' },
  jhs1: { label: '中学1年生', grade: 'g7' },
  jhs2: { label: '中学2年生', grade: 'g8' },
  jhs3: { label: '中学3年生', grade: 'g9' },
  highschool: { label: '高校生以上', grade: 'g9' },
};
const GUILD_RANK_ORDER = ['elem', 'jhs1', 'jhs2', 'jhs3', 'highschool'];

const GUILD_QUEST_POINTS = { subject_clear: 10, perfect_clear: 20, correct_count: 10, weak_review: 15, tower_floor: 25 };

/* ---------- 週の境界計算 ---------- */
const GUILD_WEEK_ANCHOR_MS = new Date(2024, 0, 7, 8, 0, 0, 0).getTime(); // 2024-01-07は日曜日
const GUILD_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function guildWeekKey(date = new Date()) {
  const idx = Math.floor((date.getTime() - GUILD_WEEK_ANCHOR_MS) / GUILD_WEEK_MS);
  const start = new Date(GUILD_WEEK_ANCHOR_MS + idx * GUILD_WEEK_MS);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

// 「直近に終了した（確定済みの）週」のキーを返す。今週はまだ進行中で
// 最終順位が確定していないため、1位バッジの判定には使わない。
function guildPreviousWeekKey(date = new Date()) {
  return guildWeekKey(new Date(date.getTime() - GUILD_WEEK_MS));
}

/* ---------- ライセンス（冒険者登録） ---------- */
function loadGuildLicense(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-guild-license-${profile}`));
  } catch (e) {
    return null;
  }
}
function saveGuildLicense(profile, license) {
  localStorage.setItem(`kd-guild-license-${profile}`, JSON.stringify(license));
}
function isGuildRegistered(profile) {
  return !!loadGuildLicense(profile);
}

// 初回登録・ランク変更のどちらもこの関数を通す。
// 初回登録日（registeredAt）は変更時も保持し、ランク変更日時（rankChangedAt）を別途記録する。
function registerGuildLicense(profile, rankId) {
  const existing = loadGuildLicense(profile);
  const registeredAt = existing ? existing.registeredAt : Date.now();
  saveGuildLicense(profile, { rankId, registeredAt, rankChangedAt: Date.now() });
  const newBadges = checkAndAwardBadges(profile); // 「ギルド登録」バッジ判定
  if (newBadges.length > 0) playBadgeGet();
}

/* ---------- 累計進捗（依頼達成数・累計ポイント） ---------- */
function loadGuildProgress(profile) {
  try {
    return JSON.parse(localStorage.getItem(`kd-guild-progress-${profile}`)) || { totalQuestsCompleted: 0, totalPointsAllTime: 0 };
  } catch (e) {
    return { totalQuestsCompleted: 0, totalPointsAllTime: 0 };
  }
}
function saveGuildProgress(profile, progress) {
  localStorage.setItem(`kd-guild-progress-${profile}`, JSON.stringify(progress));
}

/* ---------- 週間ギルドポイント（週が変わったら自動的に0にリセット） ---------- */
function loadGuildWeekPoints(profile) {
  const wk = guildWeekKey();
  let data;
  try {
    data = JSON.parse(localStorage.getItem(`kd-guild-weekpoints-${profile}`));
  } catch (e) {
    data = null;
  }
  if (!data || data.weekKey !== wk) {
    data = { weekKey: wk, points: 0 };
    localStorage.setItem(`kd-guild-weekpoints-${profile}`, JSON.stringify(data));
  }
  return data;
}
function addGuildWeekPoints(profile, amount) {
  const data = loadGuildWeekPoints(profile); // 週替わりの繰り上げも兼ねる
  data.points += amount;
  localStorage.setItem(`kd-guild-weekpoints-${profile}`, JSON.stringify(data));
  return data;
}

/* ---------- 依頼プール（ランクの学年に応じて生成） ---------- */
function buildGuildQuestPool(rankId) {
  const rank = GUILD_RANKS[rankId];
  const grade = rank.grade;
  const gradeLabel = GRADE_LABEL[grade];
  const pool = [];
  SUBJECT_ORDER.forEach(subject => {
    pool.push({
      type: 'subject_clear', subject, grade,
      label: `${gradeLabel}の${SUBJECT_LABEL[subject]}を1単元クリアする`,
      points: GUILD_QUEST_POINTS.subject_clear,
    });
    pool.push({
      type: 'perfect_clear', subject, grade,
      label: `${gradeLabel}の${SUBJECT_LABEL[subject]}で全問正解（10問）する`,
      points: GUILD_QUEST_POINTS.perfect_clear,
    });
  });
  pool.push({ type: 'correct_count', threshold: 8, label: '1回のクイズで8問以上正解する', points: GUILD_QUEST_POINTS.correct_count });
  pool.push({ type: 'weak_review', label: 'にがて克服モードに1回挑戦する', points: GUILD_QUEST_POINTS.weak_review });
  pool.push({ type: 'tower_floor', label: '文明の塔でどこかの階を1つ突破する', points: GUILD_QUEST_POINTS.tower_floor });
  return pool;
}

/* ---------- 今日の依頼（3件・日替わり） ---------- */
function generateGuildDailyQuests(profile) {
  const license = loadGuildLicense(profile);
  if (!license) return [];
  const pool = buildGuildQuestPool(license.rankId);
  const picked = shuffleArray(pool).slice(0, Math.min(3, pool.length));
  const today = todayDateStr();
  return picked.map((q, i) => ({ ...q, id: `${today}_${i}`, completed: false }));
}

function loadGuildDailyQuests(profile) {
  const today = todayDateStr();
  let data;
  try {
    data = JSON.parse(localStorage.getItem(`kd-guild-quests-${profile}`));
  } catch (e) {
    data = null;
  }
  if (!data || data.date !== today) {
    data = { date: today, quests: generateGuildDailyQuests(profile) };
    localStorage.setItem(`kd-guild-quests-${profile}`, JSON.stringify(data));
  }
  return data;
}
function saveGuildDailyQuests(profile, data) {
  localStorage.setItem(`kd-guild-quests-${profile}`, JSON.stringify(data));
}

// ランク変更時に呼び出す。本日すでに達成済みの依頼（報酬・累計は加算済み）は
// そのまま残し、まだ達成していない依頼だけを新しいランクの内容に差し替える。
function regenerateGuildDailyQuests(profile) {
  const today = todayDateStr();
  const current = loadGuildDailyQuests(profile); // 本日分のデータを確実に用意する
  const stillCompleted = current.quests.filter(q => q.completed);
  const needed = Math.max(3 - stillCompleted.length, 0);

  const license = loadGuildLicense(profile);
  const pool = buildGuildQuestPool(license.rankId);
  const usedLabels = new Set(stillCompleted.map(q => q.label));
  const freshPool = pool.filter(q => !usedLabels.has(q.label));
  const picked = shuffleArray(freshPool).slice(0, needed);
  const newQuests = picked.map((q, i) => ({ ...q, id: `${today}_change_${i}`, completed: false }));

  saveGuildDailyQuests(profile, { date: today, quests: [...stillCompleted, ...newQuests] });
}

/* ---------- 依頼の達成判定 ----------
   quiz完了・塔の階クリアなど「できごと」が起きるたびに呼び出し、
   本日の未達成の依頼と照合する。 */
function questMatchesEvent(q, ev) {
  if (q.type === 'subject_clear') {
    return ev.kind === 'quiz' && ev.mode === 'normal' && ev.subject === q.subject && ev.grade === q.grade;
  }
  if (q.type === 'perfect_clear') {
    return ev.kind === 'quiz' && ev.mode === 'normal' && ev.subject === q.subject && ev.grade === q.grade && ev.isPerfect;
  }
  if (q.type === 'correct_count') {
    return ev.kind === 'quiz' && ev.mode === 'normal' && ev.correctCount >= q.threshold;
  }
  if (q.type === 'weak_review') {
    return ev.kind === 'quiz' && ev.mode === 'weak';
  }
  if (q.type === 'tower_floor') {
    return ev.kind === 'tower_floor';
  }
  return false;
}

function evaluateGuildQuests(profile, eventInfo) {
  if (!isGuildRegistered(profile)) return [];
  const data = loadGuildDailyQuests(profile);
  let changed = false;
  const newlyCompleted = [];
  data.quests.forEach(q => {
    if (q.completed) return;
    if (questMatchesEvent(q, eventInfo)) {
      q.completed = true;
      changed = true;
      newlyCompleted.push(q);
    }
  });
  if (changed) {
    saveGuildDailyQuests(profile, data);
    const progress = loadGuildProgress(profile);
    let weekData = null;
    newlyCompleted.forEach(q => {
      progress.totalQuestsCompleted += 1;
      progress.totalPointsAllTime += q.points;
      weekData = addGuildWeekPoints(profile, q.points);
    });
    saveGuildProgress(profile, progress);

    // クラウド連携が設定されていれば、今週のポイントを送信する（未設定なら何もしない）
    if (isCloudConfigured() && weekData) {
      const license = loadGuildLicense(profile);
      syncGuildWeeklyPoints(profile, license.rankId, weekData.weekKey, weekData.points);
    }

    playGuildQuestCoin(); // 依頼達成のコイン獲得音
    const newBadges = checkAndAwardBadges(profile);
    if (newBadges.length > 0) playBadgeGet();
  }
  return newlyCompleted;
}

// 「ギルド依頼を達成しました」の通知欄を描画する共通ヘルパー
// （通常クイズの結果画面／文明の塔の階クリア画面・結果画面で共用する）
function renderGuildQuestNotice(el, completedList) {
  if (!el) return;
  if (completedList && completedList.length > 0) {
    el.style.display = 'block';
    el.innerHTML = completedList
      .map(q => `<div class="new-badge-line">📋 ギルド依頼「${q.label}」達成！ +${q.points}pt</div>`)
      .join('');
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

/* ---------- 画面：ギルドへの入口 ---------- */
function openGuild() {
  playClick();
  if (isGuildRegistered(state.profile)) {
    showScreen('guild');
  } else {
    showScreen('guild-register');
  }
}

// ダッシュボードの「ランクを変更する」から呼ばれる
function openGuildRankChange() {
  playClick();
  showScreen('guild-register');
}

// 登録/変更どちらの画面からの「もどる」かで戻り先を分ける
function backFromGuildRegister() {
  playClick();
  if (isGuildRegistered(state.profile)) {
    showScreen('guild');
  } else {
    fieldOutsideActive = true;
    showScreen('subjects');
  }
}

/* ---------- 画面：冒険者ランク登録・変更 ---------- */
function renderGuildRegisterScreen() {
  const license = loadGuildLicense(state.profile);
  const isChange = !!license;

  const header = document.getElementById('guildRegisterHeader');
  header.innerHTML = isChange
    ? `<div class="kanji">組</div><h2>冒険者ランクの変更</h2><p>新しいランクを選ぶと、本日まだ達成していない依頼が新しいランクの内容に入れ替わります（達成済みの依頼はそのまま残ります）</p>`
    : `<div class="kanji">組</div><h2>ギルドへようこそ</h2><p>冒険者ランクを選んでライセンスを受け取ろう</p>`;

  const list = document.getElementById('guildRankList');
  list.innerHTML = '';
  GUILD_RANK_ORDER.forEach((rankId, idx) => {
    const rank = GUILD_RANKS[rankId];
    const isCurrent = isChange && license.rankId === rankId;
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.onclick = () => completeGuildRegistration(rankId);
    div.innerHTML = `
      <div class="cat-num">${String(idx + 1).padStart(2, '0')}</div>
      <div class="cat-body">
        <h3>${rank.label}${isCurrent ? '　✅現在のランク' : ''}</h3>
        <span>${isChange ? 'このランクに変更する' : 'このランクでギルドに登録し、依頼を受けられるようにする'}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function completeGuildRegistration(rankId) {
  playClick();
  const wasRegistered = isGuildRegistered(state.profile);
  const prevRankId = wasRegistered ? loadGuildLicense(state.profile).rankId : null;
  registerGuildLicense(state.profile, rankId);
  if (wasRegistered && prevRankId !== rankId) {
    regenerateGuildDailyQuests(state.profile);
  }
  showScreen('guild');
}

/* ---------- 画面：ギルドのダッシュボード（ライセンス・今日の依頼・週間ポイント） ---------- */
function renderGuildScreen() {
  const license = loadGuildLicense(state.profile);
  if (!license) {
    showScreen('guild-register');
    return;
  }
  const rank = GUILD_RANKS[license.rankId];
  const progress = loadGuildProgress(state.profile);

  const card = document.getElementById('guildLicenseCard');
  card.style.setProperty('--stripe', '#2E6B4A');
  card.innerHTML = `
    <div class="kanji">証</div>
    <h2>冒険者ライセンス</h2>
    <p>${state.profile}　ランク：${rank.label}<br>累計依頼達成：${progress.totalQuestsCompleted}件・累計ポイント：${progress.totalPointsAllTime}pt</p>
  `;

  const wk = loadGuildWeekPoints(state.profile);
  document.getElementById('guildWeekPoints').innerHTML =
    `今週のギルドポイント：<b>${wk.points}</b> pt`;

  const noticeEl = document.getElementById('guildQuestNotice');
  noticeEl.style.display = 'none';
  noticeEl.innerHTML = '';

  const quests = loadGuildDailyQuests(state.profile).quests;
  const list = document.getElementById('guildQuestList');
  list.innerHTML = '';
  if (quests.length === 0) {
    list.innerHTML = `<div class="profile-empty">本日の依頼を準備中です。</div>`;
    return;
  }
  quests.forEach(q => {
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.innerHTML = `
      <div class="cat-body">
        <h3>${q.completed ? '✅ ' : '📋 '}${q.label}</h3>
        <span>報酬：${q.points}pt${q.completed ? '（達成済み）' : '（未達成）'}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

/* ---------- 画面：週間ギルドポイントランキング ---------- */
async function renderGuildRankingScreen() {
  document.getElementById('guildRankingPeriod').textContent =
    '集計期間：日曜8:00〜土曜20:00（日曜8:00に自動でリセットされます）';

  const badgeNotice = document.getElementById('guildRankingBadgeNotice');
  badgeNotice.style.display = 'none';
  badgeNotice.innerHTML = '';

  const notice = document.getElementById('guildRankingNotice');
  const wrap = document.getElementById('guildRankingList');

  if (!isCloudConfigured()) {
    notice.style.display = 'block';
    notice.textContent = 'クラウド連携がまだ設定されていないため、みんなのランキングは表示できません（自分の今週のポイントはギルド画面で確認できます）。';
    wrap.innerHTML = '';
    return;
  }
  notice.style.display = 'none';
  wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">読み込み中…</div>`;

  const license = loadGuildLicense(state.profile);
  const wk = loadGuildWeekPoints(state.profile);
  if (license) {
    await syncGuildWeeklyPoints(state.profile, license.rankId, wk.weekKey, wk.points);
  }

  // 表示は「今週」の進行中の暫定順位（まだ確定していない）
  // 0pt（今週まだ依頼を達成していない）のプロフィールは、ランキング画面を
  // 開いただけで登録されてしまう場合があるため、表示からは除外する
  const list = (await loadGuildWeeklyRanking(wk.weekKey)).filter(entry => (entry.points || 0) > 0);
  wrap.innerHTML = '';
  if (list.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:14px 0;">まだ今週の記録がありません。依頼を達成すると自動的に登録されます。</div>`;
  } else {
    list.forEach((entry, idx) => {
      const isSelf = entry.name === state.profile;
      const row = document.createElement('div');
      row.className = 'cat-card';
      const rankLabel = GUILD_RANKS[entry.rank] ? GUILD_RANKS[entry.rank].label : '';
      row.innerHTML = `
        <div class="cat-num">${idx + 1}</div>
        <div class="cat-body">
          <h3>${entry.name}${isSelf ? '（自分）' : ''}</h3>
          <span>${entry.points || 0} pt・${rankLabel}</span>
        </div>
      `;
      wrap.appendChild(row);
    });
  }

  // 「週間ランキング1位」バッジは、まだ進行中の今週の暫定順位では絶対に判定しない。
  // 直近に終了し、最終結果が確定した「先週」のデータだけを見て判定する。
  // 家族利用規模のアプリであり、他プロフィールの同期タイミングがずれることも
  // あるため、一度確認したら終わりにはせず、画面を開くたびに毎回再確認する
  // （badgeは一度付与されたら取り消されないので、再確認のコストのみで安全）。
  const prevWeekKey = guildPreviousWeekKey();
  const prevList = await loadGuildWeeklyRanking(prevWeekKey);
  // 全員0ポイント（誰も依頼を達成していない週）での「1位」は達成扱いにしない
  if (prevList.length > 0 && prevList[0].name === state.profile && (prevList[0].points || 0) > 0) {
    const newly = awardBadgeDirect(state.profile, 'guild_rank_1');
    if (newly) {
      playBadgeGet();
      badgeNotice.style.display = 'block';
      badgeNotice.innerHTML = `<div class="new-badge-line">${newly.icon} 新しいバッジ「${newly.name}」を獲得！（先週の最終結果より）</div>`;
    }
  }
}

// BADGE_DEFSのcheck()による自動判定を経由しない特殊なバッジを直接付与する
function awardBadgeDirect(profile, badgeId) {
  const earned = loadBadges(profile);
  if (earned.includes(badgeId)) return null;
  earned.push(badgeId);
  saveBadges(profile, earned);
  return BADGE_DEFS.find(b => b.id === badgeId) || null;
}
