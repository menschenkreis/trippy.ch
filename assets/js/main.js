// Cosmic plasma — WebGL fragment shader on a fullscreen quad
(function () {
  const canvas = document.getElementById('cosmic-canvas');
  if (!canvas) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  let W, H, mouse = [0.5, 0.5], time = 0, raf;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    W = canvas.width = canvas.clientWidth * dpr;
    H = canvas.height = canvas.clientHeight * dpr;
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

  vec3 col=vec3(0.04,0.04,0.06);
  col=mix(col,vec3(0.42,0.13,0.66),n1*0.5);   // purple
  col=mix(col,vec3(0.18,0.83,0.75),n2*0.35);   // teal
  col=mix(col,vec3(0.93,0.28,0.60),n3*0.25);   // pink
  col+=0.04*sin(t*0.3+uv.x*6.0+uv.y*4.0);       // gentle pulse

  float vignette=1.0-length((uv-0.5)*1.3);
  col*=smoothstep(0.0,0.7,vignette);

  gl_FragColor=vec4(col,1);
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
})();
