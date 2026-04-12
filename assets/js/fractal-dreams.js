// Fractal Dreams — Evolving Julia set with theme-reactive colors
// Infinite pinch-to-zoom with eased interpolation + Shepard tone audio
// Smooth mouse input — nothing snaps, everything flows
(function () {
  const cfg = window.fractalDreamsConfig || {};
  const canvasId = cfg.canvasId || 'fractal-canvas';
  const fullscreen = cfg.fullscreen || false;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    if (canvas.parentElement) {
      const msg = document.createElement('p');
      msg.textContent = 'WebGL not supported on this device.';
      msg.style.cssText = 'color:var(--fg-muted);text-align:center;padding:2rem;font-size:0.95rem;';
      canvas.parentElement.appendChild(msg);
    }
    return;
  }

  let W, H, time = 0, raf;
  let zoom = 1.0, targetZoom = 1.0;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let prevZoom = 1.0;
  let zoomVelocity = 0.0;
  let lastFrameTime = 0;

  // Smooth mouse — lerps toward target, never snaps
  let mouseTarget = [0.5, 0.5];
  let smoothMouse = [0.5, 0.5];

  // Theme colors (smoothed for transitions)
  let themeColA = [0.49, 0.23, 0.93]; // purple
  let themeColB = [0.18, 0.83, 0.75]; // teal
  let themeColC = [0.93, 0.28, 0.60]; // pink
  let targetColA = [...themeColA];
  let targetColB = [...themeColB];
  let targetColC = [...themeColC];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    if (fullscreen) {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
    } else {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }
    W = canvas.width;
    H = canvas.height;
    gl.viewport(0, 0, W, H);
  }

  // Parse hex color to [r, g, b] in 0..1
  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255
    ];
  }

  // Read current theme colors from CSS custom properties
  function readThemeColors() {
    const style = getComputedStyle(document.documentElement);
    const purple = style.getPropertyValue('--purple').trim();
    const teal = style.getPropertyValue('--teal').trim();
    const pink = style.getPropertyValue('--pink').trim();
    if (purple) targetColA = hexToRGB(purple);
    if (teal) targetColB = hexToRGB(teal);
    if (pink) targetColC = hexToRGB(pink);
  }

  // Watch for theme changes
  const observer = new MutationObserver(() => readThemeColors());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  // Also poll for class changes (high contrast toggle)
  setInterval(readThemeColors, 500);
  readThemeColors();

  const vsSrc = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;

  const fsSrc = `
precision highp float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;
uniform float zoom;
uniform vec2 pan;
uniform vec3 colA;
uniform vec3 colB;
uniform vec3 colC;

vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*res)/min(res.x,res.y);
  uv=uv*zoom+pan;

  float depthFactor=1.0/(1.0+log2(max(zoom,1.0))*0.15);

  // Julia set constant — slow, zen drift
  float a=t*0.04;
  vec2 c=vec2(
    -0.7+0.28*cos(a)+mouse.x*0.12*depthFactor,
    0.27+0.22*sin(a*1.3)+mouse.y*0.12*depthFactor
  );

  vec2 z=uv;
  float iter=0.0;
  const float maxIter=256.0;

  for(float i=0.0;i<256.0;i++){
    z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+c;
    if(dot(z,z)>4.0) break;
    iter++;
  }

  vec3 col=vec3(0.0);

  if(iter<maxIter){
    float sl=iter-log2(log2(dot(z,z)))+4.0;

    // Build palette from theme colors
    float phase=fract(sl*0.012+t*0.008);
    vec3 pal;
    if(phase<0.33){
      pal=mix(colA,colB,phase/0.33);
    } else if(phase<0.66){
      pal=mix(colB,colC,(phase-0.33)/0.33);
    } else {
      pal=mix(colC,colA,(phase-0.66)/0.34);
    }

    // Brightness from iteration depth
    float val=0.15+0.85*pow(sl/maxIter,0.45);
    val+=0.06*sin(sl*0.3+t*0.1)*cos(sl*0.17);
    col=pal*clamp(val,0.0,1.0);

    // Inner glow near boundary
    float edge=1.0-smoothstep(0.0,0.3,sl/maxIter);
    col+=colA*edge*0.25;
    col+=colB*edge*0.15;
  } else {
    // Inside the set — deep void
    col=vec3(0.02,0.01,0.04);
    float inner=length(uv)*0.5;
    col+=colA*0.15*exp(-inner*0.5);
  }

  // Soft vignette
  vec2 uv2=gl_FragCoord.xy/res;
  float vig=1.0-length((uv2-0.5)*1.2);
  col*=smoothstep(0.0,0.6,vig);

  // Very subtle pulse
  col*=0.97+0.03*sin(t*0.15);

  gl_FragColor=vec4(col,1);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return;
  }
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
  const uZoom = gl.getUniformLocation(prog, 'zoom');
  const uPan = gl.getUniformLocation(prog, 'pan');
  const uColA = gl.getUniformLocation(prog, 'colA');
  const uColB = gl.getUniformLocation(prog, 'colB');
  const uColC = gl.getUniformLocation(prog, 'colC');

  // ── Shepard Tone Audio Engine (constant descending, like fallingfalling.com) ──
  let audioCtx = null;
  let shepardGain = null;
  let shepardOscillators = [];
  let shepardFilters = [];
  let shepardPhase = 0;
  let audioStartTime = 0;
  const NUM_VOICES = 8;
  const BASE_FREQ = 55; // A1
  const DESCENT_RATE = 0.08; // octaves per second — slow, hypnotic fall

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioStartTime = audioCtx.currentTime;

      shepardGain = audioCtx.createGain();
      shepardGain.gain.value = 0;
      // Fade in gently over 3 seconds
      shepardGain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 1.5);
      shepardGain.connect(audioCtx.destination);

      // Warm lowpass — keeps it muffled and dreamy
      const masterFilter = audioCtx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = 600;
      masterFilter.Q.value = 0.5;
      masterFilter.connect(shepardGain);

      // Spread voices across 5 octaves
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';

        const voiceGain = audioCtx.createGain();
        // Gaussian bell — voices in the middle are loudest, edges fade
        const norm = i / (NUM_VOICES - 1);
        const bell = Math.exp(-Math.pow((norm - 0.5) * 3.5, 2));
        voiceGain.gain.value = 0.035 * bell;

        osc.connect(voiceGain);
        voiceGain.connect(masterFilter);
        osc.start();

        shepardOscillators.push(osc);
        shepardFilters.push(voiceGain);
      }
    } catch (e) {}
  }

  function updateShepard(velocity, dt) {
    if (!audioCtx || !shepardGain) return;

    // Always descend — zoom speed modulates rate and volume
    const absVel = Math.min(Math.abs(velocity), 5);
    const speed = DESCENT_RATE + absVel * 0.15;

    // Descend the phase
    shepardPhase -= speed * dt;
    shepardPhase = shepardPhase % 1;
    if (shepardPhase < 0) shepardPhase += 1;

    const phaseOffset = shepardPhase * BASE_FREQ;

    for (let i = 0; i < NUM_VOICES; i++) {
      let freq = BASE_FREQ * Math.pow(2, i / (NUM_VOICES - 1) * 5) + phaseOffset;
      const minF = BASE_FREQ * 0.5;
      const maxF = BASE_FREQ * 64;
      while (freq > maxF) freq /= 2;
      while (freq < minF) freq *= 2;

      shepardOscillators[i].frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.15);

      // Bell envelope — voices at the edges of the range are quiet
      const normPos = Math.log2(freq / minF) / 7;
      const bell = Math.exp(-Math.pow((normPos - 0.5) * 3.2, 2));
      shepardFilters[i].gain.setTargetAtTime(0.035 * bell, audioCtx.currentTime, 0.2);
    }

    // Volume: always audible, louder when zooming
    const baseVol = 0.05;
    const activeVol = Math.min(absVel * 0.06, 0.10);
    const targetVol = baseVol + activeVol;
    shepardGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.5);
  }

  // ── Input ──

  let audioStarted = false;
  function ensureAudio() {
    if (!audioStarted) { audioStarted = true; initAudio(); }
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    ensureAudio();
    audioCtx && audioCtx.resume();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    targetZoom *= factor;
    targetZoom = Math.max(0.0001, Math.min(1e8, targetZoom));
  }, { passive: false });

  let lastPinchDist = 0;
  let lastPinchCenter = null;
  let isPinching = false;

  canvas.addEventListener('touchstart', e => {
    ensureAudio();
    audioCtx && audioCtx.resume();
    if (e.touches.length === 2) {
      isPinching = true;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastPinchDist = Math.hypot(dx, dy);
      lastPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && !isPinching) {
      const t = e.touches[0];
      mouseTarget[0] = t.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - t.clientY / window.innerHeight;
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      if (lastPinchDist > 0) {
        const scale = lastPinchDist / dist;
        targetZoom *= scale;
        targetZoom = Math.max(0.0001, Math.min(1e8, targetZoom));
      }
      if (lastPinchCenter) {
        const moveX = (center.x - lastPinchCenter.x) / window.innerWidth;
        const moveY = (center.y - lastPinchCenter.y) / window.innerHeight;
        // Scale pan sensitivity inversely with zoom depth for consistent feel
        const depthScale = Math.min(1.0, 1.0 / Math.sqrt(zoom));
        targetPanX -= moveX * zoom * 1.5 * depthScale;
        targetPanY += moveY * zoom * 1.5 * depthScale;
      }
      lastPinchDist = dist;
      lastPinchCenter = center;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (e.touches.length < 2) {
      isPinching = false;
      lastPinchDist = 0;
      lastPinchCenter = null;
    }
    // When all fingers lift, keep smoothMouse where it is — no snap back
  }, { passive: true });

  window.addEventListener('mousemove', e => {
    mouseTarget[0] = e.clientX / window.innerWidth;
    mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
  });

  // ── Render Loop ──

  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016;
    lastFrameTime = ts;

    if (prefersReduced) { time = 0; } else { time = ts * 0.001; }

    // Smooth mouse — gentle ease, nothing snaps
    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.03;
    smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.03;

    // Smooth theme color transitions
    for (let i = 0; i < 3; i++) {
      themeColA[i] += (targetColA[i] - themeColA[i]) * 0.02;
      themeColB[i] += (targetColB[i] - themeColB[i]) * 0.02;
      themeColC[i] += (targetColC[i] - themeColC[i]) * 0.02;
    }

    // Eased zoom & pan
    const zoomDist = Math.abs(Math.log(targetZoom / zoom));
    const easeZoom = Math.min(0.04 + zoomDist * 0.15, 0.2);
    const easePan = Math.min(0.04 + (Math.abs(targetPanX - panX) + Math.abs(targetPanY - panY)) * 2, 0.15);

    prevZoom = zoom;
    zoom += (targetZoom - zoom) * easeZoom;
    panX += (targetPanX - panX) * easePan;
    panY += (targetPanY - panY) * easePan;

    // Track zoom velocity for Shepard tone
    if (dt > 0) {
      const logPrev = Math.log(Math.max(prevZoom, 1e-10));
      const logCurr = Math.log(Math.max(zoom, 1e-10));
      const rawVel = (logCurr - logPrev) / dt;
      zoomVelocity += (rawVel - zoomVelocity) * 0.1;
      updateShepard(zoomVelocity, dt);
    }

    gl.uniform1f(uT, time);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, smoothMouse[0], smoothMouse[1]);
    gl.uniform1f(uZoom, zoom);
    gl.uniform2f(uPan, panX, panY);
    gl.uniform3f(uColA, themeColA[0], themeColA[1], themeColA[2]);
    gl.uniform3f(uColB, themeColB[0], themeColB[1], themeColB[2]);
    gl.uniform3f(uColC, themeColC[0], themeColC[1], themeColC[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  frame(0);
})();
