// Cosmic Plasma — WebGL fragment shader
// Reusable: set `window.cosmicPlasmaConfig` before loading to override defaults
//   cosmicPlasmaConfig.canvasId  — canvas element id (default: 'cosmic-canvas')
//   cosmicPlasmaConfig.fullscreen — if true, canvas fills viewport (default: false)
//   cosmicPlasmaConfig.showInfo  — if true, show overlay UI (default: true for fullscreen)

(function () {
  const cfg = window.cosmicPlasmaConfig || {};
  const canvasId = cfg.canvasId || 'cosmic-canvas';
  const fullscreen = cfg.fullscreen || false;
  const showInfo = fullscreen && cfg.showInfo !== false;

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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
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
precision mediump float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<6;i++){v+=a*noise(p);p*=2.0;a*=0.5;}
  return v;
}

void main(){
  vec2 uv=gl_FragCoord.xy/res;
  vec2 m=mouse*0.4;
  float n1=fbm(uv*3.0+t*0.15+vec2(m.x,m.y)*2.0);
  float n2=fbm(uv*4.0-t*0.1+n1*1.5);
  float n3=fbm(uv*2.0+t*0.08+n2*0.8+vec2(-m.y,m.x));

  vec3 col=vec3(0.10,0.04,0.18);
  col=mix(col,vec3(0.49,0.23,0.93),n1*0.5);
  col=mix(col,vec3(0.18,0.83,0.75),n2*0.35);
  col=mix(col,vec3(0.93,0.28,0.60),n3*0.25);
  col+=0.04*sin(t*0.3+uv.x*6.0+uv.y*4.0);

  float vignette=1.0-length((uv-0.5)*1.3);
  col*=smoothstep(0.0,0.7,vignette);

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

  function frame(ts) {
    if (prefersReduced) { time = 0; } else { time = ts * 0.001; }
    gl.uniform1f(uT, time);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => {
    mouse[0] = e.clientX / window.innerWidth;
    mouse[1] = 1.0 - e.clientY / window.innerHeight;
  });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    mouse[0] = t.clientX / window.innerWidth;
    mouse[1] = 1.0 - t.clientY / window.innerHeight;
  }, { passive: true });

  resize();
  frame(0);

  // Expose cleanup for standalone pages
  canvas._cosmicCleanup = () => cancelAnimationFrame(raf);
})();
