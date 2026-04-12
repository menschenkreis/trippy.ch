// ── Menger Descent — Ray-marched fractal sponge fly-through ─────────────────
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { document.body.innerHTML = '<p style="color:#fff;padding:2rem">WebGL not supported.</p>'; return; }

  // ── State ─────────────────────────────────────────────────────────────────
  let mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let speed = 1.0;
  const speeds = [0.5, 1.0, 2.0, 3.0];
  let speedIdx = 1;
  let autoMode = false;
  let autoTime = 0;
  let time = 0;
  let maxIter = 4;

  // ── Shaders ───────────────────────────────────────────────────────────────
  const VS = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.0,1.0); }`;

  const FS = `
precision highp float;

uniform float u_time;
uniform vec2  u_res;
uniform vec2  u_mouse;
uniform float u_speed;
uniform float u_auto;
uniform vec3  u_col1;
uniform vec3  u_col2;
uniform vec3  u_col3;
uniform float u_seed;

#define MAX_STEPS 120
#define MAX_DIST  50.0
#define SURF_DIST 0.0005

mat2 rot(float a){ float s=sin(a),c=cos(a); return mat2(c,-s,s,c); }

// ── Menger Sponge SDF ───────────────────────────────────────────────────
// Based on the iterative cross-removal approach
float sdCross(vec3 p, float s) {
  float a = max(abs(p.x), abs(p.y)) - s;
  float b = max(abs(p.y), abs(p.z)) - s;
  float c = max(abs(p.z), abs(p.x)) - s;
  return min(a, min(b, c));
}

float mengerSponge(vec3 p, int iterations) {
  float d = sdBox(p, vec3(1.0));
  float s = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= iterations) break;
    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    float c2 = (min(da, min(db, dc)) - 1.0) / s;
    d = max(d, c2);
  }
  return d;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ── Scene SDF ───────────────────────────────────────────────────────────
// Iteration count adapts with depth for performance
float sceneSDF(vec3 p) {
  float d = mengerSponge(p, 4);

  // Add subtle organic warping to make it breathe
  float breathe = sin(u_time * 0.3) * 0.03;
  d += breathe * sin(p.x * 4.0 + u_time * 0.5) * sin(p.y * 4.0 + u_time * 0.4) * sin(p.z * 4.0 + u_time * 0.3);

  return d;
}

// ── Normal via gradient ─────────────────────────────────────────────────
vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

