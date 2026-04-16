(function() {
  'use strict';

  // ── Canvas Setup ──
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W, H;
  let sphereSizeScale = 1.0;
  const TAU = Math.PI * 2;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    sphereSizeScale = isTouch ? 1.0 : Math.min(W / 800, 1.4);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Color Themes (Vibrant & Neon - Falling Emy Style) ──
  const themes = [
    { name: 'deepsky', primary: [40,150,255], secondary: [255,255,255], accent: [200,230,255], bg: '#0a0d14' },
    { name: 'violet',  primary: [180,100,255], secondary: [255,80,200], accent: [220,180,255], bg: '#08060f' },
    { name: 'cyan',    primary: [0,220,255],  secondary: [255,255,255], accent: [100,255,220], bg: '#060d12' },
    { name: 'ember',   primary: [255,120,40],  secondary: [255,220,100], accent: [255,180,80], bg: '#120806' },
    { name: 'jade',    primary: [40,255,140],  secondary: [200,255,200], accent: [180,255,100], bg: '#061208' },
    { name: 'void',    primary: [255,60,180],  secondary: [150,200,255], accent: [255,100,255], bg: '#020005' }
  ];
  let themeIndex = 0;
  let theme = { ...themes[0] };
  
  function rgb(c, a) { return a !== undefined ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`; }

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
  let highScore = parseInt(localStorage.getItem('trippyJumpHigh') || '0');
  let cameraY = 0;
  let maxHeight = 0;
  let muted = true;
  let time = 0;
  let chillMode = false;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    width: 24, height: 24,
    rotation: 0,
    powerUp: null,
    powerTimer: 0
  };

  const GRAVITY = 0.32;
  const JUMP_VEL = -11;
  const SPRING_VEL = -18;
  const FRICTION = 0.88;

  let platforms = [];
  let particles = [];
  let trail = [];
  let shockwaves = [];
  let bgParticles = [];
  let powerUps = [];
  let mountains = [];
  let clouds = [];

  const keys = {};
  let touchDir = 0;
  let tiltX = 0;

  // ── Audio Engine ──
  let audioCtx;
  let masterGain;
  let delayNode;

  function initAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.4;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.4;
    delayNode.connect(feedback);
    feedback.connect(delayNode);
    delayNode.connect(masterGain);
  }

  function playNote(freq, type = 'sine', vol = 0.4, dur = 0.5) {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(masterGain);
    if (delayNode) g.connect(delayNode);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  function playJumpSound(isSpring) {
    const base = isSpring ? 150 : 220;
    const freq = base + Math.min(score / 10, 600);
    playNote(freq, 'sine', 0.3, isSpring ? 1.2 : 0.6);
  }

  // ── Accelerometer ──
  let accelInited = false;
  function initAccel() {
    if (accelInited) return;
    const setupEvents = () => {
      window.addEventListener('deviceorientation', e => {
        let gamma = e.gamma;
        if (gamma === null) return;
        let angle = (window.screen && window.screen.orientation) ? window.screen.orientation.angle : (window.orientation || 0);
        let tilt = gamma;
        if (angle === 90) tilt = e.beta;
        else if (angle === -90) tilt = -e.beta;
        tiltX = Math.max(-1, Math.min(1, tilt / 30));
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
  }

  // ── Helpers ──
  function burst(x, y, color, count, type = 'dot') {
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
    shockwaves.push({ x, y, radius: 0, maxRadius: 120, alpha: 0.7, color: color || theme.primary });
  }

  // ── Init Game ──
  function initGame(restore = false) {
    const saved = restore ? loadGame() : null;
    score = saved ? saved.score : 0;
    cameraY = saved ? saved.cameraY : 0;
    maxHeight = saved ? saved.maxHeight : 0;
    themeIndex = saved ? saved.themeIndex : 0;
    theme = { ...themes[themeIndex] };
    chillMode = saved ? saved.chillMode : false;
    document.getElementById('chill-btn').classList.toggle('is-on', chillMode);

    gameOver = false;
    playing = true;
    particles = [];
    trail = [];
    shockwaves = [];
    powerUps = [];
    time = 0;

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
    // Adapt gap based on screen height to ensure desktop players aren't stranded
    const baseGap = Math.min(95 * sphereSizeScale, H * 0.12);
    const maxGapIncrease = Math.min(score / 120, H * 0.08);
    
    while (y > toY) {
      y -= baseGap + Math.random() * 45 + maxGapIncrease;
      const w = (60 + Math.random() * 25) * sphereSizeScale;
      const x = Math.random() * (W - w);

      let type = 'normal';
      const r = Math.random();
      const diff = Math.min(-y / 15000, 0.8);
      if (r < 0.06 + diff * 0.1) type = 'spring';
      else if (r < 0.15 + diff * 0.15) type = 'fragile';
      else if (r < 0.3 + diff * 0.15) type = 'moving';
      else if (r < 0.4 + diff * 0.1) type = 'vanishing';

      platforms.push({ x, y, w, h: 10, type, alive: true, opacity: 1, vx: (Math.random() - 0.5) * 4, fade: 0 });

      if (Math.random() < 0.06) {
        const pTypes = ['aura', 'nova', 'magnet'];
        powerUps.push({ x: x + w/2, y: y - 35, type: pTypes[Math.floor(Math.random()*pTypes.length)], alive: true, phase: Math.random()*TAU });
      }
    }
  }

  // ── Drawing ──
  function drawSg(cx, cy, r, alpha, sides = 6, rot = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgb(theme.primary);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (TAU / sides) * i + rot;
      ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.5, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBackground() {
    const depth = -cameraY;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    
    // Falling Emy Style Color Ramps
    let topColor = '#050a12', botColor = '#0f1420';
    if (depth < 8000) {
       const f = depth / 8000;
       topColor = lerpColor('#1e3a5f', '#050a12', f);
       botColor = lerpColor('#2b5876', '#0f1420', f);
    } else if (depth > 12000) {
       const f = Math.min((depth - 12000) / 10000, 1);
       topColor = lerpColor('#050a12', '#020005', f);
       botColor = lerpColor('#0f1420', theme.bg, f);
    }
    
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, botColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Mountains (Silhouettes)
    if (depth < 10000) {
      const mAlpha = Math.max(0, 1 - depth / 8000);
      ctx.save();
      ctx.globalAlpha = mAlpha;
      mountains.forEach(m => {
        const mx = (m.x - cameraY * 0.04) % (W + 500) - 250;
        const g = ctx.createLinearGradient(mx, H - m.h, mx, H);
        g.addColorStop(0, `rgba(${m.c},${m.c+10},${m.c+20}, 0.9)`);
        g.addColorStop(1, '#050a12');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(mx, H); ctx.lineTo(mx + m.w/2, H - m.h); ctx.lineTo(mx + m.w, H); ctx.fill();
      });
      ctx.restore();
    }

    // Clouds (Soft orbs)
    if (depth > 500 && depth < 15000) {
      const cAlpha = depth < 4000 ? (depth-500)/3500 : Math.max(0, 1-(depth-10000)/5000);
      ctx.save();
      ctx.globalAlpha = cAlpha;
      clouds.forEach(c => {
        const cy = (c.y - cameraY * c.s) % (H + 500) - 250;
        const g = ctx.createRadialGradient(c.x, cy, 0, c.x, cy, c.r);
        g.addColorStop(0, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, cy, c.r, 0, TAU); ctx.fill();
      });
      ctx.restore();
    }

    // Deep Cosmic Space
    if (depth > 8000) {
      const sAlpha = Math.min(1, (depth - 8000) / 4000);
      ctx.save();
      ctx.globalAlpha = sAlpha;
      bgParticles.forEach(p => {
        const sy = (p.y - cameraY * p.s) % H;
        ctx.fillStyle = rgb(theme.accent, p.a);
        ctx.beginPath(); ctx.arc(p.x, sy, p.r, 0, TAU); ctx.fill();
      });
      for (let i = 0; i < 4; i++) {
        const r = (150 + i * 180) * sphereSizeScale;
        const tx = W/2 + Math.sin(time * 0.08 + i) * 120;
        const ty = H/2 + Math.cos(time * 0.12 + i) * 120;
        drawSg(tx, ty, r, 0.05 * sAlpha, 6 + i, time * 0.05);
      }
      ctx.restore();
    }
    if (chillMode) drawChillBarrier();
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
    
    ctx.strokeStyle = rgb(color, 0.8);
    ctx.lineWidth = 2;
    for (let x = -50; x < W + 100; x += 80) {
      drawSg(x - (time * 60)%80, sy, 35, 0.3, 6, time);
    }
    ctx.restore();
  }

  function drawPowerUp(p) {
    if (!p.alive) return;
    const sy = p.y - cameraY;
    if (sy < -50 || sy > H + 50) return;
    ctx.save();
    const bob = Math.sin(time * 6 + p.phase) * 12;
    const color = p.type === 'aura' ? [100,255,200] : p.type === 'nova' ? [255,80,100] : [255,220,50];
    ctx.shadowColor = rgb(color, 0.9);
    ctx.shadowBlur = 20;
    drawSg(p.x, sy + bob, 22, 0.9, p.type === 'aura' ? 6 : p.type === 'nova' ? 8 : 4, time * 2.5);
    ctx.restore();
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.rotation);
    const pW = player.width * sphereSizeScale;

    // PowerUp Effects
    if (player.powerUp) {
      ctx.save();
      const pc = player.powerUp === 'aura' ? [100,255,200] : player.powerUp === 'nova' ? [255,80,100] : [255,220,50];
      ctx.strokeStyle = rgb(pc, 0.5 + Math.sin(time*12)*0.3);
      ctx.lineWidth = 3;
      drawSg(0, 0, pW * 2.8, 0.6, 6, -time * 4);
      ctx.restore();
    }

    // Main Body Glow
    const g = ctx.createRadialGradient(0,0,0, 0,0, pW * 1.8);
    g.addColorStop(0, rgb(theme.secondary, 0.6));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0, pW * 1.8, 0, TAU); ctx.fill();

    // Sacred Geometry Core
    ctx.strokeStyle = rgb(theme.primary, 1.0);
    ctx.shadowColor = rgb(theme.primary, 0.8);
    ctx.shadowBlur = 10;
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
    if (p.type === 'spring') color = [255, 220, 50];
    if (p.type === 'fragile') color = [255, 80, 100];
    if (p.type === 'moving') color = [100, 255, 200];
    if (p.type === 'vanishing') color = [220, 120, 255];

    ctx.shadowColor = rgb(color, 0.7);
    ctx.shadowBlur = 12;
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

    const targetIdx = Math.min(themes.length-1, Math.floor(maxHeight / 10000));
    if (themeIndex !== targetIdx) {
      themeIndex = targetIdx;
      theme.bg = themes[themeIndex].bg;
    }
    const targetTheme = themes[themeIndex];
    for (let i = 0; i < 3; i++) {
      theme.primary[i] += (targetTheme.primary[i] - theme.primary[i]) * 0.05;
      theme.secondary[i] += (targetTheme.secondary[i] - theme.secondary[i]) * 0.05;
    }

    let move = 0;
    if (keys['ArrowLeft'] || keys['a']) move = -1;
    if (keys['ArrowRight'] || keys['d']) move = 1;
    if (touchDir !== 0) move = touchDir;
    if (Math.abs(tiltX) > 0.1) move = tiltX;

    player.vx += move * 0.9 * (sphereSizeScale < 1 ? 1 : 1.3);
    player.vx *= FRICTION;
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    player.rotation += player.vx * 0.08;

    if (player.x < 0) player.x = W;
    if (player.x > W) player.x = 0;

    const targetCam = player.y - H * 0.45;
    if (targetCam < cameraY) cameraY += (targetCam - cameraY) * 0.15;

    if (-player.y > maxHeight) {
      maxHeight = -player.y;
      score = Math.floor(maxHeight / 10);
    }

    if (player.powerUp) {
      player.powerTimer -= 0.016;
      if (player.powerTimer <= 0) player.powerUp = null;
      if (player.powerUp === 'nova' && time % 0.15 < 0.02) burst(player.x, player.y - cameraY, [255,80,100], 3, 'spark');
    }

    powerUps.forEach(p => {
      if (!p.alive) return;
      if (Math.hypot(player.x - p.x, (player.y - cameraY) - (p.y - cameraY)) < 45) {
        p.alive = false;
        player.powerUp = p.type;
        player.powerTimer = 10;
        addShockwave(p.x, p.y - cameraY, [255,255,255]);
        playNote(880, 'sine', 0.5, 1.2);
        if (p.type === 'nova') player.vy = SPRING_VEL * 1.6;
      }
    });

    if (chillMode && player.y - cameraY > H - 40) {
      player.y = cameraY + H - 40; player.vy = JUMP_VEL; playJumpSound(false);
      burst(player.x, H - 25, theme.accent, 20, 'spark');
    }

    if (player.vy > 0) {
      for (const p of platforms) {
        if (!p.alive) continue;
        if (player.y + 12 > p.y && player.y < p.y + 10 &&
            player.x > p.x && player.x < p.x + p.w) {
          let jump = JUMP_VEL;
          if (p.type === 'spring' || player.powerUp === 'aura') {
            jump = player.powerUp === 'aura' ? SPRING_VEL * 1.3 : SPRING_VEL;
            addShockwave(player.x, p.y - cameraY, [255, 220, 50]);
            burst(player.x, p.y - cameraY, [255, 255, 150], 25, 'spark');
          }
          if (p.type === 'fragile') { p.alive = false; burst(p.x + p.w/2, p.y - cameraY, [255, 80, 100], 15); }
          if (p.type === 'vanishing') p.fade = 1;
          player.vy = jump; playJumpSound(p.type === 'spring');
          burst(player.x, p.y - cameraY, theme.secondary, 12);
          break;
        }
      }
    }

    platforms.forEach(p => {
      if (p.type === 'moving') { p.x += p.vx; if (p.x < 0 || p.x + p.w > W) p.vx *= -1; }
      if (p.fade > 0) { p.fade += 0.05; p.opacity = Math.max(0, 1 - p.fade); if (p.opacity <= 0) p.alive = false; }
    });

    trail.push({ x: player.x, y: player.y, a: 1.0 });
    if (trail.length > 30) trail.shift();
    trail.forEach(t => t.a *= 0.9);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy;
      if (p.type === 'spark') p.vy += 0.2;
      p.life -= p.decay; if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]; s.radius += 6; s.alpha *= 0.93; if (s.alpha < 0.01) shockwaves.splice(i, 1);
    }

    if (platforms.length > 0 && platforms[platforms.length - 1].y > cameraY - 1200) generatePlatforms(platforms[platforms.length - 1].y, cameraY - 3500);
    if (time % 3 < 0.02) saveGame();
    if (!chillMode && player.y - cameraY > H + 120) endGame();
  }

  function endGame() {
    playing = false; gameOver = true;
    if (score > highScore) { highScore = score; localStorage.setItem('trippyJumpHigh', highScore); }
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-high').textContent = 'BEST: ' + highScore;
    document.getElementById('game-over').classList.add('is-active');
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (playing || gameOver) {
      powerUps.forEach(drawPowerUp);
      platforms.forEach(p => { const sy = p.y - cameraY; if (sy > -50 && sy < H + 50) drawPlatform(p, sy); });
      trail.forEach(t => { ctx.fillStyle = rgb(theme.primary, t.a * 0.5); ctx.beginPath(); ctx.arc(t.x, t.y - cameraY, 6 * t.a, 0, TAU); ctx.fill(); });
      particles.forEach(p => { ctx.fillStyle = rgb(p.color, p.life); ctx.beginPath(); ctx.arc(p.x, p.y - cameraY, p.type === 'spark' ? p.size*(0.5+p.life) : p.size, 0, TAU); ctx.fill(); });
      shockwaves.forEach(s => { ctx.strokeStyle = rgb(s.color, s.alpha); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, TAU); ctx.stroke(); });
      drawPlayer(player.x, player.y - cameraY);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `200 ${3.0 * sphereSizeScale}rem sans-serif`; ctx.textAlign = 'center'; ctx.fillText(score, W/2, 80);
    }
    requestAnimationFrame(render);
    update();
  }

  // ── Listeners ──
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup', e => keys[e.key] = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); touchDir = e.touches[0].clientX < W/2 ? -1 : 1; initAudio(); initAccel(); }, {passive:false});
  canvas.addEventListener('touchend', () => touchDir = 0);
  canvas.addEventListener('mousedown', e => { touchDir = e.clientX < W/2 ? -1 : 1; initAudio(); initAccel(); });
  canvas.addEventListener('mouseup', () => touchDir = 0);

  document.getElementById('start-btn').onclick = (e) => { e.preventDefault(); document.getElementById('start-screen').classList.add('hidden'); initGame(false); };
  document.getElementById('play-again').onclick = (e) => { e.preventDefault(); document.getElementById('game-over').classList.remove('is-active'); initGame(false); };
  document.getElementById('theme-btn').onclick = () => { themeIndex = (themeIndex + 1) % themes.length; theme = { ...themes[themeIndex] }; };
  document.getElementById('chill-btn').onclick = function() { chillMode = !chillMode; this.classList.toggle('is-on', chillMode); };
  document.getElementById('mute-btn').onclick = function() { muted = !muted; this.textContent = muted ? '🔊' : '🔇'; this.classList.toggle('is-on', !muted); initAudio(); };
  document.getElementById('info-btn').onclick = () => document.getElementById('info-panel').classList.toggle('is-open');
  document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.remove('is-open');

  function checkResume() {
    const saved = loadGame();
    if (saved && saved.score > 20) {
      const startBtn = document.getElementById('start-btn');
      startBtn.textContent = 'RESUME JOURNEY';
      startBtn.onclick = (e) => { e.preventDefault(); document.getElementById('start-screen').classList.add('hidden'); initGame(true); };
      const sub = document.querySelector('#start-screen .sub');
      if (sub) sub.textContent = `last height: ${saved.score}`;
      const fresh = document.createElement('p');
      fresh.style.cssText = 'margin-top:1rem;font-size:0.7rem;color:rgba(140,100,255,0.6);cursor:pointer;text-decoration:underline';
      fresh.textContent = 'start fresh';
      fresh.onclick = (e) => { e.stopPropagation(); localStorage.removeItem(SAVE_KEY); location.reload(); };
      document.getElementById('start-screen').appendChild(fresh);
    }
  }

  checkResume();
  requestAnimationFrame(render);
})();
