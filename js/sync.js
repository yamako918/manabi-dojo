/* ============================================================
   プロフィールデータのクラウド同期（Firestore）
   ------------------------------------------------------------
   方針：write-through キャッシュ
   ・localStorage は従来どおり同期APIのキャッシュとして使い続ける
     （buildBadgeContext 等の同期呼び出しを書き換えずに済ませるため）。
   ・正本は Firestore の profileData/{プロフィール名}（1プロフィール=1ドキュメント）。
   ・書き込みは kdSet() 経由。変更後 KD_SYNC_DEBOUNCE_MS 待ってから
     「トランザクションで リモート取得 → キー別ルールでマージ → 書き戻し」を行う。
   ・プロフィール選択時にも同じ同期を行う（pull）。リモートが無ければ
     旧コレクション（familyFeed 等）から復元できる分を再構成する。
   ・マージは「最大値／和集合／新しい方」で単調に収束する設計のため、
     何度実行しても、端末間で順序が入れ替わっても進捗を失わない。
   ------------------------------------------------------------
   js/firebase-config.js が未設定の場合は何もせず、従来どおり
   localStorage だけで動作する。
   ============================================================ */

// 同期対象キー（kd-{type}-{profile} / kd-{type}-{profile}-{sub}）
const KD_SIMPLE_TYPES = [
  'last-record', 'weak', 'weak-tomb', 'streak', 'weak-cleared', 'badges', 'playdays',
  'tower', 'guild-license', 'guild-progress', 'guild-weekpoints', 'guild-quests',
  'guild-weeklyquest', 'arena-best'
];
const KD_SUB_TYPES = ['best', 'stats', 'tower-history'];

const KD_SYNC_DEBOUNCE_MS = 3000;
const KD_SYNC_SELECT_TIMEOUT_MS = 4000;
const KD_SYNC_PENDING_KEY = 'kd-sync-pending';
const KD_TOMB_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const KD_VALUE_MAX_CHARS = 200000;
const KD_MAX_PROFILES = 8;

let kdSyncTimers = {};
let kdSyncDirtyVersion = {};
let kdSyncInFlight = {};
let kdSyncRerun = {};

