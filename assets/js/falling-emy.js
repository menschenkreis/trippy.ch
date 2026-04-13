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
  { accent:[140,100,255], accent2:[255,100,180], bg:'#0a0a0f', name:'violet' },
  { accent:[100,220,255], accent2:[255,180,100], bg:'#080c10', name:'aqua' },
  { accent:[255,140,60],  accent2:[255,80,120],  bg:'#0f0a08', name:'ember' },
  { accent:[80,255,160],  accent2:[180,100,255], bg:'#080f0a', name:'jade' },
];
let themeIdx = 0;
let theme = themes[0];
function setTheme(i){ themeIdx = i % themes.length; theme = themes[themeIdx]; }

// ── Physics constants ────────────────────────────────────────────────────
const GRAVITY = 500;
const DAMPING = 0.998;
const ITERATIONS = 8;
const SUBSTEPS = 2;

let gravityX = 0, gravityY = GRAVITY;
let isDragging = false;
let isSlowed = false;
let timeScale = 1.0;
let targetTimeScale = 1.0;
let dragRagdoll = null;
let dragParticle = null;

// ── Accelerometer ────────────────────────────────────────────────────────
let accelInited = false;
function initAccel() {
  if (accelInited) return;
  accelInited = true;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(perm => {
      if (perm === 'granted') {
        window.addEventListener('deviceorientation', onOrientation, {passive: true});
      }
    }).catch(console.error);
  } else {
    window.addEventListener('deviceorientation', onOrientation, {passive: true});
  }
}

function onOrientation(e) {
  // gamma: left-to-right tilt in degrees [-90, 90]
  let gamma = e.gamma || 0;
  let tiltX = Math.max(-45, Math.min(45, gamma)) / 45; // -1 to 1
  gravityX = tiltX * GRAVITY * 0.8;
}
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
  constructor(x, y, r){
    this.x = x; this.y = y;
    this.r = r || (15 + Math.random()*35);
    this.vx = 0;
    this.vy = 0;
    this.rotation = Math.random()*TAU;
    this.rotSpeed = (Math.random()-0.5)*0.02;
    this.hue = Math.random()*360;
    this.segments = 3 + Math.floor(Math.random()*5); // sacred geometry sides
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
    this.accent = hslToRgbArr(this.hue, 0.85, 0.6);
    this.accent2 = hslToRgbArr((this.hue + 40)%360, 0.9, 0.75);

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
let lastImpactTime = 0;
let isMuted = true;

function initAudio(){
  if(audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.4;
  
  // Reverb/Delay for spatial void echo
  const delay = audioCtx.createDelay();
  delay.delayTime.value = 0.4;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.45;
  
  // Lowpass filter on the echo to make it fade into the distance
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  delay.connect(filter);
  filter.connect(feedback);
  feedback.connect(delay);
  delay.connect(masterGain);
  
  masterGain.connect(delay);
  masterGain.connect(audioCtx.destination);
}

function playImpactSound(force, hue, xPos){
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
  
  const vol = Math.min(force * 0.015, 0.5);
  const duration = 0.3 + Math.min(force * 0.01, 1.5);
  
  // Stereo panning based on horizontal collision position
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createGain();
  if(panner.pan) panner.pan.value = Math.max(-1, Math.min(1, (xPos / W) * 2 - 1));

  // Osc 1: Sine (round body)
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, now);
  
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(vol * 0.8, now + 0.005);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Osc 2: Triangle (bright, plucky attack)
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(freq * 2, now); // an octave up
  
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(vol * 0.5, now + 0.002);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.25); // decays much faster

  osc1.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(panner);
  gain2.connect(panner);
  panner.connect(masterGain);

  osc1.start(now);
  osc1.stop(now + duration + 0.1);
  osc2.start(now);
  osc2.stop(now + duration + 0.1);
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
    playImpactSound(impactData.maxForce, sphere.hue, sphere.x);
  }
}

// ── Impact particles ─────────────────────────────────────────────────────
let particles = [];
const MAX_PARTICLES = 200;

function spawnImpactParticles(x, y, hue){
  const count = 8 + Math.floor(Math.random()*8);
  for(let i=0;i<count;i++){
    if(particles.length >= MAX_PARTICLES) particles.shift();
    const angle = Math.random() * TAU;
    const speed = 30 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 1.0,
      decay: 0.6 + Math.random() * 1.2,
      size: 1 + Math.random() * 3,
      hue: hue + Math.random() * 60 - 30,
      sparkle: Math.random() > 0.6, // some get cross sparkle
    });
  }
}

