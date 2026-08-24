/* ============================================================
   音声処理
   ・効果音: Web Audio APIで直接生成するもの（クリック音・○×判定音）と、
     Tone.jsで生成するもの（ファンファーレ・コイン獲得音・バッジ獲得音・
     塔のライフ喪失警告音）がある
   ・BGM: Tone.jsで生成し、場面（道場／文明の塔／ギルド／結果画面）に応じて
     自動的に切り替わる（switchBGM）
   ・AudioContextはあえて共有しない（Tone.setContext()は「エラーは出ないのに
     音が出ない」不具合の報告が公式にも複数あるため、Tone.jsには自分自身の
     コンテキストを管理させる）
   ============================================================ */

let audioCtx = null,
  bgmOn = true,
  bgmMaster = null; // 現在再生中のBGMテーマの音量・ON/OFFをまとめて制御するTone.Volumeノード

// 効果音に対してBGMをどれくらい下げるか（dB）。
// 効果音のピークはおよそ -20dB 前後になるよう作られているので、
// BGMの各楽器の音量（-11〜-14dB程度）にこの値を重ねて、確実にBGMの方が
// 控えめに聞こえるようにしている。数値を 0 に近づけると音量UP、
// マイナス方向に大きくすると音量DOWN。
const BGM_MASTER_DB = -16;

function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    // Tone.jsには自分自身のAudioContextを管理させる。
    // Tone.setContext()で無理に共有すると、Tone.Destination等の内部配線が
    // 追従せず「エラーは出ないのに音だけ出ない」状態になることが
    // Tone.js公式でも複数報告されているため、あえて共有しない。
    switchBGM('dojo'); // 初回は道場のBGMから開始する
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (window.Tone && Tone.context && Tone.context.state === 'suspended') {
    Tone.start().catch(() => {});
  }
}

function playClick() {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(720, t);
  o.frequency.exponentialRampToValueAtTime(920, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.14);
}

function playResultSound(ok) {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const freqs = ok ? [523.25, 659.25, 783.99] : [349.23, 293.66];
  freqs.forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const start = t + i * 0.05;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + (ok ? 0.35 : 0.5));
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(start);
    o.stop(start + (ok ? 0.4 : 0.55));
  });
}

// 単元で全問正解したときの短いファンファーレ（Tone.jsで生成）
// BGMのON/OFFに関わらず、効果音扱いで必ず鳴らす（Tone.Destinationへ直結）
function playFanfare() {
  ensureAudio();
  if (!window.Tone) return;
  try {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.5 }
    }).toDestination();
    synth.volume.value = -6; // 効果音並みにはっきり聞こえる音量（BGMより明確に前に出る）

    const now = Tone.now();
    const notes = ['C5', 'E5', 'G5', 'C6']; // 上昇アルペジオ
    const step = 0.1;
    notes.forEach((n, i) => {
      synth.triggerAttackRelease(n, '16n', now + i * step);
    });
    // 最後に和音でキメる
    synth.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], '4n', now + notes.length * step + 0.05);

    // 使い捨てなので少し後に破棄してリソースを解放
    setTimeout(() => {
      try {
        synth.dispose();
      } catch (e) {
        /* 無視 */
      }
    }, 2000);
  } catch (e) {
    console.warn('ファンファーレの再生に失敗しました:', e);
  }
}

// 文明の塔でライフ（残機）を1つ失った瞬間の警告音。
// 既存の不正解音（playResultSound(false)）とは別に、塔モードのときだけ
// 追加で鳴らす、心臓がヒヤッとするような短いブザー音。
// Tone.jsではなく生Web Audio APIで作る（効果音は既存のクリック音・判定音と
// 同じ手法に統一し、BGM切り替えの影響を受けないようにするため）。
function playTowerLifeLost() {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.09].forEach((offset, i) => {
    const start = t + offset;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220 - i * 20, start);
    o.frequency.exponentialRampToValueAtTime(110 - i * 10, start + 0.11);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.11, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(start);
    o.stop(start + 0.14);
  });
}

// ギルド依頼を達成した瞬間のコイン獲得音（明るい2音の「ピロン」）。
// BGMのループ（Transport）とは独立させ、BGM切り替え中でも確実に鳴るように
// Tone.now()基準で直接タイミングを組む（ファンファーレと同じ考え方）。
function playGuildQuestCoin() {
  ensureAudio();
  if (!window.Tone) return;
  try {
    const synth = new Tone.FMSynth({
      harmonicity: 4,
      modulationIndex: 3,
      envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.15 }
    }).toDestination();
    synth.volume.value = -8;
    const now = Tone.now();
    synth.triggerAttackRelease('B5', '32n', now);
    synth.triggerAttackRelease('E6', '16n', now + 0.09);
    setTimeout(() => {
      try {
        synth.dispose();
      } catch (e) {
        /* 無視 */
      }
    }, 1000);
  } catch (e) {
    console.warn('コイン獲得音の再生に失敗しました:', e);
  }
}

