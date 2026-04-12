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
      // Hyperbolic depth: 1/r gives infinite tunnel, log adds non-Euclidean compression
      float depth = log(1.0 + 0.8 / max(r, 0.0001));
      float angle = atan(uv.y, uv.x);
      // Mouse steers the tunnel
      angle += (m.x) * 0.5;
      depth += (m.y) * 0.3;
      // Forward flight — time drives depth
      depth += t * 0.15;
      // Geodesic spiral — twist increases with depth (hyperbolic!)
      float twist = depth * 0.6 + 0.2 * sin(depth * 0.5);
      angle += twist;
      return vec3(angle, depth, r);
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

      // Unwrap angle + depth into 2D for kaleidoscope
      vec2 p = vec2(cos(angle), sin(angle)) * depth;

      // ── Kaleidoscope fold on tunnel walls ────────────────────────────
      float n = u_folds;
      vec2 kp = kaleidoscope(p, n);
      // Second fold pass
      kp = kaleidoscope(kp * 1.3 + vec2(t * 0.02, 0.0), max(n - 1.0, 2.0));

      // ── Domain warping — layered along the tunnel ───────────────────
      float warpScale = 1.5 + 0.5 * sin(depth * 0.3); // walls breathe
      vec2 q = vec2(
        fbm(kp * warpScale + t * 0.06 + u_seed),
        fbm(kp * warpScale + vec2(5.2, 1.3) + t * 0.05 + u_seed)
      );
      vec2 rr = vec2(
        fbm(kp * warpScale + q * 3.0 + vec2(1.7, 9.2) + t * 0.03),
        fbm(kp * warpScale + q * 3.0 + vec2(8.3, 2.8) + t * 0.04)
      );
      float f = fbm(kp * warpScale + rr * 2.0);

      // ── Colour: ominous ember tunnel ────────────────────────────────
      vec3 col = vec3(0.01, 0.004, 0.001);

      // Main ember glow
      float ember = pow(f, 1.6) * 1.4;
      col += u_col1 * ember;

      // Hot cracks in the walls
      float cracks = pow(max(f - 0.4, 0.0) * 3.5, 1.2);
      col += u_col2 * cracks * 0.9;

      // Depth-based heat — deeper = more intense
      float depthHeat = 0.5 + 0.5 * sin(depth * 0.7);
      col += u_col3 * depthHeat * 0.15;

      // Fold lines glow like magma veins
      float edgeDist = length(kp - kaleidoscope(kp + vec2(0.001, 0.0), n));
      float veinGlow = 0.06 / (edgeDist + 0.01);
      col += u_col2 * veinGlow * 0.6;

      // Speed lines — streaks rushing past
      float streaks = abs(sin(depth * 8.0 + angle * 2.0));
      streaks = pow(streaks, 8.0) * 0.12;
      col += u_col1 * streaks;

      // Central glow — the "light at the end"
      float centerGlow = 0.04 / max(screenR, 0.001);
      col += vec3(0.6, 0.08, 0.01) * min(centerGlow, 1.5) * 0.15;

      // Radial vignette — tunnel edges dark
      col *= 1.0 - 0.4 * pow(screenR, 2.0);

      // Fog with depth — far walls dimmer
      float fog = exp(-depth * 0.08);
      col *= 0.4 + 0.6 * fog;

      // Film grain
      col += (hash(uv * u_res + fract(t * 100.0)) - 0.5) * 0.012;

      // Tone mapping
      col = pow(col, vec3(1.05));
      col = col / (col + 0.3);

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
  // ── Palettes (ominous ember) ──────────────────────────────────────────────
  const palettes = [
    [[0.8,0.12,0.02],[1.0,0.45,0.05],[0.15,0.03,0.0]],   // deep crimson / amber / charcoal
    [[0.6,0.04,0.1],[1.0,0.25,0.02],[0.08,0.01,0.05]],   // dark wine / hot orange / void
    [[0.9,0.3,0.0],[0.5,0.08,0.0],[0.05,0.05,0.08]],     // burnt orange / dark rust / cold ash
    [[0.3,0.0,0.0],[0.95,0.5,0.08],[0.1,0.02,0.02]],      // near-black / molten gold / dried blood
    [[0.7,0.1,0.15],[1.0,0.6,0.1],[0.02,0.01,0.03]],      // smouldering red / bright ember / abyss
    [[0.4,0.06,0.0],[0.85,0.35,0.05],[0.12,0.08,0.06]],   // dark umber / glowing coal / ash grey
  ];
  let pal = palettes[0];

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
    pal = palettes[Math.floor(Math.random() * palettes.length)];
  });

  resetBtn.addEventListener('click', () => {
    mouse.tx = 0.5; mouse.ty = 0.5;
    folds = 6; foldIdx = 3;
    foldBtn.textContent = '6×';
    autoMode = false;
    autoBtn.classList.remove('is-on');
    paletteSeed = 0;
    pal = palettes[0];
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
