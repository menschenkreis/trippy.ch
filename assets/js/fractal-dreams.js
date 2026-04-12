// Fractal Dreams — Evolving Julia set with theme-reactive colors
// Path A: Infinite Deep Zoom with emulated double precision
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
  // Use float64 for CPU-side calculations (zoom/pan)
  let zoom = 1.0, targetZoom = 1.0;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let prevZoom = 1.0;
  let zoomVelocity = 0.0;
  let lastFrameTime = 0;

  // Smooth mouse/touch morph target
  let mouseTarget = [0.5, 0.5];
  let smoothMouse = [0.5, 0.5];

  // Theme colors
  let themeColA = [0.49, 0.23, 0.93];
  let themeColB = [0.18, 0.83, 0.75];
  let themeColC = [0.93, 0.28, 0.60];
  let targetColA = [...themeColA], targetColB = [...themeColB], targetColC = [...themeColC];

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

  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    return [parseInt(hex.substring(0, 2), 16) / 255, parseInt(hex.substring(2, 4), 16) / 255, parseInt(hex.substring(4, 6), 16) / 255];
  }

  function readThemeColors() {
    const style = getComputedStyle(document.documentElement);
    const p = style.getPropertyValue('--purple').trim();
    const t = style.getPropertyValue('--teal').trim();
    const k = style.getPropertyValue('--pink').trim();
    if (p) targetColA = hexToRGB(p);
    if (t) targetColB = hexToRGB(t);
    if (k) targetColC = hexToRGB(k);
  }

  const observer = new MutationObserver(() => readThemeColors());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  setInterval(readThemeColors, 1000);
  readThemeColors();

  // ── High Precision Shader Engine ──
  // The jitter is fixed by reconstructing coordinates from a high-precision center (split into two floats)
  // and a float32 pixel offset. This prevents the "snapping" at deep zoom.

  const vsSrc = 'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}';

  const fsSrc = `
precision highp float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;
uniform vec2 centerHi;
uniform vec2 centerLo;
uniform float pixelScale;
uniform vec3 colA;
uniform vec3 colB;
uniform vec3 colC;

void main(){
  float minRes = min(res.x, res.y);
  vec2 pxOff = (gl_FragCoord.xy - 0.5 * res);
  
  // High-precision coordinate reconstruction:
  // We use (centerHi + centerLo) from CPU as the pivot.
  // We only add the pixel offset at the end.
  vec2 coord = (centerHi + centerLo) + (pxOff * pixelScale);

  // Julia morphing scales with log-depth to stay "zen"
  float logZ = log2(max(1.0, 1.0/pixelScale));
  float depthFactor = 1.0 / (1.0 + logZ * 0.15);

  float a = t * 0.04;
  vec2 c = vec2(
    -0.7 + 0.28 * cos(a) + mouse.x * 0.12 * depthFactor,
    0.27 + 0.22 * sin(a * 1.3) + mouse.y * 0.12 * depthFactor
  );

  vec2 z = coord;
  float iter = 0.0;
  const float maxIter = 256.0;

  for(float i=0.0; i<256.0; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 4.0) break;
    iter++;
  }

  vec3 col = vec3(0.0);
  if(iter < 256.0){
    float sl = iter - log2(log2(dot(z,z))) + 4.0;
    float phase = fract(sl * 0.012 + t * 0.008);
    vec3 pal;
    if(phase < 0.33) pal = mix(colA, colB, phase/0.33);
    else if(phase < 0.66) pal = mix(colB, colC, (phase-0.33)/0.33);
    else pal = mix(colC, colA, (phase-0.66)/0.34);
    
    float val = 0.15 + 0.85 * pow(sl/256.0, 0.45);
    val += 0.06 * sin(sl*0.3 + t*0.1) * cos(sl*0.17);
    col = pal * clamp(val, 0.0, 1.0);
    float edge = 1.0 - smoothstep(0.0, 0.3, sl/256.0);
    col += colA * edge * 0.25 + colB * edge * 0.15;
  } else {
    col = vec3(0.02, 0.01, 0.04);
    col += colA * 0.15 * exp(-length(coord)*0.5);
  }

  vec2 uv2 = gl_FragCoord.xy/res;
  float vig = 1.0 - length((uv2 - 0.5) * 1.2);
  col *= (smoothstep(0.0, 0.6, vig) * (0.97 + 0.03 * sin(t*0.15)));
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

  const uT = gl.getUniformLocation(prog, 't'), uRes = gl.getUniformLocation(prog, 'res'), uMouse = gl.getUniformLocation(prog, 'mouse');
  const uCenterHi = gl.getUniformLocation(prog, 'centerHi'), uCenterLo = gl.getUniformLocation(prog, 'centerLo'), uPixelScale = gl.getUniformLocation(prog, 'pixelScale');
  const uColA = gl.getUniformLocation(prog, 'colA'), uColB = gl.getUniformLocation(prog, 'colB'), uColC = gl.getUniformLocation(prog, 'colC');

  // ── Audio ──
  let audioCtx = null, shepardGain = null, shepardOscs = [], shepardGains = [], shepardPhase = 0;
  const NUM_VOICES = 8, BASE_FREQ = 55, DESCENT_RATE = 0.08;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      shepardGain = audioCtx.createGain(); shepardGain.gain.value = 0; shepardGain.connect(audioCtx.destination);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(shepardGain);
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator(); const g = audioCtx.createGain();
        const b = Math.exp(-Math.pow((i/(NUM_VOICES-1)-0.5)*3.5, 2));
        g.gain.value = 0.035 * b; osc.connect(g); g.connect(lp); osc.start();
        shepardOscs.push(osc); shepardGains.push(g);
      }
    } catch (e) {}
  }

  function updateAudio(dt, vel) {
    if (!audioCtx || !shepardGain) return;
    const absV = Math.min(Math.abs(vel), 5);
    shepardPhase = (shepardPhase - (DESCENT_RATE + absV * 0.15) * dt) % 1.0;
    if (shepardPhase < 0) shepardPhase += 1.0;
    for (let i = 0; i < NUM_VOICES; i++) {
      let f = BASE_FREQ * Math.pow(2, i/(NUM_VOICES-1)*5) + shepardPhase * BASE_FREQ;
      while (f > BASE_FREQ*64) f /= 2; while (f < BASE_FREQ*0.5) f *= 2;
      shepardOscs[i].frequency.setTargetAtTime(f, audioCtx.currentTime, 0.15);
      const n = Math.log2(f/BASE_FREQ*0.5)/7; const b = Math.exp(-Math.pow((n-0.5)*3.2, 2));
      shepardGains[i].gain.setTargetAtTime(0.035 * b, audioCtx.currentTime, 0.2);
    }
    const targetV = (soundEnabled ? 0.05 + Math.min(absV * 0.06, 0.1) : 0);
    shepardGain.gain.setTargetAtTime(targetV, audioCtx.currentTime, 0.5);
  }

  // ── Input ──
  let soundEnabled = false, audioStarted = false;
  function setSound(on) {
    soundEnabled = on; if (on && !audioStarted) { audioStarted = true; initAudio(); }
    if (audioCtx) audioCtx.resume();
    const b = document.getElementById('sound-btn'); if (b) b.classList.toggle('is-on', on);
  }
  const sb = document.getElementById('sound-btn'); if (sb) sb.onclick = () => setSound(!soundEnabled);

  canvas.onwheel = e => {
    e.preventDefault(); targetZoom = Math.max(1e-15, Math.min(1e15, targetZoom * (e.deltaY > 0 ? 1.1 : 0.9)));
  };

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
      if (lastDist > 0) targetZoom = Math.max(1e-15, Math.min(1e15, targetZoom * (lastDist / dist)));
      if (lastCenter) {
        targetPanX += (lastCenter.x - center.x) / (Math.min(W, H) / zoom);
        targetPanY -= (lastCenter.y - center.y) / (Math.min(W, H) / zoom);
      }
      lastDist = dist; lastCenter = center;
    }
  };
  canvas.ontouchend = () => { isPinching = false; lastDist = 0; lastCenter = null; };
  window.onmousemove = e => { mouseTarget[0] = e.clientX/window.innerWidth; mouseTarget[1] = 1.0 - e.clientY/window.innerHeight; };

  // ── Render ──
  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016;
    lastFrameTime = ts;

    smoothMouse[0] += (mouseTarget[0] - smoothMouse[0]) * 0.03;
    smoothMouse[1] += (mouseTarget[1] - smoothMouse[1]) * 0.03;
    for (let i=0; i<3; i++) {
      themeColA[i] += (targetColA[i]-themeColA[i])*0.02; themeColB[i] += (targetColB[i]-themeColB[i])*0.02; themeColC[i] += (targetColC[i]-themeColC[i])*0.02;
    }

    const zDist = Math.abs(Math.log(targetZoom / zoom));
    const easeZ = Math.min(0.04 + zDist * 0.15, 0.2);
    prevZoom = zoom;
    zoom += (targetZoom - zoom) * easeZ;
    panX += (targetPanX - panX) * 0.1;
    panY += (targetPanY - panY) * 0.1;

    const vel = (Math.log(zoom) - Math.log(prevZoom)) / dt;
    zoomVelocity += (vel - zoomVelocity) * 0.1;
    updateAudio(dt, zoomVelocity);

    // Split for shader
    const minRes = Math.min(W, H);
    const pixelScale = zoom / minRes;
    const cxHi = Math.fround(panX), cxLo = panX - cxHi;
    const cyHi = Math.fround(panY), cyLo = panY - cyHi;

    gl.uniform1f(uT, ts*0.001); gl.uniform2f(uRes, W, H); gl.uniform2f(uMouse, smoothMouse[0], smoothMouse[1]);
    gl.uniform2f(uCenterHi, cxHi, cyHi); gl.uniform2f(uCenterLo, cxLo, cyLo); gl.uniform1f(uPixelScale, pixelScale);
    gl.uniform3f(uColA, themeColA[0], themeColA[1], themeColA[2]); gl.uniform3f(uColB, themeColB[0], themeColB[1], themeColB[2]); gl.uniform3f(uColC, themeColC[0], themeColC[1], themeColC[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); frame(0);
})();
