// ── Menger Descent → Cosmic Drift — Trippy space flight ────────────────────
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { document.body.innerHTML = '<p style="color:#fff;padding:2rem">WebGL not supported.</p>'; return; }

  let mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let speed = 1.0;
  const speeds = [0.5, 1.0, 2.0, 3.0];
  let speedIdx = 1;
  let autoMode = false;
  let autoTime = 0;
  let time = 0;

  const VS = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.0,1.0); }`;

  const FS = `
precision highp float;

uniform float u_time;
uniform vec2  u_res;
uniform vec2  u_mouse;
uniform float u_speed;
uniform float u_auto;
uniform vec3  u_col1;
uniform vec3  u_col2;
uniform vec3  u_col3;
uniform float u_seed;

#define MAX_STEPS 100
#define MAX_DIST  80.0
#define SURF_DIST 0.001

mat2 rot2(float a){ float s=sin(a),c=cos(a); return mat2(c,-s,s,c); }

// ── Hash & noise ────────────────────────────────────────────────────────
float hash(vec3 p){
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float hash2(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);
}

float noise3(vec3 p){
  vec3 i=floor(p), f=fract(p);
  f = f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec3(1,0,0)),
        c=hash(i+vec3(0,1,0)), d=hash(i+vec3(1,1,0)),
        e=hash(i+vec3(0,0,1)), g=hash(i+vec3(1,0,1)),
        h=hash(i+vec3(0,1,1)), k=hash(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
             mix(mix(e,g,f.x),mix(h,k,f.x),f.y),f.z);
}

float fbm(vec3 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise3(p); p=p*2.01+vec3(100); a*=0.5; }
  return v;
}

// ── Domain repetition with smooth blend ─────────────────────────────────
vec3 rep3(vec3 p, vec3 c){
  vec3 q = mod(p,c)-c*0.5;
  return q;
}

// ── Psychedelic SDF scene ───────────────────────────────────────────────
// A mix of organic blobs, fractal walls, and morphing geometry
float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz)-t.x, p.y);
  return length(q)-t.y;
}
float sdBox(vec3 p, vec3 b){
  vec3 q=abs(p)-b;
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}
float sdOctahedron(vec3 p, float s){
  p=abs(p);
  return (p.x+p.y+p.z-s)*0.57735027;
}
float smin(float a, float b, float k){
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b,a,h)-k*h*(1.0-h);
}

float scene(vec3 p, float t){
  float d = 1e10;

  // Morphing central geometry — blend between shapes over time
  float morph1 = sin(t*0.3)*0.5+0.5;
  float morph2 = sin(t*0.2+1.0)*0.5+0.5;
  float morph3 = cos(t*0.25+2.0)*0.5+0.5;

  // Rotating octahedron blob
  vec3 q1 = p;
  q1.xz *= rot2(t*0.2);
  q1.xy *= rot2(t*0.15);
  float oct = sdOctahedron(q1, 1.0 + 0.3*sin(t*0.4));
  // Breathe with noise
  oct += fbm(p*2.0 + t*0.1)*0.4;

  // Torus knot-ish ring
  vec3 q2 = p;
  q2.xz *= rot2(t*0.12);
  q2.xy *= rot2(t*0.08);
  float torus = sdTorus(q2, vec2(1.8+0.3*sin(t*0.35), 0.15+0.1*sin(t*0.5)));
  torus += fbm(q2*3.0 + t*0.15)*0.2;

  // Floating orbs
  vec3 q3 = p;
  q3.xz *= rot2(-t*0.1);
  q3.xy *= rot2(t*0.13);
  float orbs = sdSphere(q3, 0.5+0.2*sin(t*0.6));

  // Blend them together smoothly
  d = smin(oct, torus, 0.6);
  d = smin(d, orbs, 0.4);

  // Fractal walls — domain-repeated rippling planes
  vec3 rp = rep3(p, vec3(6.0));
  float wall = abs(rp.y) - 0.08 - 0.06*sin(rp.x*2.0+t*0.5)*cos(rp.z*2.0+t*0.3);
  wall += fbm(rp*1.5 + t*0.08)*0.15;
  d = smin(d, wall, 0.8);

  // Smaller repeating fractal detail
  vec3 rp2 = rep3(p, vec3(3.0));
  rp2.xz *= rot2(t*0.2);
  float smallBlob = sdSphere(rp2, 0.2+0.1*sin(t*0.7+length(rp2)*3.0));
  d = smin(d, smallBlob, 0.3);

  // Organic displacement — everything breathes
  d += fbm(p*3.0 + t*0.12 + u_seed)*0.15;
  d += 0.05*sin(p.x*4.0+t*0.6)*sin(p.y*4.0+t*0.5)*sin(p.z*4.0+t*0.4);

  return d;
}

