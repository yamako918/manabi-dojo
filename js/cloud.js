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

/* ============================================================
   できごとタイムライン（家族のみんなのできごとを自動で共有する）
   ・バッジ獲得・文明の塔の踏破・闘技場の自己ベスト更新を自動投稿する
   ・投稿した本人はあとから1件だけ「ハイライト」でき、
     タイムラインの先頭に優先表示される
   ・リアクションは既存の応援スタンプ（CHEER_EMOJIS）とは別の
     達成向けパレット（FEED_REACTION_EMOJIS）を使う
   ============================================================ */
// 新しく獲得したバッジ一覧を、まとめてタイムラインへ投稿する共通ヘルパー。
// クイズ・文明の塔・ギルドなど、バッジ獲得が起こりうるどの箇所からも同じ形で呼べる。
function postBadgeFeedEvents(profile, badges) {
  if (!isCloudConfigured() || !badges || badges.length === 0) return;
  badges.forEach(b => {
    postFeedEvent(profile, 'badge', `「${b.name}」バッジを獲得！`, b.desc, b.icon);
  });
}

const FEED_REACTION_EMOJIS = ['🎉', '👍', '🔥', '💪', '😊', '⭐', '🏆', '👑', '🙌'];

// 非同期だが呼び出し元をブロックしない（fire-and-forget）。
// 投稿が完了したら、渡されたコールバックにドキュメントIDを渡す
// （ハイライトボタンを有効化する際などに使う）。
function postFeedEvent(profile, kind, title, detail, icon, onPosted) {
  (async () => {
    const ok = await initCloud();
    if (!ok) return;
    try {
      const docRef = await cloudDb.collection('familyFeed').add({
        profile,
        kind,
        title,
        detail: detail || '',
        icon: icon || '🎉',
        highlighted: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (onPosted) onPosted(docRef.id);
    } catch (e) {
      console.warn('タイムラインへの投稿に失敗しました:', e);
    }
  })();
}

// 最新30件を取得する。ハイライトされたものを先頭のまとまりに、
// それ以外は新しい順のまま表示する（安定ソートなので各まとまり内の順序は保たれる）。
async function loadFamilyFeed() {
  const ok = await initCloud();
  if (!ok) return [];
  try {
    const snap = await cloudDb.collection('familyFeed').orderBy('createdAt', 'desc').limit(30).get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    entries.sort((a, b) => (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0));
    return entries;
  } catch (e) {
    console.warn('タイムラインの取得に失敗しました:', e);
    return [];
  }
}

// ホーム画面のダイジェスト表示用：最新1件だけを軽量に取得する
// （ハイライトの有無に関わらず、純粋に一番新しいできごとを返す）
async function loadLatestFeedEntry() {
  const ok = await initCloud();
  if (!ok) return null;
  try {
    const snap = await cloudDb.collection('familyFeed').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (e) {
    console.warn('最新のできごとの取得に失敗しました:', e);
    return null;
  }
}

// 自分の投稿を1件ハイライトする（一方向のみ、解除は用意しない）
async function highlightFeedEvent(entryId) {
  const ok = await initCloud();
  if (!ok || !entryId) return false;
  try {
    await cloudDb.collection('familyFeed').doc(entryId).update({ highlighted: true });
    return true;
  } catch (e) {
    console.warn('ハイライトの設定に失敗しました:', e);
    return false;
  }
}

// 指定したできごとへリアクションを送る
async function sendFeedReaction(from, entryId, emoji) {
  if (!FEED_REACTION_EMOJIS.includes(emoji)) return false;
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('feedReactions').add({
      entryId,
      from,
      emoji,
      sentAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('リアクションの送信に失敗しました:', e);
    return false;
  }
}

// 指定したできごとに対するリアクションを絵文字ごとに集計して返す（例: {'🎉': 2, '👍': 1}）
async function loadFeedReactionCounts(entryId) {
  const ok = await initCloud();
  if (!ok) return {};
  try {
    const snap = await cloudDb.collection('feedReactions').where('entryId', '==', entryId).limit(100).get();
    const counts = {};
    snap.docs.forEach(d => {
      const emoji = d.data().emoji;
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return counts;
  } catch (e) {
    console.warn('リアクション集計の取得に失敗しました:', e);
    return {};
  }
}