function updateParticles(dt){
  for(let i = particles.length-1; i >= 0; i--){
    const p = particles[i];
    p.vy += 80 * dt; // slight gravity
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= p.decay * dt;
    if(p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(){
  for(const p of particles){
    const alpha = p.life * 0.8;
    const twinkle = 0.5 + 0.5 * Math.sin(time * 8 + p.hue);
    const s = p.size * (0.5 + 0.5 * twinkle) * p.life;

    // Glow
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s*3);
    grad.addColorStop(0, `hsla(${p.hue},80%,70%,${alpha*0.4})`);
    grad.addColorStop(1, `hsla(${p.hue},80%,50%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, p.y, s*3, 0, TAU); ctx.fill();

    // Core
    ctx.fillStyle = `hsla(${p.hue},70%,85%,${alpha})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();

    // Cross sparkle for sparkly ones
    if(p.sparkle && p.life > 0.4){
      const len = s * 4 * p.life;
      ctx.strokeStyle = `hsla(${p.hue},60%,80%,${alpha*0.3})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(p.x-len, p.y); ctx.lineTo(p.x+len, p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y-len); ctx.lineTo(p.x, p.y+len); ctx.stroke();
    }
  }
}

// ── State ────────────────────────────────────────────────────────────────
let ragdolls = [];
let spheres = [];
let time = 0;
let cameraY = 0; // camera offset — follows the ragdoll's descent
let fallSpeed = 0; // how deep the ragdoll has fallen

// Spawn initial
ragdolls.push(new Ragdoll(W/2, 0, 'emy'));
for(let i=0;i<8;i++) spawnSphereAtDepth(i * 120 + Math.random()*80);

function spawnSphereAtDepth(yWorld){
  spheres.push(new Sphere(
    Math.random()*W,
    yWorld,
    15 + Math.random()*40
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
    const p = r.closestParticle(x,y);
    if(p){
      isDragging = true;
      dragRagdoll = r;
      dragParticle = p;
      dragOffsetX = p.x-x; dragOffsetY = p.y-y;
      // Freeze ragdoll
      for(const pp of r.particles){ pp._wasPinned = pp.pinned; pp.pinned = true; }
      break;
    }
  }
});
canvas.addEventListener('pointermove', e => {
  touchX = e.clientX; touchY = e.clientY;
  if(isDragging && dragRagdoll && dragParticle){
    // Move grabbed particle to finger position (in screen coords)
    const targetX = e.clientX + dragOffsetX;
    const targetY = e.clientY + dragOffsetY;
    const dx = targetX - dragParticle.x;
    const dy = targetY - dragParticle.y;
    // Move entire ragdoll by the delta
    for(const p of dragRagdoll.particles){
      p.x += dx; p.y += dy;
      p.ox = p.x; p.oy = p.y;
    }
    // Adjust camera so ragdoll stays centered vertically
    const head = dragRagdoll.particles[0];
    cameraY += (head.y - cameraY - H*0.35) * 0.15;
  }
});
function releaseDrag(){
  if(isDragging && dragRagdoll){
    for(const p of dragRagdoll.particles){ p.pinned = p._wasPinned || false; }
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
  if(!isMuted) initAudio();
};
document.getElementById('reset-btn').onclick = () => {
  isDragging = false; dragRagdoll = null; dragParticle = null;
  cameraY = 0; fallSpeed = 0;
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
    const hue = (hueOffset + i * (360/folds) + time*20) % 360;
    const hue2 = (hue + 40) % 360;
    const r1 = radius * (0.6 + 0.4*Math.sin(time*0.4 + i*0.8));
    const r2 = radius * (0.4 + 0.3*Math.cos(time*0.3 + i*1.1));

    // Petal glow
    const grad = ctx.createRadialGradient(
      cx + Math.cos(angle1)*r1*0.3, cy + Math.sin(angle1)*r1*0.3, 0,
      cx, cy, radius
    );
    grad.addColorStop(0, `hsla(${hue},70%,55%,${alpha*1.5})`);
    grad.addColorStop(0.5, `hsla(${hue2},60%,40%,${alpha*0.6})`);
    grad.addColorStop(1, `hsla(${hue},50%,20%,0)`);
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
      const brightness = 0.15 + h1 * 0.6; // 0.15 - 0.39
      const size = 0.5 + h3 * 1.5;
      const twinkleSpeed = 1.0 + h2 * 4.0;
      const twinklePhase = h1 * TAU * 10;

      // Twinkle
      const twinkle = 0.5 + 0.5 * Math.sin(time * twinkleSpeed + twinklePhase);
      const alpha = brightness * (0.4 + 0.6 * twinkle);

      // Colour — slight variation
      const hue = (h2 * 360 + h3 * 60 + time * 5) % 360;
      const sat = 20 + h1 * 40; // mostly white-ish
      const light = 70 + twinkle * 25;

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

  // Glow
  const a2 = theme.accent2;
  const grad = ctx.createRadialGradient(s.x,s.y,0, s.x,s.y,r*1.5);
  grad.addColorStop(0, `rgba(${a2[0]},${a2[1]},${a2[2]},0.06)`);
  grad.addColorStop(1, `rgba(${a2[0]},${a2[1]},${a2[2]},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(s.x,s.y,r*1.5,0,TAU); ctx.fill();

  // Sacred geometry polygon fill
  const hue = (s.hue + time*15) % 360;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);

  // Outer polygon
  ctx.strokeStyle = `hsla(${hue},60%,55%,0.25)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i=0;i<=s.segments;i++){
    const angle = i*TAU/s.segments;
    const px = Math.cos(angle)*r, py = Math.sin(angle)*r;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  // Inner sacred geometry
  ctx.strokeStyle = `hsla(${hue},50%,50%,0.12)`;
  ctx.lineWidth = 0.5;
  // Inner polygon (rotated)
  ctx.beginPath();
  for(let i=0;i<=s.segments;i++){
    const angle = i*TAU/s.segments + PI/s.segments;
    const px = Math.cos(angle)*r*0.5, py = Math.sin(angle)*r*0.5;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  // Connecting lines (star pattern)
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

  // Inner circle
  ctx.strokeStyle = `hsla(${hue},45%,50%,0.15)`;
  ctx.beginPath(); ctx.arc(0,0,r*0.35,0,TAU); ctx.stroke();

  // Center dot
  ctx.fillStyle = `hsla(${hue},60%,60%,0.3)`;
  ctx.beginPath(); ctx.arc(0,0,2,0,TAU); ctx.fill();

  ctx.restore();
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
    const head = ragdolls[0].particles[0];
    // Smoothly follow the ragdoll's head, keeping it at ~35% from top
    const targetCam = head.y - H * 0.35;
    cameraY += (targetCam - cameraY) * 0.08;
  }
  // Spawn new spheres ahead of the camera
  const aheadY = cameraY + H + 200;
 while(spheres.length < 12){
    spawnSphereAtDepth(aheadY + Math.random()*300);
  }
}

function recycleObjects(){
  const behindY = cameraY - 300;
  spheres = spheres.filter(s => s.y > behindY);
  // Keep spawning
  const aheadY = cameraY + H + 100;
  while(spheres.length < 10){
    spawnSphereAtDepth(aheadY + Math.random()*400);
  }
}

// ── Main loop ────────────────────────────────────────────────────────────
let lastTime = 0;
function frame(now){
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - lastTime)/1000, 0.033);
  lastTime = now;

  // Smoothly interpolate time scale
  timeScale += (targetTimeScale - timeScale) * 0.12;

  time += rawDt;
  const dt = (rawDt * timeScale) / SUBSTEPS;

  // Physics substeps
  for(let s=0;s<SUBSTEPS;s++){
    for(const r of ragdolls) r.update(dt);
    // No sphere physics — they're static obstacles
    for(const r of ragdolls){
      for(const sp of spheres) collideRagdollSphere(r, sp);
    }
  }

  // Update impact particles
  updateParticles(dt * timeScale);

  // Clamp ragdoll to screen width
  for(const r of ragdolls){
    for(const p of r.particles){
      if(p.x < 20){ p.x = 20; p.ox = 20; }
      if(p.x > W-20){ p.x = W-20; p.ox = W-20; }
    }
  }

  updateCamera();
  recycleObjects();

  // ── Draw ───────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(0, -cameraY); // camera transform

  drawBackground();
  for(const s of spheres) drawSphere(s);
  for(const r of ragdolls) drawRagdoll(r);
  drawParticles();

  ctx.restore();

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

  // Stars in screen space with parallax
  drawStarfield(0.15);

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

})();
