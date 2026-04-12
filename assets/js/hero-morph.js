// ── Hero Morph — Slow, gentle morphing shader for the landing page ────────
(function () {
  const canvas = document.getElementById('cosmic-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, time = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    W = canvas.width; H = canvas.height;
    gl.viewport(0, 0, W, H);
  }

  const vsSrc = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;

  const fsSrc = `
precision highp float;
uniform float t;
uniform vec2 res;

// ── Noise ──────────────────────────────────────────────────────────────
float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);
}
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float s = t * 0.02; // very slow time

  // ── Layered domain warping — slow, organic morphing ──────────────────
  vec2 q = vec2(
    fbm(p * 1.5 + vec2(0.0, 0.0) + s * 0.3),
    fbm(p * 1.5 + vec2(5.2, 1.3) + s * 0.2)
  );

  vec2 r = vec2(
    fbm(p * 1.5 + q * 4.0 + vec2(1.7, 9.2) + s * 0.15),
    fbm(p * 1.5 + q * 4.0 + vec2(8.3, 2.8) + s * 0.12)
  );

  vec2 rr = vec2(
    fbm(p * 1.2 + r * 3.0 + vec2(3.1, 4.7) + s * 0.1),
    fbm(p * 1.2 + r * 3.0 + vec2(6.5, 1.3) + s * 0.08)
  );

  float f = fbm(p * 1.5 + rr * 2.5);

  // ── Dark, rich colour palette ────────────────────────────────────────
  // Deep dark base
  vec3 col = vec3(0.02, 0.01, 0.04);

  // Slowly shifting hue — cycles through deep teals, purples, magentas
  float hueShift = sin(s * 0.5) * 0.5 + 0.5;

  // Three colour layers, dark and moody
  vec3 c1 = mix(vec3(0.08, 0.25, 0.22), vec3(0.12, 0.08, 0.28), hueShift);  // deep teal → indigo
  vec3 c2 = mix(vec3(0.22, 0.06, 0.18), vec3(0.06, 0.18, 0.22), hueShift);   // wine → teal
  vec3 c3 = mix(vec3(0.18, 0.10, 0.30), vec3(0.25, 0.12, 0.08), hueShift);   // violet → amber

  col = mix(col, c1, smoothstep(0.2, 0.8, f) * 0.7);
  col = mix(col, c2, smoothstep(0.3, 0.9, length(q)) * 0.5);
  col = mix(col, c3, smoothstep(0.4, 1.0, length(r)) * 0.4);

  // Subtle dark rainbow sheen
  float rainbow = sin(f * 3.0 + s * 2.0) * 0.5 + 0.5;
  vec3 sheen = 0.5 + 0.5 * cos(6.2832 * (rainbow + vec3(0.0, 0.33, 0.67)));
  sheen = pow(sheen, vec3(2.5)) * 0.08; // very subtle
  col += sheen * f;

  // ── Vignette — dark edges, focus centre ─────────────────────────────
  float vignette = 1.0 - length((uv - 0.5) * 1.4);
  vignette = smoothstep(0.0, 0.6, vignette);
  col *= vignette;

  // Extra darkness at edges
  col *= smoothstep(0.0, 0.3, vignette) * 0.6 + 0.4;

  // ── Subtle film grain ───────────────────────────────────────────────
  col += (hash(uv * res + fract(s * 10.0)) - 0.5) * 0.008;

  // Soft tone mapping — keep everything dark
  col = col / (col + 0.4);
  col = pow(col, vec3(1.1));

  gl_FragColor = vec4(col, 1.0);
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
  if (!vs || !fs) return;

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

  function frame(ts) {
    time = ts * 0.001;
    gl.uniform1f(uT, time);
    gl.uniform2f(uRes, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  frame(0);
})();
