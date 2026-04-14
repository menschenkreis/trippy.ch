// ── Ragdoll Void - Physics + Sacred Geometry ─────────────────────────────────
//
// File map:
//   § 1. Utilities / CONFIG / Persistence
//   § 2. Canvas + resize + context-loss recovery
//   § 3. Theme
//   § 4. Physics constants, game state, score, power-ups, life chapters
//   § 5. Accelerometer
//   § 6. Particle / Constraint / Sphere / Ragdoll classes
//   § 7. Audio (initAudio, playImpactSound, playMilestoneChord)
//   § 8. Collision (collideParticleSphere, collideRagdollSphere)
//   § 9. Impact particles (spawn, update, draw) + score elements
//   §10. Sphere spawning, input, buttons
//   §11. Sacred geometry + background + sphere/ragdoll draw
//   §12. Camera + recycling
//   §13. Main loop (frame)
//   §14. Resume bridge + intro gate + sound-hint
// ─────────────────────────────────────────────────────────────────────────────
(function(){
'use strict';
const canvas = document.getElementById('c');
// `ctx` is mutable so the sacred-geometry offscreen cache can swap in its
// own context during refresh without propagating a ctx argument through
// every draw helper. renderSgLayer saves the previous binding and restores
// it immediately after.
let ctx = canvas.getContext('2d');
const PI = Math.PI, TAU = PI*2;

// ── § 1. Tiny utilities ─────────────────────────────────────────────────
const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
const lerp  = (a, b, t) => a + (b - a) * t;
// Parse '#rrggbb' → [r,g,b] (0-255)
function hexToRgb(hex){
  const n = parseInt(hex.replace('#',''), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}

// ── § 1. Tuning / magic-number consolidation ────────────────────────────
// Only values used in more than one place OR clear tuning knobs are hoisted.
// Numerical values are UNCHANGED from their former inline occurrences.
const CONFIG = {
  CAMERA_FOLLOW: 0.08,
  CAMERA_TARGET_RATIO: 0.35,
  SHAPE_SPACING_MIN: 120,
  SHAPE_SPACING_MAX: 800,
  SHAPE_RAMP_START_M: 25,
  SHAPE_RAMP_END_M: 100,
  SHAPE_START_Y: 2500,             // first shape allowed at 25m
  CHALLENGE_SPACING_WORLD: 10000,  // one challenge every 100m
  DRAG_LERP: 0.15,
  SLOWMO_SCALE: 0.05,
  SOUND_HINT_FADE_M: 50,
  INTRO_RESUME_MIN_M: 5,
  BOUNCE: 0.65,
  FRICTION: 0.05,
  MAX_CONCURRENT_OSC: 40, // cap concurrent Web Audio oscillators to prevent
                          // clipping/crackle on dense multi-ragdoll pile-ups
  // Braided ragdolls
  BRAID_RANGE: 45,        // hand-hand distance (px) to form a braid
  BRAID_LIFE: 4.0,        // seconds a braid lasts before fading
  BRAID_STIFFNESS: 0.22,  // gentler than structural constraints (=1)
  BRAID_BREAK_MULT: 3.5,  // break if stretched past dist * this
  // Perfect chord bloom
  CHORD_WINDOW_S: 4.0,    // rolling window for collecting pitch classes
  CHORD_COOLDOWN_S: 12.0, // minimum seconds between blooms
  // Breath rings
  BREATH_SPAWN_START_M: 40,
  BREATH_SPACING_WORLD: 2200,
  BREATH_BASE_R: 70,
  BREATH_SLOWMO_S: 1.0,   // slow-mo duration after passing through at peak
};

// ── § 1. Cookie Save/Resume ─────────────────────────────────────────────
const SAVE_KEY = 'falling-emy-save';
const SAVE_INTERVAL = 3000; // auto-save every 3s
let lastSaveTime = 0;
let hasSaveData = false;
let resumeCallback = null; // set by modal

function saveProgress(){
  try {
    const data = {
      cameraY, score, fallSpeed, time,
      nextChallengeY, nextShapeY, themeIdx,
      journeyLog,
      isMuted,
      ragdollName: ragdolls[0]?.name || 'emy',
      depthMeters: Math.max(0, cameraY / 100),
      savedAt: Date.now(),
    };
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
    document.cookie = `${SAVE_KEY}=${encodeURIComponent(json)};path=/;max-age=${365*24*3600};SameSite=Lax`;
  } catch(e){}
}

function loadProgress(){
  try {
    // Try localStorage first (more reliable)
    const local = localStorage.getItem(SAVE_KEY);
    if(local) return JSON.parse(local);
    // Fallback to cookie
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SAVE_KEY}=([^;]*)`));
    if(!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  } catch(e){ return null; }
}

function clearSave(){
  localStorage.removeItem(SAVE_KEY);
  document.cookie = `${SAVE_KEY}=;path=/;max-age=0`;
  hasSaveData = false;
}

function formatDepth(m){
  if(m >= 1000) return (m/1000).toFixed(1) + ' km';
  return m.toFixed(0) + ' m';
}

function formatTimeAgo(ts){
  const s = Math.floor((Date.now() - ts) / 1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60) + ' min ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function autoSave(now){
  const depthM = Math.max(0, cameraY / 100);
  // Auto-save every 50m of progress OR every 10s if we've moved at all
  const lastSavedDepth = loadProgress()?.depthMeters || 0;
  if(depthM >= lastSavedDepth + 50 || (now - lastSaveTime > 10000 && depthM > lastSavedDepth + 1)){
    saveProgress();
    lastSaveTime = now;
    hasSaveData = true;
  }
}

// ── Update Journey Panel (IIFE scope - called from restoreFromSave & frame) ──
const _journeyLogEl = document.getElementById('journey-log');
function updateJourneyPanel(){
  if(!_journeyLogEl || journeyLog.length === 0) return;
  let html = '';
  for(let i = journeyLog.length - 1; i >= 0; i--){
    const e = journeyLog[i];
    const isAge = e.label.startsWith('year ');
    const isBirth = e.label === 'birth';
    const size = 18, cx = 9, cy = 9;
    let svg;
    if(isBirth){
      svg = `<svg width="${size}" height="${size}" viewBox="0 0 18 18"><circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="currentColor" stroke-width="1" opacity="0.7"/><circle cx="${cx}" cy="${cy}" r="2" fill="currentColor" opacity="0.8"/></svg>`;
    } else if(isAge){
      // concentric rings (time/life)
      svg = `<svg width="${size}" height="${size}" viewBox="0 0 18 18"><circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/><circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.25"/></svg>`;
    } else {
      // seed of life (sacred geometry)
      svg = `<svg width="${size}" height="${size}" viewBox="0 0 18 18"><circle cx="${cx}" cy="${cx}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.5"/><circle cx="${cx}" cy="${cx-3}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx+2.6}" cy="${cx-1.5}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx+2.6}" cy="${cx+1.5}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx}" cy="${cx+3}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx-2.6}" cy="${cx+1.5}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><circle cx="${cx-2.6}" cy="${cx-1.5}" r="3" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/></svg>`;
    }
    html += `<div class="journey-entry"><div class="journey-icon">${svg}</div><div class="journey-entry-text"><strong>${e.label}</strong> - ${e.text}</div></div>`;
  }
  _journeyLogEl.innerHTML = html;
}

function restoreFromSave(data){
  cameraY = data.cameraY || 0;
  score = data.score || 0;
  displayScore = data.score || 0;
  fallSpeed = data.fallSpeed || 0;
  time = data.time || 0;
  // Ensure the next challenge/shape is ahead of the restored camera even if
  // save data is stale (otherwise spawns would be instantly culled).
  nextChallengeY = Math.max(data.nextChallengeY || (cameraY + CONFIG.CHALLENGE_SPACING_WORLD), cameraY + 1000);
  nextShapeY = Math.max(data.nextShapeY || (cameraY + 2000), cameraY + 200);
  themeIdx = data.themeIdx || 0;
  // Snap live values to saved theme instantly (no cross-fade on resume)
  const _rt = themes[themeIdx];
  const _rtBg = hexToRgb(_rt.bg);
  for(let _i=0;_i<3;_i++){
    _liveAccent[_i]=_tgtAccent[_i]=_rt.accent[_i];
    _liveAccent2[_i]=_tgtAccent2[_i]=_rt.accent2[_i];
    _liveBgRgb[_i]=_tgtBgRgb[_i]=_rtBg[_i];
  }
  _bgGradThemeV = -1; // force gradient rebuild

  // Restore journey log/milestones
  journeyLog = data.journeyLog || [];
  updateJourneyPanel();

  // Restore audio toggle state (default to muted for old saves without the field)
  isMuted = data.isMuted ?? true;
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('is-on', !isMuted);
  muteBtn.style.animation = 'none';
  if(soundHintEl) soundHintEl.style.display = 'none';
  if(!isMuted) initAudio(); // resume is triggered by a user gesture so autoplay is allowed

  // Reset transient state
  comboCount = 0; lastHitTime = 0;
  scorePopups = []; scoreFlies = [];
  harmonyIndex = 0; harmonicCooldown = 0;
  activeEffects = { wave: 0, trail: 0, pulse: 0, magnet: 0, aura: 0, nova: 0 };
  waveRings = [];
  portal = null;
  chapterDisplay = null; chapterSlowMo = 0;
  particles = []; shockwaves = []; particleCount = 0;
  firedChapters = new Set();
  // Reset gameplay-additions state as well
  braids = [];
  breathRings = []; nextBreathY = Math.max(cameraY + 1500, 4000);
  breathSlowMo = 0;
  for(let i = 0; i < harmonyNotes.length; i++) harmonyNotes[i] = HARMONY_UNSET;
  chordBloomCooldown = 0; chordBloomFlash = 0;

  // Re-calculate which chapters have already fired
  const depthMeters = cameraY / 100;
  for(let ci = 0; ci < lifeChapters.length; ci++){
    const ch = lifeChapters[ci];
    const triggerDepth = ch.depth !== undefined ? ch.depth : ch.age * 1000;
    if(depthMeters >= triggerDepth) firedChapters.add(ci);
  }

  // Re-create ragdoll at saved depth, restoring the saved name
  const _savedName = data.ragdollName || 'emy';
  ragdolls = [new Ragdoll(W/2, cameraY, _savedName)];
  const _nameInput = document.getElementById('emy-name');
  if(_nameInput) _nameInput.value = _savedName;
  spheres = [];
  // Pre-spawn spheres in the visible range around saved position
  const aheadY = cameraY + H;
  const behindY = cameraY - H;
  for(let y = behindY; y < aheadY; y += 400 + Math.random()*400){
    if(y > 2500) spawnSphereAtDepth(y);
  }
  lastSaveTime = time;
}

// Expose to global scope for resume modal
window._fe = { loadProgress, restoreFromSave, clearSave, formatDepth, formatTimeAgo,
  setName: (n) => {
    const nm = (n || '').trim() || 'emy';
    if(ragdolls[0]) ragdolls[0].name = nm;
    const ni = document.getElementById('emy-name');
    if(ni) ni.value = nm;
    saveProgress();
  },
  // Set muted state programmatically (used by the sound-preference modal).
  // Safe to call before muteBtn/soundHintEl are declared — this is only
  // ever invoked from a user-action callback, by which time the full IIFE
  // has already run and all const bindings are live.
  setMuted: (muted) => {
    isMuted = muted;
    const mb = document.getElementById('mute-btn');
    const sh = document.getElementById('sound-hint');
    if(mb) { mb.textContent = isMuted ? '🔇' : '🔊'; mb.classList.toggle('is-on', !isMuted); mb.style.animation = 'none'; }
    if(sh) sh.style.display = 'none'; // hide "tap for sound" hint — user already chose
    if(!isMuted) initAudio();
  }
};

// ── Resize ───────────────────────────────────────────────────────────────
let W, H, dpr;
// Cache-invalidation counters: bumped when viewport size or theme changes so
// offscreen render caches know to redraw.
let _viewportVersion = 0;
let _themeVersion = 0;
// Scale factor applied to all sphere radii. Coarse-pointer (touch) devices
// keep scale = 1.0; fine-pointer (mouse/desktop) devices scale up with width
// so shapes feel appropriately sized on large screens.
let sphereSizeScale = 1.0;
function resize(){
  dpr = Math.min(devicePixelRatio, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  _viewportVersion++;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  sphereSizeScale = isTouch ? 1.0 : clamp(W / 700, 1.3, 1.65);
}
window.addEventListener('resize', resize); resize();

// ── Canvas context loss recovery (mobile tab switch, signal loss) ──
canvas.addEventListener('webglcontextlost', e => e.preventDefault());
canvas.addEventListener('contextlost', e => { e.preventDefault(); console.warn('[falling-emy] canvas context lost, waiting for restore...'); });
canvas.addEventListener('contextrestored', () => { console.log('[falling-emy] canvas context restored'); resize(); });

// Resume audio context on tab visibility change (mobile browsers suspend it)
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended'){
    audioCtx.resume();
  }
});

// ── Theme ────────────────────────────────────────────────────────────────
const themes = [
  { accent:[180,100,255], accent2:[255,80,200], bg:'#08060f', name:'violet' },
  { accent:[0,220,255],   accent2:[255,180,60],  bg:'#060d12', name:'aqua' },
  { accent:[255,120,40],  accent2:[255,50,120],  bg:'#120806', name:'ember' },
  { accent:[40,255,140],  accent2:[180,80,255],  bg:'#061208', name:'jade' },
  { accent:[255,60,80],   accent2:[255,220,50],  bg:'#0f0608', name:'crimson' },
  { accent:[255,200,255], accent2:[100,180,255], bg:'#0a0810', name:'frost' },
  { accent:[0,255,180],   accent2:[200,80,255],  bg:'#060f0d', name:'aurora' },
];
let themeIdx = 0;

// ── Smooth theme interpolation ───────────────────────────────────────────
// All drawing uses _liveAccent / _liveAccent2 / _liveBgRgb which lerp toward
// _tgtAccent / _tgtAccent2 / _tgtBgRgb each frame.  `theme` is a persistent
// mutable object whose .accent / .accent2 properties ARE the live arrays, so
// all existing draw code picks up transitions automatically.
const THEME_LERP = 0.022; // ~2 s at 60 fps (1-(1-t)^120 ≈ 0.93)
const _liveAccent  = [...themes[0].accent];
const _liveAccent2 = [...themes[0].accent2];
const _liveBgRgb   = hexToRgb(themes[0].bg);
const _tgtAccent   = [...themes[0].accent];
const _tgtAccent2  = [...themes[0].accent2];
const _tgtBgRgb    = hexToRgb(themes[0].bg);

// theme is a persistent proxy object — its .accent/.accent2 are the live
// arrays so portal writes go through the same lerp path via _tgtAccent.
const theme = {
  accent : _liveAccent,
  accent2: _liveAccent2,
  get bg(){ return `rgb(${_liveBgRgb[0]|0},${_liveBgRgb[1]|0},${_liveBgRgb[2]|0})`; },
  get name(){ return themes[themeIdx].name; },
};

function setTheme(i){
  themeIdx = i % themes.length;
  const t = themes[themeIdx];
  _tgtAccent[0] = t.accent[0]; _tgtAccent[1] = t.accent[1]; _tgtAccent[2] = t.accent[2];
  _tgtAccent2[0] = t.accent2[0]; _tgtAccent2[1] = t.accent2[1]; _tgtAccent2[2] = t.accent2[2];
  const bg = hexToRgb(t.bg);
  _tgtBgRgb[0] = bg[0]; _tgtBgRgb[1] = bg[1]; _tgtBgRgb[2] = bg[2];
  _themeVersion++;
  // Shift all ragdoll colors toward new theme
  const newHue = themeIdx * (360 / themes.length);
  for(const r of ragdolls){
    r.hue = (newHue + Math.random() * 40 - 20) % 360;
    r.accent = hslToRgbArr(r.hue, 0.95, 0.7);
    r.accent2 = hslToRgbArr((r.hue + 40) % 360, 1.0, 0.8);
  }
  // Shift sphere hues toward new theme
  for(const s of spheres){
    s.hue = (newHue + Math.random() * 80 - 40) % 360;
  }
}

function updateLiveTheme(){
  let changed = false;
  for(let i = 0; i < 3; i++){
    const da = _tgtAccent[i]  - _liveAccent[i];
    const db = _tgtAccent2[i] - _liveAccent2[i];
    const dc = _tgtBgRgb[i]   - _liveBgRgb[i];
    if(Math.abs(da) > 0.05){ _liveAccent[i]  += da * THEME_LERP; changed = true; }
    else { _liveAccent[i]  = _tgtAccent[i]; }
    if(Math.abs(db) > 0.05){ _liveAccent2[i] += db * THEME_LERP; changed = true; }
    else { _liveAccent2[i] = _tgtAccent2[i]; }
    if(Math.abs(dc) > 0.05){ _liveBgRgb[i]   += dc * THEME_LERP; changed = true; }
    else { _liveBgRgb[i]   = _tgtBgRgb[i]; }
  }
  // Invalidate gradient cache whenever live values are moving
  if(changed) _bgGradThemeV = -1;
}

// ── Physics constants ────────────────────────────────────────────────────
const GRAVITY = 360;
const DAMPING = 0.998;
const ITERATIONS = 8;
const SUBSTEPS = 2;
// Maximum downward velocity (px/substep). Natural terminal under gravity+damping
// is ~11.5 px/substep; this cap prevents post-collision spikes from sending the
// ragdoll faster than the camera can track. Upward velocity is left uncapped so
// setback bounces remain dramatic.
const TERMINAL_VY = 22;

let tiltEnabled = false;
let gravityX = 0, gravityY = GRAVITY;
let isDragging = false;

// ── Portal System ──
let portal = null;

// ── Score System ──
let score = 0;
let displayScore = 0; // smoothly animated
let scorePopups = []; // {x, y, text, life, vy, hue}
let scoreFlies = []; // sparks that fly to the counter
let comboCount = 0;
let comboTimer = 0;
const COMBO_WINDOW = 1.5; // seconds to chain combos
let lastHitTime = 0;

let isSlowed = false;
let timeScale = 1.0;
let targetTimeScale = 1.0;
let dragRagdoll = null;
let dragParticle = null;

// ── Collision Harmonics ──
let harmonyIndex = 0;
let harmonicCooldown = 0; // dynamic cooldown - increases when stuck
const pentatonicScale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // C D E G A c d e g a

// ── Power-Up Effects ──
let activeEffects = { wave: 0, trail: 0, pulse: 0, magnet: 0, aura: 0, nova: 0 };
let waveRings = []; // {x, y, radius, life}

// ── Braided Ragdolls ─────────────────────────────────────────────────────
// Soft, temporary constraints between nearest hands of two different ragdolls.
// Form when hands drift within BRAID_RANGE, fade over BRAID_LIFE, break if
// stretched past dist * BRAID_BREAK_MULT.
let braids = []; // {pa, pb, dist, life, maxLife}

// ── Breath Rings ─────────────────────────────────────────────────────────
// Vesica-piscis trigger zones. Drift through world space, pulse slowly; if
// the falling head passes through at the pulse peak, grants a brief slow-mo
// and a resolution chord.
let breathRings = []; // {x, y, phase, baseR, triggered, triggerFade}
let nextBreathY = 4000; // first ring around 40 m
let breathSlowMo = 0;   // seconds of active breath-induced slow-mo

// ── Perfect Chord Bloom ──────────────────────────────────────────────────
// Tracks when each of the five pentatonic pitch classes was last played.
// When all five fall inside CHORD_WINDOW_S, fire a bloom (chord + visuals).
// Init sentinel is -Infinity so unset slots always fail the window check
// (avoids a spurious bloom during the first seconds of audio).
const HARMONY_UNSET = -1e9;
const harmonyNotes = [HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET, HARMONY_UNSET];
let chordBloomCooldown = 0;            // s until next bloom can fire
let chordBloomFlash = 0;               // visual flash timer (screen overlay)

// ── Life Chapters (includes milestones) ──
let journeyLog = []; // {label, text}
let chapterDisplay = null; // {text, life, phase}
let chapterSlowMo = 0;
let firedChapters = new Set();

const lifeChapters = [
  { depth: 5, label: 'birth', text: 'no past. so much future.' },
  { depth: 100, label: 'flow', text: 'life is not a problem to be solved, but a reality to be experienced.' },
  { depth: 200, label: 'resistance', text: 'the obstacle is the path. every collision is an awakening.' },
  { depth: 300, label: 'drift', text: 'sometimes the void carries you. sometimes you carry the void.' },
  { depth: 400, label: 'pattern', text: 'the shapes repeat, but you never see them the same way twice.' },
  { depth: 500, label: 'descent', text: 'to fall is to surrender. to surrender is to find the rhythm.' },
  { depth: 600, label: 'momentum', text: 'you cannot steer what you do not accept.' },
  { depth: 700, label: 'gravity', text: 'the pull is not the enemy. it is the only honest direction.' },
  { depth: 800, label: 'echo', text: 'every sound you make returns - fainter, but never gone.' },
  { depth: 900, label: 'trust', text: 'the void has caught you every time you have fallen so far.' },
  { depth: 1000, label: 'year 1', text: 'a thousand meters. the world is finally becoming real.' },
  { depth: 1100, label: 'curiosity', text: 'we do not travel to find ourselves, but to find how much there is to lose.' },
  { depth: 1200, label: 'stillness', text: 'the faster you fall, the more still the center must become.' },
  { depth: 1300, label: 'light', text: 'even in the void, you are the thing that glows.' },
  { depth: 1400, label: 'letting go', text: 'you stop choosing the fall. the fall was always choosing you.' },
  { depth: 1500, label: 'breath', text: 'the air changes at depth. so do you.' },
  { depth: 1600, label: 'time', text: 'time does not pass. you pass through it.' },
  { depth: 1700, label: 'edge', text: 'standing at the border between who you were and who you are becoming.' },
  { depth: 1800, label: 'fragility', text: 'what breaks reveals what was holding it together.' },
  { depth: 1900, label: 'resilience', text: 'the fracture is where the light enters. and the light was always entering.' },
  { depth: 2000, label: 'year 2', text: 'two kilometers of descent. you are not the same shape that began.' },
  { depth: 2100, label: 'horizon', text: 'there is no horizon here. only the next moment, and the next.' },
  { depth: 2200, label: 'faith', text: 'not belief. just the quiet decision to keep falling.' },
  { depth: 2300, label: 'depth', text: 'depth is merely height seen from a different point of view.' },
  { depth: 2400, label: 'silence', text: 'the void does not answer. it only reflects the light you bring.' },
  { depth: 2500, label: 'presence', text: 'you are not falling through the void. you are the void experiencing itself.' },
  { depth: 2600, label: 'interconnected', text: 'there are no separate objects, only different frequencies of the same descent.' },
  { depth: 2700, label: 'acceptance', text: 'not everything has a reason. some things just are.' },
  { depth: 2800, label: 'gratitude', text: 'for the fall. for the shapes. for the one who is falling.' },
  { depth: 2900, label: 'wonder', text: 'after all this distance, everything is still strange and new.' },
  { depth: 3000, label: 'year 3', text: 'three kilometers. what was once terrifying is now just the way things are.' },
  { age: 5, label: 'year 5', text: 'the void gets deeper, but so do you.' },
  { age: 9, label: 'year 9', text: 'almost double digits. time starts to feel real.' },
  { age: 12, label: 'year 12', text: 'a turning point. everything begins to change.' },
  { age: 13, label: 'year 13', text: 'the void gets deeper.' },
  { age: 15, label: 'year 15', text: 'first love. first heartbreak. the obstacles get sharper.' },
  { age: 18, label: 'year 18', text: 'adulthood arrives. nobody feels ready.' },
  { age: 25, label: 'year 25', text: 'a quarter century. who am i now?' },
  { age: 30, label: 'year 30', text: 'the fall feels different from here.' },
  { age: 40, label: 'year 40', text: 'not a crisis - a clearing.' },
  { age: 50, label: 'year 50', text: 'half a century. grace finds its rhythm.' },
  { age: 60, label: 'year 60', text: 'wisdom is not knowing more. it is carrying less.' },
  { age: 70, label: 'year 70', text: 'the obstacles soften. the geometry becomes beautiful.' },
  { age: 80, label: 'year 80', text: 'a long fall. a good fall. still falling.' },
  { age: 90, label: 'year 90', text: 'the void and you are old friends.' },
  { age: 100, label: 'year 100', text: 'a hundred years of descent. what a journey.' },
];