// バッジを新しく獲得した瞬間のきらめく効果音。
// 全問正解のファンファーレ（playFanfare）とは別物で、バッジ獲得という
// できごと共通で鳴らす（クイズ結果・文明の塔・ギルドのどこで獲得しても同じ）。
function playBadgeGet() {
  ensureAudio();
  if (!window.Tone) return;
  try {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.003, decay: 0.2, sustain: 0.1, release: 0.4 }
    }).toDestination();
    synth.volume.value = -9;
    const now = Tone.now();
    // 五音音階の駆け上がり（キラキラした「達成」の感触）
    const notes = ['E5', 'G5', 'A5', 'B5', 'E6'];
    const step = 0.06;
    notes.forEach((n, i) => {
      synth.triggerAttackRelease(n, '32n', now + i * step);
    });
    synth.triggerAttackRelease(['E5', 'B5', 'E6'], '8n', now + notes.length * step + 0.02);
    setTimeout(() => {
      try {
        synth.dispose();
      } catch (e) {
        /* 無視 */
      }
    }, 1500);
  } catch (e) {
    console.warn('バッジ獲得音の再生に失敗しました:', e);
  }
}

/* ============================================================
   BGM（Tone.js）：場面別テーマの自動切り替え
   ------------------------------------------------------------
   画面遷移のたびに ui.js の showScreen() から switchBGM(themeName) が
   呼ばれる。同じテーマならなにもせず、違うテーマなら
   　1. Tone.Transportを止めてスケジュール済みのループをすべて解除
   　2. 前のテーマの音量をゆっくり下げてから各ノードをdispose
   　3. 新しいテーマのノード一式を作り、無音からゆっくりフェードインさせる
   という手順で、ぶつ切りやノイズなく切り替える。
   画面を素早く連続で切り替えた場合も、処理中に来た新しい希望テーマだけを
   1件だけ覚えておき、処理が終わり次第それを反映することで、
   ビルドが重なって競合しないようにしている。
   ============================================================ */

let currentBgmTheme = null; // 現在再生中のテーマ名（'dojo'|'tower'|'guild'|'result'）
let currentBgmNodes = []; // 現在のテーマのTone.jsノード一式（切り替え時に破棄する）
let bgmSwitchBusy = false;
let bgmSwitchQueued = null;

async function switchBGM(themeName) {
  if (!audioCtx || !window.Tone || !BGM_THEMES[themeName]) return;
  if (bgmSwitchBusy) {
    bgmSwitchQueued = themeName; // 処理中なら最新の希望だけ覚えておく
    return;
  }
  if (currentBgmTheme === themeName) return; // 既に同じテーマなら何もしない

  bgmSwitchBusy = true;
  try {
    await Tone.start();

    const oldMaster = bgmMaster;
    const oldNodes = currentBgmNodes;

    // 前のテーマのループ予約をすべて解除してから、新しいテーマを組み立てる
    Tone.Transport.stop(); // Tone.jsの仕様上、stop()でTransportの位置は先頭(0)に戻る
    Tone.Transport.cancel();

    const built = await BGM_THEMES[themeName]();
    Tone.Transport.bpm.value = built.bpm;
    built.master.volume.value = -60; // 無音から始めてフェードインする
    built.master.mute = !bgmOn;
    Tone.Transport.start();
    built.master.volume.rampTo(BGM_MASTER_DB, 0.4);

    bgmMaster = built.master;
    currentBgmNodes = built.nodes;
    currentBgmTheme = themeName;

    // 前のテーマは音量をフェードアウトさせてから破棄する（余韻を急に切らないため）
    if (oldMaster) {
      oldMaster.volume.rampTo(-60, 0.3);
      setTimeout(() => {
        oldNodes.forEach(n => {
          try {
            if (n) n.dispose();
          } catch (e) {
            /* 無視 */
          }
        });
        try {
          oldMaster.dispose();
        } catch (e) {
          /* 無視 */
        }
      }, 400);
    }
  } catch (e) {
    console.warn('BGMの切り替えに失敗しました:', e);
    if (!currentBgmTheme) {
      // 初回のBGM起動に失敗した場合は、次回また試せるようにアイコンで知らせる
      const btn = document.getElementById('bgmToggle');
      if (btn) btn.textContent = '⚠️';
    }
  } finally {
    bgmSwitchBusy = false;
    if (bgmSwitchQueued && bgmSwitchQueued !== currentBgmTheme) {
      const next = bgmSwitchQueued;
      bgmSwitchQueued = null;
      switchBGM(next);
    } else {
      bgmSwitchQueued = null;
    }
  }
}

