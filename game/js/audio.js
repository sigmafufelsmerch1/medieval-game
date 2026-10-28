const audio = {
  ctx: null, sfxGain: null, musicGain: null, sfxVol: .7, musicVol: .3,
  musicNodes: null, lastFootstep: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol; this.musicGain.connect(this.ctx.destination);
      this.startMusic();
    } catch (e) { console.warn('Audio init failed', e); }
  },
  noiseBuffer(d = .2) {
    const sr = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, Math.floor(sr * d), sr);
    const a = b.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return b;
  },
  tone(f, d, t = 'sine', v = .3, g = null) {
    if (!this.ctx) return;
    const n = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
    o.type = t; o.frequency.setValueAtTime(f, n);
    if (g) o.frequency.exponentialRampToValueAtTime(g, n + d);
    gn.gain.setValueAtTime(v, n); gn.gain.exponentialRampToValueAtTime(.001, n + d);
    o.connect(gn); gn.connect(this.sfxGain);
    o.start(n); o.stop(n + d + .02);
  },
  noise(d, v = .2, f = 1200, ft = 'lowpass') {
    if (!this.ctx) return;
    const n = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuffer(d);
    const fl = this.ctx.createBiquadFilter(); fl.type = ft; fl.frequency.value = f;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(.001, n + d);
    s.connect(fl); fl.connect(g); g.connect(this.sfxGain);
    s.start(n); s.stop(n + d + .02);
  },
  playMetal() { this.tone(1400, .12, 'square', .15, 800); this.noise(.08, .1, 3000, 'highpass'); },
  playChop() { this.tone(180, .1, 'triangle', .25, 80); this.noise(.09, .15, 1800); },
  playCreak() { this.tone(320, .35, 'sine', .12, 260); },
  playGrass() { this.noise(.18, .12, 2500, 'highpass'); },
  playWater() { this.noise(.5, .1, 700); },
  playHammer() { this.tone(500, .06, 'triangle', .2, 300); this.noise(.05, .1, 2000); },
  playDig() { this.noise(.15, .15, 400); },
  playDestroy() { this.noise(.6, .25, 500); this.tone(120, .4, 'sawtooth', .15, 60); },
  playFootstep() { this.tone(80 + Math.random() * 40, .05, 'triangle', .05); },
  startMusic() {
    if (!this.ctx || this.musicNodes) return;
    const t = this.ctx.currentTime;
    const d1 = this.ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 110;
    const d2 = this.ctx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 165;
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .05;
    const lg = this.ctx.createGain(); lg.gain.value = 8; lfo.connect(lg); lg.connect(d2.frequency);
    const g = this.ctx.createGain(); g.gain.value = .04;
    d1.connect(g); d2.connect(g); g.connect(this.musicGain);
    d1.start(t); d2.start(t); lfo.start(t);
    this.musicNodes = { d1, d2, lfo, g };
  },
  setSfx(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; },
  setMusic(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; }
};