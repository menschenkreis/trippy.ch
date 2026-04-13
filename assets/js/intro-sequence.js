// ── Intro Sequence — Emy's Birth (Canvas 2D) ──────────────────────────
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
  let fadeOut = 0;
  let birthStarted = false;
  let raf;

  const TAU = Math.PI * 2;
  const VOID_DURATION = 3000;
  const THOUGHT_DELAY = 1800;
  const PROMPT_DELAY = 2000;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Sacred Geometry Drawing ──────────────────────────────────────────
  function drawCircle(x, y, r, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }

  function drawLine(x1, y1, x2, y2, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Flower of Life
  function drawFlower(cx, cy, r, alpha) {
    drawCircle(cx, cy, r, alpha);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      drawCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r, alpha);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      for (let j = 0; j < 3; j++) {
        const a2 = a + (j - 1) * TAU / 6;
        drawCircle(cx + Math.cos(a) * r + Math.cos(a2) * r, cy + Math.sin(a) * r + Math.sin(a2) * r, r, alpha * 0.45);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      drawCircle(cx + Math.cos(a) * r * 1.73, cy + Math.sin(a) * r * 1.73, r, alpha * 0.2);
    }
  }

  // Metatron's Cube
  function drawMetatron(cx, cy, r, alpha) {
    const pts = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pts.push([Math.cos(a) * r * 2, Math.sin(a) * r * 2]); }
    for (let i = 1; i <= 6; i++) for (let j = 7; j <= 12; j++) drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[j][0], cy + pts[j][1], alpha * 0.4);
    for (let i = 7; i <= 12; i++) { const n = i === 12 ? 7 : i + 1; drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[n][0], cy + pts[n][1], alpha * 0.55); }
    for (let i = 1; i <= 6; i++) { const n = i === 6 ? 1 : i + 1; drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[n][0], cy + pts[n][1], alpha * 0.55); }
    for (let i = 1; i <= 6; i++) for (let j = i + 2; j <= 6; j++) if (j !== 7 - i) drawLine(cx + pts[i][0], cy + pts[i][1], cx + pts[j][0], cy + pts[j][1], alpha * 0.25);
    for (const p of pts) drawCircle(cx + p[0], cy + p[1], r * 0.07, alpha * 0.3);
  }

  // Sri Yantra triangles
  function drawYantra(cx, cy, r, alpha) {
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9, flip = i % 2 === 0 ? 1 : -1, r2 = r * (0.35 + i * 0.08);
      const ax = cx + Math.cos(a - 0.55) * r2, ay = cy + Math.sin(a - 0.55) * r2 * flip;
      const bx = cx + Math.cos(a + 0.55) * r2, by = cy + Math.sin(a + 0.55) * r2 * flip;
      const cx2 = cx + Math.cos(a + Math.PI) * r2, cy2 = cy + Math.sin(a + Math.PI) * r2 * flip;
      ctx.globalAlpha = alpha * 0.25;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.stroke();
    }
  }

  // Concentric mandala rings (mandala of life)
  function drawMandala(cx, cy, baseR, alpha, s) {
    ctx.lineWidth = 0.7;
    // Outer decorative rings
    for (let ring = 0; ring < 4; ring++) {
      const r = baseR * (0.5 + ring * 0.2);
      const count = 6 + ring * 6;
      const rot = s * (0.02 + ring * 0.008) * (ring % 2 === 0 ? 1 : -1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      for (let i = 0; i < count; i++) {
        const a = i * TAU / count;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        // Petal
        ctx.globalAlpha = alpha * (0.35 - ring * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a - 0.15) * r * 0.6, Math.sin(a - 0.15) * r * 0.6, x, y);
        ctx.quadraticCurveTo(Math.cos(a + 0.15) * r * 0.6, Math.sin(a + 0.15) * r * 0.6, 0, 0);
        ctx.stroke();
        // Dot at tip
        ctx.globalAlpha = alpha * (0.5 - ring * 0.08);
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // Central circles
    for (let i = 0; i < 3; i++) {
      drawCircle(cx, cy, baseR * (0.12 + i * 0.08), alpha * (0.4 - i * 0.08));
    }
  }



  // ── Motes ────────────────────────────────────────────────────────────
  const motes = Array.from({length: 50}, () => ({
    x: Math.random() * 2 - 1, y: Math.random() * 2 - 1,
    vx: (Math.random() - 0.5) * 0.00015, vy: (Math.random() - 0.5) * 0.00015,
    size: 0.6 + Math.random() * 1.8, phase: Math.random() * TAU,
    speed: 0.3 + Math.random() * 1, depth: 0.3 + Math.random() * 0.7,
  }));

  // ── DOM ──────────────────────────────────────────────────────────────
  const thoughtBubble = document.getElementById('intro-thought');
  const promptArea = document.getElementById('intro-prompt');
  const embarkBtn = document.getElementById('intro-embark');

  function setPhase(p) {
    phase = p; phaseStart = performance.now();
    if (p === 'thought') thoughtBubble.classList.add('visible');
    else if (p === 'prompt') promptArea.classList.add('visible');
    else if (p === 'born') startBirth();
  }

  function startBirth() {
    if (birthStarted) return;
    birthStarted = true;
    thoughtBubble.classList.remove('visible');
    promptArea.classList.remove('visible');
    setTimeout(() => {
      intro.style.opacity = '0';
      intro.style.transition = 'opacity 2s ease';
      setTimeout(() => {
        intro.style.display = 'none'; intro.remove();
        phase = 'done'; cancelAnimationFrame(raf);
        window.dispatchEvent(new CustomEvent('intro-complete'));
      }, 2000);
    }, 400);
  }

  // ── Events ───────────────────────────────────────────────────────────
  document.addEventListener('mousemove', (e) => { mouseX = e.clientX / W; mouseY = 1 - e.clientY / H; });
  document.addEventListener('touchmove', (e) => { if (e.touches.length) { mouseX = e.touches[0].clientX / W; mouseY = 1 - e.touches[0].clientY / H; } }, { passive: true });
  embarkBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setPhase('born'); });
  let skipReady = false;
  window.addEventListener('scroll', () => { if (skipReady) startBirth(); }, { once: true });
  window.addEventListener('keydown', () => { if (skipReady) startBirth(); }, { once: true });

  // ── Render ───────────────────────────────────────────────────────────
  function frame(ts) {
    if (phase === 'done') return;
    raf = requestAnimationFrame(frame);
    time = ts * 0.001;
    const s = time * 0.06;

    if (phase === 'void' && ts - phaseStart > VOID_DURATION) setPhase('thought');
    else if (phase === 'thought' && ts - phaseStart > THOUGHT_DELAY) setPhase('prompt');
    else if (phase === 'prompt') skipReady = true;

    const px = (mouseX - 0.5), py = (mouseY - 0.5);
    const minDim = Math.min(W, H);

    // ── Very transparent overlay — game shows through clearly ────
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,6,15,0.35)';
    ctx.fillRect(0, 0, W, H);

    // Soft iridescent center glow
    const glowHue = (time * 12) % 360;
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, minDim * 0.6);
    bg.addColorStop(0, `hsla(${glowHue}, 60%, 40%, 0.12)`);
    bg.addColorStop(0.5, `hsla(${(glowHue + 60) % 360}, 50%, 30%, 0.06)`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // ── Iridescent Sacred Geometry (parallax) ─────────────────────────
    ctx.lineWidth = 1.0;
    // Each layer shifts through the full spectrum at its own speed
    const hue = (layer, offset, speed) => ((time * speed * 20 + offset) % 360 + 360) % 360;

    // Layer 0: Giant Flower of Life — far back
    const h0 = hue(0, 0, 0.08);
    ctx.strokeStyle = `hsl(${h0}, 85%, 62%)`;
    ctx.save();
    ctx.translate(W/2 + px * 12, H/2 + py * 8);
    ctx.rotate(s * 0.015);
    drawFlower(0, 0, minDim * 0.22, 0.32);
    ctx.restore();

    // Layer 1: Mandala of Life — center, medium depth
    const h1 = hue(1, 120, 0.06);
    ctx.strokeStyle = `hsl(${h1}, 90%, 60%)`;
    ctx.fillStyle = `hsl(${h1}, 90%, 60%)`;
    ctx.save();
    ctx.translate(W/2 + px * 25, H/2 + py * 18);
    drawMandala(0, 0, minDim * 0.3, 0.4, s);
    ctx.restore();

    // Layer 2: Flower of Life — center-right
    const h2 = hue(2, 60, 0.1);
    ctx.strokeStyle = `hsl(${h2}, 80%, 58%)`;
    ctx.save();
    ctx.translate(W * 0.68 + px * 40, H * 0.38 + py * 28);
    ctx.rotate(-s * 0.03);
    drawFlower(0, 0, minDim * 0.11, 0.3);
    ctx.restore();

    // Layer 3: Metatron's Cube — center-left
    const h3 = hue(3, 200, 0.07);
    ctx.strokeStyle = `hsl(${h3}, 85%, 60%)`;
    ctx.fillStyle = `hsl(${h3}, 85%, 60%)`;
    ctx.save();
    ctx.translate(W * 0.32 + px * 50, H * 0.62 + py * 35);
    ctx.rotate(s * 0.02);
    drawMetatron(0, 0, minDim * 0.08, 0.32);
    ctx.restore();

    // Layer 4: Sri Yantra — offset
    const h4 = hue(4, 300, 0.09);
    ctx.strokeStyle = `hsl(${h4}, 80%, 62%)`;
    ctx.save();
    ctx.translate(W * 0.72 + px * 60, H * 0.7 + py * 42);
    ctx.rotate(-s * 0.04);
    drawYantra(0, 0, minDim * 0.12, 0.28);
    ctx.restore();

    // Layer 5: Small mandala top-left
    const h5 = hue(5, 180, 0.11);
    ctx.strokeStyle = `hsl(${h5}, 85%, 58%)`;
    ctx.fillStyle = `hsl(${h5}, 85%, 58%)`;
    ctx.save();
    ctx.translate(W * 0.25 + px * 35, H * 0.3 + py * 24);
    drawMandala(0, 0, minDim * 0.12, 0.28, s * 1.3);
    ctx.restore();

    // Layer 6: Metatron bottom-right
    const h6 = hue(6, 240, 0.08);
    ctx.strokeStyle = `hsl(${h6}, 80%, 56%)`;
    ctx.fillStyle = `hsl(${h6}, 80%, 56%)`;
    ctx.save();
    ctx.translate(W * 0.75 + px * 45, H * 0.68 + py * 32);
    ctx.rotate(s * 0.035);
    drawMetatron(0, 0, minDim * 0.06, 0.3);
    ctx.restore();

    // ── Light motes (iridescent) ────────────────────────────────────
    for (const m of motes) {
      m.x += m.vx + px * 0.0001 * m.depth;
      m.y += m.vy + py * 0.0001 * m.depth;
      if (m.x > 1.3) m.x = -1.3; if (m.x < -1.3) m.x = 1.3;
      if (m.y > 1.3) m.y = -1.3; if (m.y < -1.3) m.y = 1.3;
      const tw = Math.sin(time * m.speed + m.phase) * 0.5 + 0.5;
      ctx.globalAlpha = 0.08 + tw * 0.18;
      const mH = (time * 15 + m.phase * 57.3) % 360;
      ctx.fillStyle = `hsl(${mH}, 80%, 70%)`;
      ctx.beginPath(); ctx.arc(W/2 + m.x * W/2, H/2 + m.y * H/2, m.size * (0.6 + tw * 0.5), 0, TAU); ctx.fill();
    }


    // ── Soft vignette ──────────────────────────────────────────────
    const vig = ctx.createRadialGradient(W/2, H/2, minDim * 0.15, W/2, H/2, Math.max(W, H) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.globalAlpha = 1; ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 1;
  }

  window.addEventListener('resize', resize);
  resize();
  phaseStart = performance.now();
  raf = requestAnimationFrame(frame);
})();
