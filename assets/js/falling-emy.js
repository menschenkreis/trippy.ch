// ── Ragdoll Void — Physics + Sacred Geometry ─────────────────────────────────
(function(){
'use strict';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const PI = Math.PI, TAU = PI*2;

// ── Resize ───────────────────────────────────────────────────────────────
let W, H, dpr;
function resize(){
  dpr = Math.min(devicePixelRatio, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize); resize();

// ── Theme ────────────────────────────────────────────────────────────────
const themes = [
  { accent:[180,100,255], accent2:[255,80,200], bg:'#08060f', name:'violet' },
  { accent:[0,220,255],   accent2:[255,180,60],  bg:'#060d12', name:'aqua' },
  { accent:[255,120,40],  accent2:[255,50,120],  bg:'#120806', name:'ember' },
  { accent:[40,255,140],  accent2:[180,80,255],  bg:'#061208', name:'jade' },
  { accent:[255,60,80],   accent2:[255,220,50],  bg:'#0f0608', name:'crimson' },
  { accent:[255,200,255], accent2:[100,180,255], bg:'#0a0810', name:'frost' },
];
let themeIdx = 0;
let theme = themes[0];
function setTheme(i){
  themeIdx = i % themes.length;
  theme = themes[themeIdx];
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

// ── Physics constants ────────────────────────────────────────────────────
const GRAVITY = 500;
const DAMPING = 0.998;
const ITERATIONS = 8;
const SUBSTEPS = 2;

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
let harmonicCooldown = 0; // dynamic cooldown — increases when stuck
const pentatonicScale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // C D E G A c d e g a

// ── Power-Up Effects ──
let activeEffects = { wave: 0, trail: 0, pulse: 0, magnet: 0 };
let waveRings = []; // {x, y, radius, life}

// ── Life Chapters (includes milestones) ──
let journeyLog = []; // {label, text}
let chapterDisplay = null; // {text, life, phase}
let chapterSlowMo = 0;
let lastChapter = -1;
let firedChapters = new Set();

const lifeChapters = [
  { age: 0.05, label: 'Birth', text: 'No past. But so much future ahead.' },
  { age: 1, label: 'Year 1', text: 'Every sensation is brand new. The world is pure wonder.' },
  { age: 2, label: 'Year 2', text: 'Learning to walk. Every fall is a discovery.' },
  { age: 3, label: 'Year 3', text: 'Why? Why? Why? The universe is infinite questions.' },
  { age: 4, label: 'Year 4', text: 'Imagination runs wild. Everything is alive.' },
  { age: 5, label: 'Year 5', text: 'The first day of something bigger.' },
  { age: 6, label: 'Year 6', text: 'Friendships form. The world gets wider.' },
  { age: 7, label: 'Year 7', text: 'Things fall away. But they make room for what comes next.' },
  { age: 8, label: 'Year 8', text: 'Reading opens doors to a thousand worlds.' },
  { age: 9, label: 'Year 9', text: 'Almost double digits. Time starts to feel real.' },
  { age: 10, label: 'Year 10', text: 'A whole decade. You have no idea how fast this goes.' },
  { age: 12, label: 'Year 12', text: 'A turning point. Everything begins to change.' },
  { age: 13, label: 'Year 13', text: 'The void gets deeper.' },
  { age: 15, label: 'Year 15', text: 'First love. First heartbreak. The obstacles get sharper.' },
  { age: 18, label: 'Year 18', text: 'Adulthood arrives. Nobody feels ready.' },
  { age: 0.5, label: '500 m', text: 'The descent begins.' },
  { age: 10, label: '10 km', text: 'The void stretches on.' },
  { age: 25, label: 'Year 25', text: 'A quarter century. Who am I now?' },
  { age: 25, label: '25 km', text: 'Gravity feels different now.' },
  { age: 30, label: 'Year 30', text: 'The fall feels different from here.' },
  { age: 40, label: 'Year 40', text: 'Not a crisis — a clearing.' },
  { age: 50, label: 'Year 50', text: 'Half a century. Grace finds its rhythm.' },
  { age: 50, label: '50 km', text: 'Halfway to somewhere.' },
  { age: 60, label: 'Year 60', text: 'Wisdom is not knowing more. It is carrying less.' },
  { age: 70, label: 'Year 70', text: 'The obstacles soften. The geometry becomes beautiful.' },
  { age: 80, label: 'Year 80', text: 'A long fall. A good fall. Still falling.' },
  { age: 90, label: 'Year 90', text: 'The void and you are old friends.' },
  { age: 100, label: '100 km', text: 'Dawn breaks.' },
  { age: 100, label: 'Year 100', text: 'A hundred years of descent. What a journey.' },
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
      
      let tiltX = Math.max(-45, Math.min(45, tilt)) / 45; // -1 to 1
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
    const vx = (this.x - this.ox) * DAMPING;
    const vy = (this.y - this.oy) * DAMPING;
    this.ox = this.x; this.oy = this.y;
    this.x += vx + gravityX * dt * dt;
    this.y += vy + gravityY * dt * dt;
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
    const diff = (d - this.dist) / d * this.stiffness;
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
    if(type === 'challenge'){
      this.r = 35 + Math.random()*25;
    } else if(type === 'heart'){
      this.r = 25 + Math.random()*15;
    } else if(type === 'chakra'){
      this.r = 28 + Math.random()*20;
    } else {
      this.r = r || (15 + Math.random()*35);
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
    // Spheres are STATIC in world space — no gravity, no movement
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
}

function playImpactSound(force, hue, xPos, type, sacredType){
  if(isMuted || !audioCtx) return;
  if(force < 1.5) return; // ignore tiny grazes
  const now = audioCtx.currentTime;
  if(now - lastImpactTime < 0.04) return; // throttle overlapping sounds
  lastImpactTime = now;
  
  // Pentatonic scale mapped to hue — crystalline/glass tuning
  const baseFreq = 220; // A3 base
  const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
  const noteIdx = Math.floor((hue / 360) * pentatonic.length) % pentatonic.length;
  const freq = baseFreq * Math.pow(2, pentatonic[noteIdx]/12);
  
  const vol = Math.min(force * 0.025, 0.9);
  const duration = 0.3 + Math.min(force * 0.01, 1.5);
  
  // Stereo panning based on horizontal collision position
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
  if(panner.pan) panner.pan.value = Math.max(-1, Math.min(1, (xPos / W) * 2 - 1));

  if (type === 'heart') {
    // Warm, resonant major chord (root + fifth) with softer attack
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.5, now); // perfect fifth
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 1.2, now + 0.05); // softer attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.5); // longer tail
    
    osc1.connect(gain1);
    osc2.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    
    osc1.start(now); osc1.stop(now + duration * 1.5 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.5 + 0.1);

  } else if (type === 'challenge') {
    // Low, distorted, slightly dissonant thud
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq * 0.25, now); // 2 octaves down
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.125, now + 0.1); // pitch dive
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.8, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5); // fast decay
    
    osc1.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    
    osc1.start(now); osc1.stop(now + duration * 0.5 + 0.1);

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
    gain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.5);
    
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
    osc1.type = 'sine'; osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq * 3, now);
    osc2.frequency.setValueAtTime(freq * 4.01, now);
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
    gain.gain.linearRampToValueAtTime(vol * 0.9, now + 0.005);
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
    osc1.type = 'sawtooth'; osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq * 0.3, now);
    osc2.frequency.setValueAtTime(freq * 0.3 + 2, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);
    osc1.connect(gain); osc2.connect(gain); gain.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    osc1.start(now); osc1.stop(now + duration * 1.2 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 1.2 + 0.1);
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
    // Deep Choir Pad (Filtered sawtooth + sub oscillator)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc1.type = 'sawtooth';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 0.5, now);
    osc2.frequency.setValueAtTime(freq * 0.25, now);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration * 2);
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.5, now + 0.1); // slow attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 2); // long fade
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain1);
    gain1.connect(panner);
    panner.connect(masterGain);
    if(delayNode) panner.connect(delayNode);
    
    osc1.start(now); osc1.stop(now + duration * 2 + 0.1);
    osc2.start(now); osc2.stop(now + duration * 2 + 0.1);

  } else {
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    
    gain1.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now);

    if (sacredType === 0) {
      // Polygon: default crystalline pluck
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.8, now + 0.005);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, now); // an octave up
      gain2.gain.linearRampToValueAtTime(vol * 0.5, now + 0.002);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.25);
      
      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(panner);
      gain2.connect(panner);
      
    } else if (sacredType === 1) {
      // Seed of Life: warm, chorus-like bell (detuned sines)
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.9, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 1.01, now); // detuned for chorus
      gain2.gain.linearRampToValueAtTime(vol * 0.6, now + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);
      
      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(panner);
      gain2.connect(panner);

    } else if (sacredType === 2) {
      // Metatron's Cube: complex metallic chime
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      gain1.gain.linearRampToValueAtTime(vol * 0.7, now + 0.005);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 1.5, now); // perfect fifth up for metallic resonance
      gain2.gain.linearRampToValueAtTime(vol * 0.2, now + 0.002);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.4);
      
      const bq = audioCtx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.setValueAtTime(freq * 4, now);
      bq.frequency.exponentialRampToValueAtTime(freq, now + duration * 0.4);
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
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
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
      p.x += nx * overlap * 0.4;
      p.y += ny * overlap * 0.4;
    }
    const pushForce = overlap * 0.6;
    s.x -= nx * pushForce;
    s.y -= ny * pushForce;
    
    const vx = p.x - p.ox, vy = p.y - p.oy;
    const dot = vx*nx + vy*ny;
    const impactVel = -dot;
    if(impactVel > impactData.maxForce) impactData.maxForce = impactVel;
    
    if(dot < 0){
      p.ox = p.x - (vx - 2*dot*nx)*0.8;
      p.oy = p.y - (vy - 2*dot*ny)*0.8;
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
    spawnImpactParticles(sphere.x, sphere.y, sphere.hue);
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

    // ── Power-Up Activation ──
    if(sphere.type === 'wave') activeEffects.wave = 4;
    else if(sphere.type === 'trail') activeEffects.trail = 5;
    else if(sphere.type === 'pulse') activeEffects.pulse = 3;
    else if(sphere.type === 'magnet') activeEffects.magnet = 5;

    const basePoints = sphere.type === 'challenge' ? 50 : (sphere.type === 'heart' ? 25 : (['wave','trail','pulse','magnet'].includes(sphere.type) ? 30 : 15));
    const multiplier = Math.min(comboCount, 10);
    const pts = basePoints * multiplier;
    score += pts;

    // Score popup at collision (world space → screen space later)
    scorePopups.push({
      x: sphere.x, y: sphere.y,
      text: multiplier > 1 ? `+${pts} ×${multiplier}` : `+${pts}`,
      life: 1.0,
      vy: -80,
      hue: sphere.hue,
    });

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

    // Portal trigger
    if(sphere.type === 'challenge' && !portal){
      const h = (sphere.hue + time * 40) % 360;
      portal = {
        x: sphere.x, y: sphere.y, r: sphere.r,
        progress: 0, hue: h, phase: 'expanding',
        sparks: Array.from({length:30}, (_,i)=>({
          angle: i * TAU / 60,
          speed: 300 + Math.random() * 500,
          dist: 0,
          size: 1 + Math.random() * 2.5,
          hue: (h + i * 6) % 360,
          life: 1,
        })),
        targetAccent: [60+Math.random()*180|0, 60+Math.random()*180|0, 60+Math.random()*180|0],
        targetAccent2: [60+Math.random()*180|0, 60+Math.random()*180|0, 60+Math.random()*180|0],
      };
    }
  }
}

