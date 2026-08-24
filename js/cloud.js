/* ============================================================
   フェーズ2: クラウド連携（Firebase）
   ・みんなの記録（端末をまたいだゆるいランキング）
   ・応援スタンプの送受信
   ------------------------------------------------------------
   js/firebase-config.js が未設定（テンプレートのまま）の場合、
   このファイルのすべての関数は何もせず安全に終了する。
   つまりFirebaseを設定しなくても、まなび道場は今まで通り
   完全にオフラインで動作する。
   ============================================================ */

let cloudApp = null;
let cloudDb = null;
let cloudReady = false;
let cloudInitPromise = null;

const CHEER_EMOJIS = ['🎉', '👍', '🔥', '💪', '😊', '⭐'];

function isCloudConfigured() {
  return (
    typeof FIREBASE_CONFIG !== 'undefined' &&
    FIREBASE_CONFIG &&
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.apiKey !== 'ここに置き換え' &&
    typeof firebase !== 'undefined'
  );
}

// 初期化は一度だけ行う（複数箇所から呼ばれても安全なようにPromiseをキャッシュする）
function initCloud() {
  if (cloudInitPromise) return cloudInitPromise;
  cloudInitPromise = (async () => {
    if (!isCloudConfigured()) return false;
    try {
      cloudApp = firebase.initializeApp(FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      cloudDb = firebase.firestore();
      cloudReady = true;
      return true;
    } catch (e) {
      console.warn('Firebaseの初期化に失敗しました（クラウド機能なしで続行します）:', e);
      cloudReady = false;
      return false;
    }
  })();
  return cloudInitPromise;
}

// このプロフィールの現在の状況をリーダーボードへ送信する
async function syncLeaderboard(profile) {
  const ok = await initCloud();
  if (!ok) return false;
  try {
    const ctx = buildBadgeContext(profile);
    const streak = loadStreak(profile);
    await cloudDb.collection('leaderboard').doc(profile).set({
      name: profile,
      streakCount: streak.count || 0,
      perfectCount: ctx.perfectCount || 0,
      totalCorrect: ctx.totalCorrect || 0,
      badgeCount: loadBadges(profile).length,
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('リーダーボードの送信に失敗しました:', e);
    return false;
  }
}

// みんなの記録を取得する（累計正解数の多い順、最大20件）
async function loadLeaderboard() {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    const snap = await cloudDb.collection('leaderboard').orderBy('totalCorrect', 'desc').limit(20).get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('リーダーボードの取得に失敗しました（Firestoreの複合インデックス作成が必要な場合があります）:', e);
    return [];
  }
}

// 応援スタンプを送る（絵文字は決められたものだけ・自由記述は不可）
async function sendCheer(fromProfile, toProfile, emoji) {
  if (!CHEER_EMOJIS.includes(emoji)) return false;
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('cheers').add({
      from: fromProfile,
      to: toProfile,
      emoji,
      sentAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('応援の送信に失敗しました:', e);
    return false;
  }
}

// 前回チェックしてから届いた新しい応援だけを取得する
async function loadNewCheers(profile) {
  const ok = await initCloud();
  if (!ok) return [];
  const lastSeenKey = `kd-cheers-lastseen-${profile}`;
  const lastSeen = parseInt(localStorage.getItem(lastSeenKey) || '0', 10);
  try {
    // where + orderBy の組み合わせは複合インデックスが必要になるため、
    // あえて orderBy を使わず取得してからJS側でソートする（設定不要にするため）
    const snap = await cloudDb
      .collection('cheers')
      .where('to', '==', profile)
      .limit(50)
      .get();
    const all = snap.docs
      .map(d => d.data())
      .filter(c => c.sentAt) // サーバー確定前の一時データを除外
      .sort((a, b) => b.sentAt.toMillis() - a.sentAt.toMillis())
      .slice(0, 20);

    if (all.length > 0) {
      const newest = all[0].sentAt.toMillis();
      if (newest > lastSeen) localStorage.setItem(lastSeenKey, String(newest));
    }
    return all.filter(c => c.sentAt.toMillis() > lastSeen);
  } catch (e) {
    console.warn('応援の取得に失敗しました:', e);
    return [];
  }
}

/* ---------- ギルド週間ポイントランキング ---------- */
// ドキュメントID = `${プロフィール名}_${週キー}` として週ごとに別ドキュメントにすることで、
// 「今週のランキング」を取得する際に複合インデックスなしの単純な where だけで済むようにしている。
async function syncGuildWeeklyPoints(profile, rankId, weekKey, points) {
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('guildWeekly').doc(`${profile}_${weekKey}`).set({
      name: profile,
      weekKey,
      points,
      rank: rankId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('ギルドポイントの送信に失敗しました:', e);
    return false;
  }
}

// 指定した週のギルドポイントランキングを取得する（上位20件、ポイント降順）
async function loadGuildWeeklyRanking(weekKey) {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    // where + orderBy の組み合わせは複合インデックスが必要になるため、
    // あえて orderBy を使わず取得してからJS側でソートする（設定不要にするため）
    const snap = await cloudDb.collection('guildWeekly').where('weekKey', '==', weekKey).limit(50).get();
    return snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 20);
  } catch (e) {
    console.warn('ギルドランキングの取得に失敗しました:', e);
    return [];
  }
}

/* ---------- 闘技場ランキング ---------- */
// ドキュメントID = `${プロフィール名}_${制限時間キー}` として、
// プロフィールごとに「その制限時間での自己ベスト」だけを1件保持する。
// 呼び出し側（arena.js）で新記録のときだけ呼ぶ想定。
async function syncArenaResult(profile, timeLimitKey, correctCount, subject, grade) {
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('arenaRanking').doc(`${profile}_${timeLimitKey}`).set({
      name: profile,
      timeLimitKey,
      correctCount,
      subject,
      grade,
      achievedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('闘技場の記録の送信に失敗しました:', e);
    return false;
  }
}

// 指定した制限時間キーのランキングを取得する（上位20件、正解数降順）
async function loadArenaRanking(timeLimitKey) {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    const snap = await cloudDb.collection('arenaRanking').where('timeLimitKey', '==', timeLimitKey).limit(50).get();
    return snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.correctCount || 0) - (a.correctCount || 0))
      .slice(0, 20);
  } catch (e) {
    console.warn('闘技場ランキングの取得に失敗しました:', e);
    return [];
  }
}