// ── Ambient occlusion ───────────────────────────────────────────────────
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.12 * float(i);
    float d = sceneSDF(p + h * n);
    occ += (h - d) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// ── Soft shadow ─────────────────────────────────────────────────────────
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 32; i++) {
    float h = sceneSDF(ro + rd * t);
    if (h < 0.001) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.2);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ── Hash ────────────────────────────────────────────────────────────────
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time;

  // ── Camera ────────────────────────────────────────────────────────────
  // Fly along Z axis, descending through the sponge
  float camZ = -t * 0.4 * u_speed;
  vec3 ro = vec3(0.0, 0.0, camZ);

  // Mouse steers look direction
  vec2 m = (u_mouse - 0.5);
  float yaw = m.x * 1.2;
  float pitch = m.y * 0.8;

  // Auto mode: orbit + slight wander
  if (u_auto > 0.5) {
    yaw = sin(t * 0.15) * 0.6 + sin(t * 0.07) * 0.3;
    pitch = sin(t * 0.11) * 0.3 + cos(t * 0.09) * 0.15;
  }

  // Look direction
  vec3 rd = normalize(vec3(
    sin(yaw) * cos(pitch),
    sin(pitch),
    cos(yaw) * cos(pitch)
  ));

  // Camera matrix
  vec3 ww = normalize(rd);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // ── Ray March ─────────────────────────────────────────────────────────
  float totalDist = 0.0;
  int steps = 0;
  vec3 p;
  float minDist = 1e10;

  for (int i = 0; i < MAX_STEPS; i++) {
    p = ro + rd * totalDist;
    float d = sceneSDF(p);
    minDist = min(minDist, d);
    if (d < SURF_DIST || totalDist > MAX_DIST) break;
    totalDist += d * 0.7; // slightly conservative for safety
    steps = i;
  }

  // ── Colour ────────────────────────────────────────────────────────────
  vec3 col;

  if (totalDist < MAX_DIST) {
    // Hit the sponge
    vec3 n = getNormal(p);
    float ao = calcAO(p, n);

    // Fractal iteration colouring — how deep in the sponge structure
    float iterCol = 0.0;
    vec3 pp = p;
    float ss = 1.0;
    for (int i = 0; i < 4; i++) {
      vec3 a = mod(pp * ss, 2.0) - 1.0;
      ss *= 3.0;
      vec3 r = abs(1.0 - 3.0 * abs(a));
      float cd = (min(max(r.x, r.y), min(r.y, r.z), min(r.z, r.x)) - 1.0) / ss;
      iterCol += max(0.0, -cd * ss) * 0.3;
    }

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(rd, n), lightDir), 0.0), 32.0);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

    // Psychedelic colour based on position, normal, and iteration depth
    float h1 = fract(p.x * 0.5 + p.y * 0.3 + p.z * 0.2 + u_seed);
    float h2 = fract(dot(n, vec3(1.0)) * 2.0 + u_seed * 0.5);
    float h3 = iterCol * 0.3;

    col = u_col1 * (0.3 + 0.7 * h1);
    col = mix(col, u_col2, h2 * 0.5);
    col = mix(col, u_col3, h3 * 0.4);

    // Apply lighting
    col *= (0.15 + 0.85 * diff) * ao;
    col += u_col2 * spec * 0.6;
    col += u_col3 * fres * 0.3;

    // Soft shadow from internal light
    float sha = softShadow(p + n * 0.01, lightDir, 0.02, 5.0, 8.0);
    col *= 0.5 + 0.5 * sha;

    // Emissive glow in deep cavities
    float cavity = 1.0 - ao;
    col += u_col1 * cavity * cavity * 0.5;

    // Fog with depth
    float fog = 1.0 - exp(-totalDist * 0.08);
    vec3 fogCol = mix(vec3(0.02, 0.005, 0.01), u_col3 * 0.15, 0.5 + 0.5 * sin(t * 0.1));
    col = mix(col, fogCol, fog * fog);

  } else {
    // Missed — background void
    float bgGlow = exp(-totalDist * 0.05);
    col = u_col3 * 0.03 * bgGlow;

    // Subtle stars
    float stars = pow(hash21(floor(uv * 200.0 + u_seed)), 20.0) * 0.3;
    col += stars;
  }

  // ── Post-processing ───────────────────────────────────────────────────
  // Vignette
  col *= 1.0 - 0.3 * dot(uv, uv);

  // Subtle chromatic aberration
  float ca = length(uv) * 0.003;
  col.r *= 1.0 + ca;
  col.b *= 1.0 - ca;

  // Film grain
  col += (hash21(uv * u_res + fract(t * 100.0)) - 0.5) * 0.015;

  // Tone mapping
  col = col / (col + 0.25);
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
  `;

  // ── Compile ───────────────────────────────────────────────────────────────
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('Shader error:', gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    console.error('Link error:', gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['u_time','u_res','u_mouse','u_speed','u_auto','u_col1','u_col2','u_col3','u_seed'].forEach(n => u[n] = gl.getUniformLocation(prog, n));

  // ── Color theory palette generator ────────────────────────────────────────
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if      (h < 60)  { r=c; g=x; b=0; }
    else if (h < 120) { r=x; g=c; b=0; }
    else if (h < 180) { r=0; g=c; b=x; }
    else if (h < 240) { r=0; g=x; b=c; }
    else if (h < 300) { r=x; g=0; b=c; }
    else               { r=c; g=0; b=x; }
    return [r+m, g+m, b+m];
  }

  function generatePalette() {
    const schemes = ['analogous','triadic','splitComp','tetradic','warmMono','coolMono'];
    const scheme = schemes[Math.floor(Math.random() * schemes.length)];
    const base = Math.random() * 360;
    const sat = 0.7 + Math.random() * 0.3;
    let hues;
    switch (scheme) {
      case 'analogous':    hues = [base, base+30+Math.random()*30, base-30-Math.random()*30]; break;
      case 'triadic':      hues = [base, base+120+Math.random()*20-10, base+240+Math.random()*20-10]; break;
      case 'splitComp':    hues = [base, base+150+Math.random()*30, base+210+Math.random()*30]; break;
      case 'tetradic':     hues = [base, base+90+Math.random()*30, base+180+Math.random()*20]; break;
      case 'warmMono':     hues = [Math.random()*60, 20+Math.random()*40, 340+Math.random()*40]; break;
      case 'coolMono':     hues = [180+Math.random()*60, 240+Math.random()*60, 300+Math.random()*60]; break;
    }
    return [
      hsl2rgb(hues[0], sat, 0.4 + Math.random()*0.15),
      hsl2rgb(hues[1], sat*0.95, 0.55 + Math.random()*0.2),
      hsl2rgb(hues[2], sat*0.7, 0.25 + Math.random()*0.15),
    ];
  }

  let pal = generatePalette();
  let paletteSeed = Math.random() * 100;

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const dpr = Math.min(devicePixelRatio, 1.5); // cap for ray marching perf
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
  canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  // ── Buttons ───────────────────────────────────────────────────────────────
  const hud = document.getElementById('hud');
  const speedBtn = document.getElementById('speed-btn');
  const autoBtn = document.getElementById('auto-btn');
  const themeBtn = document.getElementById('theme-btn');
  const resetBtn = document.getElementById('reset-btn');

  function updateHud() {
    hud.textContent = `speed ${speed}× · iterations ${maxIter}${autoMode ? ' · auto' : ''}`;
  }

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    speed = speeds[speedIdx];
    speedBtn.textContent = speed + '×';
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
    speed = 1.0; speedIdx = 1;
    speedBtn.textContent = '1×';
    autoMode = false;
    autoBtn.classList.remove('is-on');
    time = 0; autoTime = 0;
    pal = generatePalette();
    paletteSeed = Math.random() * 100;
    updateHud();
  });

  // ── Render ────────────────────────────────────────────────────────────────
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) * 0.001, 0.05);
    last = now;
    time += dt;

    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;

    if (autoMode) {
      autoTime += dt;
      mouse.tx = 0.5 + 0.15 * Math.sin(autoTime * 0.5);
      mouse.ty = 0.5 + 0.1 * Math.cos(autoTime * 0.3);
    }

    gl.uniform1f(u.u_time, time);
    gl.uniform2f(u.u_res, canvas.width, canvas.height);
    gl.uniform2f(u.u_mouse, mouse.x, mouse.y);
    gl.uniform1f(u.u_speed, speed);
    gl.uniform1f(u.u_auto, autoMode ? 1.0 : 0.0);
    gl.uniform3fv(u.u_col1, pal[0]);
    gl.uniform3fv(u.u_col2, pal[1]);
    gl.uniform3fv(u.u_col3, pal[2]);
    gl.uniform1f(u.u_seed, paletteSeed);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);

})();