// ── Impact particles ─────────────────────────────────────────────────────
let particles = [];
const MAX_PARTICLES = 150;

function spawnImpactParticles(x, y, hue){
  const count = 6 + Math.floor(Math.random()*6);
  for(let i=0;i<count;i++){
    if(particles.length >= MAX_PARTICLES) particles.shift();
    const angle = Math.random() * TAU;
    const speed = 50 + Math.random() * 200; // fast initial burst
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30, // slight upward bias
      life: 1.0,
      decay: 0.5 + Math.random() * 1.5,
      size: 0.5 + Math.random() * 1.5,
      hue: hue + Math.random() * 40 - 20,
      sparkle: Math.random() > 0.8,
    });
  }
}

function updateParticles(dt){
  for(let i = particles.length-1; i >= 0; i--){
    const p = particles[i];
    p.vy += 150 * dt; // gravity
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92; // heavy friction (firework style)
    p.vy *= 0.92;
    p.life -= p.decay * dt;
    if(p.life <= 0) particles.splice(i, 1);
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

  // Score popups (world space)
  for(let i = scorePopups.length-1; i >= 0; i--){
    const p = scorePopups[i];
    p.y += p.vy * dt;
    p.vy *= 0.97;
    p.life -= dt * 1.2;
    if(p.life <= 0) scorePopups.splice(i, 1);
  }

  // Score flies (world space → screen space transition)
  const counterX = W - 20;
  const counterY = H - 38;
  for(let i = scoreFlies.length-1; i >= 0; i--){
    const f = scoreFlies[i];
    f.life -= dt * 0.8;
    if(f.life <= 0){ scoreFlies.splice(i, 1); continue; }

    if(f.delay > 0){ f.delay -= dt; continue; }

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
  }
}

function drawScoreElements(){
  const a = theme.accent2;

  // ── Score Popups (world space, drawn in camera transform) ──
  for(const p of scorePopups){
    const alpha = p.life * (p.life > 0.5 ? 1 : p.life * 2);
    const scale = 0.8 + (1 - p.life) * 0.3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = `hsla(${p.hue},80%,75%,${alpha})`;
    ctx.font = '600 0.75rem monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = `hsla(${p.hue},90%,60%,${alpha * 0.5})`;
    ctx.shadowBlur = 8;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

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
  ctx.shadowBlur = 0;
}

function drawParticles(){
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for(const p of particles){
    const alpha = p.life * (p.life > 0.5 ? 1.0 : p.life * 2.0);
    const s = p.size * (0.8 + 0.2 * Math.sin(time * 12 + p.hue));
    // Soft glow (single larger circle, no gradient)
    ctx.fillStyle = `hsla(${p.hue},85%,60%,${alpha * 0.3})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 4, 0, TAU); ctx.fill();
    // Core
    ctx.fillStyle = `hsla(${p.hue},100%,85%,${alpha})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ── State ────────────────────────────────────────────────────────────────
let ragdolls = [];
let spheres = [];
let time = 0;
let cameraY = 0; // camera offset — follows the ragdoll's descent
let fallSpeed = 0; // how deep the ragdoll has fallen
let nextChallengeY = 10000;

// Spawn initial
ragdolls.push(new Ragdoll(W/2, 0, 'emy'));
// No initial spheres — intro handles the first moments

let nextShapeY = 5000; // first shape allowed at 50m

function spawnSphereAtDepth(yWorld, forceType=null){
  let type = 'sphere';
  if (forceType) {
    type = forceType;
  } else {
    // Reduced frequency of special obstacles (approx 1.5% each)
    const r = Math.random();
    if (r < 0.015) type = 'heart';
    else if (r < 0.030) type = 'yinyang';
    else if (r < 0.045) type = 'vesica';
    else if (r < 0.060) type = 'chakra';
    else if (r < 0.080) type = 'wave';
    else if (r < 0.100) type = 'trail';
    else if (r < 0.120) type = 'pulse';
    else if (r < 0.140) type = 'magnet';
  }

  spheres.push(new Sphere(
    Math.random()*W,
    yWorld,
    null,
    type
  ));
}

function spawnSphereNear(x,y){
  spawnSphereAtDepth(y + (Math.random()-0.5)*100);
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
muteBtn.onclick = () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('is-on', !isMuted);
  muteBtn.style.animation = 'none';
  if(!isMuted) initAudio();
  // Hide hint on first unmute
  const hint = document.getElementById('sound-hint');
  if(hint) hint.style.display = 'none';
};

  // Hide sound hint after 8s
  setTimeout(()=>{
    const hint = document.getElementById('sound-hint');
    if(hint && isMuted) hint.style.opacity = '0';
    const mb = document.getElementById('mute-btn');
    if(mb && isMuted) mb.style.animation = 'none';
    setTimeout(()=>{ if(hint) hint.style.display = 'none'; }, 1500);
  }, 8000);

const tiltBtn = document.getElementById('tilt-btn');
tiltBtn.onclick = () => {
  tiltEnabled = !tiltEnabled;
  tiltBtn.classList.toggle('is-on', tiltEnabled);
  if(!tiltEnabled) gravityX = 0;
  else initAccel(); // Ensure permission is requested if turned on explicitly
};
document.getElementById('reset-btn').onclick = () => {
  isDragging = false; dragRagdoll = null; dragParticle = null;
  cameraY = 0; fallSpeed = 0;
  portal = null;
  score = 0; displayScore = 0; comboCount = 0; lastHitTime = 0;
  scorePopups = []; scoreFlies = [];
  harmonyIndex = 0; harmonicCooldown = 0;
  activeEffects = { wave: 0, trail: 0, pulse: 0, magnet: 0 };
  waveRings = [];
  journeyLog = []; updateJourneyPanel();
  firedChapters = new Set();
  chapterDisplay = null; chapterSlowMo = 0;
  nextShapeY = 5000;
  nextChallengeY = 10000;
  ragdolls = [new Ragdoll(W/2, 0, 'emy')];
  spheres = [];
  for(let i=0;i<8;i++) spawnSphereAtDepth(i*120+Math.random()*80);
};

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
  const starSpacing = 80;
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

      // Only ~40% of cells have a star
      if(h1 > 0.4) continue;

      const sx = cx * starSpacing + h2 * starSpacing;
      const sy = cy * starSpacing + h3 * starSpacing - scrollY;

      // Skip if off screen
      if(sx < -5 || sx > W+5 || sy < -5 || sy > H+5) continue;

      // Star properties from hash
      const brightness = 0.3 + h1 * 0.7; // Brighter range
      const size = 0.8 + h3 * 2.0; // Slightly larger
      const twinkleSpeed = 1.2 + h2 * 5.0;
      const twinklePhase = h1 * TAU * 10;

      // Twinkle
      const twinkle = 0.5 + 0.5 * Math.sin(time * twinkleSpeed + twinklePhase);
      const alpha = brightness * (0.5 + 0.5 * twinkle);

      // Colour — more saturated
      const hue = (h2 * 360 + h3 * 60 + time * 8) % 360;
      const sat = 40 + h1 * 60; // More vibrant color range
      const light = 80 + twinkle * 20;

      // Draw star
      ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size * (0.6 + 0.4 * twinkle), 0, TAU);
      ctx.fill();

      // Bright stars get a subtle cross sparkle
      if(brightness > 0.3 && twinkle > 0.7){
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

function drawBackground(){
  // Gradient background — screen-space
  const grad = ctx.createRadialGradient(W/2,H/2,0, W/2,H/2,Math.max(W,H)*0.7);
  grad.addColorStop(0, '#0e0e18');
  grad.addColorStop(1, theme.bg);
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);
  ctx.restore();

  // ── Parallax kaleidoscope layers (screen-space, different scroll speeds) ──
  // Layer 1: far background — slowest parallax
  const px1 = cameraY * 0.1;
  drawKaleidoscope(W/2, H*0.5 - px1, 350, 6, time*0.03, 0, 0.03, px1);
  drawKaleidoscope(W*0.2, H*0.3 - px1*0.8, 200, 8, -time*0.02, 120, 0.025, px1*0.8);
  drawKaleidoscope(W*0.8, H*0.7 - px1*1.2, 250, 5, time*0.025, 240, 0.025, px1*1.2);

  // Layer 2: mid — medium parallax
  const px2 = cameraY * 0.3;
  drawKaleidoscope(W*0.3, H*0.4 - px2, 180, 7, -time*0.04, 60, 0.04, px2);
  drawKaleidoscope(W*0.7, H*0.6 - px2*0.7, 220, 6, time*0.035, 180, 0.035, px2*0.7);
  drawKaleidoscope(W*0.5, H*0.2 - px2*1.3, 160, 9, -time*0.03, 300, 0.03, px2*1.3);

  // Layer 3: near — fastest parallax (but still behind gameplay)
  const px3 = cameraY * 0.5;
  drawKaleidoscope(W*0.15, H*0.6 - px3, 140, 5, time*0.05, 90, 0.045, px3);
  drawKaleidoscope(W*0.85, H*0.35 - px3*0.6, 170, 8, -time*0.045, 210, 0.04, px3*0.6);

  // Stars drawn outside camera transform — see frame()

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

  // Sacred geometry — world space, scrolls with gameplay
  const cx = W/2, cy = cameraY + H*0.5;
  const pulse = 0.7 + 0.3*Math.sin(time*0.3);
  drawFlowerOfLife(cx, cy, 120*pulse, 0.035);
  drawMetatronsCube(cx, cy, 180*pulse, 0.02);
  drawGoldenSpiral(cx, cy, 250, time*0.1, 0.03);
  for(let i=0;i<4;i++){
    drawPolygon(cx, cy, 100+i*60, 3+i, time*0.05*(i%2===0?1:-1), 0.015+i*0.004);
  }
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
    s.impactFlash -= 0.05; // decay faster
    if(s.impactFlash < 0) s.impactFlash = 0;
  }

  if(s.type === 'heart'){
    // Red/pink glowing heart
    const hue = (330 + time*10 + s.hue) % 360; 
    
    // Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},80%,60%,0.2)`);
    grad.addColorStop(1, `hsla(${hue},80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.rotate(Math.sin(time + s.hue)*0.1);
    ctx.strokeStyle = `hsla(${hue},80%,65%,0.9)`;
    ctx.fillStyle = `hsla(${hue},70%,50%,0.25)`;
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
    grad.addColorStop(0, `hsla(${hue},90%,60%,0.15)`);
    grad.addColorStop(1, `hsla(${hue},90%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.6,0,TAU); ctx.fill();

    // Yin Yang
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsla(${hue},90%,70%,0.9)`;
    
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
    grad.addColorStop(0, `hsla(${hue},80%,60%,0.2)`);
    grad.addColorStop(1, `hsla(${hue},80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${hue},80%,65%,0.9)`;
    ctx.fillStyle = `hsla(${hue},80%,65%,0.1)`;
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

  } else if (s.type === 'vesica') {
    const hue = (280 + time*10 + s.hue) % 360; 
    ctx.rotate(s.rotation + time*0.2);
    const offset = r * 0.45;
    const sr = r * 0.7;
    
    // Deep Indigo/Violet Glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(${hue},80%,60%,0.2)`);
    grad.addColorStop(1, `hsla(${hue},80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${hue},80%,65%,0.9)`;
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

  } else if(s.type === 'wave'){
    // Cyan triangle
    ctx.rotate(s.rotation);
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(180,80%,60%,0.2)`);
    grad.addColorStop(1, `hsla(180,80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(180,80%,65%,0.9)`;
    ctx.fillStyle = `hsla(180,70%,50%,0.2)`;
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
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(300,80%,60%,0.2)`);
    grad.addColorStop(1, `hsla(300,80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(300,80%,65%,0.9)`;
    ctx.fillStyle = `hsla(300,70%,50%,0.2)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0,-r); ctx.lineTo(r*0.7,0); ctx.lineTo(0,r); ctx.lineTo(-r*0.7,0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(s.type === 'pulse'){
    // Gold star
    ctx.rotate(s.rotation * 2);
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.8);
    grad.addColorStop(0, `hsla(45,90%,60%,0.2)`);
    grad.addColorStop(1, `hsla(45,90%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.8,0,TAU); ctx.fill();
    ctx.strokeStyle = `hsla(45,90%,60%,0.9)`;
    ctx.fillStyle = `hsla(45,80%,50%,0.2)`;
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
  } else if(s.type === 'challenge'){
    // Spiky abstract challenge shape
    const hue = (s.hue + time*40) % 360;
    ctx.rotate(s.rotation * 2);
    
    // Danger glow
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.5);
    grad.addColorStop(0, `hsla(${hue},80%,40%,0.2)`);
    grad.addColorStop(1, `hsla(${hue},80%,40%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.5,0,TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${hue},80%,60%,0.9)`;
    ctx.fillStyle = `rgba(10,10,15,0.85)`;
    ctx.lineWidth = 1.5;
    
    // Sharp, irregular star
    ctx.beginPath();
    const spikes = 9;
    for(let i=0; i<=spikes*2; i++){
      const angle = i * TAU / (spikes*2);
      const dist = (i%2 === 0) ? r : r * (0.3 + 0.2*Math.sin(time*10 + i));
      if(i===0) ctx.moveTo(Math.cos(angle)*dist, Math.sin(angle)*dist);
      else ctx.lineTo(Math.cos(angle)*dist, Math.sin(angle)*dist);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Inner frantic pattern
    ctx.strokeStyle = `hsla(${(hue+180)%360},80%,60%,0.5)`;
    ctx.beginPath();
    for(let i=0; i<spikes; i++){
      const angle = i * TAU / spikes + time;
      ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(angle)*r*0.6, Math.sin(angle)*r*0.6);
    }
    ctx.stroke();

  } else {
    // Normal sacred geometry sphere
    const a2 = theme.accent2;
    const grad = ctx.createRadialGradient(0,0,0, 0,0,r*1.5);
    grad.addColorStop(0, `rgba(${a2[0]},${a2[1]},${a2[2]},0.06)`);
    grad.addColorStop(1, `rgba(${a2[0]},${a2[1]},${a2[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,r*1.5,0,TAU); ctx.fill();

    const hue = (s.hue + time*15) % 360;
    ctx.rotate(s.rotation);

    if(s.sacredType === 0){
      // Polygon with internal lines
      ctx.strokeStyle = `hsla(${hue},60%,55%,0.25)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0;i<=s.segments;i++){
        const angle = i*TAU/s.segments;
        const px = Math.cos(angle)*r, py = Math.sin(angle)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();

      ctx.strokeStyle = `hsla(${hue},50%,50%,0.12)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for(let i=0;i<=s.segments;i++){
        const angle = i*TAU/s.segments + PI/s.segments;
        const px = Math.cos(angle)*r*0.5, py = Math.sin(angle)*r*0.5;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();

      if(s.segments >= 5){
        ctx.strokeStyle = `hsla(${hue},40%,45%,0.08)`;
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
      ctx.strokeStyle = `hsla(${hue},60%,55%,0.25)`;
      ctx.lineWidth = 1;
      const sr = r * 0.5; // sub radius
      ctx.beginPath(); ctx.arc(0,0,sr,0,TAU); ctx.stroke();
      for(let i=0;i<6;i++){
        ctx.beginPath();
        ctx.arc(Math.cos(i*PI/3)*sr, Math.sin(i*PI/3)*sr, sr, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${hue},60%,55%,0.15)`;
      ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();
    }
    else if(s.sacredType === 2){
      // Simplified Metatron / Cube
      ctx.strokeStyle = `hsla(${hue},60%,55%,0.25)`;
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
      
      ctx.fillStyle = `hsla(${hue},60%,60%,0.2)`;
      for(const pt of pts){
        ctx.beginPath(); ctx.arc(pt[0], pt[1], r*0.15, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(pt[0], pt[1], r*0.15, 0, TAU); ctx.stroke();
      }
    }

    // Inner circle
    ctx.strokeStyle = `hsla(${hue},45%,50%,0.15)`;
    ctx.beginPath(); ctx.arc(0,0,r*0.35,0,TAU); ctx.stroke();

    // Center dot
    ctx.fillStyle = `hsla(${hue},60%,60%,0.3)`;
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
function updateCamera(){
  if(ragdolls.length > 0){
    // DISABLE camera follow while dragging to fix the canvas position
    if(isDragging) return;

    const head = ragdolls[0].particles[0];
    // Smoothly follow the ragdoll's head, keeping it at ~35% from top
    const targetCam = head.y - H * 0.35;
    cameraY += (targetCam - cameraY) * 0.08;
  }
  // Spawn new spheres ahead of the camera
  const aheadY = cameraY + H + 200;
  
  // Every 100m (10000px), spawn a challenge
  if(aheadY > nextChallengeY){
    spawnSphereAtDepth(nextChallengeY, 'challenge');
    nextChallengeY += 10000;
  }
  
  // ── Shape Density ──
  // No shapes before 50m (5000px). Density ramps from 1 shape per 800px at 50m
  // down to 1 shape per 120px at 100m and beyond.
  const depthM = Math.max(0, cameraY / 100);
  if(depthM >= 50 && aheadY > nextShapeY){
    const ramp = Math.min((depthM - 50) / 50, 1.0);
    const interval = 800 - ramp * 680; // 800px → 120px
    nextShapeY = aheadY + interval * (0.7 + Math.random() * 0.6);
    spawnSphereAtDepth(nextShapeY);
  }
}

function recycleObjects(){
  const behindY = cameraY - 300;
  spheres = spheres.filter(s => s.y > behindY);
  // Keep spawning
  const aheadY = cameraY + H + 100;
  // Keep spawning — density increases with depth
  const depthM = Math.max(0, cameraY / 100);
  if(depthM >= 50 && aheadY > nextShapeY){
    const ramp = Math.min((depthM - 50) / 50, 1.0);
    const interval = 800 - ramp * 680;
    nextShapeY = aheadY + interval * (0.7 + Math.random() * 0.6);
    spawnSphereAtDepth(nextShapeY);
  }
}

// ── Main loop ────────────────────────────────────────────────────────────
let lastTime = 0;
function frame(now){
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - lastTime)/1000, 0.033);
  lastTime = now;

  // Freeze physics during intro
  const introEl = document.getElementById('intro-sequence');
  const introActive = !!introEl;
  const effectiveTimeScale = introActive ? 0 : targetTimeScale;

  // Smoothly interpolate time scale (much faster transition but still eased)
  const ease = (effectiveTimeScale < timeScale) ? 0.45 : 0.15;
  timeScale += (effectiveTimeScale - timeScale) * ease;

  time += rawDt;
  const dt = (rawDt * timeScale) / SUBSTEPS;

  // Physics substeps
  for(let s=0;s<SUBSTEPS;s++){
    for(const r of ragdolls) r.update(dt);
    // Magnet repulsion — push spheres away from ragdoll
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
    // No sphere physics — they're static obstacles
    for(const r of ragdolls){
      for(const sp of spheres) collideRagdollSphere(r, sp);
    }
  }

  // Update impact particles
  updateParticles(dt * timeScale);
  updateScoreElements(rawDt);

  // Clamp ragdoll to screen width
  for(const r of ragdolls){
    for(const p of r.particles){
      if(p.x < 20){ p.x = 20; p.ox = 20; }
      if(p.x > W-20){ p.x = W-20; p.ox = W-20; }
    }
  }

  updateCamera();
  recycleObjects();

  // ── Update Portal ──
  if(portal){
    for(const sp of portal.sparks){
      sp.angle += rawDt * 1.8;
      sp.dist += sp.speed * rawDt;
      sp.life -= rawDt * 0.6;
    }
    portal.sparks = portal.sparks.filter(sp => sp.life > 0);

    if(portal.phase === 'expanding'){
      portal.progress += rawDt * 0.55;
      portal.r += rawDt * 900;
      if(portal.progress >= 1){ portal.phase = 'threshold'; portal.progress = 0; }
    } else if(portal.phase === 'threshold'){
      portal.progress += rawDt * 1.2;
      if(portal.progress >= 0.5 && !portal.colorsApplied){
        portal.colorsApplied = true;
        window.manualThemeSet = true;
        theme.accent = portal.targetAccent;
        theme.accent2 = portal.targetAccent2;
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
  for(const s of spheres) drawSphere(s);
  for(const r of ragdolls) drawRagdoll(r);
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
    ctx.strokeStyle = `hsla(200,80%,65%,${wr.life * 0.6})`;
    ctx.lineWidth = 2 * wr.life;
    ctx.shadowColor = `hsla(200,90%,60%,${wr.life * 0.4})`;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(wr.x, wr.y, wr.radius, 0, TAU); ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Trail effect: spawn sparks from ragdoll head
  if(activeEffects.trail > 0){
    activeEffects.trail -= rawDt;
    if(particles.length < MAX_PARTICLES){
      for(let i = 0; i < 2; i++){
        particles.push({
          x: headX + (Math.random()-0.5)*8, y: headY + (Math.random()-0.5)*8,
          vx: (Math.random()-0.5)*30, vy: (Math.random()-0.5)*30 + 20,
          life: 1.0, decay: 2.0 + Math.random(), size: 1.5 + Math.random()*2,
          hue: 300 + Math.random()*60, sparkle: Math.random() > 0.5,
        });
      }
    }
  }

  // Pulse effect: golden ring around head
  if(activeEffects.pulse > 0){
    activeEffects.pulse -= rawDt;
    const pAlpha = Math.min(activeEffects.pulse / 0.5, 1.0) * 0.7;
    const pPulse = 30 + 15 * Math.sin(time * 8);
    ctx.strokeStyle = `hsla(45,90%,60%,${pAlpha})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `hsla(45,90%,55%,${pAlpha * 0.6})`;
    ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.arc(headX, headY, pPulse, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `hsla(45,80%,70%,${pAlpha * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(headX, headY, pPulse * 1.5, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
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
  drawScoreElements(); // popups in world space

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

      // Spiraling sacred geometry rings (2 instead of 3)
      for(let ring = 0; ring < 2; ring++){
        const ringR = pr * (0.7 + ring * 0.25);
        const ringAlpha = ease * (0.5 - ring * 0.12);
        const ringHue = (h + ring * 40 + time * 80) % 360;
        const segments = 6 + ring * 2;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(time * (1.5 + ring * 0.5) * (ring % 2 ? -1 : 1));
        ctx.strokeStyle = `hsla(${ringHue},90%,65%,${ringAlpha})`;
        ctx.lineWidth = 1.5 - ring * 0.3;
        ctx.shadowColor = `hsla(${ringHue},90%,60%,${ringAlpha * 0.4})`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for(let i = 0; i <= segments; i++){
          const a = i * TAU / segments;
          const wobble = Math.sin(time * 3 + i + ring) * ringR * 0.08;
          const d = ringR + wobble;
          if(i===0) ctx.moveTo(Math.cos(a)*d, Math.sin(a)*d);
          else ctx.lineTo(Math.cos(a)*d, Math.sin(a)*d);
        }
        ctx.closePath(); ctx.stroke();
        if(ring === 0){
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = ringAlpha * 0.4;
          for(let i = 0; i < segments; i++){
            for(let j = i+2; j < segments; j++){
              const a1 = i*TAU/segments, a2 = j*TAU/segments;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a1)*ringR, Math.sin(a1)*ringR);
              ctx.lineTo(Math.cos(a2)*ringR, Math.sin(a2)*ringR);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // Vortex tunnel rings
      const tunnelR = pr * 0.95;
      for(let i = 0; i < 5; i++){
        const t = (i / 8 + time * 0.5) % 1;
        const tr = tunnelR * t;
        const tAlpha = ease * (1 - t) * 0.3;
        ctx.strokeStyle = `hsla(${(h + t * 120) % 360},85%,60%,${tAlpha})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(sx, sy, tr, 0, TAU); ctx.stroke();
      }

      // Portal sparks (no shadowBlur for performance)
      for(const sp of portal.sparks){
        const spx = sx + Math.cos(sp.angle) * sp.dist;
        const spy = sy + Math.sin(sp.angle) * sp.dist;
        const sa = sp.life * ease;
        ctx.fillStyle = `hsla(${sp.hue},90%,70%,${sa})`;
        ctx.beginPath(); ctx.arc(spx, spy, sp.size * sp.life, 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Inner darkening void
      const voidAlpha = ease * 0.5;
      const vg = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 0.6);
      vg.addColorStop(0, `hsla(${(h+180)%360},60%,5%,${voidAlpha})`);
      vg.addColorStop(0.7, `hsla(${h},50%,8%,${voidAlpha * 0.3})`);
      vg.addColorStop(1, `hsla(${h},40%,5%,0)`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Outer chromatic ring (screen blend, 2 instead of 3)
      ctx.globalCompositeOperation = 'screen';
      for(let c = 0; c < 2; c++){
        const cHue = (h + c * 40) % 360;
        const cR = pr * (0.92 + c * 0.06);
        const cg = ctx.createRadialGradient(sx, sy, cR * 0.9, sx, sy, cR * 1.1);
        cg.addColorStop(0, `hsla(${cHue},100%,70%,0)`);
        cg.addColorStop(0.5, `hsla(${cHue},100%,75%,${ease * 0.35})`);
        cg.addColorStop(1, `hsla(${cHue},100%,70%,0)`);
        ctx.fillStyle = cg;
        ctx.fillRect(sx - cR * 1.5, sy - cR * 1.5, cR * 3, cR * 3);
      }
      ctx.globalCompositeOperation = 'source-over';

      // Time distortion vignette
      const vigAlpha = ease * 0.15;
      const vig = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.7);
      vig.addColorStop(0, `rgba(0,0,0,0)`);
      vig.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    // ── THRESHOLD: white flash + dimension shift ──
    else if(portal.phase === 'threshold'){
      const p = portal.progress;
      const flash = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7);
      const flashEase = flash * flash;

      // White flash
      ctx.fillStyle = `rgba(255,255,255,${flashEase * 0.4})`;
      ctx.fillRect(0, 0, W, H);

      // Chromatic scan lines
      if(flash > 0.1){
        for(let i = 0; i < 12; i++){
          const y = (H / 12) * i + Math.sin(time * 5 + i) * 20;
          const barH = 2 + flash * 6;
          const barHue = (h + i * 30 + time * 100) % 360;
          ctx.fillStyle = `hsla(${barHue},100%,70%,${flashEase * 0.3})`;
          ctx.fillRect(0, y, W, barH);
        }
      }

      // Radial light rays (reduced)
      const rayAlpha = flashEase * 0.15;
      if(rayAlpha > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.translate(sx, sy);
        for(let i = 0; i < 8; i++){
          const a = (i / 16) * TAU + time * 0.3;
          const rayLen = Math.max(W, H) * 1.5;
          const rayW = 0.04 + Math.sin(time * 2 + i) * 0.02;
          ctx.fillStyle = `hsla(${(h + i * 22) % 360},90%,75%,${rayAlpha})`;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - rayW) * rayLen, Math.sin(a - rayW) * rayLen);
          ctx.lineTo(Math.cos(a + rayW) * rayLen, Math.sin(a + rayW) * rayLen);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Lingering sparks
      for(const sp of portal.sparks){
        const spx = sx + Math.cos(sp.angle) * sp.dist;
        const spy = sy + Math.sin(sp.angle) * sp.dist;
        const sa = sp.life * 0.6;
        ctx.fillStyle = `hsla(${sp.hue},90%,70%,${sa})`;
        ctx.beginPath(); ctx.arc(spx, spy, sp.size * sp.life, 0, TAU); ctx.fill();
      }

      // New dimension tint after midpoint
      if(p > 0.5){
        const tintFade = (p - 0.5) * 2;
        const tg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
        tg.addColorStop(0, `rgba(${portal.targetAccent[0]},${portal.targetAccent[1]},${portal.targetAccent[2]},${tintFade * 0.08})`);
        tg.addColorStop(1, `rgba(0,0,0,${tintFade * 0.15})`);
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ── EMERGING: new dimension settles ──
    else if(portal.phase === 'emerging'){
      const p = portal.progress;
      const ease = p * p * (3 - 2 * p);

      // Fading sparks
      for(const sp of portal.sparks){
        const spx = sx + Math.cos(sp.angle) * sp.dist;
        const spy = sy + Math.sin(sp.angle) * sp.dist;
        const sa = sp.life * (1 - ease);
        if(sa > 0.01){
          ctx.fillStyle = `hsla(${sp.hue},90%,70%,${sa})`;
          ctx.beginPath(); ctx.arc(spx, spy, sp.size * sp.life, 0, TAU); ctx.fill();
        }
      }

      // Gentle pulse from portal center (new dimension breathing)
      const pulseR = ease * Math.max(W, H) * 0.8;
      const pulseA = (1 - ease) * 0.08;
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

  // Score HUD (below depth meter)
  const a3 = theme.accent2;
  const isAnim = displayScore < score;
  ctx.fillStyle = `rgba(${a3[0]},${a3[1]},${a3[2]},${isAnim ? 0.8 : 0.35})`;
  ctx.font = `${isAnim ? '300' : '200'} 0.8rem monospace`;
  ctx.textAlign = 'right';
  if(isAnim){
    ctx.shadowColor = `rgba(${a3[0]},${a3[1]},${a3[2]},0.5)`;
    ctx.shadowBlur = 10 + Math.sin(time * 12) * 4;
  }
  ctx.fillText(displayScore.toLocaleString(), W - 20, H - 38);
  ctx.shadowBlur = 0;

  // Combo next to score
  if(comboCount > 1){
    const ca = Math.max(0, 1 - (time - lastHitTime) / COMBO_WINDOW);
    ctx.fillStyle = `rgba(${a3[0]},${a3[1]},${a3[2]},${ca * 0.5})`;
    ctx.font = '600 0.55rem monospace';
    ctx.fillText(`×${Math.min(comboCount, 10)}`, W - 20, H - 52);
  }

  // ── Update Journey Panel ──
  function updateJourneyPanel(){
    const el = document.getElementById('journey-log');
    if(!el || journeyLog.length === 0) return;
    let html = '';
    for(let i = journeyLog.length - 1; i >= 0; i--){
      const e = journeyLog[i];
      html += `<div class="journey-entry"><div class="journey-icon">${e.label.startsWith('Year') || e.label === 'Birth' ? '📖' : '🎯'}</div><div class="journey-entry-text"><strong>${e.label}</strong> — ${e.text}</div></div>`;
    }
    el.innerHTML = html;
  }

  // ── Chapter Logic (unified) ──
  for(let ci = 0; ci < lifeChapters.length; ci++){
    const ch = lifeChapters[ci];
    const triggerDepth = ch.age * 1000;
    if(depthMeters >= triggerDepth && !firedChapters.has(ci)){
      firedChapters.add(ci);
      if(!chapterDisplay){
        const isMilestone = ch.label.endsWith('km') || ch.label.endsWith('m');
        chapterSlowMo = isMilestone ? 0.5 : 1.0;
        chapterDisplay = {text: ch.text, life: isMilestone ? 2.5 : 6.0, phase: 'fadein'};
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
  } else if(chapterSlowMo !== -1 && !isSlowed){
    targetTimeScale = 1.0;
    chapterSlowMo = -1;
  }
  if(chapterDisplay){
    const maxLife = chapterDisplay.life > 3 ? 6.0 : 2.5;
    chapterDisplay.life -= rawDt;
    if(chapterDisplay.life > maxLife - 1) chapterDisplay.phase = 'fadein';
    else if(chapterDisplay.life > 2.0) chapterDisplay.phase = 'hold';
    else chapterDisplay.phase = 'fadeout';
    if(chapterDisplay.life <= 0) chapterDisplay = null;
  }

  // ── Draw Chapter Text (screen space) — speech bubble ──
  if(chapterDisplay){
    const maxLife = chapterDisplay.life > 3 ? 6.0 : 2.5;
    const isShort = maxLife < 3;
    let cAlpha;
    const fadeDur = isBirth ? 1.2 : (isShort ? 0.5 : 0.8);
    if(chapterDisplay.phase === 'fadein') cAlpha = Math.min((maxLife - chapterDisplay.life) / fadeDur, 1);
    else if(chapterDisplay.phase === 'hold') cAlpha = 1.0;
    else cAlpha = chapterDisplay.life / 2.0;
    cAlpha = Math.max(0, Math.min(1, cAlpha));
    const elapsed = maxLife - chapterDisplay.life;
    const words = chapterDisplay.text.split(' ');
    const isBirth = chapterDisplay.text === 'No past. But so much future ahead.';
    const a = isBirth ? [255, 200, 100] : theme.accent2;
    const borderA = isBirth ? 0.5 : 0.3;
    const fillA = isBirth ? 0.15 : 0.1;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = isBirth ? '300 1rem sans-serif' : (isShort ? '300 1rem sans-serif' : '300 0.9rem sans-serif');
    const maxLineW = Math.min(W * 0.75, isShort ? 500 : 420);
    const lines = []; let line = '';
    for(const w of words){
      const test = line + w + ' ';
      if(ctx.measureText(test).width > maxLineW - 40){ lines.push(line); line = w + ' '; }
      else line = test;
    }
    lines.push(line);
    const lineH = isShort ? 22 : 24;
    const padX = 24, padY = 18;
    let maxW = 0;
    for(const l of lines) maxW = Math.max(maxW, ctx.measureText(l.trim()).width);
    const bw = maxW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = W/2, by = H * 0.42;
    ctx.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${cAlpha * fillA})`;
    ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${cAlpha * borderA})`;
    ctx.lineWidth = 1;
    roundRect(ctx, bx - bw/2, by - bh/2, bw, bh, 14);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${cAlpha * fillA})`;
    ctx.beginPath();
    ctx.moveTo(bx - 12, by + bh/2);
    ctx.lineTo(bx, by + bh/2 + 16);
    ctx.lineTo(bx + 12, by + bh/2);
    ctx.fill();
    let wordIdx = 0;
    ctx.textAlign = 'left';
    const startY = by - bh/2 + padY + lineH / 2;
    for(let li = 0; li < lines.length; li++){
      const lineWords = lines[li].trim().split(' ');
      let lx = bx - maxW / 2;
      for(let wi = 0; wi < lineWords.length; wi++){
        const wordStagger = isBirth ? 0.25 : 0.12;
        const wordStart = wordIdx * wordStagger;
        const wordElapsed = Math.max(0, elapsed - wordStart);
        const wFade = isBirth ? 0.5 : 0.3;
        const wBounceDur = isBirth ? 0.5 : 0.35;
        const wAlpha = Math.min(wordElapsed / wFade, 1) * cAlpha;
        const bounce = wordElapsed < wBounceDur ? Math.sin(wordElapsed / wBounceDur * PI) * 4 : 0;
        const ww = ctx.measureText(lineWords[wi] + ' ').width;
        ctx.fillStyle = `rgba(255,255,255,${wAlpha * 0.85})`;
        ctx.fillText(lineWords[wi], lx, startY + li * lineH - bounce);
        lx += ww;
        wordIdx++;
      }
    }
    ctx.restore();
  }

  // Stars in screen space with parallax
  drawStarfield(0.15);

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
}
requestAnimationFrame(frame);

// ── Gate: hide UI during intro, game canvas visible underneath ─────
const introEl = document.getElementById('intro-sequence');
if(introEl){
  const ui=[document.querySelector('.top-controls'),document.querySelector('.bottom-left'),document.querySelector('.back-link'),document.getElementById('sound-hint')];
  ui.forEach(e=>{if(e)e.style.opacity='0'; e.style.transition='opacity 1.5s ease';});
  window.addEventListener('intro-complete',()=>{
    ui.forEach(e=>{if(e)e.style.opacity='1'});
  });
}

})();
