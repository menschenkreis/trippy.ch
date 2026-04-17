/* trippy-slither.js — Trippy Slither game engine */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════
  //  1. CONFIG
  // ═══════════════════════════════════════════════
  const Config = {
    SNAKE_BASE_SPEED: 180,    // px/s
    SNAKE_MAX_SPEED: 340,
    SNAKE_TURN_SPEED: 3.2,    // rad/s
    SNAKE_RADIUS: 8,
    TRAIL_INITIAL: 40,
    TRAIL_GROW: 8,            // segments per orb
    TRAIL_MAX: 500,
    TRAIL_MIN_DIST: 4,        // px between trail points
    ORB_COUNT: 25,
    ORB_RADIUS: 6,
    ORB_SPAWN_MIN: 300,
    ORB_SPAWN_MAX: 600,
    PARTICLE_BURST: 20,
    PARTICLE_LIFE: 0.8,
    CAMERA_LERP: 0.08,
    SELF_COLLISION_SKIP: 60,  // skip this many trail segments from head
    SPEED_INC_PER_ORB: 2,
    BG_STAR_LAYERS: 3,
    BG_STARS_PER_LAYER: 80,
    GRID_SPACING: 80,
    GRID_OPACITY: 0.04,
  };

  // ═══════════════════════════════════════════════
  //  2. THEME MANAGER
  // ═══════════════════════════════════════════════
  class ThemeManager {
    constructor() {
      this._cache = {};
      this.refresh();
    }
    _var(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    refresh() {
      const vars = ['--purple','--teal','--pink','--violet','--blue','--cyan','--magenta','--lime','--orange'];
      this.colors = vars.map(v => this._var(v)).filter(Boolean);
      this.bg = this._var('--bg') || '#0a0a0f';
      if (this.colors.length === 0) this.colors = ['#8c64ff','#64ffda','#ff64a0','#b464ff','#6494ff','#64ffe0','#ff64d0','#a0ff64','#ffa064'];
    }
    color(i) { return this.colors[i % this.colors.length]; }
    randomColor() { return this.color(Math.floor(Math.random() * this.colors.length)); }
    headColor() { return this.color(0); }
    trailGradient(t) {
      // t: 0 = head, 1 = tail
      const i = Math.floor(t * (this.colors.length - 1));
      return this.color(i);
    }
    hexToRGBA(hex, a) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
  }

  // ═══════════════════════════════════════════════
  //  3. INPUT MANAGER
  // ═══════════════════════════════════════════════
  class InputManager {
    constructor() {
      this.left = false;
      this.right = false;
      this.tiltGamma = 0;
      this.tiltEnabled = false;
      this.touchAngle = null;
      this.touchStart = null;
      this._bind();
    }
    _bind() {
      // Keyboard
      const kd = e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.right = true;
      };
      const ku = e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.right = false;
      };
      document.addEventListener('keydown', kd);
      document.addEventListener('keyup', ku);

      // Mobile steer buttons
      const sl = document.getElementById('steer-left');
      const sr = document.getElementById('steer-right');
      if (sl) {
        sl.addEventListener('touchstart', e => { e.preventDefault(); this.left = true; }, { passive: false });
        sl.addEventListener('touchend', () => this.left = false);
        sl.addEventListener('mousedown', () => this.left = true);
        sl.addEventListener('mouseup', () => this.left = false);
      }
      if (sr) {
        sr.addEventListener('touchstart', e => { e.preventDefault(); this.right = true; }, { passive: false });
        sr.addEventListener('touchend', () => this.right = false);
        sr.addEventListener('mousedown', () => this.right = true);
        sr.addEventListener('mouseup', () => this.right = false);
      }

      // Touch drag
      const canvas = document.getElementById('c');
      canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        this.touchStart = { x: t.clientX, y: t.clientY };
        this.touchAngle = null;
      }, { passive: false });
      canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (!this.touchStart) return;
        const t = e.touches[0];
        const dx = t.clientX - this.touchStart.x;
        if (Math.abs(dx) > 10) {
          this.touchAngle = dx > 0 ? 1 : -1;
        }
      }, { passive: false });
      canvas.addEventListener('touchend', () => {
        this.touchStart = null;
        this.touchAngle = null;
      });

      // Device orientation (tilt)
      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', e => {
          if (this.tiltEnabled && e.gamma !== null) {
            this.tiltGamma = Math.max(-1, Math.min(1, e.gamma / 30));
          } else {
            this.tiltGamma = 0;
          }
        });
      }
    }
    getSteer() {
      let s = 0;
      if (this.left) s -= 1;
      if (this.right) s += 1;
      if (this.touchAngle !== null) s += this.touchAngle;
      if (this.tiltEnabled) s += this.tiltGamma;
      return Math.max(-1, Math.min(1, s));
    }
    setTilt(on) {
      this.tiltEnabled = on;
      if (!on) this.tiltGamma = 0;
      // Request permission on iOS 13+
      if (on && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => {
          if (r !== 'granted') this.tiltEnabled = false;
        }).catch(() => { this.tiltEnabled = false; });
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  4. CAMERA
  // ═══════════════════════════════════════════════
  class Camera {
    constructor() {
      this.x = 0; this.y = 0;
      this.tx = 0; this.ty = 0;
    }
    follow(x, y) { this.tx = x; this.ty = y; }
    update(dt) {
      const l = 1 - Math.pow(1 - Config.CAMERA_LERP, dt * 60);
      this.x += (this.tx - this.x) * l;
      this.y += (this.ty - this.y) * l;
    }
    worldToScreen(wx, wy) {
      const canvas = document.getElementById('c');
      return { x: wx - this.x + canvas.width / 2, y: wy - this.y + canvas.height / 2 };
    }
  }

  // ═══════════════════════════════════════════════
  //  5. PARTICLE
  // ═══════════════════════════════════════════════
  class Particle {
    constructor() { this.alive = false; }
    spawn(x, y, color) {
      this.alive = true;
      this.x = x; this.y = y;
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 120;
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
      this.life = Config.PARTICLE_LIFE * (0.6 + Math.random() * 0.4);
      this.maxLife = this.life;
      this.color = color;
      this.size = 2 + Math.random() * 3;
    }
    update(dt) {
      if (!this.alive) return;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.97; this.vy *= 0.97;
      this.life -= dt;
      if (this.life <= 0) this.alive = false;
    }
  }

  // ═══════════════════════════════════════════════
  //  6. PARTICLE SYSTEM
  // ═══════════════════════════════════════════════
  class ParticleSystem {
    constructor(poolSize) {
      this.particles = [];
      for (let i = 0; i < poolSize; i++) this.particles.push(new Particle());
    }
    burst(x, y, color, count) {
      let spawned = 0;
      for (const p of this.particles) {
        if (!p.alive) { p.spawn(x, y, color); if (++spawned >= count) break; }
      }
    }
    update(dt) { for (const p of this.particles) p.update(dt); }
    draw(ctx, cam) {
      for (const p of this.particles) {
        if (!p.alive) continue;
        const s = cam.worldToScreen(p.x, p.y);
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // ═══════════════════════════════════════════════
  //  7. ORB
  // ═══════════════════════════════════════════════
  class Orb {
    constructor(x, y, color) {
      this.x = x; this.y = y;
      this.color = color;
      this.radius = Config.ORB_RADIUS;
      this.phase = Math.random() * Math.PI * 2;
      this.alive = true;
    }
    update(dt) { this.phase += dt * 3; }
    draw(ctx, cam) {
      if (!this.alive) return;
      const s = cam.worldToScreen(this.x, this.y);
      const pulse = 1 + Math.sin(this.phase) * 0.2;
      const r = this.radius * pulse;
      // Outer glow
      ctx.globalAlpha = 0.15 + Math.sin(this.phase) * 0.05;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Inner
      ctx.globalAlpha = 0.8;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  8. ORB MANAGER
  // ═══════════════════════════════════════════════
  class OrbManager {
    constructor(theme) {
      this.orbs = [];
      this.theme = theme;
    }
    ensure(snakeX, snakeY) {
      // Remove dead orbs
      this.orbs = this.orbs.filter(o => o.alive);
      // Spawn new ones
      while (this.orbs.length < Config.ORB_COUNT) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Config.ORB_SPAWN_MIN + Math.random() * (Config.ORB_SPAWN_MAX - Config.ORB_SPAWN_MIN);
        const x = snakeX + Math.cos(angle) * dist;
        const y = snakeY + Math.sin(angle) * dist;
        this.orbs.push(new Orb(x, y, this.theme.randomColor()));
      }
    }
    checkCollision(snakeX, snakeY, snakeRadius) {
      for (const o of this.orbs) {
        if (!o.alive) continue;
        const dx = snakeX - o.x, dy = snakeY - o.y;
        if (dx * dx + dy * dy < (snakeRadius + o.radius * 2) ** 2) {
          o.alive = false;
          return o;
        }
      }
      return null;
    }
    update(dt) { for (const o of this.orbs) o.update(dt); }
    draw(ctx, cam) { for (const o of this.orbs) o.draw(ctx, cam); }
  }

  // ═══════════════════════════════════════════════
  //  9. TRAIL SEGMENT
  // ═══════════════════════════════════════════════
  // Trail is just an array of {x, y} — no class needed

  // ═══════════════════════════════════════════════
  //  10. SNAKE
  // ═══════════════════════════════════════════════
  class Snake {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = 0; this.y = 0;
      this.angle = -Math.PI / 2;
      this.speed = Config.SNAKE_BASE_SPEED;
      this.trail = [];
      this.targetTrailLen = Config.TRAIL_INITIAL;
      this.alive = true;
      this.dissolveTimer = 0;
      this.headPhase = 0;
      // Seed initial trail
      for (let i = 0; i < Config.TRAIL_INITIAL; i++) {
        this.trail.push({ x: this.x, y: this.y + i * Config.TRAIL_MIN_DIST });
      }
    }
    update(dt, steer, growAmount) {
      if (!this.alive) {
        this.dissolveTimer += dt;
        return;
      }
      this.headPhase += dt * 4;
      // Steer
      this.angle += steer * Config.SNAKE_TURN_SPEED * dt;
      // Move
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
      // Trail
      const last = this.trail[this.trail.length - 1];
      const dx = this.x - last.x, dy = this.y - last.y;
      if (dx * dx + dy * dy >= Config.TRAIL_MIN_DIST * Config.TRAIL_MIN_DIST) {
        this.trail.push({ x: this.x, y: this.y });
      }
      // Grow
      if (growAmount > 0) this.targetTrailLen += growAmount;
      // Trim
      while (this.trail.length > this.targetTrailLen) this.trail.shift();
      if (this.trail.length > Config.TRAIL_MAX) {
        this.trail.splice(0, this.trail.length - Config.TRAIL_MAX);
      }
    }
    checkSelfCollision() {
      if (this.trail.length < Config.SELF_COLLISION_SKIP + 10) return false;
      const r2 = Config.SNAKE_RADIUS * Config.SNAKE_RADIUS * 1.5;
      for (let i = 0; i < this.trail.length - Config.SELF_COLLISION_SKIP; i++) {
        const s = this.trail[i];
        const dx = this.x - s.x, dy = this.y - s.y;
        if (dx * dx + dy * dy < r2) return true;
      }
      return false;
    }
    draw(ctx, cam, theme) {
      const len = this.trail.length;
      if (len < 2) return;
      const dissolveAlpha = this.alive ? 1 : Math.max(0, 1 - this.dissolveTimer / 1.5);

      // Draw trail segments
      for (let i = 1; i < len; i++) {
        const t = i / len; // 0=tail, 1=head
        const a = cam.worldToScreen(this.trail[i - 1].x, this.trail[i - 1].y);
        const b = cam.worldToScreen(this.trail[i].x, this.trail[i].y);
        const width = 2 + t * 8;
        const alpha = t * 0.7 * dissolveAlpha;
        const color = theme.trailGradient(t);

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = width * 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Draw head
      const hs = cam.worldToScreen(this.x, this.y);
      const pulse = 1 + Math.sin(this.headPhase) * 0.15;
      const hr = Config.SNAKE_RADIUS * pulse;
      const headColor = theme.headColor();

      // Glow
      ctx.globalAlpha = 0.3 * dissolveAlpha;
      ctx.fillStyle = headColor;
      ctx.shadowColor = headColor;
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, hr * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Head shape (hexagon)
      ctx.globalAlpha = 0.9 * dissolveAlpha;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = this.angle + (Math.PI / 3) * i;
        const px = hs.x + Math.cos(a) * hr;
        const py = hs.y + Math.sin(a) * hr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = headColor;
      ctx.fill();

      // Core
      ctx.globalAlpha = 1 * dissolveAlpha;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, hr * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  11. BACKGROUND
  // ═══════════════════════════════════════════════
  class Background {
    constructor(theme) {
      this.theme = theme;
      this.layers = [];
      this.init();
    }
    init() {
      const canvas = document.getElementById('c');
      for (let l = 0; l < Config.BG_STAR_LAYERS; l++) {
        const stars = [];
        for (let i = 0; i < Config.BG_STARS_PER_LAYER; i++) {
          stars.push({
            x: (Math.random() - 0.5) * 4000,
            y: (Math.random() - 0.5) * 4000,
            size: 0.5 + Math.random() * 1.5,
            alpha: 0.1 + Math.random() * 0.3,
          });
        }
        this.layers.push({ stars, parallax: 0.1 + l * 0.15 });
      }
    }
    draw(ctx, cam) {
      const cw = document.getElementById('c').width;
      const ch = document.getElementById('c').height;

      // Subtle grid
      ctx.strokeStyle = `rgba(140,100,255,${Config.GRID_OPACITY})`;
      ctx.lineWidth = 0.5;
      const gs = Config.GRID_SPACING;
      const offX = (-cam.x % gs + gs) % gs;
      const offY = (-cam.y % gs + gs) % gs;
      for (let x = offX - gs; x < cw + gs; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      }
      for (let y = offY - gs; y < ch + gs; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
      }

      // Stars
      for (const layer of this.layers) {
        const px = cam.x * layer.parallax;
        const py = cam.y * layer.parallax;
        for (const s of layer.stars) {
          const sx = s.x - px + cw / 2;
          const sy = s.y - py + ch / 2;
          // Wrap
          const wx = ((sx % cw) + cw) % cw;
          const wy = ((sy % ch) + ch) % ch;
          ctx.globalAlpha = s.alpha;
          ctx.fillStyle = this.theme.color(0);
          ctx.beginPath();
          ctx.arc(wx, wy, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════
  //  12. AUDIO (simple Web Audio tones)
  // ═══════════════════════════════════════════════
  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = true;
    }
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
    }
    playCollect(score) {
      if (this.muted || !this.ctx) return;
      const baseFreq = 440 + (score % 12) * 40;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = baseFreq;
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
    }
    playDeath() {
      if (this.muted || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.8);
    }
  }

  // ═══════════════════════════════════════════════
  //  12. GAME
  // ═══════════════════════════════════════════════
  class Game {
    constructor() {
      this.canvas = document.getElementById('c');
      this.ctx = this.canvas.getContext('2d');
      this.theme = new ThemeManager();
      this.input = new InputManager();
      this.camera = new Camera();
      this.particles = new ParticleSystem(500);
      this.snake = new Snake();
      this.bg = new Background(this.theme);
      this.orbs = new OrbManager(this.theme);
      this.audio = new Audio();
      this.score = 0;
      this.highScore = parseInt(localStorage.getItem('trippy-slither-high') || '0', 10);
      this.running = false;
      this.started = false;
      this.lastTime = 0;
      this._resize();
      window.addEventListener('resize', () => this._resize());
      // Expose to content script
      window._slitherGame = this;
    }
    _resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
    start() {
      if (this.started) return;
      this.started = true;
      this.audio.init();
      this.snake.reset();
      this.orbs = new OrbManager(this.theme);
      this.score = 0;
      this.running = true;
      this.lastTime = performance.now();
      if (window._slitherJourney) window._slitherJourney.reset();
      if (window._slitherUI) window._slitherUI.hideGameOver();
      this._loop();
    }
    restart() {
      this.snake.reset();
      this.orbs = new OrbManager(this.theme);
      this.score = 0;
      this.running = true;
      this.lastTime = performance.now();
      if (window._slitherJourney) window._slitherJourney.reset();
      if (window._slitherUI) window._slitherUI.hideGameOver();
      this._loop();
    }
    setMuted(m) { this.audio.muted = m; }
    setTilt(t) { this.input.setTilt(t); }
    _checkMilestones() {
      const j = window._slitherJourney;
      if (!j) return;
      j.check('first', '✨', 'First Light — collected your first orb');
      j.check('10', '🌟', '<strong>10 orbs</strong> — the void brightens');
      j.check('25', '💫', '<strong>25 orbs</strong> — becoming luminous');
      j.check('50', '🔮', '<strong>50 orbs</strong> — one with the void');
      j.check('trail50', '🐍', 'Trail length: <strong>50+</strong>');
      j.check('trail100', '🌊', 'Trail length: <strong>100+</strong> — river of light');
      j.check('trail200', '🌀', 'Trail length: <strong>200+</strong> — cosmic serpent');
      j.check('trail300', '🌌', 'Trail length: <strong>300+</strong> — void weaver');
      if (this.snake.trail.length >= 50) j.check('trail50', '🐍', 'Trail length: <strong>50+</strong>');
      if (this.snake.trail.length >= 100) j.check('trail100', '🌊', 'Trail length: <strong>100+</strong> — river of light');
      if (this.snake.trail.length >= 200) j.check('trail200', '🌀', 'Trail length: <strong>200+</strong> — cosmic serpent');
      if (this.snake.trail.length >= 300) j.check('trail300', '🌌', 'Trail length: <strong>300+</strong> — void weaver');
    }
    _die() {
      this.running = false;
      this.snake.alive = false;
      this.audio.playDeath();
      // Particle burst at head
      this.particles.burst(this.snake.x, this.snake.y, this.theme.headColor(), 30);
      // Update high score
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('trippy-slither-high', String(this.highScore));
      }
      // Show game over after dissolve
      setTimeout(() => {
        if (window._slitherUI) window._slitherUI.showGameOver(this.score, this.highScore);
      }, 1500);
      // Keep rendering dissolve
      this._renderDissolve();
    }
    _renderDissolve() {
      if (this.snake.dissolveTimer > 2) return;
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.particles.update(dt);
      this.snake.update(dt, 0, 0);
      this._draw();
      requestAnimationFrame(() => this._renderDissolve());
    }
    _loop() {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;

      // Refresh theme colors
      this.theme.refresh();

      // Input
      const steer = this.input.getSteer();

      // Update snake
      this.snake.update(dt, steer, 0);

      // Check orb collection
      const collected = this.orbs.checkCollision(this.snake.x, this.snake.y, Config.SNAKE_RADIUS);
      if (collected) {
        this.score++;
        this.snake.targetTrailLen += Config.TRAIL_GROW;
        this.snake.speed = Math.min(Config.SNAKE_MAX_SPEED, Config.SNAKE_BASE_SPEED + this.score * Config.SPEED_INC_PER_ORB);
        this.particles.burst(collected.x, collected.y, collected.color, Config.PARTICLE_BURST);
        this.audio.playCollect(this.score);
        this._checkMilestones();
      }

      // Maintain orbs
      this.orbs.ensure(this.snake.x, this.snake.y);

      // Self collision
      if (this.snake.checkSelfCollision()) {
        this._die();
        return;
      }

      // Update
      this.orbs.update(dt);
      this.particles.update(dt);
      this.camera.follow(this.snake.x, this.snake.y);
      this.camera.update(dt);

      // Draw
      this._draw();

      requestAnimationFrame(() => this._loop());
    }
    _draw() {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;

      // Clear
      ctx.fillStyle = this.theme.bg;
      ctx.fillRect(0, 0, cw, ch);

      // Background
      this.bg.draw(ctx, this.camera);

      // Orbs
      this.orbs.draw(ctx, this.camera);

      // Snake
      this.snake.draw(ctx, this.camera, this.theme);

      // Particles
      this.particles.draw(ctx, this.camera);

      // HUD score
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.font = '300 14px inherit';
      ctx.textAlign = 'center';
      ctx.fillText(this.score, cw / 2, 30);
      ctx.globalAlpha = 1;
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Game());
  } else {
    new Game();
  }
})();
