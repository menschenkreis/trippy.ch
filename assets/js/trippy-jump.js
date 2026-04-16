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

  // ── Color Themes ──
  const themes = [
    { name: 'deepsky', primary: [40,120,255], secondary: [200,220,255], accent: [100,180,255], bg: '#1e3a5f' },
    { name: 'violet',  primary: [140,100,255], secondary: [255,80,200], accent: [180,140,255], bg: '#08060f' },
    { name: 'cyan',    primary: [0,220,255],  secondary: [150,240,255], accent: [100,255,220], bg: '#060d12' },
    { name: 'ember',   primary: [255,140,60],  secondary: [255,50,120], accent: [255,180,80], bg: '#120806' },
    { name: 'jade',    primary: [80,255,160],  secondary: [180,80,255], accent: [100,255,180], bg: '#061208' },
    { name: 'void',    primary: [255,100,255], secondary: [100,180,255], accent: [200,150,255], bg: '#020005' }
  ];
  let themeIndex = 0;
  let theme = { ...themes[0] };
  
  function rgb(c, a) { return a !== undefined ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`; }

  // ── Persistence ──
  const SAVE_KEY = 'trippy-jump-save-v2';
  function saveGame() {
    if (!playing) return;
    const data = {
      score, cameraY, maxHeight, themeIndex, chillMode,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
      platforms: platforms.slice(-50).map(p => ({ ...p, opacity: 1 }))
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
    for (let i = 0; i < 5; i++) {
      mountains.push({ x: i * 400, w: 600, h: 200 + Math.random() * 200, c: 50 + Math.random() * 30 });
    }
    clouds = [];
    for (let i = 0; i < 15; i++) {
      clouds.push({ x: Math.random() * W, y: Math.random() * 1000 + 500, r: 50 + Math.random() * 100, s: 0.2 + Math.random() * 0.3 });
    }
    bgParticles = [];
    for (let i = 0; i < 100; i++) {
      bgParticles.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.5, s: Math.random() * 0.5 + 0.1, a: Math.random() * 0.8 + 0.2 });
    }
  }

  // ── Helpers ──
  function burst(x, y, color, count, type = 'dot') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = Math.random() * 4 + 1;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (type === 'spark' ? 2 : 0),
        life: 1.0, decay: 0.015 + Math.random() * 0.02, size: Math.random() * 3 + 1, color: color || theme.primary, type
      });
    }
  }

  function addShockwave(x, y, color) {
    shockwaves.push({ x, y, radius: 0, maxRadius: 100, alpha: 0.6, color: color || theme.primary });
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
    const baseGap = 95 * sphereSizeScale;
    while (y > toY) {
      y -= baseGap + Math.random() * 45 + Math.min(score / 120, 70);
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

      if (Math.random() < 0.05) {
        const pTypes = ['aura', 'nova', 'magnet'];
        powerUps.push({ x: x + w/2, y: y - 30, type: pTypes[Math.floor(Math.random()*pTypes.length)], alive: true, phase: Math.random()*TAU });
      }
    }
  }

  // ── Drawing ──
  function drawSg(cx, cy, r, alpha, sides = 6, rot = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgb(theme.primary);
    ctx.lineWidth = 0.5;
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
    let topColor = '#1e3a5f', botColor = '#2b5876';
    
    if (depth > 5000) {
      const f = Math.min((depth - 5000) / 10000, 1);
      topColor = lerpColor('#1e3a5f', '#020005', f);
      botColor = lerpColor('#2b5876', '#08060f', f);
    }
    if (depth > 15000) { topColor = '#010003'; botColor = '#050010'; }
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, botColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    if (depth < 8000) {
      const mAlpha = Math.max(0, 1 - depth / 6000);
      ctx.save();
      ctx.globalAlpha = mAlpha;
      mountains.forEach(m => {
        const mx = (m.x - cameraY * 0.05) % (W + 400) - 200;
        ctx.fillStyle = `rgba(${m.c},${m.c+15},${m.c+30}, 0.8)`;
        ctx.beginPath(); ctx.moveTo(mx, H); ctx.lineTo(mx + m.w/2, H - m.h); ctx.lineTo(mx + m.w, H); ctx.fill();
      });
      ctx.restore();
    }

    if (depth > 1000 && depth < 15000) {
      const cAlpha = depth < 5000 ? (depth-1000)/4000 : Math.max(0, 1-(depth-10000)/5000);
      ctx.save();
      ctx.globalAlpha = cAlpha;
      clouds.forEach(c => {
        const cy = (c.y - cameraY * c.s) % (H + 400) - 200;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(c.x, cy, c.r, 0, TAU); ctx.fill();
      });
      ctx.restore();
    }

    if (depth > 8000) {
      const sAlpha = Math.min(1, (depth - 8000) / 5000);
      ctx.save();
      ctx.globalAlpha = sAlpha;
      bgParticles.forEach(p => {
        const sy = (p.y - cameraY * p.s) % H;
        ctx.fillStyle = rgb(theme.accent, p.a);
        ctx.beginPath(); ctx.arc(p.x, sy, p.r, 0, TAU); ctx.fill();
      });
      for (let i = 0; i < 3; i++) {
        const r = (200 + i * 150) * sphereSizeScale;
        const tx = W/2 + Math.sin(time * 0.1 + i) * 100;
        const ty = H/2 + Math.cos(time * 0.15 + i) * 100;
        drawSg(tx, ty, r, 0.04 * sAlpha, 6 + i, time * 0.1);
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
    ctx.strokeStyle = rgb(theme.accent, 0.5 + Math.sin(time * 4) * 0.2);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    ctx.lineWidth = 1;
    for (let x = -50; x < W + 100; x += 100) {
      drawSg(x - (time * 40)%100, sy, 40, 0.2, 6, time);
    }
    ctx.restore();
  }

  function drawPowerUp(p) {
    if (!p.alive) return;
    const sy = p.y - cameraY;
    if (sy < -50 || sy > H + 50) return;
    ctx.save();
    const bob = Math.sin(time * 5 + p.phase) * 10;
    const color = p.type === 'aura' ? [100,255,200] : p.type === 'nova' ? [255,100,100] : [255,220,50];
    ctx.shadowColor = rgb(color, 0.8);
    ctx.shadowBlur = 15;
    drawSg(p.x, sy + bob, 20, 0.8, p.type === 'aura' ? 6 : p.type === 'nova' ? 8 : 4, time * 2);
    ctx.restore();
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.rotation);
    const pW = player.width * sphereSizeScale;

    if (player.powerUp) {
      ctx.save();
      const pc = player.powerUp === 'aura' ? [100,255,200] : player.powerUp === 'nova' ? [255,100,100] : [255,220,50];
      ctx.strokeStyle = rgb(pc, 0.4 + Math.sin(time*10)*0.2);
      ctx.lineWidth = 2;
      drawSg(0, 0, pW * 2.5, 0.5, 6, -time * 3);
      ctx.restore();
    }

    const g = ctx.createRadialGradient(0,0,0, 0,0, pW * 1.5);
    g.addColorStop(0, rgb(theme.secondary, 0.5));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0, pW * 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgb(theme.primary, 0.9);
    ctx.lineWidth = 2;
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      const rot = j === 0 ? time * 2 : -time * 1.5;
      for (let i = 0; i < 3; i++) {
        const a = (TAU / 3) * i + rot;
        const px = Math.cos(a) * pW * 0.7;
        const py = Math.sin(a) * pW * 0.7;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0,0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPlatform(p, sy) {
    if (!p.alive) return;
    ctx.save();
    ctx.globalAlpha = p.opacity;
    let color = theme.primary;
    if (p.type === 'spring') color = [255, 220, 50];
    if (p.type === 'fragile') color = [255, 100, 100];
    if (p.type === 'moving') color = [100, 255, 200];
    if (p.type === 'vanishing') color = [200, 150, 255];
    ctx.shadowColor = rgb(color, 0.6);
    ctx.shadowBlur = 10;
    ctx.strokeStyle = rgb(color, 0.8);
    ctx.lineWidth = 2;
    if (p.type === 'fragile') ctx.setLineDash([4, 2]);
    ctx.beginPath(); ctx.roundRect(p.x, sy, p.w, 10, 5); ctx.stroke();
    ctx.fillStyle = rgb(color, 0.15); ctx.fill();
    if (p.type === 'spring') {
      ctx.beginPath(); ctx.moveTo(p.x + p.w/2 - 10, sy); ctx.lineTo(p.x + p.w/2, sy - 8); ctx.lineTo(p.x + p.w/2 + 10, sy); ctx.stroke();
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

    player.vx += move * 0.85 * (sphereSizeScale < 1 ? 1 : 1.25);
    player.vx *= FRICTION;
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    player.rotation += player.vx * 0.06;

    if (player.x < 0) player.x = W;
    if (player.x > W) player.x = 0;

    const targetCam = player.y - H * 0.45;
    if (targetCam < cameraY) cameraY += (targetCam - cameraY) * 0.12;

    if (-player.y > maxHeight) {
      maxHeight = -player.y;
      score = Math.floor(maxHeight / 10);
    }

    if (player.powerUp) {
      player.powerTimer -= 0.016;
      if (player.powerTimer <= 0) player.powerUp = null;
      if (player.powerUp === 'nova' && time % 0.2 < 0.02) burst(player.x, player.y - cameraY, [255,100,100], 2, 'spark');
    }

    powerUps.forEach(p => {
      if (!p.alive) return;
      if (Math.hypot(player.x - p.x, (player.y - cameraY) - (p.y - cameraY)) < 40) {
        p.alive = false;
        player.powerUp = p.type;
        player.powerTimer = 8;
        addShockwave(p.x, p.y - cameraY, [255,255,255]);
        playNote(880, 'sine', 0.4, 1);
        if (p.type === 'nova') player.vy = SPRING_VEL * 1.5;
      }
    });

    if (chillMode && player.y - cameraY > H - 40) {
      player.y = cameraY + H - 40; player.vy = JUMP_VEL; playJumpSound(false);
      burst(player.x, H - 25, theme.accent, 15, 'spark');
    }

    if (player.vy > 0) {
      for (const p of platforms) {
        if (!p.alive) continue;
        if (player.y + 12 > p.y && player.y < p.y + 10 &&
            player.x > p.x && player.x < p.x + p.w) {
          let jump = JUMP_VEL;
          if (p.type === 'spring' || player.powerUp === 'aura') {
            jump = player.powerUp === 'aura' ? SPRING_VEL * 1.2 : SPRING_VEL;
            addShockwave(player.x, p.y - cameraY, [255, 220, 50]);
            burst(player.x, p.y - cameraY, [255, 255, 150], 20, 'spark');
          }
          if (p.type === 'fragile') { p.alive = false; burst(p.x + p.w/2, p.y - cameraY, [255, 100, 100], 12); }
          if (p.type === 'vanishing') p.fade = 1;
          player.vy = jump; playJumpSound(p.type === 'spring');
          burst(player.x, p.y - cameraY, theme.secondary, 10);
          break;
        }
      }
    }

    platforms.forEach(p => {
      if (p.type === 'moving') { p.x += p.vx; if (p.x < 0 || p.x + p.w > W) p.vx *= -1; }
      if (p.fade > 0) { p.fade += 0.05; p.opacity = Math.max(0, 1 - p.fade); if (p.opacity <= 0) p.alive = false; }
    });

    trail.push({ x: player.x, y: player.y, a: 1.0 });
    if (trail.length > 25) trail.shift();
    trail.forEach(t => t.a *= 0.9);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy;
      if (p.type === 'spark') p.vy += 0.18;
      p.life -= p.decay; if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]; s.radius += 5; s.alpha *= 0.92; if (s.alpha < 0.01) shockwaves.splice(i, 1);
    }

    if (platforms.length > 0 && platforms[platforms.length - 1].y > cameraY - 1000) generatePlatforms(platforms[platforms.length - 1].y, cameraY - 3000);
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
      trail.forEach(t => { ctx.fillStyle = rgb(theme.primary, t.a * 0.4); ctx.beginPath(); ctx.arc(t.x, t.y - cameraY, 5 * t.a, 0, TAU); ctx.fill(); });
      particles.forEach(p => { ctx.fillStyle = rgb(p.color, p.life); ctx.beginPath(); ctx.arc(p.x, p.y - cameraY, p.type === 'spark' ? p.size*(0.5+p.life) : p.size, 0, TAU); ctx.fill(); });
      shockwaves.forEach(s => { ctx.strokeStyle = rgb(s.color, s.alpha); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, TAU); ctx.stroke(); });
      drawPlayer(player.x, player.y - cameraY);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `200 ${2.8 * sphereSizeScale}rem sans-serif`; ctx.textAlign = 'center'; ctx.fillText(score, W/2, 70);
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

  // Use onclick assignment for stability
  document.getElementById('start-btn').onclick = (e) => {
    e.preventDefault();
    document.getElementById('start-screen').classList.add('hidden');
    initGame(false);
  };
  
  document.getElementById('play-again').onclick = (e) => {
    e.preventDefault();
    document.getElementById('game-over').classList.remove('is-active');
    initGame(false);
  };

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
      startBtn.onclick = (e) => {
        e.preventDefault();
        document.getElementById('start-screen').classList.add('hidden');
        initGame(true);
      };
      const sub = document.querySelector('#start-screen .sub');
      if (sub) sub.textContent = `last height: ${saved.score}`;
      
      const fresh = document.createElement('p');
      fresh.style.cssText = 'margin-top:1rem;font-size:0.7rem;color:rgba(140,100,255,0.6);cursor:pointer;text-decoration:underline';
      fresh.textContent = 'start fresh';
      fresh.onclick = (e) => {
        e.stopPropagation();
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      };
      document.getElementById('start-screen').appendChild(fresh);
    }
  }

  checkResume();
  requestAnimationFrame(render);
})();
