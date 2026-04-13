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

  // ── Emy ──────────────────────────────────────────────────────────────
  const emy = { y: -120, targetY: 0, bobPhase: 0, swayPhase: Math.random() * TAU, scale: 1.4, settled: false };
  const EA = [180, 100, 255], EA2 = [255, 80, 200];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    emy.targetY = H * 0.35;
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

  // ── Draw Emy ─────────────────────────────────────────────────────────
  function drawEmy(cx, cy, sc, alpha) {
    const s = 18 * sc;
    const pts = [
      [cx, cy - s*3.2],                          // head
      [cx, cy - s*2.6],                          // neck
      [cx - s*1.3, cy - s*2.0], [cx + s*1.3, cy - s*2.0], // shoulders
      [cx - s*2.2, cy - s*0.8], [cx + s*2.2, cy - s*0.8], // elbows
      [cx - s*2.8, cy + s*0.3], [cx + s*2.8, cy + s*0.3], // hands
      [cx - s*0.6, cy + s*0.2], [cx + s*0.6, cy + s*0.2], // hips
      [cx - s*0.7, cy + s*1.6], [cx + s*0.7, cy + s*1.6], // knees
      [cx - s*0.9, cy + s*3.0], [cx + s*0.9, cy + s*3.0], // feet
    ];
    const limbs = [[0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],[1,8],[1,9],[8,9],[8,10],[9,11],[10,12],[11,13]];

    // Joint glows
    for (const p of pts) {
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 14 * sc);
      g.addColorStop(0, `rgba(${EA[0]},${EA[1]},${EA[2]},${0.12 * alpha})`);
      g.addColorStop(1, `rgba(${EA[0]},${EA[1]},${EA[2]},0)`);
      ctx.fillStyle = g; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 14 * sc, 0, TAU); ctx.fill();
    }
    // Limb glow
    ctx.lineCap = 'round';
    for (const [a, b] of limbs) {
      ctx.lineWidth = 5 * sc; ctx.globalAlpha = 0.1 * alpha;
      ctx.strokeStyle = `rgb(${EA[0]},${EA[1]},${EA[2]})`;
      ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); ctx.stroke();
    }
    // Limbs
    for (const [a, b] of limbs) {
      ctx.lineWidth = 2 * sc; ctx.globalAlpha = 0.6 * alpha;
      ctx.strokeStyle = `rgb(${EA[0]},${EA[1]},${EA[2]})`;
      ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); ctx.stroke();
    }
    // Joints
    for (let i = 0; i < pts.length; i++) {
      const isHead = i === 0;
      const r = (isHead ? 6 : 2.5) * sc;
      const col = isHead ? EA2 : EA;
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.globalAlpha = 0.8 * alpha;
      ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], r, 0, TAU); ctx.fill();
    }
    // Head glow
    const hg = ctx.createRadialGradient(pts[0][0], pts[0][1], 0, pts[0][0], pts[0][1], 22 * sc);
    hg.addColorStop(0, `rgba(${EA2[0]},${EA2[1]},${EA2[2]},${0.18 * alpha})`);
    hg.addColorStop(1, `rgba(${EA2[0]},${EA2[1]},${EA2[2]},0)`);
    ctx.fillStyle = hg; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 22 * sc, 0, TAU); ctx.fill();
    // Third eye
    ctx.fillStyle = `rgba(255,255,255,${0.5 * alpha})`; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1] - 2 * sc, 1.5 * sc, 0, TAU); ctx.fill();
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

    // ── Dark background (semi-transparent so game bleeds through) ────
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,6,15,0.88)';
    ctx.fillRect(0, 0, W, H);

    // Soft center glow
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, minDim * 0.6);
    bg.addColorStop(0, `rgba(60, 40, 90, ${0.15 + Math.sin(s * 0.3) * 0.05})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // ── Sacred Geometry (parallax) ──────────────────────────────────
    ctx.lineWidth = 0.8;

    // Layer 0: Giant Flower of Life — far back
    ctx.strokeStyle = `hsl(${265 + Math.sin(s * 0.12) * 15}, 35%, 45%)`;
    ctx.save();
    ctx.translate(W/2 + px * 12, H/2 + py * 8);
    ctx.rotate(s * 0.015);
    drawFlower(0, 0, minDim * 0.22, 0.18);
    ctx.restore();

    // Layer 1: Mandala of Life — center, medium depth
    ctx.strokeStyle = `hsl(${240 + Math.sin(s * 0.2) * 20}, 30%, 50%)`;
    ctx.fillStyle = `hsl(${240 + Math.sin(s * 0.2) * 20}, 30%, 50%)`;
    ctx.save();
    ctx.translate(W/2 + px * 25, H/2 + py * 18);
    drawMandala(0, 0, minDim * 0.3, 0.25, s);
    ctx.restore();

    // Layer 2: Flower of Life — center-right
    ctx.strokeStyle = `hsl(${280 + Math.sin(s * 0.25) * 20}, 30%, 42%)`;
    ctx.save();
    ctx.translate(W * 0.68 + px * 40, H * 0.38 + py * 28);
    ctx.rotate(-s * 0.03);
    drawFlower(0, 0, minDim * 0.11, 0.2);
    ctx.restore();

    // Layer 3: Metatron's Cube — center-left
    ctx.strokeStyle = `hsl(${210 + Math.sin(s * 0.18) * 25}, 28%, 45%)`;
    ctx.fillStyle = `hsl(${210 + Math.sin(s * 0.18) * 25}, 28%, 45%)`;
    ctx.save();
    ctx.translate(W * 0.32 + px * 50, H * 0.62 + py * 35);
    ctx.rotate(s * 0.02);
    drawMetatron(0, 0, minDim * 0.08, 0.22);
    ctx.restore();

    // Layer 4: Sri Yantra — offset
    ctx.strokeStyle = `hsl(${35 + Math.sin(s * 0.15) * 15}, 30%, 48%)`;
    ctx.save();
    ctx.translate(W * 0.72 + px * 60, H * 0.7 + py * 42);
    ctx.rotate(-s * 0.04);
    drawYantra(0, 0, minDim * 0.12, 0.15);
    ctx.restore();

    // Layer 5: Small mandala top-left
    ctx.strokeStyle = `hsl(${200 + Math.sin(s * 0.22) * 20}, 25%, 43%)`;
    ctx.fillStyle = `hsl(${200 + Math.sin(s * 0.22) * 20}, 25%, 43%)`;
    ctx.save();
    ctx.translate(W * 0.25 + px * 35, H * 0.3 + py * 24);
    drawMandala(0, 0, minDim * 0.12, 0.15, s * 1.3);
    ctx.restore();

    // Layer 6: Metatron bottom-right
    ctx.strokeStyle = `hsl(${300 + Math.sin(s * 0.16) * 15}, 25%, 40%)`;
    ctx.fillStyle = `hsl(${300 + Math.sin(s * 0.16) * 15}, 25%, 40%)`;
    ctx.save();
    ctx.translate(W * 0.75 + px * 45, H * 0.68 + py * 32);
    ctx.rotate(s * 0.035);
    drawMetatron(0, 0, minDim * 0.06, 0.18);
    ctx.restore();

    // ── Light motes ─────────────────────────────────────────────────
    for (const m of motes) {
      m.x += m.vx + px * 0.0001 * m.depth;
      m.y += m.vy + py * 0.0001 * m.depth;
      if (m.x > 1.3) m.x = -1.3; if (m.x < -1.3) m.x = 1.3;
      if (m.y > 1.3) m.y = -1.3; if (m.y < -1.3) m.y = 1.3;
      const tw = Math.sin(time * m.speed + m.phase) * 0.5 + 0.5;
      ctx.globalAlpha = 0.06 + tw * 0.14;
      const mH = (240 + Math.sin(time * 0.3 + m.phase) * 40) % 360;
      ctx.fillStyle = `hsl(${mH}, 30%, 70%)`;
      ctx.beginPath(); ctx.arc(W/2 + m.x * W/2, H/2 + m.y * H/2, m.size * (0.6 + tw * 0.5), 0, TAU); ctx.fill();
    }

    // ── Emy floating in from top ────────────────────────────────────
    emy.y += (emy.targetY - emy.y) * 0.008;
    if (Math.abs(emy.y - emy.targetY) < 0.5) emy.settled = true;
    emy.bobPhase += 0.012;
    const bob = emy.settled ? Math.sin(emy.bobPhase) * 5 : 0;
    const sway = Math.sin(emy.swayPhase + time * 0.25) * 10;
    const emyAlpha = Math.min(1, Math.max(0, (emy.y + 60) / 150));
    drawEmy(W/2 + sway, emy.y + bob, emy.scale, emyAlpha);

    // ── Vignette ────────────────────────────────────────────────────
    const vig = ctx.createRadialGradient(W/2, H/2, minDim * 0.15, W/2, H/2, Math.max(W, H) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.globalAlpha = 1; ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 1;
  }

  window.addEventListener('resize', resize);
  resize();
  phaseStart = performance.now();
  raf = requestAnimationFrame(frame);
})();