// ── Accelerometer ────────────────────────────────────────────────────────
let accelInited = false;
function initAccel() {
  if (accelInited) return;

  const setupEvents = () => {
    window.addEventListener('deviceorientation', e => {
      let gamma = e.gamma;
      if (gamma === null) return;

      // Handle screen orientation
      let angle = (window.screen && window.screen.orientation) ? window.screen.orientation.angle : (window.orientation || 0);
      let tilt = gamma;
      if (angle === 90) tilt = e.beta;
      else if (angle === -90) tilt = -e.beta;

      const tiltX = clamp(tilt, -45, 45) / 45; // -1 to 1
      if(tiltEnabled) gravityX = tiltX * GRAVITY * 0.8;
      else gravityX = 0;
    }, {passive: true});
    accelInited = true;
  };

  // iOS 13+ requires permission for deviceorientation, and it MUST be tied to a touchend or click event.
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(perm => {
      if (perm === 'granted') {
        setupEvents();
      }
    }).catch(e => console.warn("Orientation permission error:", e));
  } else {
    setupEvents();
  }
}

// Bind to strong user-interaction events as pointerdown is sometimes ignored by iOS security
document.addEventListener('click', initAccel, {once: true});
document.addEventListener('touchend', initAccel, {once: true});
let dragOffsetX = 0, dragOffsetY = 0;
let touchX = 0, touchY = 0;

// ── Verlet Particle ─────────────────────────────────────────────────────
class Particle {
  constructor(x, y, pinned=false){
    this.x = x; this.y = y;
    this.ox = x; this.oy = y;
    this.pinned = pinned;
    this.radius = 3;
  }
  update(dt){
    if(this.pinned) return;
    let vx = (this.x - this.ox) * DAMPING;
    let vy = (this.y - this.oy) * DAMPING;
    // Horizontal: safety cap only (prevents NaN cascade from aggressive drag)
    vx = clamp(vx || 0, -800, 800);
    // Vertical: safety cap upward, terminal-velocity cap downward so the camera
    // can always track the ragdoll even after collision impulse spikes.
    vy = clamp(vy || 0, -800, TERMINAL_VY);
    this.ox = this.x; this.oy = this.y;
    this.x += vx + gravityX * dt * dt;
    this.y += vy + gravityY * dt * dt;
    // NaN guard
    if(!isFinite(this.x)){ this.x = this.ox; this.ox = this.x; }
    if(!isFinite(this.y)){ this.y = this.oy; this.oy = this.y; }
  }
}

// ── Distance Constraint ─────────────────────────────────────────────────
class Constraint {
  constructor(a, b, dist, stiffness=1){
    this.a = a; this.b = b;
    this.dist = dist;
    this.stiffness = stiffness;
  }
  solve(){
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    const d = Math.sqrt(dx*dx+dy*dy) || 0.001;
    const diff = clamp((d - this.dist) / d * this.stiffness, -2, 2);
    const mx = dx*diff*0.5, my = dy*diff*0.5;
    if(!this.a.pinned){ this.a.x += mx; this.a.y += my; }
    if(!this.b.pinned){ this.b.x -= mx; this.b.y -= my; }
  }
}

// ── Sphere ───────────────────────────────────────────────────────────────
class Sphere {
  constructor(x, y, r, type='sphere'){
    this.type = type;
    this.x = x; this.y = y;
    const ss = sphereSizeScale;
    if(type === 'challenge'){
      this.r = (35 + Math.random()*25) * ss;
      this.challengeVariant = Math.floor(Math.random() * 5); // 5 distinct threat shapes
    } else if(type === 'heart'){
      this.r = (25 + Math.random()*15) * ss;
    } else if(type === 'setback'){
      this.r = (32 + Math.random()*20) * ss; // slightly larger — hexagram reads better
    } else if(type === 'chakra'){
      this.r = (28 + Math.random()*20) * ss;
    } else if(type === 'merkaba'){
      this.r = (28 + Math.random()*18) * ss;
    } else if(type === 'torus'){
      this.r = (26 + Math.random()*16) * ss;
    } else if(type === 'aura' || type === 'nova'){
      this.r = (22 + Math.random()*12) * ss;
    } else {
      this.r = (r || (15 + Math.random()*35)) * ss;
    }
    this.vx = 0;
    this.vy = 0;
    this.rotation = Math.random()*TAU;
    this.rotSpeed = (Math.random()-0.5)*0.02;
    this.hue = Math.random()*360;
    this.segments = 3 + Math.floor(Math.random()*5); // sacred geometry sides
    this.sacredType = Math.floor(Math.random() * 3); // 0: polygon, 1: seed of life, 2: metatron
    this.chakraLevel = Math.floor(Math.random() * 7); // 0-6 for the 7 chakras
    this.impactFlash = 0;
  }
  update(dt){
    this.rotation += this.rotSpeed;
    // Spheres are STATIC in world space - no gravity, no movement
  }
}

function hslToRgbArr(h, s, l) {
  h /= 360;
  let r, g, b;
  if(s === 0){ r = g = b = l; } else {
    const hue2rgb = (p, q, t) => {
      if(t < 0) t += 1;
      if(t > 1) t -= 1;
      if(t < 1/6) return p + (q - p) * 6 * t;
      if(t < 1/2) return q;
      if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── Random Names ────────────────────────────────────────────────────────
function generateName(){
  const p = ['l','n','r','s','m','k','z','v','t','x'];
  const m = ['a','e','i','o','u','y','ae','io','ea'];
  const s = ['x','n','m','l','r','s','th','z','k'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  return pick(p) + pick(m) + pick(s);
}

// ── Ragdoll ──────────────────────────────────────────────────────────────
class Ragdoll {
  constructor(x, y, name){
    this.name = name || generateName();
    this.hue = Math.random() * 360;
    this.accent = hslToRgbArr(this.hue, 0.95, 0.7);
    this.accent2 = hslToRgbArr((this.hue + 40)%360, 1.0, 0.8);

    this.particles = [];
    this.constraints = [];
    const s = 18; // segment length
    // Head
    const head = new Particle(x, y - s*4);
    head.radius = 7;
    // Neck
    const neck = new Particle(x, y - s*3.2);
    // Shoulders
    const lShoulder = new Particle(x - s*1.5, y - s*2.5);
    const rShoulder = new Particle(x + s*1.5, y - s*2.5);
    // Elbows
    const lElbow = new Particle(x - s*2.5, y - s*1.2);
    const rElbow = new Particle(x + s*2.5, y - s*1.2);
    // Hands
    const lHand = new Particle(x - s*3, y);
    const rHand = new Particle(x + s*3, y);
    // Hips
    const lHip = new Particle(x - s*0.7, y);
    const rHip = new Particle(x + s*0.7, y);
    // Knees
    const lKnee = new Particle(x - s*0.8, y + s*1.5);
    const rKnee = new Particle(x + s*0.8, y + s*1.5);
    // Feet
    const lFoot = new Particle(x - s*0.9, y + s*3);
    const rFoot = new Particle(x + s*0.9, y + s*3);

    this.particles = [head,neck,lShoulder,rShoulder,lElbow,rElbow,lHand,rHand,lHip,rHip,lKnee,rKnee,lFoot,rFoot];
    this.headTrail = [];
    this.trailMaxLen = 28;

    const C = (a,b,d,stiff)=> this.constraints.push(new Constraint(this.particles[a],this.particles[b],d||s,stiff||1));
    C(0,1,s);       // head-neck
    C(1,2,s*1.5);   // neck-lShoulder
    C(1,3,s*1.5);   // neck-rShoulder
    C(2,4,s*1.5);   // lShoulder-lElbow
    C(3,5,s*1.5);   // rShoulder-rElbow
    C(4,6,s*1.3);   // lElbow-lHand
    C(5,7,s*1.3);   // rElbow-rHand
    C(1,8,s*1.2);   // neck-lHip
    C(1,9,s*1.2);   // neck-rHip
    C(8,9,s*1.4);   // hips
    C(8,10,s*1.8);  // lHip-lKnee
    C(9,11,s*1.8);  // rHip-rKnee
    C(10,12,s*1.8); // lKnee-lFoot
    C(11,13,s*1.8); // rKnee-rFoot
    // Structural stiffness
    C(2,3,s*3,0.3);  // shoulder span
    C(8,9,s*1.4,0.3); // hip span
  }

  update(dt){
    for(const p of this.particles) p.update(dt);
    for(let i=0;i<ITERATIONS;i++){
      for(const c of this.constraints) c.solve();
    }
  }

  // Find closest particle to a point
  closestParticle(x,y){
    let best=null, bestD=40;
    for(const p of this.particles){
      const d = Math.hypot(p.x-x, p.y-y);
      if(d<bestD){ bestD=d; best=p; }
    }
    return best;
  }
}

// ── Collision helpers ────────────────────────────────────────────────────
// ── Audio ────────────────────────────────────────────────────────────────
let audioCtx;
let masterGain;
let delayNode;
let lastImpactTime = 0;
let isMuted = true;
// Stereo flanger nodes — created in initAudio, activated by wave power-up
let flangerDelayL = null, flangerDelayR = null;
let flangerFbL = null,    flangerFbR = null;
let flangerWetL = null,   flangerWetR = null;
// Count of currently playing oscillators (maintained by the createOscillator
// wrapper installed in initAudio). Used to early-return from playImpactSound
// on extreme combo pile-ups so we don't clip/crackle on mobile.
let activeOscCount = 0;

function initAudio(){
  if(audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(audioCtx.destination);

  // Reverb/Delay for spatial void echo
  delayNode = audioCtx.createDelay();
  delayNode.delayTime.value = 0.4;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.45;

  // Lowpass filter on the echo to make it fade into the distance
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  delayNode.connect(filter);
  filter.connect(feedback);
  feedback.connect(delayNode);

  // Send echo output to master
  delayNode.connect(masterGain);

  // ── Stereo Flanger ────────────────────────────────────────────────────
  // Two short delay lines (L/R) tapped from masterGain. A single LFO drives
  // both at opposite sign (180° phase), creating a sweeping stereo spread.
  // Wet gains start at 0 so there is no effect until the wave power-up fires.
  // Feedback stays at 0 when inactive to prevent buffer saturation.
  flangerDelayL = audioCtx.createDelay(0.02); flangerDelayL.delayTime.value = 0.004;
  flangerDelayR = audioCtx.createDelay(0.02); flangerDelayR.delayTime.value = 0.004;

  flangerFbL = audioCtx.createGain(); flangerFbL.gain.value = 0;
  flangerFbR = audioCtx.createGain(); flangerFbR.gain.value = 0;
  flangerDelayL.connect(flangerFbL); flangerFbL.connect(flangerDelayL);
  flangerDelayR.connect(flangerFbR); flangerFbR.connect(flangerDelayR);

  flangerWetL = audioCtx.createGain(); flangerWetL.gain.value = 0;
  flangerWetR = audioCtx.createGain(); flangerWetR.gain.value = 0;

  const flangerPanL = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
  const flangerPanR = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
  if(flangerPanL.pan) flangerPanL.pan.value = -0.8;
  if(flangerPanR.pan) flangerPanR.pan.value =  0.8;
  flangerDelayL.connect(flangerWetL); flangerWetL.connect(flangerPanL); flangerPanL.connect(audioCtx.destination);
  flangerDelayR.connect(flangerWetR); flangerWetR.connect(flangerPanR); flangerPanR.connect(audioCtx.destination);

  // LFO — same oscillator drives both channels at opposite polarity
  const flangerLfo = audioCtx.createOscillator();
  flangerLfo.type = 'sine';
  flangerLfo.frequency.value = 0.28; // ~0.28 Hz = very slow cosmic sweep
  const flangerDepthL = audioCtx.createGain(); flangerDepthL.gain.value =  0.0025;
  const flangerDepthR = audioCtx.createGain(); flangerDepthR.gain.value = -0.0025; // 180° phase
  flangerLfo.connect(flangerDepthL); flangerDepthL.connect(flangerDelayL.delayTime);
  flangerLfo.connect(flangerDepthR); flangerDepthR.connect(flangerDelayR.delayTime);
  flangerLfo.start();

  // Tap the master mix into both flanger delays
  masterGain.connect(flangerDelayL);
  masterGain.connect(flangerDelayR);

  // Wrap createOscillator so every osc made via this ctx participates in the
  // activeOscCount without touching each individual synth branch below.
  const rawCreateOsc = audioCtx.createOscillator.bind(audioCtx);
  audioCtx.createOscillator = function(){
    const osc = rawCreateOsc();
    let started = false, ended = false;
    const rawStart = osc.start.bind(osc);
    osc.start = function(when){
      if(!started){ started = true; activeOscCount++; }
      return rawStart(when);
    };
    osc.addEventListener('ended', () => {
      if(started && !ended){ ended = true; activeOscCount--; }
    });
    return osc;
  };
}

function playImpactSound(force, hue, xPos, type, sacredType){
  if(isMuted || !audioCtx) return;
  if(force < 1.5) return; // ignore tiny grazes
  // Bail if the mix is already saturated with in-flight oscillators.
  if(activeOscCount >= CONFIG.MAX_CONCURRENT_OSC) return;
  const now = audioCtx.currentTime;
  if(now - lastImpactTime < 0.04) return; // throttle overlapping sounds
  lastImpactTime = now;

  // Pentatonic scale mapped to hue - warm, grounded tuning
  const baseFreq = 165; // E3 base - warmer, less shrill than A3
  const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const noteIdx = Math.floor((hue / 360) * pentatonic.length) % pentatonic.length;
  const freq = baseFreq * Math.pow(2, pentatonic[noteIdx]/12);

  // Record the pitch class for the perfect-chord-bloom tracker. Passing the
  // impact position lets the bloom's visual burst spawn where the last note
  // landed, which feels more intentional than a fixed centre point.
  recordHarmonyHit(noteIdx, xPos, cameraY + H * 0.5);

  const vol = Math.min(force * 0.025, 0.9);
  const duration = 0.3 + Math.min(force * 0.01, 1.5);

  // Stereo panning based on horizontal collision position
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
  if(panner.pan) panner.pan.value = Math.max(-1, Math.min(1, (xPos / W) * 2 - 1));

  if (type === 'heart') {
    // Warm, resonant major chord (root + fifth) with soft attack
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.498, now); // near-perfect fifth (warm)

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 1.0, now + 0.08); // softer, slower attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.8); // longer tail

    osc1.connect(gain1);
    osc2.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 1.5 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.5 + 0.1);

  } else if (type === 'challenge') {
    // Deep resonant gong - impactful but warm
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const sub = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine'; // was triangle - sine is warmer
    sub.type = 'sine';

    // Drop 2 octaves for deep body
    const baseNote = freq * 0.25;
    osc1.frequency.setValueAtTime(baseNote, now);
    osc2.frequency.setValueAtTime(baseNote * 1.498, now); // warm fifth
    sub.frequency.setValueAtTime(baseNote * 0.5, now); // sub bass

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 1.3, now + 0.03); // slightly softer attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 2.2); // long resonance

    osc1.connect(gain1);
    osc2.connect(gain1);
    sub.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 2.0 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 2.0 + 0.1);
    sub.start(now); sub.stop(now + duration * 2.0 + 0.1);

  } else if (type === 'yinyang') {
    // Balanced dual-tone fading smoothly
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.5, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 1.5 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.5 + 0.1);

  } else if (type === 'wave') {
    // Filtered sweep
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 5;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc.start(now); osc.stop(now + duration + 0.1);
  } else if (type === 'trail') {
    // Shimmer
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = 'sine'; osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 2, now);
    osc2.frequency.setValueAtTime(freq * 2.01, now); // gentle chorus, not octave doubling
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
    osc1.connect(gain); osc2.connect(gain); gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + duration + 0.1);
    osc2.start(now); osc2.stop(now + duration + 0.1);
  } else if (type === 'pulse') {
    // Bass thump
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.5, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.125, now + 0.15);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain); gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'magnet') {
    // Deep electromagnetic hum
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = 'sine'; osc2.type = 'sine'; // was sawtooth+square — too harsh
    osc1.frequency.setValueAtTime(freq * 0.3, now);
    osc2.frequency.setValueAtTime(freq * 0.3 + 1.5, now); // tighter beat
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.35, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);
    osc1.connect(gain); osc2.connect(gain); gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + duration * 1.2 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.2 + 0.1);
  } else if (type === 'setback') {
    // Dissonant "boing" — spring-like upward bounce sound
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    // Pitch drops rapidly then rises (spring effect)
    osc1.frequency.setValueAtTime(freq * 1.5, now);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.15);
    osc1.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.5);
    osc2.frequency.setValueAtTime(freq * 1.5, now);
    osc2.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 0.4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.5);
    osc1.connect(gain); osc2.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + duration * 1.5 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.5 + 0.1);
  } else if (type === 'chakra') {
    // Singing bowl resonance
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 0.99, now); // slight beat frequency

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 2.0);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 2.0 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 2.0 + 0.1);

  } else if (type === 'vesica') {
    // Warm Choir Pad (filtered sine pair)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc1.type = 'sine'; // was sawtooth
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 0.5, now);
    osc2.frequency.setValueAtTime(freq * 0.25, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 2, now); // lower cutoff
    filter.frequency.exponentialRampToValueAtTime(freq * 0.4, now + duration * 2);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.45, now + 0.12); // slower attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 2); // long fade

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 2 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 2 + 0.1);

  } else if(type === 'merkaba') {
    // Ascending crystal arpeggio — root, fifth, octave in quick succession
    // Suggests ascension / activation energy
    const notes = [freq, freq * 1.498, freq * 2.0]; // root, P5, oct
    notes.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const g   = audioCtx.createGain();
      const startT = now + i * 0.13;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, startT);
      g.gain.setValueAtTime(0, startT);
      g.gain.linearRampToValueAtTime(vol * (0.65 - i * 0.08), startT + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, startT + 0.8 - i * 0.05);
      osc.connect(g); g.connect(panner);
      osc.start(startT); osc.stop(startT + 0.9);
    });
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

  } else if(type === 'torus') {
    // Low resonant drone with subtle harmonic shimmer — continuity, cycles
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const osc3 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc1.type = 'sine'; osc2.type = 'sine'; osc3.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 0.5,   now); // low root
    osc2.frequency.setValueAtTime(freq * 0.748, now); // low fifth (warm)
    osc3.frequency.setValueAtTime(freq * 0.501, now); // tiny beat frequency
    filter.type = 'lowpass'; filter.frequency.value = freq * 2.5; filter.Q.value = 2;
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.55, now + 0.18);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 2.5);
    osc1.connect(filter); osc2.connect(filter); osc3.connect(filter);
    filter.connect(gain1); gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + duration * 2.5 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 2.5 + 0.1);
    osc3.start(now); osc3.stop(now + duration * 2.5 + 0.1);

  } else if(type === 'aura') {
    // Soft pentatonic shimmer — all five notes float upward gently
    // Ethereal: slow stagger, long sustain, crystal-pure sines
    const pentatonicRatios = [1.0, 1.2599, 1.4983, 1.6818, 2.0];
    pentatonicRatios.forEach((ratio, i) => {
      const osc = audioCtx.createOscillator();
      const g   = audioCtx.createGain();
      const startT = now + i * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio, startT);
      g.gain.setValueAtTime(0, startT);
      g.gain.linearRampToValueAtTime(vol * 0.35, startT + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, startT + 1.8);
      osc.connect(g); g.connect(panner);
      osc.start(startT); osc.stop(startT + 2.0);
    });
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

  } else if(type === 'nova') {
    // Bright crystalline burst — a sudden full-spectrum chord, then sparkle tail
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const osc3 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine'; osc2.type = 'sine'; osc3.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 2,     now);
    osc2.frequency.setValueAtTime(freq * 2.998, now); // 2× fifth
    osc3.frequency.setValueAtTime(freq * 4,     now); // 2× octave
    // Rapid bright attack, short sparkle decay
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.55, now + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc1.connect(gain1); osc2.connect(gain1); osc3.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + 0.65);
    osc2.start(now); osc2.stop(now + 0.65);
    osc3.start(now); osc3.stop(now + 0.65);

  } else {
    // Default sacred geometry - with random harmonic variation
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    gain1.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now);

    // Random harmonic interval for variety: min3, maj3, p4, p5 (no octave)
    const intervals = [1.2, 1.25, 1.335, 1.5];
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    // All sine for warmth
    const wave = 'sine';

    if (sacredType === 0) {
      // Polygon: warm crystalline pluck with random harmony
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.75, now + 0.012); // softer attack
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc2.type = wave;
      osc2.frequency.setValueAtTime(freq * interval, now);
      gain2.gain.linearRampToValueAtTime(vol * 0.45, now + 0.008);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * (interval > 1.5 ? 0.25 : 0.5));

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(panner);
      gain2.connect(panner);

    } else if (sacredType === 1) {
      // Seed of Life: warm chorus bell with random detune
      const detune = 1 + (Math.random() - 0.5) * 0.02;
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.85, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * interval * detune, now);
      gain2.gain.linearRampToValueAtTime(vol * 0.6, now + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(panner);
      gain2.connect(panner);

    } else if (sacredType === 2) {
      // Metatron's Cube: warm metallic chime
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.65, now + 0.012);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc2.type = 'sine'; // was square — too harsh
      osc2.frequency.setValueAtTime(freq * interval, now);
      gain2.gain.linearRampToValueAtTime(vol * 0.25, now + 0.008);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);
      
      const bq = audioCtx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.setValueAtTime(freq * 3, now);
      bq.frequency.exponentialRampToValueAtTime(freq * 0.8, now + duration * 0.5);
      osc2.connect(bq);
      bq.connect(gain2);

      osc1.connect(gain1);
      gain1.connect(panner);
      gain2.connect(panner);
    }

    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);

    osc1.start(now); osc1.stop(now + duration * 1.2 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.2 + 0.1);

    // Occasional gentle bass synth (~25% chance)
    if(Math.random() < 0.25) {
      const bass = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();
      const bassFilter = audioCtx.createBiquadFilter();
      bass.type = 'sine';
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(120, now);
      bassFilter.Q.setValueAtTime(2, now);
      // Sub-harmonic: root or fifth below
      const bassNote = freq * (Math.random() < 0.5 ? 0.25 : 0.167);
      bass.frequency.setValueAtTime(bassNote, now);
      bass.frequency.exponentialRampToValueAtTime(bassNote * 0.98, now + 1.5);
      bassGain.gain.setValueAtTime(0, now);
      bassGain.gain.linearRampToValueAtTime(vol * 0.25, now + 0.08);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      bass.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(panner);
      bass.start(now); bass.stop(now + 1.6);
    }
  }
}

function playMilestoneChord(){
  if(isMuted || !audioCtx) return;
  const now = audioCtx.currentTime;
  const baseFreq = 261.63; // C4
  const chordFreqs = [baseFreq, baseFreq * 1.26, baseFreq * 1.5]; // C E G
  for(const freq of chordFreqs){
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    osc.connect(gain); gain.connect(masterGain);
    if(delayNode) gain.connect(delayNode);
    osc.start(now); osc.stop(now + 2.6);
  }
}

function collideParticleSphere(p, s, dt, impactData){
  const dx = p.x-s.x, dy = p.y-s.y;
  const d = Math.sqrt(dx*dx+dy*dy) || 0.001;
  const minD = (p.radius||3) + s.r;
  if(d < minD){
    const nx = dx/d, ny = dy/d;
    const overlap = minD - d;
    if(!p.pinned){
      p.x += nx * overlap * 0.45;
      p.y += ny * overlap * 0.45;
    }
    const pushForce = Math.min(overlap * 0.4, 5); // cap sphere displacement
    s.x -= nx * pushForce;
    s.y -= ny * pushForce;
    // Keep spheres in reasonable bounds
    s.x = Math.max(-100, Math.min(W + 100, s.x));
    s.y = Math.max(cameraY - 200, s.y);

    const vx = p.x - p.ox, vy = p.y - p.oy;
    const dot = vx*nx + vy*ny;
    const impactVel = -dot;
    if(impactVel > impactData.maxForce) impactData.maxForce = impactVel;

    if(dot < 0){
      // Reduced friction (0.95 vs 0.5) and increased bounce (0.65 vs 0.5)
      const friction = 0.05;
      const bounce = 0.65;
      const vnx = nx * dot, vny = ny * dot;
      const vtx = vx - vnx, vty = vy - vny;
      p.ox = p.x - (vtx * (1 - friction) - vnx * bounce);
      p.oy = p.y - (vty * (1 - friction) - vny * bounce);
    }
  }
}

