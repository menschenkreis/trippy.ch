// Fractal Dreams — Evolving Julia set with DMT color palette
// Supports infinite pinch-to-zoom (touch) and scroll-to-zoom (mouse)
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

  // Julia set constant — evolves slowly through mesmerizing shapes
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
    // Smooth iteration count
    float sl=iter-log2(log2(dot(z,z)))+4.0;

    // DMT-inspired color palette cycling
    float hue=sl*0.012+t*0.008;
    hue=fract(hue);

    // Remap hue to cluster around DMT colors
    float h2=hue*hue*(3.0-2.0*hue);
    float finalHue=mix(0.72,0.85,h2)+sin(sl*0.05)*0.08;

    float sat=0.7+0.3*sin(sl*0.08+t*0.02);
    float val=0.15+0.85*pow(sl/maxIter,0.45);

    // Iridescent shimmer
    val+=0.08*sin(sl*0.3+t*0.1)*cos(sl*0.17);

    col=hsv2rgb(vec3(fract(finalHue),clamp(sat,0.0,1.0),clamp(val,0.0,1.0)));

    // Inner glow near boundary
    float edge=1.0-smoothstep(0.0,0.3,sl/maxIter);
    col+=vec3(0.3,0.1,0.5)*edge*0.6;
    col+=vec3(0.1,0.3,0.3)*edge*0.3;
  } else {
    // Inside the set — deep void
    col=vec3(0.02,0.01,0.05);
    float inner=length(uv)*0.5;
    col+=vec3(0.06,0.02,0.12)*exp(-inner*0.5);
  }

  // Soft vignette
  vec2 uv2=gl_FragCoord.xy/res;
  float vig=1.0-length((uv2-0.5)*1.2);
  col*=smoothstep(0.0,0.6,vig);

  // Gentle chromatic pulse
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

  // ── Zoom & Pan Input ──

  // Mouse wheel zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    targetZoom *= factor;
    // Clamp to avoid degenerate values
    targetZoom = Math.max(0.0001, Math.min(1e8, targetZoom));
  }, { passive: false });

  // Pinch-to-zoom + two-finger pan
  let lastPinchDist = 0;
  let lastPinchCenter = null;
  let isPinching = false;

  canvas.addEventListener('touchstart', e => {
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

      // Pinch zoom
      if (lastPinchDist > 0) {
        const scale = dist / lastPinchDist;
        targetZoom *= scale;
        targetZoom = Math.max(0.0001, Math.min(1e8, targetZoom));
      }

      // Two-finger pan
      if (lastPinchCenter) {
        const moveX = (center.x - lastPinchCenter.x) / window.innerWidth;
        const moveY = (center.y - lastPinchCenter.y) / window.innerHeight;
        targetPanX -= moveX * zoom * 0.8;
        targetPanY += moveY * zoom * 0.8;
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

  // Mouse move for Julia constant influence
  window.addEventListener('mousemove', e => {
    mouse[0] = e.clientX / window.innerWidth;
    mouse[1] = 1.0 - e.clientY / window.innerHeight;
  });

  function frame(ts) {
    if (prefersReduced) { time = 0; } else { time = ts * 0.001; }

    // Smooth zoom & pan interpolation
    zoom += (targetZoom - zoom) * 0.08;
    panX += (targetPanX - panX) * 0.08;
    panY += (targetPanY - panY) * 0.08;

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