// 画面名から、その画面で流すべきBGMテーマを決める。
// screen-quiz は通常クイズ・文明の塔の両方で使う共通の画面なので、
// state.mode（tower かどうか）も見て判定する。
function bgmThemeForScreen(screenName) {
  if (screenName === 'quiz') {
    if (typeof state === 'undefined') return 'dojo';
    if (state.mode === 'tower') return 'tower';
    if (state.mode === 'arena') return 'tower'; // 挑戦中は塔と同じ緊迫感のあるテーマを流用する
    return 'dojo';
  }
  if (screenName === 'tower-subject' || screenName === 'tower-difficulty') return 'tower';
  if (screenName === 'tower-floor-clear' || screenName === 'tower-result' || screenName === 'result') return 'result';
  if (screenName === 'tower-monument') return 'result';
  if (screenName === 'guild-register' || screenName === 'guild' || screenName === 'guild-ranking') return 'guild';
  if (screenName === 'arena-subject' || screenName === 'arena-grade' || screenName === 'arena-timelimit') return 'tower';
  if (screenName === 'arena-result' || screenName === 'arena-ranking') return 'result';
  return 'dojo';
}

function toggleBGM() {
  ensureAudio();
  bgmOn = !bgmOn;
  document.getElementById('bgmToggle').textContent = bgmOn ? '🔊' : '🔇';
  // BGMが切り替え処理中でまだ次のmasterが未生成の場合は、
  // 生成時に現在の bgmOn を読むので自動的に反映される。
  if (bgmMaster) bgmMaster.mute = !bgmOn;
}

const BGM_THEMES = {
  dojo: buildDojoBGM,
  tower: buildTowerBGM,
  guild: buildGuildBGM,
  result: buildResultBGM
};

// リバーブ生成をtry/catchで包む共通ヘルパー。
// 環境（特に一部のiOS Safari）によってはリバーブの生成自体に失敗することが
// あるため、失敗してもBGM全体が無音にならないよう、リバーブなしで続行する。
async function tryBuildReverb(decay, wet, dest) {
  try {
    const reverb = new Tone.Reverb({ decay, wet }).connect(dest);
    await reverb.ready; // IR生成が終わるまで待つ（待たないと生成完了まで無音）
    return reverb;
  } catch (e) {
    console.warn('リバーブの生成に失敗したため、リバーブなしでBGMを再生します:', e);
    return null;
  }
}

// ---------- 道場：明るめ・BPM100・ニ長調 ----------
async function buildDojoBGM() {
  const master = new Tone.Volume(BGM_MASTER_DB).toDestination();
  const nodes = [master];

  const reverb = await tryBuildReverb(1.8, 0.25, master);
  if (reverb) nodes.push(reverb);
  const padDest = reverb || master;
  const bellDest = reverb || master;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.3, decay: 0.3, sustain: 0.4, release: 1 }
  }).connect(padDest);
  pad.volume.value = -14;

  const bell = new Tone.FMSynth({
    harmonicity: 3,
    modulationIndex: 2,
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: 0.4 }
  }).connect(bellDest);
  bell.volume.value = -11;

  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.3 }
  }).connect(master);
  bass.volume.value = -12;

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 }
  }).connect(master);
  clap.volume.value = -14;

  nodes.push(pad, bell, bass, clap);

  // D - A - Bm - G
  const chords = [
    ['D4', 'F#4', 'A4'],
    ['A3', 'C#4', 'E4'],
    ['B3', 'D4', 'F#4'],
    ['G3', 'B3', 'D4']
  ];
  // ウォーキングベース（コードごとに4音の順次進行）
  const walkingBass = [
    ['D2', 'E2', 'F#2', 'G2'],
    ['A1', 'B1', 'C#2', 'D2'],
    ['B1', 'C#2', 'D2', 'E2'],
    ['G1', 'A1', 'B1', 'C2']
  ];
  const scale = ['D5', 'E5', 'F#5', 'A5', 'B5'];

  let idx = 0;
  const chordLoop = new Tone.Loop(time => {
    pad.triggerAttackRelease(chords[idx % chords.length], '1m', time);
    idx++;
  }, '1m').start(0);

  let bassStep = 0;
  const bassLoop = new Tone.Loop(time => {
    const bar = Math.floor(bassStep / 4) % walkingBass.length;
    const note = walkingBass[bar][bassStep % 4];
    bass.triggerAttackRelease(note, '4n', time);
    bassStep++;
  }, '4n').start(0);

  const bellLoop = new Tone.Loop(time => {
    if (Math.random() < 0.6) {
      const note = scale[Math.floor(Math.random() * scale.length)];
      bell.triggerAttackRelease(note, '8n', time);
    }
  }, '8n').start('8n');

  // 2拍・4拍にクラップ
  let clapStep = 0;
  const clapLoop = new Tone.Loop(time => {
    if (clapStep % 4 === 1 || clapStep % 4 === 3) {
      clap.triggerAttackRelease('8n', time);
    }
    clapStep++;
  }, '4n').start(0);

  nodes.push(chordLoop, bassLoop, bellLoop, clapLoop);
  return { master, nodes, bpm: 100 };
}