vec3 getNormal(vec3 p){
  vec2 e=vec2(0.001,0);
  return normalize(vec3(
    scene(p+e.xyy,u_time)-scene(p-e.xyy,u_time),
    scene(p+e.yxy,u_time)-scene(p-e.yxy,u_time),
    scene(p+e.yyx,u_time)-scene(p-e.yyx,u_time)
  ));
}

float calcAO(vec3 p, vec3 n){
  float occ=0.0, sca=1.0;
  for(int i=0;i<5;i++){
    float h=0.01+0.12*float(i);
    float d=scene(p+h*n, u_time);
    occ+=(h-d)*sca; sca*=0.95;
  }
  return clamp(1.0-3.0*occ, 0.0, 1.0);
}

// ── Starfield ───────────────────────────────────────────────────────────
vec3 starfield(vec3 rd, float t){
  vec3 col = vec3(0.005, 0.002, 0.01);

  // Nebula
  float n1 = fbm(rd*2.0 + t*0.02);
  float n2 = fbm(rd*3.0 + vec3(t*0.015, 0, t*0.01));
  col += vec3(0.06,0.01,0.08) * n1 * 0.5;
  col += vec3(0.01,0.04,0.08) * n2 * 0.4;

  // Stars
  for(int layer=0; layer<3; layer++){
    float scale = 60.0 + float(layer)*100.0;
    vec3 grid = rd * scale;
    vec3 id = floor(grid);
    vec3 f = fract(grid)-0.5;
    float h = hash(id + float(layer)*100.0);
    float brightness = pow(h, 6.0) * 1.5;
    brightness *= 0.6 + 0.4*sin(t*(1.0+h*4.0)+h*100.0);
    vec3 starCol = mix(vec3(0.8,0.85,1.0), mix(vec3(1.0,0.8,0.5),vec3(0.5,0.7,1.0), h), step(0.5,h));
    float star = smoothstep(0.08,0.0,length(f))*brightness;
    if(h>0.93){
      star += min(smoothstep(0.25,0.0,abs(f.x))+smoothstep(0.25,0.0,abs(f.y)),1.0)*0.25*brightness;
    }
    col += starCol * star;
  }
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  float t = u_time;

  // ── Camera — fly through space ──────────────────────────────────────
  vec2 m = (u_mouse - 0.5);

  // Flight path — spiralling through the scene
  float ft = t * 0.3 * u_speed;
  vec3 ro = vec3(
    sin(ft*0.3)*3.0,
    sin(ft*0.2)*1.5,
    ft
  );

  // Auto mode
  if(u_auto > 0.5){
    m = vec2(sin(t*0.13)*0.4+sin(t*0.07)*0.2, sin(t*0.11)*0.3+cos(t*0.09)*0.15);
  }

  float yaw = m.x * 1.5;
  float pitch = m.y * 1.0;

  // Forward direction + look offset
  vec3 forward = normalize(vec3(
    sin(yaw)*cos(pitch),
    sin(pitch),
    cos(yaw)*cos(pitch)
  ));
  vec3 ww=normalize(forward);
  vec3 uu=normalize(cross(ww,vec3(0,1,0)));
  vec3 vv=cross(uu,ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*ww);

  // ── Ray March ────────────────────────────────────────────────────────
  float totalDist=0.0;
  vec3 p;
  float trap = 1e10; // orbit trap for colouring

  for(int i=0;i<MAX_STEPS;i++){
    p = ro + rd*totalDist;
    float d = scene(p, t);
    trap = min(trap, length(p));
    if(d<SURF_DIST || totalDist>MAX_DIST) break;
    totalDist += d*0.8;
  }

  // ── Colour ───────────────────────────────────────────────────────────
  vec3 col;

  if(totalDist < MAX_DIST){
    vec3 n = getNormal(p);
    float ao = calcAO(p, n);

    // Lighting — two coloured lights
    vec3 l1 = normalize(vec3(0.5, 0.8, -0.3));
    vec3 l2 = normalize(vec3(-0.6, -0.3, 0.5));
    float diff1 = max(dot(n,l1),0.0);
    float diff2 = max(dot(n,l2),0.0);
    float spec = pow(max(dot(reflect(rd,n),l1),0.0),32.0);
    float fres = pow(1.0-max(dot(-rd,n),0.0),3.0);

    // Vibrant colour from position + orbit trap + time
    float h1 = fract(p.x*0.3 + p.y*0.2 + p.z*0.15 + t*0.05 + u_seed);
    float h2 = fract(dot(n,vec3(1))*1.5 + u_seed*0.5);
    float h3 = clamp(trap*0.5, 0.0, 1.0);
    float h4 = fract(fbm(p*2.0 + t*0.1)*3.0);

    // Boost saturation
    vec3 c1 = mix(vec3(dot(u_col1,vec3(0.299,0.587,0.114))), u_col1, 2.0);
    vec3 c2 = mix(vec3(dot(u_col2,vec3(0.299,0.587,0.114))), u_col2, 2.2);
    vec3 c3 = mix(vec3(dot(u_col3,vec3(0.299,0.587,0.114))), u_col3, 1.8);

    col = c1*(0.3+0.7*h1);
    col = mix(col, c2, h2*0.5);
    col = mix(col, c3, h3*0.4);
    col = mix(col, c1*1.3+c2*0.7, h4*0.3);

    // Apply lighting
    col *= (0.12 + 0.88*diff1)*ao;
    col += c2 * diff2 * 0.25; // second light tint
    col += c2 * spec * 0.8;
    col += c3 * fres * 0.4;

    // Emissive in cavities
    float cavity = 1.0-ao;
    col += c1*cavity*cavity*0.6;
    col += c3*cavity*0.2;

    // Fog
    float fog = 1.0-exp(-totalDist*0.04);
    vec3 fogCol = mix(vec3(0.01,0.005,0.02), c3*0.1, 0.5+0.5*sin(t*0.1));
    col = mix(col, fogCol, fog*fog);

  } else {
    // Skybox
    col = starfield(rd, t);
  }

  // ── Post ─────────────────────────────────────────────────────────────
  col *= 1.0-0.25*dot(uv,uv);
  float ca = length(uv)*0.004;
  col.r *= 1.0+ca; col.b *= 1.0-ca;
  col += (hash2(uv*u_res+fract(t*100.0))-0.5)*0.012;
  col = col/(col+0.2);
  col = pow(col, vec3(0.92));

  gl_FragColor = vec4(col,1.0);
}
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['u_time','u_res','u_mouse','u_speed','u_auto','u_col1','u_col2','u_col3','u_seed'].forEach(n => u[n] = gl.getUniformLocation(prog, n));

  function hsl2rgb(h, s, l) {
    h = ((h%360)+360)%360;
    const c = (1-Math.abs(2*l-1))*s, x = c*(1-Math.abs((h/60)%2-1)), m = l-c/2;
    let r,g,b;
    if(h<60){r=c;g=x;b=0}else if(h<120){r=x;g=c;b=0}else if(h<180){r=0;g=c;b=x}
    else if(h<240){r=0;g=x;b=c}else if(h<300){r=x;g=0;b=c}else{r=c;g=0;b=x}
    return [r+m,g+m,b+m];
  }
  function generatePalette() {
    const schemes = ['analogous','triadic','splitComp','tetradic','warmMono','coolMono'];
    const scheme = schemes[Math.floor(Math.random()*schemes.length)];
    const base = Math.random()*360, sat = 0.75+Math.random()*0.25;
    let hues;
    switch(scheme){
      case 'analogous': hues=[base,base+30+Math.random()*30,base-30-Math.random()*30]; break;
      case 'triadic': hues=[base,base+120+Math.random()*20-10,base+240+Math.random()*20-10]; break;
      case 'splitComp': hues=[base,base+150+Math.random()*30,base+210+Math.random()*30]; break;
      case 'tetradic': hues=[base,base+90+Math.random()*30,base+180+Math.random()*20]; break;
      case 'warmMono': hues=[Math.random()*60,20+Math.random()*40,340+Math.random()*40]; break;
      case 'coolMono': hues=[180+Math.random()*60,240+Math.random()*60,300+Math.random()*60]; break;
    }
    return [
      hsl2rgb(hues[0],sat,0.45+Math.random()*0.15),
      hsl2rgb(hues[1],sat*0.95,0.55+Math.random()*0.2),
      hsl2rgb(hues[2],sat*0.7,0.3+Math.random()*0.15),
    ];
  }

  let pal = generatePalette();
  let paletteSeed = Math.random()*100;

  function resize() {
    const dpr = Math.min(devicePixelRatio, 1.5);
    canvas.width = window.innerWidth*dpr;
    canvas.height = window.innerHeight*dpr;
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  window.addEventListener('resize', resize); resize();

  function onMove(x,y){ mouse.tx=x/window.innerWidth; mouse.ty=1.0-y/window.innerHeight; }
  canvas.addEventListener('mousemove', e => onMove(e.clientX,e.clientY));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX,e.touches[0].clientY); }, {passive:false});
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onMove(e.touches[0].clientX,e.touches[0].clientY); }, {passive:false});

  const hud = document.getElementById('hud');
  const speedBtn = document.getElementById('speed-btn');
  const autoBtn = document.getElementById('auto-btn');
  const themeBtn = document.getElementById('theme-btn');
  const resetBtn = document.getElementById('reset-btn');
  let maxIter = 5;

  function updateHud(){ hud.textContent = `speed ${speed}×${autoMode?' · auto':''}`; }

  speedBtn.addEventListener('click', () => {
    speedIdx=(speedIdx+1)%speeds.length; speed=speeds[speedIdx];
    speedBtn.textContent=speed+'×'; updateHud();
  });
  autoBtn.addEventListener('click', () => {
    autoMode=!autoMode; autoBtn.classList.toggle('is-on',autoMode); updateHud();
  });
  themeBtn.addEventListener('click', () => {
    paletteSeed=Math.random()*100; pal=generatePalette();
  });
  resetBtn.addEventListener('click', () => {
    mouse.tx=0.5;mouse.ty=0.5;speed=1.0;speedIdx=1;speedBtn.textContent='1×';
    autoMode=false;autoBtn.classList.remove('is-on');time=0;autoTime=0;
    pal=generatePalette();paletteSeed=Math.random()*100;updateHud();
  });

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now-last)*0.001, 0.05); last=now; time+=dt;
    mouse.x += (mouse.tx-mouse.x)*0.08;
    mouse.y += (mouse.ty-mouse.y)*0.08;
    if(autoMode){ autoTime+=dt; mouse.tx=0.5+0.15*Math.sin(autoTime*0.5); mouse.ty=0.5+0.1*Math.cos(autoTime*0.3); }
    gl.uniform1f(u.u_time,time);
    gl.uniform2f(u.u_res,canvas.width,canvas.height);
    gl.uniform2f(u.u_mouse,mouse.x,mouse.y);
    gl.uniform1f(u.u_speed,speed);
    gl.uniform1f(u.u_auto,autoMode?1.0:0.0);
    gl.uniform3fv(u.u_col1,pal[0]);
    gl.uniform3fv(u.u_col2,pal[1]);
    gl.uniform3fv(u.u_col3,pal[2]);
    gl.uniform1f(u.u_seed,paletteSeed);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  requestAnimationFrame(frame);
})();
