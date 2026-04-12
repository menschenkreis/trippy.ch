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

// ── Ragdoll ──────────────────────────────────────────────────────────────
class Ragdoll {
  constructor(x, y){
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
function collideParticleSphere(p, s, dt){
  const dx = p.x-s.x, dy = p.y-s.y;
  const d = Math.sqrt(dx*dx+dy*dy) || 0.001;
  const minD = (p.radius||3) + s.r;
  if(d < minD){
    const nx = dx/d, ny = dy/d;
    const overlap = minD - d;
    if(!p.pinned){
      // Push particle out
      p.x += nx * overlap * 0.4;
      p.y += ny * overlap * 0.4;
    }
    // Push the sphere away too (the key change)
    const pushForce = overlap * 0.6;
    s.x -= nx * pushForce;
    s.y -= ny * pushForce;
    // Transfer velocity (frictionless)
    const vx = p.x - p.ox, vy = p.y - p.oy;
    const dot = vx*nx + vy*ny;
    if(dot < 0){
      p.ox = p.x - (vx - 2*dot*nx)*0.8;
      p.oy = p.y - (vy - 2*dot*ny)*0.8;
    }
  }
}

function collideRagdollSphere(ragdoll, sphere, dt){
  for(const p of ragdoll.particles) collideParticleSphere(p, sphere, dt);
}

// ── State ────────────────────────────────────────────────────────────────
let ragdolls = [];
let spheres = [];
let time = 0;
let cameraY = 0; // camera offset — follows the ragdoll's descent
let fallSpeed = 0; // how deep the ragdoll has fallen

// Spawn initial
ragdolls.push(new Ragdoll(W/2, 0));
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
document.getElementById('theme-btn').onclick = () => setTheme(themeIdx+1);
document.getElementById('reset-btn').onclick = () => {
  isDragging = false; dragRagdoll = null; dragParticle = null;
  cameraY = 0; fallSpeed = 0;
  ragdolls = [new Ragdoll(W/2, 0)];
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

function drawBackground(){
  // Gradient background — screen-space
  const grad = ctx.createRadialGradient(W/2,H/2,0, W/2,H/2,Math.max(W,H)*0.7);
  grad.addColorStop(0, '#0e0e18');
  grad.addColorStop(1, theme.bg);
  // Fill screen-space first (behind world)
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0); // screen space
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);
  ctx.restore();

  // Subtle grid — world space, scrolls with camera
  const a = theme.accent;
  ctx.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},0.03)`;
  ctx.lineWidth = 0.5;
  const gridSize = 60;
  const startY = Math.floor(cameraY / gridSize) * gridSize;
  for(let x = 0; x < W; x += gridSize){
    ctx.beginPath(); ctx.moveTo(x, cameraY-10); ctx.lineTo(x, cameraY+H+10); ctx.stroke();
  }
  for(let y = startY; y < cameraY+H+gridSize; y += gridSize){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // Sacred geometry — world space, scrolls
  const cx = W/2, cy = cameraY + H*0.5;
  const pulse = 0.7 + 0.3*Math.sin(time*0.3);

  drawFlowerOfLife(cx, cy, 120*pulse, 0.04);
  drawMetatronsCube(cx, cy, 180*pulse, 0.025);
  drawGoldenSpiral(cx, cy, 250, time*0.1, 0.035);

  for(let i=0;i<4;i++){
    drawPolygon(cx, cy, 100+i*60, 3+i, time*0.05*(i%2===0?1:-1), 0.02+i*0.005);
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
  const a = theme.accent;
  const a2 = theme.accent2;

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

  ctx.restore();

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
