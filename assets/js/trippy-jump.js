(function() {
  'use strict';

  // ── Canvas Setup ──
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W, H;
  let sphereSizeScale = 1.0;
  const TAU = Math.PI * 2;

  // Detect touch/pointer type once at module level (used for scaling, hints, haptics)
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  // Offscreen canvas for static sacred geometry layers (Parallax layers)
  const bgCanvas = document.createElement('canvas');
  const bgCtx = bgCanvas.getContext('2d');

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    bgCanvas.width = W * dpr;
    bgCanvas.height = H * dpr;
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sphereSizeScale = isTouch ? 1.0 : Math.min(W / 900, 1.4);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Language ──
  // Detects from localStorage → browser navigator.language → 'en'.
  // TJ_CONTENT is set synchronously by trippy-jump-content.js before this script runs.
  {
    const _avail  = Object.keys(window.TJ_CONTENT || { en: 1 });
    const _stored = localStorage.getItem('tj-lang') || '';
    const _browser = (navigator.language || '').slice(0, 2).toLowerCase();
    window.TJ_LANG = _avail.includes(_stored)  ? _stored  :
                     _avail.includes(_browser) ? _browser : 'en';
  }
  const TJ_MILESTONES = (window.TJ_CONTENT?.[window.TJ_LANG]?.milestones) ||
                        (window.TJ_CONTENT?.en?.milestones) || [];

  // ── Color Themes ──
  const themes = [
    { name:'deepsky', primary:[40,150,255], secondary:[255,255,255], accent:[200,230,255], bg:[10,13,20], bgTop:[14,21,32], platTypes:{ spring:[255,220,50], fragile:[255,80,100], moving:[100,255,200], vanishing:[220,120,255] } },
    { name:'violet',  primary:[180,100,255], secondary:[255,80,200], accent:[220,180,255], bg:[8,6,15], bgTop:[13,8,21], platTypes:{ spring:[255,200,80], fragile:[255,100,130], moving:[120,220,255], vanishing:[255,160,200] } },
    { name:'cyan',    primary:[0,220,255],  secondary:[255,255,255], accent:[100,255,220], bg:[6,13,18], bgTop:[10,18,24], platTypes:{ spring:[255,230,60], fragile:[255,100,90], moving:[80,255,180], vanishing:[180,140,255] } },
    { name:'ember',   primary:[255,120,40],  secondary:[255,220,100], accent:[255,180,80], bg:[18,8,6], bgTop:[26,14,8], platTypes:{ spring:[255,240,80], fragile:[255,60,80], moving:[80,255,160], vanishing:[200,130,255] } },
    { name:'jade',    primary:[40,255,140],  secondary:[200,255,200], accent:[180,255,100], bg:[6,18,8], bgTop:[10,26,14], platTypes:{ spring:[255,220,50], fragile:[255,100,120], moving:[100,200,255], vanishing:[220,100,255] } },
    { name:'void',    primary:[255,60,180],  secondary:[150,200,255], accent:[255,100,255], bg:[2,0,5], bgTop:[8,4,16], platTypes:{ spring:[255,210,60], fragile:[255,90,110], moving:[80,255,200], vanishing:[180,160,255] } }
  ];
  let themeIndex = 0;
  let theme = { 
    primary: [...themes[0].primary], 
    secondary: [...themes[0].secondary], 
    accent: [...themes[0].accent],
    bg: [...themes[0].bg],
    bgTop: [...themes[0].bgTop],
    platTypes: JSON.parse(JSON.stringify(themes[0].platTypes))
  };
  let manualTheme = false;
  let lastAutoIdx = 0;

  function rgb(c, a) { return a !== undefined ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`; }

  // Compute a hue offset from theme primary so power-ups & player aura shift with theme
  function themeHueOffset() {
    const c = theme.primary;
    // RGB → hue (0-360)
    const r = c[0]/255, g = c[1]/255, b = c[2]/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
    // Map theme hue to a coarse bucket so changes feel intentional
    return h;
  }

  // ── Persistence ──
  const SAVE_KEY = 'trippy-jump-save-v3';
  function saveGame() {
    if (!playing) return;
    const data = {
      score, cameraY, maxHeight, themeIndex, chillMode,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
      platforms: platforms.slice(-40).map(p => ({ ...p, opacity: 1 }))
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }
  function loadGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    return saved ? JSON.parse(saved) : null;
  }

  // ── Game State ──
  let playing = false;
  let gameOver = false;
  let score = 0;
  let sessionStartScore = 0;
  let highScore = parseInt(localStorage.getItem('trippyJumpHigh') || '0');
  let cameraY = 0;
  let maxHeight = 0;
  let muted = localStorage.getItem('trippy-muted') !== '0'; // default: muted; '0' = user explicitly unmuted
  let time = 0;
  let chillMode = false;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    width: 24, height: 24,
    rotation: 0,
    powerUp: null,
    powerTimer: 0
  };

  const GRAVITY = 0.26;
  const JUMP_VEL = -8.8;
  const SPRING_VEL = -14.4;
  const FRICTION = 0.88; // Smooth deceleration
  const TILT_DEADZONE = 6; // Degrees of tilt ignored (resting buffer)
  const TILT_SENSITIVITY = 28; // Degrees for full deflection (more range = more control)

  let platforms = [];
  let particles = [];
  let trail = [];
  let shockwaves = [];
  let bgParticles = [];
  let powerUps = [];
  let mountains = [];
  let clouds = [];
  let debris = [];

  // ── Juiciness State ──
  // Squish/stretch: axes lerp back to 1 each frame
  let squishX = 1, squishY = 1;
  // Screen shake: random offset per-frame, magnitude decays exponentially
  let shakeX = 0, shakeY = 0, shakeMag = 0;
  // Trail tint: colour set by the jump type, stored per trail dot
  let trailLaunchColor = null;

  const keys = {};
  let touchDir = 0;
  let rawTilt = 0;
  let smoothTilt = 0;
  let tiltActive = false;

  // Ambient & milestone state
  let ambientMotes = [];
  let lastMilestone = 0;
  let padNoteTimer = 15; // seconds until first ambient pad note

  // Philosophical milestone system (mirrors Falling Emy's chapter system)
  let firedMilestones = new Set();
  let milestoneDisplay = null; // { score, label, text, life, maxLife }
  let journeyLog = []; // { score, label, text } — newest pushed to end

  // ── Audio Engine ──
  let audioCtx;
  let masterGain;
  let delayNode;
  let reverbNode; // second, longer delay for lush reverb tail
  let lastNoteTime = 0;
  // Melodic progression — each bounce steps through the scale sequentially,
  // creating an ascending melody as the player climbs
  let melodyStep = 0;
  // Pentatonic harmony tracking — when all 5 pitch classes are hit within
  // a rolling window, fire a chord bloom (inspired by Falling Emy)
  const HARMONY_UNSET = -1e9;
  const harmonyNotes = [HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET];
  let chordBloomCooldown = 0;
  let chordBloomFlash = 0;
  const CHORD_WINDOW_S = 3.5;
  const CHORD_COOLDOWN_S = 10.0;

  // Pentatonic scale (C D E G A across 2 octaves) — same as Falling Emy
  const pentatonicScale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const BASE_FREQ = 165; // E3 — warm, grounded

  // Melodic patterns per platform type — each defines how melodyStep advances
  // and which octave offset to apply, so special platforms feel distinct
  // while staying melodically connected to the main line
  const MELODY_MAP = {
    normal:    { step:  1, octaveShift: 0 },
    fragile:   { step:  2, octaveShift: 0 }, // skips ahead — feels like a "glitch"
    moving:    { step:  1, octaveShift: 0 },
    vanishing: { step:  1, octaveShift: 0 },
    spring:    { step:  1, octaveShift: 5 }  // jumps an octave — feels like lift-off
  };

  function initAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    audioCtx.resume().catch(() => {});

    // iOS Web Audio unlock: play a 1-frame silent buffer
    try {
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
    } catch(e) {}

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55; // slightly lower for smoothness
    // Soft low-pass to tame high frequencies — warm, never harsh
    const masterFilter = audioCtx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 3500;
    masterFilter.Q.value = 0.5;
    masterGain.connect(masterFilter);
    masterFilter.connect(audioCtx.destination);

    // Primary delay — warm echo with lowpass filter
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.35;
    const feedback1 = audioCtx.createGain();
    feedback1.gain.value = 0.35;
    const delayFilter = audioCtx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1200; // warmer cutoff
    delayNode.connect(delayFilter);
    delayFilter.connect(feedback1);
    feedback1.connect(delayNode);
    delayNode.connect(masterGain);

    // Reverb tail — longer, softer delay for lush sustain
    reverbNode = audioCtx.createDelay();
    reverbNode.delayTime.value = 0.55;
    const feedback2 = audioCtx.createGain();
    feedback2.gain.value = 0.3;
    const reverbFilter = audioCtx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 900; // even warmer
    reverbNode.connect(reverbFilter);
    reverbFilter.connect(feedback2);
    feedback2.connect(reverbNode);
    reverbNode.connect(masterGain);
  }

  // Stereo panning helper — pans sound based on player X position
  function getPanner() {
    if (!audioCtx) return null;
    const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
    if (panner.pan) panner.pan.value = Math.max(-1, Math.min(1, (player.x / W) * 2 - 1));
    return panner;
  }

  // ── Melodic note selection ──
  // Advances melodyStep through the pentatonic scale with subtle randomness
  // inspired by Falling Emy — occasional fills (step+1), pullbacks (step-1),
  // and rare octave drops keep the melody feeling alive rather than mechanical.
  function pickMelodicNote(platformType) {
    const map = MELODY_MAP[platformType] || MELODY_MAP.normal;

    // ~12 % chance: run ahead one extra step (creates a small melodic fill)
    // ~8 %  chance: pull back one step (adds contrast / resolution feeling)
    let step = map.step;
    const rnd = Math.random();
    if      (rnd < 0.12) step += 1;
    else if (rnd < 0.20) step = Math.max(1, step - 1);

    const idx = (melodyStep + map.octaveShift) % pentatonicScale.length;
    const semitone = pentatonicScale[idx];
    melodyStep += step;

    const octaveRange = Math.min(Math.floor(melodyStep / pentatonicScale.length), 1);
    const octaveShift = octaveRange * 12;

    // ~15 % chance: drop an octave for tonal colour / keeps things warm
    const colorShift = Math.random() < 0.15 ? -12 : 0;

    const freq = BASE_FREQ * Math.pow(2, (semitone + octaveShift + colorShift) / 12);
    return { idx: idx % 5, freq, pitchClass: idx % 5 };
  }

  // Track harmony — record when a pitch class is played, check for bloom
  function recordHarmonyHit(pitchClass) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    harmonyNotes[pitchClass] = now;
    if (chordBloomCooldown > 0) return;
    // Check if all 5 pitch classes were hit within the window
    for (let i = 0; i < 5; i++) {
      if (now - harmonyNotes[i] > CHORD_WINDOW_S) return;
    }
    // Bloom! All 5 pitch classes hit within window
    chordBloomCooldown = CHORD_COOLDOWN_S;
    chordBloomFlash = 1.0;
    playChordBloom();
    // Visual: add shockwave at player position
    addShockwave(player.x, player.y - cameraY, [255, 255, 255]);
  }

  // Soft resolving chord — plays all 5 pentatonic notes as a shimmer
  function playChordBloom() {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    const pentatonicRatios = [1.0, 1.2599, 1.4983, 1.6818, 2.0]; // C D E G A
    pentatonicRatios.forEach((ratio, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const startT = now + i * 0.1;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(BASE_FREQ * ratio, startT);
      g.gain.setValueAtTime(0, startT);
      g.gain.linearRampToValueAtTime(0.09, startT + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, startT + 3.0);
      osc.connect(g); g.connect(masterGain);
      if (delayNode) g.connect(delayNode);
      if (reverbNode) g.connect(reverbNode);
      osc.start(startT); osc.stop(startT + 3.1);
    });
  }

  // Helper: connect a gain node to panner + delays in one place
  function routeToOutput(gainNode, panner) {
    gainNode.connect(panner || masterGain);
    if (panner) panner.connect(masterGain);
    if (delayNode) gainNode.connect(delayNode);
    if (reverbNode) gainNode.connect(reverbNode);
  }

  // ── Jump sounds per platform type ──
  function playJumpSound(platformType) {
    if (muted || !audioCtx) return; // guard: safe even if audioCtx was never created
    const note = pickMelodicNote(platformType);
    recordHarmonyHit(note.pitchClass);

    if (platformType === 'spring') {
      // Spring: lush ascending arpeggio (root → third → fifth → octave)
      const now = audioCtx.currentTime;
      const panner = getPanner();
      const notes = [note.freq, note.freq * 1.25, note.freq * 1.498, note.freq * 2.0];
      notes.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const startT = now + i * 0.09;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, startT);
        g.gain.setValueAtTime(0, startT);
        g.gain.linearRampToValueAtTime(0.22 - i * 0.03, startT + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, startT + 1.4);
        osc.connect(g);
        routeToOutput(g, panner);
        osc.start(startT); osc.stop(startT + 1.5);
      });

    } else if (platformType === 'fragile') {
      // Fragile: gentle descending sigh — soft, melancholic
      const now = audioCtx.currentTime;
      const panner = getPanner();
      const osc = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq * 1.05, now);
      osc.frequency.exponentialRampToValueAtTime(note.freq * 0.75, now + 0.6);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(note.freq * 1.05 * 1.498, now);
      osc2.frequency.exponentialRampToValueAtTime(note.freq * 0.75 * 1.498, now + 0.6);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(g); osc2.connect(g);
      routeToOutput(g, panner);
      osc.start(now); osc.stop(now + 1.0);
      osc2.start(now); osc2.stop(now + 1.0);

    } else if (platformType === 'moving') {
      // Moving: warm pad with gentle chorus — three detuned sines for a lush, liquid pad
      const now = audioCtx.currentTime;
      const panner = getPanner();
      const detunes = [0, 0.003, -0.002]; // chorus spread
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      detunes.forEach(d => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq * (1 + d), now);
        osc.connect(g);
        osc.start(now); osc.stop(now + 1.3);
      });
      routeToOutput(g, panner);

    } else if (platformType === 'vanishing') {
      // Vanishing: ethereal singing bowl — soft attack, very long ring
      const now = audioCtx.currentTime;
      const panner = getPanner();
      const osc = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(note.freq * 0.997, now); // slow beat for warmth
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc.connect(g); osc2.connect(g);
      routeToOutput(g, panner);
      osc.start(now); osc.stop(now + 2.1);
      osc2.start(now); osc2.stop(now + 2.1);

    } else {
      // Normal: warm tone + randomly-chosen harmonic interval (inspired by Falling Emy).
      // Cycling through min3 / maj3 / p4 / p5 keeps the melody feeling fresh
      // while staying consonant. Triangle wave (~25% chance) adds extra warmth.
      const now = audioCtx.currentTime;
      const panner = getPanner();
      const osc1 = audioCtx.createOscillator();
      const g1 = audioCtx.createGain();
      const osc2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();

      osc1.type = Math.random() < 0.25 ? 'triangle' : 'sine'; // triangle = warmer timbre
      osc1.frequency.setValueAtTime(note.freq, now);
      g1.gain.setValueAtTime(0, now);
      g1.gain.linearRampToValueAtTime(0.17, now + 0.04);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      // Warm harmonic interval — random from min3, maj3, perfect 4th, perfect 5th
      const intervals = [1.2, 1.2599, 1.3348, 1.4983];
      const harmInterval = intervals[Math.floor(Math.random() * intervals.length)];
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(note.freq * harmInterval, now);
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(0.07, now + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc1.connect(g1); osc2.connect(g2);
      routeToOutput(g1, panner);
      routeToOutput(g2, panner);
      osc1.start(now); osc1.stop(now + 1.1);
      osc2.start(now); osc2.stop(now + 0.85);
    }
  }

  // Power-up collect sounds
  function playPowerUpSound(type) {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    const panner = getPanner();
    const note = pickMelodicNote('normal');

    if (type === 'nova') {
      // Nova: crystalline arpeggio — root, third, fifth, octave
      const notes = [note.freq, note.freq * 1.25, note.freq * 1.498, note.freq * 2];
      notes.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const startT = now + i * 0.08;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, startT);
        g.gain.setValueAtTime(0, startT);
        g.gain.linearRampToValueAtTime(0.2 - i * 0.03, startT + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, startT + 1.0);
        osc.connect(g);
        routeToOutput(g, panner);
        osc.start(startT); osc.stop(startT + 1.1);
      });
    } else if (type === 'aura') {
      // Aura: soft pentatonic wash — all 5 notes, slow stagger, long sustain
      const pentatonicRatios = [1.0, 1.2599, 1.4983, 1.6818, 2.0];
      pentatonicRatios.forEach((ratio, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const startT = now + i * 0.1;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq * ratio, startT);
        g.gain.setValueAtTime(0, startT);
        g.gain.linearRampToValueAtTime(0.12, startT + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, startT + 2.0);
        osc.connect(g);
        routeToOutput(g, panner);
        osc.start(startT); osc.stop(startT + 2.1);
      });
    } else if (type === 'magnet') {
      // Magnet: deep warm drone with gentle beat
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc1.type = 'sine'; osc2.type = 'sine';
      osc1.frequency.setValueAtTime(note.freq * 0.5, now);
      osc2.frequency.setValueAtTime(note.freq * 0.5 + 1.2, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      osc1.connect(g); osc2.connect(g);
      routeToOutput(g, panner);
      osc1.start(now); osc1.stop(now + 1.4);
      osc2.start(now); osc2.stop(now + 1.4);
    } else if (type === 'merkaba') {
      // Crystal arpeggio: root, third, fifth, octave
      const notes = [note.freq, note.freq * 1.26, note.freq * 1.5, note.freq * 2];
      notes.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const t = now + i * 0.07;
        osc.type = 'sine'; osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18 - i * 0.03, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        osc.connect(g); routeToOutput(g, panner);
        osc.start(t); osc.stop(t + 1.6);
      });
    } else if (type === 'lotus') {
      // Warm pad: two detuned sines
      [note.freq, note.freq * 1.005].forEach(f => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(f * 0.5, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        osc.connect(g); routeToOutput(g, panner);
        osc.start(now); osc.stop(now + 1.9);
      });
    } else if (type === 'vesica') {
      // Deep drone with filter sweep
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      osc.type = 'sine'; osc.frequency.setValueAtTime(note.freq * 0.25, now);
      filt.type = 'lowpass'; filt.frequency.setValueAtTime(200, now);
      filt.frequency.linearRampToValueAtTime(2000, now + 0.4);
      filt.frequency.exponentialRampToValueAtTime(400, now + 1.2);
      filt.Q.setValueAtTime(5, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      osc.connect(filt); filt.connect(g); routeToOutput(g, panner);
      osc.start(now); osc.stop(now + 1.4);
    } else if (type === 'seed') {
      // Quick bright ascending triad
      [note.freq, note.freq * 1.26, note.freq * 1.5].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const t = now + i * 0.06;
        osc.type = 'sine'; osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(g); routeToOutput(g, panner);
        osc.start(t); osc.stop(t + 0.9);
      });
    } else if (type === 'star') {
      // Bright major chord shimmer
      [1.0, 1.26, 1.5, 2.0].forEach(ratio => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(note.freq * ratio, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.1, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(g); routeToOutput(g, panner);
        osc.start(now); osc.stop(now + 1.3);
      });
    }
  }

  // Game over sound — gentle descending pentatonic cascade
  function playGameOverSound() {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    // Descend through the pentatonic scale: A G E D C (relative)
    const descSemitones = [0, -2, -4, -7, -9];
    descSemitones.forEach((semi, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const startT = now + i * 0.22;
      const freq = BASE_FREQ * Math.pow(2, semi / 12);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startT);
      g.gain.setValueAtTime(0, startT);
      g.gain.linearRampToValueAtTime(0.14, startT + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, startT + 1.8);
      osc.connect(g); g.connect(masterGain);
      if (delayNode) g.connect(delayNode);
      if (reverbNode) g.connect(reverbNode);
      osc.start(startT); osc.stop(startT + 1.9);
    });
  }

  // Gentle milestone chord — plays at score milestones, inspired by Falling Emy's milestone events.
  // Four-note major spread (root, maj3, p5, octave) with slow stagger for a warm resolve.
  function playMilestoneChord() {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    [BASE_FREQ, BASE_FREQ * 1.2599, BASE_FREQ * 1.4983, BASE_FREQ * 2].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const t = now + i * 0.15;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
      osc.connect(g); g.connect(masterGain);
      if (reverbNode) g.connect(reverbNode);
      osc.start(t); osc.stop(t + 3.1);
    });
  }

  // Quiet sustaining pad note — warm root + sub-octave sine that fades in and out
  // over ~11 s, providing an atmospheric "breath" under the melodic layer.
  function playPadNote() {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    [BASE_FREQ, BASE_FREQ * 0.5, BASE_FREQ * 0.25].forEach(f => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.035, now + 2.5);
      g.gain.setValueAtTime(0.035, now + 7.0);
      g.gain.exponentialRampToValueAtTime(0.001, now + 11.0);
      osc.connect(g);
      if (reverbNode) g.connect(reverbNode); else g.connect(masterGain);
      osc.start(now); osc.stop(now + 11.1);
    });
  }

  // ── Journey Log (panel) ──
  // Renders the milestone history inside the info panel, newest first.
  // SVG icons reflect the altitude tier — circle (birth) → triangles → hexagram.
  function updateJourneyPanel() {
    const el = document.getElementById('journey-log');
    if (!el) return;
    if (journeyLog.length === 0) {
      const content = window.TJ_CONTENT?.[window.TJ_LANG];
      const empty = content?.ui?.journeyEmpty || 'The ascent just began…';
      el.innerHTML = `<p id="journey-empty" style="font-size:0.82rem;color:rgba(255,255,255,0.2);font-style:italic;margin:0">${empty}</p>`;
      return;
    }
    let html = '';
    for (let i = journeyLog.length - 1; i >= 0; i--) {
      const e = journeyLog[i];
      let svg;
      if (e.score <= 500) {
        // First km — circle with centre dot
        svg = `<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.7"/><circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.8"/></svg>`;
      } else if (e.score <= 2500) {
        // Mid ascent — single upward triangle
        svg = `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill="none" stroke="currentColor" stroke-width="1" opacity="0.65"/></svg>`;
      } else if (e.score <= 5000) {
        // High ascent — nested triangles
        svg = `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill="none" stroke="currentColor" stroke-width="1" opacity="0.65"/><polygon points="8,5 12,13 4,13" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.35"/></svg>`;
      } else {
        // Peak ascent — hexagram (Star of David / Merkaba)
        svg = `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 14,12 2,12" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.6"/><polygon points="8,15 14,4 2,4" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.6"/></svg>`;
      }
      html += `<div class="journey-entry"><div class="journey-icon">${svg}</div><div class="journey-entry-text"><strong>${e.label}</strong> — ${e.text}</div></div>`;
    }
    el.innerHTML = html;
  }

  // ── Haptic Feedback ──
  function vibrate(pattern) {
    if (isTouch && navigator.vibrate) navigator.vibrate(pattern);
  }

  // ── Accelerometer ──
  let accelInited = false;
  function initAccel() {
    if (accelInited) return;
    const setupEvents = () => {
      window.addEventListener('deviceorientation', e => {
        let gamma = e.gamma;
        let beta = e.beta;
        if (gamma === null || beta === null) return;

        let angle = (window.screen && window.screen.orientation) ? window.screen.orientation.angle : (window.orientation || 0);
        angle = ((angle % 360) + 360) % 360;

        let tilt = 0;
        if (angle === 90) {
          tilt = beta;
        } else if (angle === 270) {
          tilt = -beta;
        } else if (angle === 180) {
          tilt = -gamma;
        } else {
          tilt = gamma;
        }
        
        rawTilt = tilt;
      }, {passive: true});
      accelInited = true;
    };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(perm => {
        if (perm === 'granted') setupEvents();
      }).catch(e => console.warn(e));
    } else setupEvents();
  }

  // ── Parallax Init ──
  function initParallax() {
    mountains = [];
    for (let i = 0; i < 6; i++) {
      mountains.push({ x: i * 350, w: 500, h: 250 + Math.random() * 200, c: 20 + Math.random() * 20 });
    }
    clouds = [];
    for (let i = 0; i < 20; i++) {
      clouds.push({ x: Math.random() * W, y: Math.random() * 2000 + 500, r: 60 + Math.random() * 120, s: 0.2 + Math.random() * 0.4 });
    }
    bgParticles = [];
    for (let i = 0; i < 120; i++) {
      bgParticles.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + 0.5, s: Math.random() * 0.6 + 0.1, a: Math.random() * 0.9 + 0.2 });
    }

    // Mid-ground geometric debris — 40 triangles and hexagons that tile
    // vertically as the player ascends, each at its own parallax speed.
    debris = [];
    for (let i = 0; i < 40; i++) {
      debris.push({
        x:        Math.random() * W,
        yOffset:  Math.random() * (H * 1.5),   // position within one scroll cycle
        rot:      Math.random() * TAU,
        rotSpeed: (Math.random() - 0.5) * 0.018,
        driftX:   (Math.random() - 0.5) * 0.12, // gentle horizontal float
        size:     10 + Math.random() * 26,
        sides:    Math.random() < 0.5 ? 3 : 6,
        s:        0.18 + Math.random() * 0.52,  // parallax factor (lower = slower)
        alpha:    0.05 + Math.random() * 0.09
      });
    }

    // Ambient motes — 38 tiny screen-space specks that drift upward gently,
    // giving the scene an atmospheric, living quality (similar to Falling Emy's feel).
    ambientMotes = [];
    for (let i = 0; i < 38; i++) {
      ambientMotes.push({
        x:         Math.random() * W,
        y:         Math.random() * H,
        vx:        (Math.random() - 0.5) * 0.22,
        vy:        -(Math.random() * 0.32 + 0.07), // gently upward
        size:      Math.random() * 1.5 + 0.25,
        phase:     Math.random() * TAU,
        speed:     Math.random() * 0.5 + 0.18,     // individual oscillation speed
        baseAlpha: Math.random() * 0.11 + 0.03
      });
    }
  }

  // ── Helpers ──
  function burst(x, y, color, count, type = 'dot') {
    const len = particles.length;
    if (len > 300) return; // Hard cap on particles for performance
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = Math.random() * 5 + 1;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (type === 'spark' ? 2 : 0),
        life: 1.0, decay: 0.01 + Math.random() * 0.02, size: Math.random() * 4 + 1, color: color || theme.primary, type
      });
    }
  }

  function addShockwave(x, y, color) {
    if (shockwaves.length > 5) return;
    shockwaves.push({ x, y, radius: 0, maxRadius: 120, alpha: 0.7, color: color || theme.primary });
  }

  // Kick screen shake; subsequent calls only increase magnitude, never decrease it
  function triggerShake(mag) {
    shakeMag = Math.max(shakeMag, mag);
  }

  // Landing squash (wide+flat) — axes lerp back to 1 automatically in update()
  function triggerSquish() {
    squishX = 1.45;
    squishY = 0.62;
  }

  // ── Init Game ──
  function initGame(restore = false) {
    const saved = restore ? loadGame() : null;
    score = saved ? saved.score : 0;
    sessionStartScore = score;
    cameraY = saved ? saved.cameraY : 0;
    maxHeight = saved ? saved.maxHeight : 0;
    lastAutoIdx = Math.min(themes.length-1, Math.floor(maxHeight / 10000));
    themeIndex = saved ? saved.themeIndex : lastAutoIdx;
    const t = themes[themeIndex];
    theme = { 
      primary: [...t.primary], 
      secondary: [...t.secondary], 
      accent: [...t.accent],
      bg: [...t.bg],
      bgTop: [...t.bgTop],
      platTypes: JSON.parse(JSON.stringify(t.platTypes))
    };
    chillMode = saved ? saved.chillMode : false;
    document.getElementById('chill-btn').classList.toggle('is-on', chillMode);

    gameOver = false;
    playing = true;
    particles = [];
    trail = [];
    shockwaves = [];
    powerUps = [];
    time = 0;
    squishX = 1; squishY = 1;
    shakeX = 0; shakeY = 0; shakeMag = 0;
    trailLaunchColor = null;
    debris = [];
    lastNoteTime = 0;
    melodyStep = 0;
    for (let i = 0; i < 5; i++) harmonyNotes[i] = HARMONY_UNSET;
    chordBloomCooldown = 0;
    chordBloomFlash = 0;
    lastMilestone = 0;
    padNoteTimer = 15 + Math.random() * 5; // stagger first pad note

    // Recalibrate tilt center each game start

    // Philosophical milestone reset
    firedMilestones.clear();
    milestoneDisplay = null;
    journeyLog = [];
    // Pre-fire milestones already behind the starting score (prevents burst on restore)
    for (let _i = 0; _i < TJ_MILESTONES.length; _i++) {
      if (TJ_MILESTONES[_i].score <= score) firedMilestones.add(_i);
    }
    updateJourneyPanel();

    if (saved) {
      player.x = saved.player.x; player.y = saved.player.y;
      player.vx = saved.player.vx; player.vy = saved.player.vy;
      platforms = saved.platforms;
    } else {
      player.x = W / 2; player.y = H - 150;
      player.vx = 0; player.vy = JUMP_VEL;
      platforms = [{ x: W/2 - 50, y: H - 100, w: 100, h: 10, type: 'normal', alive: true, opacity: 1 }];
      generatePlatforms(H - 100, H - 3000);
    }
    initParallax();
  }

  function generatePlatforms(fromY, toY) {
    let y = fromY;
    const baseGap = 70;
    const maxDifficultyGap = 70;
    const newPlatforms = [];

    // Seed the reachability check from the last platform already in the world.
    let prevP = platforms.length > 0 ? platforms[platforms.length - 1] : null;

    while (y > toY) {
      const difficultyProgress = Math.min(score / 2000, 1);
      const currentMaxGap = baseGap + difficultyProgress * maxDifficultyGap;

      // Desktop gets denser platforms: a 28 % smaller gap means ~39 % more
      // platforms in view at any time, giving the player more path options.
      const gapMult = isTouch ? 1.0 : 0.72;
      y -= gapMult * (50 + Math.random() * (currentMaxGap - 50));

      const w = (65 + Math.random() * 25) * sphereSizeScale;
      let x = Math.random() * (W - w);

      // ── Reachability guarantee ──
      // Physics: after landing on prevP the player launches with vy = JUMP_VEL (-11).
      // The time to fall back down to height dy above prevP:
      //   0.16t² - 11t + dy = 0  →  t_land = (11 + √(121 - 0.64·dy)) / 0.32
      // Maximum horizontal travel in that time at peak vx ≈ 5 px/frame.
      // If the randomly-placed platform is outside that cone, reposition it.
      if (prevP) {
        const dy = prevP.y - y; // px gap upward (always positive here)
        const disc = 121 - 0.64 * dy;
        if (disc >= 0) {
          const tLand    = (11 + Math.sqrt(disc)) / 0.32;       // frames in air
          const maxHoriz = Math.min(tLand * 5.0, W * 0.49);     // cap at wrap distance

          const srcCx   = prevP.x + prevP.w * 0.5;
          const dstCx   = x + w * 0.5;
          const rawDist = Math.abs(dstCx - srcCx);
          // Minimum distance accounting for screen-wrap shortcut
          const horizDist  = Math.min(rawDist, W - rawDist);
          // A platform is reachable if its nearest edge is within maxHoriz
          const reachable  = horizDist <= maxHoriz + (prevP.w + w) * 0.5;

          if (!reachable) {
            // Place within a comfortable 75 % of max reach so it never feels borderline.
            const safeR = Math.min(maxHoriz * 0.75, W * 0.44 - w * 0.5);
            x = srcCx + (Math.random() * 2 - 1) * safeR - w * 0.5;
            x = Math.max(0, Math.min(W - w, x));
          }
        }
      }

      let type = 'normal';
      const r = Math.random();
      const diff = Math.min(-y / 15000, 0.8);
      if (r < 0.06 + diff * 0.1) type = 'spring';
      else if (r < 0.15 + diff * 0.15) type = 'fragile';
      else if (r < 0.3 + diff * 0.15) type = 'moving';
      else if (r < 0.4 + diff * 0.1) type = 'vanishing';

      const p = { x, y, w, h: 10, type, alive: true, opacity: 1, vx: (Math.random() - 0.5) * 3, fade: 0 };
      newPlatforms.push(p);
      prevP = p; // next platform must be reachable from this one

      if (-y / 10 >= sessionStartScore + 100 && Math.random() < 0.09) {
        const pTypes = ['aura', 'nova', 'magnet', 'merkaba', 'lotus', 'vesica', 'seed', 'star'];
        powerUps.push({ x: x + w/2, y: y - 35, type: pTypes[Math.floor(Math.random()*pTypes.length)], alive: true, phase: Math.random()*TAU });
      }
    }
    platforms = platforms.concat(newPlatforms);
  }

  // ── Drawing ──
  function drawSg(targetCtx, cx, cy, r, alpha, sides = 6, rot = 0) {
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.strokeStyle = rgb(theme.primary);
    targetCtx.lineWidth = 1;
    targetCtx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (TAU / sides) * i + rot;
      targetCtx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.5, 0, TAU);
    }
    targetCtx.stroke();
    targetCtx.restore();
  }

  function drawBackground() {
    const depth = -cameraY;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    
    let topColor = rgb(theme.bgTop), botColor = rgb(theme.bg);
    if (depth < 8000) {
       const f = depth / 8000;
       topColor = lerpColorRgb([30, 58, 95], theme.bgTop, f);
       botColor = lerpColorRgb([43, 88, 118], theme.bg, f);
    } else if (depth > 12000) {
       const f = Math.min((depth - 12000) / 10000, 1);
       topColor = lerpColorRgb(theme.bgTop, [2, 0, 5], f);
       botColor = lerpColorRgb(theme.bg, theme.bg, f);
    }
    
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, botColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Mountains
    if (depth < 10000) {
      const mAlpha = Math.max(0, 1 - depth / 8000);
      ctx.save();
      ctx.globalAlpha = mAlpha;
      for (let i = 0; i < mountains.length; i++) {
        const m = mountains[i];
        const mx = (m.x - cameraY * 0.04) % (W + 500) - 250;
        ctx.fillStyle = `rgba(${m.c},${m.c+10},${m.c+20}, 0.9)`;
        ctx.beginPath(); ctx.moveTo(mx, H); ctx.lineTo(mx + m.w/2, H - m.h); ctx.lineTo(mx + m.w, H); ctx.fill();
      }
      ctx.restore();
    }

    // Clouds
    if (depth > 500 && depth < 15000) {
      const cAlpha = depth < 4000 ? (depth-500)/3500 : Math.max(0, 1-(depth-10000)/5000);
      ctx.save();
      ctx.globalAlpha = cAlpha;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        const cy = (c.y - cameraY * c.s) % (H + 500) - 250;
        const g = ctx.createRadialGradient(c.x, cy, 0, c.x, cy, c.r);
        g.addColorStop(0, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, cy, c.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // Mid-ground geometric debris (depth 3 500 – 20 000)
    // Pieces tile vertically using a tiling-parallax formula: each layer scrolls
    // at rate (1 − s) relative to the camera, so different speeds never sync.
    if (depth > 3500 && depth < 20000 && debris.length > 0) {
      const dAlpha = depth < 6500  ? (depth - 3500) / 3000      // fade in
                   : depth > 16000 ? Math.max(0, 1 - (depth - 16000) / 4000) // fade out
                   : 1;
      ctx.save();
      const period = H * 1.5; // vertical tile period in screen pixels
      for (let i = 0; i < debris.length; i++) {
        const d = debris[i];
        // How far has this parallax layer scrolled in screen space?
        const scrolled = -cameraY * (1 - d.s);
        const sy = ((scrolled + d.yOffset) % period + period) % period - H * 0.25;
        if (sy < -d.size - 4 || sy > H + d.size + 4) continue;

        d.rot += d.rotSpeed;
        d.x   += d.driftX;
        if (d.x < -d.size) d.x = W + d.size;
        if (d.x >  W + d.size) d.x = -d.size;

        ctx.save();
        ctx.globalAlpha = dAlpha * d.alpha;
        ctx.strokeStyle = rgb(theme.accent, 1);
        ctx.lineWidth = 1;
        ctx.translate(d.x, sy);
        ctx.rotate(d.rot);
        ctx.beginPath();
        for (let j = 0; j < d.sides; j++) {
          const a = (TAU / d.sides) * j;
          j === 0
            ? ctx.moveTo(Math.cos(a) * d.size, Math.sin(a) * d.size)
            : ctx.lineTo(Math.cos(a) * d.size, Math.sin(a) * d.size);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Stars & Deep Space
    if (depth > 8000) {
      const sAlpha = Math.min(1, (depth - 8000) / 4000);
      ctx.save();
      ctx.globalAlpha = sAlpha;
      for (let i = 0; i < bgParticles.length; i++) {
        const p = bgParticles[i];
        const sy = (p.y - cameraY * p.s) % H;
        // Each star has its own twinkle frequency driven by its parallax speed,
        // with a per-star phase offset so they don't all pulse in unison.
        const twinkle = 0.5 + 0.5 * Math.sin(time * p.s * 8 + p.x * 0.1);
        ctx.fillStyle = rgb(theme.accent, p.a * twinkle);
        ctx.beginPath(); ctx.arc(p.x, sy, p.r, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const r = (150 + i * 180) * sphereSizeScale;
        const tx = W/2 + Math.sin(time * 0.08 + i) * 120;
        const ty = H/2 + Math.cos(time * 0.12 + i) * 120;
        drawSg(ctx, tx, ty, r, 0.05 * sAlpha, 6 + i, time * 0.05);
      }
      ctx.restore();
    }
    // Altitude vignette — radial gradient, transparent at low depth, max 0.62 at top
    const vigAlpha = Math.min(0.62, depth / 16000);
    if (vigAlpha > 0.01) {
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.92);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, `rgba(0,0,0,${vigAlpha.toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    if (chillMode) drawChillBarrier();
  }

  function lerpColorRgb(c1, c2, f) {
    return `rgb(${Math.round(c1[0]+(c2[0]-c1[0])*f)}, ${Math.round(c1[1]+(c2[1]-c1[1])*f)}, ${Math.round(c1[2]+(c2[2]-c1[2])*f)})`;
  }
  function lerpColor(a, b, f) {
    const c1 = hexToRgb(a), c2 = hexToRgb(b);
    return `rgb(${Math.round(c1[0]+(c2[0]-c1[0])*f)}, ${Math.round(c1[1]+(c2[1]-c1[1])*f)}, ${Math.round(c1[2]+(c2[2]-c1[2])*f)})`;
  }
  function hexToRgb(h){
    const i = parseInt(h.slice(1), 16);
    return [i>>16&255, i>>8&255, i&255];
  }

  function drawChillBarrier() {
    const sy = H - 25;
    ctx.save();
    const g = ctx.createLinearGradient(0, sy-10, 0, sy+10);
    const color = theme.accent;
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.5, rgb(color, 0.6 + Math.sin(time*5)*0.2));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, sy-10, W, 20);
    for (let x = -50; x < W + 100; x += 80) {
      drawSg(ctx, x - (time * 60)%80, sy, 35, 0.3, 6, time);
    }
    ctx.restore();
  }

  function drawPowerUp(p) {
    if (!p.alive) return;
    const sy = p.y - cameraY;
    if (sy < -50 || sy > H + 50) return;
    ctx.save();
    const th = themeHueOffset(); // shift hues with theme
    const bob = Math.sin(time * 3.5 + p.phase) * 12;
    const cx = p.x, cy = sy + bob;
    const r = 22;
    const pulse = 1 + Math.sin(time * 2.2 + p.phase) * 0.08;
    const R = r * pulse;
    ctx.lineCap = 'round';

    if (p.type === 'aura') {
      // Iridescent triple-ring + 8 sparkle rays
      const hue = (time * 35 + p.phase * 57.3 + th) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2);
      g.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.4)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2, 0, TAU); ctx.fill();
      for (let ring = 0; ring < 3; ring++) {
        const rh = (hue + ring * 120) % 360;
        ctx.strokeStyle = `hsla(${rh}, 85%, 65%, ${0.7 - ring * 0.15})`;
        ctx.lineWidth = 1.2 - ring * 0.2;
        ctx.beginPath(); ctx.arc(cx, cy, R * (0.6 + ring * 0.25), 0, TAU); ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${hue}, 90%, 80%, 0.6)`;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i + time * 0.8;
        const len = R * (0.9 + Math.sin(time * 5 + i) * 0.3);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
      }
      ctx.fillStyle = `hsla(${hue}, 90%, 90%, 0.9)`;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();

    } else if (p.type === 'nova') {
      // 8 primary + 8 secondary rays, bright core
      const hue = (185 + th + Math.sin(time * 4) * 20) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2);
      g.addColorStop(0, `hsla(${hue}, 80%, 90%, 0.5)`);
      g.addColorStop(0.5, `hsla(${hue}, 90%, 60%, 0.15)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.8)`; ctx.lineWidth = 1.4;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i + time * 0.5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${hue}, 80%, 80%, 0.4)`; ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i + TAU / 16 + time * 0.5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 0.65, cy + Math.sin(a) * R * 0.65); ctx.stroke();
      }
      ctx.fillStyle = `hsla(${hue}, 60%, 95%, 0.9)`;
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill();

    } else if (p.type === 'magnet') {
      // Horseshoe with field lines
      const hue = (210 + th + Math.sin(time * 3) * 30) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8);
      g.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.3)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.8)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.5)`; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const sx = cx - R * 0.5 + Math.cos(0.3) * R * 0.5;
        const ex = cx + R * 0.5 + Math.cos(Math.PI - 0.3) * R * 0.5;
        const spread = (i + 1) * R * 0.25;
        ctx.beginPath(); ctx.moveTo(sx, cy - R * 0.35);
        ctx.quadraticCurveTo(cx, cy - spread * 1.2, ex, cy - R * 0.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, cy + R * 0.35);
        ctx.quadraticCurveTo(cx, cy + spread * 1.2, ex, cy + R * 0.35); ctx.stroke();
      }
      ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(cx - R * 0.42, cy - R * 0.35, 2.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4488ff'; ctx.beginPath(); ctx.arc(cx + R * 0.42, cy - R * 0.35, 2.5, 0, TAU); ctx.fill();

    } else if (p.type === 'merkaba') {
      // Two counter-rotating triangles, inner hexagon, vertex dots
      const hue = (45 + th + Math.sin(time * 2) * 15) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8);
      g.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.35)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.8, 0, TAU); ctx.fill();
      // Triangle CW
      ctx.strokeStyle = `hsla(${hue}, 85%, 65%, 0.8)`; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = (TAU / 3) * i + time * 0.35; const px = cx + Math.cos(a) * R; const py = cy + Math.sin(a) * R; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath(); ctx.stroke();
      // Triangle CCW
      ctx.strokeStyle = `hsla(${hue + 30}, 80%, 70%, 0.7)`; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = (TAU / 3) * i - time * 0.35 + Math.PI; const px = cx + Math.cos(a) * R; const py = cy + Math.sin(a) * R; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath(); ctx.stroke();
      // Inner hexagon
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.4)`; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (TAU / 6) * i + time * 0.2; const px = cx + Math.cos(a) * R * 0.5; const py = cy + Math.sin(a) * R * 0.5; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath(); ctx.stroke();
      // Vertex dots
      ctx.fillStyle = `hsla(${hue}, 90%, 80%, 0.8)`;
      for (let i = 0; i < 6; i++) { const a = (TAU / 6) * i + time * 0.2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, 1.8, 0, TAU); ctx.fill(); }
      // Radial spokes
      ctx.strokeStyle = `hsla(${hue}, 60%, 55%, 0.25)`; ctx.lineWidth = 0.5;
      for (let i = 0; i < 6; i++) { const a = (TAU / 6) * i; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85); ctx.stroke(); }

    } else if (p.type === 'lotus') {
      // 8 outer petals + 8 inner petals + center
      const hue = (320 + th + Math.sin(time * 2) * 20) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
      g.addColorStop(0, `hsla(${hue}, 70%, 75%, 0.3)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, TAU); ctx.fill();
      // Outer petals
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.7)`; ctx.lineWidth = 1.1;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i + Math.sin(time * 0.8) * 0.1;
        const tipX = cx + Math.cos(a) * R;
        const tipY = cy + Math.sin(a) * R;
        const cp1a = a - 0.4, cp2a = a + 0.4;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + Math.cos(cp1a) * R * 1.1, cy + Math.sin(cp1a) * R * 1.1, tipX, tipY);
        ctx.quadraticCurveTo(cx + Math.cos(cp2a) * R * 1.1, cy + Math.sin(cp2a) * R * 1.1, cx, cy);
        ctx.stroke();
      }
      // Inner petals (rotated 22.5°)
      ctx.strokeStyle = `hsla(${hue + 20}, 75%, 70%, 0.5)`; ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i + TAU / 16 + Math.sin(time * 1.2) * 0.08;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + Math.cos(a - 0.3) * R * 0.6, cy + Math.sin(a - 0.3) * R * 0.6, cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * R * 0.6, cy + Math.sin(a + 0.3) * R * 0.6, cx, cy);
        ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${hue}, 60%, 70%, 0.6)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, TAU); ctx.stroke();

    } else if (p.type === 'vesica') {
      // Two overlapping circles
      const hue = (265 + th + Math.sin(time * 1.5) * 15) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
      g.addColorStop(0, `hsla(${hue}, 70%, 65%, 0.3)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, TAU); ctx.fill();
      const offset = R * 0.4;
      ctx.strokeStyle = `hsla(${hue}, 75%, 65%, 0.6)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx - offset, cy, R * 0.7, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + offset, cy, R * 0.7, 0, TAU); ctx.stroke();
      // Vesica intersection fill
      ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.2)`;
      ctx.beginPath(); ctx.arc(cx - offset, cy, R * 0.7, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath(); ctx.arc(cx - offset * 2, cy, R * 0.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + offset * 2, cy, R * 0.7, 0, TAU); ctx.fill();
      ctx.restore();
      // Inner point
      ctx.fillStyle = `hsla(${hue}, 80%, 85%, 0.8)`;
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();

    } else if (p.type === 'seed') {
      // Seed of life: 7 circles
      const hue = (140 + th + Math.sin(time * 2.5) * 25) % 360;
      const breath = 1 + Math.sin(time * 2 + p.phase) * 0.06;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.3)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, TAU); ctx.fill();
      const cr = R * 0.45 * breath;
      ctx.strokeStyle = `hsla(${hue}, 75%, 60%, 0.7)`; ctx.lineWidth = 1;
      // Center
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
      // 6 around
      for (let i = 0; i < 6; i++) {
        const a = (TAU / 6) * i + time * 0.15;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr, cr, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = `hsla(${hue}, 80%, 80%, 0.8)`;
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();

    } else if (p.type === 'star') {
      // 5-pointed star + rays
      const hue = (50 + th + Math.sin(time * 3) * 15) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8);
      g.addColorStop(0, `hsla(${hue}, 80%, 85%, 0.4)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.8, 0, TAU); ctx.fill();
      // 5 primary rays
      ctx.strokeStyle = `hsla(${hue}, 85%, 75%, 0.7)`; ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const a = (TAU / 5) * i - Math.PI / 2 + time * 0.5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15); ctx.stroke();
      }
      // 5 secondary rays
      ctx.strokeStyle = `hsla(${hue}, 70%, 70%, 0.4)`; ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        const a = (TAU / 5) * i - Math.PI / 2 + TAU / 10 + time * 0.5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6); ctx.stroke();
      }
      // Star outline
      ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.8)`; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (TAU / 10) * i - Math.PI / 2 + time * 0.5;
        const sr = i % 2 === 0 ? R * 0.9 : R * 0.4;
        i === 0 ? ctx.moveTo(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr) : ctx.lineTo(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr);
      }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = `hsla(${hue}, 60%, 95%, 0.9)`;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // Scale before rotate so the squish/stretch is always in canvas (screen) space,
    // not in the player's own rotated space — keeps it readable at any rotation angle.
    ctx.scale(squishX, squishY);
    ctx.rotate(player.rotation);
    const pW = player.width * sphereSizeScale;

    if (player.powerUp) {
      ctx.save();
      const th = themeHueOffset();
      const ar = pW * 2.8;
      const ap = 1 + Math.sin(time * 4) * 0.06;
      const AR = ar * ap;
      ctx.lineCap = 'round';
      if (player.powerUp === 'aura') {
        const hue = (time * 35 + th) % 360;
        for (let ring = 0; ring < 3; ring++) {
          ctx.strokeStyle = `hsla(${(hue + ring * 120) % 360}, 85%, 65%, ${0.35 - ring * 0.08})`;
          ctx.lineWidth = 1.8 - ring * 0.4;
          ctx.beginPath(); ctx.arc(0, 0, AR * (0.7 + ring * 0.2), 0, TAU); ctx.stroke();
        }
      } else if (player.powerUp === 'nova') {
        ctx.strokeStyle = `hsla(${(190 + th) % 360}, 90%, 70%, 0.5)`; ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (TAU / 8) * i + time * 1.2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * AR, Math.sin(a) * AR); ctx.stroke();
        }
      } else if (player.powerUp === 'magnet') {
        ctx.strokeStyle = `hsla(${(210 + th) % 360}, 80%, 60%, 0.4)`; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const spread = (i + 1) * AR * 0.15;
          ctx.beginPath(); ctx.moveTo(-AR * 0.5, 0);
          ctx.quadraticCurveTo(0, -spread * 1.5, AR * 0.5, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-AR * 0.5, 0);
          ctx.quadraticCurveTo(0, spread * 1.5, AR * 0.5, 0); ctx.stroke();
        }
      } else if (player.powerUp === 'merkaba') {
        ctx.strokeStyle = `hsla(${(50 + th) % 360}, 80%, 65%, 0.45)`; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = (TAU / 3) * i + time * 0.25; i === 0 ? ctx.moveTo(Math.cos(a) * AR, Math.sin(a) * AR) : ctx.lineTo(Math.cos(a) * AR, Math.sin(a) * AR); }
        ctx.closePath(); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = (TAU / 3) * i - time * 0.25 + Math.PI; i === 0 ? ctx.moveTo(Math.cos(a) * AR, Math.sin(a) * AR) : ctx.lineTo(Math.cos(a) * AR, Math.sin(a) * AR); }
        ctx.closePath(); ctx.stroke();
      } else if (player.powerUp === 'lotus') {
        ctx.strokeStyle = `hsla(${(320 + th) % 360}, 75%, 65%, 0.4)`; ctx.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) {
          const a = (TAU / 8) * i + time * 0.5;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(a - 0.35) * AR * 1.05, Math.sin(a - 0.35) * AR * 1.05, Math.cos(a) * AR, Math.sin(a) * AR);
          ctx.quadraticCurveTo(Math.cos(a + 0.35) * AR * 1.05, Math.sin(a + 0.35) * AR * 1.05, 0, 0);
          ctx.stroke();
        }
      } else if (player.powerUp === 'vesica') {
        const off = AR * 0.3;
        ctx.strokeStyle = `hsla(${(265 + th) % 360}, 70%, 65%, 0.4)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(-off, 0, AR * 0.6, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(off, 0, AR * 0.6, 0, TAU); ctx.stroke();
      } else if (player.powerUp === 'seed') {
        const cr = AR * 0.35;
        ctx.strokeStyle = `hsla(${(140 + th) % 360}, 70%, 55%, 0.4)`; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = (TAU / 6) * i + time * 0.25; ctx.beginPath(); ctx.arc(Math.cos(a) * cr, Math.sin(a) * cr, cr, 0, TAU); ctx.stroke(); }
      } else if (player.powerUp === 'star') {
        ctx.strokeStyle = `hsla(${(50 + th) % 360}, 85%, 75%, 0.5)`; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (TAU / 10) * i - Math.PI / 2 + time * 0.35;
          const sr = i % 2 === 0 ? AR * 0.9 : AR * 0.4;
          i === 0 ? ctx.moveTo(Math.cos(a) * sr, Math.sin(a) * sr) : ctx.lineTo(Math.cos(a) * sr, Math.sin(a) * sr);
        }
        ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    }

    const g = ctx.createRadialGradient(0,0,0, 0,0, pW * 1.8);
    g.addColorStop(0, rgb(theme.secondary, 0.6));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0, pW * 1.8, 0, TAU); ctx.fill();

    ctx.strokeStyle = rgb(theme.primary, 1.0);
    ctx.lineWidth = 2.5;
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      const rot = j === 0 ? time * 2.5 : -time * 1.8;
      for (let i = 0; i < 3; i++) {
        const a = (TAU / 3) * i + rot;
        const px = Math.cos(a) * pW * 0.75;
        const py = Math.sin(a) * pW * 0.75;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0,0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPlatform(p, sy) {
    if (!p.alive) return;
    ctx.save();
    ctx.globalAlpha = p.opacity;
    let color = theme.primary;
    const pt = theme.platTypes || {};
    if (p.type === 'spring') color = pt.spring || [255, 220, 50];
    if (p.type === 'fragile') color = pt.fragile || [255, 80, 100];
    if (p.type === 'moving') color = pt.moving || [100, 255, 200];
    if (p.type === 'vanishing') color = pt.vanishing || [220, 120, 255];

    ctx.strokeStyle = rgb(color, 0.9);
    ctx.lineWidth = 2.5;
    if (p.type === 'fragile') ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.roundRect(p.x, sy, p.w, 10, 5); ctx.stroke();
    ctx.fillStyle = rgb(color, 0.2); ctx.fill();

    if (p.type === 'spring') {
      ctx.beginPath(); ctx.moveTo(p.x + p.w/2 - 12, sy); ctx.lineTo(p.x + p.w/2, sy - 10); ctx.lineTo(p.x + p.w/2 + 12, sy); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Update ──
  function update() {
    if (!playing) return;
    time += 0.016;

    const autoIdx = Math.min(themes.length-1, Math.floor(maxHeight / 10000));
    if (autoIdx !== lastAutoIdx) {
      lastAutoIdx = autoIdx;
      themeIndex = autoIdx;
      manualTheme = false;
    }
    const targetTheme = themes[themeIndex];
    for (let i = 0; i < 3; i++) {
      theme.primary[i] += (targetTheme.primary[i] - theme.primary[i]) * 0.05;
      theme.secondary[i] += (targetTheme.secondary[i] - theme.secondary[i]) * 0.05;
      theme.accent[i] += (targetTheme.accent[i] - theme.accent[i]) * 0.05;
      theme.bg[i] += (targetTheme.bg[i] - theme.bg[i]) * 0.05;
      theme.bgTop[i] += (targetTheme.bgTop[i] - theme.bgTop[i]) * 0.05;
      // Interpolate each platform type
      for (const type in theme.platTypes) {
        theme.platTypes[type][i] += (targetTheme.platTypes[type][i] - theme.platTypes[type][i]) * 0.05;
      }
    }

    let move = 0;
    if (keys['ArrowLeft'] || keys['a']) move = -1;
    if (keys['ArrowRight'] || keys['d']) move = 1;
    // Touch and tilt only override when actively engaged (not stale values)
    // Smooth tilt input with deadzone
    if (Math.abs(rawTilt) > TILT_DEADZONE) {
      tiltActive = true;
      const normalised = Math.max(-1, Math.min(1, (rawTilt - Math.sign(rawTilt) * TILT_DEADZONE) / (TILT_SENSITIVITY - TILT_DEADZONE)));
      smoothTilt += (normalised - smoothTilt) * 0.45;
    } else {
      tiltActive = false;
      smoothTilt *= 0.8; // quick decay to zero
    }
    if (touchDir !== 0) move = touchDir;
    else if (tiltActive && Math.abs(smoothTilt) > 0.05) move = smoothTilt;

    // Movement tuning for better control
    const accel = sphereSizeScale < 1 ? 0.5 : 0.68; 
    player.vx += move * accel;
    player.vx *= FRICTION;
    player.vy += player.powerUp === 'merkaba' ? GRAVITY * 0.5 : GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    player.rotation += player.vx * 0.08;

    if (player.x < 0) player.x = W;
    if (player.x > W) player.x = 0;

    const targetCam = player.y - H * 0.45;
    if (targetCam < cameraY) cameraY += (targetCam - cameraY) * 0.15;

    if (-player.y > maxHeight) {
      maxHeight = -player.y;
      score = Math.floor(maxHeight / 10) * (player.powerUp === 'star' ? 2 : 1);
    }

    if (player.powerUp) {
      player.powerTimer -= 0.016;
      if (player.powerTimer <= 0) player.powerUp = null;
      if (player.powerUp === 'nova' && time % 0.15 < 0.02) burst(player.x, player.y - cameraY, [255,80,100], 3, 'spark');
      if (player.powerUp === 'lotus') {
        for (let i = 0; i < platforms.length; i++) {
          const p = platforms[i];
          if (!p.alive) continue;
          const sy = p.y - cameraY;
          if (sy < -100 || sy > H + 100) continue;
          const dx = player.x - (p.x + p.w/2);
          if (Math.abs(dx) < 200) p.x += dx * 0.01;
        }
      }
      if (player.powerUp === 'star' && time % 0.2 < 0.02) burst(player.x, player.y - cameraY, [255, 240, 180], 2, 'spark');
    }

    for (let i = 0; i < powerUps.length; i++) {
      const p = powerUps[i];
      if (!p.alive) continue;
      if (Math.hypot(player.x - p.x, (player.y - cameraY) - (p.y - cameraY)) < 45) {
        p.alive = false;
        if (p.type === 'vesica') {
          player.y -= 500;
          addShockwave(player.x, player.y - cameraY, [140, 100, 255]);
          burst(player.x, player.y - cameraY, [180, 140, 255], 30, 'spark');
          player.powerUp = null; player.powerTimer = 0;
          playPowerUpSound(p.type);
          vibrate([15, 8, 15, 8, 40]);
          continue;
        }
        if (p.type === 'seed') {
          for (let s = 0; s < 3; s++) {
            platforms.push({ x: player.x - 50 + Math.random() * 100, y: player.y - 100 - s * 80, w: 80, h: 10, type: 'normal', alive: true, opacity: 1, vx: 0, fade: 0 });
          }
          burst(player.x, player.y - cameraY, [100, 255, 140], 20, 'spark');
          player.powerUp = null; player.powerTimer = 0;
          playPowerUpSound(p.type);
          vibrate([15, 8, 15, 8, 40]);
          continue;
        }
        player.powerUp = p.type;
        player.powerTimer = p.type === 'merkaba' ? 8 : p.type === 'lotus' ? 6 : p.type === 'star' ? 10 : 10;
        addShockwave(p.x, p.y - cameraY, [255,255,255]);
        playPowerUpSound(p.type);
        vibrate([15, 8, 15, 8, 40]);
        if (p.type === 'nova') {
          player.vy = SPRING_VEL * 1.6;
          trailLaunchColor = [255, 80, 100]; // nova = crimson trail
          triggerShake(6);
        }
      }
    }

    if (chillMode && player.y - cameraY > H - 40) {
      player.y = cameraY + H - 40; player.vy = JUMP_VEL; playJumpSound('normal');
      burst(player.x, H - 25, theme.accent, 20, 'spark');
    }

    if (player.vy > 0) {
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (!p.alive) continue;
        if (player.y + 12 > p.y && player.y < p.y + 10 &&
            player.x > p.x && player.x < p.x + p.w) {
          let jump = JUMP_VEL;
          if (p.type === 'spring' || player.powerUp === 'aura') {
            jump = player.powerUp === 'aura' ? SPRING_VEL * 1.3 : SPRING_VEL;
            addShockwave(player.x, p.y - cameraY, [255, 220, 50]);
            burst(player.x, p.y - cameraY, [255, 255, 150], 25, 'spark');
            vibrate([12, 5, 30]);
            triggerShake(p.type === 'spring' ? 5 : 4);
            trailLaunchColor = p.type === 'spring' ? [255, 220, 50] : [100, 255, 200];
          } else {
            trailLaunchColor = null; // normal bounce → use theme colour
          }
          if (p.type === 'fragile') { p.alive = false; burst(p.x + p.w/2, p.y - cameraY, [255, 80, 100], 15); vibrate(8); }
          if (p.type === 'vanishing') p.fade = 1;
          player.vy = jump; playJumpSound(p.type);
          if (p.type !== 'spring' && player.powerUp !== 'aura') vibrate(18);
          burst(player.x, p.y - cameraY, theme.secondary, 12);
          triggerSquish(); // landing squash — springs back via lerp
          break;
        }
      }
    }

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.type === 'moving') { p.x += p.vx; if (p.x < 0 || p.x + p.w > W) p.vx *= -1; }
      if (p.fade > 0) { p.fade += 0.05; p.opacity = Math.max(0, 1 - p.fade); if (p.opacity <= 0) p.alive = false; }
    }

    // Trail length stretches to 40 dots after a big jump (spring / nova / aura)
    const trailMax = trailLaunchColor !== null || Math.abs(player.vy) > 14 ? 40 : 25;
    trail.push({ x: player.x, y: player.y, a: 1.0, color: trailLaunchColor });
    if (trail.length > trailMax) trail.shift();
    for (let i = 0; i < trail.length; i++) trail[i].a *= 0.92;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy;
      if (p.type === 'spark') p.vy += 0.2;
      p.life -= p.decay; if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]; s.radius += 6; s.alpha *= 0.93; if (s.alpha < 0.01) shockwaves.splice(i, 1);
    }

    // Squish spring-back: lerp each axis toward 1.0 (~10 frames to settle)
    squishX += (1 - squishX) * 0.22;
    squishY += (1 - squishY) * 0.22;

    // Screen shake: new random offset every frame, magnitude decays ~8 frames
    if (shakeMag > 0.1) {
      shakeX = (Math.random() - 0.5) * shakeMag * 2;
      shakeY = (Math.random() - 0.5) * shakeMag * 2;
      shakeMag *= 0.82;
    } else { shakeMag = 0; shakeX = 0; shakeY = 0; }

    if (platforms.length > 0 && platforms[platforms.length - 1].y > cameraY - 1200) generatePlatforms(platforms[platforms.length - 1].y, cameraY - 3500);
    // Chord bloom timers — slower decay (0.45×) so expanding rings have time to unfurl
    if (chordBloomCooldown > 0) chordBloomCooldown -= 0.016;
    if (chordBloomFlash > 0) chordBloomFlash -= 0.016 * 0.45;

    // Altitude milestone chords — gentle musical reward every 500m
    const _scoreSteps = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7500];
    for (let _si = 0; _si < _scoreSteps.length; _si++) {
      if (score >= _scoreSteps[_si] && lastMilestone < _scoreSteps[_si]) {
        lastMilestone = _scoreSteps[_si];
        playMilestoneChord();
        chordBloomFlash = Math.max(chordBloomFlash, 0.55); // subtle visual bloom
        break;
      }
    }

    // Ambient pad note — atmospheric warmth every 12-18 seconds
    padNoteTimer -= 0.016;
    if (padNoteTimer <= 0) {
      playPadNote();
      padNoteTimer = 12 + Math.random() * 6;
    }

    // ── Philosophical milestone display ──
    // One milestone at a time; next fires only once the current has expired.
    if (!milestoneDisplay) {
      for (let _mi = 0; _mi < TJ_MILESTONES.length; _mi++) {
        if (!firedMilestones.has(_mi) && score >= TJ_MILESTONES[_mi].score) {
          firedMilestones.add(_mi);
          const _m = TJ_MILESTONES[_mi];
          milestoneDisplay = { score: _m.score, label: _m.label, text: _m.text, life: 6.5, maxLife: 6.5 };
          journeyLog.push({ score: _m.score, label: _m.label, text: _m.text });
          updateJourneyPanel();
          break;
        }
      }
    }
    if (milestoneDisplay) {
      milestoneDisplay.life -= 0.016;
      if (milestoneDisplay.life <= 0) milestoneDisplay = null;
    }

    // Ambient motes — gentle screen-space specks drifting upward
    for (let _mi = 0; _mi < ambientMotes.length; _mi++) {
      const m = ambientMotes[_mi];
      m.x += m.vx + Math.sin(time * m.speed + m.phase) * 0.06;
      m.y += m.vy;
      if (m.y < -5) m.y = H + 5;
      if (m.x < -5) m.x = W + 5;
      else if (m.x > W + 5) m.x = -5;
    }

    if (time % 5 < 0.02) saveGame();
    if (!chillMode && player.y - cameraY > H + 120) endGame();
  }

  function endGame() {
    playing = false; gameOver = true;
    if (score > highScore) { highScore = score; localStorage.setItem('trippyJumpHigh', highScore); }
    document.getElementById('final-score').textContent = score + 'm';
    document.getElementById('final-high').textContent = 'BEST: ' + highScore + 'm';
    document.getElementById('game-over').classList.add('is-active');
    playGameOverSound();
  }

  function render() {
    // Clear without any transform so we never leave uncleared slivers at screen edges
    ctx.clearRect(0, 0, W, H);

    // Apply screen shake as a translate on top of the DPR transform.
    // save/restore brackets ALL drawing so the offset is removed before the next frame.
    ctx.save();
    if (shakeMag > 0.1) ctx.translate(shakeX, shakeY);

    drawBackground();

    // Ambient motes — gentle screen-space specks for atmospheric warmth
    if (ambientMotes.length > 0) {
      ctx.save();
      for (let i = 0; i < ambientMotes.length; i++) {
        const m = ambientMotes[i];
        const alpha = m.baseAlpha * (0.5 + 0.5 * Math.sin(time * m.speed + m.phase));
        ctx.fillStyle = rgb(theme.accent, alpha);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    if (playing || gameOver) {
      const camY = cameraY;

      for (let i = 0; i < powerUps.length; i++) drawPowerUp(powerUps[i]);

      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        const sy = p.y - camY;
        if (sy > -100 && sy < H + 100) drawPlatform(p, sy);
      }

      // Trail — each dot stores the launch colour set at the moment of the jump
      ctx.save();
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        const tColor = t.color || theme.primary;
        ctx.fillStyle = rgb(tColor, t.a * 0.4);
        ctx.beginPath(); ctx.arc(t.x, t.y - camY, 6 * t.a, 0, TAU); ctx.fill();
      }
      ctx.restore();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.fillStyle = rgb(p.color, p.life);
        ctx.beginPath(); 
        ctx.arc(p.x, p.y - camY, p.type === 'spark' ? p.size*(0.5+p.life) : p.size, 0, TAU); 
        ctx.fill();
      }

      for (let i = 0; i < shockwaves.length; i++) {
        const s = shockwaves[i];
        ctx.strokeStyle = rgb(s.color, s.alpha);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, TAU); ctx.stroke();
      }
      
      drawPlayer(player.x, player.y - camY);

      // Altitude (meters) — positioned below the control buttons to avoid visual overlap
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `200 ${3.0 * sphereSizeScale}rem sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(score + 'm', W/2, 130);

      // Milestone quote — gentle fade-in/out text overlay
      if (milestoneDisplay) {
        const { text, label, life, maxLife } = milestoneDisplay;
        const elapsed = maxLife - life;
        const fadeIn = Math.min(elapsed / 0.8, 1);
        const fadeOut = Math.min(life / 1.5, 1);
        const alpha = fadeIn * fadeOut * 0.75;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        // Label (small, accent)
        ctx.fillStyle = rgb(theme.accent, 1);
        ctx.font = `${Math.round(13 * sphereSizeScale)}px sans-serif`;
        ctx.fillText(label, W/2, H * 0.78 - 20);
        // Quote (larger, white)
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `${Math.round(16 * sphereSizeScale)}px sans-serif`;
        // Word-wrap if needed (max ~35 chars per line)
        const words = text.split(' ');
        let line = '', ly = H * 0.78;
        for (const w of words) {
          const test = line + w + ' ';
          if (test.length > 38 && line) {
            ctx.fillText(line.trim(), W/2, ly);
            line = w + ' ';
            ly += 22 * sphereSizeScale;
          } else {
            line = test;
          }
        }
        if (line) ctx.fillText(line.trim(), W/2, ly);
        ctx.restore();
      }

      // Touch zone hints: shown briefly at game start on touch devices, then fade out
      if (isTouch && time < 8) {
        const hintAlpha = time < 5 ? 0.22 : (1 - (time - 5) / 3) * 0.22;
        ctx.save();
        ctx.globalAlpha = hintAlpha;
        ctx.fillStyle = rgb(theme.accent, 1);
        ctx.font = `${Math.round(48 * sphereSizeScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('◀', W * 0.12, H - 80);
        ctx.fillText('▶', W * 0.88, H - 80);
        ctx.restore();
      }
    }

    ctx.restore(); // remove shake offset

    // Chord bloom flash — expanding sacred-geometry polygon rings (inspired by Falling Emy).
    // 5 rings, one per pentatonic pitch class, triangle → heptagon, hue-shifted.
    if (chordBloomFlash > 0) {
      const cf = Math.min(chordBloomFlash, 1);
      const expand = 1 - cf;                         // 0 → 1 as flash fades
      const env = cf * Math.sin(expand * Math.PI + 0.01); // bell curve

      // Soft radial background glow
      if (cf > 0.02) {
        ctx.save();
        ctx.globalAlpha = cf * cf * 0.07;
        const bloom = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, H * 0.7);
        bloom.addColorStop(0, rgb(theme.accent, 1));
        bloom.addColorStop(0.5, rgb(theme.primary, 0.4));
        bloom.addColorStop(1, 'transparent');
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // Expanding polygon rings — one per pentatonic pitch class (3–7 sides)
      const bx = W / 2, by = H / 2;
      const pentatonicHues = [0, 72, 144, 216, 288]; // evenly spaced around hue wheel
      ctx.save();
      for (let ri = 0; ri < 5; ri++) {
        const sides = ri + 3;
        const radius = expand * Math.min(W, H) * (0.17 + ri * 0.1);
        if (radius <= 0) continue;
        const hue = (pentatonicHues[ri] + time * 22) % 360;
        const alpha = env * (0.17 - ri * 0.022);
        if (alpha < 0.004) continue;
        ctx.strokeStyle = `hsla(${hue}, 88%, 72%, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2.2 - ri * 0.28;
        ctx.beginPath();
        for (let j = 0; j <= sides; j++) {
          const a = (TAU / sides) * j + time * 0.28 + ri * 0.38;
          j === 0
            ? ctx.moveTo(bx + Math.cos(a) * radius, by + Math.sin(a) * radius)
            : ctx.lineTo(bx + Math.cos(a) * radius, by + Math.sin(a) * radius);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    requestAnimationFrame(render);
    update();
  }

  // ── Listeners ──
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    // Prevent page scroll from arrow keys / space during gameplay
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key) && playing) {
      e.preventDefault();
    }
    if (e.key === ' ' && gameOver) {
      e.preventDefault();
      document.getElementById('game-over').classList.remove('is-active');
      initGame(false);
    }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; delete keys[e.key]; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); touchDir = e.touches[0].clientX < W/2 ? -1 : 1; initAudio(); initAccel(); }, {passive:false});
  canvas.addEventListener('touchend', () => touchDir = 0);
  canvas.addEventListener('touchcancel', () => touchDir = 0);
  canvas.addEventListener('mousedown', e => { if (playing) touchDir = e.clientX < W/2 ? -1 : 1; initAudio(); initAccel(); });
  canvas.addEventListener('mouseup', () => touchDir = 0);

  document.getElementById('start-btn').onclick = (e) => { e.preventDefault(); document.getElementById('start-screen').classList.add('hidden'); initGame(false); };
  document.getElementById('play-again').onclick = (e) => { e.preventDefault(); document.getElementById('game-over').classList.remove('is-active'); initGame(false); };
  document.getElementById('theme-btn').onclick = () => { 
    manualTheme = true;
    themeIndex = (themeIndex + 1) % themes.length; 
  };
  document.getElementById('chill-btn').onclick = function() { chillMode = !chillMode; this.classList.toggle('is-on', chillMode); };
  document.getElementById('mute-btn').onclick = function() {
    muted = !muted;
    this.textContent = muted ? '🔇' : '🔊';
    this.classList.toggle('is-on', !muted);
    localStorage.setItem('trippy-muted', muted ? '1' : '0');
    if (!muted) {
      initAudio(); // create context if needed (valid user-gesture here)
      if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    }
  };
  document.getElementById('info-btn').onclick = () => document.getElementById('info-panel').classList.toggle('is-open');
  document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.remove('is-open');

  function checkResume() {
    const saved = loadGame();
    if (saved && saved.score > 200) {
      const startBtn = document.getElementById('start-btn');
      startBtn.textContent = 'RESUME JOURNEY';
      startBtn.onclick = (e) => { e.preventDefault(); document.getElementById('start-screen').classList.add('hidden'); initGame(true); };
      const sub = document.querySelector('#start-screen .sub');
      if (sub) sub.textContent = `last height: ${saved.score}m`;
      const fresh = document.createElement('p');
      fresh.style.cssText = 'margin-top:1rem;font-size:0.7rem;color:rgba(140,100,255,0.6);cursor:pointer;text-decoration:underline';
      fresh.textContent = 'start fresh';
      fresh.onclick = (e) => { e.stopPropagation(); localStorage.removeItem(SAVE_KEY); location.reload(); };
      document.getElementById('start-screen').appendChild(fresh);
    }
  }

  checkResume();

  // Apply i18n to static info-panel elements (title + empty log placeholder)
  {
    const _c = window.TJ_CONTENT?.[window.TJ_LANG];
    if (_c) {
      const _jt = document.getElementById('journey-title');
      if (_jt && _c.ui?.journeyTitle) _jt.textContent = _c.ui.journeyTitle;
      const _je = document.getElementById('journey-empty');
      if (_je && _c.ui?.journeyEmpty) _je.textContent = _c.ui.journeyEmpty;
    }
  }

  // Restore AudioContext when the tab becomes visible again (mobile browsers suspend it on tab-switch)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioCtx && !muted && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  });

  // Sync mute button visual with restored localStorage preference
  { const mb = document.getElementById('mute-btn');
    mb.textContent = muted ? '🔇' : '🔊';
    mb.classList.toggle('is-on', !muted); }

  // Tailor the start-screen hint to the detected input method
  const startHintEl = document.getElementById('start-hint');
  if (startHintEl) {
    startHintEl.textContent = isTouch
      ? 'tap left · right to move  ·  tilt to steer'
      : 'arrow keys or a · d to move';
  }

  requestAnimationFrame(render);
})();
