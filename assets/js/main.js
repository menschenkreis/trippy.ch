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

  vec3 col=vec3(0.10,0.04,0.18);
  col=mix(col,vec3(0.49,0.23,0.93),n1*0.5);   // purple
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

// ── Theme System ──
(function () {
  const themes = [
    {
      name: 'Cosmic Purple',
      bg: '#1a0a2e', bgLight: '#2d1b4e', fg: '#e8e0f5', fgMuted: '#a89ec7',
      purple: '#7c3aed', teal: '#2dd4bf', pink: '#ec4899', violet: '#a855f7',
      glow: 'rgba(124,58,237,0.4)', tealGlow: 'rgba(45,212,191,0.3)', pinkGlow: 'rgba(236,72,153,0.3)'
    },
    {
      name: 'Ocean Depths',
      bg: '#0a1628', bgLight: '#0f2038', fg: '#d0f0f0', fgMuted: '#6b9fa8',
      purple: '#0e7490', teal: '#22d3ee', pink: '#f97316', violet: '#06b6d4',
      glow: 'rgba(6,182,212,0.4)', tealGlow: 'rgba(34,211,238,0.3)', pinkGlow: 'rgba(249,115,22,0.3)'
    },
    {
      name: 'Northern Lights',
      bg: '#071a12', bgLight: '#0f2d1e', fg: '#d0ffe0', fgMuted: '#6bba8a',
      purple: '#10b981', teal: '#34d399', pink: '#8b5cf6', violet: '#22d3ee',
      glow: 'rgba(16,185,129,0.4)', tealGlow: 'rgba(52,211,153,0.3)', pinkGlow: 'rgba(139,92,246,0.3)'
    },
    {
      name: 'Solar Flare',
      bg: '#1a0e05', bgLight: '#2d1b0a', fg: '#fff3e0', fgMuted: '#b88a60',
      purple: '#f59e0b', teal: '#fb923c', pink: '#ef4444', violet: '#fbbf24',
      glow: 'rgba(245,158,11,0.4)', tealGlow: 'rgba(251,146,60,0.3)', pinkGlow: 'rgba(239,68,68,0.3)'
    },
    {
      name: 'Nebula',
      bg: '#150520', bgLight: '#220d35', fg: '#f0e0ff', fgMuted: '#9a7bbf',
      purple: '#a855f7', teal: '#6366f1', pink: '#ec4899', violet: '#c084fc',
      glow: 'rgba(168,85,247,0.4)', tealGlow: 'rgba(99,102,241,0.3)', pinkGlow: 'rgba(236,72,153,0.3)'
    },
    {
      name: 'Forest Trip',
      bg: '#0a1a0a', bgLight: '#152d15', fg: '#e0f5e0', fgMuted: '#6ba86b',
      purple: '#65a30d', teal: '#84cc16', pink: '#d97706', violet: '#a3e635',
      glow: 'rgba(101,163,13,0.4)', tealGlow: 'rgba(132,204,22,0.3)', pinkGlow: 'rgba(217,119,6,0.3)'
    },
    {
      name: 'Void',
      bg: '#050208', bgLight: '#0f0a1a', fg: '#d0cce0', fgMuted: '#6b6580',
      purple: '#4c1d95', teal: '#7c3aed', pink: '#a78bfa', violet: '#8b5cf6',
      glow: 'rgba(76,29,149,0.4)', tealGlow: 'rgba(124,58,237,0.3)', pinkGlow: 'rgba(167,139,250,0.3)'
    },
    {
      name: 'Candyland',
      bg: '#1a0a1a', bgLight: '#2d1535', fg: '#ffe0f5', fgMuted: '#b86ba8',
      purple: '#e879f9', teal: '#22d3ee', pink: '#f472b6', violet: '#f0abfc',
      glow: 'rgba(232,121,249,0.4)', tealGlow: 'rgba(34,211,238,0.3)', pinkGlow: 'rgba(244,114,182,0.3)'
    },
    {
      name: 'Midnight Jazz',
      bg: '#0a0e1a', bgLight: '#151a30', fg: '#f5f0e0', fgMuted: '#8a8570',
      purple: '#d4a017', teal: '#b8860b', pink: '#fbbf24', violet: '#eab308',
      glow: 'rgba(212,160,23,0.4)', tealGlow: 'rgba(184,134,11,0.3)', pinkGlow: 'rgba(251,191,36,0.3)'
    },
    {
      name: 'Desert Mirage',
      bg: '#1a120a', bgLight: '#2d2015', fg: '#f5e8d0', fgMuted: '#a89070',
      purple: '#c2410c', teal: '#ea580c', pink: '#7c3aed', violet: '#a855f7',
      glow: 'rgba(194,65,12,0.4)', tealGlow: 'rgba(234,88,12,0.3)', pinkGlow: 'rgba(124,58,237,0.3)'
    }
  ];

  const r = document.documentElement;
  const btn = document.getElementById('theme-btn');
  const contrastBtn = document.getElementById('contrast-btn');

  function applyTheme(t) {
    const s = r.style;
    s.setProperty('--bg', t.bg);
    s.setProperty('--bg-light', t.bgLight);
    s.setProperty('--fg', t.fg);
    s.setProperty('--fg-muted', t.fgMuted);
    s.setProperty('--purple', t.purple);
    s.setProperty('--teal', t.teal);
    s.setProperty('--pink', t.pink);
    s.setProperty('--violet', t.violet);
    s.setProperty('--purple-glow', t.glow);
    s.setProperty('--teal-glow', t.tealGlow);
    s.setProperty('--pink-glow', t.pinkGlow);
  }

  function init() {
    // Load saved theme
    const saved = localStorage.getItem('trippy-theme');
    if (saved) {
      const idx = parseInt(saved, 10);
      if (idx >= 0 && idx < themes.length) applyTheme(themes[idx]);
    }

    // Contrast toggle
    if (localStorage.getItem('trippy-contrast') === 'true') {
      document.body.classList.add('high-contrast');
      if (contrastBtn) contrastBtn.textContent = 'HC';
    }

    // Theme button
    if (btn) {
      btn.addEventListener('click', () => {
        const current = parseInt(localStorage.getItem('trippy-theme') || '0', 10);
        let next;
        do { next = Math.floor(Math.random() * themes.length); } while (next === current && themes.length > 1);
        localStorage.setItem('trippy-theme', next);
        applyTheme(themes[next]);
        // little visual feedback
        btn.style.transform = 'scale(1.3) rotate(180deg)';
        setTimeout(() => btn.style.transform = '', 400);
      });
    }

    // Contrast button
    if (contrastBtn) {
      contrastBtn.addEventListener('click', () => {
        document.body.classList.toggle('high-contrast');
        const on = document.body.classList.contains('high-contrast');
        localStorage.setItem('trippy-contrast', on);
        contrastBtn.textContent = on ? 'HC' : 'LC';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── Smooth Page Transitions ──
(function () {
  const overlay = document.getElementById('page-transition');
  if (!overlay) return;

  // Intercept internal links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    // Skip external, hash, and non-http links
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || a.target === '_blank') return;

    e.preventDefault();
    overlay.classList.add('is-active');
    setTimeout(() => {
      window.location.href = href;
    }, 400);
  });

  // Fade in on page load
  window.addEventListener('pageshow', () => {
    overlay.classList.add('is-active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('is-active');
      });
    });
  });
})();
