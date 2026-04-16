(function() {
  'use strict';

  // ── Canvas Setup ──
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W, H;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Color Themes (Psychedelic Palettes) ──
  const themes = [
    { name: 'violet', primary: [140,100,255], secondary: [255,80,200], accent: [180,140,255], bg: '#08060f' },
    { name: 'cyan',   primary: [0,220,255],  secondary: [150,240,255], accent: [100,255,220], bg: '#060d12' },
    { name: 'ember',  primary: [255,140,60],  secondary: [255,50,120], accent: [255,180,80], bg: '#120806' },
    { name: 'jade',   primary: [80,255,160],  secondary: [180,80,255], accent: [100,255,180], bg: '#061208' },
    { name: 'cosmic', primary: [255,100,255], secondary: [100,180,255], accent: [200,150,255], bg: '#0a0810' }
  ];
  let themeIndex = 0;
  let theme = { ...themes[0] };
  
  function rgb(c, a) { return a !== undefined ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`; }

  // ── Game State ──
  let playing = false;
  let gameOver = false;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('trippyJumpHigh') || '0');
  let cameraY = 0;
  let maxHeight = 0;
  let muted = true;
  let time = 0;

  // Player
  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    width: 24, height: 24,
    rotation: 0
  };

  // Physics
  const GRAVITY = 0.32;
  const JUMP_VEL = -11;
  const SPRING_VEL = -18;
  const FRICTION = 0.88;

  // Platforms
  let platforms = [];
  const PLATFORM_W = 65;
  const PLATFORM_H = 10;
  const PLATFORM_GAP_BASE = 90;

  // Particles & Effects
  let particles = [];
  let trail = [];
  let shockwaves = [];
  let bgParticles = [];

  // Input
  const keys = {};
  let touchDir = 0;

  // ── Audio Engine (from Falling Emy) ──
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
    const freq = base + Math.min(score / 10, 400);
    playNote(freq, 'sine', 0.3, isSpring ? 1.2 : 0.6);
    if (isSpring) playNote(freq * 1.5, 'sine', 0.15, 1.0);
  }

  // ── Helpers ──
  function burst(x, y, color, count, type = 'dot') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'spark' ? 2 : 0),
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        size: Math.random() * 3 + 1,
        color: color || theme.primary,
        type: type
      });
    }
  }

  function addShockwave(x, y, color) {
    shockwaves.push({ x, y, radius: 0, maxRadius: 80, alpha: 0.6, color: color || theme.primary });
  }

  // ── Init Game ──
  function initGame() {
    score = 0;
    cameraY = 0;
    maxHeight = 0;
    gameOver = false;
    playing = true;
    particles = [];
    trail = [];
    shockwaves = [];
    time = 0;

    player.x = W / 2;
    player.y = H - 150;
    player.vx = 0;
    player.vy = JUMP_VEL;

    platforms = [];
    // Start platform
    platforms.push({ x: W/2 - 50, y: H - 100, w: 100, h: PLATFORM_H, type: 'normal', alive: true, opacity: 1 });
    generatePlatforms(H - 100, H - 3000);

    bgParticles = [];
    for (let i = 0; i < 50; i++) {
      bgParticles.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2 + 0.5, s: Math.random() * 0.5 + 0.2, a: Math.random() * 0.4 + 0.1 });
    }
  }

  function generatePlatforms(fromY, toY) {
    let y = fromY;
    while (y > toY) {
      y -= PLATFORM_GAP_BASE + Math.random() * 40 + Math.min(score / 150, 60);
      const w = PLATFORM_W + Math.random() * 20;
      const x = Math.random() * (W - w);

      let type = 'normal';
      const r = Math.random();
      const diff = Math.min(-y / 10000, 0.7);
      if (r < 0.06 + diff * 0.1) type = 'spring';
      else if (r < 0.15 + diff * 0.15) type = 'fragile';
      else if (r < 0.28 + diff * 0.15) type = 'moving';
      else if (r < 0.38 + diff * 0.1) type = 'vanishing';

      platforms.push({ x, y, w, h: PLATFORM_H, type, alive: true, opacity: 1, vx: (Math.random() - 0.5) * 3, fade: 0 });
    }
  }

  // ── Drawing ──
  function drawSg(cx, cy, r, alpha, sides = 6) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgb(theme.primary);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 / sides) * i + time * 0.2;
      ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.5, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H));
    g.addColorStop(0, '#0a0815');
    g.addColorStop(1, theme.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Motes
    for (const p of bgParticles) {
      const sy = (p.y + cameraY * p.s) % H;
      ctx.fillStyle = rgb(theme.accent, p.a);
      ctx.beginPath();
      ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sacred Geometry layers
    for (let i = 0; i < 3; i++) {
      const r = 150 + i * 100;
      const tx = W/2 + Math.sin(time * 0.1 + i) * 50;
      const ty = H/2 + Math.cos(time * 0.15 + i) * 50;
      drawSg(tx, ty, r, 0.03 + i * 0.01, 6 + i);
    }
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.rotation);

    // Glow
    const g = ctx.createRadialGradient(0,0,0, 0,0, player.width * 1.5);
    g.addColorStop(0, rgb(theme.secondary, 0.4));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0, player.width * 1.5, 0, Math.PI * 2); ctx.fill();

    // Body (Merkaba-ish)
    ctx.strokeStyle = rgb(theme.primary, 0.9);
    ctx.lineWidth = 2;
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      const rot = j === 0 ? time * 2 : -time * 1.5;
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 / 3) * i + rot;
        const px = Math.cos(a) * player.width * 0.6;
        const py = Math.sin(a) * player.width * 0.6;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    
    // Core
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0,0, 3, 0, Math.PI * 2); ctx.fill();

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

    // Neon Glow
    ctx.shadowColor = rgb(color, 0.6);
    ctx.shadowBlur = 10;
    
    ctx.strokeStyle = rgb(color, 0.8);
    ctx.lineWidth = 2;
    if (p.type === 'fragile') ctx.setLineDash([4, 2]);
    
    // Platform shape
    ctx.beginPath();
    ctx.roundRect(p.x, sy, p.w, p.h, 5);
    ctx.stroke();
    ctx.fillStyle = rgb(color, 0.15);
    ctx.fill();

    if (p.type === 'spring') {
      ctx.beginPath();
      ctx.moveTo(p.x + p.w/2 - 10, sy);
      ctx.lineTo(p.x + p.w/2, sy - 8);
      ctx.lineTo(p.x + p.w/2 + 10, sy);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Update ──
  function update() {
    if (!playing) return;
    time += 0.016;

    // Smooth Theme Transition based on height
    const targetIdx = Math.floor(maxHeight / 8000) % themes.length;
    if (themeIndex !== targetIdx) {
      themeIndex = targetIdx;
      const t = themes[themeIndex];
      theme.bg = t.bg;
      // We could lerp the colors here for extra trippiness
    }
    const targetTheme = themes[themeIndex];
    for (let i = 0; i < 3; i++) {
      theme.primary[i] += (targetTheme.primary[i] - theme.primary[i]) * 0.05;
      theme.secondary[i] += (targetTheme.secondary[i] - theme.secondary[i]) * 0.05;
    }

    // Input
    let move = 0;
    if (keys['ArrowLeft'] || keys['a']) move = -1;
    if (keys['ArrowRight'] || keys['d']) move = 1;
    if (touchDir !== 0) move = touchDir;

    player.vx += move * 0.8;
    player.vx *= FRICTION;
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    player.rotation += player.vx * 0.05;

    // Screen Wrap
    if (player.x < 0) player.x = W;
    if (player.x > W) player.x = 0;

    // Camera
    const targetCam = player.y - H * 0.45;
    if (targetCam < cameraY) cameraY += (targetCam - cameraY) * 0.1;

    // Score
    if (-player.y > maxHeight) {
      maxHeight = -player.y;
      score = Math.floor(maxHeight / 10);
    }

    // Collisions
    if (player.vy > 0) {
      for (const p of platforms) {
        if (!p.alive) continue;
        if (player.y + player.height/2 > p.y && player.y < p.y + p.h &&
            player.x > p.x && player.x < p.x + p.w) {
          
          let jump = JUMP_VEL;
          if (p.type === 'spring') {
            jump = SPRING_VEL;
            addShockwave(player.x, p.y - cameraY, [255, 220, 50]);
            burst(player.x, p.y - cameraY, [255, 255, 150], 15, 'spark');
          }
          if (p.type === 'fragile') {
            p.alive = false;
            burst(p.x + p.w/2, p.y - cameraY, [255, 100, 100], 10);
          }
          if (p.type === 'vanishing') p.fade = 1;

          player.vy = jump;
          playJumpSound(p.type === 'spring');
          burst(player.x, p.y - cameraY, theme.secondary, 8);
          break;
        }
      }
    }

    // Platforms
    for (const p of platforms) {
      if (p.type === 'moving') {
        p.x += p.vx;
        if (p.x < 0 || p.x + p.w > W) p.vx *= -1;
      }
      if (p.fade > 0) {
        p.fade += 0.05;
        p.opacity = Math.max(0, 1 - p.fade);
        if (p.opacity <= 0) p.alive = false;
      }
    }

    // Particles & Trail
    trail.push({ x: player.x, y: player.y, a: 1.0 });
    if (trail.length > 20) trail.shift();
    for (const t of trail) t.a *= 0.92;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.type === 'spark') p.vy += 0.15;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.radius += 4;
      s.alpha *= 0.9;
      if (s.alpha < 0.01) shockwaves.splice(i, 1);
    }

    // Generation / Cleanup
    if (platforms[platforms.length - 1].y > cameraY - 1000) {
      generatePlatforms(platforms[platforms.length - 1].y, cameraY - 3000);
    }
    if (platforms.length > 50) platforms.shift();

    if (player.y - cameraY > H + 100) endGame();
  }

  function endGame() {
    playing = false;
    gameOver = true;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('trippyJumpHigh', highScore);
    }
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-high').textContent = 'BEST: ' + highScore;
    document.getElementById('game-over').classList.add('is-active');
  }

  // ── Rendering Loop ──
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    if (playing || gameOver) {
      // Platforms
      for (const p of platforms) {
        const sy = p.y - cameraY;
        if (sy > -50 && sy < H + 50) drawPlatform(p, sy);
      }

      // Trail
      for (let i = 0; i < trail.length - 1; i++) {
        const t = trail[i];
        ctx.fillStyle = rgb(theme.primary, t.a * 0.3);
        ctx.beginPath(); ctx.arc(t.x, t.y - cameraY, 4 * t.a, 0, Math.PI * 2); ctx.fill();
      }

      // Particles
      for (const p of particles) {
        ctx.fillStyle = rgb(p.color, p.life);
        ctx.beginPath();
        const size = p.type === 'spark' ? p.size * (0.5 + p.life) : p.size;
        ctx.arc(p.x, p.y - cameraY, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shockwaves
      for (const s of shockwaves) {
        ctx.strokeStyle = rgb(s.color, s.alpha);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.stroke();
      }

      drawPlayer(player.x, player.y - cameraY);

      // Score
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '200 2.5rem sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(score, W/2, 60);
    }

    requestAnimationFrame(render);
    update();
  }

  // ── Listeners ──
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup', e => keys[e.key] = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); touchDir = e.touches[0].clientX < W/2 ? -1 : 1; initAudio(); }, {passive:false});
  canvas.addEventListener('touchend', () => touchDir = 0);
  canvas.addEventListener('mousedown', e => { touchDir = e.clientX < W/2 ? -1 : 1; initAudio(); });
  canvas.addEventListener('mouseup', () => touchDir = 0);

  document.getElementById('start-btn').onclick = () => {
    document.getElementById('start-screen').classList.add('hidden');
    initGame();
  };
  document.getElementById('play-again').onclick = () => {
    document.getElementById('game-over').classList.remove('is-active');
    initGame();
  };
  document.getElementById('theme-btn').onclick = () => {
    themeIndex = (themeIndex + 1) % themes.length;
    theme = { ...themes[themeIndex] };
  };
  document.getElementById('mute-btn').onclick = function() {
    muted = !muted;
    this.textContent = muted ? '🔇' : '🔊';
    this.classList.toggle('is-on', !muted);
    initAudio();
  };
  document.getElementById('info-btn').onclick = () => {
    document.getElementById('info-panel').classList.toggle('is-open');
  };
  document.getElementById('close-panel').onclick = () => {
    document.getElementById('info-panel').classList.remove('is-open');
  };

  requestAnimationFrame(render);
})();
