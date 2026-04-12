// Fractal Dreams — Evolving Julia set with DMT color palette
// Infinite pinch-to-zoom with eased interpolation + Shepard tone audio
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

  let W, H, mouse = [0.5, 0.5], time = 0, raf;
  let zoom = 1.0, targetZoom = 1.0;
  let panX = 0.0, panY = 0.0, targetPanX = 0.0, targetPanY = 0.0;
  let prevZoom = 1.0; // for velocity tracking
  let zoomVelocity = 0.0;
  let lastFrameTime = 0;

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

  const vsSrc = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;

  const fsSrc = `
precision highp float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;
uniform float zoom;
uniform vec2 pan;

vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*res)/min(res.x,res.y);
  uv=uv*zoom+pan;

  float a=t*0.06;
  vec2 c=vec2(
    -0.7+0.32*cos(a)+mouse.x*0.15,
    0.27+0.26*sin(a*1.3)+mouse.y*0.15
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
    float hue=sl*0.012+t*0.008;
    hue=fract(hue);
    float h2=hue*hue*(3.0-2.0*hue);
    float finalHue=mix(0.72,0.85,h2)+sin(sl*0.05)*0.08;
    float sat=0.7+0.3*sin(sl*0.08+t*0.02);
    float val=0.15+0.85*pow(sl/maxIter,0.45);
    val+=0.08*sin(sl*0.3+t*0.1)*cos(sl*0.17);
    col=hsv2rgb(vec3(fract(finalHue),clamp(sat,0.0,1.0),clamp(val,0.0,1.0)));
    float edge=1.0-smoothstep(0.0,0.3,sl/maxIter);
    col+=vec3(0.3,0.1,0.5)*edge*0.6;
    col+=vec3(0.1,0.3,0.3)*edge*0.3;
  } else {
    col=vec3(0.02,0.01,0.05);
    float inner=length(uv)*0.5;
    col+=vec3(0.06,0.02,0.12)*exp(-inner*0.5);
  }

  vec2 uv2=gl_FragCoord.xy/res;
  float vig=1.0-length((uv2-0.5)*1.2);
  col*=smoothstep(0.0,0.6,vig);
  col*=0.95+0.05*sin(t*0.2);

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

  // ── Shepard Tone Audio Engine ──
  let audioCtx = null;
  let shepardGain = null;
  let shepardOscillators = [];
  let shepardFilters = [];
  let shepardFreqs = [];
  let shepardPhase = 0;
  const NUM_VOICES = 6;
  const BASE_FREQ = 55; // A1

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Master gain — starts silent, fades in
      shepardGain = audioCtx.createGain();
      shepardGain.gain.value = 0;
      shepardGain.connect(audioCtx.destination);

      // Warm filter
      const masterFilter = audioCtx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = 800;
      masterFilter.Q.value = 0.7;
      masterFilter.connect(shepardGain);

      // Create layered sine oscillators spanning ~5 octaves
      for (let i = 0; i < NUM_VOICES; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';

        const gain = audioCtx.createGain();
        // Bell-shaped amplitude envelope: loudest in the middle octave
        const norm = i / (NUM_VOICES - 1); // 0..1
        const bell = Math.exp(-Math.pow((norm - 0.5) * 3.5, 2));
        gain.gain.value = 0.04 * bell;

        osc.connect(gain);
        gain.connect(masterFilter);
        osc.start();

        shepardOscillators.push(osc);
        shepardFilters.push(gain);
        shepardFreqs.push(BASE_FREQ * Math.pow(2, i / (NUM_VOICES - 1) * 4));
      }
    } catch (e) {
      // Audio not available — silent fallback
    }
  }

  function updateShepard(velocity, dt) {
    if (!audioCtx || !shepardGain) return;

    // velocity > 0 = zooming in (ascending), < 0 = zooming out (descending)
    const absVel = Math.min(Math.abs(velocity), 5);
    const direction = velocity > 0 ? 1 : -1;

    // Advance phase based on zoom speed
    shepardPhase += direction * absVel * dt * 0.3;

    // Wrap phase within one octave range
    shepardPhase = shepardPhase % 1;
    if (shepardPhase < 0) shepardPhase += 1;

    // Update oscillator frequencies and amplitudes
    const phaseOffset = shepardPhase * BASE_FREQ; // shift in Hz across one octave

    for (let i = 0; i < NUM_VOICES; i++) {
      // Base frequency for this voice, shifted by phase
      let freq = BASE_FREQ * Math.pow(2, i / (NUM_VOICES - 1) * 4) + phaseOffset;

      // Wrap into the audible range (wrap at 5 octaves = factor of 32)
      const minF = BASE_FREQ;
      const maxF = BASE_FREQ * 32;
      while (freq > maxF) freq /= 2;
      while (freq < minF) freq *= 2;

      shepardOscillators[i].frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);

      // Bell envelope based on position in range — voices at edges fade out
      const normPos = Math.log2(freq / minF) / 5; // 0..1 across 5 octaves
      const bell = Math.exp(-Math.pow((normPos - 0.5) * 3.2, 2));
      shepardFilters[i].gain.setTargetAtTime(0.04 * bell, audioCtx.currentTime, 0.15);
    }

    // Master volume: fade in when zooming, fade out when idle
    const targetVol = Math.min(absVel * 0.08, 0.12);
    shepardGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.3);
  }

  // ── Zoom & Pan Input ──

  let audioStarted = false;

  function ensureAudio() {
    if (!audioStarted) {
      audioStarted = true;
      initAudio();
    }
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    ensureAudio();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    targetZoom *= factor;
    targetZoom = Math.max(0.0001, Math.min(1e8, targetZoom));
  }, { passive: false });

  let lastPinchDist = 0;
  let lastPinchCenter = null;
  let isPinching = false;

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      ensureAudio();
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
      mouse[0] = t.clientX / window.innerWidth;
      mouse[1] = 1.0 - t.clientY / window.innerHeight;
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
        targetPanX += moveX * zoom * 0.8;
        targetPanY -= moveY * zoom * 0.8;
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
  }, { passive: true });

  window.addEventListener('mousemove', e => {
    mouse[0] = e.clientX / window.innerWidth;
    mouse[1] = 1.0 - e.clientY / window.innerHeight;
  });

  // ── Render Loop ──

  function frame(ts) {
    const dt = lastFrameTime ? Math.min((ts - lastFrameTime) * 0.001, 0.1) : 0.016;
    lastFrameTime = ts;

    if (prefersReduced) { time = 0; } else { time = ts * 0.001; }

    // Ease factor — larger distance = faster easing, but with a soft cap
    // Creates a luxurious, fluid feel like moving through honey
    const zoomDist = Math.abs(Math.log(targetZoom / zoom));
    const easeZoom = Math.min(0.04 + zoomDist * 0.15, 0.2);
    const easePan = Math.min(0.04 + (Math.abs(targetPanX - panX) + Math.abs(targetPanY - panY)) * 2, 0.15);

    prevZoom = zoom;
    zoom += (targetZoom - zoom) * easeZoom;
    panX += (targetPanX - panX) * easePan;
    panY += (targetPanY - panY) * easePan;

    // Track zoom velocity (log-scale) for Shepard tone
    if (dt > 0) {
      const logPrev = Math.log(Math.max(prevZoom, 1e-10));
      const logCurr = Math.log(Math.max(zoom, 1e-10));
      const rawVel = (logCurr - logPrev) / dt;
      // Smooth the velocity
      zoomVelocity += (rawVel - zoomVelocity) * 0.1;
      updateShepard(zoomVelocity, dt);
    }

    gl.uniform1f(uT, time);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.uniform1f(uZoom, zoom);
    gl.uniform2f(uPan, panX, panY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  frame(0);
})();
