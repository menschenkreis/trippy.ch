// ── Non-Euclidean Kaleidoscope ──────────────────────────────────────────────
(function () {
  'use strict';

  const canvas = document.getElementById('k-canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { document.body.innerHTML = '<p style="color:#fff;padding:2rem">WebGL not supported.</p>'; return; }

  // ── State ─────────────────────────────────────────────────────────────────
  let mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let folds = 6;
  const foldOptions = [3, 4, 5, 6, 8, 12];
  let foldIdx = 3; // starts at 6
  let autoMode = false;
  let autoTime = 0;
  let time = 0;
  let paletteSeed = 0;

  // ── Shaders ───────────────────────────────────────────────────────────────
  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FS = `
    precision highp float;

    uniform float u_time;
    uniform vec2  u_res;
    uniform vec2  u_mouse;
    uniform float u_folds;
    uniform float u_auto;
    uniform vec3  u_col1;
    uniform vec3  u_col2;
    uniform vec3  u_col3;
    uniform float u_seed;

    #define PI 3.14159265359
    #define TAU 6.28318530718

    // ── Noise helpers ──────────────────────────────────────────────────────
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(100.0);
        a *= 0.5;
      }
      return v;
    }

    // ── Kaleidoscope fold ─────────────────────────────────────────────────
    vec2 kaleidoscope(vec2 p, float n) {
      float angle = TAU / n;
      float a = atan(p.y, p.x);
      a = mod(a, angle);
      a = abs(a - angle * 0.5); // mirror
      float r = length(p);
      return vec2(cos(a), sin(a)) * r;
    }

    // ── Tunnel UV — polar coordinates with depth ──────────────────────
    vec3 tunnelUv(vec2 uv, float t, vec2 m) {
      float r = length(uv);
      float depth = log(1.0 + 0.8 / max(r, 0.0001));
      float angle = atan(uv.y, uv.x);
      angle += m.x * 0.6;
      depth += m.y * 0.35;
      depth += t * 0.15;
      // Morphing twist — multiple sine waves for organic feel
      float twist = depth * 0.5
        + 0.3 * sin(depth * 0.4 + t * 0.2)
        + 0.15 * sin(depth * 0.9 - t * 0.15)
        + 0.1 * cos(depth * 1.5 + t * 0.3);
      angle += twist;
      return vec3(angle, depth, r);
    }

    // Smooth morphing between fold counts
    float morphFolds(vec2 p, float n1, float n2, float blend) {
      vec2 k1 = kaleidoscope(p, n1);
      vec2 k2 = kaleidoscope(p, n2);
      return mix(length(k1), length(k2), blend);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

      float t = u_time;
      vec2 m = (u_mouse - 0.5);

      // ── Tunnel projection ────────────────────────────────────────────
      vec3 td = tunnelUv(uv, t, m);
      float angle = td.x;
      float depth = td.y;
      float screenR = td.z;

      // Unwrap into 2D
      vec2 p = vec2(cos(angle), sin(angle)) * depth;

      // ── Morphing kaleidoscope fold ───────────────────────────────────
      float n = u_folds;
      // Slowly morph fold count between n and n+1
      float morphPhase = sin(t * 0.12) * 0.5 + 0.5; // 0..1
      float nNext = n + 1.0;
      vec2 kp1 = kaleidoscope(p, n);
      vec2 kp2 = kaleidoscope(p, nNext);
      vec2 kp = mix(kp1, kp2, smoothstep(0.3, 0.7, morphPhase));
      // Second fold pass — also morphs
      vec2 kp1b = kaleidoscope(kp * 1.3 + vec2(t * 0.025, 0.0), max(n - 1.0, 2.0));
      vec2 kp2b = kaleidoscope(kp * 1.3 + vec2(t * 0.025, 0.0), max(n, 3.0));
      kp = mix(kp1b, kp2b, smoothstep(0.3, 0.7, morphPhase));

      // ── Heavy domain warping — 3 layers, evolving ──────────────────
      float warpScale = 1.5 + 0.6 * sin(depth * 0.3 + t * 0.2);
      float warpScale2 = 2.0 + 0.8 * cos(depth * 0.2 - t * 0.15);

      vec2 q = vec2(
        fbm(kp * warpScale + t * 0.08 + u_seed),
        fbm(kp * warpScale + vec2(5.2, 1.3) + t * 0.07 + u_seed)
      );
      vec2 rr = vec2(
        fbm(kp * warpScale2 + q * 3.5 + vec2(1.7, 9.2) + t * 0.05),
        fbm(kp * warpScale2 + q * 3.5 + vec2(8.3, 2.8) + t * 0.06)
      );
      // Third warp layer for extra trippiness
      vec2 ss = vec2(
        fbm(kp * warpScale * 0.7 + rr * 2.5 + vec2(3.1, 7.4) + t * 0.04),
        fbm(kp * warpScale * 0.7 + rr * 2.5 + vec2(6.7, 2.1) + t * 0.03)
      );
      float f = fbm(kp * warpScale + rr * 2.5 + ss * 1.5);

      // ── Vibrant colour: glowing tunnel ─────────────────────────────
      vec3 col = vec3(0.012, 0.006, 0.003);

      // Slow colour cycling
      float colourShift = sin(t * 0.08) * 0.5 + 0.5;
      vec3 c1 = mix(u_col1, u_col3, colourShift * 0.3);
      vec3 c2 = mix(u_col2, u_col1, colourShift * 0.25);

      // Boost saturation for vibrancy
      c1 = mix(vec3(dot(c1, vec3(0.299, 0.587, 0.114))), c1, 1.8);
      c2 = mix(vec3(dot(c2, vec3(0.299, 0.587, 0.114))), c2, 2.0);

      // Main glow — brighter
      float ember = pow(f, 1.3) * 2.0;
      col += c1 * ember;

      // Hot cracks — vivid
      float cracks = pow(max(f - 0.3, 0.0) * 2.8, 1.0);
      col += c2 * cracks * 1.2;

      // Pulsing depth heat
      float depthHeat = 0.5 + 0.5 * sin(depth * 0.7 + t * 0.25);
      col += u_col3 * depthHeat * 0.3;

      // Morphing fold-line glow — vivid veins
      float edgeDist = length(kp - mix(
        kaleidoscope(kp + vec2(0.001, 0.0), n),
        kaleidoscope(kp + vec2(0.001, 0.0), nNext),
        smoothstep(0.3, 0.7, morphPhase)
      ));
      float veinGlow = 0.09 / (edgeDist + 0.008);
      col += c2 * veinGlow * 0.9;

      // Speed streaks
      float streakFreq = 6.0 + 4.0 * sin(depth * 0.3 + t * 0.1);
      float streaks = abs(sin(depth * streakFreq + angle * 3.0));
      streaks = pow(streaks, 6.0) * 0.2;
      col += c1 * streaks;

      // Morphing ring pulses
      float rings = sin(depth * 4.0 - t * 0.6) * 0.5 + 0.5;
      rings = pow(rings, 4.0) * 0.18;
      col += c2 * rings;

      // Central glow — vivid
      float centerGlow = 0.06 / max(screenR, 0.001);
      vec3 centerCol = mix(u_col1 * 1.5, u_col2 * 1.5, sin(t * 0.15) * 0.5 + 0.5);
      col += centerCol * min(centerGlow, 2.0) * 0.2;

      // Vignette — lighter
      col *= 1.0 - 0.25 * pow(screenR, 2.0);

      // Depth fog
      float fog = exp(-depth * 0.05 + 0.15 * sin(t * 0.2));
      col *= 0.5 + 0.5 * clamp(fog, 0.0, 1.0);

      // Chromatic aberration
      float aberration = 0.004 * screenR;
      float fR = fbm((kp + vec2(aberration, 0.0)) * warpScale + rr * 2.5);
      float fB = fbm((kp - vec2(aberration, 0.0)) * warpScale + rr * 2.5);
      col.r += c1.r * pow(fR, 1.3) * 0.25;
      col.b += c1.b * pow(fB, 1.3) * 0.25;

      // Film grain
      col += (hash(uv * u_res + fract(t * 100.0)) - 0.5) * 0.012;

      // Tone mapping — preserve vibrancy
      col = pow(max(col, vec3(0.0)), vec3(0.95));
      col = col / (col + 0.22);
      col = pow(col, vec3(0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ── Compile helpers ────────────────────────────────────────────────────────
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Full-screen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Uniforms
  const u = {};
  ['u_time','u_res','u_mouse','u_folds','u_auto','u_col1','u_col2','u_col3','u_seed'].forEach(n => u[n] = gl.getUniformLocation(prog, n));

  // ── Palettes ──────────────────────────────────────────────────────────────
  // ── Color theory palette generator ─────────────────────────────────────
  function hsl2rgb(h, s, l) {
    // h: 0-360, s: 0-1, l: 0-1
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if      (h < 60)  { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else               { r = c; g = 0; b = x; }
    return [r + m, g + m, b + m];
  }

  function generatePalette() {
    // Pick a random harmony scheme
    const schemes = ['analogous', 'triadic', 'splitComp', 'tetradic', 'warmMono', 'coolMono'];
    const scheme = schemes[Math.floor(Math.random() * schemes.length)];
    const baseHue = Math.random() * 360;
    const sat = 0.7 + Math.random() * 0.3; // 70-100% saturation

    let hues;
    switch (scheme) {
      case 'analogous':
        hues = [baseHue, baseHue + 30 + Math.random() * 30, baseHue - 30 - Math.random() * 30];
        break;
      case 'triadic':
        hues = [baseHue, baseHue + 120 + Math.random() * 20 - 10, baseHue + 240 + Math.random() * 20 - 10];
        break;
      case 'splitComp':
        hues = [baseHue, baseHue + 150 + Math.random() * 30, baseHue + 210 + Math.random() * 30];
        break;
      case 'tetradic':
        hues = [baseHue, baseHue + 90 + Math.random() * 30, baseHue + 180 + Math.random() * 20, baseHue + 270 + Math.random() * 20];
        break;
      case 'warmMono':
        // Reds, oranges, yellows — ember territory
        hues = [Math.random() * 60, 20 + Math.random() * 40, 340 + Math.random() * 40];
        break;
      case 'coolMono':
        // Blues, purples, cyans
        hues = [180 + Math.random() * 60, 240 + Math.random() * 60, 300 + Math.random() * 60];
        break;
    }

    // Vary lightness: one dark, one mid, one bright
    const lightnesses = [
      0.35 + Math.random() * 0.15,  // dark base
      0.5 + Math.random() * 0.2,    // mid accent
      0.2 + Math.random() * 0.15,   // deep shadow
    ];

    return [
      hsl2rgb(hues[0], sat, lightnesses[0]),
      hsl2rgb(hues[1], sat * (0.9 + Math.random() * 0.1), lightnesses[1] + 0.1),
      hsl2rgb(hues[2], sat * 0.7, lightnesses[2]),
    ];
  }

  let pal = generatePalette();

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Input ─────────────────────────────────────────────────────────────────
  function onMove(x, y) {
    mouse.tx = x / window.innerWidth;
    mouse.ty = 1.0 - y / window.innerHeight;
  }
  canvas.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  // ── Buttons ───────────────────────────────────────────────────────────────
  const hud = document.getElementById('hud');
  const foldBtn = document.getElementById('fold-btn');
  const autoBtn = document.getElementById('auto-btn');
  const themeBtn = document.getElementById('theme-btn');
  const resetBtn = document.getElementById('reset-btn');

  function updateHud() {
    const mode = autoMode ? 'auto · ' : '';
    hud.textContent = `symmetry ${folds} · hyperbolic${autoMode ? ' · auto' : ''}`;
  }

  foldBtn.addEventListener('click', () => {
    foldIdx = (foldIdx + 1) % foldOptions.length;
    folds = foldOptions[foldIdx];
    foldBtn.textContent = folds + '×';
    updateHud();
  });

  autoBtn.addEventListener('click', () => {
    autoMode = !autoMode;
    autoBtn.classList.toggle('is-on', autoMode);
    updateHud();
  });

  themeBtn.addEventListener('click', () => {
    paletteSeed = Math.random() * 100;
    pal = generatePalette();
  });

  resetBtn.addEventListener('click', () => {
    mouse.tx = 0.5; mouse.ty = 0.5;
    folds = 6; foldIdx = 3;
    foldBtn.textContent = '6×';
    autoMode = false;
    autoBtn.classList.remove('is-on');
    paletteSeed = 0;
    pal = generatePalette();
    autoTime = 0;
    updateHud();
  });

  // Expose reset
  window._kaleidoReset = () => resetBtn.click();

  // ── Render loop ───────────────────────────────────────────────────────────
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) * 0.001, 0.05);
    last = now;
    time += dt;

    // Smooth mouse
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;

    // Auto mode: orbit mouse slowly
    if (autoMode) {
      autoTime += dt * 0.3;
      mouse.tx = 0.5 + 0.25 * Math.sin(autoTime * 0.7);
      mouse.ty = 0.5 + 0.25 * Math.cos(autoTime * 0.5);
    }

    gl.uniform1f(u.u_time, time);
    gl.uniform2f(u.u_res, canvas.width, canvas.height);
    gl.uniform2f(u.u_mouse, mouse.x, mouse.y);
    gl.uniform1f(u.u_folds, folds);
    gl.uniform1f(u.u_auto, autoMode ? 1.0 : 0.0);
    gl.uniform3fv(u.u_col1, pal[0]);
    gl.uniform3fv(u.u_col2, pal[1]);
    gl.uniform3fv(u.u_col3, pal[2]);
    gl.uniform1f(u.u_seed, paletteSeed);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);

})();
