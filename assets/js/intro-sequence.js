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
  let brightness = 0.75;
  let targetBrightness = 0.75;
  let birthStarted = false;
  let raf;

  const TAU = Math.PI * 2;
  const VOID_DURATION = 3000;
  const THOUGHT_DELAY = 1800;
  const PROMPT_DELAY = 2000;

  // ── Emy ragdoll (simple version, no physics) ────────────────────────
  const emy = {
    y: -200,        // starts above canvas
    targetY: 0,     // will be set to center
    settled: false,
    bobPhase: 0,
    swayPhase: Math.random() * TAU,
    swayAmp: 8,
    scale: 1.6,
    hue: 270,
    accent: [180, 100, 255],
    accent2: [255, 80, 200],
    // Body points relative to hip center
    segments: 22, // segment length in pixels (scaled)
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    emy.targetY = H * 0.48;
  }

  // ── Sacred Geometry ──────────────────────────────────────────────────
  function drawFlowerOfLife(cx, cy, r, color, alpha) {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = color;
    // Center
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    // First ring
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r, 0, TAU); ctx.stroke();
    }
    // Second ring
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const ox = cx + Math.cos(a) * r;
      const oy = cy + Math.sin(a) * r;
      for (let j = 0; j < 3; j++) {
        const a2 = a + (j - 1) * TAU / 6;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath(); ctx.arc(ox + Math.cos(a2) * r, oy + Math.sin(a2) * r, r, 0, TAU); ctx.stroke();
      }
    }
    // Third ring
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      const dist = r * 1.73;
      ctx.globalAlpha = alpha * 0.25;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, r, 0, TAU); ctx.stroke();
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
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = color;
    // Inner to outer
    for (let i = 1; i <= 6; i++) {
      for (let j = 7; j <= 12; j++) {
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + pts[i][0], cy + pts[i][1]);
        ctx.lineTo(cx + pts[j][0], cy + pts[j][1]);
        ctx.stroke();
      }
    }
    // Outer ring
    for (let i = 7; i <= 12; i++) {
      const next = i === 12 ? 7 : i + 1;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + pts[i][0], cy + pts[i][1]);
      ctx.lineTo(cx + pts[next][0], cy + pts[next][1]);
      ctx.stroke();
    }
    // Inner ring
    for (let i = 1; i <= 6; i++) {
      const next = i === 6 ? 1 : i + 1;
      ctx.globalAlpha = alpha * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + pts[i][0], cy + pts[i][1]);
      ctx.lineTo(cx + pts[next][0], cy + pts[next][1]);
      ctx.stroke();
    }
    // Inner hex cross-connections
    for (let i = 1; i <= 6; i++) {
      for (let j = i + 2; j <= 6; j++) {
        if (j !== 7 - i) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx + pts[i][0], cy + pts[i][1]);
          ctx.lineTo(cx + pts[j][0], cy + pts[j][1]);
          ctx.stroke();
        }
      }
    }
    // Center circles at each point
    for (const p of pts) {
      ctx.globalAlpha = alpha * 0.15;
      ctx.beginPath(); ctx.arc(cx + p[0], cy + p[1], r * 0.08, 0, TAU); ctx.stroke();
    }
  }

  function drawSriYantra(cx, cy, r, color, alpha) {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = color;
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9;
      const flip = i % 2 === 0 ? 1 : -1;
      const r2 = r * (0.35 + i * 0.08);
      const ax = cx + Math.cos(a - 0.55) * r2;
      const ay = cy + Math.sin(a - 0.55) * r2 * flip;
      const bx = cx + Math.cos(a + 0.55) * r2;
      const by = cy + Math.sin(a + 0.55) * r2 * flip;
      const cx2 = cx + Math.cos(a + Math.PI) * r2;
      const cy2 = cy + Math.sin(a + Math.PI) * r2 * flip;
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.stroke();
    }
  }

  function drawSeedOfLife(cx, cy, r, color, alpha) {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r, 0, TAU); ctx.stroke();
    }
  }

  // ── Draw Emy stick figure ────────────────────────────────────────────
  function drawEmy(cx, cy, scale, alpha) {
    const s = 18 * scale;
    const a = emy.accent;
    const a2 = emy.accent2;

    // Positions relative to center
    const head = [cx, cy - s * 3.2];
    const neck = [cx, cy - s * 2.6];
    const lShoulder = [cx - s * 1.3, cy - s * 2.0];
    const rShoulder = [cx + s * 1.3, cy - s * 2.0];
    const lElbow = [cx - s * 2.2, cy - s * 0.8];
    const rElbow = [cx + s * 2.2, cy - s * 0.8];
    const lHand = [cx - s * 2.8, cy + s * 0.3];
    const rHand = [cx + s * 2.8, cy + s * 0.3];
    const lHip = [cx - s * 0.6, cy + s * 0.2];
    const rHip = [cx + s * 0.6, cy + s * 0.2];
    const lKnee = [cx - s * 0.7, cy + s * 1.6];
    const rKnee = [cx + s * 0.7, cy + s * 1.6];
    const lFoot = [cx - s * 0.9, cy + s * 3.0];
    const rFoot = [cx + s * 0.9, cy + s * 3.0];

    const limbs = [
      [head, neck], [neck, lShoulder], [neck, rShoulder],
      [lShoulder, lElbow], [rShoulder, rElbow],
      [lElbow, lHand], [rElbow, rHand],
      [neck, lHip], [neck, rHip], [lHip, rHip],
      [lHip, lKnee], [rHip, rKnee],
      [lKnee, lFoot], [rKnee, rFoot],
    ];

    // Glow on joints
    const allPts = [head, neck, lShoulder, rShoulder, lElbow, rElbow, lHand, rHand, lHip, rHip, lKnee, rKnee, lFoot, rFoot];
    for (const p of allPts) {
      const grad = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 14 * scale);
      grad.addColorStop(0, `rgba(${a[0]},${a[1]},${a[2]},${0.12 * alpha})`);
      grad.addColorStop(1, `rgba(${a[0]},${a[1]},${a[2]},0)`);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 14 * scale, 0, TAU); ctx.fill();
    }

    // Limb glow
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = 'round';
    for (const [p1, p2] of limbs) {
      ctx.globalAlpha = 0.1 * alpha;
      ctx.strokeStyle = `rgb(${a[0]},${a[1]},${a[2]})`;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    // Limbs
    ctx.lineWidth = 2 * scale;
    for (const [p1, p2] of limbs) {
      ctx.globalAlpha = 0.6 * alpha;
      ctx.strokeStyle = `rgb(${a[0]},${a[1]},${a[2]})`;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    // Joints
    for (let i = 0; i < allPts.length; i++) {
      const p = allPts[i];
      const isHead = i === 0;
      const r = (isHead ? 6 : 2.5) * scale;
      const col = isHead ? a2 : a;
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.globalAlpha = 0.8 * alpha;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
    }

    // Head glow
    const hg = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 22 * scale);
    hg.addColorStop(0, `rgba(${a2[0]},${a2[1]},${a2[2]},${0.18 * alpha})`);
    hg.addColorStop(1, `rgba(${a2[0]},${a2[1]},${a2[2]},0)`);
    ctx.fillStyle = hg;
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(head[0], head[1], 22 * scale, 0, TAU); ctx.fill();

    // Third eye
    ctx.fillStyle = `rgba(255,255,255,${0.5 * alpha})`;
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(head[0], head[1] - 2 * scale, 1.5 * scale, 0, TAU); ctx.fill();
  }

  // ── Particles ────────────────────────────────────────────────────────
  const motes = [];
  for (let i = 0; i < 60; i++) {
    motes.push({
      x: Math.random() * 2 - 1, y: Math.random() * 2 - 1,
      vx: (Math.random() - 0.5) * 0.0002, vy: (Math.random() - 0.5) * 0.0002,
      size: 0.8 + Math.random() * 2, phase: Math.random() * TAU,
      speed: 0.3 + Math.random() * 1.2, depth: 0.3 + Math.random() * 0.7,
    });
  }

  const stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({
      x: Math.random(), y: Math.random(),
      size: 0.4 + Math.random() * 2,
      twinkleSpeed: 0.8 + Math.random() * 3, twinklePhase: Math.random() * TAU,
    });
  }

  // ── DOM ──────────────────────────────────────────────────────────────
  const thoughtBubble = document.getElementById('intro-thought');
  const promptArea = document.getElementById('intro-prompt');
  const embarkBtn = document.getElementById('intro-embark');

  // ── Phases ───────────────────────────────────────────────────────────
  function setPhase(p) {
    phase = p;
    phaseStart = performance.now();
    if (p === 'thought') thoughtBubble.classList.add('visible');
    else if (p === 'prompt') promptArea.classList.add('visible');
    else if (p === 'born') startBirth();
  }

  function startBirth() {
    if (birthStarted) return;
    birthStarted = true;
    targetBrightness = 0.0;
    thoughtBubble.classList.remove('visible');
    promptArea.classList.remove('visible');
    setTimeout(() => {
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
    mouseX = e.clientX / W; mouseY = 1 - e.clientY / H;
  });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length) { mouseX = e.touches[0].clientX / W; mouseY = 1 - e.touches[0].clientY / H; }
  }, { passive: true });
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

    brightness += (targetBrightness - brightness) * 0.025;
    const br = brightness;
    const px = (mouseX - 0.5);
    const py = (mouseY - 0.5);

    // ── Background ──────────────────────────────────────────────────
    // Soft dark-lavender, not white
    const bgR = Math.round(180 * br + 5 * (1 - br));
    const bgG = Math.round(170 * br + 3 * (1 - br));
    const bgB = Math.round(210 * br + 8 * (1 - br));
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, W, H);

    // Soft radial glow
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
    const hue1 = 260 + Math.sin(s * 0.3) * 20;
    grad.addColorStop(0, `hsla(${hue1}, 30%, 45%, ${0.1 * br})`);
    grad.addColorStop(1, `hsla(${hue1}, 30%, 45%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Sacred Geometry (parallax layers) ───────────────────────────
    const geoBase = br * 0.4;
    const minDim = Math.min(W, H);

    // Layer 0: Giant seed of life, far background
    ctx.save();
    ctx.translate(W / 2 + px * 15, H / 2 + py * 10);
    ctx.rotate(s * 0.02);
    drawSeedOfLife(0, 0, minDim * 0.28, `hsl(${250 + Math.sin(s * 0.15) * 15}, 25%, 55%)`, geoBase * 0.2);
    ctx.restore();

    // Layer 1: Flower of Life, slow parallax
    ctx.save();
    ctx.translate(W / 2 + px * 35, H / 2 + py * 25);
    ctx.rotate(s * 0.04);
    drawFlowerOfLife(0, 0, minDim * 0.16, `hsl(${270 + Math.sin(s * 0.35) * 25}, 35%, 60%)`, geoBase * 0.5);
    ctx.restore();

    // Layer 2: Metatron's Cube, medium parallax
    ctx.save();
    ctx.translate(W / 2 + px * 55 - 20, H / 2 + py * 40 - 15);
    ctx.rotate(-s * 0.025);
    drawMetatronsCube(0, 0, minDim * 0.1, `hsl(${210 + Math.sin(s * 0.2) * 30}, 30%, 55%)`, geoBase * 0.45);
    ctx.restore();

    // Layer 3: Sri Yantra, offset, fastest parallax
    ctx.save();
    ctx.translate(W / 2 + px * 75 + 40, H / 2 + py * 55 + 30);
    ctx.rotate(s * 0.06);
    drawSriYantra(0, 0, minDim * 0.18, `hsl(${40 + Math.sin(s * 0.18) * 20}, 35%, 60%)`, geoBase * 0.25);
    ctx.restore();

    // Layer 4: Second Flower of Life, top-right
    ctx.save();
    ctx.translate(W * 0.7 + px * 45, H * 0.35 + py * 30);
    ctx.rotate(-s * 0.035);
    drawSeedOfLife(0, 0, minDim * 0.1, `hsl(${190 + Math.sin(s * 0.28) * 20}, 30%, 58%)`, geoBase * 0.3);
    ctx.restore();

    // Layer 5: Small Metatron, bottom-left
    ctx.save();
    ctx.translate(W * 0.3 + px * 65, H * 0.65 + py * 45);
    ctx.rotate(s * 0.05);
    drawMetatronsCube(0, 0, minDim * 0.07, `hsl(${300 + Math.sin(s * 0.22) * 20}, 25%, 55%)`, geoBase * 0.35);
    ctx.restore();

    // ── Light motes ─────────────────────────────────────────────────
    for (const m of motes) {
      m.x += m.vx + px * 0.00015 * m.depth;
      m.y += m.vy + py * 0.00015 * m.depth;
      if (m.x > 1.3) m.x = -1.3; if (m.x < -1.3) m.x = 1.3;
      if (m.y > 1.3) m.y = -1.3; if (m.y < -1.3) m.y = 1.3;
      const twinkle = Math.sin(time * m.speed + m.phase) * 0.5 + 0.5;
      const sx = W / 2 + m.x * W / 2;
      const sy = H / 2 + m.y * H / 2;
      ctx.globalAlpha = br * (0.08 + twinkle * 0.2) * m.depth;
      const mH = (220 + Math.sin(time * 0.4 + m.phase) * 50) % 360;
      ctx.fillStyle = `hsl(${mH}, 30%, 80%)`;
      ctx.beginPath(); ctx.arc(sx, sy, m.size * (0.7 + twinkle * 0.5), 0, TAU); ctx.fill();
    }

    // ── Emy floating down ───────────────────────────────────────────
    if (phase !== 'done') {
      // Float down from above
      if (!emy.settled) {
        emy.y += (emy.targetY - emy.y) * 0.012;
        if (Math.abs(emy.y - emy.targetY) < 1) emy.settled = true;
      }
      // Gentle bob once settled
      emy.bobPhase += 0.015;
      const bob = emy.settled ? Math.sin(emy.bobPhase) * 6 : 0;
      const sway = Math.sin(emy.swayPhase + time * 0.3) * emy.swayAmp;
      const emyAlpha = Math.min(1, Math.max(0, (emy.y + 100) / 200)) * br;

      drawEmy(W / 2 + sway, emy.y + bob, emy.scale, emyAlpha);
    }

    // ── Stars (birth transition) ────────────────────────────────────
    const starPhase = 1 - brightness;
    if (starPhase > 0.01) {
      for (const st of stars) {
        const twinkle = Math.sin(time * st.twinkleSpeed + st.twinklePhase) * 0.5 + 0.5;
        ctx.globalAlpha = starPhase * (0.15 + twinkle * 0.5);
        ctx.fillStyle = 'rgba(210,215,240,1)';
        ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.size * (0.5 + twinkle * 0.5), 0, TAU); ctx.fill();
      }
    }

    // ── Soft vignette ───────────────────────────────────────────────
    const vigGrad = ctx.createRadialGradient(W / 2, H / 2, minDim * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, `rgba(10,5,20,${0.35 * br})`);
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
