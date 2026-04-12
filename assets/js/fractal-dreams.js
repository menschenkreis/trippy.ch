// Fractal Dreams — The Fly-Through (Z-Tunnel) Engine
(function () {
  const cfg = window.fractalDreamsConfig || {};
  const canvas = document.getElementById(cfg.canvasId || 'fractal-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, depth: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, raf, lastFrameTime = 0;
  // State for the Fly-Through
  let flyPos = 0.0, targetFlySpeed = 0.05, currentFlySpeed = 0.05;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let mouseTarget = [0.5, 0.5], smoothMouse = [0.5, 0.5];

  let themeColA = [0.49, 0.23, 0.93], themeColB = [0.18, 0.83, 0.75], themeColC = [0.93, 0.28, 0.60];
  let targetColA = [...themeColA], targetColB = [...themeColB], targetColC = [...themeColC];

  let driftEnabled = false, audioPhase = 0.0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2.0);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
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
uniform float t, flyPos, audioPhase;
uniform vec2 res, mouse, pan;
uniform vec3 colA, colB, colC;

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  
  // FLY-THROUGH LOGIC:
  // Instead of simple zoom, we warp the UVs to create a tunnel effect.
  // We use the flyPos (linear) to shift the "depth" of the fractal.
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  
  // 2x Bigger Fractals: scale uv by 0.5
  vec2 coord = uv * 0.5; 
  
  // The magic "Fly" part: modulate scale by a periodic function of flyPos
  float scale = exp(mod(flyPos, 1.0));
  coord *= (1.0 / scale);
  
  // Smoothly blend between two layers of fractals to create infinite tunnel
  vec2 coord2 = coord * 0.3678; // e^-1

  float a = t * 0.03;
  // Zen Julia constant
  vec2 c = vec2(-0.745 + mouse.x * 0.04, 0.11 + mouse.y * 0.04);

  // Fractal Layer 1
  vec2 z = coord + pan;
  float iter = 0.0;
  for(float i=0.0; i<150.0; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 4.0) break;
    iter++;
  }

  // Fractal Layer 2 (The one appearing in the distance)
  vec2 z2 = coord2 + pan;
  float iter2 = 0.0;
  for(float i=0.0; i<100.0; i++){
    z2 = vec2(z2.x*z2.x - z2.y*z2.y, 2.0*z2.x*z2.y) + c;
    if(dot(z2,z2) > 4.0) break;
    iter2++;
  }

  // Blend layers based on fly progress
  float blend = fract(flyPos);
  float finalIter = mix(iter2, iter, blend);

  vec3 col = vec3(0.01, 0.005, 0.02);
  if(finalIter > 0.0){
    float sl = finalIter - log2(log2(max(1.1, dot(z,z)))) + 4.0;
    float phase = fract(sl * 0.02 + t * 0.01 + audioPhase * 0.2);
    vec3 pal = (phase < 0.33) ? mix(colA, colB, phase/0.33) : (phase < 0.66 ? mix(colB, colC, (phase-0.33)/0.33) : mix(colC, colA, (phase-0.66)/0.34));
    float val = 0.2 + 0.8 * pow(finalIter/150.0, 0.5) + 0.05 * sin(audioPhase * 6.28);
    col = pal * clamp(val, 0.0, 1.2);
  }

  vec2 sc = gl_FragCoord.xy / res;
  col *= smoothstep(0.0, 0.8, 1.0 - length(sc - 0.5) * 1.3);
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
  const uFlyPos = gl.getUniformLocation(prog, 'flyPos'), uPan = gl.getUniformLocation(prog, 'pan');
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

  function updateAudio(dt) {
    if (!audioCtx || !shepardGain) return;
    shepardPhase = (shepardPhase - 0.05 * dt) % 1.0;
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

  // Wheel/Pinch now control SPEED of flight, not depth
  canvas.onwheel = e => { e.preventDefault(); targetFlySpeed = Math.max(-0.5, Math.min(0.5, targetFlySpeed + (e.deltaY > 0 ? -0.01 : 0.01))); };

  let lastDist = 0, isPinching = false;
  canvas.ontouchstart = e => { if (e.touches.length === 2) { isPinching = true; lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); } };
  canvas.ontouchmove = e => {
    if (e.touches.length === 1 && !isPinching) { mouseTarget[0] = e.touches[0].clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.touches[0].clientY/window.innerHeight; }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      if (lastDist > 0) targetFlySpeed += (dist - lastDist) * 0.001;
      lastDist = dist;
    }
  };
  canvas.ontouchend = () => { isPinching = false; lastDist = 0; };
  window.onmousemove = e => { mouseTarget[0] = e.clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.clientY/window.innerHeight; };

  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016; lastFrameTime = ts;
    
    currentFlySpeed += (targetFlySpeed - currentFlySpeed) * 0.05;
    flyPos += currentFlySpeed * dt;

    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.03; smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.03;
    for (let i=0; i<3; i++) { themeColA[i] += (targetColA[i]-themeColA[i])*0.02; themeColB[i] += (targetColB[i]-themeColB[i])*0.02; themeColC[i] += (targetColC[i]-themeColC[i])*0.02; }

    panX += (targetPanX - panX) * 0.1; panY += (targetPanY - panY) * 0.1;
    updateAudio(dt);

    gl.uniform1f(uT, ts*0.001); gl.uniform2f(uRes, W, H); gl.uniform2f(uMouse, smoothMouse[0], smoothMouse[1]);
    gl.uniform1f(uFlyPos, flyPos); gl.uniform2f(uPan, panX, panY);
    gl.uniform3f(uColA, themeColA[0], themeColA[1], themeColA[2]); gl.uniform3f(uColB, themeColB[0], themeColB[1], themeColB[2]); gl.uniform3f(uColC, themeColC[0], themeColC[1], themeColC[2]);
    gl.uniform1f(uAudioPhase, audioPhase);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize); resize(); frame(0);
})();