// ---------- 文明の塔：緊張感のある短調・BPM112・ニ短調 ----------
// 道場（ニ長調）と主音（D）をそろえ、「同じ世界の違う場所」という
// 統一感を持たせつつ、短調・速めのテンポ・駆動する8分の打点で
// 挑戦中の緊張感を出す。
async function buildTowerBGM() {
  const master = new Tone.Volume(BGM_MASTER_DB).toDestination();
  const nodes = [master];

  // 塔は「せまく閉じた空間」を意識し、道場よりリバーブを短くする
  const reverb = await tryBuildReverb(1.0, 0.2, master);
  if (reverb) nodes.push(reverb);
  const padDest = reverb || master;
  const bellDest = reverb || master;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.6 }
  }).connect(padDest);
  pad.volume.value = -18;

  const bell = new Tone.FMSynth({
    harmonicity: 2.5,
    modulationIndex: 4,
    envelope: { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.3 }
  }).connect(bellDest);
  bell.volume.value = -13;

  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.15, release: 0.15 }
  }).connect(master);
  bass.volume.value = -10;

  const perc = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
  }).connect(master);
  perc.volume.value = -20;

  nodes.push(pad, bell, bass, perc);

  // Dm - Bb - F - C（i - VI - III - VII、冒険もの定番の短調進行）
  const chords = [
    ['D4', 'F4', 'A4'],
    ['Bb3', 'D4', 'F4'],
    ['F3', 'A3', 'C4'],
    ['C4', 'E4', 'G4']
  ];
  const bassRoots = ['D2', 'Bb1', 'F2', 'C2'];
  const scale = ['D5', 'F5', 'G5', 'A5', 'C6']; // ニ短調ペンタトニック寄り

  let idx = 0;
  const chordLoop = new Tone.Loop(time => {
    pad.triggerAttackRelease(chords[idx % chords.length], '1m', time);
    idx++;
  }, '1m').start(0);

  // 拍ごとに同じ根音を打ち続ける「駆動するベース」
  let bassStep = 0;
  const bassLoop = new Tone.Loop(time => {
    const bar = Math.floor(bassStep / 4) % bassRoots.length;
    bass.triggerAttackRelease(bassRoots[bar], '8n', time);
    bassStep++;
  }, '4n').start(0);

  // 8分刻みで駆動する打点（道場のクラップより頻度が高く、控えめな音量）
  const percLoop = new Tone.Loop(time => {
    perc.triggerAttackRelease('16n', time);
  }, '8n').start(0);

  // まばらな警戒アルペジオ（道場の陽気なベルより控えめな発音確率）
  const bellLoop = new Tone.Loop(time => {
    if (Math.random() < 0.35) {
      const note = scale[Math.floor(Math.random() * scale.length)];
      bell.triggerAttackRelease(note, '16n', time);
    }
  }, '8n').start('8n');

  nodes.push(chordLoop, bassLoop, percLoop, bellLoop);
  return { master, nodes, bpm: 112 };
}

