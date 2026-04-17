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
      this.pointerX = 0;
      this.pointerY = 0;
      this.shotRequested = false;
      this._aimAngle = Math.PI / 2;
      this._bound = false;
    }
    bind() {
      if (this._bound) return;
      this._bound = true;
      const c = this.canvas;
      c.addEventListener('mousemove', e => {
        this.pointerX = e.clientX;
        this.pointerY = e.clientY;
        this._updateAimFromPointer();
      });
      c.addEventListener('click', () => { this.shotRequested = true; });
      c.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        this.pointerX = t.clientX;
        this.pointerY = t.clientY;
        this._updateAimFromPointer();
      }, { passive: false });
      c.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0];
        this.pointerX = t.clientX;
        this.pointerY = t.clientY;
        this._updateAimFromPointer();
      }, { passive: false });
      c.addEventListener('touchend', e => {
        e.preventDefault();
        this.shotRequested = true;
      }, { passive: false });
      document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') this._aimAngle = Math.max(0.1, this._aimAngle - 0.04);
        if (e.key === 'ArrowRight') this._aimAngle = Math.min(Math.PI - 0.1, this._aimAngle + 0.04);
        if (e.key === ' ') { e.preventDefault(); this.shotRequested = true; }
        this.aimX = Math.cos(this._aimAngle);
        this.aimY = Math.sin(this._aimAngle);
      });
    }
    _updateAimFromPointer() {
      const lx = this.canvas.width / (window.devicePixelRatio || 1) / 2;
      const ly = 70;
      const dx = this.pointerX - lx;
      const dy = this.pointerY - ly;
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
      // Trail positions for particle trails
      this.trail = [];
      this.trailMax = 3;
    }
    update(dt) {
      // Store trail position
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > this.trailMax) this.trail.pop();
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 200 * dt;
      this.life -= dt;
      if (this.life <= 0) this.active = false;
    }
    draw(ctx) {
      const a = Math.max(0, this.life / this.maxLife);
      const sz = this.size * a;
      // Draw trail
      for (let i = 0; i < this.trail.length; i++) {
        const ta = a * (1 - i / this.trail.length) * 0.3;
        const ts = sz * (1 - i / this.trail.length);
        if (ts < 0.3) continue;
        ctx.globalAlpha = ta;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, ts, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
      // Draw particle with glow
      ctx.globalAlpha = a;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = Math.min(sz * 3, 12);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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
            p.trail = [];
          }
          continue;
        }
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * speed;
        const sz = size * (0.3 + Math.random() * 0.7); // Vary sizes 0.3-1.0x
        const p = new Particle(x, y, Math.cos(angle)*spd, Math.sin(angle)*spd, color, life*(0.5+Math.random()*0.5), sz);
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
  //  6. AMBIENT PARTICLES (fireflies / dust motes)
  // ═══════════════════════════════════════════════
  class AmbientParticles {
    constructor(count) {
      this.particles = [];
      this.count = Math.min(count, 25); // Cap for mobile perf
      this._init();
    }
    _init() {
      // Lazy init — positions set on first resize
    }
    resize(w, h) {
      if (this.particles.length === 0) {
        for (let i = 0; i < this.count; i++) {
          this.particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 10 - 5,
            size: 0.5 + Math.random() * 1.5,
            alpha: 0.1 + Math.random() * 0.2,
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.5,
          });
        }
      }
    }
    update(dt, w, h, time) {
      for (const p of this.particles) {
        p.x += p.vx * dt + Math.sin(time * p.speed + p.phase) * 0.3;
        p.y += p.vy * dt;
        // Wrap around
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
      }
    }
    draw(ctx, time) {
      for (const p of this.particles) {
        const flicker = 0.5 + 0.5 * Math.sin(time * p.speed * 2 + p.phase);
        ctx.globalAlpha = p.alpha * flicker;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  7. FLOATING GEOMETRY (ambient background shapes)
  // ═══════════════════════════════════════════════
  class FloatingGeometry {
    constructor(w, h) {
      this.shapes = [];
      const types = ['circle', 'hexagon', 'triangle'];
      for (let i = 0; i < 7; i++) {
        this.shapes.push({
          type: types[i % types.length],
          x: Math.random() * w,
          y: Math.random() * h,
          size: 80 + Math.random() * 200,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.1,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 5,
          alpha: 0.02 + Math.random() * 0.02,
          sides: [0, 6, 3][i % 3], // 0 = circle
        });
      }
    }
    update(dt, w, h) {
      for (const s of this.shapes) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rotation += s.rotSpeed * dt;
        // Wrap
        if (s.x < -s.size * 2) s.x = w + s.size * 2;
        if (s.x > w + s.size * 2) s.x = -s.size * 2;
        if (s.y < -s.size * 2) s.y = h + s.size * 2;
        if (s.y > h + s.size * 2) s.y = -s.size * 2;
      }
    }
    draw(ctx) {
      for (const s of this.shapes) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.globalAlpha = s.alpha;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        if (s.sides === 0) {
          // Circle
          ctx.beginPath();
          ctx.arc(0, 0, s.size, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Polygon
          ctx.beginPath();
          for (let i = 0; i < s.sides; i++) {
            const a = (i / s.sides) * Math.PI * 2;
            const px = Math.cos(a) * s.size;
            const py = Math.sin(a) * s.size;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  8. SACRED GEOMETRY DRAWING HELPERS
  // ═══════════════════════════════════════════════
  const SacredGeo = {
    // Draw a polygon with n sides
    polygon(ctx, x, y, radius, sides, rotation) {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + rotation;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },

    // Draw a star shape
    star(ctx, x, y, outerR, innerR, points, rotation) {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 + rotation - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },

    // Flower of Life — overlapping circles in hex pattern
    flowerOfLife(ctx, cx, cy, radius, layers, rotation, opacity) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.5;
      // Center circle
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Rings of circles
      for (let ring = 1; ring <= layers; ring++) {
        const count = ring * 6;
        const dist = radius * ring;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    // Metatron's Cube — 13 circles + connecting lines
    metatronsCube(ctx, cx, cy, radius, rotation, opacity) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.4;
      // 13 points: center + 2 rings
      const points = [{ x: 0, y: 0 }];
      for (let ring = 1; ring <= 2; ring++) {
        const count = ring === 1 ? 6 : 12;
        const r = radius * ring * 0.5;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (ring === 2 ? Math.PI / 6 : 0);
          points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
      }
      // Draw circles at each point
      const circR = radius * 0.3;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, circR, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Connect all points with lines
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };

  // ═══════════════════════════════════════════════
  //  9. PEG
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
    draw(ctx, time, isFever) {
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
      const pulseSize = 1 + Math.sin(this.pulse) * 0.15;
      const feverPulse = isFever ? (1 + Math.sin(time * 8) * 0.1) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(scale * pulseSize * feverPulse, scale * pulseSize * feverPulse);

      // Outer glow ring (all pegs)
      ctx.shadowColor = glow;
      ctx.shadowBlur = this.type === PEG_TYPES.PURPLE ? 20 : (isFever ? 18 : 12);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw shape based on type
      switch (this.type) {
        case PEG_TYPES.BLUE:
          this._drawBlue(ctx, color, glow, time);
          break;
        case PEG_TYPES.ACTIVE:
          this._drawActive(ctx, color, glow, time);
          break;
        case PEG_TYPES.GREEN:
          this._drawGreen(ctx, color, glow, time);
          break;
        case PEG_TYPES.PURPLE:
          this._drawPurple(ctx, color, glow, time);
          break;
      }

      ctx.restore();
    }

    _drawBlue(ctx, color, glow, time) {
      // Circle with outer ring
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner ring
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Highlight
      ctx.beginPath();
      ctx.arc(-2, -2, this.radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    _drawActive(ctx, color, glow, time) {
      const rot = time * 0.5;
      // Hexagon shape
      ctx.shadowColor = glow;
      ctx.shadowBlur = 16;
      SacredGeo.polygon(ctx, 0, 0, this.radius, 6, rot);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner hexagon (rotated)
      SacredGeo.polygon(ctx, 0, 0, this.radius * 0.5, 6, -rot);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Highlight
      ctx.beginPath();
      ctx.arc(-2, -2, this.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    _drawGreen(ctx, color, glow, time) {
      const rot = time * 0.7;
      // Triangle shape
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
      SacredGeo.polygon(ctx, 0, 0, this.radius, 3, rot);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner triangle (opposite rotation)
      SacredGeo.polygon(ctx, 0, 0, this.radius * 0.45, 3, -rot);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Shimmer trail arc
      if (!this.hit) {
        const shimA = time * 4;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 3, shimA, shimA + 1);
        ctx.strokeStyle = 'rgba(66,255,136,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Highlight
      ctx.beginPath();
      ctx.arc(-1, -2, this.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    _drawPurple(ctx, color, glow, time) {
      const rot = time * 0.4;
      // Star shape (6 pointed)
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20;
      SacredGeo.star(ctx, 0, 0, this.radius, this.radius * 0.5, 6, rot);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner star
      SacredGeo.star(ctx, 0, 0, this.radius * 0.4, this.radius * 0.2, 6, -rot);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Orbiting sparkles
      if (!this.hit) {
        for (let i = 0; i < 5; i++) {
          const a = time * 2.5 + i * (Math.PI * 2 / 5);
          const r = this.radius + 6 + Math.sin(time * 3 + i) * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(200,66,255,0.6)';
          ctx.fill();
        }
      }
      // Highlight
      ctx.beginPath();
      ctx.arc(-1, -2, this.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }
  }

  // ═══════════════════════════════════════════════
  //  10. LEVEL GENERATOR
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
          if (Math.random() < 0.12) continue;
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
      const rings = Math.max(2, Math.floor(maxR / 70 / density + 1));
      for (let ring = 0; ring <= rings; ring++) {
        const r = ring * 60 / density;
        const count = ring === 0 ? 1 : Math.max(6, ring * 6);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (ring % 2) * 0.3;
          pegs.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      }
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

      const activeCount = Math.max(10, Math.floor(pegs.length * Config.ACTIVE_PEG_RATIO));
      const indices = pegs.map((_, i) => i);
      this._shuffle(indices);
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
  //  11. BALL
  // ═══════════════════════════════════════════════
  class Ball {
    constructor(x, y, vx, vy) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.radius = Config.BALL_RADIUS;
      this.active = true;
      this.trail = [];
      this.offscreen = false;
      this.sparkleTimer = 0;
    }
    update(dt) {
      this.vy += Config.GRAVITY * dt;
      this.vx *= Config.FRICTION;
      this.vy *= Config.FRICTION;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > Config.TRAIL_LENGTH) this.trail.pop();
      this.sparkleTimer += dt;
    }
    draw(ctx, color, theme, time, isFever) {
      const glowSize = isFever ? 25 : 15;
      const trailMaxWidth = isFever ? 14 : 10;

      // Trail with hue shift and glow
      if (this.trail.length > 1) {
        for (let i = 1; i < this.trail.length; i++) {
          const a = 1 - i / this.trail.length;
          const width = trailMaxWidth * a;
          if (width < 0.5) continue;
          // Shift color through theme along the trail
          const colorIdx = Math.floor((i / this.trail.length) * 3);
          const trailColor = isFever ? theme.color(colorIdx) : color;
          const rgb = this._colorToRgb(trailColor);
          ctx.beginPath();
          ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
          ctx.lineTo(this.trail[i].x, this.trail[i].y);
          ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${a * 0.7})`;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.shadowColor = trailColor;
          ctx.shadowBlur = isFever ? 12 : 6;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // Ball
      ctx.shadowColor = isFever ? '#fff' : color;
      ctx.shadowBlur = glowSize;
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

      // Rainbow ring during fever
      if (isFever) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
        const hue = (time * 360) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 0.6)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    _colorToRgb(color) {
      // Handle both rgb() and hex formats
      if (color.startsWith('#')) {
        const r = parseInt(color.slice(1,3),16);
        const g = parseInt(color.slice(3,5),16);
        const b = parseInt(color.slice(5,7),16);
        return { r, g, b };
      }
      const m = color.match(/(\d+)/g);
      return m ? { r: +m[0], g: +m[1], b: +m[2] } : { r: 255, g: 255, b: 255 };
    }
  }

  // ═══════════════════════════════════════════════
  //  12. LAUNCHER
  // ═══════════════════════════════════════════════
  class Launcher {
    constructor(canvas) {
      this.x = canvas.width / 2;
      this.y = 70;
      this.angle = Math.PI / 2;
      this.canvas = canvas;
      this.faceSize = 36;
      this._eyeTrackX = 0;
      this._eyeTrackY = 0.4;
    }
    updateAngle(ax, ay, pointerX, pointerY) {
      if (ay < 0.05) return;
      this.angle = Math.atan2(ay, ax);
      if (this.angle < 0.1) this.angle = 0.1;
      if (this.angle > Math.PI - 0.1) this.angle = Math.PI - 0.1;
      const lx = this.x, ly = this.y;
      const dx = pointerX - lx, dy = pointerY - ly;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const maxOff = 4;
      const tx = (dx / dist) * Math.min(maxOff, dist * 0.02);
      const ty = (dy / dist) * Math.min(maxOff, dist * 0.02);
      this._eyeTrackX += (tx - this._eyeTrackX) * 0.15;
      this._eyeTrackY += (ty - this._eyeTrackY) * 0.15;
    }
    draw(ctx, color, time) {
      const x = this.x, y = this.y, s = this.faceSize;
      ctx.save();
      // Outer aura
      const auraR = s * 1.6 + Math.sin(time * 1.5) * 3;
      const auraGrad = ctx.createRadialGradient(x, y, s * 0.5, x, y, auraR);
      auraGrad.addColorStop(0, color.replace(')', ',0.08)').replace('rgb', 'rgba'));
      auraGrad.addColorStop(0.6, color.replace(')', ',0.03)').replace('rgb', 'rgba'));
      auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath(); ctx.arc(x, y, auraR, 0, Math.PI * 2); ctx.fill();
      // Rotating outer ring
      ctx.save(); ctx.translate(x, y); ctx.rotate(time * 0.3);
      ctx.strokeStyle = color.replace(')', ',0.2)').replace('rgb', 'rgba');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.15, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.15, 2, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ',0.4)').replace('rgb', 'rgba'); ctx.fill();
      }
      ctx.restore();
      // Face outline — rounded hexagonal head
      ctx.save(); ctx.translate(x, y);
      ctx.shadowColor = color; ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const r = s * (0.85 + Math.sin(time * 2 + i) * 0.03);
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      const headGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      headGrad.addColorStop(0, color.replace(')', ',0.15)').replace('rgb', 'rgba'));
      headGrad.addColorStop(0.7, color.replace(')', ',0.08)').replace('rgb', 'rgba'));
      headGrad.addColorStop(1, color.replace(')', ',0.03)').replace('rgb', 'rgba'));
      ctx.fillStyle = headGrad; ctx.fill();
      ctx.strokeStyle = color.replace(')', ',0.5)').replace('rgb', 'rgba');
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowBlur = 0;
      // Third eye
      const thirdPulse = 1 + Math.sin(time * 3) * 0.15;
      ctx.beginPath(); ctx.arc(0, -s * 0.35, 4 * thirdPulse, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(0, -s * 0.35, 6 * thirdPulse, 0, Math.PI * 2);
      ctx.strokeStyle = color.replace(')', ',0.3)').replace('rgb', 'rgba');
      ctx.lineWidth = 0.8; ctx.stroke();
      // Eyes
      const eyeSpacing = s * 0.38, eyeY = -s * 0.05, eyeW = s * 0.32, eyeH = s * 0.4, pupilR = s * 0.13;
      for (const side of [-1, 1]) {
        const ex = side * eyeSpacing;
        ctx.beginPath(); ctx.ellipse(ex, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
        const eyeGrad = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeH);
        eyeGrad.addColorStop(0, 'rgba(20,10,40,0.9)');
        eyeGrad.addColorStop(0.8, color.replace(')', ',0.2)').replace('rgb', 'rgba'));
        eyeGrad.addColorStop(1, color.replace(')', ',0.1)').replace('rgb', 'rgba'));
        ctx.fillStyle = eyeGrad; ctx.fill();
        ctx.strokeStyle = color.replace(')', ',0.5)').replace('rgb', 'rgba');
        ctx.lineWidth = 1.2; ctx.stroke();
        const ix = ex + this._eyeTrackX, iy = eyeY + this._eyeTrackY;
        ctx.beginPath(); ctx.arc(ix, iy, pupilR * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ',0.4)').replace('rgb', 'rgba');
        ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(ix, iy, pupilR, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0f'; ctx.fill();
        ctx.beginPath(); ctx.arc(ix - pupilR * 0.3, iy - pupilR * 0.3, pupilR * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
        ctx.beginPath(); ctx.arc(ix, iy, pupilR * 1.8, 0, Math.PI * 2);
        ctx.strokeStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba');
        ctx.lineWidth = 0.6; ctx.stroke();
      }
      // Mouth — serene curve
      ctx.beginPath(); ctx.moveTo(-s * 0.15, s * 0.35);
      ctx.quadraticCurveTo(0, s * 0.42, s * 0.15, s * 0.35);
      ctx.strokeStyle = color.replace(')', ',0.25)').replace('rgb', 'rgba');
      ctx.lineWidth = 1; ctx.stroke();
      // Inner sacred geometry — Star of David
      ctx.strokeStyle = color.replace(')', ',0.06)').replace('rgb', 'rgba');
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2 + time * 0.2;
        i === 0 ? ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6) : ctx.lineTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
      } ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2 + time * 0.2;
        i === 0 ? ctx.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5) : ctx.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
      } ctx.closePath(); ctx.stroke();
      ctx.restore();
      // Nozzle from chin
      this._drawNozzle(ctx, color, time);
      // Aim line
      this._drawAimLine(ctx, color, time);
    }
    _drawNozzle(ctx, color, time) {
      const x = this.x, nozzleStartY = this.y + this.faceSize * 0.5;
      const nozzleLen = 16;
      const nx = x + Math.cos(this.angle) * nozzleLen;
      const ny = nozzleStartY + Math.sin(this.angle) * nozzleLen;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(x, nozzleStartY); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(this.angle);
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(0, -3); ctx.lineTo(-3, 0); ctx.lineTo(0, 3); ctx.closePath();
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      ctx.restore(); ctx.restore();
    }
    _drawAimLine(ctx, color, time) {
      const x = this.x, y = this.y + this.faceSize * 0.5;
      const len = 100, segments = 10;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const px = x + Math.cos(this.angle) * (20 + len * t);
        const py = y + Math.sin(this.angle) * (20 + len * t);
        const a = (1 - t) * 0.3;
        const pulse = 1 + Math.sin(time * 4 - i * 0.5) * 0.3;
        ctx.save(); ctx.translate(px, py); ctx.rotate(time * 2 + i);
        ctx.fillStyle = color.replace(')', `,${a})`).replace('rgb', 'rgba');
        if (i % 2 === 0) {
          const sz = 2 * pulse;
          ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz, 0);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, 1.5 * pulse, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  13. CAMERA
  // ═══════════════════════════════════════════════
  class Camera {
    constructor(w, h) {
      this.x = w / 2; this.y = h / 2;
      this.zoom = 1; this.targetZoom = 1;
      this.targetX = w / 2; this.targetY = h / 2;
      // Screen shake
      this.shakeX = 0; this.shakeY = 0;
      this.shakeIntensity = 0;
    }
    setZoom(z) { this.targetZoom = z; }
    follow(x, y) { this.targetX = x; this.targetY = y; }
    reset(w, h) {
      this.targetZoom = 1; this.targetX = w/2; this.targetY = h/2;
      this.shakeIntensity = 0;
    }
    shake(intensity) { this.shakeIntensity = intensity; }
    update(dt) {
      this.zoom += (this.targetZoom - this.zoom) * 3 * dt;
      this.x += (this.targetX - this.x) * 3 * dt;
      this.y += (this.targetY - this.y) * 3 * dt;
      // Decay shake
      if (this.shakeIntensity > 0.1) {
        this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
        this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
        this.shakeIntensity *= 0.95;
      } else {
        this.shakeX = this.shakeY = 0;
        this.shakeIntensity = 0;
      }
    }
    apply(ctx, w, h) {
      ctx.translate(w/2 + this.shakeX, h/2 + this.shakeY);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }
  }

  // ═══════════════════════════════════════════════
  //  14. BACKGROUND
  // ═══════════════════════════════════════════════
  class Background {
    constructor(w, h) {
      this.w = w; this.h = h; this.progress = 0;
      // Parallax star layers
      this.stars = [];
      for (let layer = 0; layer < 3; layer++) {
        const stars = [];
        const count = 40 + layer * 20;
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            size: 0.3 + Math.random() * (0.3 + layer * 0.3),
            brightness: 0.1 + layer * 0.1 + Math.random() * 0.15,
            twinklePhase: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.5 + Math.random() * 2,
          });
        }
        this.stars.push({ points: stars, parallax: (layer + 1) * 0.5 });
      }
    }
    setProgress(p) { this.progress = p; }
    draw(ctx, time, theme) {
      // Gradient that shifts with progress
      const r = Math.floor(10 + this.progress * 15);
      const g = Math.floor(6 + this.progress * 5);
      const b = Math.floor(15 + this.progress * 20);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, this.w, this.h);

      // Faint grid (even fainter)
      ctx.strokeStyle = `rgba(140,100,255,${0.015 + this.progress * 0.01})`;
      ctx.lineWidth = 0.5;
      const spacing = 80;
      for (let x = 0; x < this.w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); ctx.stroke();
      }
      for (let y = 0; y < this.h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
      }

      // Parallax star layers
      const shiftX = this.progress * 30; // Shift opposite to progress
      for (const layer of this.stars) {
        for (const star of layer.points) {
          const sx = ((star.x - shiftX * layer.parallax) % this.w + this.w) % this.w;
          const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
          ctx.globalAlpha = star.brightness * twinkle;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(sx, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Sacred geometry — Flower of Life (layer 1, slow rotation)
      const geoSize = Math.min(this.w, this.h) * 0.4;
      SacredGeo.flowerOfLife(ctx, this.w / 2, this.h / 2, geoSize * 0.2, 3, time * 0.02, 0.03 + this.progress * 0.02);

      // Sacred geometry — Metatron's Cube (layer 2, different speed)
      SacredGeo.metatronsCube(ctx, this.w / 2, this.h / 2, geoSize, time * -0.015, 0.025 + this.progress * 0.015);

      // Second Flower of Life offset (layer 3)
      SacredGeo.flowerOfLife(ctx, this.w * 0.35, this.h * 0.45, geoSize * 0.15, 2, time * 0.03, 0.02);
      SacredGeo.flowerOfLife(ctx, this.w * 0.65, this.h * 0.55, geoSize * 0.12, 2, -time * 0.025, 0.02);

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
  //  15. AUDIO
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
  //  16. GAME
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
      this.ambientParticles = new AmbientParticles(25);
      this.floatingGeo = new FloatingGeometry(this.canvas.width, this.canvas.height);

      this.state = 'idle';
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

      // Cascade state for level complete
      this.cascadeActive = false;
      this.cascadeTimer = 0;
      this.cascadeCenter = { x: 0, y: 0 };

      this._resize();
      window.addEventListener('resize', () => this._resize());
      this.input.bind();

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
      this.ambientParticles.resize(this.W, this.H);
      this.floatingGeo = new FloatingGeometry(this.W, this.H);
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
      this.cascadeActive = false;
      this.aimColor = this.theme.randomColor();
      if (window._peggleJourney) window._peggleJourney.check('level' + this.level, '🌀', `Entered <strong>Level ${this.level}</strong> — ${Config.LEVEL_TYPES[(this.level-1) % Config.LEVEL_TYPES.length]}`);
    }

    setMuted(m) { this.audio.muted = m; }

    _loop(timestamp) {
      if (!this.lastTime) this.lastTime = timestamp;
      let dt = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;
      dt = Math.min(dt, 0.05);
      this.time += dt;

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
      if (this.state === 'aiming') {
        this.launcher.updateAngle(this.input.aimX, this.input.aimY, this.input.pointerX, this.input.pointerY);
        if (this.input.shotRequested) {
          this.input.shotRequested = false;
          this._shoot();
        }
      }
      if (this.state === 'idle') {
        this.input.shotRequested = false;
      }

      if (this.guideActive) {
        this.guideTimer -= realDt;
        if (this.guideTimer <= 0) this.guideActive = false;
      }

      if (this.state === 'shooting' || this.state === 'fever') {
        this.bucket.x += this.bucket.dir * Config.BUCKET_SPEED * dt;
        if (this.bucket.x > this.W - this.bucket.w/2) this.bucket.dir = -1;
        if (this.bucket.x < this.bucket.w/2) this.bucket.dir = 1;
      }

      if (this.ball && this.ball.active && (this.state === 'shooting' || this.state === 'fever')) {
        this.ball.update(dt);
        this._checkCollisions();
        this._checkBounds();

        if (this.state === 'fever' && this.ball) {
          this.camera.follow(this.ball.x, this.ball.y);
          this.camera.setZoom(Config.FEVER_ZOOM);
        }
      }

      // Ball sparkle particles
      if (this.ball && this.ball.active && this.ball.sparkleTimer > 0.05) {
        this.ball.sparkleTimer = 0;
        const isFever = this.state === 'fever';
        const sparkColor = isFever ? this.theme.randomColor() : this.aimColor;
        this.particles.burst(this.ball.x, this.ball.y, sparkColor, 1, 30, 0.3, 1.5);
      }

      for (const peg of this.pegs) peg.update(dt);
      this.particles.update(dt);
      this.camera.update(dt);

      // Ambient systems
      this.ambientParticles.update(dt, this.W, this.H, this.time);
      this.floatingGeo.update(dt, this.W, this.H);

      const activeTotal = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE).length;
      const activeHit = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.hit).length;
      this.background.setProgress(activeTotal > 0 ? activeHit / activeTotal : 0);

      // Cascade update for level complete
      if (this.cascadeActive) {
        this.cascadeTimer += realDt;
        const remaining = this.pegs.filter(p => p.active && !p.hit);
        for (const peg of remaining) {
          const dx = peg.x - this.cascadeCenter.x;
          const dy = peg.y - this.cascadeCenter.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const delay = dist / 500; // Stagger based on distance
          if (this.cascadeTimer >= delay && !peg.hit) {
            peg.hit = true;
            this.particles.burst(peg.x, peg.y, peg.getColor(), 8, 100, 0.5, 2);
          }
        }
      }

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
      this.ball = new Ball(this.launcher.x, this.launcher.y + this.launcher.faceSize * 0.5 + 16, vx, vy);
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
          const nx = dx / dist, ny = dy / dist;
          const overlap = minDist - dist;
          this.ball.x += nx * overlap;
          this.ball.y += ny * overlap;
          const dot = this.ball.vx * nx + this.ball.vy * ny;
          this.ball.vx -= 2 * dot * nx * Config.BOUNCE;
          this.ball.vy -= 2 * dot * ny * Config.BOUNCE;
          peg.hit = true;
          this.pegsHitThisShot++;
          this.pegHitsThisShot.push(peg);
          this.score += peg.score;
          this.levelScore += peg.score;
          const burstCount = peg.type === PEG_TYPES.ACTIVE ? Config.PARTICLE_BURST_ACTIVE : Config.PARTICLE_BURST_PEG;
          const isFever = this.state === 'fever';
          if (isFever) {
            // Multi-coloured fever particles
            for (let i = 0; i < burstCount; i++) {
              const c = this.theme.color(Math.floor(Math.random() * this.theme.colors.length));
              this.particles.burst(peg.x, peg.y, c, 1, 200, 1.0, 3 + Math.random() * 2);
            }
          } else {
            // Normal burst: peg colour + white sparkles
            this.particles.burst(peg.x, peg.y, peg.getColor(), burstCount, 150, 0.6, 3);
            this.particles.burst(peg.x, peg.y, '#ffffff', 4, 80, 0.4, 1.5); // White sparkles
          }
          this.audio.pegHit(peg.type);
          if (peg.type === PEG_TYPES.GREEN) {
            this.guideActive = true;
            this.guideTimer = Config.GUIDE_POWER_DURATION;
            if (window._peggleJourney) window._peggleJourney.check('guide', '🟢', 'Activated <strong>trajectory guide</strong>');
          }
          if (peg.type === PEG_TYPES.PURPLE) {
            if (window._peggleJourney) window._peggleJourney.check('purple', '🟣', 'Hit a <strong>purple bonus</strong> peg!');
          }
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
      if (b.x < b.radius) { b.x = b.radius; b.vx = Math.abs(b.vx); }
      if (b.x > this.W - b.radius) { b.x = this.W - b.radius; b.vx = -Math.abs(b.vx); }
      if (b.y < b.radius) { b.y = b.radius; b.vy = Math.abs(b.vy); }
      if (b.y > this.H - 20) {
        if (Math.abs(b.x - this.bucket.x) < this.bucket.w / 2 && b.y > this.bucket.y - 10) {
          this.ballsLeft++;
          this.audio.bucketChime();
          if (window._peggleJourney) window._peggleJourney.check('bucket', '🪣', 'Ball caught in the <strong>bucket</strong>!');
        }
        b.active = false;
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
      this.camera.shake(3);
      if (window._peggleJourney) window._peggleJourney.check('fever', '🔥', 'Triggered <strong>Fever Time!</strong>');
    }

    _endFever() {
      this.state = 'fever_end';
      this.feverTimer = 1.5;
      this.camera.reset(this.W, this.H);
      for (const peg of this.pegs) {
        if (peg.hit && peg.type === PEG_TYPES.ACTIVE) {
          this.particles.burst(peg.x, peg.y, peg.getColor(), Config.PARTICLE_BURST_FEVER, 300, 1.2, 4);
        }
      }
      this.score += Config.SCORE_FEVER_BONUS;
      this.levelScore += Config.SCORE_FEVER_BONUS;
      this.audio.levelComplete();
    }

    _showLevelComplete() {
      this.state = 'levelComplete';
      // Wave cascade from center outward
      this.cascadeActive = true;
      this.cascadeTimer = 0;
      this.cascadeCenter = { x: this.W / 2, y: this.H / 2 };

      // Brief white flash
      this._flashAlpha = 0.3;
      this._flashTimer = 0.1;

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
      const isFever = this.state === 'fever';

      // Background
      this.background.draw(ctx, this.time, this.theme);

      // Floating geometry (behind everything)
      this.floatingGeo.draw(ctx);

      // Ambient particles
      this.ambientParticles.draw(ctx, this.time);

      ctx.save();
      this.camera.apply(ctx, this.W, this.H);

      // Pegs — pass fever state for enhanced glow
      for (const peg of this.pegs) peg.draw(ctx, this.time, isFever);

      // Bucket
      if (this.state === 'shooting' || this.state === 'fever') {
        this._drawBucket(ctx);
      }

      // Ball
      if (this.ball && this.ball.active) {
        this.ball.draw(ctx, this.aimColor, this.theme, this.time, isFever);
      }

      // Particles
      this.particles.draw(ctx);

      ctx.restore();

      // Fever overlay
      if (isFever) {
        // Background flash with theme colour
        const flashA = 0.06 + Math.sin(this.time * 6) * 0.03;
        ctx.fillStyle = this.theme.hexToRGBA(this.theme.color(0), flashA);
        ctx.fillRect(0, 0, this.W, this.H);

        // Radial light rays from last hit peg
        if (this.feverTarget) {
          ctx.save();
          ctx.translate(this.feverTarget.x, this.feverTarget.y);
          const rayCount = 12;
          for (let i = 0; i < rayCount; i++) {
            const a = (i / rayCount) * Math.PI * 2 + this.time * 0.5;
            const len = 200 + Math.sin(this.time * 3 + i) * 50;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            ctx.strokeStyle = this.theme.hexToRGBA(this.theme.color(i % this.theme.colors.length), 0.08);
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.restore();
        }

        // Radial glow around ball
        if (this.ball) {
          const grad = ctx.createRadialGradient(this.ball.x, this.ball.y, 0, this.ball.x, this.ball.y, 120);
          grad.addColorStop(0, 'rgba(255,180,80,0.15)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, this.W, this.H);
        }

        // Vignette glow
        const vigGrad = ctx.createRadialGradient(this.W/2, this.H/2, this.W * 0.3, this.W/2, this.H/2, this.W * 0.7);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, this.theme.hexToRGBA(this.theme.color(0), 0.12));
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, this.W, this.H);
      }

      // White flash (level complete cascade start)
      if (this._flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this._flashAlpha})`;
        ctx.fillRect(0, 0, this.W, this.H);
        this._flashAlpha -= 0.03;
        if (this._flashAlpha < 0) this._flashAlpha = 0;
      }

      // Guide line
      if (this.guideActive && this.state === 'aiming') {
        this._drawGuide(ctx);
      }

      // HUD
      this._drawHUD(ctx);

      // Launcher
      if (this.state === 'aiming') {
        this.launcher.draw(ctx, this.aimColor, this.time);
      }
    }

    _drawBucket(ctx) {
      const b = this.bucket;
      const pulse = 1 + Math.sin(this.time * 4) * 0.1;

      // Glowing crescent/arc shape
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);

      // Arc shape
      ctx.beginPath();
      ctx.arc(0, 0, b.w / 2, 0, Math.PI);
      ctx.strokeStyle = 'rgba(66,255,136,0.7)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(66,255,136,0.5)';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner glow
      ctx.beginPath();
      ctx.arc(0, 0, b.w / 2 - 5, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = 'rgba(66,255,136,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // Sparkle particles around bucket
      if (Math.random() < 0.3) {
        const sx = b.x + (Math.random() - 0.5) * b.w;
        const sy = b.y + Math.random() * 10 - 5;
        this.particles.burst(sx, sy, 'rgba(66,255,136,0.8)', 1, 20, 0.4, 1);
      }
    }

    _drawGuide(ctx) {
      let x = this.launcher.x, y = this.launcher.y + this.launcher.faceSize * 0.5 + 16;
      let vx = Math.cos(this.launcher.angle) * Config.BALL_SPEED;
      let vy = Math.sin(this.launcher.angle) * Config.BALL_SPEED;
      const simDt = 1/60;
      const points = [];
      for (let i = 0; i < 180; i++) {
        vy += Config.GRAVITY * simDt;
        x += vx * simDt;
        y += vy * simDt;
        if (x < Config.BALL_RADIUS) { x = Config.BALL_RADIUS; vx = Math.abs(vx); }
        if (x > this.W - Config.BALL_RADIUS) { x = this.W - Config.BALL_RADIUS; vx = -Math.abs(vx); }
        if (y < Config.BALL_RADIUS) { y = Config.BALL_RADIUS; vy = Math.abs(vy); }
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

      ctx.font = '200 0.8rem sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('LEVEL ' + this.level, this.W / 2, 30);

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

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '100 1.4rem sans-serif';
      ctx.fillText(this.score, this.W - 16, 80);

      const activeRem = this.pegs.filter(p => p.type === PEG_TYPES.ACTIVE && p.active && !p.hit).length;
      ctx.font = '200 0.7rem sans-serif';
      ctx.fillStyle = 'rgba(255,140,66,0.6)';
      ctx.fillText(activeRem + ' remaining', this.W - 16, 98);

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
