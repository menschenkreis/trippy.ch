/* trippy-peggle.js — Trippy Peggle game engine */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════
  //  1. CONFIG
  // ═══════════════════════════════════════════════
  const Config = {
    BALL_RADIUS: 7,
    BALL_SPEED: 600,
    GRAVITY: 980,
    BOUNCE: 0.72,
    FRICTION: 0.999,
    PEG_RADIUS: 12,
    PEG_HIT_RADIUS: 14,
    ACTIVE_PEG_RATIO: 0.25,
    GREEN_PEG_COUNT: 2,
    PURPLE_PEG_COUNT: 1,
    BALLS_PER_LEVEL: 10,
    BUCKET_WIDTH: 80,
    BUCKET_HEIGHT: 20,
    BUCKET_SPEED: 120,
    TRAIL_LENGTH: 30,
    PARTICLE_MAX: 400,
    PARTICLE_BURST_PEG: 12,
    PARTICLE_BURST_ACTIVE: 20,
    PARTICLE_BURST_FEVER: 80,
    PARTICLE_LIFE: 0.8,
    FEVER_SPEED: 0.15,
    FEVER_ZOOM: 1.8,
    FEVER_DURATION: 2.5,
    GUIDE_POWER_DURATION: 1,
    SCORE_BLUE: 10,
    SCORE_ACTIVE: 100,
    SCORE_PURPLE: 10000,
    SCORE_FEVER_BONUS: 5000,
    LEVEL_TYPES: ['grid', 'circle', 'mandala', 'random'],
  };

  // ═══════════════════════════════════════════════
  //  2. THEME MANAGER
  // ═══════════════════════════════════════════════
  class ThemeManager {
    constructor() { this.refresh(); }
    _var(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    refresh() {
      const vars = ['--purple','--teal','--pink','--violet','--blue','--cyan','--magenta','--lime','--orange'];
      this.colors = vars.map(v => this._var(v)).filter(Boolean);
      this.bg = this._var('--bg') || '#0a0a0f';
      if (!this.colors.length) this.colors = ['#8c64ff','#64ffda','#ff64a0','#b464ff','#6494ff','#64ffe0','#ff64d0','#a0ff64','#ffa064'];
    }
    color(i) { return this.colors[i % this.colors.length]; }
    randomColor() { return this.color(Math.floor(Math.random() * this.colors.length)); }
    hexToRGBA(hex, a) {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    }
  }

  // ═══════════════════════════════════════════════
  //  3. INPUT MANAGER
  // ═══════════════════════════════════════════════
  class InputManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.aimX = 0;
      this.aimY = 1;
      this.shotRequested = false;
      this._aimAngle = Math.PI / 2;
      this._touchStart = null;
      this._mouseX = 0;
      this._mouseY = 0;
      this._bound = false;
    }
    bind() {
      if (this._bound) return;
      this._bound = true;
      const c = this.canvas;
      // Mouse
      c.addEventListener('mousemove', e => {
        this._mouseX = e.clientX;
        this._mouseY = e.clientY;
        this._updateAimFromMouse();
      });
      c.addEventListener('click', e => {
        this.shotRequested = true;
      });
      // Touch
      c.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        this._mouseX = t.clientX;
        this._mouseY = t.clientY;
        this._updateAimFromMouse();
      }, { passive: false });
      c.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0];
        this._mouseX = t.clientX;
        this._mouseY = t.clientY;
        this._updateAimFromMouse();
      }, { passive: false });
      c.addEventListener('touchend', e => {
        e.preventDefault();
        this.shotRequested = true;
      }, { passive: false });
      // Keyboard
      document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') this._aimAngle = Math.max(0.1, this._aimAngle - 0.04);
        if (e.key === 'ArrowRight') this._aimAngle = Math.min(Math.PI - 0.1, this._aimAngle + 0.04);
        if (e.key === ' ') { e.preventDefault(); this.shotRequested = true; }
        this.aimX = Math.cos(this._aimAngle);
        this.aimY = Math.sin(this._aimAngle);
      });
    }
    _updateAimFromMouse() {
      const lx = this.canvas.width / 2;
      const ly = 50;
      const dx = this._mouseX - lx;
      const dy = this._mouseY - ly;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      this.aimX = dx / len;
      this.aimY = dy / len;
      this._aimAngle = Math.atan2(this.aimY, this.aimX);
    }
  }

  // ═══════════════════════════════════════════════
  //  4. PARTICLE
  // ═══════════════════════════════════════════════
  class Particle {
    constructor(x, y, vx, vy, color, life, size) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = this.maxLife = life;
      this.size = size; this.active = true;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 200 * dt;
      this.life -= dt;
      if (this.life <= 0) this.active = false;
    }
    draw(ctx) {
      const a = Math.max(0, this.life / this.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  5. PARTICLE SYSTEM
  // ═══════════════════════════════════════════════
  class ParticleSystem {
    constructor() { this.particles = []; }
    burst(x, y, color, count, speed, life, size) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= Config.PARTICLE_MAX) {
          // Reuse oldest
          const p = this.particles.find(p => !p.active);
          if (p) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * speed;
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.color = color; p.life = life * (0.5 + Math.random() * 0.5);
            p.maxLife = p.life; p.size = size; p.active = true;
          }
          continue;
        }
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * speed;
        const p = new Particle(x, y, Math.cos(angle)*spd, Math.sin(angle)*spd, color, life*(0.5+Math.random()*0.5), size);
        this.particles.push(p);
      }
    }
    update(dt) {
      for (const p of this.particles) if (p.active) p.update(dt);
      // Prune excess
      if (this.particles.length > Config.PARTICLE_MAX * 1.2) {
        this.particles = this.particles.filter(p => p.active);
      }
    }
    draw(ctx) {
      for (const p of this.particles) if (p.active) p.draw(ctx);
    }
  }

  // ═══════════════════════════════════════════════
  //  6. PEG
  // ═══════════════════════════════════════════════
  const PEG_TYPES = { BLUE: 'blue', ACTIVE: 'active', GREEN: 'green', PURPLE: 'purple' };

  class Peg {
    constructor(x, y, type) {
      this.x = x; this.y = y;
      this.type = type;
      this.radius = Config.PEG_RADIUS;
      this.hit = false;
      this.hitTime = 0;
      this.clearDelay = 0.8;
      this.active = true;
      this.pulse = Math.random() * Math.PI * 2;
      this.score = type === PEG_TYPES.PURPLE ? Config.SCORE_PURPLE : type === PEG_TYPES.ACTIVE ? Config.SCORE_ACTIVE : Config.SCORE_BLUE;
    }
    getColor() {
      switch (this.type) {
        case PEG_TYPES.ACTIVE: return '#ff8c42';
        case PEG_TYPES.GREEN: return '#42ff88';
        case PEG_TYPES.PURPLE: return '#c842ff';
        default: return '#4466aa';
      }
    }
    getGlow() {
      switch (this.type) {
        case PEG_TYPES.ACTIVE: return 'rgba(255,140,66,0.5)';
        case PEG_TYPES.GREEN: return 'rgba(66,255,136,0.5)';
        case PEG_TYPES.PURPLE: return 'rgba(200,66,255,0.6)';
        default: return 'rgba(68,102,170,0.3)';
      }
    }
    update(dt) {
      this.pulse += dt * 3;
      if (this.hit) {
        this.hitTime += dt;
        if (this.hitTime >= this.clearDelay) this.active = false;
      }
    }
    draw(ctx, time) {
      if (!this.active) return;
      const color = this.getColor();
      const glow = this.getGlow();
      let scale = 1;
      let alpha = 1;
      if (this.hit) {
        const t = this.hitTime / this.clearDelay;
        scale = 1 - t * 0.5;
        alpha = 1 - t;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);

      // Outer glow
      const pulseSize = 1 + Math.sin(this.pulse) * 0.15;
      ctx.shadowColor = glow;
      ctx.shadowBlur = this.type === PEG_TYPES.PURPLE ? 20 : 12;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * pulseSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.beginPath();
      ctx.arc(-2, -2, this.radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      // Purple sparkle
      if (this.type === PEG_TYPES.PURPLE && !this.hit) {
        for (let i = 0; i < 4; i++) {
          const a = time * 2 + i * Math.PI / 2;
          const r = this.radius + 6;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(200,66,255,0.6)';
          ctx.fill();
        }
      }

      // Green shimmer
      if (this.type === PEG_TYPES.GREEN && !this.hit) {
        const shimA = time * 4;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 3, shimA, shimA + 1);
        ctx.strokeStyle = 'rgba(66,255,136,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ═══════════════════════════════════════════════
  //  7. LEVEL GENERATOR
  // ═══════════════════════════════════════════════
  class LevelGenerator {
    generate(levelNum, w, h) {
      const typeIdx = (levelNum - 1) % Config.LEVEL_TYPES.length;
      const type = Config.LEVEL_TYPES[typeIdx];
      const density = 1 + Math.floor((levelNum - 1) / Config.LEVEL_TYPES.length) * 0.15;
      let pegs = [];
      const playTop = 120, playBottom = h - 80;
      const playLeft = 40, playRight = w - 40;

      switch (type) {
        case 'grid':
          pegs = this._grid(playLeft, playRight, playTop, playBottom, density);
          break;
        case 'circle':
          pegs = this._circles(w/2, (playTop+playBottom)/2, Math.min(playRight-playLeft, playBottom-playTop)/2 - 20, density);
          break;
        case 'mandala':
          pegs = this._mandala(w/2, (playTop+playBottom)/2, Math.min(playRight-playLeft, playBottom-playTop)/2 - 20, density);
          break;
        case 'random':
          pegs = this._random(playLeft, playRight, playTop, playBottom, density);
          break;
      }

      return this._assignTypes(pegs, w, h);
    }

    _grid(left, right, top, bottom, density) {
      const pegs = [];
      const spacing = 45 / density;
      const cols = Math.floor((right - left) / spacing);
      const rows = Math.floor((bottom - top) / spacing);
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * spacing * 0.5;
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.12) continue; // random gaps
          pegs.push({ x: left + c * spacing + offset + spacing/2, y: top + r * spacing + spacing/2 });
        }
      }
      return pegs;
    }

    _circles(cx, cy, maxR, density) {
      const pegs = [];
      const rings = Math.max(3, Math.floor(maxR / 45 / density + 2));
      for (let ring = 1; ring <= rings; ring++) {
        const r = (ring / rings) * maxR;
        const count = Math.max(6, Math.floor(ring * 8 / density));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          pegs.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      }
      return pegs;
    }

    _mandala(cx, cy, maxR, density) {
      const pegs = [];
      // Flower of life inspired
      const rings = Math.max(2, Math.floor(maxR / 70 / density + 1));
      for (let ring = 0; ring <= rings; ring++) {
        const r = ring * 60 / density;
        const count = ring === 0 ? 1 : Math.max(6, ring * 6);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (ring % 2) * 0.3;
          pegs.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      }
      // Hexagonal ring
      const hexR = maxR * 0.7;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        pegs.push({ x: cx + Math.cos(a) * hexR, y: cy + Math.sin(a) * hexR });
      }
      return pegs;
    }

    _random(left, right, top, bottom, density) {
      const pegs = [];
      const minDist = 35 / density;
      const count = Math.floor(((right-left) * (bottom-top)) / (minDist * minDist) * 0.3);
      for (let i = 0; i < count; i++) {
        const x = left + Math.random() * (right - left);
        const y = top + Math.random() * (bottom - top);
        let ok = true;
        for (const p of pegs) {
          const dx = p.x - x, dy = p.y - y;
          if (dx*dx + dy*dy < minDist * minDist) { ok = false; break; }
        }
        if (ok) pegs.push({ x, y });
      }
      return pegs;
    }

    _assignTypes(positions, w, h) {
      if (positions.length < 10) return positions.map(p => new Peg(p.x, p.y, PEG_TYPES.BLUE));
      const pegs = positions.map(p => new Peg(p.x, p.y, PEG_TYPES.BLUE));

      // Assign active pegs — spread them out
      const activeCount = Math.max(10, Math.floor(pegs.length * Config.ACTIVE_PEG_RATIO));
      const indices = pegs.map((_, i) => i);
      this._shuffle(indices);
      // Pick spread-out ones
      const activeIndices = [];
      const used = new Set();
      for (const idx of indices) {
        if (activeIndices.length >= activeCount) break;
        let tooClose = false;
        for (const ai of activeIndices) {
          const dx = pegs[idx].x - pegs[ai].x, dy = pegs[idx].y - pegs[ai].y;
          if (dx*dx + dy*dy < 60*60) { tooClose = true; break; }
        }
        if (!tooClose) {
          activeIndices.push(idx);
          used.add(idx);
        }
      }
      for (const idx of activeIndices) pegs[idx].type = PEG_TYPES.ACTIVE;

      // Green pegs — pick from non-active, in harder spots (far from center)
      const remaining = indices.filter(i => !used.has(i));
      remaining.sort((a, b) => {
        const da = Math.abs(pegs[a].x - w/2);
        const db = Math.abs(pegs[b].x - w/2);
        return db - da;
      });
      for (let i = 0; i < Math.min(Config.GREEN_PEG_COUNT, remaining.length); i++) {
        pegs[remaining[i]].type = PEG_TYPES.GREEN;
        used.add(remaining[i]);
      }

      // Purple peg — tricky spot (near edges or far from launcher)
      const rest = remaining.filter(i => !used.has(i));
      rest.sort((a, b) => {
        const da = Math.abs(pegs[a].x - w/2) + pegs[a].y;
        const db = Math.abs(pegs[b].x - w/2) + pegs[b].y;
        return db - da;
      });
      if (rest.length > 0) pegs[rest[0]].type = PEG_TYPES.PURPLE;

      return pegs;
    }

    _shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  8. BALL
  // ═══════════════════════════════════════════════
  class Ball {
    constructor(x, y, vx, vy) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.radius = Config.BALL_RADIUS;
      this.active = true;
      this.trail = [];
      this.offscreen = false;
    }
    update(dt) {
      this.vy += Config.GRAVITY * dt;
      this.vx *= Config.FRICTION;
      this.vy *= Config.FRICTION;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > Config.TRAIL_LENGTH) this.trail.pop();
    }
    draw(ctx, color) {
      // Trail
      if (this.trail.length > 1) {
        for (let i = 1; i < this.trail.length; i++) {
          const a = 1 - i / this.trail.length;
          ctx.beginPath();
          ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
          ctx.lineTo(this.trail[i].x, this.trail[i].y);
          ctx.strokeStyle = color.replace(')', `,${a * 0.6})`).replace('rgb', 'rgba');
          ctx.lineWidth = this.radius * 2 * a;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
      // Ball
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner glow
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // ═══════════════════════════════════════════════
  //  9. LAUNCHER
  // ═══════════════════════════════════════════════
  class Launcher {
    constructor(canvas) {
      this.x = canvas.width / 2;
      this.y = 50;
      this.angle = Math.PI / 2;
      this.canvas = canvas;
    }
    updateAngle(ax, ay) {
      if (ay < 0.1) return; // Don't aim upward
      this.angle = Math.atan2(ay, ax);
      if (this.angle < 0.15) this.angle = 0.15;
      if (this.angle > Math.PI - 0.15) this.angle = Math.PI - 0.15;
    }
    draw(ctx, color, time) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle - Math.PI / 2);

      // Launcher body — triangle
      const size = 18;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(-size * 0.6, size * 0.4);
      ctx.lineTo(size * 0.6, size * 0.4);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.lineTo(-size * 0.25, size * 0.1);
      ctx.lineTo(size * 0.25, size * 0.1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      ctx.restore();

      // Aiming line
      this._drawAimLine(ctx, color, time);
    }
    _drawAimLine(ctx, color, time) {
      const len = 120;
      const segments = 12;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const x = this.x + Math.cos(this.angle) * len * t;
        const y = this.y + Math.sin(this.angle) * len * t;
        const a = (1 - t) * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', `,${a})`).replace('rgb', 'rgba');
        ctx.fill();
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  10. CAMERA
  // ═══════════════════════════════════════════════
  class Camera {
    constructor(w, h) {
      this.x = w / 2; this.y = h / 2;
      this.zoom = 1; this.targetZoom = 1;
      this.targetX = w / 2; this.targetY = h / 2;
    }
    setZoom(z) { this.targetZoom = z; }
    follow(x, y) { this.targetX = x; this.targetY = y; }
    reset(w, h) {
      this.targetZoom = 1; this.targetX = w/2; this.targetY = h/2;
    }
    update(dt) {
      this.zoom += (this.targetZoom - this.zoom) * 3 * dt;
      this.x += (this.targetX - this.x) * 3 * dt;
      this.y += (this.targetY - this.y) * 3 * dt;
    }
    apply(ctx, w, h) {
      ctx.translate(w/2, h/2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }
  }

  // ═══════════════════════════════════════════════
  //  11. BACKGROUND
  // ═══════════════════════════════════════════════
  class Background {
    constructor(w, h) { this.w = w; this.h = h; this.progress = 0; }
    setProgress(p) { this.progress = p; }
    draw(ctx, time, theme) {
      // Gradient that shifts with progress
      const r = Math.floor(10 + this.progress * 15);
      const g = Math.floor(6 + this.progress * 5);
      const b = Math.floor(15 + this.progress * 20);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, this.w, this.h);

      // Subtle grid
      ctx.strokeStyle = `rgba(140,100,255,${0.03 + this.progress * 0.02})`;
      ctx.lineWidth = 0.5;
      const spacing = 80;
      for (let x = 0; x < this.w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); ctx.stroke();
      }
      for (let y = 0; y < this.h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
      }

      // Ambient glow based on progress
      const grad = ctx.createRadialGradient(this.w/2, this.h/2, 0, this.w/2, this.h/2, this.w * 0.6);
      const c = theme.color(0);
      grad.addColorStop(0, theme.hexToRGBA(c, 0.03 + this.progress * 0.05));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  // ═══════════════════════════════════════════════
  //  12. AUDIO
  // ═══════════════════════════════════════════════
  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = true;
    }
    _ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    _tone(freq, dur, vol, type) {
      if (this.muted || !this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.1, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    }
    pegHit(type) {
      this._ensure();
      const base = 400 + Math.random() * 200;
      if (type === PEG_TYPES.ACTIVE) {
        this._tone(base, 0.3, 0.15, 'triangle');
      } else if (type === PEG_TYPES.GREEN) {
        [0, 100, 200, 300].forEach((d, i) => {
          setTimeout(() => this._tone(base + i * 150, 0.2, 0.1, 'sine'), d);
        });
      } else if (type === PEG_TYPES.PURPLE) {
        [261, 329, 392].forEach((f, i) => {
          setTimeout(() => this._tone(f, 0.5, 0.12, 'triangle'), i * 80);
        });
      } else {
        this._tone(base * 0.8, 0.15, 0.06, 'sine');
      }
    }
    launch() {
      this._ensure();
      // Whoosh via noise
      if (this.muted || !this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 0.15;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufferSize);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.15);
      filter.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.08, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      src.connect(filter); filter.connect(g); g.connect(this.ctx.destination);
      src.start();
    }
    bucketChime() {
      this._ensure();
      [523, 659, 784].forEach((f, i) => {
        setTimeout(() => this._tone(f, 0.2, 0.1, 'sine'), i * 60);
      });
    }
    feverChord() {
      this._ensure();
      [261, 329, 392, 523].forEach((f, i) => {
        setTimeout(() => this._tone(f, 1.5, 0.12, 'triangle'), i * 100);
      });
    }
    levelComplete() {
      this._ensure();
      const notes = [261, 293, 329, 349, 392, 440, 493, 523];
      notes.forEach((f, i) => {
        setTimeout(() => this._tone(f, 0.3, 0.1, 'triangle'), i * 80);
      });
      setTimeout(() => {
        [261, 329, 392].forEach(f => this._tone(f, 1.2, 0.1, 'triangle'));
      }, notes.length * 80);
    }
  }

  // ═══════════════════════════════════════════════
  //  13. GAME
  // ═══════════════════════════════════════════════
  class Game {
    constructor() {
      this.canvas = document.getElementById('c');
      this.ctx = this.canvas.getContext('2d');
      this.theme = new ThemeManager();
      this.input = new InputManager(this.canvas);
      this.particles = new ParticleSystem();
      this.levelGen = new LevelGenerator();
      this.launcher = new Launcher(this.canvas);
      this.camera = new Camera(this.canvas.width, this.canvas.height);
      this.background = new Background(this.canvas.width, this.canvas.height);
      this.audio = new Audio();

      this.state = 'idle'; // idle, aiming, shooting, fever, levelComplete, gameOver
      this.level = 1;
      this.score = 0;
      this.highScore = parseInt(localStorage.getItem('peggle_high') || '0');
      this.ballsLeft = Config.BALLS_PER_LEVEL;
      this.pegs = [];
      this.ball = null;
      this.bucket = { x: 0, y: 0, w: Config.BUCKET_WIDTH, h: Config.BUCKET_HEIGHT, dir: 1 };
      this.feverTimer = 0;
      this.feverTarget = null;
      this.guideActive = false;
      this.guideTimer = 0;
      this.time = 0;
      this.lastTime = 0;
      this.aimColor = 'rgb(140,100,255)';
      this.levelScore = 0;
      this.pegsHitThisShot = 0;
      this.pegHitsThisShot = [];

      this._resize();
      window.addEventListener('resize', () => this._resize());
      this.input.bind();

      // Start render loop
      requestAnimationFrame(t => this._loop(t));
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.launcher.x = this.W / 2;
      this.launcher.y = 50;
      this.bucket.y = this.H - 40;
      this.camera.reset(this.W, this.H);
      this.background.w = this.W;
      this.background.h = this.H;
    }

    start() {
      this.state = 'aiming';
      this.level = 1;
      this.score = 0;
      this._loadLevel();
    }

    restart() {
      if (window._peggleUI) window._peggleUI.hideGameOver();
      if (window._peggleJourney) window._peggleJourney.reset();
      this.state = 'aiming';
      this.level = 1;
      this.score = 0;
      this.ballsLeft = Config.BALLS_PER_LEVEL;
      this._loadLevel();
    }

    nextLevel() {
      if (window._peggleUI) window._peggleUI.hideLevelComplete();
      this.level++;
      this.ballsLeft = Config.BALLS_PER_LEVEL;
      this.state = 'aiming';
      this._loadLevel();
    }

    _loadLevel() {
      this.pegs = this.levelGen.generate(this.level, this.W, this.H);
      this.ball = null;
      this.camera.reset(this.W, this.H);
      this.feverTimer = 0;
      this.guideActive = false;
      this.levelScore = 0;
      this.aimColor = this.theme.randomColor();
      if (window._peggleJourney) window._peggleJourney.check('level' + this.level, '🌀', `Entered <strong>Level ${this.level}</strong> — ${Config.LEVEL_TYPES[(this.level-1) % Config.LEVEL_TYPES.length]}`);
    }

    setMuted(m) { this.audio.muted = m; }

    // ── Main loop ──
    _loop(timestamp) {
      if (!this.lastTime) this.lastTime = timestamp;
      let dt = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;
      dt = Math.min(dt, 0.05); // Cap delta

      this.time += dt;

      // Slow-mo during fever
      let gameDt = dt;
      if (this.state === 'fever') {
        gameDt = dt * Config.FEVER_SPEED;
        this.feverTimer += dt;
        if (this.feverTimer >= Config.FEVER_DURATION) this._endFever();
      }

      this._update(gameDt, dt);
      this._draw();

      requestAnimationFrame(t => this._loop(t));
    }

    _update(dt, realDt) {
      // Input
      if (this.state === 'aiming') {
        this.launcher.updateAngle(this.input.aimX, this.input.aimY);
        if (this.input.shotRequested) {
          this.input.shotRequested = false;
          this._shoot();
        }
      }
      if (this.state === 'idle') {
        this.input.shotRequested = false;
      }

      // Guide timer
      if (this.guideActive) {
        this.guideTimer -= realDt;
        if (this.guideTimer <= 0) this.guideActive = false;
      }

      // Bucket
      if (this.state === 'shooting' || this.state === 'fever') {
        this.bucket.x += this.bucket.dir * Config.BUCKET_SPEED * dt;
        if (this.bucket.x > this.W - this.bucket.w/2) this.bucket.dir = -1;
        if (this.bucket.x < this.bucket.w/2) this.bucket.dir = 1;
      }

      // Ball physics
      if (this.ball && this.ball.active && (this.state === 'shooting' || this.state === 'fever')) {
        this.ball.update(dt);
        this._checkCollisions();
        this._checkBounds();

        // Camera follow during fever
        if (this.state === 'fever' && this.ball) {
          this.camera.follow(this.ball.x, this.ball.y);
          this.camera.setZoom(Config.FEVER_ZOOM);
        }
      }

      // Pegs
      for (const peg of this.pegs) peg.update(dt);

      // Particles
      this.particles.update(dt);

      // Camera
      this.camera.update(dt);

      // Background progress
      const activeTotal = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE).length;
      const activeHit = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.hit).length;
      this.background.setProgress(activeTotal > 0 ? activeHit / activeTotal : 0);

      // Check if all hit pegs should cascade (fever end)
      if (this.state === 'fever_end') {
        this.feverTimer -= realDt;
        if (this.feverTimer <= 0) {
          this._showLevelComplete();
        }
      }
    }

    _shoot() {
      if (this.ballsLeft <= 0) return;
      this.ballsLeft--;
      const speed = Config.BALL_SPEED;
      const vx = Math.cos(this.launcher.angle) * speed;
      const vy = Math.sin(this.launcher.angle) * speed;
      this.ball = new Ball(this.launcher.x, this.launcher.y + 20, vx, vy);
      this.state = 'shooting';
      this.pegsHitThisShot = 0;
      this.pegHitsThisShot = [];
      this.audio.launch();
    }

    _checkCollisions() {
      if (!this.ball) return;
      for (const peg of this.pegs) {
        if (!peg.active || peg.hit) continue;
        const dx = this.ball.x - peg.x;
        const dy = this.ball.y - peg.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const minDist = this.ball.radius + Config.PEG_HIT_RADIUS;
        if (dist < minDist) {
          // Separate
          const nx = dx / dist, ny = dy / dist;
          const overlap = minDist - dist;
          this.ball.x += nx * overlap;
          this.ball.y += ny * overlap;
          // Bounce
          const dot = this.ball.vx * nx + this.ball.vy * ny;
          this.ball.vx -= 2 * dot * nx * Config.BOUNCE;
          this.ball.vy -= 2 * dot * ny * Config.BOUNCE;
          // Mark hit
          peg.hit = true;
          this.pegsHitThisShot++;
          this.pegHitsThisShot.push(peg);
          this.score += peg.score;
          this.levelScore += peg.score;
          // Particles
          const burstCount = peg.type === PEG_TYPES.ACTIVE ? Config.PARTICLE_BURST_ACTIVE : Config.PARTICLE_BURST_PEG;
          this.particles.burst(peg.x, peg.y, peg.getColor(), burstCount, 150, 0.6, 3);
          // Audio
          this.audio.pegHit(peg.type);
          // Green power
          if (peg.type === PEG_TYPES.GREEN) {
            this.guideActive = true;
            this.guideTimer = Config.GUIDE_POWER_DURATION;
            if (window._peggleJourney) window._peggleJourney.check('guide', '🟢', 'Activated <strong>trajectory guide</strong>');
          }
          // Purple milestone
          if (peg.type === PEG_TYPES.PURPLE) {
            if (window._peggleJourney) window._peggleJourney.check('purple', '🟣', 'Hit a <strong>purple bonus</strong> peg!');
          }
          // Check if this is the last active peg
          const activePegs = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.active && !p.hit);
          if (activePegs.length === 0) {
            this._startFever(peg);
            return;
          }
        }
      }
    }

    _checkBounds() {
      if (!this.ball) return;
      const b = this.ball;
      // Side walls — bounce
      if (b.x < b.radius) { b.x = b.radius; b.vx = Math.abs(b.vx); }
      if (b.x > this.W - b.radius) { b.x = this.W - b.radius; b.vx = -Math.abs(b.vx); }
      // Top wall
      if (b.y < b.radius) { b.y = b.radius; b.vy = Math.abs(b.vy); }
      // Bottom — check bucket, then consume
      if (b.y > this.H - 20) {
        // Bucket check
        if (Math.abs(b.x - this.bucket.x) < this.bucket.w / 2 && b.y > this.bucket.y - 10) {
          this.ballsLeft++;
          this.audio.bucketChime();
          if (window._peggleJourney) window._peggleJourney.check('bucket', '🪣', 'Ball caught in the <strong>bucket</strong>!');
        }
        b.active = false;
        // After ball dies, wait then go to aiming or game over
        setTimeout(() => this._afterShot(), 500);
      }
    }

    _afterShot() {
      if (this.state === 'fever' || this.state === 'fever_end') return;
      const activeRemaining = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.active).length;
      if (activeRemaining === 0) {
        this._startFever(null);
        return;
      }
      if (this.ballsLeft <= 0) {
        this._gameOver();
        return;
      }
      this.state = 'aiming';
      this.ball = null;
    }

    _startFever(triggerPeg) {
      this.state = 'fever';
      this.feverTimer = 0;
      this.audio.feverChord();
      this.feverTarget = triggerPeg;
      if (window._peggleJourney) window._peggleJourney.check('fever', '🔥', 'Triggered <strong>Fever Time!</strong>');
    }

    _endFever() {
      this.state = 'fever_end';
      this.feverTimer = 1.5;
      this.camera.reset(this.W, this.H);
      // Massive burst on the last active peg
      for (const peg of this.pegs) {
        if (peg.hit && peg.type === PEG_TYPES.ACTIVE) {
          this.particles.burst(peg.x, peg.y, peg.getColor(), Config.PARTICLE_BURST_FEVER, 300, 1.2, 4);
        }
      }
      // Bonus
      this.score += Config.SCORE_FEVER_BONUS;
      this.levelScore += Config.SCORE_FEVER_BONUS;
      this.audio.levelComplete();
    }

    _showLevelComplete() {
      this.state = 'levelComplete';
      // Cascade remaining pegs
      for (const peg of this.pegs) {
        if (peg.active && !peg.hit) {
          peg.hit = true;
          this.particles.burst(peg.x, peg.y, peg.getColor(), 8, 100, 0.5, 2);
        }
      }
      // High score
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('peggle_high', String(this.highScore));
        if (window._peggleJourney) window._peggleJourney.check('newhigh', '🏆', `New <strong>high score: ${this.highScore}</strong>!`);
      }
      if (window._peggleUI) {
        const breakdown = `Pegs hit: ${this.pegsHitThisShot} | Fever bonus: ${Config.SCORE_FEVER_BONUS}`;
        window._peggleUI.showLevelComplete(this.level, this.score, breakdown);
      }
    }

    _gameOver() {
      this.state = 'gameOver';
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('peggle_high', String(this.highScore));
      }
      if (window._peggleUI) window._peggleUI.showGameOver(this.score, this.highScore);
      if (window._peggleJourney) window._peggleJourney.add('💀', `Run ended at <strong>Level ${this.level}</strong> with score <strong>${this.score}</strong>`);
    }

    // ── Drawing ──
    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);

      // Background
      this.background.draw(ctx, this.time, this.theme);

      ctx.save();
      this.camera.apply(ctx, this.W, this.H);

      // Pegs
      for (const peg of this.pegs) peg.draw(ctx, this.time);

      // Bucket
      if (this.state === 'shooting' || this.state === 'fever') {
        this._drawBucket(ctx);
      }

      // Ball
      if (this.ball && this.ball.active) {
        this.ball.draw(ctx, this.aimColor);
      }

      // Particles
      this.particles.draw(ctx);

      ctx.restore();

      // Fever overlay
      if (this.state === 'fever') {
        ctx.fillStyle = 'rgba(140,60,255,0.08)';
        ctx.fillRect(0, 0, this.W, this.H);
        // Radial glow around ball
        if (this.ball) {
          const grad = ctx.createRadialGradient(this.ball.x, this.ball.y, 0, this.ball.x, this.ball.y, 120);
          grad.addColorStop(0, 'rgba(255,180,80,0.15)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, this.W, this.H);
        }
      }

      // Guide line (trajectory prediction)
      if (this.guideActive && this.state === 'aiming') {
        this._drawGuide(ctx);
      }

      // HUD
      this._drawHUD(ctx);

      // Launcher (on top)
      if (this.state === 'aiming') {
        this.launcher.draw(ctx, this.aimColor, this.time);
      }
    }

    _drawBucket(ctx) {
      const b = this.bucket;
      ctx.fillStyle = 'rgba(66,255,136,0.3)';
      ctx.strokeStyle = 'rgba(66,255,136,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.w/2, b.y);
      ctx.lineTo(b.x - b.w/2 + 10, b.y + b.h);
      ctx.lineTo(b.x + b.w/2 - 10, b.y + b.h);
      ctx.lineTo(b.x + b.w/2, b.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    _drawGuide(ctx) {
      // Simulate trajectory
      let x = this.launcher.x, y = this.launcher.y + 20;
      let vx = Math.cos(this.launcher.angle) * Config.BALL_SPEED;
      let vy = Math.sin(this.launcher.angle) * Config.BALL_SPEED;
      const simDt = 1/60;
      const points = [];
      for (let i = 0; i < 180; i++) {
        vy += Config.GRAVITY * simDt;
        x += vx * simDt;
        y += vy * simDt;
        // Bounce off walls
        if (x < Config.BALL_RADIUS) { x = Config.BALL_RADIUS; vx = Math.abs(vx); }
        if (x > this.W - Config.BALL_RADIUS) { x = this.W - Config.BALL_RADIUS; vx = -Math.abs(vx); }
        if (y < Config.BALL_RADIUS) { y = Config.BALL_RADIUS; vy = Math.abs(vy); }
        // Check peg collisions (simplified)
        for (const peg of this.pegs) {
          if (!peg.active || peg.hit) continue;
          const dx = x - peg.x, dy = y - peg.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < Config.BALL_RADIUS + Config.PEG_HIT_RADIUS) {
            const nx = dx/dist, ny = dy/dist;
            const dot = vx*nx + vy*ny;
            vx -= 2*dot*nx*Config.BOUNCE;
            vy -= 2*dot*ny*Config.BOUNCE;
            x = peg.x + nx * (Config.BALL_RADIUS + Config.PEG_HIT_RADIUS + 1);
            y = peg.y + ny * (Config.BALL_RADIUS + Config.PEG_HIT_RADIUS + 1);
          }
        }
        if (i % 3 === 0) points.push({ x, y });
        if (y > this.H) break;
      }
      // Draw dotted guide
      for (let i = 0; i < points.length; i++) {
        const a = (1 - i/points.length) * 0.5;
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(66,255,136,${a})`;
        ctx.fill();
      }
    }

    _drawHUD(ctx) {
      if (this.state === 'idle' || this.state === 'gameOver' || this.state === 'levelComplete') return;

      ctx.save();
      ctx.resetTransform();

      // Level
      ctx.font = '200 0.8rem sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('LEVEL ' + this.level, this.W / 2, 30);

      // Balls remaining
      ctx.textAlign = 'left';
      ctx.font = '200 0.7rem sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('BALLS', 16, 80);
      for (let i = 0; i < this.ballsLeft; i++) {
        ctx.beginPath();
        ctx.arc(22 + i * 16, 96, 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? this.aimColor : 'rgba(255,255,255,0.3)';
        ctx.fill();
      }

      // Score
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '100 1.4rem sans-serif';
      ctx.fillText(this.score, this.W - 16, 80);

      // Active pegs remaining
      const activeRem = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.active && !p.hit).length;
      ctx.font = '200 0.7rem sans-serif';
      ctx.fillStyle = 'rgba(255,140,66,0.6)';
      ctx.fillText(activeRem + ' remaining', this.W - 16, 98);

      // Guide indicator
      if (this.guideActive) {
        ctx.textAlign = 'center';
        ctx.font = '200 0.65rem sans-serif';
        ctx.fillStyle = 'rgba(66,255,136,0.6)';
        ctx.fillText('GUIDE ACTIVE', this.W / 2, this.H - 12);
      }

      ctx.restore();
    }
  }

  // ═══════════════════════════════════════════════
  //  BOOT
  // ═══════════════════════════════════════════════
  window._peggleGame = new Game();
})();
