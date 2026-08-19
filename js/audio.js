/* ============================================================
   音声処理
   ・効果音（○×判定音・クリック音）: Web Audio APIで直接生成
   ・BGM: Tone.jsで生成（playBright100）
   ・AudioContextはあえて共有しない（Tone.setContext()は「エラーは出ないのに
     音が出ない」不具合の報告が公式にも複数あるため、Tone.jsには自分自身の
     コンテキストを管理させる）
   ============================================================ */

let audioCtx = null,
  bgmStarted = false,
  bgmOn = true,
  bgmMaster = null; // BGM全体の音量・ON/OFFをまとめて制御するTone.Volumeノード

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
    startBGM();
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

/* ---------- BGM（Tone.js） ---------- */

async function startBGM() {
  if (bgmStarted || !audioCtx || !window.Tone) return;
  bgmStarted = true;
  try {
    await Tone.start();
    await playBright100();
  } catch (e) {
    bgmStarted = false; // 失敗したら次回また試せるように
    console.error('BGMの起動に失敗しました:', e);
    const btn = document.getElementById('bgmToggle');
    if (btn) btn.textContent = '⚠️';
  }
}

function toggleBGM() {
  ensureAudio();
  bgmOn = !bgmOn;
  document.getElementById('bgmToggle').textContent = bgmOn ? '🔊' : '🔇';
  // playBright100() がまだ非同期処理待ちで bgmMaster 未生成の場合は、
  // 生成時に現在の bgmOn を読むので自動的に反映される。
  if (bgmMaster) bgmMaster.mute = !bgmOn;
}

// ---------- ⑥ 明るめ・BPM100 ----------
async function playBright100() {
  Tone.Transport.bpm.value = 100;

  // BGM全体の出力口。効果音より控えめな音量にし、ここのmuteでON/OFFする。
  bgmMaster = new Tone.Volume(BGM_MASTER_DB).toDestination();
  bgmMaster.mute = !bgmOn;

  // リバーブは生成が非同期で、環境（特に一部のiOS Safari）によっては
  // 生成自体に失敗することがある。失敗してもBGM全体が無音にならないよう、
  // リバーブだけ個別にtry/catchし、失敗時はリバーブなしで鳴らす。
  let padDest = bgmMaster;
  let bellDest = bgmMaster;
  let reverb = null;
  try {
    reverb = new Tone.Reverb({ decay: 1.8, wet: 0.25 }).connect(bgmMaster);
    await reverb.ready; // IR生成が終わるまで待つ（待たないと生成完了まで無音）
    padDest = reverb;
    bellDest = reverb;
  } catch (e) {
    console.warn('リバーブの生成に失敗したため、リバーブなしでBGMを再生します:', e);
  }

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
  }).connect(bgmMaster);
  bass.volume.value = -12;

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 }
  }).connect(bgmMaster);
  clap.volume.value = -14;

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

  Tone.Transport.start();
  return { nodes: [reverb, pad, bell, bass, clap, chordLoop, bassLoop, bellLoop, clapLoop] };
}
