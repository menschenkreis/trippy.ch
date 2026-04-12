// Fractal Dreams — Evolving Julia set with theme-reactive colors
// High-precision infinite zoom engine
(function () {
  const cfg = window.fractalDreamsConfig || {};
  const canvas = document.getElementById(cfg.canvasId || 'fractal-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, depth: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, raf;
  // Initialize with a comfortable zoom and centered pan
  let zoom = 2.0, targetZoom = 2.0;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let prevZoom = 2.0, zoomVelocity = 0.0, lastFrameTime = 0;

  let mouseTarget = [0.5, 0.5], smoothMouse = [0.5, 0.5];

  let themeColA = [0.49, 0.23, 0.93], themeColB = [0.18, 0.83, 0.75], themeColC = [0.93, 0.28, 0.60];
  let targetColA = [...themeColA], targetColB = [...themeColB], targetColC = [...themeColC];

  let driftEnabled = false, audioPhase = 0.0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2.0);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
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
uniform float t, zoom, audioPhase;
uniform vec2 res, mouse, pan;
uniform vec3 colA, colB, colC;

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  // Simpler coordinate math to guarantee visibility
  vec2 coord = uv * zoom + pan;

  float logZ = log2(max(1.0, 1.0/zoom));
  float depthFactor = 1.0 / (1.0 + logZ * 0.1);

  float a = t * 0.04;
  vec2 c = vec2(-0.745 + 0.1 * cos(a) + mouse.x * 0.05 * depthFactor, 0.11 + 0.1 * sin(a * 1.3) + mouse.y * 0.05 * depthFactor);

  vec2 z = coord; float iter = 0.0;
  for(float i=0.0; i<200.0; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 4.0) break;
    iter++;
  }

  vec3 col = vec3(0.01, 0.005, 0.02);
  if(iter < 200.0){
    float sl = iter - log2(log2(dot(z,z))) + 4.0;
    float phase = fract(sl * 0.02 + t * 0.01 + audioPhase * 0.2);
    vec3 pal = (phase < 0.33) ? mix(colA, colB, phase/0.33) : (phase < 0.66 ? mix(colB, colC, (phase-0.33)/0.33) : mix(colC, colA, (phase-0.66)/0.34));
    float val = 0.2 + 0.8 * pow(sl/200.0, 0.5) + 0.05 * sin(audioPhase * 6.28);
    col = pal * clamp(val, 0.0, 1.2);
  } else {
    col += colA * 0.1 * exp(-length(coord)*0.5);
  }

  vec2 sc = gl_FragCoord.xy / res;
  col *= smoothstep(0.0, 0.8, 1.0 - length(sc - 0.5) * 1.2);
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
  const uZoom = gl.getUniformLocation(prog, 'zoom'), uPan = gl.getUniformLocation(prog, 'pan');
  const uColA = gl.getUniformLocation(prog, 'colA'), uColB = gl.getUniformLocation(prog, 'colB'), uColC = gl.getUniformLocation(prog, 'colC'), uAudioPhase = gl.getUniformLocation(prog, 'audioPhase');

  // ── Audio ──
  let audioCtx = null, shepardGain = null, shepardOscs = [], shepardGains = [], shepardPhase = 0;
  const NUM_VOICES = 12, BASE_FREQ = 432;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      shepardGain = audioCtx.createGain(); shepardGain.gain.value = 0; shepardGain.connect(audioCtx.destination);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(shepardGain);
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator(); const g = audioCtx.createGain();
        osc.type = (i % 2 === 0) ? 'sine' : 'triangle';
        g.gain.value = 0.02 * Math.exp(-Math.pow((i/(NUM_VOICES-1)-0.5)*3.0, 2));
        osc.connect(g); g.connect(lp); osc.start(); shepardOscs.push(osc); shepardGains.push(g);
      }
    } catch (e) {}
  }

  function updateAudio(dt, vel) {
    if (!audioCtx || !shepardGain) return;
    shepardPhase = (shepardPhase - (0.05 + Math.min(Math.abs(vel), 3) * 0.1) * dt) % 1.0;
    if (shepardPhase < 0) shepardPhase += 1.0;
    audioPhase = shepardPhase;
    for (let i = 0; i < NUM_VOICES; i++) {
      let f = (BASE_FREQ * 0.25) * Math.pow(2, i/(NUM_VOICES-1)*6) * (1.0 + shepardPhase);
      while (f > BASE_FREQ * 8) f /= 2; while (f < BASE_FREQ * 0.125) f *= 2;
      shepardOscs[i].frequency.setTargetAtTime(f, audioCtx.currentTime, 0.2);
    }
    shepardGain.gain.setTargetAtTime(soundEnabled ? 0.05 : 0, audioCtx.currentTime, 0.5);
  }

  // ── Input ──
  let soundEnabled = false, audioStarted = false;
  const sb = document.getElementById('sound-btn'); if (sb) sb.onclick = () => {
    soundEnabled = !soundEnabled; if (!audioStarted) { audioStarted = true; initAudio(); }
    if (audioCtx) audioCtx.resume(); sb.classList.toggle('is-on', soundEnabled);
  };
  const db = document.getElementById('drift-btn'); if (db) db.onclick = () => { driftEnabled = !driftEnabled; db.classList.toggle('is-on', driftEnabled); };

  canvas.onwheel = e => { e.preventDefault(); targetZoom = Math.max(0.0001, Math.min(100, targetZoom * (e.deltaY > 0 ? 1.1 : 0.9))); };

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
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      const center = { x: (e.touches[0].clientX + e.touches[1].clientX)/2, y: (e.touches[0].clientY + e.touches[1].clientY)/2 };
      if (lastDist > 0) targetZoom = Math.max(0.0001, Math.min(100, targetZoom * (lastDist / dist)));
      if (lastCenter) {
        targetPanX += (lastCenter.x - center.x) * (zoom / Math.min(window.innerWidth, window.innerHeight));
        targetPanY -= (lastCenter.y - center.y) * (zoom / Math.min(window.innerWidth, window.innerHeight));
      }
      lastDist = dist; lastCenter = center;
    }
  };
  canvas.ontouchend = () => { isPinching = false; lastDist = 0; lastCenter = null; };
  window.onmousemove = e => { mouseTarget[0] = e.clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.clientY/window.innerHeight; };

  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016; lastFrameTime = ts;
    if (driftEnabled) { targetZoom *= (1.0 - 0.05 * dt); targetPanX += 0.005 * dt * Math.sin(ts * 0.0002); }

    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.03; smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.03;
    for (let i=0; i<3; i++) { themeColA[i] += (targetColA[i]-themeColA[i])*0.02; themeColB[i] += (targetColB[i]-themeColB[i])*0.02; themeColC[i] += (targetColC[i]-themeColC[i])*0.02; }

    prevZoom = zoom; zoom += (targetZoom - zoom) * 0.1;
    panX += (targetPanX - panX) * 0.1; panY += (targetPanY - panY) * 0.1;

    updateAudio(dt, (Math.log(zoom) - Math.log(prevZoom)) / dt);

    gl.uniform1f(uT, ts*0.001); gl.uniform2f(uRes, W, H); gl.uniform2f(uMouse, smoothMouse[0], smoothMouse[1]);
    gl.uniform1f(uZoom, zoom); gl.uniform2f(uPan, panX, panY);
    gl.uniform3f(uColA, themeColA[0], themeColA[1], themeColA[2]); gl.uniform3f(uColB, themeColB[0], themeColB[1], themeColB[2]); gl.uniform3f(uColC, themeColC[0], themeColC[1], themeColC[2]);
    gl.uniform1f(uAudioPhase, audioPhase);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize); resize(); frame(0);
})();
