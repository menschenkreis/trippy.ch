// Fractal Dreams — Evolving Julia set with theme-reactive colors
// Infinite zoom with double-precision emulation + Shepard tone
(function () {
  const cfg = window.fractalDreamsConfig || {};
  const canvasId = cfg.canvasId || 'fractal-canvas';
  const fullscreen = cfg.fullscreen || false;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl', { antialias: true, depth: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, time = 0, raf;
  let zoom = 1.0, targetZoom = 1.0;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let prevZoom = 1.0, zoomVelocity = 0.0, lastFrameTime = 0;

  let mouseTarget = [0.5, 0.5], smoothMouse = [0.5, 0.5];

  let themeColA = [0.49, 0.23, 0.93], themeColB = [0.18, 0.83, 0.75], themeColC = [0.93, 0.28, 0.60];
  let targetColA = [...themeColA], targetColB = [...themeColB], targetColC = [...themeColC];

  let driftEnabled = false, audioPhase = 0.0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2.0);
    const w = fullscreen ? window.innerWidth : canvas.clientWidth;
    const h = fullscreen ? window.innerHeight : canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    W = canvas.width; H = canvas.height;
    gl.viewport(0, 0, W, H);
  }

  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    return [parseInt(hex.substring(0, 2), 16) / 255, parseInt(hex.substring(2, 4), 16) / 255, parseInt(hex.substring(4, 6), 16) / 255];
  }

  function readThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const p = s.getPropertyValue('--purple').trim(), t = s.getPropertyValue('--teal').trim(), k = s.getPropertyValue('--pink').trim();
    if (p) targetColA = hexToRGB(p); if (t) targetColB = hexToRGB(t); if (k) targetColC = hexToRGB(k);
  }
  setInterval(readThemeColors, 1000); readThemeColors();

  const vsSrc = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }';
  const fsSrc = `
precision highp float;
uniform float t, pixelScale, audioPhase;
uniform vec2 res, mouse, centerHi, centerLo;
uniform vec3 colA, colB, colC;

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  vec2 coord = (centerHi + centerLo) + uv * pixelScale;

  float logZ = log2(max(1.0, 1.0/pixelScale));
  float depthFactor = 1.0 / (1.0 + logZ * 0.1);

  float a = t * 0.04;
  vec2 c = vec2(-0.7 + 0.28 * cos(a) + mouse.x * 0.12 * depthFactor, 0.27 + 0.22 * sin(a * 1.3) + mouse.y * 0.12 * depthFactor);

  vec2 z = coord; float iter = 0.0;
  for(float i=0.0; i<256.0; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 4.0) break;
    iter++;
  }

  vec3 col = vec3(0.015, 0.008, 0.03);
  if(iter < 256.0){
    float sl = iter - log2(log2(dot(z,z))) + 4.0;
    float phase = fract(sl * 0.015 + t * 0.01 + audioPhase * 0.2);
    vec3 pal = (phase < 0.33) ? mix(colA, colB, phase/0.33) : (phase < 0.66 ? mix(colB, colC, (phase-0.33)/0.33) : mix(colC, colA, (phase-0.66)/0.34));
    
    float pulse = 0.04 * sin(audioPhase * 6.283);
    float val = 0.15 + 0.85 * pow(sl/256.0, 0.45) + pulse;
    col = pal * clamp(val + 0.05 * sin(sl*0.3 + t*0.1), 0.0, 1.2);
    
    float edge = 1.0 - smoothstep(0.0, 0.2, sl/256.0);
    col += colA * edge * (0.3 + pulse);
  } else {
    col += colA * 0.12 * exp(-length(coord)*0.4);
  }

  vec2 sc = gl_FragCoord.xy / res;
  float vig = 1.0 - length((sc - 0.5) * 1.3);
  col *= smoothstep(0.0, 0.7, vig);
  col *= (0.98 + 0.02 * sin(t * 0.2));

  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog); gl.useProgram(prog);

  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

  const uT = gl.getUniformLocation(prog, 't'), uRes = gl.getUniformLocation(prog, 'res'), uMouse = gl.getUniformLocation(prog, 'mouse');
  const uCenterHi = gl.getUniformLocation(prog, 'centerHi'), uCenterLo = gl.getUniformLocation(prog, 'centerLo'), uPixelScale = gl.getUniformLocation(prog, 'pixelScale');
  const uColA = gl.getUniformLocation(prog, 'colA'), uColB = gl.getUniformLocation(prog, 'colB'), uColC = gl.getUniformLocation(prog, 'colC'), uAudioPhase = gl.getUniformLocation(prog, 'audioPhase');

  // ── Audio ──
  let audioCtx = null, shepardGain = null, shepardOscs = [], shepardGains = [], shepardPhase = 0;
  const NUM_VOICES = 12, BASE_FREQ = 432, DESCENT_RATE = 0.04;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      shepardGain = audioCtx.createGain(); shepardGain.gain.value = 0; shepardGain.connect(audioCtx.destination);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350; lp.Q.value = 0.5; lp.connect(shepardGain);
      const lp2 = audioCtx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 700; lp2.connect(lp);
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator(); const g = audioCtx.createGain();
        osc.type = (i % 3 === 0) ? 'sine' : (i % 3 === 1 ? 'triangle' : 'sine');
        const b = Math.exp(-Math.pow((i/(NUM_VOICES-1)-0.5)*2.8, 2));
        g.gain.value = 0.02 * b; osc.connect(g); g.connect(lp2); osc.start();
        shepardOscs.push(osc); shepardGains.push(g);
      }
    } catch (e) {}
  }

  function updateAudio(dt, vel) {
    if (!audioCtx || !shepardGain) return;
    const absV = Math.min(Math.abs(vel), 2.5);
    shepardPhase = (shepardPhase - (DESCENT_RATE + absV * 0.08) * dt) % 1.0;
    if (shepardPhase < 0) shepardPhase += 1.0;
    audioPhase = shepardPhase;
    for (let i = 0; i < NUM_VOICES; i++) {
      let f = (BASE_FREQ * 0.25) * Math.pow(2, i/(NUM_VOICES-1)*6) * (1.0 + shepardPhase);
      while (f > BASE_FREQ * 6) f /= 2; while (f < BASE_FREQ * 0.1) f *= 2;
      shepardOscs[i].frequency.setTargetAtTime(f, audioCtx.currentTime, 0.25);
      const n = Math.log2(f/(BASE_FREQ*0.1))/6, b = Math.exp(-Math.pow((n-0.5)*3.2, 2));
      shepardGains[i].gain.setTargetAtTime(0.022 * b, audioCtx.currentTime, 0.35);
    }
    shepardGain.gain.setTargetAtTime(soundEnabled ? 0.045 + Math.min(absV * 0.04, 0.06) : 0, audioCtx.currentTime, 1.0);
  }

  // ── Input ──
  let soundEnabled = false, audioStarted = false;
  function setSound(on) {
    soundEnabled = on; if (on && !audioStarted) { audioStarted = true; initAudio(); }
    if (audioCtx) audioCtx.resume();
    const b = document.getElementById('sound-btn'); if (b) b.classList.toggle('is-on', on);
  }
  const sb = document.getElementById('sound-btn'); if (sb) sb.onclick = () => setSound(!soundEnabled);
  const db = document.getElementById('drift-btn'); if (db) db.onclick = () => { driftEnabled = !driftEnabled; db.classList.toggle('is-on', driftEnabled); };

  canvas.onwheel = e => { e.preventDefault(); targetZoom = Math.max(1e-15, Math.min(1e15, targetZoom * (e.deltaY > 0 ? 1.08 : 0.92))); };

  let lastDist = 0, lastCenter = null, isPinching = false;
  canvas.ontouchstart = e => {
    if (e.touches.length === 2) {
      isPinching = true;
      lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      lastCenter = { x: (e.touches[0].clientX + e.touches[1].clientX)/2, y: (e.touches[0].clientY + e.touches[1].clientY)/2 };
    }
  };
  canvas.ontouchmove = e => {
    if (e.touches.length === 1 && !isPinching) {
      mouseTarget[0] = e.touches[0].clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.touches[0].clientY/window.innerHeight;
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY, dist = Math.hypot(dx, dy);
      const center = { x: (e.touches[0].clientX + e.touches[1].clientX)/2, y: (e.touches[0].clientY + e.touches[1].clientY)/2 };
      if (lastDist > 0) targetZoom = Math.max(1e-15, Math.min(1e15, targetZoom * (lastDist / dist)));
      if (lastCenter) {
        const minSide = Math.min(window.innerWidth, window.innerHeight);
        targetPanX += (lastCenter.x - center.x) * (zoom / minSide);
        targetPanY -= (lastCenter.y - center.y) * (zoom / minSide);
      }
      lastDist = dist; lastCenter = center;
    }
  };
  canvas.ontouchend = () => { isPinching = false; lastDist = 0; lastCenter = null; };
  window.onmousemove = e => { mouseTarget[0] = e.clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.clientY/window.innerHeight; };

  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016; lastFrameTime = ts;
    if (driftEnabled) { targetZoom *= (1.0 - 0.06 * dt); targetPanX += 0.01 * dt * Math.sin(ts * 0.0002); targetPanY += 0.01 * dt * Math.cos(ts * 0.0003); }

    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.035; smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.035;
    for (let i=0; i<3; i++) { themeColA[i] += (targetColA[i]-themeColA[i])*0.02; themeColB[i] += (targetColB[i]-themeColB[i])*0.02; themeColC[i] += (targetColC[i]-themeColC[i])*0.02; }

    prevZoom = zoom; zoom += (targetZoom - zoom) * 0.08;
    panX += (targetPanX - panX) * 0.12; panY += (targetPanY - panY) * 0.12;

    updateAudio(dt, (Math.log(zoom) - Math.log(prevZoom)) / dt);

    const minSide = Math.min(W, H), pixelScale = zoom / minSide;
    const cxHi = Math.fround(panX), cxLo = panX - cxHi, cyHi = Math.fround(panY), cyLo = panY - cyHi;

    gl.uniform1f(uT, ts*0.001); gl.uniform2f(uRes, W, H); gl.uniform2f(uMouse, smoothMouse[0], smoothMouse[1]);
    gl.uniform2f(uCenterHi, cxHi, cyHi); gl.uniform2f(uCenterLo, cxLo, cyLo); gl.uniform1f(uPixelScale, zoom);
    gl.uniform3f(uColA, themeColA[0], themeColA[1], themeColA[2]); gl.uniform3f(uColB, themeColB[0], themeColB[1], themeColB[2]); gl.uniform3f(uColC, themeColC[0], themeColC[1], themeColC[2]);
    gl.uniform1f(uAudioPhase, audioPhase);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize); resize(); frame(0);
})();