/* ---------- キーの解析 ---------- */
// 「A」と「A-B」のように名前が前方一致するプロフィールがあっても取り違えないよう、
// 長い名前から順に照合する。
function parseKdKey(key) {
  if (typeof key !== 'string' || !key.startsWith('kd-')) return null;
  const profiles = getProfiles().slice().sort((a, b) => b.length - a.length);
  for (const p of profiles) {
    for (const t of KD_SIMPLE_TYPES) {
      if (key === `kd-${t}-${p}`) return { profile: p, type: t, sub: null };
    }
    for (const t of KD_SUB_TYPES) {
      const pre = `kd-${t}-${p}-`;
      if (key.startsWith(pre) && key.length > pre.length) {
        return { profile: p, type: t, sub: key.slice(pre.length) };
      }
    }
  }
  return null;
}
function kdKeyFor(profile, type, sub) {
  return sub == null ? `kd-${type}-${profile}` : `kd-${type}-${profile}-${sub}`;
}
function kvShortKey(type, sub) {
  return sub == null ? type : `${type}:${sub}`;
}
function splitKvShortKey(short) {
  const i = short.indexOf(':');
  if (i < 0) return { type: short, sub: null };
  return { type: short.slice(0, i), sub: short.slice(i + 1) };
}
// リモートは信頼しない：既知のtypeかつ文字列値だけを受け入れる
function isValidKvEntry(short, value) {
  if (typeof short !== 'string' || typeof value !== 'string') return false;
  if (value.length > KD_VALUE_MAX_CHARS) return false;
  const { type, sub } = splitKvShortKey(short);
  if (sub == null) return KD_SIMPLE_TYPES.includes(type);
  return KD_SUB_TYPES.includes(type) && sub.length > 0;
}
function sanitizeKv(kv) {
  const out = {};
  if (!kv || typeof kv !== 'object') return out;
  Object.keys(kv).forEach(k => {
    if (isValidKvEntry(k, kv[k])) out[k] = kv[k];
  });
  return out;
}
function kvEqual(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

/* ---------- ローカルの読み出し・反映 ---------- */
function collectLocalKv(profile) {
  const kv = {};
  Object.keys(localStorage).forEach(key => {
    const pk = parseKdKey(key);
    if (!pk || pk.profile !== profile) return;
    const v = localStorage.getItem(key);
    if (v == null) return;
    kv[kvShortKey(pk.type, pk.sub)] = v;
  });
  return kv;
}
// 同期結果をキャッシュへ反映する（kdSet を通さない＝再同期のループを起こさない）
function applyKvToLocal(profile, kv) {
  Object.keys(kv).forEach(short => {
    if (!isValidKvEntry(short, kv[short])) return;
    const { type, sub } = splitKvShortKey(short);
    const key = kdKeyFor(profile, type, sub);
    if (localStorage.getItem(key) !== kv[short]) localStorage.setItem(key, kv[short]);
  });
}
function removeLocalProfileData(profile) {
  Object.keys(localStorage).forEach(key => {
    const pk = parseKdKey(key);
    if (pk && pk.profile === profile) localStorage.removeItem(key);
  });
  localStorage.removeItem(`kd-playdays-cloudcount-${profile}`);
  localStorage.removeItem(`kd-cheers-lastseen-${profile}`);
}

/* ---------- マージ規則（キー別・単調） ---------- */
function kdParse(s, fallback) {
  if (s == null) return fallback;
  try {
    const v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
// 端末ごとにマージ順が違っても同じ文字列に収束させる（収束しないと、同期のたびに
// 互いの書き込みが入れ替わり続けるため）。キー順の正規化・同点時の決定的な選択を行う。
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => {
      o[k] = sortKeysDeep(v[k]);
    });
    return o;
  }
  return v;
}
function canonStr(s) {
  try {
    return JSON.stringify(sortKeysDeep(JSON.parse(s)));
  } catch (e) {
    return s;
  }
}
// スコアの高い方（文字列 a / b）を返す。同点は文字列の大きい方で決める（順序に依存しない）。
function cmpPick(sa, sb, a, b) {
  if (sb > sa) return b;
  if (sa > sb) return a;
  return a >= b ? a : b;
}
function unionSorted(a, b) {
  return unionArr(a, b).sort();
}
function unionArr(a, b) {
  const out = [];
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(x => {
    if (!out.includes(x)) out.push(x);
  });
  return out;
}
function maxInts(a, b) {
  const x = parseInt(a, 10);
  const y = parseInt(b, 10);
  if (isNaN(x)) return b;
  if (isNaN(y)) return a;
  return String(Math.max(x, y));
}
function maxFields(a, b, fields) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const out = { ...ob, ...oa };
  fields.forEach(f => {
    out[f] = Math.max(oa[f] || 0, ob[f] || 0);
  });
  return JSON.stringify(out);
}
function mergeWeakLists(a, b) {
  const map = new Map();
  [...kdParse(a, []), ...kdParse(b, [])].forEach(w => {
    if (!w || typeof w.qHTML !== 'string') return;
    const k = `${w.catId}|${w.qHTML}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, w);
      return;
    }
    const base =
      cmpPick(prev.lastMissed || 0, w.lastMissed || 0, JSON.stringify(prev), JSON.stringify(w)) === JSON.stringify(w) ? w : prev;
    map.set(k, { ...base, missCount: Math.max(prev.missCount || 1, w.missCount || 1) });
  });
  return JSON.stringify(Array.from(map.entries()).sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(e => e[1]));
}
function mergeWeakTombs(a, b) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const out = {};
  const cutoff = Date.now() - KD_TOMB_KEEP_MS;
  new Set([...Object.keys(oa), ...Object.keys(ob)]).forEach(k => {
    const t = Math.max(oa[k] || 0, ob[k] || 0);
    if (t >= cutoff) out[k] = t;
  });
  return JSON.stringify(out);
}
// 克服（正解して削除）済みの問題が、別端末の古いリストから復活しないようにする
function applyWeakTombs(weakStr, tombStr) {
  const tombs = kdParse(tombStr, {});
  const list = kdParse(weakStr, []).filter(w => !((tombs[`${w.catId}|${w.qHTML}`] || 0) >= (w.lastMissed || 0)));
  return JSON.stringify(list);
}
function mergeTower(a, b) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const out = {};
  new Set([...Object.keys(oa), ...Object.keys(ob)]).forEach(s => {
    const x = oa[s] || {};
    const y = ob[s] || {};
    out[s] = {
      bestFloor: Math.max(x.bestFloor || 0, y.bestFloor || 0),
      clearedDifficulties: unionSorted(x.clearedDifficulties, y.clearedDifficulties)
    };
  });
  return JSON.stringify(out);
}
function mergeGuildLicense(a, b) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const score = o => o.rankChangedAt || o.registeredAt || 0;
  const win = kdParse(cmpPick(score(oa), score(ob), a, b), {});
  const regs = [oa.registeredAt, ob.registeredAt].filter(x => typeof x === 'number' && x > 0);
  return JSON.stringify({ ...win, registeredAt: regs.length ? Math.min(...regs) : win.registeredAt });
}
function mergeByWeek(a, b, onSameWeek) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const wa = oa.weekKey || '';
  const wb = ob.weekKey || '';
  if (wb > wa) return b;
  if (wa > wb) return a;
  return onSameWeek(oa, ob, a, b);
}
function mergeDailyQuests(a, b) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const da = oa.date || '';
  const db = ob.date || '';
  if (db > da) return b;
  if (da > db) return a;
  const done = o => (Array.isArray(o.quests) ? o.quests.filter(q => q && q.completed).length : 0);
  return cmpPick(done(oa), done(ob), a, b);
}
function mergeArenaBest(a, b) {
  const oa = kdParse(a, {});
  const ob = kdParse(b, {});
  const out = {};
  new Set([...Object.keys(oa), ...Object.keys(ob)]).forEach(k => {
    const x = oa[k];
    const y = ob[k];
    if (!x) out[k] = y;
    else if (!y) out[k] = x;
    else {
      const sx = JSON.stringify(x);
      out[k] = cmpPick(x.correctCount || 0, y.correctCount || 0, sx, JSON.stringify(y)) === sx ? x : y;
    }
  });
  return JSON.stringify(out);
}
function mergeTowerHistory(a, b) {
  const byKey = new Map();
  [...kdParse(a, []), ...kdParse(b, [])].forEach(h => {
    if (!h) return;
    const k = `${h.timestamp}|${h.difficulty}|${h.reachedFloor}`;
    const prev = byKey.get(k);
    if (!prev || JSON.stringify(h) > JSON.stringify(prev)) byKey.set(k, h);
  });
  const list = Array.from(byKey.values());
  list.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0) || (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));
  return JSON.stringify(list.slice(0, 20));
}

const KD_MERGERS = {
  'last-record': (a, b) => cmpPick(kdParse(a, {}).timestamp || 0, kdParse(b, {}).timestamp || 0, a, b),
  'weak': mergeWeakLists,
  'weak-tomb': mergeWeakTombs,
  'streak': (a, b) => {
    const oa = kdParse(a, {});
    const ob = kdParse(b, {});
    const da = oa.lastDate || '';
    const db = ob.lastDate || '';
    if (db > da) return b;
    if (da > db) return a;
    return cmpPick(oa.count || 0, ob.count || 0, a, b);
  },
  'weak-cleared': maxInts,
  'badges': (a, b) => JSON.stringify(unionSorted(kdParse(a, []), kdParse(b, []))),
  'playdays': (a, b) => JSON.stringify(unionSorted(kdParse(a, []), kdParse(b, []))),
  'tower': mergeTower,
  'guild-license': mergeGuildLicense,
  'guild-progress': (a, b) => maxFields(a, b, ['totalQuestsCompleted', 'totalPointsAllTime']),
  'guild-weekpoints': (a, b) =>
    mergeByWeek(a, b, (oa, ob, sa, sb) => cmpPick(oa.points || 0, ob.points || 0, sa, sb)),
  'guild-quests': mergeDailyQuests,
  'guild-weeklyquest': (a, b) =>
    mergeByWeek(a, b, (oa, ob) =>
      JSON.stringify({
        ...oa,
        subjectsCleared: unionSorted(oa.subjectsCleared, ob.subjectsCleared),
        completed: !!(oa.completed || ob.completed)
      })
    ),
  'arena-best': mergeArenaBest,
  'best': maxInts,
  'stats': (a, b) => maxFields(a, b, ['attempted', 'correct', 'sessions']),
  'tower-history': mergeTowerHistory
};

function mergeValueStr(type, a, b) {
  if (a == null) return b;
  if (b == null) return a;
  if (a === b) return a;
  const fn = KD_MERGERS[type];
  if (!fn) return a;
  try {
    const m = fn(a, b);
    return m === a || m === b ? m : canonStr(m); // 新しく組み立てた値はキー順を正規化する
  } catch (e) {
    console.warn('同期マージに失敗したためローカル値を採用します:', type, e);
    return a;
  }
}

// a: ローカル、b: リモート。同点・判断不能のときは a（ローカル）を優先する。
function mergeKv(a, b) {
  const out = {};
  new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(short => {
    const { type } = splitKvShortKey(short);
    const m = mergeValueStr(type, a && a[short] != null ? a[short] : null, b && b[short] != null ? b[short] : null);
    if (m != null) out[short] = m;
  });
  if (out['weak'] && out['weak-tomb']) out['weak'] = applyWeakTombs(out['weak'], out['weak-tomb']);
  return out;
}

// 苦手問題を克服（正解して一覧から削除）した記録を残す（他端末での復活防止）
function addWeakTombstone(profile, catId, qHTML) {
  const key = `kd-weak-tomb-${profile}`;
  const tombs = kdParse(localStorage.getItem(key), {});
  tombs[`${catId}|${qHTML}`] = Date.now();
  const cutoff = Date.now() - KD_TOMB_KEEP_MS;
  Object.keys(tombs).forEach(k => {
    if (tombs[k] < cutoff) delete tombs[k];
  });
  kdSet(key, JSON.stringify(tombs));
}

/* ---------- 書き込みラッパー・同期のスケジューリング ---------- */
// localStorage.setItem の代わりに使う。同期対象キーなら、保存後に同期を予約する。
function kdSet(key, value) {
  localStorage.setItem(key, value);
  const pk = parseKdKey(key);
  if (!pk) return;
  kdSyncDirtyVersion[pk.profile] = (kdSyncDirtyVersion[pk.profile] || 0) + 1;
  if (!isCloudConfigured()) return;
  markSyncPending(pk.profile);
  scheduleProfileSync(pk.profile);
}

function loadSyncPending() {
  try {
    return JSON.parse(localStorage.getItem(KD_SYNC_PENDING_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function markSyncPending(profile) {
  const list = loadSyncPending();
  if (!list.includes(profile)) {
    list.push(profile);
    localStorage.setItem(KD_SYNC_PENDING_KEY, JSON.stringify(list));
  }
}
function clearSyncPending(profile) {
  const list = loadSyncPending().filter(p => p !== profile);
  localStorage.setItem(KD_SYNC_PENDING_KEY, JSON.stringify(list));
}

function scheduleProfileSync(profile, delay) {
  if (!isCloudConfigured()) return;
  clearTimeout(kdSyncTimers[profile]);
  kdSyncTimers[profile] = setTimeout(
    () => {
      delete kdSyncTimers[profile];
      syncProfileNow(profile);
    },
    delay == null ? KD_SYNC_DEBOUNCE_MS : delay
  );
}

// 起動時・オンライン復帰時・画面を離れるときに、未同期のプロフィールをまとめて送る
function flushPendingProfileSyncs(immediate) {
  if (!isCloudConfigured()) return;
  const existing = getProfiles();
  loadSyncPending().forEach(p => {
    if (!existing.includes(p)) {
      clearSyncPending(p);
      return;
    }
    if (immediate) {
      clearTimeout(kdSyncTimers[p]);
      delete kdSyncTimers[p];
    }
    syncProfileNow(p);
  });
}

/* ---------- 同期本体 ---------- */
function syncProfileNow(profile) {
  if (!profile || !isCloudConfigured()) return Promise.resolve(false);
  if (kdSyncInFlight[profile]) {
    kdSyncRerun[profile] = true;
    return kdSyncInFlight[profile];
  }
  const p = (async () => {
    try {
      return await doSyncProfile(profile);
    } catch (e) {
      console.warn('プロフィールの同期に失敗しました（次回まとめて再送します）:', e);
      return false;
    } finally {
      delete kdSyncInFlight[profile];
      if (kdSyncRerun[profile]) {
        delete kdSyncRerun[profile];
        scheduleProfileSync(profile, 500);
      }
    }
  })();
  kdSyncInFlight[profile] = p;
  return p;
}

async function doSyncProfile(profile) {
  const ok = await initCloud();
  if (!ok) return false;
  const ref = cloudDb.collection('profileData').doc(profile);

  // リモートが未作成のときだけ、旧コレクションから復元できる分を再構成する。
  // （まずトランザクションで存在確認し、無ければ legacy を取得してもう一度流す）
  let legacy = null;
  let merged = null;
  for (let attempt = 0; attempt < 2 && merged == null; attempt++) {
    merged = await cloudDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists && legacy === null) return null; // legacy取得のため一旦抜ける
      const remoteKv = snap.exists ? sanitizeKv(snap.data().kv) : legacy;
      const result = mergeKv(collectLocalKv(profile), remoteKv);
      const needWrite = snap.exists ? !kvEqual(result, remoteKv) : Object.keys(result).length > 0;
      if (needWrite) {
        tx.set(ref, {
          name: profile,
          kv: result,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      return result;
    });
    if (merged == null) legacy = await buildLegacyKv(profile);
  }
  if (merged == null) return false;

  // 通信中にローカルが更新されていても失われないよう、現在のローカルと再マージして反映する
  const final = mergeKv(collectLocalKv(profile), merged);
  applyKvToLocal(profile, final);
  if (kvEqual(final, merged)) {
    clearSyncPending(profile);
  } else {
    scheduleProfileSync(profile, 500); // 通信中にローカルが進んだ分を次回に送る
  }
  return true;
}

// プロフィール選択時の同期（最大 KD_SYNC_SELECT_TIMEOUT_MS 待ち、超えたらローカルのまま進む）
async function syncProfileOnSelect(profile) {
  if (!isCloudConfigured()) return 'disabled';
  const statusEl = document.getElementById('profileSyncStatus');
  if (statusEl) statusEl.textContent = '☁️ クラウドと同期中…';
  const result = await Promise.race([
    syncProfileNow(profile).then(ok => (ok ? 'ok' : 'failed')).catch(() => 'failed'),
    new Promise(resolve => setTimeout(() => resolve('timeout'), KD_SYNC_SELECT_TIMEOUT_MS))
  ]);
  if (statusEl) statusEl.textContent = '';
  return result;
}

async function deleteProfileCloud(profile) {
  clearTimeout(kdSyncTimers[profile]);
  delete kdSyncTimers[profile];
  clearSyncPending(profile);
  if (!isCloudConfigured()) return false;
  const ok = await initCloud();
  if (!ok) return false;
  try {
    await cloudDb.collection('profileData').doc(profile).delete();
    return true;
  } catch (e) {
    console.warn('クラウド上のプロフィールデータ削除に失敗しました:', e);
    return false;
  }
}

/* ---------- 旧コレクションからの復元（profileData 導入前のデータ用） ----------
   復元できるもの：累計プレイ日数・連続日数／獲得バッジ（タイムライン経由）／
   ギルドのランク・累計ポイント・今週ポイント／闘技場の自己ベスト／塔の制覇記録
   復元できないもの：単元ごとの段位・累計正解数・苦手問題・前回の記録・塔の挑戦履歴
   （これらはクラウドに送られていなかったため） */
function dayNumber(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function weekKeyToMs(weekKey) {
  const [y, m, d] = String(weekKey).split('-').map(Number);
  return new Date(y, m - 1, d, 8).getTime();
}

async function buildLegacyKv(profile) {
  const kv = {};
  if (!cloudDb) return kv;
  const safe = async fn => {
    try {
      return await fn();
    } catch (e) {
      return null;
    }
  };
  const col = n => cloudDb.collection(n);
  const [playSnap, feedSnap, guildSnap, arena1, arena3, towerSnap] = await Promise.all([
    safe(() => col('profilePlayDays').doc(profile).get()),
    safe(() => col('familyFeed').where('profile', '==', profile).limit(300).get()),
    safe(() => col('guildWeekly').where('name', '==', profile).limit(200).get()),
    safe(() => col('arenaRanking').doc(`${profile}_1min`).get()),
    safe(() => col('arenaRanking').doc(`${profile}_3min`).get()),
    safe(() => col('towerConquests').where('name', '==', profile).limit(200).get())
  ]);

  // 累計プレイ日数 → 連続日数（最新日から遡って連続している日数）
  if (playSnap && playSnap.exists) {
    const dates = unionArr(playSnap.data().dates, []).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
    if (dates.length > 0) {
      kv['playdays'] = JSON.stringify(dates);
      let run = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        if (dayNumber(dates[i]) - dayNumber(dates[i - 1]) === 1) run++;
        else break;
      }
      kv['streak'] = JSON.stringify({ count: run, lastDate: dates[dates.length - 1], justExtendedToday: false });
    }
  }

  // 獲得バッジ：タイムラインの自動投稿タイトル「○○」バッジを獲得！ から逆引きする
  if (feedSnap) {
    const ids = [];
    feedSnap.docs.forEach(d => {
      const e = d.data();
      if (e.kind !== 'badge' || typeof e.title !== 'string') return;
      const m = e.title.match(/^「(.+)」バッジを獲得！$/);
      if (!m) return;
      const def = BADGE_DEFS.find(b => b.name === m[1]);
      if (def && !ids.includes(def.id)) ids.push(def.id);
    });
    if (ids.length > 0) kv['badges'] = JSON.stringify(ids);
  }

  // ギルド：直近のランク・累計ポイント・今週ポイント
  if (guildSnap && !guildSnap.empty) {
    const rows = guildSnap.docs.map(d => d.data()).filter(r => typeof r.weekKey === 'string').sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1));
    if (rows.length > 0) {
      const latest = rows[rows.length - 1];
      if (GUILD_RANKS[latest.rank]) {
        kv['guild-license'] = JSON.stringify({
          rankId: latest.rank,
          registeredAt: weekKeyToMs(rows[0].weekKey),
          rankChangedAt: weekKeyToMs(latest.weekKey) // 過去日付にして、別端末の新しい変更を上書きしない
        });
      }
      const total = rows.reduce((s, r) => s + (r.points || 0), 0);
      kv['guild-progress'] = JSON.stringify({ totalQuestsCompleted: 0, totalPointsAllTime: total });
      const thisWeek = rows.find(r => r.weekKey === guildWeekKey());
      if (thisWeek) kv['guild-weekpoints'] = JSON.stringify({ weekKey: thisWeek.weekKey, points: thisWeek.points || 0 });
    }
  }

  // 闘技場の自己ベスト
  const arena = {};
  [['1min', arena1], ['3min', arena3]].forEach(([k, snap]) => {
    if (!snap || !snap.exists) return;
    const d = snap.data();
    arena[k] = {
      correctCount: d.correctCount || 0,
      subject: d.subject,
      grade: d.grade,
      achievedAt: d.achievedAt && typeof d.achievedAt.toMillis === 'function' ? d.achievedAt.toMillis() : Date.now()
    };
  });
  if (Object.keys(arena).length > 0) kv['arena-best'] = JSON.stringify(arena);

  // 塔の制覇記録
  if (towerSnap && !towerSnap.empty) {
    const tower = {};
    towerSnap.docs.forEach(d => {
      const c = d.data();
      if (!SUBJECT_ORDER.includes(c.subject) || !TOWER_DIFFICULTY[c.difficulty]) return;
      const t = tower[c.subject] || (tower[c.subject] = { bestFloor: 0, clearedDifficulties: [] });
      t.bestFloor = Math.max(t.bestFloor, c.reachedFloor || 0);
      if (!t.clearedDifficulties.includes(c.difficulty)) t.clearedDifficulties.push(c.difficulty);
    });
    if (Object.keys(tower).length > 0) kv['tower'] = JSON.stringify(tower);
  }

  return sanitizeKv(kv);
}

/* ---------- 画面：クラウドから復元（端末のlocalStorageが消えた場合） ---------- */
async function loadCloudProfileNames() {
  const ok = await initCloud();
  if (!ok) return [];
  const names = new Set();
  try {
    const s = await cloudDb.collection('profileData').limit(50).get();
    s.docs.forEach(d => names.add(d.id));
  } catch (e) {
    /* 無視 */
  }
  try {
    // profileData 導入前から記録のあるプロフィールも拾う（旧データからの復元対象）
    const s = await cloudDb.collection('leaderboard').limit(50).get();
    s.docs.forEach(d => names.add(d.data().name || d.id));
  } catch (e) {
    /* 無視 */
  }
  return Array.from(names).filter(n => typeof n === 'string' && n.length > 0 && n.length <= 20).sort();
}

async function toggleCloudRestore() {
  playClick();
  const wrap = document.getElementById('cloudRestoreList');
  if (!wrap) return;
  if (wrap.style.display !== 'none') {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = `<div class="footnote" style="padding:10px 0;">読み込み中…</div>`;
  const local = getProfiles();
  const names = (await loadCloudProfileNames()).filter(n => !local.includes(n));
  wrap.innerHTML = '';
  if (names.length === 0) {
    wrap.innerHTML = `<div class="footnote" style="padding:10px 0;">この端末にまだない、クラウド上のプロフィールは見つかりませんでした。</div>`;
    return;
  }
  names.forEach(name => {
    const div = document.createElement('div');
    div.className = 'cat-card';
    const body = document.createElement('div');
    body.className = 'cat-body';
    const h3 = document.createElement('h3');
    h3.textContent = name;
    const span = document.createElement('span');
    span.textContent = 'タップしてクラウドから復元する';
    body.appendChild(h3);
    body.appendChild(span);
    div.appendChild(body);
    div.onclick = () => restoreProfileFromCloud(name);
    wrap.appendChild(div);
  });
}

function restoreProfileFromCloud(name) {
  const profiles = getProfiles();
  if (!profiles.includes(name)) {
    if (profiles.length >= KD_MAX_PROFILES) {
      alert(`プロフィールは最大${KD_MAX_PROFILES}人までです。不要なプロフィールを削除してから復元してください。`);
      return;
    }
    profiles.push(name);
    saveProfiles(profiles);
  }
  selectProfile(name); // 選択時の同期でクラウドの記録がこの端末に取り込まれる
}
