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
    const snap = await cloudDb
      .collection('cheers')
      .where('to', '==', profile)
      .orderBy('sentAt', 'desc')
      .limit(20)
      .get();
    const all = snap.docs
      .map(d => d.data())
      .filter(c => c.sentAt); // サーバー確定前の一時データを除外

    if (all.length > 0) {
      const newest = all[0].sentAt.toMillis();
      if (newest > lastSeen) localStorage.setItem(lastSeenKey, String(newest));
    }
    return all.filter(c => c.sentAt.toMillis() > lastSeen);
  } catch (e) {
    console.warn('応援の取得に失敗しました（Firestoreの複合インデックス作成が必要な場合があります）:', e);
    return [];
  }
}
