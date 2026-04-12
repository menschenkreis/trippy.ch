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
  // Log-space zoom for perceptually-linear easing at any depth
  let logZoom  = Math.log(zoom);   // rendered (eased) log zoom
  let tlogZoom = Math.log(tzoom);  // target log zoom

  // Inertia: velocity in fractal-space units per second
  let vx = 0, vy = 0;
  let lastFrameTime = 0;

  // Mouse influence on Julia constant (separate from pan)
  let mouseTarget = [0.5, 0.5], smoothMouse = [0.5, 0.5];

  // Julia constant — computed in JS so we can scale drift with zoom depth.
  // At deep zoom even 0.001 change in c rewires the whole fractal.
  let juliaT = 0;          // own time accumulator (decoupled from render time)
  let juliaCX = -0.745, juliaCY = 0.110;  // live value sent to shader

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
    tzoom    = newZoom;
    tlogZoom = Math.log(newZoom);
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
uniform vec2 juliaC;
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

  // Julia constant passed from JS (pre-scaled for current zoom depth)
  vec2 c = juliaC;

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
  const uJuliaC    = gl.getUniformLocation(prog, 'juliaC');
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
      // Don't update Julia constant while dragging — at deep zoom even
      // a tiny c shift completely morphs the fractal, making pan feel wild.
      // mouseTarget[0] = e.clientX / window.innerWidth;
      // mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
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
  let pinchJustEnded = false; // suppress inertia for the drag immediately after a pinch

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
      // If this touch follows a pinch, mark it so we don't fling on release
      if (pinchJustEnded) { pinchJustEnded = false; touchVelX = 0; touchVelY = 0; }

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
      pinchJustEnded = false;
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
      // Don't update Julia constant during touch drag (same reason as mouse drag)
      // mouseTarget[0] = touch.clientX / window.innerWidth;
      // mouseTarget[1] = 1.0 - touch.clientY / window.innerHeight;

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

    if (wasState === 'pinch') {
      // A finger lifted off during/after pinch — kill everything, mark pinch-just-ended
      vx = 0; vy = 0; touchVelX = 0; touchVelY = 0;
      pinchJustEnded = true;
      // *** THE REAL FIX: re-anchor lastTouch to the remaining finger ***
      // Without this, the next touchmove computes a huge stale delta → flick.
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    } else if (wasState === 'drag' && touchState === 'idle' && !pinchJustEnded) {
      // Clean single-finger drag ended — apply inertia
      const minSide = Math.min(window.innerWidth, window.innerHeight);
      const speed = Math.hypot(touchVelX, touchVelY);
      if (speed > 2) {
        vx = -(touchVelX / minSide) * zoom * 60;
        vy = -(touchVelY / minSide) * zoom * 60;
      }
    } else {
      vx = 0; vy = 0; touchVelX = 0; touchVelY = 0;
      pinchJustEnded = false;
    }
  }, { passive: true });

  // ── Drift mode ─────────────────────────────────────────────────────────────
  let driftT = 0;
  let driftVx = 0, driftVy = 0;       // smooth drift velocity (fractal units/s)
  let driftSteerX = 0, driftSteerY = 0; // target steering direction
  let lastSampleTs = -9999;

  // Score how "boundary-interesting" a fractal-space point is.
  // Returns a 0-1 value peaking at the Julia set edge band.
  function juliaInterest(px, py, c0x, c0y, maxI) {
    let zx = px, zy = py, i = 0;
    while (i < maxI) {
      const zx2 = zx * zx, zy2 = zy * zy;
      if (zx2 + zy2 > 256) break;
      zy = 2 * zx * zy + c0y;
      zx = zx2 - zy2 + c0x;
      i++;
    }
    if (i >= maxI) return 0; // solid interior
    const sl = i - Math.log2(Math.log2(zx * zx + zy * zy)) + 4;
    const t  = sl / maxI;
    return t < 0.01 ? 0 : 4 * t * (1 - t); // bell curve, peaks near boundary
  }

  // Sample candidate positions around the current centre, steer toward the
  // most boundary-rich direction. Called at ~4 Hz during auto-drift.
  function updateDriftSteering() {
    const now    = performance.now() * 0.001;
    const scoreI = Math.min(100, Math.max(35, Math.round(35 + Math.log2(3.0 / Math.max(zoom, 1e-14)) * 5)));
    // Mirror the shader's Julia constant at this moment
    const c0x = juliaCX;
    const c0y = juliaCY;

    const N      = 12;
    const probeR = zoom * 0.5; // probe ring at 50% of visible half-width
    let   bestScore = -1, bestAngle = 0;

    for (let k = 0; k < N; k++) {
      const angle = (k / N) * Math.PI * 2;
      const s = juliaInterest(tcx + Math.cos(angle) * probeR,
                              tcy + Math.sin(angle) * probeR,
                              c0x, c0y, scoreI);
      if (s > bestScore) { bestScore = s; bestAngle = angle; }
    }

    if (bestScore < 0.04) {
      // Completely void — zoom out and drift back toward the interesting region
      tzoom = Math.min(tzoom * 2.5, 3.0);
      tlogZoom = Math.log(tzoom);
      driftSteerX = (-0.5 - tcx) * 0.5;
      driftSteerY = ( 0.0 - tcy) * 0.5;
    } else {
      // Steer gently toward the best edge direction
      driftSteerX = Math.cos(bestAngle) * probeR * 0.25;
      driftSteerY = Math.sin(bestAngle) * probeR * 0.25;
    }
  }


  // ── Render loop ────────────────────────────────────────────────────────────
  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016;
    lastFrameTime = ts;

    const interacting = isDragging || touchState !== 'idle';

    // ── Drift mode ───────────────────────────────────────────────────────────
    if (driftEnabled && !interacting) {
      driftT += dt;

      // Re-sample steering every ~250 ms
      if (driftT - lastSampleTs > 0.25) {
        lastSampleTs = driftT;
        updateDriftSteering();
      }

      // Smooth velocity toward the steering target
      const steerStrength = 0.3;
      driftVx += (driftSteerX * steerStrength - driftVx) * Math.min(dt * 0.375, 1);
      driftVy += (driftSteerY * steerStrength - driftVy) * Math.min(dt * 0.375, 1);

      // Advance position
      tcx += driftVx * dt;
      tcy += driftVy * dt;

      // Slow zoom — follows boundary depth naturally
      tzoom *= Math.pow(0.9967, dt * 60);
      tlogZoom = Math.log(Math.max(tzoom, 1e-14));
      if (tzoom < 1e-8) { tzoom = 3.0; tlogZoom = Math.log(3.0); tcx = -0.5; tcy = 0.0; driftVx = 0; driftVy = 0; lastSampleTs = -9999; }
    }

    // ── Inertia ──────────────────────────────────────────────────────────────
    if (!interacting) {
      const friction = Math.pow(0.85, dt * 60);
      vx *= friction; vy *= friction;
      if (Math.abs(vx) > 1e-12 || Math.abs(vy) > 1e-12) {
        tcx += vx * dt; tcy += vy * dt;
      }
    }

    // ── Smooth interpolation ─────────────────────────────────────────────────
    // While a finger/mouse is down: pan tracks 1:1 (no lag at all).
    // While coasting / resetting / drifting: smooth ease so motion feels fluid.
    if (interacting) {
      cx = tcx;
      cy = tcy;
    } else {
      // expo ease — settles in ~300 ms, feels organic
      const panEase = 1.0 - Math.pow(0.012, dt * 60);
      cx += (tcx - cx) * panEase;
      cy += (tcy - cy) * panEase;
    }
    // Zoom eased in log-space: perceptually constant speed at any depth
    // Base 0.18 → settles in ~0.8s, feels like a gentle camera pull
    const zoomEase = 1.0 - Math.pow(0.18, dt * 60);
    logZoom += (tlogZoom - logZoom) * zoomEase;
    zoom = Math.exp(logZoom);

    // ── Mouse / Julia influence ───────────────────────────────────────────────
    // Only let Julia constant drift when not interacting; freeze it during drag/pinch
    if (!interacting) {
      smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.015;
      smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.015;
    }

    // ── Theme colours ────────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      themeColA[i] += (targetColA[i] - themeColA[i]) * 0.018;
      themeColB[i] += (targetColB[i] - themeColB[i]) * 0.018;
      themeColC[i] += (targetColC[i] - themeColC[i]) * 0.018;
    }

    // ── Morph energy decay ───────────────────────────────────────────────────
    morphEnergy       += (targetMorphEnergy - morphEnergy) * 0.06;
    targetMorphEnergy *= Math.pow(0.2, dt);

    // ── Julia constant — zoom-scaled drift ───────────────────────────────────
    // driftScale: 1.0 at overview (zoom>=1), shrinks to ~0 at deep zoom.
    // This keeps c visually stable — perturbations never exceed ~1 screen unit.
    const driftScale = Math.min(1.0, zoom * 1.5);
    juliaT += dt * driftScale;
    // Slow sinusoidal drift, amplitude scales with zoom so visual shift is constant
    const jDrift = 0.045 * driftScale;
    const jMouse = 0.05  * driftScale;
    juliaCX = -0.745 + jDrift * Math.cos(juliaT * 0.25)
                     + (smoothMouse[0] - 0.5) * jMouse;
    juliaCY =  0.110 + jDrift * Math.sin(juliaT * 0.25 * 1.3)
                     + (smoothMouse[1] - 0.5) * jMouse;

    // ── Audio ────────────────────────────────────────────────────────────────
    updateAudio(dt);

    // ── Adaptive iterations ──────────────────────────────────────────────────
    const maxIter = calcMaxIter(zoom);

    // ── Draw ─────────────────────────────────────────────────────────────────
    gl.uniform1f(uT,       ts * 0.001);
    gl.uniform2f(uJuliaC,  juliaCX, juliaCY);
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
    // Set targets only — all easing handles the animation
    tcx = -0.5; tcy = 0.0;
    tzoom    = 3.0;
    tlogZoom = Math.log(3.0);
    vx = 0; vy = 0;
    targetMorphEnergy += 0.5;
  };

  requestAnimationFrame(frame);
})();
