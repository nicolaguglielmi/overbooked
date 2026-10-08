/* audio.js: Web Audio synth for SFX and a small generative score.
 * No files: everything is synthesized in the browser, so the demo works
 * offline and from a single HTML file. Starts only after a user gesture. */
"use strict";

(function () {
  const A = { ctx: null, master: null, music: null, sfx: null, muted: false, intensity: 0, playing: false, step: 0, nextT: 0, bpm: 118, timer: null, finale: false };

  function init() {
    if (A.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : 0.8; A.master.connect(A.ctx.destination);
    A.music = A.ctx.createGain(); A.music.gain.value = 0.28; A.music.connect(A.master);
    A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.55; A.sfx.connect(A.master);
    A.lp = A.ctx.createBiquadFilter(); A.lp.type = "lowpass"; A.lp.frequency.value = 2400; A.lp.connect(A.music);
  }

  function unlock() { init(); if (A.ctx && A.ctx.state === "suspended") A.ctx.resume(); }

  function setMuted(m) {
    A.muted = m;
    DF.storage.set("ovb_muted", m);
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.05);
  }

  function tone(freq, t, dur, type, peak, dest, attack) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.2, t + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || A.sfx);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  let noiseBuf = null;
  function noise(t, dur, peak, hp, lp, dest) {
    if (!noiseBuf) {
      noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = A.ctx.createBufferSource(); src.buffer = noiseBuf;
    const f1 = A.ctx.createBiquadFilter(); f1.type = "highpass"; f1.frequency.value = hp || 800;
    const f2 = A.ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp || 9000;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak || 0.1, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest || A.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  const N = (semi) => 261.63 * Math.pow(2, semi / 12); // C4-based

  const SFX = {
    click() { tone(880, now(), 0.05, "square", 0.06); },
    pickup() { const t = now(); tone(N(7), t, 0.08, "square", 0.08); tone(N(12), t + 0.06, 0.12, "square", 0.08); },
    tick(p) { tone(N(12 + Math.round(p * 12)), now(), 0.04, "triangle", 0.05); },
    fix(combo) {
      const t = now(), base = Math.min(combo || 0, 8);
      [0, 4, 7, 12].forEach((s, i) => tone(N(s + base), t + i * 0.055, 0.16, "triangle", 0.13));
    },
    prevent() { const t = now(); [12, 16, 19, 24].forEach((s, i) => tone(N(s), t + i * 0.04, 0.12, "sine", 0.1)); },
    escalate() { const t = now(); tone(110, t, 0.35, "sawtooth", 0.12); tone(104, t + 0.02, 0.35, "square", 0.06); },
    warn() { const t = now(); tone(N(19), t, 0.08, "sine", 0.08); tone(N(19), t + 0.12, 0.08, "sine", 0.08); },
    spawn() { tone(N(-5), now(), 0.12, "triangle", 0.08); },
    applause() { const t = now(); for (let i = 0; i < 26; i++) noise(t + Math.random() * 0.9, 0.06, 0.05, 1500, 7000); },
    phone() { const t = now(); for (let i = 0; i < 3; i++) { tone(1320, t + i * 0.18, 0.08, "square", 0.04); tone(1660, t + i * 0.18 + 0.09, 0.08, "square", 0.04); } },
    murphy() { const t = now(); [7, 6, 5, 4, 3].forEach((s, i) => tone(N(s), t + i * 0.09, 0.1, "square", 0.06)); },
    caught() { const t = now(); [0, 7, 12, 19, 24].forEach((s, i) => tone(N(s), t + i * 0.05, 0.14, "square", 0.08)); },
    burnout() { const t = now(); [12, 7, 3, 0, -5].forEach((s, i) => tone(N(s), t + i * 0.1, 0.2, "triangle", 0.1)); },
    chime() { const t = now(); tone(N(16), t, 0.5, "sine", 0.12); tone(N(12), t + 0.25, 0.7, "sine", 0.12); },
    fanfare() { const t = now(); [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.6], [12, 0.72]].forEach(([s, d]) => { tone(N(s), t + d, 0.35, "square", 0.07); tone(N(s - 12), t + d, 0.35, "triangle", 0.08); }); },
    whoosh() { noise(now(), 0.25, 0.05, 400, 3000); },
    ping() { const t = now(); tone(N(24), t, 0.07, "sine", 0.05); tone(N(28), t + 0.06, 0.09, "sine", 0.04); },
    blip() { const t = now(); tone(N(16), t, 0.05, "triangle", 0.05); tone(N(21), t + 0.04, 0.05, "triangle", 0.04); },
    alarm() { const t = now(); for (let i = 0; i < 4; i++) { tone(880, t + i * 0.22, 0.11, "square", 0.05); tone(660, t + i * 0.22 + 0.11, 0.11, "square", 0.05); } },
    stamp() { const t = now(); noise(t, 0.09, 0.12, 120, 1800); tone(70, t, 0.12, "sine", 0.2); },
    card() { const t = now(); noise(t, 0.08, 0.05, 2000, 8000); tone(N(12), t + 0.03, 0.06, "triangle", 0.05); },
  };
  function now() { return A.ctx.currentTime; }

  function play(name, arg) {
    if (!A.ctx || A.muted || document.hidden) return;
    const f = SFX[name];
    if (f) try { f(arg); } catch (e) { /* audio is best-effort */ }
  }

  // ---- music: C major pop loop, layers enter with intensity ----
  const PROG = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // C G Am F
  function schedule() {
    if (!A.playing) return;
    const spb = 60 / A.bpm / 4; // sixteenth
    while (A.nextT < A.ctx.currentTime + 0.12) {
      const st = A.step, t = A.nextT;
      const bar = Math.floor(st / 16) % 4, s16 = st % 16;
      const ch = PROG[bar];
      const I = A.intensity;
      // kick on beats
      if (s16 % 4 === 0) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); g.connect(A.lp); o.start(t); o.stop(t + 0.2); }
      // bass
      if (s16 % 4 === 0 || (I > 0.5 && s16 % 4 === 3)) tone(N(ch[0] - 24), t, spb * 3.2, "triangle", 0.18, A.lp);
      // hats
      if (I > 0.15 && s16 % 2 === 1) noise(t, 0.03, 0.05 + I * 0.03, 6000, 12000, A.lp);
      if (I > 0.6 && s16 % 4 === 2) noise(t, 0.08, 0.06, 1500, 5000, A.lp);
      // arpeggio
      if (I > 0.3 || A.finale) { const n = ch[s16 % 3] + (s16 % 8 >= 6 ? 12 : 0); tone(N(n), t, spb * 0.9, "square", 0.035 + I * 0.02, A.lp); }
      // pad
      if (s16 === 0) ch.forEach((n) => tone(N(n - 12), t, spb * 15, "sine", 0.05, A.lp, 0.2));
      A.step++;
      A.nextT += spb;
    }
  }

  function startMusic() {
    if (!A.ctx || A.playing) return;
    A.playing = true; A.step = 0; A.nextT = A.ctx.currentTime + 0.05; A.finale = false;
    A.timer = setInterval(schedule, 40);
  }
  function stopMusic() { A.playing = false; clearInterval(A.timer); }
  function setIntensity(v) {
    A.intensity = DF.clamp(v, 0, 1);
    A.bpm = 112 + A.intensity * 22 + (A.finale ? 8 : 0);
    if (A.lp && A.ctx) A.lp.frequency.setTargetAtTime(1600 + A.intensity * 5000, A.ctx.currentTime, 0.3);
  }
  function finale(on) { A.finale = on; }

  // a hidden tab stays quiet: no music or pings from the background
  document.addEventListener("visibilitychange", () => {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend(); else if (!A.muted) A.ctx.resume();
  });

  A.muted = DF.storage.get("ovb_muted", false);
  DF.Audio = { unlock, play, setMuted, startMusic, stopMusic, setIntensity, finale, get muted() { return A.muted; } };
})();
