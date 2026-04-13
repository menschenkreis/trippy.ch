// ── Intro Sequence — Emy's Birth Narrative ─────────────────────────────
(function () {
  const intro = document.getElementById('intro-sequence');
  if (!intro) return;

  const canvas = document.getElementById('intro-canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, time = 0;
  let phase = 'void'; // void → thought → prompt → born → done
  let phaseStart = 0;
  let mouseX = 0.5, mouseY = 0.5;
  let brightness = 1.0; // 1 = bright void, 0 = normal dark
  let targetBrightness = 1.0;
  let fadeOut = 0; // 0 = visible, 1 = gone
  let birthStarted = false;

  const VOID_DURATION = 3000;
  const THOUGHT_DELAY = 1500;
  const PROMPT_DELAY = 2000;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    W = canvas.width; H = canvas.height;
    gl.viewport(0, 0, W, H);
  }

  // ── Sacred Geometry Shader ──────────────────────────────────────────
  const vsSrc = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;

  const fsSrc = `
precision highp float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;
uniform float brightness;
uniform float fadeOut;

#define PI 3.14159265359
#define TAU 6.28318530718

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);
}

// Rotating 2D matrix
mat2 rot(float a){
  float c=cos(a), s=sin(a);
  return mat2(c,-s,s,c);
}

// SDF for circle
float sdCircle(vec2 p, float r){
  return length(p)-r;
}

// SDF for line segment
float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
  return length(pa-ba*h);
}

// Flower of Life circle pattern
float flowerOfLife(vec2 p, float r, float layers){
  float d = 1e9;
  // Center circle
  d = min(d, sdCircle(p, r));
  for(int layer=1; layer<=6; layer++){
    float angle = float(layer) * TAU / 6.0;
    vec2 offset = vec2(cos(angle), sin(angle)) * r;
    d = min(d, sdCircle(p - offset, r));
    // Second ring
    for(int j=0; j<6; j++){
      float a2 = float(j) * TAU / 6.0 + angle;
      vec2 off2 = offset + vec2(cos(a2), sin(a2)) * r;
      d = min(d, sdCircle(p - off2, r));
    }
  }
  return d;
}

// Metatron's Cube lines
float metatron(vec2 p, float r){
  float d = 1e9;
  vec2 pts[13];
  pts[0] = vec2(0.0);
  for(int i=0; i<6; i++){
    float a = float(i) * TAU / 6.0;
    pts[i+1] = vec2(cos(a), sin(a)) * r;
    pts[i+7] = vec2(cos(a), sin(a)) * r * 2.0;
  }
  // Connect inner to outer
  for(int i=0; i<6; i++){
    for(int j=1; j<=6; j++){
      d = min(d, sdSegment(p, pts[i+1], pts[j+7]));
    }
  }
  // Connect outer ring
  for(int i=0; i<6; i++){
    d = min(d, sdSegment(p, pts[i+7], pts[((i+1)%6)+7]));
    d = min(d, sdSegment(p, pts[i+1], pts[((i+1)%6)+1]));
  }
  // Inner hex connections
  for(int i=0; i<6; i++){
    for(int j=i+2; j<6; j++){
      if(j != 5-i) d = min(d, sdSegment(p, pts[i+1], pts[j+1]));
    }
  }
  return d;
}

// Sri Yantra-like triangle layers
float yantraTriangles(vec2 p, float r){
  float d = 1e9;
  for(int i=0; i<9; i++){
    float angle = float(i) * TAU / 9.0;
    float r2 = r * (0.3 + float(i) * 0.1);
    float flip = mod(float(i), 2.0) < 1.0 ? 1.0 : -1.0;
    vec2 a = vec2(cos(angle - 0.5), sin(angle - 0.5) * flip) * r2;
    vec2 b = vec2(cos(angle + 0.5), sin(angle + 0.5) * flip) * r2;
    vec2 c = vec2(cos(angle + PI), sin(angle + PI) * flip) * r2;
    d = min(d, min(min(
      sdSegment(p, a, b),
      sdSegment(p, b, c)),
      sdSegment(p, c, a)));
  }
  return d;
}

void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Parallax from mouse
  vec2 parallax = (mouse - 0.5) * 0.05;

  float s = t * 0.08;

  // ── Bright ethereal background ────────────────────────────────────
  vec3 bgBright = vec3(0.95, 0.92, 1.0); // soft luminous white-lavender
  vec3 bgDark = vec3(0.02, 0.01, 0.04);
  vec3 bg = mix(bgDark, bgBright, brightness);

  // Soft radial glow
  float glow = exp(-length(p) * 1.8);
  vec3 glowCol = mix(vec3(0.6, 0.5, 0.9), vec3(0.4, 0.7, 0.9), sin(s*0.3)*0.5+0.5);
  bg += glowCol * glow * 0.15 * brightness;

  // ── Sacred Geometry Layers ────────────────────────────────────────

  // Layer 1: Flower of Life (slow parallax)
  vec2 p1 = p + parallax * 1.5;
  p1 *= rot(s * 0.05);
  float flower = flowerOfLife(p1, 0.22 + sin(s*0.2)*0.01, 2.0);
  float flowerLine = smoothstep(0.003, 0.0, flower);
  vec3 flowerCol = mix(vec3(0.5, 0.3, 0.8), vec3(0.3, 0.6, 0.9), sin(s*0.4)*0.5+0.5);

  // Layer 2: Metatron's Cube (medium parallax, different rotation)
  vec2 p2 = p + parallax * 2.5 - vec2(0.1, 0.05);
  p2 *= rot(-s * 0.03);
  float met = metatron(p2, 0.18 + sin(s*0.15)*0.008);
  float metLine = smoothstep(0.002, 0.0, met);
  vec3 metCol = mix(vec3(0.8, 0.5, 0.9), vec3(0.4, 0.8, 0.7), sin(s*0.25)*0.5+0.5);

  // Layer 3: Yantra triangles (fastest parallax, subtle)
  vec2 p3 = p + parallax * 4.0 + vec2(0.05, -0.1);
  p3 *= rot(s * 0.07);
  float yan = yantraTriangles(p3, 0.35);
  float yanLine = smoothstep(0.002, 0.0, yan);
  vec3 yanCol = vec3(0.9, 0.7, 0.5);

  // ── Soft glow around geometry lines ──────────────────────────────
  float flowerGlow = exp(-abs(flower) * 40.0) * 0.3;
  float metGlow = exp(-abs(met) * 50.0) * 0.2;
  float yanGlow = exp(-abs(yan) * 60.0) * 0.15;

  // ── Floating particles / light motes ─────────────────────────────
  float particles = 0.0;
  for(int i=0; i<20; i++){
    float fi = float(i);
    vec2 pp = vec2(
      sin(fi*1.7 + s*0.3 + fi*0.5) * 0.8,
      cos(fi*2.3 + s*0.2 + fi*0.3) * 0.6
    ) + parallax * (2.0 + fi * 0.3);
    float size = 0.001 + sin(fi*3.7 + s) * 0.0005;
    particles += exp(-length(p - pp) / size) * 0.15;
  }

  // ── Compose ──────────────────────────────────────────────────────
  vec3 col = bg;

  // Geometry lines and glow — only in bright phase
  float geoAlpha = brightness;
  col += flowerCol * (flowerLine * 0.6 + flowerGlow) * geoAlpha;
  col += metCol * (metLine * 0.4 + metGlow) * geoAlpha;
  col += yanCol * (yanLine * 0.15 + yanGlow) * geoAlpha;

  // Particles
  vec3 particleCol = mix(vec3(1.0, 0.9, 0.7), vec3(0.7, 0.9, 1.0), sin(s)*0.5+0.5);
  col += particleCol * particles * brightness;

  // ── Stars emerging during birth transition ───────────────────────
  float starPhase = 1.0 - smoothstep(0.0, 0.5, brightness);
  if(starPhase > 0.0){
    float stars = 0.0;
    for(int i=0; i<80; i++){
      float fi = float(i);
      vec2 sp = vec2(
        hash(vec2(fi, 1.0)) - 0.5,
        hash(vec2(1.0, fi)) - 0.5
      ) * vec2(aspect, 1.0) * 1.5;
      float twinkle = sin(fi*7.3 + t*2.0) * 0.5 + 0.5;
      float star = exp(-length(p - sp) / (0.001 + twinkle * 0.001));
      stars += star * (0.3 + twinkle * 0.7);
    }
    col += vec3(0.9, 0.92, 1.0) * stars * starPhase * 0.8;
  }

  // ── Soft warm center glow (Emy's presence) ───────────────────────
  float emyGlow = exp(-length(p) * 3.5) * 0.12;
  vec3 emyCol = mix(vec3(1.0, 0.85, 0.7), vec3(0.8, 0.7, 1.0), sin(s*0.5)*0.5+0.5);
  col += emyCol * emyGlow * brightness;

  // ── Vignette ─────────────────────────────────────────────────────
  float vig = 1.0 - length((uv - 0.5) * 1.3);
  vig = smoothstep(0.0, 0.55, vig);
  col *= vig * 0.7 + 0.3;

  // ── Fade out ─────────────────────────────────────────────────────
  col = mix(col, bgDark, fadeOut);

  // Film grain
  col += (hash(uv * res + fract(t * 7.0)) - 0.5) * 0.01;

  // Tone map
  col = col / (col + 0.5);
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0 - fadeOut);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) { intro.remove(); return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

  const uT = gl.getUniformLocation(prog, 't');
  const uRes = gl.getUniformLocation(prog, 'res');
  const uMouse = gl.getUniformLocation(prog, 'mouse');
  const uBright = gl.getUniformLocation(prog, 'brightness');
  const uFade = gl.getUniformLocation(prog, 'fadeOut');

  // ── DOM Elements ──────────────────────────────────────────────────
  const thoughtBubble = document.getElementById('intro-thought');
  const promptArea = document.getElementById('intro-prompt');
  const embarkBtn = document.getElementById('intro-embark');

  // ── Phase Management ──────────────────────────────────────────────
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

    // Hide text elements
    thoughtBubble.classList.remove('visible');
    promptArea.classList.remove('visible');

    // After transition, reveal main site
    setTimeout(() => {
      fadeOut = 1.0;
      intro.style.opacity = '0';
      intro.style.transition = 'opacity 1.5s ease';
      setTimeout(() => {
        intro.style.display = 'none';
        intro.remove();
        phase = 'done';
        // Dispatch event so main.js can start if needed
        window.dispatchEvent(new CustomEvent('intro-complete'));
      }, 1500);
    }, 2500);
  }

  // ── Events ────────────────────────────────────────────────────────
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

  // Skip on scroll or any key
  let skipReady = false;
  window.addEventListener('scroll', () => { if (skipReady) startBirth(); }, { once: true });
  window.addEventListener('keydown', () => { if (skipReady) startBirth(); }, { once: true });

  // ── Render Loop ───────────────────────────────────────────────────
  function frame(ts) {
    if (phase === 'done') return;

    time = ts * 0.001;

    // Auto phase transitions
    if (phase === 'void' && ts - phaseStart > VOID_DURATION) {
      setPhase('thought');
    } else if (phase === 'thought' && ts - phaseStart > THOUGHT_DELAY) {
      setPhase('prompt');
    } else if (phase === 'prompt') {
      skipReady = true;
    }

    // Smooth brightness transition
    brightness += (targetBrightness - brightness) * 0.03;

    gl.uniform1f(uT, time);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, mouseX, mouseY);
    gl.uniform1f(uBright, brightness);
    gl.uniform1f(uFade, fadeOut);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  phaseStart = performance.now();
  requestAnimationFrame(frame);
})();