function collideRagdollSphere(ragdoll, sphere, dt){
  let hit = false;
  let impactData = { maxForce: 0 };
  for(const p of ragdoll.particles){
    const dx = p.x-sphere.x, dy = p.y-sphere.y;
    const d = Math.sqrt(dx*dx+dy*dy) || 0.001;
    const minD = (p.radius||3) + sphere.r;
    if(d < minD) hit = true;
    collideParticleSphere(p, sphere, dt, impactData);
  }
  if(hit){
    spawnImpactParticles(sphere.x, sphere.y, sphere.hue, impactData.maxForce);
    playImpactSound(impactData.maxForce, sphere.hue, sphere.x, sphere.type, sphere.sacredType);
    sphere.impactFlash = 1.0;

    // ── Score ──
    const now = time;
    if(now - lastHitTime < COMBO_WINDOW){ comboCount++; } else { comboCount = 1; }
    lastHitTime = now;

    // ── Collision Harmonics ──
    harmonyIndex = (harmonyIndex + 1) % pentatonicScale.length;
    const timeSinceLast = now - lastHitTime;
    // Adaptive cooldown: rapid hits increase the gap, slow hits reset it
    if(timeSinceLast < 0.12){
      harmonicCooldown = Math.min(harmonicCooldown + 0.04, 0.6);
    } else {
      harmonicCooldown = Math.max(harmonicCooldown - 0.02, 0);
    }
    if(comboCount > 1 && audioCtx && !isMuted && timeSinceLast > harmonicCooldown + 0.08){
      const hNow = audioCtx.currentTime;
      const hFreq = 220 * Math.pow(2, pentatonicScale[Math.min(comboCount-1, pentatonicScale.length-1)]/12);
      const hOsc = audioCtx.createOscillator();
      const hGain = audioCtx.createGain();
      const hFilter = audioCtx.createBiquadFilter();
      hOsc.type = 'triangle';
      hOsc.frequency.setValueAtTime(hFreq, hNow);
      // Filter gets warmer (lower cutoff) the more stuck you are
      const warmth = 1 + harmonicCooldown * 3; // 1.0 → 2.8
      hFilter.type = 'lowpass';
      hFilter.frequency.setValueAtTime(hFreq * 2 / warmth, hNow);
      hFilter.frequency.exponentialRampToValueAtTime(hFreq / warmth, hNow + 0.3);
      hFilter.Q.value = 0.7;
      // Volume fades down when stuck
      const stuckVol = 0.06 * Math.max(0.15, 1 - harmonicCooldown * 1.5);
      hGain.gain.setValueAtTime(0, hNow);
      hGain.gain.linearRampToValueAtTime(stuckVol, hNow + 0.08);
      hGain.gain.exponentialRampToValueAtTime(0.001, hNow + 1.0);
      hOsc.connect(hFilter); hFilter.connect(hGain); hGain.connect(masterGain);
      if(delayNode) hGain.connect(delayNode);
      hOsc.start(hNow); hOsc.stop(hNow + 1.1);
    }

    // ── Setback Trampoline: launch ragdoll upward ──
    if(sphere.type === 'setback'){
      const bounceStrength = 70 + Math.random() * 30; // 70-100 units/sec upward (≈40% of original)
      for(const p of ragdoll.particles){
        // Set old position above current to create upward velocity
        p.oy = p.y + bounceStrength * 0.016 * 3; // ~3 frames worth of upward velocity
      }
    }

    // ── Power-Up Activation ──
    if(sphere.type === 'wave'){ activeEffects.wave = 4; activateFlanger(4.5); }
    else if(sphere.type === 'trail') activeEffects.trail = 7;
    else if(sphere.type === 'pulse') activeEffects.pulse = 3;
    else if(sphere.type === 'magnet') activeEffects.magnet = 5;
    else if(sphere.type === 'aura') activeEffects.aura = 5;
    else if(sphere.type === 'nova') activeEffects.nova = 3;

    const _powerUpTypes = ['wave','trail','pulse','magnet','aura','nova'];
    const basePoints = sphere.type === 'challenge' ? 50 : (sphere.type === 'heart' ? 25 : (sphere.type === 'setback' ? 0 : (_powerUpTypes.includes(sphere.type) ? 30 : 15)));
    const multiplier = Math.min(comboCount, 10);
    const pts = basePoints * multiplier;
    score += pts;

    // Glitter burst instead of text popup
    const glitterIntensity = Math.min(impactData.maxForce || 3, 10);
    const glitterCount = Math.min(2 + Math.floor(glitterIntensity * 0.5), 5);
    for(let gi = 0; gi < glitterCount; gi++){
      if(particleCount >= MAX_PARTICLES) break;
      const ga = Math.random() * TAU;
      const gs = 18 + Math.random() * 45;
      particles[particleCount++] = {
        x: sphere.x, y: sphere.y,
        vx: Math.cos(ga) * gs,
        vy: Math.sin(ga) * gs - 25,
        life: 1.0,
        decay: 1.0 + Math.random() * 0.5,
        size: 0.5 + Math.random() * 0.7,
        hue: (sphere.hue + Math.random() * 80 - 40 + 360) % 360,
        type: 'glitter',
      };
    }

    // Spawn 5-8 fly-to-counter sparks
    const flyCount = 5 + Math.floor(Math.random() * 4);
    for(let i = 0; i < flyCount; i++){
      scoreFlies.push({
        x: sphere.x + (Math.random()-0.5) * sphere.r * 1.5,
        y: sphere.y + (Math.random()-0.5) * sphere.r * 1.5,
        vx: (Math.random()-0.5) * 120,
        vy: -60 - Math.random() * 80,
        size: 1.5 + Math.random() * 2,
        hue: (sphere.hue + Math.random() * 40 - 20) % 360,
        life: 1.0,
        delay: i * 0.04, // staggered departure
        phase: 'burst', // burst → arc → home
        arcTime: 0,
      });
    }

    // Portal trigger - Reimagined as "Shattering the Void"
    if(sphere.type === 'challenge' && !portal){
      const h = (sphere.hue + time * 40) % 360;
      portal = {
        x: sphere.x, y: sphere.y, r: sphere.r,
        progress: 0, hue: h, phase: 'expanding',
        targetAccent: [60+Math.random()*180|0, 60+Math.random()*180|0, 60+Math.random()*180|0],
        targetAccent2: [60+Math.random()*180|0, 60+Math.random()*180|0, 60+Math.random()*180|0],
      };
    }
  }
}

// ── Impact particles ─────────────────────────────────────────────────────
let particles = [];
let shockwaves = [];
const MAX_PARTICLES = 150;
const MAX_SHOCKWAVES = 6;
let particleCount = 0;

function spawnImpactParticles(x, y, hue, force){
  const intensity = Math.min(force || 3, 10);
  const hue2 = (hue + 120) % 360;
  const hue3 = (hue + 240) % 360;

  // Sparks
  const sparkCount = Math.min(4 + Math.floor(intensity * 0.8), 8);
  for(let i = 0; i < sparkCount; i++){
    if(particleCount >= MAX_PARTICLES) break;
    const angle = (i / sparkCount) * TAU + (Math.random()-0.5)*0.5;
    const speed = 55 + Math.random() * 100 * (intensity / 5);
    particles[particleCount++] = {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 1.0,
      decay: 0.7 + Math.random() * 0.6,
      size: 1.0 + Math.random() * 2.2 * (intensity / 5),
      // inline ternary avoids a 3-element array allocation per spark
      hue: (i % 3 === 0 ? hue : i % 3 === 1 ? hue2 : hue3) + Math.random() * 40 - 20,
      type: 'spark',
    };
  }

  // Streaks - fast, directional
  const streakCount = Math.min(1 + Math.floor(intensity * 0.3), 3);
  for(let i = 0; i < streakCount; i++){
    if(particleCount >= MAX_PARTICLES) break;
    const angle = (Math.random()) * TAU;
    const speed = 80 + Math.random() * 120;
    particles[particleCount++] = {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 15,
      life: 1.0,
      decay: 1.2 + Math.random() * 0.8,
      size: 1.0 + Math.random() * 1.5,
      hue: (hue + i * 45) % 360,
      type: 'streak',
    };
  }

  // Expanding rings - 1-2 max, very cheap
  const ringCount = intensity > 3 ? 2 : 1;
  for(let i = 0; i < ringCount; i++){
    if(particleCount >= MAX_PARTICLES) break;
    particles[particleCount++] = {
      x, y,
      vx: 0, vy: 0,
      life: 1.0,
      decay: 0.9 + Math.random() * 0.4,
      size: 3 + Math.random() * 3,
      hue: (hue + i * 60) % 360,
      type: 'ring',
    };
  }

  // 1-2 embers for warmth
  if(particleCount < MAX_PARTICLES){
    const angle = Math.random() * TAU;
    const speed = 12 + Math.random() * 28;
    particles[particleCount++] = {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 25,
      life: 1.0,
      decay: 0.3 + Math.random() * 0.2,
      size: 2.5 + Math.random() * 2,
      hue: hue + Math.random() * 60 - 30,
      type: 'ember',
    };
  }

  // Firework rockets
  const fwCount = 1 + Math.floor(intensity * 0.25);
  for(let i = 0; i < fwCount; i++){
    if(particleCount >= MAX_PARTICLES) break;
    const angle = -PI/2 + (Math.random()-0.5) * PI * 0.9;
    const speed = 95 + Math.random() * 75;
    particles[particleCount++] = {
      x: x + (Math.random()-0.5) * 12,
      y,
      vx: Math.cos(angle) * speed * 0.4,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.55 + Math.random() * 0.25,
      size: 1.4,
      hue: (hue + Math.random() * 120) % 360,
      type: 'firework',
      burstTimer: 0.12 + Math.random() * 0.13,
      burstHue: (hue + Math.random() * 180) % 360,
      didBurst: false,
    };
  }
}

function updateParticles(dt){
  const burstQueue = [];
  let writeIdx = 0;
  for(let i = 0; i < particleCount; i++){
    const p = particles[i];
    const grav = p.type === 'ring' ? 0 : (p.type === 'ember' ? 25 : (p.type === 'firework' ? 40 : 55));
    p.vy += grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= p.decay * dt;

    // Firework burst into glitter
    if(p.type === 'firework' && !p.didBurst){
      p.burstTimer -= dt;
      if(p.burstTimer <= 0){
        p.life = 0; // kill rocket
        const bHue = p.burstHue;
        const bCount = 4 + Math.floor(Math.random() * 3);
        for(let b = 0; b < bCount; b++){
          const ba = (b / bCount) * TAU + Math.random() * 0.3;
          const bs = 45 + Math.random() * 70;
          // Mix glitter and streak for variety
          const bType = b % 3 === 0 ? 'streak' : 'glitter';
          burstQueue.push({
            x: p.x, y: p.y,
            vx: Math.cos(ba) * bs,
            vy: Math.sin(ba) * bs,
            life: 1.0,
            decay: 0.8 + Math.random() * 0.6,
            size: 0.6 + Math.random() * 0.9,
            hue: (bHue + b * 18) % 360,
            type: bType,
          });
        }
      }
    }

    if(p.life > 0){
      if(writeIdx !== i) particles[writeIdx] = p;
      writeIdx++;
    }
  }
  particleCount = writeIdx;

  // Append burst particles
  for(const bp of burstQueue){
    if(particleCount >= MAX_PARTICLES) break;
    particles[particleCount++] = bp;
  }
}

function updateScoreElements(dt){
  // Animate display score toward actual score
  if(displayScore < score){
    displayScore += Math.ceil((score - displayScore) * 0.15);
    if(displayScore > score) displayScore = score;
  }

  // Combo decay
  if(time - lastHitTime > COMBO_WINDOW) comboCount = 0;

  // Score popups (world space) - in-place compaction to avoid splice GC churn
  {
    let w = 0;
    for(let i = 0; i < scorePopups.length; i++){
      const p = scorePopups[i];
      p.y += p.vy * dt;
      p.vy *= 0.97;
      p.life -= dt * 1.2;
      if(p.life > 0){ if(w !== i) scorePopups[w] = p; w++; }
    }
    scorePopups.length = w;
  }

  // Score flies (world space → screen space transition)
  const counterX = W - 20;
  const counterY = H - 38;
  let sfWrite = 0;
  for(let i = 0; i < scoreFlies.length; i++){
    const f = scoreFlies[i];
    f.life -= dt * 0.8;
    if(f.life <= 0) continue; // drop (do not advance write index)

    if(f.delay > 0){ f.delay -= dt; if(sfWrite !== i) scoreFlies[sfWrite] = f; sfWrite++; continue; }

    if(f.phase === 'burst'){
      // Initial burst outward
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.94;
      f.vy *= 0.94;
      f.arcTime += dt;
      if(f.arcTime > 0.2) f.phase = 'arc';
    } else if(f.phase === 'arc'){
      // Curve toward counter (screen space target, but we're in world space during update)
      // Convert counter to world space
      const targetWX = counterX;
      const targetWY = counterY + cameraY;
      const dx = targetWX - f.x;
      const dy = targetWY - f.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const accel = 800 + f.arcTime * 2000; // accelerating homing
      f.vx += (dx / d) * accel * dt;
      f.vy += (dy / d) * accel * dt;
      f.vx *= 0.96;
      f.vy *= 0.96;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.arcTime += dt;
      if(d < 30) f.phase = 'arrived';
    }
    // 'arrived' fades out via life
    if(sfWrite !== i) scoreFlies[sfWrite] = f;
    sfWrite++;
  }
  scoreFlies.length = sfWrite;
}

function drawScoreElements(){
  const a = theme.accent2;

  // ── Score Flies (screen space overlay) ──
  for(const f of scoreFlies){
    if(f.delay > 0 || f.life <= 0) continue;
    const sx = f.x;
    const sy = f.y - cameraY;
    let alpha, size;
    if(f.phase === 'arrived'){
      alpha = f.life * 0.8;
      size = f.size * (1 + (1 - f.life) * 2);
    } else {
      alpha = f.life * 0.9;
      size = f.size;
    }
    ctx.fillStyle = `hsla(${f.hue},90%,70%,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, TAU);
    ctx.fill();
    // Trail
    if(f.phase === 'arc'){
      const trailLen = 2;
      for(let t = 1; t <= trailLen; t++){
        const ta = alpha * (1 - t / (trailLen + 1)) * 0.5;
        const tx = sx - f.vx * 0.008 * t;
        const ty = sy - f.vy * 0.008 * t;
        ctx.fillStyle = `hsla(${f.hue},90%,70%,${ta})`;
        ctx.beginPath();
        ctx.arc(tx, ty, size * (1 - t * 0.2), 0, TAU);
        ctx.fill();
      }
    }
  }
}

function drawParticles(){
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Batch particles by type for fewer state changes
  // Pre-compute TAU and PI references (local cache for hot loop)
  const _TAU = TAU, _PI = PI;

  for(let pi = 0; pi < particleCount; pi++){
    const p = particles[pi];
    if(p.life <= 0) continue;
    const alpha = p.life > 0.5 ? 1.0 : p.life * 2.0;
    const a = alpha * p.life;
    const px = p.x, py = p.y;
    const sz = p.size;
    const h = p.hue | 0;

    if(p.type === 'spark'){
      // Single glow circle — cheaper than 3-layer, still looks great
      ctx.fillStyle = `hsla(${h},100%,85%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 3, 0, _TAU); ctx.fill();
      // Bright core
      ctx.fillStyle = `hsla(${h},100%,98%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 0.7, 0, _TAU); ctx.fill();

    } else if(p.type === 'ember'){
      ctx.fillStyle = `hsla(${h},90%,75%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 2.5, 0, _TAU); ctx.fill();
      ctx.fillStyle = `hsla(${h},80%,98%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 0.5, 0, _TAU); ctx.fill();

    } else if(p.type === 'glitter'){
      // 4-pointed star using pre-computed offsets (no trig in draw loop)
      const r = sz * (0.5 + p.life * 0.5);
      const r2 = r * 0.35;
      // Cache rotation
      const rot = (h * 0.017) | 0;
      const c0 = 1, s0 = 0;
      const c1 = 0.707, s1 = 0.707;
      const c2 = 0, s2 = 1;
      const c3 = -0.707, s3 = 0.707;
      // Apply rotation offsets manually (8 points of a 4-pointed star)
      const pts = [
        [c0*r, s0*r], [c1*r2, s1*r2],
        [c2*r, s2*r], [c3*r2, s3*r2],
        [-c0*r, -s0*r], [-c1*r2, -s1*r2],
        [-c2*r, -s2*r], [-c3*r2, -s3*r2],
      ];
      ctx.fillStyle = `hsla(${h},100%,88%,${a})`;
      ctx.beginPath();
      ctx.moveTo(px + pts[0][0], py + pts[0][1]);
      for(let s = 1; s < 8; s++) ctx.lineTo(px + pts[s][0], py + pts[s][1]);
      ctx.closePath(); ctx.fill();
      // Halo only for larger particles
      if(r > 1.5){
        ctx.fillStyle = `hsla(${(h+60)%360},100%,80%,${a * 0.25})`;
        ctx.beginPath(); ctx.arc(px, py, r * 1.2, 0, _TAU); ctx.fill();
      }

    } else if(p.type === 'streak'){
      const len = sz * 5;
      const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy) || 1;
      const nx = p.vx/spd, ny = p.vy/spd;
      ctx.strokeStyle = `hsla(${h},100%,85%,${a})`;
      ctx.lineWidth = sz * 0.6;
      ctx.beginPath();
      ctx.moveTo(px - nx*len, py - ny*len);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.fillStyle = `hsla(${h},100%,98%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 0.4, 0, _TAU); ctx.fill();

    } else if(p.type === 'ring'){
      const r = sz * (2 + (1 - p.life) * 8);
      ctx.strokeStyle = `hsla(${h},100%,75%,${a * 0.6})`;
      ctx.lineWidth = sz * 0.5 * p.life;
      ctx.beginPath(); ctx.arc(px, py, r, 0, _TAU); ctx.stroke();

    } else if(p.type === 'firework'){
      ctx.fillStyle = `hsla(${h},100%,90%,${a * 0.2})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 2, 0, _TAU); ctx.fill();
      ctx.fillStyle = `hsla(${h},100%,98%,${a})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 0.6, 0, _TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// ── State ────────────────────────────────────────────────────────────────
let ragdolls = [];
let spheres = [];
let time = 0;
let cameraY = 0; // camera offset - follows the ragdoll's descent
let fallSpeed = 0; // how deep the ragdoll has fallen
let nextChallengeY = 10000;

// Spawn initial
ragdolls.push(new Ragdoll(W/2, 0, 'emy'));
// No initial spheres - intro handles the first moments

let nextShapeY = CONFIG.SHAPE_START_Y; // first shape allowed at 25m

function spawnSphereAtDepth(yWorld, forceType=null){
  let type = 'sphere';
  if (forceType) {
    type = forceType;
  } else {
    // Reduced frequency of special obstacles (approx 1.5% each)
    const r = Math.random();
    if      (r < 0.012) type = 'setback';
    else if (r < 0.027) type = 'heart';
    else if (r < 0.042) type = 'yinyang';
    else if (r < 0.057) type = 'chakra';
    else if (r < 0.072) type = 'merkaba';
    else if (r < 0.087) type = 'torus';
    else if (r < 0.107) type = 'wave';
    else if (r < 0.115) type = 'trail';
    else if (r < 0.130) type = 'pulse';
    else if (r < 0.145) type = 'magnet';
    else if (r < 0.158) type = 'aura';
    else if (r < 0.170) type = 'nova';
  }

  spheres.push(new Sphere(
    Math.random()*W,
    yWorld,
    null,
    type
  ));
}

// ── Input ────────────────────────────────────────────────────────────────
canvas.addEventListener('pointerdown', e => {
  initAudio();
  initAccel();
  const x = e.clientX, y = e.clientY;
  touchX = x; touchY = y;
  // Slow everything on touch
  targetTimeScale = 0.05;
  isSlowed = true;
  for(const r of ragdolls){
    const p = r.closestParticle(x, y + cameraY); // Check against world coordinates
    if(p){
      isDragging = true;
      dragRagdoll = r;
      dragParticle = p;
      // Offset relative to the particle in world space
      dragOffsetX = p.x - x;
      dragOffsetY = p.y - cameraY - y;

      // ONLY pin the specific particle being dragged, not the whole ragdoll
      p._wasPinned = p.pinned;
      p.pinned = true;
      break;
    }
  }
});
canvas.addEventListener('pointermove', e => {
  touchX = e.clientX; touchY = e.clientY;
  if(isDragging && dragRagdoll && dragParticle){
    // Convert current screen position to world position for the target
    const targetX = e.clientX + dragOffsetX;
    const targetY = e.clientY + dragOffsetY + cameraY;

    // Smoothly interpolate position to make dragging slower and more physical
    // (Prevents fast "flicking")
    dragParticle.x += (targetX - dragParticle.x) * 0.15;
    dragParticle.y += (targetY - dragParticle.y) * 0.15;

    // Update velocity tracking for when released
    dragParticle.ox = dragParticle.x;
    dragParticle.oy = dragParticle.y;
  }
});
function releaseDrag(){
  if(isDragging && dragParticle){
    dragParticle.pinned = dragParticle._wasPinned || false;
  }
  isDragging = false;
  isSlowed = false;
  targetTimeScale = 1.0;
  dragRagdoll = null;
  dragParticle = null;
}
canvas.addEventListener('pointerup', releaseDrag);
canvas.addEventListener('pointercancel', releaseDrag);

// ── Buttons ───────────────────────────────────────────────────────────────
document.getElementById('add-btn').onclick = () => {
  const headY = ragdolls[0] ? ragdolls[0].particles[0].y : 0;
  ragdolls.push(new Ragdoll(W/2, headY - 50));
};
document.getElementById('theme-btn').onclick = () => {
  window.manualThemeSet = true;
  setTheme(themeIdx+1);
};
const muteBtn = document.getElementById('mute-btn');
const soundHintEl = document.getElementById('sound-hint');
muteBtn.onclick = () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('is-on', !isMuted);
  muteBtn.style.animation = 'none';
  if(!isMuted) initAudio();
  // Hide hint on first unmute
  if(soundHintEl) soundHintEl.style.display = 'none';
};

// Auto-fade the sound hint if the user hasn't unmuted within 8s of boot.
function fadeSoundHintIfStillMuted(){
  if(soundHintEl && isMuted) soundHintEl.style.opacity = '0';
  if(muteBtn && isMuted) muteBtn.style.animation = 'none';
  setTimeout(() => { if(soundHintEl) soundHintEl.style.display = 'none'; }, 1500);
}
setTimeout(fadeSoundHintIfStillMuted, 8000);

const tiltBtn = document.getElementById('tilt-btn');
tiltBtn.onclick = () => {
  tiltEnabled = !tiltEnabled;
  tiltBtn.classList.toggle('is-on', tiltEnabled);
  if(!tiltEnabled) gravityX = 0;
  else initAccel(); // Ensure permission is requested if turned on explicitly
};
document.getElementById('reset-btn').onclick = () => {
  // Preserve the chosen soul name across resets
  const _keptName = ragdolls[0]?.name || document.getElementById('emy-name')?.value || 'emy';
  clearSave();
  isDragging = false; dragRagdoll = null; dragParticle = null;
  cameraY = 0; fallSpeed = 0;
  portal = null;
  score = 0; displayScore = 0; comboCount = 0; lastHitTime = 0;
  scorePopups = []; scoreFlies = [];
  harmonyIndex = 0; harmonicCooldown = 0;
  activeEffects = { wave: 0, trail: 0, pulse: 0, magnet: 0, aura: 0, nova: 0 };
  waveRings = [];
  journeyLog = []; updateJourneyPanel();
  firedChapters = new Set();
  chapterDisplay = null; chapterSlowMo = 0;
  braids = [];
  breathRings = []; nextBreathY = 4000;
  breathSlowMo = 0;
  for(let i = 0; i < harmonyNotes.length; i++) harmonyNotes[i] = HARMONY_UNSET;
  chordBloomCooldown = 0; chordBloomFlash = 0;
  nextShapeY = CONFIG.SHAPE_START_Y;
  nextChallengeY = CONFIG.CHALLENGE_SPACING_WORLD;
  particles = []; particleCount = 0;
  ragdolls = [new Ragdoll(W/2, 0, _keptName)];
  spheres = [];
  for(let i=0;i<8;i++) spawnSphereAtDepth(i*120+Math.random()*80);
};

// ── Soul name input ───────────────────────────────────────────────────────
(function(){
  const nameInput = document.getElementById('emy-name');
  if(!nameInput) return;

  // Initialise from any existing save immediately
  const existing = loadProgress();
  if(existing?.ragdollName){
    nameInput.value = existing.ragdollName;
    // Also set the live ragdoll name if it already exists
    if(ragdolls[0]) ragdolls[0].name = existing.ragdollName;
  }

  // Live update: as the user types, the name tag above Emy changes in real time
  nameInput.addEventListener('input', () => {
    const v = nameInput.value.trim() || 'emy';
    if(ragdolls[0]) ragdolls[0].name = v;
  });

  // On blur / Enter: trigger an immediate save so the name is never lost
  const commit = () => {
    // Normalise empty input back to 'emy'
    if(!nameInput.value.trim()) nameInput.value = 'emy';
    if(ragdolls[0]) ragdolls[0].name = nameInput.value;
    saveProgress();
  };
  nameInput.addEventListener('blur', commit);
  nameInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); nameInput.blur(); }
    // Prevent canvas pointer events from stealing focus while typing
    e.stopPropagation();
  });

  // Prevent canvas touch/mouse handlers from triggering while the field is focused
  nameInput.addEventListener('pointerdown', e => e.stopPropagation());
})();

