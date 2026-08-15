/* ============================================================
   音声処理
   ============================================================ */

let audioCtx = null,
  bgmGain = null,
  bgmStarted = false,
  bgmOn = true,
  oscBank = [],
  chordIndex = 0,
  bgmInterval = null,
  lfo = null;

function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    startBGM();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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

function startBGM() {
  if (bgmStarted || !audioCtx) return;
  bgmStarted = true;
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = bgmOn ? 0.045 : 0;
  bgmGain.connect(audioCtx.destination);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(bgmGain);
  const chords = [
    [130.81, 164.81, 196.0],
    [146.83, 174.61, 220.0]
  ];
  oscBank = chords[0].map(f => {
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  bgmInterval = setInterval(() => {
    chordIndex = 1 - chordIndex;
    oscBank.forEach((o, i) => {
      o.frequency.linearRampToValueAtTime(
        chords[chordIndex][i],
        audioCtx.currentTime + 3
      );
    });
  }, 18000);
}

function toggleBGM() {
  ensureAudio();
  bgmOn = !bgmOn;
  document.getElementById('bgmToggle').textContent = bgmOn ? '🔊' : '🔇';
  if (bgmGain && audioCtx)
    bgmGain.gain.linearRampToValueAtTime(bgmOn ? 0.045 : 0, audioCtx.currentTime + 0.6);
}
