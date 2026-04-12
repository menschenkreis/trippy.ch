// Fractal Dreams — Phase 1: Google Maps-quality interaction overhaul
// Features:
//   • Mouse click-drag panning (desktop)
//   • Zoom-to-cursor (wheel zooms where you point)
//   • Zoom-to-pinch-midpoint (mobile)
//   • Inertia / momentum after drag release
//   • Double-tap to zoom in (mobile)
//   • Adaptive iteration count (scales with zoom depth)
//   • Smooth easing on all state transitions
(function () {
  const cfg = window.fractalDreamsConfig || {};
  const canvas = document.getElementById(cfg.canvasId || 'fractal-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, depth: false })
           || canvas.getContext('experimental-webgl');
  if (!gl) return;

  // ── State ──────────────────────────────────────────────────────────────────
  let W, H;

  // Fractal coordinate space: centre + zoom (zoom = fractal units visible on
  // the shorter screen side). Smaller zoom = deeper in.
  let cx = -0.5, cy = 0.0;   // fractal-space centre
  let zoom = 3.0;              // fractal units visible on min(W,H)

  // Smooth-render targets (what we're interpolating towards)
  let tcx = cx, tcy = cy, tzoom = zoom;

  // Inertia: velocity in fractal-space units per second
  let vx = 0, vy = 0;
  let lastFrameTime = 0;

  // Mouse influence on Julia constant (separate from pan)
  let mouseTarget = [0.5, 0.5], smoothMouse = [0.5, 0.5];

  // Morph energy (tap burst)
  let morphEnergy = 0.0, targetMorphEnergy = 0.0;

  // Theme colours
  let themeColA = [0.49, 0.23, 0.93];
  let themeColB = [0.18, 0.83, 0.75];
  let themeColC = [0.93, 0.28, 0.60];
  let targetColA = [...themeColA];
  let targetColB = [...themeColB];
  let targetColC = [...themeColC];

  // Audio
  let audioPhase = 0.0, shepardPhase = 0.0;
  let soundEnabled = false, audioStarted = false;
  let audioCtx = null, shepardGain = null;
  const shepardOscs = [], shepardGains = [];
  const NUM_VOICES = 12, BASE_FREQ = 432;

  // UI state
  let driftEnabled = false;

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2.0);
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    W = canvas.width; H = canvas.height;
    gl.viewport(0, 0, W, H);
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  // Convert screen pixel (css px, not dpr-scaled) → fractal space
  function screenToFractal(px, py) {
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    const fx = cx + (px - window.innerWidth  * 0.5) * (zoom / minSide);
    const fy = cy + (py - window.innerHeight * 0.5) * (zoom / minSide);
    return [fx, fy];
  }

  // Clean zoom-to-point
  function zoomToPoint(px, py, factor) {
    // factor < 1 → zoom in, factor > 1 → zoom out
    const [fx, fy] = screenToFractal(px, py);
    const newZoom = Math.max(1e-13, Math.min(4.0, tzoom * factor));
    // Keep (fx, fy) stationary: new_centre = fp + (old_centre - fp) * (newZoom / oldZoom)
    const ratio = newZoom / tzoom;
    tcx = fx + (tcx - fx) * ratio;
    tcy = fy + (tcy - fy) * ratio;
    tzoom = newZoom;
    vx = 0; vy = 0;
  }

  // ── Shader ─────────────────────────────────────────────────────────────────
  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255
    ];
  }

  function readThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const p = s.getPropertyValue('--purple').trim();
    const t = s.getPropertyValue('--teal').trim();
    const k = s.getPropertyValue('--pink').trim();
    if (p) targetColA = hexToRGB(p);
    if (t) targetColB = hexToRGB(t);
    if (k) targetColC = hexToRGB(k);
  }
  setInterval(readThemeColors, 1000);
  readThemeColors();

  const vsSrc = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }';

  // Adaptive max iterations — injected as a #define at compile time per zoom level.
  // We'll use a uniform instead so we can change it without recompiling.
  const fsSrc = `
precision highp float;
uniform float t, zoom, audioPhase, morphEnergy, maxIter;
uniform vec2 res, mouse;
uniform vec2 centre;          // fractal-space centre
uniform vec3 colA, colB, colC;

void main(){
  vec2 uv = gl_FragCoord.xy / res;
  // Map pixel to fractal coordinate
  float minSide = min(res.x, res.y);
  vec2 coord = centre + (gl_FragCoord.xy - res * 0.5) * (zoom / minSide);
  // Flip Y so +Y is up
  coord.y = centre.y - (gl_FragCoord.y - res.y * 0.5) * (zoom / minSide);

  // Julia constant: slow drift + subtle mouse influence
  float a = t * 0.025 + morphEnergy * 0.5;
  vec2 c = vec2(
    -0.745 + 0.045 * cos(a)      + (mouse.x - 0.5) * 0.06,
     0.110 + 0.045 * sin(a*1.3)  + (mouse.y - 0.5) * 0.06
  );

  vec2 z = coord;
  float iter = 0.0;
  float mi = maxIter;
  for(float i = 0.0; i < 1024.0; i++){
    if(i >= mi) break;
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 256.0) break;
    iter++;
  }

  vec3 col = vec3(0.01, 0.005, 0.02);
  if(iter < mi){
    // Smooth iteration count (continuous colouring)
    float sl = iter - log2(log2(dot(z,z))) + 4.0;
    float phase = fract(sl * 0.012 + t * 0.006 + audioPhase * 0.12 + morphEnergy * 0.15);

    // Three-colour palette
    vec3 pal;
    if(phase < 0.333){
      pal = mix(colA, colB, phase / 0.333);
    } else if(phase < 0.666){
      pal = mix(colB, colC, (phase - 0.333) / 0.333);
    } else {
      pal = mix(colC, colA, (phase - 0.666) / 0.334);
    }

    float val = 0.15 + 0.85 * pow(clamp(sl / mi, 0.0, 1.0), 0.42)
              + 0.04 * sin(audioPhase * 6.283)
              + morphEnergy * 0.08;
    col = pal * clamp(val, 0.0, 1.6);

    // Edge glow
    float edge = 1.0 - smoothstep(0.0, 0.2, sl / mi);
    col += colA * edge * (0.25 + morphEnergy * 0.35);
  } else {
    // Interior glow
    col += colA * 0.10 * exp(-length(coord - centre) * 0.25);
  }

  // Vignette
  col *= smoothstep(0.0, 0.75, 1.0 - length(uv - 0.5) * 1.25);

  gl_FragColor = vec4(col, 1.0);
}`;

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   vsSrc));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

  const uT         = gl.getUniformLocation(prog, 't');
  const uRes       = gl.getUniformLocation(prog, 'res');
  const uMouse     = gl.getUniformLocation(prog, 'mouse');
  const uZoom      = gl.getUniformLocation(prog, 'zoom');
  const uCentre    = gl.getUniformLocation(prog, 'centre');
  const uColA      = gl.getUniformLocation(prog, 'colA');
  const uColB      = gl.getUniformLocation(prog, 'colB');
  const uColC      = gl.getUniformLocation(prog, 'colC');
  const uAudio     = gl.getUniformLocation(prog, 'audioPhase');
  const uMorph     = gl.getUniformLocation(prog, 'morphEnergy');
  const uMaxIter   = gl.getUniformLocation(prog, 'maxIter');

  // ── Adaptive iterations ────────────────────────────────────────────────────
  // At zoom=3 (overview) → ~80 iters is fine.
  // At zoom=1e-10 (very deep) → 600+ needed.
  function calcMaxIter(z) {
    // log scale: 80 at z=3, ~800 at z=1e-12
    const depth = Math.log2(3.0 / Math.max(z, 1e-14));
    return Math.min(900, Math.max(80, Math.round(80 + depth * 38)));
  }

  // ── Audio engine ───────────────────────────────────────────────────────────
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      shepardGain = audioCtx.createGain();
      shepardGain.gain.value = 0;
      shepardGain.connect(audioCtx.destination);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 440;
      lp.connect(shepardGain);
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator();
        const g   = audioCtx.createGain();
        osc.type = (i % 2 === 0) ? 'sine' : 'triangle';
        g.gain.value = 0;
        osc.connect(g); g.connect(lp); osc.start();
        shepardOscs.push(osc); shepardGains.push(g);
      }
    } catch (e) { console.warn('Audio init failed', e); }
  }

  function updateAudio(dt) {
    if (!audioCtx || !shepardGain) return;
    shepardPhase = ((shepardPhase - 0.035 * dt) % 1.0 + 1.0) % 1.0;
    audioPhase = shepardPhase;
    for (let i = 0; i < NUM_VOICES; i++) {
      let f = BASE_FREQ * 0.125 * Math.pow(2, (i / (NUM_VOICES - 1) * 7) + shepardPhase);
      while (f > BASE_FREQ * 16)   f /= 128;
      while (f < BASE_FREQ * 0.125) f *= 128;
      shepardOscs[i].frequency.setTargetAtTime(f, audioCtx.currentTime, 0.15);
      const logF = Math.log2(f / (BASE_FREQ * 0.125)) / 7.0;
      const env  = Math.exp(-Math.pow((logF - 0.5) * 4.5, 2));
      shepardGains[i].gain.setTargetAtTime(0.022 * env, audioCtx.currentTime, 0.2);
    }
    shepardGain.gain.setTargetAtTime(soundEnabled ? 0.055 : 0, audioCtx.currentTime, 0.8);
  }

  function ensureAudio() {
    if (!audioStarted) { audioStarted = true; initAudio(); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // ── UI buttons ─────────────────────────────────────────────────────────────
  const sb = document.getElementById('sound-btn');
  if (sb) sb.onclick = () => {
    soundEnabled = !soundEnabled;
    ensureAudio();
    sb.classList.toggle('is-on', soundEnabled);
  };

  const db = document.getElementById('drift-btn');
  if (db) db.onclick = () => {
    driftEnabled = !driftEnabled;
    db.classList.toggle('is-on', driftEnabled);
  };

  // ── Input: Desktop mouse ───────────────────────────────────────────────────
  let isDragging = false;
  let dragLastX = 0, dragLastY = 0;
  let dragVelX  = 0, dragVelY  = 0; // screen px/s during drag (for inertia)

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    dragLastX = e.clientX; dragLastY = e.clientY;
    dragVelX = 0; dragVelY = 0;
    canvas.style.cursor = 'grabbing';
    vx = 0; vy = 0; // cancel inertia
    ensureAudio();
  });

  window.addEventListener('mousemove', e => {
    if (isDragging) {
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      const minSide = Math.min(window.innerWidth, window.innerHeight);
      const fxDelta = dx * (zoom / minSide);
      const fyDelta = dy * (zoom / minSide);
      tcx -= fxDelta;
      tcy -= fyDelta;
      cx  -= fxDelta;
      cy  -= fyDelta;
      // Track velocity for inertia (exponential smoothing)
      dragVelX = dragVelX * 0.6 + dx * 0.4;
      dragVelY = dragVelY * 0.6 + dy * 0.4;
      dragLastX = e.clientX; dragLastY = e.clientY;
      // Mouse influence on Julia (when not dragging it's the raw pointer)
    } else {
      mouseTarget[0] = e.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
    }
  });

  window.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    // Convert screen px/frame → fractal units/second inertia
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    const speed = Math.hypot(dragVelX, dragVelY);
    if (speed > 2) {
      // dragVel is pixels per ~16ms frame, convert to per-second
      vx = -(dragVelX / minSide) * zoom * 60;
      vy = -(dragVelY / minSide) * zoom * 60;
    }
  });

  // ── Wheel zoom to cursor ───────────────────────────────────────────────────
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    zoomToPoint(e.clientX, e.clientY, factor);
    ensureAudio();
  }, { passive: false });

  // ── Input: Touch ───────────────────────────────────────────────────────────
  let touchState = 'idle'; // 'idle' | 'drag' | 'pinch'
  let t1 = null, t2 = null;
  let lastTouchX = 0, lastTouchY = 0;
  let lastPinchDist = 0, lastPinchMidX = 0, lastPinchMidY = 0;
  let touchVelX = 0, touchVelY = 0;

  // Double-tap detection
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  const DBL_TAP_MS = 300, DBL_TAP_PX = 40;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    ensureAudio();

    if (e.touches.length === 1) {
      touchState = 'drag';
      t1 = e.touches[0];
      lastTouchX = t1.clientX; lastTouchY = t1.clientY;
      touchVelX = 0; touchVelY = 0;
      vx = 0; vy = 0; // cancel inertia on new touch

      // Double-tap check
      const now = Date.now();
      const dx = t1.clientX - lastTapX, dy = t1.clientY - lastTapY;
      if (now - lastTapTime < DBL_TAP_MS && Math.hypot(dx, dy) < DBL_TAP_PX) {
        // Double-tap: zoom in 2× at tap point
        zoomToPoint(t1.clientX, t1.clientY, 0.5);
        targetMorphEnergy += 0.6;
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = t1.clientX; lastTapY = t1.clientY;
        // Single tap burst
        targetMorphEnergy += 0.4;
      }

    } else if (e.touches.length === 2) {
      touchState = 'pinch';
      vx = 0; vy = 0; touchVelX = 0; touchVelY = 0;
      const a = e.touches[0], b = e.touches[1];
      lastPinchDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      lastPinchMidX = (a.clientX + b.clientX) * 0.5;
      lastPinchMidY = (a.clientY + b.clientY) * 0.5;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();

    if (touchState === 'drag' && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchX;
      const dy = touch.clientY - lastTouchY;
      const minSide = Math.min(window.innerWidth, window.innerHeight);
      const fxD = dx * (zoom / minSide);
      const fyD = dy * (zoom / minSide);
      tcx -= fxD; tcy -= fyD;
      cx  -= fxD; cy  -= fyD;
      touchVelX = touchVelX * 0.6 + dx * 0.4;
      touchVelY = touchVelY * 0.6 + dy * 0.4;
      lastTouchX = touch.clientX; lastTouchY = touch.clientY;
      mouseTarget[0] = touch.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - touch.clientY / window.innerHeight;

    } else if (touchState === 'pinch' && e.touches.length >= 2) {
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const midX = (a.clientX + b.clientX) * 0.5;
      const midY = (a.clientY + b.clientY) * 0.5;

      if (lastPinchDist > 0) {
        const factor = lastPinchDist / dist; // shrink fingers → zoom out
        zoomToPoint(midX, midY, factor);
      }

      // Pan by midpoint movement
      const dx = midX - lastPinchMidX;
      const dy = midY - lastPinchMidY;
      const minSide = Math.min(window.innerWidth, window.innerHeight);
      tcx -= dx * (zoom / minSide);
      tcy -= dy * (zoom / minSide);
      cx  -= dx * (zoom / minSide);
      cy  -= dy * (zoom / minSide);

      lastPinchDist = dist;
      lastPinchMidX = midX; lastPinchMidY = midY;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    const wasState = touchState;
    touchState = e.touches.length >= 2 ? 'pinch' : (e.touches.length === 1 ? 'drag' : 'idle');

    // Only apply inertia when a clean single-finger drag lifts off completely.
    // If we were pinching at any point, kill velocity — pinch finger velocities
    // are noisy and cause the canvas to fly away.
    if (wasState === 'drag' && touchState === 'idle') {
      const minSide = Math.min(window.innerWidth, window.innerHeight);
      const speed = Math.hypot(touchVelX, touchVelY);
      if (speed > 2) {
        vx = -(touchVelX / minSide) * zoom * 60;
        vy = -(touchVelY / minSide) * zoom * 60;
      }
    } else {
      // Pinch ended or finger count changed — always kill inertia
      vx = 0; vy = 0;
      touchVelX = 0; touchVelY = 0;
    }
  }, { passive: true });

  // ── Drift mode ─────────────────────────────────────────────────────────────
  let driftT = 0;

  // ── Render loop ────────────────────────────────────────────────────────────
  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016;
    lastFrameTime = ts;

    // ── Drift mode: slow orbital zoom keeping exploration feel ──────────────
    if (driftEnabled && !isDragging && touchState === 'idle') {
      driftT += dt;
      // Very slow zoom in, reset at deep limit
      tzoom *= Math.pow(0.985, dt * 60);
      if (tzoom < 3e-8) { tzoom = 3.0; tcx = -0.5; tcy = 0.0; }
      // Gentle orbit around current centre
      tcx += Math.sin(driftT * 0.07) * zoom * 0.0003;
      tcy += Math.cos(driftT * 0.11) * zoom * 0.0003;
    }

    // ── Inertia ─────────────────────────────────────────────────────────────
    if (!isDragging && touchState === 'idle') {
      const friction = Math.pow(0.88, dt * 60); // friction per second
      vx *= friction; vy *= friction;
      if (Math.abs(vx) > 1e-10 || Math.abs(vy) > 1e-10) {
        tcx += vx * dt; tcy += vy * dt;
      }
    }

    // ── Smooth interpolation ─────────────────────────────────────────────────
    // Pan is applied directly (no lag), only zoom is eased for smoothness
    cx   = tcx;
    cy   = tcy;
    const zoomEase = 1.0 - Math.pow(0.08, dt * 60); // snappy zoom
    zoom += (tzoom - zoom) * zoomEase;

    // ── Mouse influence ──────────────────────────────────────────────────────
    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.04;
    smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.04;

    // ── Theme colours ────────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      themeColA[i] += (targetColA[i] - themeColA[i]) * 0.025;
      themeColB[i] += (targetColB[i] - themeColB[i]) * 0.025;
      themeColC[i] += (targetColC[i] - themeColC[i]) * 0.025;
    }

    // ── Morph energy decay ───────────────────────────────────────────────────
    morphEnergy     += (targetMorphEnergy - morphEnergy) * 0.07;
    targetMorphEnergy *= Math.pow(0.25, dt);

    // ── Audio ────────────────────────────────────────────────────────────────
    updateAudio(dt);

    // ── Adaptive iterations ──────────────────────────────────────────────────
    const maxIter = calcMaxIter(zoom);

    // ── Draw ─────────────────────────────────────────────────────────────────
    gl.uniform1f(uT,       ts * 0.001);
    gl.uniform2f(uRes,     W, H);
    gl.uniform2f(uMouse,   smoothMouse[0], smoothMouse[1]);
    gl.uniform1f(uZoom,    zoom);
    gl.uniform2f(uCentre,  cx, cy);
    gl.uniform3f(uColA,    themeColA[0], themeColA[1], themeColA[2]);
    gl.uniform3f(uColB,    themeColB[0], themeColB[1], themeColB[2]);
    gl.uniform3f(uColC,    themeColC[0], themeColC[1], themeColC[2]);
    gl.uniform1f(uAudio,   audioPhase);
    gl.uniform1f(uMorph,   morphEnergy);
    gl.uniform1f(uMaxIter, maxIter);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(frame);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  canvas.style.cursor = 'grab';
  window.addEventListener('resize', resize);
  resize();
  // Expose zoom level for the depth HUD + reset hook
  function exposeState() {
    window._fractalZoom = zoom;
    requestAnimationFrame(exposeState);
  }
  requestAnimationFrame(exposeState);

  window._fractalReset = function () {
    tcx = -0.5; tcy = 0.0; tzoom = 3.0;
    vx = 0; vy = 0;
  };

  requestAnimationFrame(frame);
})();