// ── Sacred Geometry Drawing ──────────────────────────────────────────────
function drawFlowerOfLife(cx, cy, radius, alpha){
  const a = theme.accent;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
  ctx.lineWidth = 0.5;
  // Central circle + 6 petals
  for(let i=0;i<7;i++){
    ctx.beginPath();
    const ox = i===0 ? 0 : Math.cos(i*PI/3)*radius;
    const oy = i===0 ? 0 : Math.sin(i*PI/3)*radius;
    ctx.arc(cx+ox, cy+oy, radius, 0, TAU);
    ctx.stroke();
  }
}

function drawMetatronsCube(cx, cy, radius, alpha){
  const a = theme.accent;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
  ctx.lineWidth = 0.5;
  // 13 circles of fruit of life
  const pts = [[0,0]];
  for(let ring=1;ring<=2;ring++){
    const n = ring===1 ? 6 : 12;
    const r = ring * radius * 0.6;
    for(let i=0;i<n;i++){
      const angle = i*TAU/n + (ring===2 ? PI/12 : 0);
      pts.push([Math.cos(angle)*r, Math.sin(angle)*r]);
    }
  }
  for(const [px,py] of pts){
    ctx.beginPath();
    ctx.arc(cx+px, cy+py, radius*0.35, 0, TAU);
    ctx.stroke();
  }
  // Connect all to all
  ctx.lineWidth = 0.3;
  for(let i=0;i<pts.length;i++){
    for(let j=i+1;j<pts.length;j++){
      ctx.beginPath();
      ctx.moveTo(cx+pts[i][0], cy+pts[i][1]);
      ctx.lineTo(cx+pts[j][0], cy+pts[j][1]);
      ctx.stroke();
    }
  }
}