// ---------- ギルド：のんびり温かい・BPM90・ト長調 ----------
// パーカッションなしの落ち着いた編成にし、酒場・ギルドホールのような
// くつろいだ雰囲気を出す。主音を道場・塔と変えることで場所の違いを示す。
async function buildGuildBGM() {
  const master = new Tone.Volume(BGM_MASTER_DB).toDestination();
  const nodes = [master];

  const reverb = await tryBuildReverb(2.2, 0.3, master); // 広めのホールを意識した長めの残響
  if (reverb) nodes.push(reverb);
  const pluckDest = reverb || master;
  const padDest = reverb || master;
  const bellDest = reverb || master;

  // 弦を弾くような短い減衰の音色（マンドリン／リュートのイメージ）
  const pluck = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.004, decay: 0.22, sustain: 0, release: 0.15 }
  }).connect(pluckDest);
  pluck.volume.value = -13;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.5, release: 1.4 }
  }).connect(padDest);
  pad.volume.value = -21; // ごく控えめに、下支えとして鳴らす

  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.4 }
  }).connect(master);
  bass.volume.value = -13;

  const bell = new Tone.FMSynth({
    harmonicity: 3.5,
    modulationIndex: 1.5,
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.5 }
  }).connect(bellDest);
  bell.volume.value = -14;

  nodes.push(pluck, pad, bass, bell);

  // G - Em - C - D（I - vi - IV - V、温かみのあるフォーク進行）
  const chords = [
    ['G3', 'B3', 'D4'],
    ['E3', 'G3', 'B3'],
    ['C3', 'E3', 'G3'],
    ['D3', 'F#3', 'A3']
  ];
  const bassRoots = ['G2', 'E2', 'C2', 'D2'];
  const scale = ['G5', 'A5', 'B5', 'D6', 'E6'];

  // 1拍ごとに和音の音を上下に弾く（簡易マンドリン・パターン）
  let pluckStep = 0;
  const pluckLoop = new Tone.Loop(time => {
    const bar = Math.floor(pluckStep / 4) % chords.length;
    const chord = chords[bar];
    const order = [chord[0], chord[1], chord[2], chord[1]]; // 根音→3度→5度→3度
    pluck.triggerAttackRelease(order[pluckStep % 4], '8n', time);
    pluckStep++;
  }, '4n').start(0);

  let idx = 0;
  const chordLoop = new Tone.Loop(time => {
    pad.triggerAttackRelease(chords[idx % chords.length], '1m', time);
    idx++;
  }, '1m').start(0);

  let bassStep = 0;
  const bassLoop = new Tone.Loop(time => {
    const bar = Math.floor(bassStep / 4) % bassRoots.length;
    bass.triggerAttackRelease(bassRoots[bar], '2n', time);
    bassStep++;
  }, '2n').start(0);

  // 高音のきらめきはまれにだけ（道場よりさらにまばら）
  const bellLoop = new Tone.Loop(time => {
    if (Math.random() < 0.22) {
      const note = scale[Math.floor(Math.random() * scale.length)];
      bell.triggerAttackRelease(note, '8n', time);
    }
  }, '4n').start('4n');

  nodes.push(pluckLoop, chordLoop, bassLoop, bellLoop);
  return { master, nodes, bpm: 90 };
}

// ---------- 結果画面：静かでやさしい・BPM78・ハ長調 ----------
// 通常クイズの認定証画面・文明の塔の階クリア画面・塔の最終結果画面
// （制覇・追放の両方）で共通して使う。追放（失敗）画面でも使うため、
// あえて勝利感を煽りすぎない、やさしく落ち着いたトーンにしている。
// パッドと控えめなベルだけの最小構成（ベース・打楽器なし）。
async function buildResultBGM() {
  const master = new Tone.Volume(BGM_MASTER_DB).toDestination();
  const nodes = [master];

  const reverb = await tryBuildReverb(2.5, 0.35, master); // ふんわりとした残響
  if (reverb) nodes.push(reverb);
  const padDest = reverb || master;
  const bellDest = reverb || master;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.8, decay: 0.5, sustain: 0.6, release: 1.8 }
  }).connect(padDest);
  pad.volume.value = -15;

  const bell = new Tone.FMSynth({
    harmonicity: 3,
    modulationIndex: 1,
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.8 }
  }).connect(bellDest);
  bell.volume.value = -15;

  nodes.push(pad, bell);

  // C - F（I - IV）をゆったり2小節ごとに行き来する、呼吸するような和声
  const chords = [
    ['C4', 'E4', 'G4'],
    ['F3', 'A3', 'C4']
  ];
  const scale = ['C5', 'D5', 'E5', 'G5', 'A5']; // ハ長調ペンタトニック

  let idx = 0;
  const chordLoop = new Tone.Loop(time => {
    pad.triggerAttackRelease(chords[idx % chords.length], '2m', time);
    idx++;
  }, '2m').start(0);

  const bellLoop = new Tone.Loop(time => {
    if (Math.random() < 0.2) {
      const note = scale[Math.floor(Math.random() * scale.length)];
      bell.triggerAttackRelease(note, '4n', time);
    }
  }, '2n').start('2n');

  nodes.push(chordLoop, bellLoop);
  return { master, nodes, bpm: 78 };
}
