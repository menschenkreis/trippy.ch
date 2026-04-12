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

    // ── Hyperbolic warp ───────────────────────────────────────────────────
    vec2 hyperWarp(vec2 p, float t) {
      float r = length(p);
      float warp = 1.0 + 0.3 * sin(r * 3.0 - t * 0.7) * exp(-r * 0.5);
      return p * warp;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

      float t = u_time;

      // Mouse influence — warps the centre
      vec2 m = (u_mouse - 0.5) * 0.4;
      float mouseInfluence = smoothstep(0.0, 0.5, length(uv - m * 0.5));

      // ── Hyperbolic distortion ─────────────────────────────────────────
      vec2 p = hyperWarp(uv + m * 0.3, t);

      // Spiral twist
      float r = length(p);
      float spiral = t * 0.1 + r * 1.5;
      float cs = cos(spiral), sn = sin(spiral);
      p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);

      // ── Kaleidoscope fold ─────────────────────────────────────────────
      float n = u_folds;
      vec2 kp = kaleidoscope(p, n);

      // Second pass fold for complexity
      kp = kaleidoscope(kp * 1.3, max(n - 1.0, 2.0));

      // ── Domain warping ────────────────────────────────────────────────
      vec2 q = vec2(
        fbm(kp * 3.0 + t * 0.15 + u_seed),
        fbm(kp * 3.0 + vec2(5.2, 1.3) + t * 0.12 + u_seed)
      );
      vec2 rr = vec2(
        fbm(kp * 3.0 + q * 4.0 + vec2(1.7, 9.2) + t * 0.08),
        fbm(kp * 3.0 + q * 4.0 + vec2(8.3, 2.8) + t * 0.1)
      );

      float f = fbm(kp * 3.0 + rr * 3.0);

      // ── Colour mapping ────────────────────────────────────────────────
      vec3 col = mix(u_col1, u_col2, clamp(f * f * 2.0, 0.0, 1.0));
      col = mix(col, u_col3, clamp(length(q) * 0.5, 0.0, 1.0));
      col = mix(col, u_col1 * 1.5, clamp(length(rr.x) * 0.4, 0.0, 1.0));

      // Bright edge glow on fold lines
      float edgeDist = length(kp - kaleidoscope(kp + vec2(0.001, 0.0), n));
      col += u_col2 * 0.15 / (edgeDist + 0.01);

      // Radial vignette
      col *= 1.0 - 0.3 * pow(length(uv), 2.5);

      // Mouse proximity glow
      float md = length(uv - m * 0.5);
      col += u_col3 * 0.08 * exp(-md * 3.0);

      // Subtle scanlines
      col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 1.5);

      // Tone mapping
      col = col / (col + 0.5);
      col = pow(col, vec3(0.9));

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
  const palettes = [
    [[0.95,0.15,0.4],[0.1,0.85,0.95],[0.98,0.75,0.1]],   // hot pink / cyan / gold
    [[0.2,1.0,0.5],[0.6,0.1,0.95],[1.0,0.35,0.05]],       // green / violet / orange
    [[1.0,0.0,0.5],[0.0,1.0,0.8],[0.95,0.95,0.1]],        // magenta / teal / yellow
    [[0.1,0.4,1.0],[1.0,0.1,0.6],[0.2,1.0,0.2]],          // blue / hot pink / green
    [[1.0,0.5,0.0],[0.5,0.0,1.0],[0.0,1.0,0.7]],          // orange / purple / aqua
    [[0.9,0.9,1.0],[1.0,0.2,0.2],[0.2,0.2,1.0]],          // ice / red / blue
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