function drawGoldenSpiral(cx, cy, radius, rotation, alpha){
  const a = theme.accent2;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const phi = 1.618033988749;
  for(let t=0;t<6*PI;t+=0.05){
    const r = radius * 0.01 * Math.pow(phi, t*2/PI);
    if(r > radius*2) break;
    const x = cx + Math.cos(t+rotation)*r;
    const y = cy + Math.sin(t+rotation)*r;
    if(t===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function drawPolygon(cx, cy, radius, sides, rotation, alpha){
  const a = theme.accent;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for(let i=0;i<=sides;i++){
    const angle = i*TAU/sides + rotation;
    const x = cx + Math.cos(angle)*radius;
    const y = cy + Math.sin(angle)*radius;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function drawKaleidoscope(cx, cy, radius, folds, rotation, hueOffset, alpha, parallaxY){
  // Draw kaleidoscopic petals with iridescent colour
  const a = theme.accent, a2 = theme.accent2;
  for(let i=0;i<folds;i++){
    const angle1 = i * TAU / folds + rotation;
    const angle2 = (i + 0.5) * TAU / folds + rotation;
    const hue = (hueOffset + i * (360/folds) + time*25) % 360;
    const hue2 = (hue + 50) % 360;
    const r1 = radius * (0.6 + 0.4*Math.sin(time*0.5 + i*0.8));
    const r2 = radius * (0.4 + 0.3*Math.cos(time*0.4 + i*1.1));

    // Petal glow - more vibrant
    const grad = ctx.createRadialGradient(
      cx + Math.cos(angle1)*r1*0.3, cy + Math.sin(angle1)*r1*0.3, 0,
      cx, cy, radius
    );
    grad.addColorStop(0, `hsla(${hue},90%,65%,${alpha*2.0})`);
    grad.addColorStop(0.5, `hsla(${hue2},80%,50%,${alpha*0.8})`);
    grad.addColorStop(1, `hsla(${hue},70%,30%,0)`);
    ctx.fillStyle = grad;

    // Draw petal shape
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const petalW = TAU / folds * 0.45;
    const steps = 12;
    for(let s=0;s<=steps;s++){
      const t = s/steps;
      const a = angle1 - petalW/2 + petalW * t;
      const r = radius * Math.sin(t * PI) * (0.8 + 0.2*Math.sin(time*0.5+i));
      ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fill();

    // Petal outline
    ctx.strokeStyle = `hsla(${hue},80%,65%,${alpha*0.8})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  // Centre glow
  const cGrad = ctx.createRadialGradient(cx,cy,0,cx,cy,radius*0.2);
  cGrad.addColorStop(0, `hsla(${(hueOffset+time*30)%360},60%,60%,${alpha*2})`);
  cGrad.addColorStop(1, `hsla(${(hueOffset+time*30)%360},60%,40%,0)`);
  ctx.fillStyle = cGrad;
  ctx.beginPath(); ctx.arc(cx,cy,radius*0.2,0,TAU); ctx.fill();
}

function drawStarfield(parallax){
  // Deterministic star positions based on grid cells
  const isDistant = parallax < 0.14;
  const starSpacing = isDistant ? 120 : 80;
  const scrollY = cameraY * parallax;
  const startCellY = Math.floor(scrollY / starSpacing) - 1;
  const endCellY = startCellY + Math.ceil(H / starSpacing) + 2;
  const startCellX = -1;
  const endCellX = Math.ceil(W / starSpacing) + 1;

  for(let cy = startCellY; cy <= endCellY; cy++){
    for(let cx = startCellX; cx <= endCellX; cx++){
      // Deterministic hash for this cell
      const seed = cx * 73856093 ^ cy * 19349663;
      const h1 = ((seed >>> 0) % 1000) / 1000;
      const h2 = (((seed * 83492791) >>> 0) % 1000) / 1000;
      const h3 = (((seed * 49297347) >>> 0) % 1000) / 1000;

      // Only ~40% of cells have a star (distant layer: 55%)
      if(h1 > (isDistant ? 0.55 : 0.4)) continue;

      const sx = cx * starSpacing + h2 * starSpacing;
      const sy = cy * starSpacing + h3 * starSpacing - scrollY;

      // Skip if off screen
      if(sx < -5 || sx > W+5 || sy < -5 || sy > H+5) continue;

      // Star properties from hash
      const brightness = isDistant ? (0.15 + h1 * 0.4) : (0.3 + h1 * 0.7);
      const size = isDistant ? (0.4 + h3 * 0.8) : (0.8 + h3 * 2.0);
      const twinkleSpeed = isDistant ? (0.5 + h2 * 2.0) : (1.2 + h2 * 5.0);
      const twinklePhase = h1 * TAU * 10;

      // Twinkle
      const twinkle = 0.5 + 0.5 * Math.sin(time * twinkleSpeed + twinklePhase);
      const alpha = brightness * (0.5 + 0.5 * twinkle);

      // Colour - more saturated
      const hue = (h2 * 360 + h3 * 60 + time * 8) % 360;
      const sat = 40 + h1 * 60; // More vibrant color range
      const light = 80 + twinkle * 20;

      // Draw star
      ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size * (0.6 + 0.4 * twinkle), 0, TAU);
      ctx.fill();

      // Bright stars get a subtle cross sparkle (skip for distant layer)
      if(!isDistant && brightness > 0.3 && twinkle > 0.7){
        const sparkle = (twinkle - 0.7) / 0.3 * 0.15;
        ctx.strokeStyle = `hsla(${hue},${sat}%,${light}%,${sparkle})`;
        ctx.lineWidth = 0.5;
        const len = size * 3;
        ctx.beginPath(); ctx.moveTo(sx-len, sy); ctx.lineTo(sx+len, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy-len); ctx.lineTo(sx, sy+len); ctx.stroke();
      }
    }
  }
}

// ── Ambient nebula clouds ─────────────────────────────────────────────────
// Five large soft color-cloud blobs drifting very slowly upward, drawn in
// screen space so they feel independent of the camera scroll.
const NEBULA_DEFS = [
  { xFrac:0.25, baseY:0,    parallax:0.07, radius:320, hueOffset:0,   driftSpeed:0.11 },
  { xFrac:0.75, baseY:0.6,  parallax:0.10, radius:260, hueOffset:110, driftSpeed:0.09 },
  { xFrac:0.50, baseY:1.2,  parallax:0.05, radius:370, hueOffset:230, driftSpeed:0.08 },
  { xFrac:0.15, baseY:1.8,  parallax:0.13, radius:220, hueOffset:165, driftSpeed:0.13 },
  { xFrac:0.85, baseY:0.35, parallax:0.08, radius:290, hueOffset:290, driftSpeed:0.10 },
];
function drawNebulae(){
  // Derive the theme accent hue from the RGB triple so we tint nebulae to match.
  const ar = theme.accent; const aa = Math.atan2(ar[2]-ar[1], ar[0]-ar[1]);
  const themeHue = (Math.round(aa * (180/Math.PI)) + 360) % 360;
  const depthHueShift = (cameraY * 0.0015) % 360;
  for(let i = 0; i < NEBULA_DEFS.length; i++){
    const nd = NEBULA_DEFS[i];
    // Vertical position: repeating screen-height bands drifting upward with parallax
    const scrolled = cameraY * nd.parallax;
    const bandH = H * 2;
    const cy = ((nd.baseY * H - scrolled % bandH) % bandH + bandH) % bandH - H * 0.1;
    // Gentle horizontal oscillation
    const cx = W * nd.xFrac + Math.sin(time * nd.driftSpeed + i * 1.3) * W * 0.09;
    const hue = (themeHue + nd.hueOffset + depthHueShift) % 360;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, nd.radius);
    grad.addColorStop(0,   `hsla(${hue},75%,55%,0.09)`);
    grad.addColorStop(0.5, `hsla(${(hue+30)%360},70%,45%,0.05)`);
    grad.addColorStop(1,   `hsla(${hue},65%,40%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, nd.radius, 0, TAU); ctx.fill();
  }
}

// ── Ambient light motes ───────────────────────────────────────────────────
// 60 tiny luminous particles drift upward while the ragdoll falls down —
// a zen duality of descent and ascent. Fully deterministic (no allocations).
const MOTE_COUNT = 60;
function drawAmbientMotes(){
  const ar = theme.accent;
  const themeHue = Math.round((Math.atan2(ar[2]-ar[1], ar[0]-ar[1]) * 180/Math.PI + 360)) % 360;
  for(let i = 0; i < MOTE_COUNT; i++){
    // Deterministic seed per mote
    const seed = i * 48271 + 1;
    const h1 = ((seed * 16807) & 0x7fffffff) / 0x7fffffff;
    const h2 = ((seed * 2147483647) & 0x7fffffff) / 0x7fffffff;
    const h3 = ((seed * 48271 + 7) & 0x7fffffff) / 0x7fffffff;
    const h4 = ((seed * 1103515245) & 0x7fffffff) / 0x7fffffff;

    // Each mote drifts upward at a unique speed; position loops seamlessly
    const speed = 8 + h4 * 18; // px per second
    const baseX = h1 * W;
    const baseY = h2 * H;
    const mx = baseX + Math.sin(time * (0.2 + h3 * 0.3) + i) * 18;
    // Upward drift — modulo H for seamless looping
    const my = ((baseY - time * speed % H) % H + H) % H;

    const size = 0.8 + h3 * 1.8;
    const alpha = 0.12 + h4 * 0.28;
    const hue = (themeHue + h2 * 160 + time * 4) % 360;

    ctx.fillStyle = `hsla(${hue},70%,80%,${alpha})`;
    ctx.beginPath(); ctx.arc(mx, my, size, 0, TAU); ctx.fill();

    // Subtle cross-sparkle on larger motes at peak alpha
    if(size > 1.8 && alpha > 0.3){
      const len = size * 2.5;
      ctx.strokeStyle = `hsla(${hue},70%,90%,${alpha * 0.4})`;
      ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(mx-len,my); ctx.lineTo(mx+len,my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx,my-len); ctx.lineTo(mx,my+len); ctx.stroke();
    }
  }
}

// Background radial gradient — rebuilt when viewport or theme-live-values change.
// During smooth transitions _bgGradThemeV is reset to -1 each frame by
// updateLiveTheme(), so the gradient rebuilds with the latest live color.
// createRadialGradient + two addColorStop calls are cheap (~1 µs), so
// per-frame rebuilds during a ~2 s transition have negligible perf cost.
let _bgGrad = null;
let _bgGradViewportV = -1;
let _bgGradThemeV = -1;
function getBgGradient(){
  if(_bgGrad && _bgGradViewportV === _viewportVersion && _bgGradThemeV === _themeVersion){
    return _bgGrad;
  }
  // Derive two very-dark tinted stops from the live bg RGB.
  // Center is slightly lighter than edge so the void glows faintly.
  const br = _liveBgRgb[0]|0, bg = _liveBgRgb[1]|0, bb = _liveBgRgb[2]|0;
  const cr = Math.min(255, br + 8)|0;
  const cg = Math.min(255, bg + 8)|0;
  const cb = Math.min(255, bb + 14)|0; // slightly cooler/bluer at centre
  _bgGrad = ctx.createRadialGradient(W/2,H/2,0, W/2,H/2,Math.max(W,H)*0.7);
  _bgGrad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
  _bgGrad.addColorStop(1, `rgb(${br},${bg},${bb})`);
  _bgGradViewportV = _viewportVersion;
  _bgGradThemeV = _themeVersion;
  return _bgGrad;
}

// ── Sacred-geometry offscreen cache ──────────────────────────────────────
// Flower of Life + Metatron + Golden Spiral + 4 polygons run hundreds of path
// ops per frame (Metatron alone draws N(N-1)/2 ≈ 171 line segments). All of
// these animate very slowly (pulse at time*0.3, spiral at time*0.1), so we
// render them to an offscreen and refresh every _SG_CACHE_EVERY frames.
// The per-refresh animation jump is <1% — imperceptible.
let _sgLayer = null;
let _sgLayerCtx = null;
let _sgLayerViewportV = -1;
let _sgLayerThemeV = -1;
let _sgLayerAge = 0;
const _SG_CACHE_EVERY = 4;

function ensureSgLayer(){
  if(_sgLayer &&
     _sgLayerViewportV === _viewportVersion &&
     _sgLayerThemeV === _themeVersion) return;
  _sgLayer = document.createElement('canvas');
  _sgLayer.width = Math.floor(W * dpr);
  _sgLayer.height = Math.floor(H * dpr);
  _sgLayerCtx = _sgLayer.getContext('2d');
  _sgLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  _sgLayerViewportV = _viewportVersion;
  _sgLayerThemeV = _themeVersion;
  _sgLayerAge = _SG_CACHE_EVERY; // force first-frame render
}

function renderSgLayer(){
  // Swap the active ctx so the existing draw* helpers can be reused.
  const saved = ctx;
  ctx = _sgLayerCtx;
  ctx.clearRect(0, 0, W, H);
  const scx = W/2, scy = H*0.5;
  const pulse = 0.7 + 0.3*Math.sin(time*0.3);
  drawFlowerOfLife(scx, scy, 120*pulse, 0.035);
  drawMetatronsCube(scx, scy, 180*pulse, 0.02);
  drawGoldenSpiral(scx, scy, 250, time*0.1, 0.03);
  for(let i=0;i<4;i++){
    drawPolygon(scx, scy, 100+i*60, 3+i, time*0.05*(i%2===0?1:-1), 0.015+i*0.004);
  }
  ctx = saved;
}

// Early-out helper: kaleidoscopes are drawn under the camera (-cameraY)
// transform, so their effective screen y is (cy - cameraY). After a few
// meters of depth they scroll past the top of the viewport; skipping them
// saves ~7 gradient allocs + ~60 path ops per call.
function kaleidoscopeVisible(cy, radius){
  const sy = cy - cameraY;
  return sy + radius*2 >= 0 && sy - radius*2 <= H;
}

function drawBackground(){
  // Gradient background — screen-space, cached gradient.
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = getBgGradient();
  ctx.fillRect(0,0,W,H);

  // Nebula clouds — screen space (behind stars)
  drawNebulae();
  // Stars — screen space
  drawStarfield(0.12); // distant tiny stars
  drawStarfield(0.15); // closer stars
  // Ambient motes drifting upward — screen space
  drawAmbientMotes();
  ctx.restore();

  // ── Parallax kaleidoscope layers (drawn under world transform, as before) ──
  // Wrapped in visibility checks — after the early fall these all scroll off
  // and become zero-cost.
  const px1 = cameraY * 0.1;
  if(kaleidoscopeVisible(H*0.5 - px1, 350))
    drawKaleidoscope(W/2, H*0.5 - px1, 350, 6, time*0.03, 0, 0.03, px1);
  if(kaleidoscopeVisible(H*0.3 - px1*0.8, 200))
    drawKaleidoscope(W*0.2, H*0.3 - px1*0.8, 200, 8, -time*0.02, 120, 0.025, px1*0.8);
  if(kaleidoscopeVisible(H*0.7 - px1*1.2, 250))
    drawKaleidoscope(W*0.8, H*0.7 - px1*1.2, 250, 5, time*0.025, 240, 0.025, px1*1.2);

  const px2 = cameraY * 0.3;
  if(kaleidoscopeVisible(H*0.4 - px2, 180))
    drawKaleidoscope(W*0.3, H*0.4 - px2, 180, 7, -time*0.04, 60, 0.04, px2);
  if(kaleidoscopeVisible(H*0.6 - px2*0.7, 220))
    drawKaleidoscope(W*0.7, H*0.6 - px2*0.7, 220, 6, time*0.035, 180, 0.035, px2*0.7);
  if(kaleidoscopeVisible(H*0.2 - px2*1.3, 160))
    drawKaleidoscope(W*0.5, H*0.2 - px2*1.3, 160, 9, -time*0.03, 300, 0.03, px2*1.3);

  const px3 = cameraY * 0.5;
  if(kaleidoscopeVisible(H*0.6 - px3, 140))
    drawKaleidoscope(W*0.15, H*0.6 - px3, 140, 5, time*0.05, 90, 0.045, px3);
  if(kaleidoscopeVisible(H*0.35 - px3*0.6, 170))
    drawKaleidoscope(W*0.85, H*0.35 - px3*0.6, 170, 8, -time*0.045, 210, 0.04, px3*0.6);

  // Subtle grid — world space
  const a = theme.accent;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},0.025)`;
  ctx.lineWidth = 0.5;
  const gridSize = 60;
  const startY = Math.floor(cameraY / gridSize) * gridSize;
  for(let x = 0; x < W; x += gridSize){
    ctx.beginPath(); ctx.moveTo(x, cameraY-10); ctx.lineTo(x, cameraY+H+10); ctx.stroke();
  }
  for(let y = startY; y < cameraY+H+gridSize; y += gridSize){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // Sacred geometry — cached offscreen (screen-space; source coords happen
  // to be camera-centered in world space, which after the -cameraY transform
  // lands at screen center, so the cache can live in screen space).
  ensureSgLayer();
  _sgLayerAge++;
  if(_sgLayerAge >= _SG_CACHE_EVERY){
    _sgLayerAge = 0;
    renderSgLayer();
  }
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.drawImage(_sgLayer, 0, 0, W, H);
  ctx.restore();
}

function drawSphere(s){
  const pulse = 1 + 0.03*Math.sin(time*2 + s.hue);
  const r = s.r * pulse;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Impact Flash Aura (Subtle)
  if(s.impactFlash > 0){
    const f = s.impactFlash;
    const grad = ctx.createRadialGradient(0,0,r, 0,0,r*(1.1 + f*0.4));
    grad.addColorStop(0, `hsla(${s.hue},80%,60%,${f*0.15})`);
    grad.addColorStop(1, `hsla(${s.hue},100%,100%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*(1.1 + f*0.4),0,TAU); ctx.fill();
    s.impactFlash -= 0.035; // smoother decay
    if(s.impactFlash < 0) s.impactFlash = 0;
  }

  // ── Rotating star sparkle ──
  // Four short light-rays rotate slowly around each sphere, like starlight
  // glinting off sacred crystal. Much lighter than concentric rings.
  {
    const auraHue = s.type === 'heart'    ? (330 + time*10 + s.hue) % 360
      : s.type === 'chakra'   ? [0,30,60,120,240,275,300][s.chakraLevel]
      : s.type === 'setback'  ? (45 + time*12 + s.hue) % 360
      : s.type === 'yinyang'  ? (200 + s.hue) % 360
      : (s.hue + time*15) % 360;
    ctx.save();
    ctx.rotate(time * 0.18 + s.hue * 0.017); // gentle rotation, unique per sphere
    const sparkR   = r * 1.3;                 // ray origin (just outside main glow)
    const sparkLen = r * 0.55;                // ray length
    ctx.lineWidth = 0.7;
    ctx.lineCap   = 'round';
    ctx.strokeStyle = `hsla(${auraHue},85%,78%,0.16)`;
    for(let si = 0; si < 4; si++){
      const sa = si * TAU / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * sparkR,             Math.sin(sa) * sparkR);
      ctx.lineTo(Math.cos(sa) * (sparkR + sparkLen), Math.sin(sa) * (sparkR + sparkLen));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  if(s.type === 'heart'){
    // Red/pink glowing heart
    const hue = (330 + time*10 + s.hue) % 360;

    // Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},90%,65%,0.35)`);
    grad.addColorStop(1, `hsla(${hue},90%,65%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.rotate(Math.sin(time + s.hue)*0.1);
    ctx.strokeStyle = `hsla(${hue},90%,70%,1.0)`;
    ctx.fillStyle = `hsla(${hue},80%,55%,0.4)`;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    const scale = r / 16;
    for(let i=0; i<=TAU; i+=0.1){
      const hx = 16*Math.pow(Math.sin(i), 3);
      const hy = -(13*Math.cos(i) - 5*Math.cos(2*i) - 2*Math.cos(3*i) - Math.cos(4*i));
      if(i===0) ctx.moveTo(hx*scale, hy*scale);
      else ctx.lineTo(hx*scale, hy*scale);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner pulse
    ctx.strokeStyle = `hsla(${hue},80%,75%,0.5)`;
    ctx.beginPath();
    const s2 = scale * (0.6 + 0.1*Math.sin(time*5));
    for(let i=0; i<=TAU; i+=0.1){
      const hx = 16*Math.pow(Math.sin(i), 3);
      const hy = -(13*Math.cos(i) - 5*Math.cos(2*i) - 2*Math.cos(3*i) - Math.cos(4*i));
      if(i===0) ctx.moveTo(hx*s2, hy*s2);
      else ctx.lineTo(hx*s2, hy*s2);
    }
    ctx.closePath();
    ctx.stroke();

  } else if (s.type === 'yinyang') {
    const hue = (time*10 + s.hue) % 360;
    ctx.rotate(time * 0.5 + s.rotation);

    // Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.6);
    grad.addColorStop(0, `hsla(${hue},95%,65%,0.3)`);
    grad.addColorStop(1, `hsla(${hue},95%,65%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.6,0,TAU); ctx.fill();

    // Yin Yang
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsla(${hue},95%,72%,1.0)`;

    // Outer circle
    ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();

    // S-curve
    ctx.beginPath();
    ctx.arc(0, -r/2, r/2, 1.5*PI, 0.5*PI, false);
    ctx.arc(0, r/2, r/2, 1.5*PI, 0.5*PI, true);
    ctx.stroke();

    // Dots
    ctx.fillStyle = `hsla(${hue},90%,70%,0.9)`;
    ctx.beginPath(); ctx.arc(0, -r/2, r*0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r/2, r*0.15, 0, TAU); ctx.stroke();

  } else if (s.type === 'chakra') {
    const colors = [0, 30, 60, 120, 240, 275, 300]; // Red, Orange, Yellow, Green, Blue, Indigo, Violet
    const petalsCount = [4, 6, 10, 12, 16, 2, 24];
    const idx = s.chakraLevel;
    const hue = colors[idx];
    ctx.rotate(time * 0.2 + s.rotation);

    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},90%,65%,0.35)`);
    grad.addColorStop(1, `hsla(${hue},90%,65%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${hue},90%,70%,1.0)`;
    ctx.fillStyle = `hsla(${hue},85%,65%,0.2)`;
    ctx.lineWidth = 1.0;

    const petals = petalsCount[idx];
    for(let i=0; i<petals; i++){
      ctx.beginPath();
      const a = i * TAU / petals;
      ctx.moveTo(0,0);
      const cpDist = r * 1.2;
      const cpAngleOffset = TAU / petals * 0.5;
      ctx.quadraticCurveTo(
        Math.cos(a - cpAngleOffset) * cpDist, Math.sin(a - cpAngleOffset) * cpDist,
        Math.cos(a) * r, Math.sin(a) * r
      );
      ctx.quadraticCurveTo(
        Math.cos(a + cpAngleOffset) * cpDist, Math.sin(a + cpAngleOffset) * cpDist,
        0, 0
      );
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(10,10,15,0.8)`;
    ctx.beginPath(); ctx.arc(0,0,r*0.5,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,r*0.5,0,TAU); ctx.stroke();

    ctx.lineWidth = 1.5;
    if(idx === 0 || idx === 2) {
       ctx.beginPath();
       for(let i=0;i<3;i++) {
         const ta = i * TAU/3 + PI/2;
         if(i===0) ctx.moveTo(Math.cos(ta)*r*0.4, Math.sin(ta)*r*0.4);
         else ctx.lineTo(Math.cos(ta)*r*0.4, Math.sin(ta)*r*0.4);
       }
       ctx.closePath(); ctx.stroke();
    } else if (idx === 3 || idx === 5) {
       for(let t=0; t<2; t++){
         ctx.beginPath();
         for(let i=0;i<3;i++) {
           const ta = i * TAU/3 + t*PI/3 + PI/2;
           if(i===0) ctx.moveTo(Math.cos(ta)*r*0.4, Math.sin(ta)*r*0.4);
           else ctx.lineTo(Math.cos(ta)*r*0.4, Math.sin(ta)*r*0.4);
         }
         ctx.closePath(); ctx.stroke();
       }
    } else if (idx === 1) {
       ctx.beginPath();
       ctx.arc(0, r*0.1, r*0.25, 0, PI);
       ctx.stroke();
    } else if (idx === 4) {
       ctx.beginPath(); ctx.arc(0,0,r*0.3,0,TAU); ctx.stroke();
    }

    ctx.fillStyle = `hsla(${hue},90%,80%,0.8)`;
    ctx.beginPath(); ctx.arc(0,0,2.5,0,TAU); ctx.fill();

  } else if (s.type === 'setback') {
    // Hexagram Mandala — two counter-rotating equilateral triangles forming the
    // Star of David / Seal of Solomon. Sacred, deliberate, inescapable.
    const hue  = (40 + time * 3 + s.hue * 0.15) % 360;  // slow amber drift
    const hue2 = (hue + 28) % 360;                        // warm split-complement
    const sr   = s.r;
    const pulse = 0.92 + 0.08 * Math.sin(time * 1.8 + s.hue);
    // Outer breathing glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,sr*2.0);
    grad.addColorStop(0,   `hsla(${hue},90%,65%,0.22)`);
    grad.addColorStop(0.5, `hsla(${hue2},80%,55%,0.08)`);
    grad.addColorStop(1,   `hsla(${hue},85%,55%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,sr*2.0,0,TAU); ctx.fill();

    // Outer inscribed circle
    ctx.strokeStyle = `hsla(${hue},75%,65%,0.25)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0,0,sr*pulse,0,TAU); ctx.stroke();

    // Counter-rotating angles for each triangle
    const a1 =  time * 0.08;           // outer triangle CW
    const a2 = -time * 0.05 + PI/3;    // inner triangle CCW (inverted)

    // Helper: equilateral triangle at radius tr, base angle angle
    const drawTri = (tr, angle, fillA, strokeA) => {
      ctx.beginPath();
      for(let i = 0; i < 3; i++){
        const a = i * TAU/3 + angle;
        if(i === 0) ctx.moveTo(Math.cos(a)*tr, Math.sin(a)*tr);
        else        ctx.lineTo(Math.cos(a)*tr, Math.sin(a)*tr);
      }
      ctx.closePath();
      ctx.fillStyle   = `hsla(${hue},80%,60%,${fillA})`;
      ctx.strokeStyle = `hsla(${hue},88%,72%,${strokeA})`;
      ctx.lineWidth   = 1.5;
      ctx.fill(); ctx.stroke();
    };

    drawTri(sr * 0.86 * pulse, a1, 0.10, 0.85);
    drawTri(sr * 0.86 * pulse, a2, 0.08, 0.65);

    // Inner radial spokes from center to hexagram vertices
    ctx.strokeStyle = `hsla(${hue2},80%,75%,0.22)`;
    ctx.lineWidth   = 0.7;
    for(let i = 0; i < 6; i++){
      const a = i * TAU/6 + a1 * 0.5;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*sr*0.86*pulse, Math.sin(a)*sr*0.86*pulse);
      ctx.stroke();
    }

    // Inner hexagon at triangle intersection radius
    const hr = sr * 0.50 * pulse;
    ctx.strokeStyle = `hsla(${hue},85%,80%,0.35)`;
    ctx.lineWidth   = 1.0;
    ctx.beginPath();
    for(let i = 0; i < 6; i++){
      const a = i * TAU/6 + a1 * 0.3;
      if(i === 0) ctx.moveTo(Math.cos(a)*hr, Math.sin(a)*hr);
      else        ctx.lineTo(Math.cos(a)*hr, Math.sin(a)*hr);
    }
    ctx.closePath(); ctx.stroke();

    // 6 pulsing vertex dots at hexagon corners
    const dotR = 2.2 + 0.8 * Math.sin(time * 2.5);
    for(let i = 0; i < 6; i++){
      const a = i * TAU/6 + a1 * 0.3;
      const dotAlpha = 0.5 + 0.4 * Math.sin(time * 2.0 + i * PI/3);
      ctx.fillStyle = `hsla(${hue},90%,85%,${dotAlpha})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a)*hr, Math.sin(a)*hr, dotR, 0, TAU);
      ctx.fill();
    }

    // Central radiant point
    const cg = ctx.createRadialGradient(0,0,0, 0,0,sr*0.18);
    cg.addColorStop(0, `hsla(${hue},95%,92%,0.75)`);
    cg.addColorStop(1, `hsla(${hue},85%,65%,0)`);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0,0,sr*0.18,0,TAU); ctx.fill();
  } else if (s.type === 'vesica') {
    const hue = (280 + time*10 + s.hue) % 360;
    ctx.rotate(s.rotation + time*0.2);
    const offset = r * 0.45;
    const sr = r * 0.7;

    // Deep Indigo/Violet Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},90%,65%,0.35)`);
    grad.addColorStop(1, `hsla(${hue},90%,65%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${hue},90%,70%,1.0)`;
    ctx.lineWidth = 1.5;

    // Two overlapping circles
    ctx.beginPath(); ctx.arc(-offset, 0, sr, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(offset, 0, sr, 0, TAU); ctx.stroke();

    // Central almond intersection fill
    ctx.fillStyle = `hsla(${hue},70%,60%,0.2)`;
    ctx.beginPath();
    ctx.arc(-offset, 0, sr, -Math.acos(offset/sr), Math.acos(offset/sr));
    ctx.arc(offset, 0, sr, PI - Math.acos(offset/sr), PI + Math.acos(offset/sr));
    ctx.fill();

    // Core dot
    ctx.fillStyle = `hsla(${hue},90%,80%,0.6)`;
    ctx.beginPath(); ctx.arc(0,0,2.5,0,TAU); ctx.fill();

  } else if(s.type === 'merkaba'){
    // Merkaba — two interlocked tetrahedra projected in 2D. The vehicle of light.
    // Upper tetrahedron CW, lower tetrahedron CCW, creating a living 3D star.
    const hue  = (55 + time * 4 + s.hue * 0.12) % 360;  // gold-electric
    const hue2 = (hue + 180) % 360;                       // deep complement
    const sr   = s.r;
    const pulse = 0.88 + 0.12 * Math.sin(time * 2.2 + s.hue);
    const spin1 =  time * 0.14;   // upper tetra spins CW
    const spin2 = -time * 0.10;   // lower tetra CCW

    // Outer electric glow
    const mgGrad = ctx.createRadialGradient(0,0,0, 0,0,sr*1.9);
    mgGrad.addColorStop(0,   `hsla(${hue},95%,70%,0.28)`);
    mgGrad.addColorStop(0.6, `hsla(${hue2},80%,55%,0.06)`);
    mgGrad.addColorStop(1,   `hsla(${hue},85%,55%,0)`);
    ctx.fillStyle = mgGrad;
    ctx.beginPath(); ctx.arc(0,0,sr*1.9,0,TAU); ctx.fill();

    // Outer ring
    ctx.strokeStyle = `hsla(${hue},80%,70%,0.30)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0,0,sr*pulse,0,TAU); ctx.stroke();

    // The two tetrahedra are drawn as equilateral triangles — upper pointing up,
    // lower pointing down — each with a 3-point star of connecting lines from
    // their vertices to the opposite triangle's centre, creating depth cues.
    const drawMerkabaTri = (tr, baseAngle, fillA, strokeA, hueOff) => {
      const verts = [];
      for(let i = 0; i < 3; i++){
        const a = i * TAU/3 + baseAngle;
        verts.push([Math.cos(a)*tr, Math.sin(a)*tr]);
      }
      ctx.beginPath();
      ctx.moveTo(verts[0][0], verts[0][1]);
      ctx.lineTo(verts[1][0], verts[1][1]);
      ctx.lineTo(verts[2][0], verts[2][1]);
      ctx.closePath();
      ctx.fillStyle   = `hsla(${(hue+hueOff)%360},85%,65%,${fillA})`;
      ctx.strokeStyle = `hsla(${(hue+hueOff)%360},90%,78%,${strokeA})`;
      ctx.lineWidth = 1.6;
      ctx.fill(); ctx.stroke();
      return verts;
    };

    const v1 = drawMerkabaTri(sr*0.82*pulse, -PI/2 + spin1,  0.12, 0.90, 0);
    const v2 = drawMerkabaTri(sr*0.82*pulse,  PI/2 + spin2,  0.09, 0.70, 160);

    // Depth lines: each vertex of T1 → centre (short spokes for 3D depth illusion)
    ctx.strokeStyle = `hsla(${hue},80%,80%,0.20)`;
    ctx.lineWidth = 0.6;
    for(const v of v1){
      ctx.beginPath(); ctx.moveTo(v[0]*0.6, v[1]*0.6); ctx.lineTo(0,0); ctx.stroke();
    }
    // Inner detail circle
    const ir = sr * 0.38 * pulse;
    ctx.strokeStyle = `hsla(${hue2},75%,70%,0.40)`;
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0,0,ir,0,TAU); ctx.stroke();

    // 6 glowing tips at tetrahedra apices (3 per layer, alternating hue)
    const tipR = 2.0 + 0.6 * Math.sin(time * 3.0);
    [...v1, ...v2].forEach((v, i) => {
      const ta = 0.45 + 0.35 * Math.sin(time * 2.5 + i * PI/3);
      ctx.fillStyle = `hsla(${i<3 ? hue : hue2},90%,85%,${ta})`;
      ctx.beginPath(); ctx.arc(v[0], v[1], tipR, 0, TAU); ctx.fill();
    });

    // Bright centre point
    const mcg = ctx.createRadialGradient(0,0,0, 0,0,sr*0.15);
    mcg.addColorStop(0, `hsla(${hue},98%,96%,0.90)`);
    mcg.addColorStop(1, `hsla(${hue},88%,70%,0)`);
    ctx.fillStyle = mcg;
    ctx.beginPath(); ctx.arc(0,0,sr*0.15,0,TAU); ctx.fill();

  } else if(s.type === 'torus'){
    // Torus — concentric rotated ellipses suggesting a spinning donut ring.
    // Deeply meditative, endlessly looping, a symbol of continuity.
    const hue  = (260 + time * 2.5 + s.hue * 0.1) % 360;  // indigo-violet
    const hue2 = (hue + 40) % 360;
    const sr   = s.r;
    const spin =  time * 0.06 + s.rotation;
    const pulse = 0.90 + 0.10 * Math.sin(time * 1.4 + s.hue);

    // Outer glow
    const tGrad = ctx.createRadialGradient(0,0,0, 0,0,sr*1.8);
    tGrad.addColorStop(0,   `hsla(${hue},85%,65%,0.24)`);
    tGrad.addColorStop(0.5, `hsla(${hue2},75%,50%,0.08)`);
    tGrad.addColorStop(1,   `hsla(${hue},80%,50%,0)`);
    ctx.fillStyle = tGrad;
    ctx.beginPath(); ctx.arc(0,0,sr*1.8,0,TAU); ctx.fill();

    // 7 concentric ellipses — each rotated evenly — create the torus illusion.
    // Closer-to-edge ones are more opaque, inner ones more transparent.
    const rings = 7;
    for(let i = 0; i < rings; i++){
      const t  = i / (rings - 1);          // 0 = innermost, 1 = outermost
      const rA = sr * (0.35 + t * 0.65) * pulse; // semi-major axis (horizontal)
      const rB = rA * (0.3 + 0.25 * Math.abs(Math.sin(t * PI))); // semi-minor
      const ang = spin + i * (PI / rings);  // even angle distribution
      const alpha = 0.12 + 0.45 * Math.sin(t * PI); // edge rings brightest
      const hueRing = (hue + i * 8) % 360;

      ctx.save();
      ctx.rotate(ang);
      ctx.strokeStyle = `hsla(${hueRing},80%,72%,${alpha})`;
      ctx.lineWidth   = 0.8 + t * 0.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, rA, rB, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Inner dot that orbits the ring (simulates a point on the torus surface)
    const orbitR = sr * 0.55 * pulse;
    const orbitA = time * 1.1 + s.rotation;
    const orbitX = Math.cos(orbitA) * orbitR;
    const orbitY = Math.sin(orbitA) * orbitR * 0.35;
    const orbitAlpha = 0.5 + 0.4 * Math.cos(orbitA); // brighter when "facing" us
    ctx.fillStyle = `hsla(${hue2},90%,85%,${orbitAlpha})`;
    ctx.beginPath(); ctx.arc(orbitX, orbitY, 2.5, 0, TAU); ctx.fill();

    // Subtle spoke lines at cardinal points
    ctx.strokeStyle = `hsla(${hue},70%,65%,0.18)`;
    ctx.lineWidth = 0.5;
    for(let i = 0; i < 4; i++){
      const a = i * TAU/4 + spin * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*sr*0.2, Math.sin(a)*sr*0.2);
      ctx.lineTo(Math.cos(a)*sr*0.85*pulse, Math.sin(a)*sr*0.85*pulse);
      ctx.stroke();
    }

    // Bright center
    const tcg = ctx.createRadialGradient(0,0,0, 0,0,sr*0.16);
    tcg.addColorStop(0, `hsla(${hue2},90%,90%,0.70)`);
    tcg.addColorStop(1, `hsla(${hue},80%,60%,0)`);
    ctx.fillStyle = tcg;
    ctx.beginPath(); ctx.arc(0,0,sr*0.16,0,TAU); ctx.fill();

  } else if(s.type === 'wave'){
    // Cyan triangle
    ctx.rotate(s.rotation);
    // Static-hue glow — cached per sphere (key: just radius)
    if(!s._glow || s._glowR !== r*1.8){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
      g.addColorStop(0, `hsla(180,90%,65%,0.35)`);
      g.addColorStop(1, `hsla(180,90%,65%,0)`);
      s._glow = g; s._glowR = r*1.8;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(180,90%,70%,1.0)`;
    ctx.fillStyle = `hsla(180,80%,55%,0.3)`,
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for(let i=0;i<3;i++){
      const a = i*TAU/3 - PI/2;
      if(i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(s.type === 'trail'){
    // Magenta diamond
    ctx.rotate(s.rotation * 1.5);
    // Static-hue glow — cached per sphere
    if(!s._glow || s._glowR !== r*1.8){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
      g.addColorStop(0, `hsla(300,90%,65%,0.35)`);
      g.addColorStop(1, `hsla(300,90%,65%,0)`);
      s._glow = g; s._glowR = r*1.8;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(300,90%,70%,1.0)`;
    ctx.fillStyle = `hsla(300,80%,55%,0.3)`,
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0,-r); ctx.lineTo(r*0.7,0); ctx.lineTo(0,r); ctx.lineTo(-r*0.7,0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(s.type === 'pulse'){
    // Gold star
    ctx.rotate(s.rotation * 2);
    // Static-hue glow — cached per sphere
    if(!s._glow || s._glowR !== r*1.8){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
      g.addColorStop(0, `hsla(45,95%,65%,0.35)`);
      g.addColorStop(1, `hsla(45,95%,65%,0)`);
      s._glow = g; s._glowR = r*1.8;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(45,95%,65%,1.0)`;
    ctx.fillStyle = `hsla(45,85%,55%,0.3)`,
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const pts = 5;
    for(let i=0;i<=pts*2;i++){
      const a = i*TAU/(pts*2) - PI/2;
      const d = (i%2===0) ? r : r*0.45;
      if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
      else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(s.type === 'magnet'){
    // Electric blue horseshoe magnet shape
    ctx.rotate(s.rotation);
    const hue = (220 + time * 20) % 360;
    // Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},90%,65%,0.2)`);
    grad.addColorStop(1, `hsla(${hue},90%,65%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    // U-shape
    ctx.strokeStyle = `hsla(${hue},90%,65%,0.9)`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, PI);
    ctx.stroke();
    // Pole lines
    ctx.beginPath(); ctx.moveTo(-r*0.7, 0); ctx.lineTo(-r*0.7, -r*0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r*0.7, 0); ctx.lineTo(r*0.7, -r*0.6); ctx.stroke();
    // Field lines
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `hsla(${hue},80%,70%,0.4)`;
    for(let i = -1; i <= 1; i++){
      const offset = i * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(-r*0.7, -r*0.3 + offset);
      ctx.quadraticCurveTo(0, -r*1.1 + offset, r*0.7, -r*0.3 + offset);
      ctx.stroke();
    }

  } else if(s.type === 'aura'){
    // Aura — iridescent crown of light. Collect to surround Emy in a glowing halo.
    const hue  = (time * 40 + s.hue) % 360;  // slowly cycling rainbow
    const hue2 = (hue + 120) % 360;
    const hue3 = (hue + 240) % 360;
    ctx.rotate(s.rotation + time * 0.1);
    // Outer soft glow
    if(!s._glow || s._glowR !== r*1.8 || s._glowThemeV !== _themeVersion){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
      g.addColorStop(0,   `hsla(${hue},85%,70%,0.35)`);
      g.addColorStop(0.5, `hsla(${hue2},75%,60%,0.12)`);
      g.addColorStop(1,   `hsla(${hue3},70%,55%,0)`);
      s._glow = g; s._glowR = r*1.8; s._glowThemeV = _themeVersion;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    // Three concentric rings of different sizes, each with a slightly different
    // hue, forming an iridescent crown shape
    const rings = [
      { rf: 0.90, hw: 1.6, hue: hue,  alpha: 0.85, phase: 0 },
      { rf: 0.68, hw: 1.2, hue: hue2, alpha: 0.65, phase: PI/3 },
      { rf: 0.48, hw: 0.8, hue: hue3, alpha: 0.50, phase: PI/6 },
    ];
    rings.forEach(rg => {
      const rr   = r * rg.rf * (0.92 + 0.08 * Math.sin(time * 2.2 + rg.phase + s.hue));
      // Thick soft outer ring
      ctx.strokeStyle = `hsla(${rg.hue},85%,68%,${rg.alpha * 0.25})`;
      ctx.lineWidth   = rg.hw * 4.5;
      ctx.beginPath(); ctx.arc(0,0,rr,0,TAU); ctx.stroke();
      // Bright thin inner ring
      ctx.strokeStyle = `hsla(${rg.hue},90%,82%,${rg.alpha})`;
      ctx.lineWidth   = rg.hw;
      ctx.beginPath(); ctx.arc(0,0,rr,0,TAU); ctx.stroke();
    });

    // 8 radial sparkle rays slowly rotating
    ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    for(let i = 0; i < 8; i++){
      const a = i * TAU/8 + time * 0.35;
      const ra = 0.25 + 0.20 * Math.sin(time * 3 + i * 0.8);
      ctx.strokeStyle = `hsla(${(hue + i*45)%360},90%,80%,${ra})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.42, Math.sin(a)*r*0.42);
      ctx.lineTo(Math.cos(a)*r*0.98, Math.sin(a)*r*0.98);
      ctx.stroke();
    }

    // Centre glow
    const acg = ctx.createRadialGradient(0,0,0, 0,0,r*0.20);
    acg.addColorStop(0, `hsla(${hue},95%,95%,0.85)`);
    acg.addColorStop(1, `hsla(${hue},85%,70%,0)`);
    ctx.fillStyle = acg;
    ctx.beginPath(); ctx.arc(0,0,r*0.20,0,TAU); ctx.fill();

  } else if(s.type === 'nova'){
    // Nova — a starburst of pure light. Collect to radiate rays of brilliance.
    const hue  = (200 + time * 5 + s.hue * 0.12) % 360;  // cyan-to-white
    const hue2 = (hue + 60) % 360;
    ctx.rotate(s.rotation + time * 0.12);
    // Outer radial glow
    if(!s._glow || s._glowR !== r*1.8 || s._glowThemeV !== _themeVersion){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
      g.addColorStop(0,   `hsla(${hue},80%,75%,0.40)`);
      g.addColorStop(0.4, `hsla(${hue2},70%,60%,0.12)`);
      g.addColorStop(1,   `hsla(${hue},65%,55%,0)`);
      s._glow = g; s._glowR = r*1.8; s._glowThemeV = _themeVersion;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    // 8 long primary rays + 8 short secondary rays
    const rayCount = 8;
    ctx.lineCap = 'round';
    for(let i = 0; i < rayCount; i++){
      const a = i * TAU/rayCount;
      const pulse = 0.80 + 0.20 * Math.sin(time * 2.8 + i * 0.7);
      const ra = 0.70 + 0.25 * Math.sin(time * 2.0 + i);
      // Soft thick outer ray
      ctx.strokeStyle = `hsla(${(hue+i*20)%360},85%,72%,${ra * 0.20})`;
      ctx.lineWidth   = 3.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.22, Math.sin(a)*r*0.22);
      ctx.lineTo(Math.cos(a)*r*pulse, Math.sin(a)*r*pulse);
      ctx.stroke();
      // Bright thin inner ray
      ctx.strokeStyle = `hsla(${(hue+i*20)%360},90%,88%,${ra * 0.85})`;
      ctx.lineWidth   = 0.9;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.18, Math.sin(a)*r*0.18);
      ctx.lineTo(Math.cos(a)*r*pulse, Math.sin(a)*r*pulse);
      ctx.stroke();
    }
    // Short secondary rays between primaries
    ctx.lineWidth = 0.5; ctx.lineCap = 'round';
    for(let i = 0; i < rayCount; i++){
      const a = (i + 0.5) * TAU/rayCount;
      const ra2 = 0.4 + 0.2 * Math.sin(time * 3.5 + i);
      ctx.strokeStyle = `hsla(${(hue2+i*30)%360},80%,80%,${ra2 * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.22, Math.sin(a)*r*0.22);
      ctx.lineTo(Math.cos(a)*r*0.60, Math.sin(a)*r*0.60);
      ctx.stroke();
    }
    // Core star burst
    const ncg = ctx.createRadialGradient(0,0,0, 0,0,r*0.22);
    ncg.addColorStop(0, `hsla(${hue},100%,98%,0.95)`);
    ncg.addColorStop(0.5, `hsla(${hue},90%,80%,0.45)`);
    ncg.addColorStop(1,   `hsla(${hue},80%,65%,0)`);
    ctx.fillStyle = ncg;
    ctx.beginPath(); ctx.arc(0,0,r*0.22,0,TAU); ctx.fill();

  } else if(s.type === 'challenge'){
    const v = s.challengeVariant || 0;
    const hue = (s.hue + time*30) % 360;
    const hue2 = (hue + 160) % 360;
    ctx.rotate(s.rotation);

    // Menacing outer glow
    const grad = ctx.createRadialGradient(0,0,r*0.1, 0,0,r*2);
    grad.addColorStop(0, `hsla(${hue},90%,50%,0.18)`);
    grad.addColorStop(0.5, `hsla(${hue2},80%,35%,0.06)`);
    grad.addColorStop(1, `hsla(${hue},80%,40%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*2,0,TAU); ctx.fill();

    // Aggressive pulse
    const pulse = 1 + Math.sin(time * 4) * 0.08 + Math.sin(time * 7) * 0.03;

    if(v === 0){
      // Serrated star - 11 jagged spikes
      const spikes = 11;
      ctx.strokeStyle = `hsla(${hue},85%,60%,0.9)`;
      ctx.fillStyle = `hsla(${hue},50%,8%,0.92)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for(let i=0; i<=spikes*2; i++){
        const a = i * TAU / (spikes*2);
        const base = (i%2 === 0) ? r : r * 0.38;
        const wobble = (i%2 === 0) ? Math.sin(time*6 + i*2) * r*0.08 : 0;
        const d = (base + wobble) * pulse;
        if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
        else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if(v === 1){
      // Barbed wire ring - irregular inward/outward thorns
      const n = 16;
      ctx.strokeStyle = `hsla(${hue},90%,55%,0.85)`;
      ctx.fillStyle = `hsla(${hue},55%,6%,0.9)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for(let i=0; i<=n; i++){
        const a = i * TAU / n;
        const seed = Math.sin(i*7.3) * 0.5 + 0.5;
        const d = r * (0.45 + seed * 0.55 + Math.sin(time*5 + i*3) * 0.06) * pulse;
        if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
        else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if(v === 2){
      // Triple rotating spike layers
      for(let layer=0; layer<3; layer++){
        const spikes = 5 + layer * 2;
        const layerR = r * (0.5 + layer * 0.28);
        const layerHue = (hue + layer * 50) % 360;
        const layerPulse = 1 + Math.sin(time * (4 + layer) + layer*2) * 0.1;
        ctx.strokeStyle = `hsla(${layerHue},85%,${55 + layer*5}%,${0.8 - layer*0.15})`;
        ctx.fillStyle = layer === 0 ? `hsla(${hue},50%,8%,0.9)` : 'transparent';
        ctx.lineWidth = 1.5 - layer*0.3;
        ctx.beginPath();
        for(let i=0; i<=spikes*2; i++){
          const a = i * TAU / (spikes*2) + layer * 0.15;
          const d = (i%2===0 ? layerR : layerR*0.35) * layerPulse * pulse;
          if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
          else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if(v === 3){
      // Shattered crystal - sharp irregular polygon with inner fracture
      const n = 8;
      ctx.strokeStyle = `hsla(${hue},85%,60%,0.9)`;
      ctx.fillStyle = `hsla(${hue},45%,7%,0.92)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for(let i=0; i<=n; i++){
        const a = i * TAU / n;
        const wobble = Math.sin(i*5.7 + time*3) * r * 0.15;
        const d = (r + wobble) * pulse;
        if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
        else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Inner fracture lines
      ctx.strokeStyle = `hsla(${hue2},80%,55%,0.35)`;
      ctx.lineWidth = 0.8;
      for(let i=0; i<3; i++){
        const a1 = (i/3 + 0.1) * TAU;
        const a2 = a1 + 1.8 + Math.sin(time*2 + i) * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1)*r*0.15, Math.sin(a1)*r*0.15);
        ctx.lineTo(Math.cos(a2)*r*0.85, Math.sin(a2)*r*0.85);
        ctx.stroke();
      }
    } else {
      // Pulsating void mouth - concentric spiky rings shrinking inward
      for(let ring=0; ring<3; ring++){
        const ringR = r * (1.1 - ring*0.3);
        const ringHue = (hue + ring*60) % 360;
        const ringPulse = 1 + Math.sin(time*5 + ring*1.5) * 0.12;
        const spikes = 7 + ring*2;
        ctx.strokeStyle = `hsla(${ringHue},90%,${60 + ring*5}%,${0.7 - ring*0.15})`;
        ctx.fillStyle = ring===0 ? `hsla(${hue},60%,5%,0.9)` : 'transparent';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for(let i=0; i<=spikes*2; i++){
          const a = i * TAU / (spikes*2) - ring*0.1;
          const d = (i%2===0 ? ringR : ringR*0.4) * ringPulse * pulse;
          if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
          else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // Threatening inner core glow
    const ig = ctx.createRadialGradient(0,0,0, 0,0,r*0.5);
    ig.addColorStop(0, `hsla(${hue2},100%,70%,0.15)`);
    ig.addColorStop(0.5, `hsla(${hue},80%,40%,0.05)`);
    ig.addColorStop(1, `hsla(${hue},80%,40%,0)`);
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.arc(0,0,r*0.5,0,TAU); ctx.fill();

    // Outer warning halo
    const haloPulse = 0.5 + Math.sin(time * 3) * 0.5;
    ctx.strokeStyle = `hsla(${hue},70%,55%,${0.12 + haloPulse * 0.1})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,r*1.2,0,TAU); ctx.stroke();
    ctx.strokeStyle = `hsla(${hue2},60%,50%,${0.05 + haloPulse * 0.04})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0,0,r*1.5,0,TAU); ctx.stroke();

  } else {
    // Normal sacred geometry sphere — outer glow cached per sphere,
    // invalidated when theme changes (accent2 shifts).
    const a2 = theme.accent2;
    if(!s._glow || s._glowR !== r*1.5 || s._glowThemeV !== _themeVersion){
      const g = ctx.createRadialGradient(0,0,0, 0,0,r*1.5);
      g.addColorStop(0, `rgba(${a2[0]},${a2[1]},${a2[2]},0.18)`);
      g.addColorStop(1, `rgba(${a2[0]},${a2[1]},${a2[2]},0)`);
      s._glow = g; s._glowR = r*1.5; s._glowThemeV = _themeVersion;
    }
    ctx.fillStyle = s._glow;
    ctx.beginPath(); ctx.arc(0,0,r*1.5,0,TAU); ctx.fill();

    const hue = (s.hue + time*15) % 360;
    ctx.rotate(s.rotation);

    if(s.sacredType === 0){
      // Polygon with internal lines
      ctx.strokeStyle = `hsla(${hue},75%,65%,0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0;i<=s.segments;i++){
        const angle = i*TAU/s.segments;
        const px = Math.cos(angle)*r, py = Math.sin(angle)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();

      ctx.strokeStyle = `hsla(${hue},65%,55%,0.3)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for(let i=0;i<=s.segments;i++){
        const angle = i*TAU/s.segments + PI/s.segments;
        const px = Math.cos(angle)*r*0.5, py = Math.sin(angle)*r*0.5;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();

      if(s.segments >= 5){
        ctx.strokeStyle = `hsla(${hue},55%,50%,0.2)`;
        ctx.beginPath();
        for(let i=0;i<s.segments;i++){
          const a1 = i*TAU/s.segments;
          const a2 = ((i+Math.floor(s.segments/2))%s.segments)*TAU/s.segments;
          ctx.moveTo(Math.cos(a1)*r, Math.sin(a1)*r);
          ctx.lineTo(Math.cos(a2)*r, Math.sin(a2)*r);
        }
        ctx.stroke();
      }
    }
    else if(s.sacredType === 1){
      // Seed of Life
      ctx.strokeStyle = `hsla(${hue},75%,65%,0.55)`;
      ctx.lineWidth = 1;
      const sr = r * 0.5; // sub radius
      ctx.beginPath(); ctx.arc(0,0,sr,0,TAU); ctx.stroke();
      for(let i=0;i<6;i++){
        ctx.beginPath();
        ctx.arc(Math.cos(i*PI/3)*sr, Math.sin(i*PI/3)*sr, sr, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${hue},75%,60%,0.35)`;
      ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();
    }
    else if(s.sacredType === 2){
      // Simplified Metatron / Cube
      ctx.strokeStyle = `hsla(${hue},75%,65%,0.5)`;
      ctx.lineWidth = 1;
      const pts = [];
      const mR = r * 0.8;
      for(let i=0;i<6;i++){
        pts.push([Math.cos(i*PI/3)*mR, Math.sin(i*PI/3)*mR]);
      }
      pts.push([0,0]);
      ctx.beginPath();
      for(let i=0;i<pts.length-1;i++){
        for(let j=i+1;j<pts.length;j++){
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[j][0], pts[j][1]);
        }
      }
      ctx.stroke();

      ctx.fillStyle = `hsla(${hue},70%,60%,0.35)`;
      for(const pt of pts){
        ctx.beginPath(); ctx.arc(pt[0], pt[1], r*0.15, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(pt[0], pt[1], r*0.15, 0, TAU); ctx.stroke();
      }
    }

    // Inner circle
    ctx.strokeStyle = `hsla(${hue},65%,55%,0.35)`;
    ctx.beginPath(); ctx.arc(0,0,r*0.35,0,TAU); ctx.stroke();

    // Center dot
    ctx.fillStyle = `hsla(${hue},75%,65%,0.55)`;
    ctx.beginPath(); ctx.arc(0,0,2,0,TAU); ctx.fill();
  }

  ctx.restore();
}

function roundRect(c, x, y, w, h, r){
  r = Math.min(r, h/2, w/2);
  c.beginPath(); c.moveTo(x+r, y);
  c.lineTo(x+w-r, y); c.quadraticCurveTo(x+w, y, x+w, y+r);
  c.lineTo(x+w, y+h-r); c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h); c.quadraticCurveTo(x, y+h, x, y+h-r);
  c.lineTo(x, y+r); c.quadraticCurveTo(x, y, x+r, y);
  c.closePath();
}

function drawRagdoll(ragdoll){
  const ps = ragdoll.particles;
  const a = ragdoll.accent;
  const a2 = ragdoll.accent2;

  // ── Comet head trail ──
  const head0 = ps[0];
  ragdoll.headTrail.push({ x: head0.x, y: head0.y });
  if(ragdoll.headTrail.length > ragdoll.trailMaxLen) ragdoll.headTrail.shift();
  if(ragdoll.headTrail.length >= 3){
    const tlen = ragdoll.headTrail.length;
    for(let ti = 1; ti < tlen; ti++){
      const t = ti / tlen; // 0 (oldest) → 1 (newest)
      const prev = ragdoll.headTrail[ti - 1];
      const curr = ragdoll.headTrail[ti];
      const trailAlpha = t * t * 0.45; // quadratic fade — near-invisible at tail
      const trailWidth = 0.5 + t * 2.5;
      // Hue shifts along the trail for an iridescent ribbon feel
      const trailHue = (ragdoll.hue + 40 + t * 60 + time * 15) % 360;
      ctx.strokeStyle = `hsla(${trailHue},90%,75%,${trailAlpha})`;
      ctx.lineWidth = trailWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // Glow on joints
  for(const p of ps){
    const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,12);
    grad.addColorStop(0, `rgba(${a[0]},${a[1]},${a[2]},0.15)`);
    grad.addColorStop(1, `rgba(${a[0]},${a[1]},${a[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x,p.y,12,0,TAU); ctx.fill();
  }

  // Limbs
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},0.6)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for(const c of ragdoll.constraints){
    ctx.beginPath();
    ctx.moveTo(c.a.x, c.a.y);
    ctx.lineTo(c.b.x, c.b.y);
    ctx.stroke();
  }

  // Limb glow
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},0.12)`;
  ctx.lineWidth = 6;
  for(const c of ragdoll.constraints){
    ctx.beginPath();
    ctx.moveTo(c.a.x, c.a.y);
    ctx.lineTo(c.b.x, c.b.y);
    ctx.stroke();
  }

  // Joints
  for(let i=0;i<ps.length;i++){
    const p = ps[i];
    const isHead = i===0;
    const r = isHead ? 6 : 2.5;
    const col = isHead ? a2 : a;
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.8)`;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.fill();

    if(isHead){
      // Head glow
      const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,20);
      grad.addColorStop(0, `rgba(${a2[0]},${a2[1]},${a2[2]},0.2)`);
      grad.addColorStop(1, `rgba(${a2[0]},${a2[1]},${a2[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x,p.y,20,0,TAU); ctx.fill();

      // Third eye dot
      ctx.fillStyle = `rgba(255,255,255,0.5)`;
      ctx.beginPath(); ctx.arc(p.x, p.y-2, 1.2, 0, TAU); ctx.fill();
    }
  }

  // Trail particles from hands/feet
  const trailPoints = [ps[6], ps[7], ps[12], ps[13]]; // hands + feet
  for(const p of trailPoints){
    const vx = p.x - p.ox, vy = p.y - p.oy;
    const speed = Math.sqrt(vx*vx+vy*vy);
    if(speed > 2){
      ctx.fillStyle = `rgba(${a2[0]},${a2[1]},${a2[2]},${Math.min(speed*0.02, 0.3)})`;
      for(let i=0;i<3;i++){
        const ox = (Math.random()-0.5)*8;
        const oy = (Math.random()-0.5)*8;
        ctx.beginPath();
        ctx.arc(p.x+ox-vx*0.5, p.y+oy-vy*0.5, 1+Math.random()*2, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Name tag
  const head = ps[0];
  ctx.fillStyle = `rgba(${a2[0]},${a2[1]},${a2[2]},0.4)`;
  ctx.font = '200 0.5rem monospace';
  ctx.textAlign = 'center';
  ctx.fillText(ragdoll.name, head.x, head.y - 25);
}

// ── Camera follows ragdoll + spawn spheres ahead ──────────────────────
// Shape density: no shapes before SHAPE_RAMP_START_M (25 m). Density then
// ramps from one shape per SHAPE_SPACING_MAX (800 px) to one per
// SHAPE_SPACING_MIN (120 px) by SHAPE_RAMP_END_M (100 m) and beyond.
// Shared between updateCamera() and recycleObjects() so the two call sites
// cannot drift out of sync.
function maybeSpawnNextShape(aheadY){
  const depthM = Math.max(0, cameraY / 100);
  if(depthM < CONFIG.SHAPE_RAMP_START_M || aheadY <= nextShapeY) return;
  const ramp = clamp(
    (depthM - CONFIG.SHAPE_RAMP_START_M) /
      (CONFIG.SHAPE_RAMP_END_M - CONFIG.SHAPE_RAMP_START_M),
    0, 1
  );
  const interval = lerp(CONFIG.SHAPE_SPACING_MAX, CONFIG.SHAPE_SPACING_MIN, ramp);
  nextShapeY = aheadY + interval * (0.7 + Math.random() * 0.6);
  spawnSphereAtDepth(nextShapeY);
}

// Breath ring spawn — independent of sphere spawning so pacing is predictable.
function maybeSpawnBreathRing(aheadY){
  const depthM = Math.max(0, cameraY / 100);
  if(depthM < CONFIG.BREATH_SPAWN_START_M || aheadY <= nextBreathY) return;
  breathRings.push({
    x: 80 + Math.random() * (W - 160),
    y: nextBreathY,
    phase: Math.random() * TAU,
    baseR: CONFIG.BREATH_BASE_R + Math.random() * 20,
    triggered: false,
    triggerFade: 0,
  });
  nextBreathY += CONFIG.BREATH_SPACING_WORLD * (0.85 + Math.random() * 0.4);
}

// ── Braided Ragdolls: formation + solving + compaction ───────────────────
// Hand particle indices inside Ragdoll.particles (see class constructor):
//   6 = lHand, 7 = rHand
const BRAID_HAND_IDX = [6, 7];

function alreadyBraided(a, b){
  for(const br of braids){
    if((br.pa === a && br.pb === b) || (br.pa === b && br.pb === a)) return true;
  }
  return false;
}

// Called once per frame (not per substep) — formation is a discrete event.
function updateBraids(dt){
  // Form new braids when unconnected hands of different ragdolls get close.
  for(let i = 0; i < ragdolls.length; i++){
    for(let j = i + 1; j < ragdolls.length; j++){
      const ra = ragdolls[i], rb = ragdolls[j];
      for(const ai of BRAID_HAND_IDX){
        const ha = ra.particles[ai];
        if(!ha) continue;
        for(const bi of BRAID_HAND_IDX){
          const hb = rb.particles[bi];
          if(!hb || alreadyBraided(ha, hb)) continue;
          const dx = hb.x - ha.x, dy = hb.y - ha.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if(d < CONFIG.BRAID_RANGE){
            braids.push({
              pa: ha, pb: hb,
              dist: Math.max(d, 18),
              life: CONFIG.BRAID_LIFE,
              maxLife: CONFIG.BRAID_LIFE,
            });
          }
        }
      }
    }
  }
  // Decay + drop broken/expired braids in-place.
  let w = 0;
  for(let i = 0; i < braids.length; i++){
    const b = braids[i];
    b.life -= dt;
    const dx = b.pb.x - b.pa.x, dy = b.pb.y - b.pa.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if(b.life > 0 && d < b.dist * CONFIG.BRAID_BREAK_MULT){
      if(w !== i) braids[w] = b;
      w++;
    }
  }
  braids.length = w;
}

// Called inside the physics substep, after each Ragdoll.update(). Gentle
// stiffness that additionally tapers as the braid ages.
function solveBraids(){
  for(const b of braids){
    const pa = b.pa, pb = b.pb;
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.sqrt(dx*dx + dy*dy) || 0.001;
    const ageFactor = clamp(b.life / b.maxLife, 0, 1);
    const diff = clamp(
      (d - b.dist) / d * CONFIG.BRAID_STIFFNESS * ageFactor,
      -1, 1
    );
    const mx = dx * diff * 0.5, my = dy * diff * 0.5;
    if(!pa.pinned){ pa.x += mx; pa.y += my; }
    if(!pb.pinned){ pb.x -= mx; pb.y -= my; }
  }
}

// ── Breath Rings: update + trigger detection + compaction ────────────────
function updateBreathRings(dt){
  const head = ragdolls.length > 0 ? ragdolls[0].particles[0] : null;
  let w = 0;
  for(let i = 0; i < breathRings.length; i++){
    const br = breathRings[i];
    br.phase += dt * 0.9;
    // Cull if far behind camera.
    if(br.y < cameraY - 400) continue;
    // Trigger detection (once): head must be inside the current pulse radius
    // AND the pulse must be near its peak.
    if(!br.triggered && head){
      const dx = head.x - br.x, dy = head.y - br.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      const pulse = Math.abs(Math.sin(br.phase));
      const currentR = br.baseR * (0.55 + pulse * 0.65);
      if(d < currentR && pulse > 0.82){
        br.triggered = true;
        br.triggerFade = 1.0;
        triggerBreath(br);
      }
    }
    if(br.triggered){
      br.triggerFade -= dt * 0.6;
      if(br.triggerFade <= 0) continue;
    }
    if(w !== i) breathRings[w] = br;
    w++;
  }
  breathRings.length = w;
}

function triggerBreath(br){
  breathSlowMo = CONFIG.BREATH_SLOWMO_S;
  playChordBloom(0.55); // gentler bloom; perfect-chord bloom uses higher gain
  // Soft sparkle burst at the ring centre. Hue cycles slowly with game time
  // so successive rings read as a progression rather than a flat tone.
  spawnImpactParticles(br.x, br.y, (time * 30 + themeIdx * 60) % 360, 5);
}

// ── Perfect Chord Bloom: record a hit + maybe fire ───────────────────────
// The first five slots of the `pentatonic` array are the five unique pitch
// classes (C D E G A). Anything beyond index 4 wraps back via (noteIdx % 5).
function recordHarmonyHit(noteIdx, xPos, yWorld){
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  harmonyNotes[noteIdx % 5] = now;
  if(chordBloomCooldown > 0) return;
  // All five inside the window?
  for(let i = 0; i < 5; i++){
    if(now - harmonyNotes[i] > CONFIG.CHORD_WINDOW_S) return;
  }
  chordBloomCooldown = CONFIG.CHORD_COOLDOWN_S;
  chordBloomFlash = 1.0;
  playChordBloom(1.0);
  // Visual burst at the last impact point
  spawnImpactParticles(xPos, yWorld, (noteIdx * 72) % 360, 8);
}

// Soft resolving major chord — used by both breath rings and chord bloom.
function playChordBloom(gain){
  if(isMuted || !audioCtx) return;
  if(activeOscCount >= CONFIG.MAX_CONCURRENT_OSC) return;
  const now = audioCtx.currentTime;
  const root = 165; // same E3 base as impact sounds
  const freqs = [root, root * 1.2599, root * 1.4983, root * 2]; // root, maj3, 5, oct
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(Math.min(gain, 1) * 0.16, now + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
  g.connect(masterGain);
  if(delayNode) g.connect(delayNode);
  for(const f of freqs){
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 3.3);
  }
}

// ── Stereo Flanger Activation ──────────────────────────────────────────────
// Fades in the two wet delay lines over `duration` seconds, creating a
// sweeping stereo flanger wash over the existing sounds. Feedback is ramped
// to zero at the end to prevent the delay buffers from accumulating.
function activateFlanger(duration){
  if(!flangerWetL || isMuted || !audioCtx) return;
  const now  = audioCtx.currentTime;
  const peak = 0.42;  // wet level at full effect
  const fb   = 0.62;  // feedback resonance
  const fadeIn  = 0.7;
  const fadeOut = 1.4;

  [flangerWetL, flangerWetR].forEach(node => {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(0,    now);
    node.gain.linearRampToValueAtTime(peak, now + fadeIn);
    node.gain.setValueAtTime(peak, now + duration - fadeOut);
    node.gain.exponentialRampToValueAtTime(0.001, now + duration);
  });
  [flangerFbL, flangerFbR].forEach(node => {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(fb, now);
    node.gain.setValueAtTime(fb, now + duration - fadeOut);
    node.gain.linearRampToValueAtTime(0, now + duration);
  });
}

function updateCamera(){
  if(ragdolls.length > 0){
    // DISABLE camera follow while dragging to fix the canvas position
    if(isDragging) return;

    const head = ragdolls[0].particles[0];
    // Smoothly follow the ragdoll's head, keeping it at ~35% from top
    const targetCam = head.y - H * CONFIG.CAMERA_TARGET_RATIO;
    cameraY += (targetCam - cameraY) * CONFIG.CAMERA_FOLLOW;
  }
  // Spawn new spheres ahead of the camera
  const aheadY = cameraY + H + 200;

  // Every 100m (10000px), spawn a challenge
  if(aheadY > nextChallengeY){
    spawnSphereAtDepth(nextChallengeY, 'challenge');
    nextChallengeY += CONFIG.CHALLENGE_SPACING_WORLD;
  }

  maybeSpawnNextShape(aheadY);
}

function recycleObjects(){
  const behindY = cameraY - 300;
  // In-place compaction avoids the allocation + copy of Array#filter
  let w = 0;
  for(let i = 0; i < spheres.length; i++){
    const s = spheres[i];
    if(s.y > behindY){
      if(w !== i) spheres[w] = s;
      w++;
    }
  }
  spheres.length = w;
  // Keep spawning - density increases with depth
  maybeSpawnNextShape(cameraY + H + 100);
}

// ── Draw: Braids ─────────────────────────────────────────────────────────
function drawBraids(){
  for(const b of braids){
    const lifeT = clamp(b.life / b.maxLife, 0, 1);
    const ax = b.pa.x, ay = b.pa.y;
    const bx = b.pb.x, by = b.pb.y;
    // Midpoint dips slightly, suggesting a held thread
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5 + 6 * lifeT;
    const accent = theme.accent;
    // Soft outer glow (double stroke, no shadowBlur)
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${lifeT * 0.18})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    // Bright inner thread
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${lifeT * 0.7})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

// ── Draw: Breath Rings ───────────────────────────────────────────────────
// Vesica piscis = two overlapping circles whose centres sit on each other's
// circumferences. We render a pulsating pair sharing a horizontal axis.
function drawBreathRings(){
  for(const br of breathRings){
    const pulse = Math.abs(Math.sin(br.phase));
    const r = br.baseR * (0.55 + pulse * 0.65);
    const offset = r * 0.5; // overlap = vesica piscis
    // Triggered rings fade and expand
    let alpha = 0.35 + pulse * 0.35;
    let scale = 1;
    if(br.triggered){
      alpha = br.triggerFade * 0.7;
      scale = 1 + (1 - br.triggerFade) * 0.8;
    }
    const rScaled = r * scale;
    const offsetScaled = offset * scale;
    const accent = theme.accent2;
    // Outer soft halo (double stroke, no shadowBlur)
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha * 0.22})`;
    ctx.beginPath(); ctx.arc(br.x - offsetScaled, br.y, rScaled, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(br.x + offsetScaled, br.y, rScaled, 0, TAU); ctx.stroke();
    // Inner thin line
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha * 0.85})`;
    ctx.beginPath(); ctx.arc(br.x - offsetScaled, br.y, rScaled, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(br.x + offsetScaled, br.y, rScaled, 0, TAU); ctx.stroke();
    // Centre mark at peak pulse
    if(!br.triggered && pulse > 0.7){
      const dotA = (pulse - 0.7) / 0.3;
      ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${dotA * 0.8})`;
      ctx.beginPath(); ctx.arc(br.x, br.y, 2.5, 0, TAU); ctx.fill();
    }
  }
}

// ── Main loop ────────────────────────────────────────────────────────────
let lastTime = 0;
// Cached once; flipped to false by the 'intro-complete' listener below so the
// hot path does not pay for a document.getElementById() every frame.
let introActive = !!document.getElementById('intro-sequence');
window.addEventListener('intro-complete', () => { introActive = false; });

function frame(now){
  requestAnimationFrame(frame);
  try {
  // Guard against huge time jumps (tab switch, background)
  if(now - lastTime > 500) lastTime = now - 16;
  const rawDt = Math.min((now - lastTime)/1000, 0.033);
  lastTime = now;

  // Advance live theme interpolation (must run before any drawing)
  updateLiveTheme();

  // Detect and recover from blank canvas (context state corruption).
  // NOTE: getImageData forces a GPU→CPU readback (measurably costly). The
  // probability is kept low (~once every 8s at 60fps) so the perf hit is
  // negligible. Do NOT increase the frequency without re-measuring.
  if(Math.random() < 0.002) {
    const testPixel = ctx.getImageData(0, 0, 1, 1).data;
    if(testPixel[3] === 0 && cameraY > 100) {
      // Canvas is transparent when it shouldn't be — re-init
      console.warn('[falling-emy] canvas appears blank, re-initializing context');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Freeze physics during intro
  const effectiveTimeScale = introActive ? 0 : targetTimeScale;

  // Smoothly interpolate time scale (much faster transition but still eased)
  const ease = (effectiveTimeScale < timeScale) ? 0.45 : 0.15;
  timeScale += (effectiveTimeScale - timeScale) * ease;

  time += rawDt;
  autoSave(time);
  updateSoundHint();
  const dt = (rawDt * timeScale) / SUBSTEPS;

  // Physics substeps
  for(let s=0;s<SUBSTEPS;s++){
    for(const r of ragdolls) r.update(dt);
    // Braid constraints solve alongside ragdoll constraints each substep
    solveBraids();
    // Magnet repulsion - push spheres away from ragdoll
    if(activeEffects.magnet > 0 && ragdolls.length > 0){
      const head = ragdolls[0].particles[0];
      const repelRadius = 200;
      const repelForce = 3000;
      for(const sp of spheres){
        const dx = sp.x - head.x;
        const dy = sp.y - head.y;
        const d = Math.sqrt(dx*dx + dy*dy) || 1;
        if(d < repelRadius){
          const strength = repelForce * (1 - d / repelRadius);
          sp.x += (dx / d) * strength * dt * dt;
          sp.y += (dy / d) * strength * dt * dt;
        }
      }
      activeEffects.magnet -= dt;
    }
    // No sphere physics - they're static obstacles
    for(const r of ragdolls){
      for(const sp of spheres) collideRagdollSphere(r, sp);
    }
  }

  // Update impact particles (once per frame, not per substep)
  updateParticles(rawDt);
  updateScoreElements(rawDt);
  updateBraids(rawDt);
  // Chord bloom timers
  if(chordBloomCooldown > 0) chordBloomCooldown -= rawDt;
  if(chordBloomFlash > 0) chordBloomFlash -= rawDt * 0.8;

  // Clamp ragdoll to screen width
  for(const r of ragdolls){
    for(const p of r.particles){
      if(!isFinite(p.x) || !isFinite(p.y)){ p.x = W/2; p.y = cameraY + H/2; p.ox = p.x; p.oy = p.y; continue; }
      if(p.x < 20){ p.x = 20; p.ox = 20; }
      if(p.x > W-20){ p.x = W-20; p.ox = W-20; }
    }
  }

  updateCamera();
  recycleObjects();

  // ── Update Portal ──
  if(portal){
    if(portal.phase === 'expanding'){
      portal.progress += rawDt * 0.55;
      portal.r += rawDt * 900;
      if(portal.progress >= 1){ portal.phase = 'threshold'; portal.progress = 0; }
    } else if(portal.phase === 'threshold'){
      portal.progress += rawDt * 1.2;
      if(portal.progress >= 0.5 && !portal.colorsApplied){
        portal.colorsApplied = true;
        window.manualThemeSet = true;
        // Route through the lerp targets so the color change fades in smoothly
        const pa = portal.targetAccent, pb = portal.targetAccent2;
        _tgtAccent[0]=pa[0]; _tgtAccent[1]=pa[1]; _tgtAccent[2]=pa[2];
        _tgtAccent2[0]=pb[0]; _tgtAccent2[1]=pb[1]; _tgtAccent2[2]=pb[2];
        // bg stays at current theme's bg (portal doesn't supply a new sky color)
        _themeVersion++;
      }
      if(portal.progress >= 1){ portal.phase = 'emerging'; portal.progress = 0; }
    } else if(portal.phase === 'emerging'){
      portal.progress += rawDt * 0.8;
      if(portal.progress >= 1) portal = null;
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(0, -cameraY); // camera transform

  drawBackground();
  // Frustum-cull spheres. Use 2× sphere radius to account for glow halo —
  // draws that spill a little past the visible band. Physics still runs on
  // culled spheres (that happens elsewhere in the frame), this only affects
  // rendering cost.
  const _viewTop = cameraY - 50;
  const _viewBot = cameraY + H + 50;
  for(let si = 0; si < spheres.length; si++){
    const s = spheres[si];
    const margin = s.r * 2;
    if(s.y + margin < _viewTop || s.y - margin > _viewBot) continue;
    drawSphere(s);
  }
  for(const r of ragdolls) drawRagdoll(r);
  drawBraids();      // over ragdolls so the thread reads clearly
  // ── Active Power-Up Effects (world space) ──
  const head = ragdolls.length > 0 ? ragdolls[0].particles[0] : null;
  const headX = head ? head.x : W/2;
  const headY = head ? head.y : cameraY + H*0.35;

  // Wave effect: decrement timer, spawn rings
  if(activeEffects.wave > 0){
    activeEffects.wave -= rawDt;
    // Spawn ring every ~0.5s
    if(Math.floor(activeEffects.wave * 2) !== Math.floor((activeEffects.wave + rawDt) * 2) || activeEffects.wave + rawDt > 4){
      waveRings.push({x: headX, y: headY, radius: 5, life: 1.0});
    }
  }
  for(let i = waveRings.length-1; i >= 0; i--){
    const wr = waveRings[i];
    wr.radius += rawDt * 150;
    wr.life -= rawDt * 0.8;
    if(wr.life <= 0){ waveRings.splice(i, 1); continue; }
    // No shadowBlur - use double-stroke for cheap glow
    ctx.lineWidth = 4 * wr.life;
    ctx.strokeStyle = `hsla(200,80%,65%,${wr.life * 0.15})`;
    ctx.beginPath(); ctx.arc(wr.x, wr.y, wr.radius, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5 * wr.life;
    ctx.strokeStyle = `hsla(200,90%,80%,${wr.life * 0.55})`;
    ctx.beginPath(); ctx.arc(wr.x, wr.y, wr.radius, 0, TAU); ctx.stroke();
  }

  // Glitter trail effect: sparkling particles from ragdoll
  if(activeEffects.trail > 0){
    activeEffects.trail -= rawDt;
    const intensity = Math.min(activeEffects.trail / 1.0, 1.0); // fade in/out
    const count = Math.floor(2 + intensity * 2);
    if(particles.length < MAX_PARTICLES){
      for(let i = 0; i < count; i++){
        const angle = Math.random() * TAU;
        const speed = 15 + Math.random() * 40;
        const hue = (time * 60 + Math.random() * 120) % 360;
        particles.push({
          x: headX + (Math.random()-0.5)*10,
          y: headY + (Math.random()-0.5)*10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 15,
          life: 1.0,
          decay: 1.5 + Math.random() * 1.0,
          size: 1 + Math.random() * 2.5 * intensity,
          hue: hue,
          sat: 80 + Math.random() * 20,
          light: 70 + Math.random() * 25,
          sparkle: true,
          type: 'glitter',
        });
      }
    }
    // Draw a soft glow around head when trail is active
    const tg = ctx.createRadialGradient(headX, headY, 0, headX, headY, 35 * intensity);
    const tHue = (time * 80) % 360;
    tg.addColorStop(0, `hsla(${tHue},90%,70%,${intensity * 0.12})`);
    tg.addColorStop(1, `hsla(${tHue},90%,70%,0)`);
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(headX, headY, 35 * intensity, 0, TAU); ctx.fill();
  }

  // Pulse effect: golden ring around head (no shadowBlur - double stroke)
  if(activeEffects.pulse > 0){
    activeEffects.pulse -= rawDt;
    const pAlpha = Math.min(activeEffects.pulse / 0.5, 1.0) * 0.7;
    const pPulse = 30 + 15 * Math.sin(time * 8);
    ctx.lineWidth = 6;
    ctx.strokeStyle = `hsla(45,90%,55%,${pAlpha * 0.25})`;
    ctx.beginPath(); ctx.arc(headX, headY, pPulse, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(45,90%,70%,${pAlpha})`;
    ctx.beginPath(); ctx.arc(headX, headY, pPulse, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `hsla(45,80%,80%,${pAlpha * 0.4})`;
    ctx.beginPath(); ctx.arc(headX, headY, pPulse * 1.5, 0, TAU); ctx.stroke();
  }

  // Magnet effect: repulsion field visualization
  if(activeEffects.magnet > 0){
    const mAlpha = Math.min(activeEffects.magnet / 0.5, 1.0) * 0.5;
    const repelR = 200;
    const mHue = (220 + time * 30) % 360;
    // Field ring
    ctx.strokeStyle = `hsla(${mHue},80%,65%,${mAlpha * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(headX, headY, repelR, 0, TAU); ctx.stroke();
    // Inner pulsing ring
    const pulseR = 50 + 30 * Math.sin(time * 6);
    ctx.strokeStyle = `hsla(${mHue},90%,70%,${mAlpha * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(headX, headY, pulseR, 0, TAU); ctx.stroke();
    // Field lines radiating outward
    ctx.lineWidth = 0.6;
    for(let i = 0; i < 8; i++){
      const a = (i / 8) * TAU + time * 1.5;
      ctx.strokeStyle = `hsla(${mHue},80%,65%,${mAlpha * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(headX + Math.cos(a) * 30, headY + Math.sin(a) * 30);
      ctx.lineTo(headX + Math.cos(a) * repelR, headY + Math.sin(a) * repelR);
      ctx.stroke();
    }
  }

  // Aura effect: iridescent crown of concentric rings around the ragdoll
  if(activeEffects.aura > 0){
    activeEffects.aura -= rawDt;
    const aFade = Math.min(activeEffects.aura / 0.6, 1.0);
    const aHue  = (time * 45) % 360;
    // Draw over the ragdoll — three breathing rings at the head
    const aRadii = [22, 36, 52];
    aRadii.forEach((baseR, idx) => {
      const ar = baseR + 7 * Math.sin(time * 2.2 + idx * TAU/3);
      const ah = (aHue + idx * 120) % 360;
      // Soft outer ring
      ctx.strokeStyle = `hsla(${ah},85%,68%,${aFade * 0.18})`;
      ctx.lineWidth   = 5;
      ctx.beginPath(); ctx.arc(headX, headY, ar, 0, TAU); ctx.stroke();
      // Bright inner ring
      ctx.strokeStyle = `hsla(${ah},90%,82%,${aFade * 0.70})`;
      ctx.lineWidth   = 1.1;
      ctx.beginPath(); ctx.arc(headX, headY, ar, 0, TAU); ctx.stroke();
    });
    // 8 tiny sparkle sparks orbiting the head
    ctx.lineCap = 'round';
    for(let i = 0; i < 8; i++){
      const sa = i * TAU/8 + time * 1.2;
      const sr2 = 28 + 10 * Math.sin(time * 1.8 + i);
      const sh = (aHue + i * 45) % 360;
      const sAlpha = aFade * (0.4 + 0.3 * Math.sin(time * 3 + i));
      ctx.fillStyle = `hsla(${sh},90%,85%,${sAlpha})`;
      ctx.beginPath();
      ctx.arc(headX + Math.cos(sa)*sr2, headY + Math.sin(sa)*sr2, 1.5, 0, TAU);
      ctx.fill();
    }
  }

  // Nova effect: starburst rays radiating from ragdoll head
  if(activeEffects.nova > 0){
    activeEffects.nova -= rawDt;
    const nFade  = Math.min(activeEffects.nova / 0.5, 1.0);
    const nHue   = (200 + time * 8) % 360;
    const rayLen = 55 + 20 * Math.sin(time * 2.5);
    ctx.lineCap = 'round';
    for(let i = 0; i < 8; i++){
      const a = i * TAU/8 + time * 0.4;
      const nh = (nHue + i * 22) % 360;
      const nAlpha = nFade * (0.5 + 0.35 * Math.sin(time * 3.2 + i * 0.9));
      // Soft thick outer ray
      ctx.strokeStyle = `hsla(${nh},85%,72%,${nAlpha * 0.20})`;
      ctx.lineWidth   = 4.5;
      ctx.beginPath();
      ctx.moveTo(headX + Math.cos(a)*10, headY + Math.sin(a)*10);
      ctx.lineTo(headX + Math.cos(a)*rayLen, headY + Math.sin(a)*rayLen);
      ctx.stroke();
      // Bright thin inner ray
      ctx.strokeStyle = `hsla(${nh},92%,88%,${nAlpha * 0.85})`;
      ctx.lineWidth   = 0.9;
      ctx.beginPath();
      ctx.moveTo(headX + Math.cos(a)*8, headY + Math.sin(a)*8);
      ctx.lineTo(headX + Math.cos(a)*rayLen, headY + Math.sin(a)*rayLen);
      ctx.stroke();
    }
    // Short secondary rays between primaries
    for(let i = 0; i < 8; i++){
      const a = (i + 0.5) * TAU/8 + time * 0.4;
      const nAlpha2 = nFade * (0.3 + 0.2 * Math.sin(time * 2.8 + i));
      ctx.strokeStyle = `hsla(${(nHue+90)%360},80%,80%,${nAlpha2})`;
      ctx.lineWidth   = 0.6;
      ctx.beginPath();
      ctx.moveTo(headX + Math.cos(a)*10, headY + Math.sin(a)*10);
      ctx.lineTo(headX + Math.cos(a)*(rayLen*0.55), headY + Math.sin(a)*(rayLen*0.55));
      ctx.stroke();
    }
    // Bright core glow
    const ncg = ctx.createRadialGradient(headX, headY, 0, headX, headY, 18*nFade);
    ncg.addColorStop(0, `hsla(${nHue},100%,96%,${nFade * 0.65})`);
    ncg.addColorStop(1, `hsla(${nHue},90%,75%,0)`);
    ctx.fillStyle = ncg;
    ctx.beginPath(); ctx.arc(headX, headY, 18*nFade, 0, TAU); ctx.fill();
  }

  drawScoreElements(); // popups in world space
  drawParticles(); // collision effects in world space

  ctx.restore();

  // ── Portal Overlay (screen space) ──
  if(portal){
    const sx = portal.x;
    const sy = portal.y - cameraY;
    const pr = portal.r;
    const h = portal.hue;
    ctx.save();

    // ── EXPANDING: the portal tears open ──
    if(portal.phase === 'expanding'){
      const p = portal.progress;
      const ease = p < 0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2;

      // Smooth imploding rings
      for(let i = 0; i < 3; i++){
        const t = (1 - (i / 3 + time * 0.3) % 1);
        const tr = pr * 1.8 * t;
        const tAlpha = ease * (1 - t) * 0.35;
        const tHue = (h + t * 80) % 360;
        // Soft double-stroke glow ring
        ctx.strokeStyle = `hsla(${tHue},80%,70%,${tAlpha * 0.3})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(sx, sy, tr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `hsla(${tHue},90%,75%,${tAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(sx, sy, tr, 0, TAU); ctx.stroke();
      }

      // Soft implosion pulse
      const pulseA = ease * 0.25 * (1 - p);
      const pg = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 2);
      pg.addColorStop(0, `hsla(${h}, 100%, 60%, 0)`);
      pg.addColorStop(0.7, `hsla(${h}, 100%, 70%, ${pulseA * 0.15})`);
      pg.addColorStop(1, `hsla(${h}, 100%, 60%, 0)`);
      ctx.fillStyle = pg;
      ctx.fillRect(sx - pr * 2, sy - pr * 2, pr * 4, pr * 4);

      // Inner darkening void
      const voidAlpha = ease * 0.5;
      const vg = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 0.6);
      vg.addColorStop(0, `hsla(${(h+180)%360},60%,5%,${voidAlpha})`);
      vg.addColorStop(0.7, `hsla(${h},50%,8%,${voidAlpha * 0.3})`);
      vg.addColorStop(1, `hsla(${h},40%,5%,0)`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Soft chromatic halo (single ring, screen blend)
      ctx.globalCompositeOperation = 'screen';
      const cHue = (h + 30) % 360;
      const cR = pr * 0.95;
      const cg = ctx.createRadialGradient(sx, sy, cR * 0.85, sx, sy, cR * 1.15);
      cg.addColorStop(0, `hsla(${cHue},100%,70%,0)`);
      cg.addColorStop(0.5, `hsla(${cHue},100%,75%,${ease * 0.3})`);
      cg.addColorStop(1, `hsla(${cHue},100%,70%,0)`);
      ctx.fillStyle = cg;
      ctx.fillRect(sx - cR * 1.5, sy - cR * 1.5, cR * 3, cR * 3);
      ctx.globalCompositeOperation = 'source-over';

      // Time distortion vignette
      const vigAlpha = ease * 0.15;
      const vig = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.7);
      vig.addColorStop(0, `rgba(0,0,0,0)`);
      vig.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    // ── THRESHOLD: smooth color shift ──
    else if(portal.phase === 'threshold'){
      const p = portal.progress;
      const flash = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7);
      const flashEase = flash * flash;

      // Soft colored pulse
      ctx.fillStyle = `rgba(${portal.targetAccent[0]},${portal.targetAccent[1]},${portal.targetAccent[2]},${flashEase * 0.12})`;
      ctx.fillRect(0, 0, W, H);

      // Smooth radial glow from center
      const glowR = Math.max(W,H) * 0.6 * flashEase;
      const tg = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      tg.addColorStop(0, `rgba(${portal.targetAccent[0]},${portal.targetAccent[1]},${portal.targetAccent[2]},${flashEase * 0.08})`);
      tg.addColorStop(1, `rgba(${portal.targetAccent[0]},${portal.targetAccent[1]},${portal.targetAccent[2]},0)`);
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, W, H);

      // New dimension tint (seamlessly integrated)
      if(p > 0.4){
        const tintFade = (p - 0.4) * 1.6;
        const tg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
        tg.addColorStop(0, `rgba(${portal.targetAccent[0]},${portal.targetAccent[1]},${portal.targetAccent[2]},${tintFade * 0.12})`);
        tg.addColorStop(1, `rgba(0,0,0,${tintFade * 0.2})`);
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ── EMERGING: new dimension settles ──
    else if(portal.phase === 'emerging'){
      const p = portal.progress;
      const ease = p * p * (3 - 2 * p);

      // Gentle breathing glow from portal center
      const pulseR = ease * Math.max(W, H) * 0.8;
      const pulseA = (1 - ease) * 0.07;
      const pg = ctx.createRadialGradient(sx, sy, 0, sx, sy, pulseR);
      pg.addColorStop(0, `rgba(${portal.targetAccent2[0]},${portal.targetAccent2[1]},${portal.targetAccent2[2]},${pulseA})`);
      pg.addColorStop(1, `rgba(${portal.targetAccent2[0]},${portal.targetAccent2[1]},${portal.targetAccent2[2]},0)`);
      ctx.fillStyle = pg;
      ctx.fillRect(0, 0, W, H);

      // Fading vignette lift
      const liftA = (1 - ease) * 0.12;
      const lv = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.4, W/2, H/2, Math.max(W,H)*0.75);
      lv.addColorStop(0, `rgba(0,0,0,0)`);
      lv.addColorStop(1, `rgba(0,0,0,${liftA})`);
      ctx.fillStyle = lv;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  // ── Chord Bloom Sacred Mandala (screen space) ──────────────────────────
  // When all 5 pentatonic pitch classes hit within the window, a set of
  // expanding sacred-geometry polygon rings radiates from the screen centre.
  if(chordBloomFlash > 0){
    const cf = chordBloomFlash; // 1→0 over ~1.25s
    const expand = 1 - cf;     // 0→1 as flash fades
    // Envelope: bell curve so rings fade in AND out
    const env = cf * Math.sin(expand * PI);
    const cx = W / 2, cy = H / 2;
    // 5 rings, one per pentatonic pitch class, polygon sides 3–7
    const pentatonicHues = [0, 72, 144, 216, 288]; // evenly spaced around hue wheel
    for(let ri = 0; ri < 5; ri++){
      const sides = ri + 3; // triangle (3) through heptagon (7)
      const phase = (ri / 5) * TAU * 0.25; // stagger so rings don't overlap at start
      const radius = expand * Math.min(W, H) * (0.3 + ri * 0.12) + phase * 8;
      const hue = (pentatonicHues[ri] + time * 18) % 360;
      const alpha = env * (0.22 - ri * 0.03);
      if(alpha <= 0 || radius <= 0) continue;
      ctx.lineWidth = 3.5 - ri * 0.4;
      ctx.strokeStyle = `hsla(${hue},90%,70%,${alpha * 0.35})`;
      ctx.beginPath();
      for(let vi = 0; vi <= sides; vi++){
        const angle = vi * TAU / sides - PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if(vi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `hsla(${hue},95%,80%,${alpha})`;
      ctx.beginPath();
      for(let vi = 0; vi <= sides; vi++){
        const angle = vi * TAU / sides - PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if(vi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // Soft radial glow at centre during peak
    if(env > 0.1){
      const bloomGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      const bHue = (time * 40) % 360;
      bloomGrad.addColorStop(0, `hsla(${bHue},80%,70%,${env * 0.15})`);
      bloomGrad.addColorStop(1, `hsla(${bHue},80%,60%,0)`);
      ctx.fillStyle = bloomGrad;
      ctx.beginPath(); ctx.arc(cx, cy, 80, 0, TAU); ctx.fill();
    }
  }

  // ── Depth Meter & Sunrise Overlay ──
  const depthMeters = Math.max(0, cameraY / 100);

  // Auto-change theme every 500m
  const autoTheme = Math.floor(depthMeters / 500) % themes.length;
  if(themeIdx !== autoTheme && !window.manualThemeSet){
    setTheme(autoTheme);
  }

  // Sunrise effect (brightens over 100km / 100,000m)
  const sunrise = Math.min(depthMeters / 100000, 1.0);
  if(sunrise > 0){
    const sunGrad = ctx.createLinearGradient(0, H, 0, 0);
    sunGrad.addColorStop(0, `rgba(255, 200, 150, ${sunrise * 0.4})`);
    sunGrad.addColorStop(1, `rgba(150, 200, 255, ${sunrise * 0.1})`);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Depth HUD
  ctx.fillStyle = `rgba(255,255,255,${0.3 + sunrise * 0.5})`;
  ctx.font = '200 1rem monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${depthMeters.toFixed(1)} m`, W - 20, H - 20);

  // Score HUD (below depth meter) — no shadowBlur (expensive on mobile);
  // animated state uses a cheap 4-offset glow draw instead.
  const a3 = theme.accent2;
  const isAnim = displayScore < score;
  ctx.font = `${isAnim ? '300' : '200'} 0.8rem monospace`;
  ctx.textAlign = 'right';
  const scoreStr = displayScore.toLocaleString();
  if(isAnim){
    const glow = (0.18 + 0.12 * (0.5 + 0.5 * Math.sin(time * 12)));
    ctx.fillStyle = `rgba(${a3[0]},${a3[1]},${a3[2]},${glow})`;
    ctx.fillText(scoreStr, W - 19, H - 38);
    ctx.fillText(scoreStr, W - 21, H - 38);
    ctx.fillText(scoreStr, W - 20, H - 37);
    ctx.fillText(scoreStr, W - 20, H - 39);
  }
  ctx.fillStyle = `rgba(${a3[0]},${a3[1]},${a3[2]},${isAnim ? 0.9 : 0.35})`;
  ctx.fillText(scoreStr, W - 20, H - 38);

  // Combo next to score
  if(comboCount > 1){
    const ca = Math.max(0, 1 - (time - lastHitTime) / COMBO_WINDOW);
    ctx.fillStyle = `rgba(${a3[0]},${a3[1]},${a3[2]},${ca * 0.5})`;
    ctx.font = '600 0.55rem monospace';
    ctx.fillText(`×${Math.min(comboCount, 10)}`, W - 20, H - 52);
  }

  // ── Update Journey Panel ──
  // updateJourneyPanel defined at IIFE scope (see above)

  // ── Chapter Logic (unified) ──
  for(let ci = 0; ci < lifeChapters.length; ci++){
    const ch = lifeChapters[ci];
    const triggerDepth = ch.depth !== undefined ? ch.depth : ch.age * 1000;
    if(depthMeters >= triggerDepth && !firedChapters.has(ci)){
      if(!chapterDisplay){
        firedChapters.add(ci);
        const isMilestone = ch.label.endsWith('km') || ch.label.endsWith('m') || ch.depth !== undefined;
        chapterSlowMo = isMilestone ? 0.8 : 1.2;
        const dur = isMilestone ? 5.5 : 9.0;
        chapterDisplay = {text: ch.text, life: dur, maxLife: dur, phase: 'fadein'};
        journeyLog.push({label: ch.label, text: ch.text});
        updateJourneyPanel();
        playMilestoneChord();
        // Birth gets special golden particle burst
        if(ch.label === 'Birth'){
          for(let i = 0; i < 30; i++){
            const angle = (i / 30) * TAU;
            particles.push({
              x: W/2 + cameraY * 0 + (ragdolls[0] ? ragdolls[0].particles[0].x : W/2),
              y: (ragdolls[0] ? ragdolls[0].particles[0].y : 0),
              vx: Math.cos(angle) * (100 + Math.random()*150),
              vy: Math.sin(angle) * (100 + Math.random()*150) - 50,
              life: 2.0 + Math.random(), decay: 0.3 + Math.random()*0.2,
              size: 1.5 + Math.random()*2, hue: 40 + Math.random()*30, sparkle: false,
            });
          }
        } else if(isMilestone){
          for(let i = 0; i < 20; i++){
            particles.push({
              x: W/2, y: H/2 + cameraY,
              vx: (Math.random()-0.5)*300, vy: (Math.random()-0.5)*300,
              life: 1.5 + Math.random(), decay: 0.4 + Math.random()*0.3,
              size: 2 + Math.random()*2, hue: Math.random()*360, sparkle: false,
            });
          }
        }
      }
    }
  }
  if(chapterSlowMo > 0){
    chapterSlowMo -= rawDt;
    targetTimeScale = 0.2;
  } else if(breathSlowMo > 0){
    breathSlowMo -= rawDt;
    targetTimeScale = 0.45; // softer than chapter slow-mo
    // Reset the chapter sentinel so the restore branch below will fire
    // when breath slow-mo finishes.
    chapterSlowMo = 0;
  } else if(chapterSlowMo !== -1 && !isSlowed){
    targetTimeScale = 1.0;
    chapterSlowMo = -1;
  }
  if(chapterDisplay){
    const baseLife = chapterDisplay.maxLife;
    chapterDisplay.life -= rawDt;
    if(chapterDisplay.life > baseLife - 1.8) chapterDisplay.phase = 'fadein';
    else if(chapterDisplay.life > 1.8) chapterDisplay.phase = 'hold';
    else chapterDisplay.phase = 'fadeout';
    if(chapterDisplay.life <= 0) chapterDisplay = null;
  }

  // ── Draw Chapter Text (screen space) - speech bubble ──
  if(chapterDisplay){
    const maxLife = chapterDisplay.maxLife;
    const isShort = maxLife < 6;
    let cAlpha;
    const fadeDur = 1.8;
    if(chapterDisplay.phase === 'fadein') cAlpha = Math.max(0, Math.min((maxLife - chapterDisplay.life) / fadeDur, 1));
    else if(chapterDisplay.phase === 'hold') cAlpha = 1.0;
    else cAlpha = Math.max(0, Math.min(chapterDisplay.life / fadeDur, 1));
    cAlpha = Math.max(0, Math.min(1, cAlpha));
    const elapsed = maxLife - chapterDisplay.life;
    const words = chapterDisplay.text.split(' ');
    const isBirth = chapterDisplay.text === 'no past. so much future.';
    const a = isBirth ? [255, 200, 100] : theme.accent2;
    const borderA = isBirth ? 0.5 : 0.3;
    const fillA = isBirth ? 0.15 : 0.1;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = isBirth ? '300 1rem sans-serif' : (isShort ? '300 1rem sans-serif' : '300 0.9rem sans-serif');
    const maxLineW = Math.min(W * 0.75, 420);
    const lines = []; let line = '';
    for(const w of words){
      const test = line + w + ' ';
      if(ctx.measureText(test).width > maxLineW - 40){ lines.push(line); line = w + ' '; }
      else line = test;
    }
    lines.push(line);
    const lineH = isShort ? 22 : 24;
    const padX = 24, padY = 20;
    let maxW = 0;
    for(const l of lines) maxW = Math.max(maxW, ctx.measureText(l.trim()).width);
    const bw = maxW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = W/2, by = H * 0.18;

    // ── Animated Thought Bubble (Organic Shape) ──
    ctx.translate(bx, by);
    const wobble = Math.sin(time * 2) * 5;
    const scale = 1 + Math.sin(time * 1.5) * 0.02;
    ctx.scale(scale, scale);

    // Bubble shadows/glow
    ctx.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${cAlpha * fillA})`;
    ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${cAlpha * borderA})`;
    ctx.lineWidth = 1.5;

    // Draw organic rounded rect
    ctx.beginPath();
    const r = 25, w = bw, h = bh;
    const x = -w/2, y = -h/2;
    // Top
    ctx.moveTo(x + r, y + Math.sin(time*2)*2);
    ctx.quadraticCurveTo(bx-bx, y + Math.sin(time*2.1)*4, x + w - r, y + Math.sin(time*2.2)*2);
    // Right
    ctx.quadraticCurveTo(x + w + Math.sin(time*2.3)*3, by-by, x + w - r, y + h + Math.sin(time*2.4)*2);
    // Bottom
    ctx.quadraticCurveTo(bx-bx, y + h + Math.sin(time*2.5)*5, x + r, y + h + Math.sin(time*2.6)*2);
    // Left
    ctx.quadraticCurveTo(x + Math.sin(time*2.7)*3, by-by, x + r, y + Math.sin(time*2)*2);
    ctx.fill();
    ctx.stroke();

    // Small thought circles
    for(let i=0; i<3; i++) {
      const circleAlpha = cAlpha * (0.3 - i*0.08);
      const cr = 8 - i*2;
      const co = 15 + i*12;
      const cx = -15 - i*8;
      const cy = h/2 + co;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(time*2+i)*3, cy, cr, 0, TAU);
      ctx.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${circleAlpha})`;
      ctx.fill();
    }

    let wordIdx = 0;
    ctx.textAlign = 'left';
    const startY = -h/2 + padY + lineH / 2;
    for(let li = 0; li < lines.length; li++){
      const lineWords = lines[li].trim().split(' ');
      let lx = -maxW / 2;
      for(let wi = 0; wi < lineWords.length; wi++){
        const wordStagger = 0.12;
        const wordStart = wordIdx * wordStagger;
        const wordElapsed = Math.max(0, elapsed - wordStart);
        const wAlpha = Math.min(wordElapsed / 0.4, 1) * cAlpha;
        const bounce = wordElapsed < 0.4 ? Math.sin(wordElapsed / 0.4 * PI) * 3 : 0;
        const ww = ctx.measureText(lineWords[wi] + ' ').width;
        ctx.fillStyle = `rgba(255,255,255,${wAlpha * 0.9})`;
        ctx.fillText(lineWords[wi], lx, startY + li * lineH - bounce);
        lx += ww;
        wordIdx++;
      }
    }
    ctx.restore(); // end camera transform
  }

  // Score flies & counter in screen space
  // (flies already drawn in drawScoreElements, counter drawn there too)

  // Draw UI elements in screen space (no camera transform)
  if(isDragging && dragParticle){
    ctx.strokeStyle = `rgba(${theme.accent2[0]},${theme.accent2[1]},${theme.accent2[2]},0.15)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(touchX, touchY);
    ctx.lineTo(dragParticle.x, dragParticle.y - cameraY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Slow-mo indicator
  if(isSlowed){
    const alpha = 0.15 + 0.1 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(${theme.accent[0]},${theme.accent[1]},${theme.accent[2]},${alpha})`;
    ctx.font = '200 0.7rem sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('hold to slow', W/2, H - 30);
  }

  // Perfect-chord bloom flash — subtle full-screen halo, eases out quickly.
  if(chordBloomFlash > 0){
    const t = clamp(chordBloomFlash, 0, 1);
    const a = theme.accent2;
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, `rgba(${a[0]},${a[1]},${a[2]},${t * 0.18})`);
    grad.addColorStop(1, `rgba(${a[0]},${a[1]},${a[2]},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  } catch(e) { 
    console.error('[falling-emy] frame error:', e);
    // Reset canvas state on error to prevent corrupted transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
requestAnimationFrame(frame);

// ── Soul Name Modal ─────────────────────────────────────────────────────────

// Draws a Flower-of-Life mandala on the given canvas element.
// canvasId defaults to 'soul-mandala-canvas'.
// Returns a stop() function that cancels the RAF loop.
function _runMandala(canvasId) {
  const canvas = document.getElementById(canvasId || 'soul-mandala-canvas');
  if(!canvas) return () => {};
  const ctx2 = canvas.getContext('2d');
  let raf2, t2 = 0;
  const TAU = Math.PI * 2;

  function resize2() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize2();
  window.addEventListener('resize', resize2);

  function circ(x, y, r) { ctx2.beginPath(); ctx2.arc(x, y, r, 0, TAU); ctx2.stroke(); }
  function seg(x1, y1, x2, y2) { ctx2.beginPath(); ctx2.moveTo(x1, y1); ctx2.lineTo(x2, y2); ctx2.stroke(); }

  function tick2() {
    raf2 = requestAnimationFrame(tick2);
    t2 += 0.004;
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5, cy = H * 0.5;
    ctx2.clearRect(0, 0, W, H);

    // Slowly breathe through violet → indigo → blue
    const hue = 265 + Math.sin(t2 * 0.15) * 20;
    ctx2.strokeStyle = `hsl(${hue}, 65%, 68%)`;
    ctx2.lineWidth = 0.8;

    const breathe = 1 + 0.03 * Math.sin(t2 * 0.7);
    const R  = Math.min(W, H) * 0.12 * breathe;
    const sp  = t2 * 0.05;      // inner — clockwise
    const sp2 = -t2 * 0.032;    // outer — counter-clockwise

    // Center circle
    ctx2.globalAlpha = 0.18;
    circ(cx, cy, R);

    // Seed of Life — 6 petals, slowly rotating
    ctx2.globalAlpha = 0.13;
    for(let i = 0; i < 6; i++) {
      const a = sp + i * TAU / 6;
      circ(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R);
    }

    // Hexagram (Star of David) — two interlaced triangles inscribed in the Seed ring
    ctx2.globalAlpha = 0.10;
    for(let t = 0; t < 2; t++) {
      ctx2.beginPath();
      for(let i = 0; i < 3; i++) {
        const a = sp + t * (TAU / 6) + i * (TAU / 3);
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y);
      }
      ctx2.closePath();
      ctx2.stroke();
    }

    // Metatron long lines — 6 diameters through center connecting opposite petals
    ctx2.globalAlpha = 0.038;
    for(let i = 0; i < 6; i++) {
      const a = sp + i * TAU / 6;
      seg(cx - Math.cos(a) * R * 7.5, cy - Math.sin(a) * R * 7.5,
          cx + Math.cos(a) * R * 7.5, cy + Math.sin(a) * R * 7.5);
    }

    // Second petal ring — counter-rotating
    ctx2.globalAlpha = 0.07;
    for(let i = 0; i < 6; i++) {
      const a = sp2 + Math.PI / 6 + i * TAU / 6;
      circ(cx + Math.cos(a) * R * 1.732, cy + Math.sin(a) * R * 1.732, R);
    }

    // Concentric boundary rings
    ctx2.globalAlpha = 0.10;  circ(cx, cy, R * 2.0);
    ctx2.globalAlpha = 0.07;  circ(cx, cy, R * 3.46);
    ctx2.globalAlpha = 0.042; circ(cx, cy, R * 5.0);
    ctx2.globalAlpha = 0.025; circ(cx, cy, R * 7.2);

    // 12-fold radial spokes, very faint
    ctx2.globalAlpha = 0.035;
    for(let i = 0; i < 12; i++) {
      const a = sp * 0.35 + i * TAU / 12;
      seg(cx + Math.cos(a) * R, cy + Math.sin(a) * R,
          cx + Math.cos(a) * R * 7.5, cy + Math.sin(a) * R * 7.5);
    }
  }

  tick2();
  return function stop() {
    cancelAnimationFrame(raf2);
    window.removeEventListener('resize', resize2);
  };
}

// Shows the soul-name modal, then calls onConfirm(name) once the player commits.
// Elements materialize sequentially: prompt → input → confirm button.
function _showSoulModal(onConfirm, defaultName) {
  const modal      = document.getElementById('soul-modal');
  const prompt     = document.getElementById('soul-modal-prompt');
  const input      = document.getElementById('soul-modal-input');
  const confirmBtn = document.getElementById('soul-modal-confirm');
  if(!modal || !input || !confirmBtn) { onConfirm(defaultName || 'emy'); return; }

  // Reset any previous reveal state
  [prompt, input, confirmBtn].forEach(el => el?.classList.remove('revealed'));
  confirmBtn.textContent = 'begin your journey';
  input.value = defaultName || '';

  // Start mandala + show backdrop
  const stopMandala = _runMandala();
  modal.classList.add('visible');

  // Sequential materialization: text → input → button
  setTimeout(() => prompt?.classList.add('revealed'),    500);
  setTimeout(() => input.classList.add('revealed'),     1100);
  setTimeout(() => confirmBtn.classList.add('revealed'), 1500);

  // Live confirm label: "begin as alice"
  function onType() {
    const n = input.value.trim();
    confirmBtn.textContent = n ? `begin as ${n}` : 'begin your journey';
  }
  input.addEventListener('input', onType);

  function commit() {
    const nm = (input.value || '').trim() || 'emy';
    input.removeEventListener('input', onType);
    [prompt, input, confirmBtn].forEach(el => el?.classList.remove('revealed'));
    modal.classList.remove('visible');
    // onConfirm first so the next modal can start its own mandala before we stop ours
    setTimeout(() => { onConfirm(nm); stopMandala(); }, 560);
  }

  confirmBtn.onclick = (e) => { e.preventDefault(); commit(); };
  input.addEventListener('keydown', function onKey(ke) {
    ke.stopPropagation(); // prevent intro-sequence's window keydown from triggering birth
    if(ke.key === 'Enter' || ke.key === 'Escape') {
      ke.preventDefault();
      input.removeEventListener('keydown', onKey);
      commit();
    }
  });
}

// Shows the sound-preference modal for first-time players.
// Calls onDone() once the player makes a choice.
function _showSoundModal(onDone) {
  const modal = document.getElementById('sound-modal');
  const icon  = document.getElementById('sound-modal-icon');
  const title = document.getElementById('sound-modal-title');
  const hint  = document.getElementById('sound-modal-hint');
  const btns  = document.getElementById('sound-modal-btns');
  if(!modal) { onDone(); return; }

  [icon, title, hint, btns].forEach(el => el?.classList.remove('revealed'));

  const stopMandala = _runMandala('sound-mandala-canvas');
  modal.classList.add('visible');

  // Sequential reveal: icon+title → hint → buttons
  setTimeout(() => { icon?.classList.add('revealed'); title?.classList.add('revealed'); }, 450);
  setTimeout(() => hint?.classList.add('revealed'),  900);
  setTimeout(() => btns?.classList.add('revealed'), 1200);

  function choose(withSound) {
    window._fe.setMuted(!withSound);
    [icon, title, hint, btns].forEach(el => el?.classList.remove('revealed'));
    modal.classList.remove('visible');
    setTimeout(() => { onDone(); stopMandala(); }, 560);
  }

  const yesBtn = document.getElementById('sound-modal-yes');
  const noBtn  = document.getElementById('sound-modal-no');
  if(yesBtn) yesBtn.onclick = (e) => { e.preventDefault(); choose(true); };
  if(noBtn)  noBtn.onclick  = (e) => { e.preventDefault(); choose(false); };
}

// Idempotent: this is wired up both synchronously below and on window.load
// (some browsers fire 'load' before the sync call, others after). The guard
// prevents re-binding the embark onclick handler and keeps the restart button
// from being appended twice.
let _resumeChecked = false;
function checkResume(){
  if(_resumeChecked) return;
  if(!window._fe) return;
  const saved = window._fe.loadProgress();
  if(!saved || saved.depthMeters < CONFIG.INTRO_RESUME_MIN_M) return;
  _resumeChecked = true;

  const thoughtText = document.getElementById('intro-thought-text');
  if(thoughtText) thoughtText.textContent = "Your journey has already begun";

  const embarkBtn = document.getElementById('intro-embark');
  if(embarkBtn) {
    embarkBtn.textContent = "Resume journey";
    embarkBtn.dataset.resume = "true";
    embarkBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      window._fe.restoreFromSave(saved);
      if(window._startBirth) window._startBirth();
    };
  }
  const promptArea = document.getElementById('intro-prompt');
  if(promptArea && !document.getElementById('intro-restart')) {
    const embarkEl = document.getElementById('intro-embark');
    const restartBtn = document.createElement('button');
    restartBtn.id = 'intro-restart';
    restartBtn.textContent = "Embark again";
    // Copy all CSS properties from embark button to ensure visual match
    if(embarkEl){
      const cs = getComputedStyle(embarkEl);
      for(const prop of cs){
        try { restartBtn.style.setProperty(prop, cs.getPropertyValue(prop)); } catch(e){}
      }
    }
    restartBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      window._soulModalMode = true;
      _showSoulModal((nm) => {
        window._fe.setName(nm);
        window._fe.clearSave();
        _showSoundModal(() => {
          if(window._startBirth) window._startBirth();
        });
      }, ragdolls[0]?.name || 'emy');
    };
    promptArea.appendChild(restartBtn);
  }
}

window.addEventListener('load', checkResume);
// Also run immediately in case load already fired
checkResume();

// ── Gate: hide UI during intro, game canvas visible underneath ─────
const introEl = document.getElementById('intro-sequence');
if(introEl){
  const ui=[document.querySelector('.top-controls'),document.querySelector('.bottom-left'),document.querySelector('.back-link')];
  // Guard the whole body - a missing UI node would otherwise NPE on .style.transition.
  ui.forEach(e => {
    if(!e) return;
    e.style.opacity = '0';
    e.style.transition = 'opacity 1.5s ease';
  });

  // Custom click handler for embark to support resume
  const embarkBtn = document.getElementById('intro-embark');
  if(embarkBtn) {
    // Note: onclick is already set in the window.load handler if resuming
    // This is the fallback for new journeys
    if(!embarkBtn.onclick) {
      // New journey: name modal → sound modal → birth
      window._soulModalMode = true;
      embarkBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        _showSoulModal((nm) => {
          window._fe.setName(nm);
          _showSoundModal(() => {
            if(window._startBirth) window._startBirth();
          });
        }, 'emy');
      };
    }
  }

  window.addEventListener('intro-complete',()=>{
    ui.forEach(e=>{ if(e) e.style.opacity='1'; });
  });
}

// ── Fade from black on page load ─────────────────────────────────────────
// Double-rAF ensures at least one browser paint in the black state so the
// CSS transition actually runs (transitions require the initial state to be
// painted before the target state is set).
(function() {
  const sf = document.getElementById('screen-fade');
  if(!sf) return;
  requestAnimationFrame(() => requestAnimationFrame(() => sf.classList.add('done')));
})();

function updateSoundHint() {
  const hint = soundHintEl; // cached in §10 Buttons
  if(!hint) return;
  const depthM = Math.max(0, cameraY / 100);

  if(depthM < CONFIG.SOUND_HINT_FADE_M) {
    // FORCE visibility until fade threshold
    hint.style.setProperty('display', 'block', 'important');
    hint.style.setProperty('opacity', '1', 'important');

    // Very subtle pulsation
    const pulse = 0.95 + Math.sin(time * 2.5) * 0.05;
    hint.style.transform = `scale(${pulse})`;
  } else {
    // Start fading at 50m
    hint.style.removeProperty('opacity');
    hint.style.removeProperty('display');
    hint.style.transition = 'opacity 3.0s ease, transform 3.0s ease';
    hint.style.opacity = '0';
    hint.style.transform = 'scale(0.85)';
    setTimeout(() => {
      if(hint.style.opacity === '0') {
        hint.style.display = 'none';
      }
    }, 3500);
  }
}

})();
