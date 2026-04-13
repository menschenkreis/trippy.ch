// ── Intro Sequence — Emy's Birth Narrative (Canvas 2D) ──────────────────
(function () {
  const intro = document.getElementById('intro-sequence');
  if (!intro) return;

  const canvas = document.getElementById('intro-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W, H, time = 0;
  let phase = 'void';
  let phaseStart = 0;
  let mouseX = 0.5, mouseY = 0.5;
  let brightness = 1.0;
  let targetBrightness = 1.0;
  let fadeOut = 0;
  let birthStarted = false;
  let raf;

  const VOID_DURATION = 3000;
  const THOUGHT_DELAY = 1500;
  const PROMPT_DELAY = 2000;
  const TAU = Math.PI * 2;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Sacred Geometry Drawing Helpers ──────────────────────────────────
  function drawCircle(x, y, r, color, alpha, lineWidth) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
  }

  function drawLine(x1, y1, x2, y2, color, alpha, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth || 0.8;
    ctx.stroke();
  }

  function drawFlowerOfLife(cx, cy, r, color, alpha) {
    // Center
    drawCircle(cx, cy, r, color, alpha, 1);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const ox = cx + Math.cos(a) * r;
      const oy = cy + Math.sin(a) * r;
      drawCircle(ox, oy, r, color, alpha, 1);
      // Second ring
      for (let j = 0; j < 6; j++) {
        const a2 = j * TAU / 6 + a;
        drawCircle(ox + Math.cos(a2) * r, oy + Math.sin(a2) * r, color, color, alpha * 0.6, 0.6);
      }
    }
  }

  function drawMetatronsCube(cx, cy, r, color, alpha) {
    const pts = [[0, 0]];
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      pts.push([Math.cos(a) * r * 2, Math.sin(a) * r * 2]);
    }
    // Inner to outer connections
    for (let i = 1; i <= 6; i++) {
      for (let j = 7; j <= 12; j++) {
        drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[j][0], cy + pts[j][1], color, alpha, 0.6);
      }
    }
    // Outer ring
    for (let i = 7; i <= 12; i++) {
      const next = i === 12 ? 7 : i + 1;
      drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[next][0], cy + pts[next][1], color, alpha, 0.7);
    }
    // Inner ring
    for (let i = 1; i <= 6; i++) {
      const next = i === 6 ? 1 : i + 1;
      drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[next][0], cy + pts[next][1], color, alpha, 0.7);
    }
    // Inner hex cross-connections
    for (let i = 1; i <= 6; i++) {
      for (let j = i + 2; j <= 6; j++) {
        if (j !== 7 - i) {
          drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[j][0], cy + pts[j][1], color, alpha * 0.5, 0.5);
        }
      }
    }
  }

  // ── DOM Elements ─────────────────────────────────────────────────────
  const thoughtBubble = document.getElementById('intro-thought');
  const promptArea = document.getElementById('intro-prompt');
  const embarkBtn = document.getElementById('intro-embark');

  // ── Phase Management ─────────────────────────────────────────────────
  function setPhase(newPhase) {
    phase = newPhase;
    phaseStart = performance.now();
    if (phase === 'thought') {
      thoughtBubble.classList.add('visible');
    } else if (phase === 'prompt') {
      promptArea.classList.add('visible');
    } else if (phase === 'born') {
      startBirth();
    }
  }

  function startBirth() {
    if (birthStarted) return;
    birthStarted = true;
    targetBrightness = 0.0;
    thoughtBubble.classList.remove('visible');
    promptArea.classList.remove('visible');

    setTimeout(() => {
      fadeOut = 1.0;
      intro.style.opacity = '0';
      intro.style.transition = 'opacity 1.5s ease';
      setTimeout(() => {
        intro.style.display = 'none';
        intro.remove();
        phase = 'done';
        cancelAnimationFrame(raf);
        window.dispatchEvent(new CustomEvent('intro-complete'));
      }, 1500);
    }, 2500);
  }

  // ── Events ───────────────────────────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX / window.innerWidth;
    mouseY = 1.0 - e.clientY / window.innerHeight;
  });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX / window.innerWidth;
      mouseY = 1.0 - e.touches[0].clientY / window.innerHeight;
    }
  }, { passive: true });

  embarkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPhase('born');
  });

  let skipReady = false;
  window.addEventListener('scroll', () => { if (skipReady) startBirth(); }, { once: true });
  window.addEventListener('keydown', () => { if (skipReady) startBirth(); }, { once: true });

  // ── Particle System ──────────────────────────────────────────────────
  const particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      size: 1 + Math.random() * 2.5,
      phase: Math.random() * TAU,
      speed: 0.5 + Math.random() * 1.5,
    });
  }

  // ── Stars (for birth transition) ─────────────────────────────────────
  const stars = [];
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: 0.5 + Math.random() * 2,
      twinkleSpeed: 1 + Math.random() * 4,
      twinklePhase: Math.random() * TAU,
    });
  }

  // ── Simple hash for consistent noise ─────────────────────────────────
  function hash(n) {
    let x = Math.sin(n * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── Render ───────────────────────────────────────────────────────────
  function frame(ts) {
    if (phase === 'done') return;
    raf = requestAnimationFrame(frame);

    time = ts * 0.001;
    const s = time * 0.08;

    // Phase transitions
    if (phase === 'void' && ts - phaseStart > VOID_DURATION) {
      setPhase('thought');
    } else if (phase === 'thought' && ts - phaseStart > THOUGHT_DELAY) {
      setPhase('prompt');
    } else if (phase === 'prompt') {
      skipReady = true;
    }

    // Smooth brightness
    brightness += (targetBrightness - brightness) * 0.03;

    // Smooth fadeOut
    fadeOut += (fadeOut > 0.5 ? 1 : fadeOut) * 0.01; // handled by CSS mostly

    // Parallax
    const px = (mouseX - 0.5);
    const py = (mouseY - 0.5);

    // ── Background ──────────────────────────────────────────────────
    // Bright luminous background fading to dark
    const br = brightness;
    const bgR = Math.round(240 * br + 2 * (1 - br));
    const bgG = Math.round(235 * br + 1 * (1 - br));
    const bgB = Math.round(255 * br + 4 * (1 - br));
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, W, H);

    // Radial glow
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    const hueShift = Math.sin(s * 0.3) * 0.5 + 0.5;
    const gr = Math.round((150 + hueShift * 50) * br);
    const gg = Math.round((130 + (1 - hueShift) * 70) * br);
    const gb = Math.round((230 + hueShift * 20) * br);
    grad.addColorStop(0, `rgba(${gr},${gg},${gb},${0.12 * br})`);
    grad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Sacred Geometry ─────────────────────────────────────────────
    const geoAlpha = br * 0.35;
    if (geoAlpha > 0.01) {
      ctx.save();
      ctx.translate(W / 2, H / 2);

      // Layer 1: Flower of Life (slow parallax)
      const scale1 = Math.min(W, H) * 0.35;
      ctx.save();
      ctx.translate(px * 30, py * 20);
      ctx.rotate(s * 0.05);
      const fc1 = `hsl(${270 + Math.sin(s * 0.4) * 30}, 60%, ${50 + br * 20}%)`;
      drawFlowerOfLife(0, 0, scale1 * 0.18, fc1, geoAlpha);
      ctx.restore();

      // Layer 2: Metatron's Cube (medium parallax)
      const scale2 = Math.min(W, H) * 0.3;
      ctx.save();
      ctx.translate(px * 50 - 15, py * 35 - 10);
      ctx.rotate(-s * 0.03);
      const fc2 = `hsl(${200 + Math.sin(s * 0.25) * 40}, 50%, ${55 + br * 15}%)`;
      drawMetatronsCube(0, 0, scale2 * 0.12, fc2, geoAlpha * 0.7);
      ctx.restore();

      // Layer 3: Simple yantra triangles (fastest parallax)
      ctx.save();
      ctx.translate(px * 70 + 20, py * 50 - 20);
      ctx.rotate(s * 0.07);
      const fc3 = `hsl(${40 + Math.sin(s * 0.2) * 20}, 50%, ${60 + br * 15}%)`;
      const yanAlpha = geoAlpha * 0.3;
      const yanR = scale2 * 0.2;
      for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9;
        const flip = i % 2 === 0 ? 1 : -1;
        const r2 = yanR * (0.4 + i * 0.08);
        const ax = Math.cos(a - 0.5) * r2;
        const ay = Math.sin(a - 0.5) * r2 * flip;
        const bx = Math.cos(a + 0.5) * r2;
        const by = Math.sin(a + 0.5) * r2 * flip;
        const cx2 = Math.cos(a + Math.PI) * r2;
        const cy2 = Math.sin(a + Math.PI) * r2 * flip;
        drawLine(ax, ay, bx, by, fc3, yanAlpha, 0.5);
        drawLine(bx, by, cx2, cy2, fc3, yanAlpha, 0.5);
        drawLine(cx2, cy2, ax, ay, fc3, yanAlpha, 0.5);
      }
      ctx.restore();

      ctx.restore();
    }

    // ── Particles (light motes) ─────────────────────────────────────
    for (const p of particles) {
      p.x += p.vx + px * 0.0002;
      p.y += p.vy + py * 0.0002;
      // Wrap
      if (p.x > 1.2) p.x = -1.2;
      if (p.x < -1.2) p.x = 1.2;
      if (p.y > 1.2) p.y = -1.2;
      if (p.y < -1.2) p.y = 1.2;

      const twinkle = Math.sin(time * p.speed + p.phase) * 0.5 + 0.5;
      const sx = W / 2 + p.x * W / 2;
      const sy = H / 2 + p.y * H / 2;
      const particleAlpha = br * (0.15 + twinkle * 0.35);

      ctx.globalAlpha = particleAlpha;
      const pH = (200 + Math.sin(time * 0.5 + p.phase) * 60) % 360;
      ctx.fillStyle = `hsl(${pH}, 40%, 85%)`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * (0.8 + twinkle * 0.4), 0, TAU);
      ctx.fill();
    }

    // ── Stars (emerging during birth) ───────────────────────────────
    const starPhase = 1 - brightness;
    if (starPhase > 0.01) {
      for (const st of stars) {
        const twinkle = Math.sin(time * st.twinkleSpeed + st.twinklePhase) * 0.5 + 0.5;
        const sx = st.x * W;
        const sy = st.y * H;
        ctx.globalAlpha = starPhase * (0.2 + twinkle * 0.6);
        ctx.fillStyle = `rgba(220, 225, 255, 1)`;
        ctx.beginPath();
        ctx.arc(sx, sy, st.size * (0.6 + twinkle * 0.5), 0, TAU);
        ctx.fill();
      }
    }

    // ── Emy's center glow ───────────────────────────────────────────
    const emyGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.25);
    const emyHue = 280 + Math.sin(s * 0.5) * 40;
    emyGrad.addColorStop(0, `hsla(${emyHue}, 40%, 80%, ${0.08 * br})`);
    emyGrad.addColorStop(1, `hsla(${emyHue}, 40%, 80%, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = emyGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Vignette ────────────────────────────────────────────────────
    const vigGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, `rgba(0,0,0,${0.3 * br})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 1;
  }

  window.addEventListener('resize', resize);
  resize();
  phaseStart = performance.now();
  raf = requestAnimationFrame(frame);
})();