/* ---------- 文明の塔の踏破記録 ---------- */
// 塔を踏破（cleared:true）するたびに1件追加する（改ざん防止のため追加のみ許可）。
// 同じ人が複数回踏破することもあるため、ドキュメントIDは自動採番でよい
// （「直近1週間に踏破した人」を調べる際はJS側で名前を重複排除する）。
async function syncTowerConquest(profile, subject, difficulty, reachedFloor) {
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('towerConquests').add({
      name: profile,
      subject,
      difficulty,
      reachedFloor,
      achievedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('塔踏破記録の送信に失敗しました:', e);
    return false;
  }
}

// 指定した時刻（ミリ秒）以降に塔を踏破した人のプロフィール名一覧を返す
// （別端末のプロフィールも含む、重複あり得るので呼び出し側でSet等に入れて重複排除する）。
async function loadRecentTowerConquerors(sinceMs) {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    // achievedAt単体でのorderByは単一フィールドなので複合インデックス不要。
    // 直近50件を取得してからJS側で時刻フィルタする。
    const snap = await cloudDb.collection('towerConquests').orderBy('achievedAt', 'desc').limit(50).get();
    return snap.docs
      .map(d => d.data())
      .filter(c => c.achievedAt && typeof c.achievedAt.toMillis === 'function' && c.achievedAt.toMillis() >= sinceMs)
      .map(c => c.name);
  } catch (e) {
    console.warn('塔踏破記録の取得に失敗しました:', e);
    return [];
  }
}

// 「踏破の石碑」用：完璧主義（solo）・魔法のお守り（amulet）での踏破記録のみを、
// 日付の昇順（古い記録が先）で全件取得する。ランキングとは異なり、期間で
// リセットされない永続的な記録として扱う。
async function loadTowerMonument() {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    // 単一フィールドへの in 演算子は複合インデックス不要。
    const snap = await cloudDb
      .collection('towerConquests')
      .where('difficulty', 'in', ['solo', 'amulet'])
      .limit(300)
      .get();
    return snap.docs
      .map(d => d.data())
      .filter(c => c.achievedAt && typeof c.achievedAt.toMillis === 'function')
      .sort((a, b) => a.achievedAt.toMillis() - b.achievedAt.toMillis());
  } catch (e) {
    console.warn('踏破の石碑の取得に失敗しました:', e);
    return [];
  }
}

