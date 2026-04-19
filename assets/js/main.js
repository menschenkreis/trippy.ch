// ── Theme System ──
(function () {
  const themes = [
    {
      name: 'Cosmic Purple',  // electric violet · neon cyan · hot magenta
      bg: '#0d0520', bgLight: '#1a0a35', fg: '#f0e8ff', fgMuted: '#9b80c8',
      purple: '#9b1dff', teal: '#00ffcc', pink: '#ff0099', violet: '#bf40ff',
      glow: 'rgba(155,29,255,0.5)', tealGlow: 'rgba(0,255,204,0.4)', pinkGlow: 'rgba(255,0,153,0.4)'
    },
    {
      name: 'Ocean Depths',   // electric blue · neon mint · blazing orange
      bg: '#040d1a', bgLight: '#071828', fg: '#d0f0ff', fgMuted: '#4d90aa',
      purple: '#0055ff', teal: '#00ffaa', pink: '#ff5500', violet: '#0099ff',
      glow: 'rgba(0,85,255,0.5)', tealGlow: 'rgba(0,255,170,0.4)', pinkGlow: 'rgba(255,85,0,0.4)'
    },
    {
      name: 'Northern Lights', // neon green · electric sky · vivid purple
      bg: '#050f08', bgLight: '#091a10', fg: '#d0ffe8', fgMuted: '#4daa70',
      purple: '#00ff77', teal: '#00ccff', pink: '#cc00ff', violet: '#00ffaa',
      glow: 'rgba(0,255,119,0.5)', tealGlow: 'rgba(0,204,255,0.4)', pinkGlow: 'rgba(204,0,255,0.4)'
    },
    {
      name: 'Solar Flare',    // electric gold · fire red · deep blue
      bg: '#150a00', bgLight: '#261300', fg: '#fff5d0', fgMuted: '#c8943d',
      purple: '#ffcc00', teal: '#ff2200', pink: '#0044ff', violet: '#ffaa00',
      glow: 'rgba(255,204,0,0.5)', tealGlow: 'rgba(255,34,0,0.4)', pinkGlow: 'rgba(0,68,255,0.4)'
    },
    {
      name: 'Nebula',         // neon violet · shocking pink · electric cyan
      bg: '#0a0015', bgLight: '#150025', fg: '#f5e0ff', fgMuted: '#9955cc',
      purple: '#cc00ff', teal: '#ff0077', pink: '#00ffff', violet: '#dd44ff',
      glow: 'rgba(204,0,255,0.5)', tealGlow: 'rgba(255,0,119,0.4)', pinkGlow: 'rgba(0,255,255,0.4)'
    },
    {
      name: 'Acid Trip',      // pure magenta · acid yellow · electric cyan
      bg: '#0a0a00', bgLight: '#141400', fg: '#ffffe0', fgMuted: '#aaaa40',
      purple: '#ff00ff', teal: '#ffff00', pink: '#00ffff', violet: '#ff44ff',
      glow: 'rgba(255,0,255,0.5)', tealGlow: 'rgba(255,255,0,0.4)', pinkGlow: 'rgba(0,255,255,0.4)'
    },
    {
      name: 'Blood Moon',     // crimson · neon orange · electric purple
      bg: '#120005', bgLight: '#200008', fg: '#ffe0e8', fgMuted: '#cc4455',
      purple: '#ff0033', teal: '#ff8800', pink: '#8800ff', violet: '#ff2255',
      glow: 'rgba(255,0,51,0.5)', tealGlow: 'rgba(255,136,0,0.4)', pinkGlow: 'rgba(136,0,255,0.4)'
    },
    {
      name: 'Glacier',        // ice cyan · pure white-blue · neon rose
      bg: '#020d14', bgLight: '#041822', fg: '#e0f8ff', fgMuted: '#5599bb',
      purple: '#00ddff', teal: '#aaeeff', pink: '#ff0088', violet: '#44ddff',
      glow: 'rgba(0,221,255,0.5)', tealGlow: 'rgba(170,238,255,0.4)', pinkGlow: 'rgba(255,0,136,0.4)'
    },
    {
      name: 'Radioactive',    // lime green · neon amber · hot magenta
      bg: '#050f00', bgLight: '#0a1a00', fg: '#efffcc', fgMuted: '#88bb33',
      purple: '#44ff00', teal: '#ffaa00', pink: '#ff00cc', violet: '#88ff00',
      glow: 'rgba(68,255,0,0.5)', tealGlow: 'rgba(255,170,0,0.4)', pinkGlow: 'rgba(255,0,204,0.4)'
    },
    {
      name: 'Deep Space',     // indigo · neon pink · electric mint
      bg: '#04000f', bgLight: '#08001e', fg: '#e8e0ff', fgMuted: '#6644aa',
      purple: '#4400ff', teal: '#ff00cc', pink: '#00ffaa', violet: '#6622ff',
      glow: 'rgba(68,0,255,0.5)', tealGlow: 'rgba(255,0,204,0.4)', pinkGlow: 'rgba(0,255,170,0.4)'
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

// ── Sticky Nav & Hamburger ──
(function () {
  const nav = document.getElementById('sticky-nav');
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks = document.getElementById('nav-links');
  if (!nav || !hamburger || !navLinks) return;

  // Scroll visibility — show immediately on non-hero pages, observe hero on index
  const hero = document.querySelector('.hero');
  if (hero) {
    const obs = new IntersectionObserver(([e]) => nav.classList.toggle('is-visible', !e.isIntersecting), { threshold: 0.15 });
    obs.observe(hero);
  }
  // Scroll fallback for pages without hero
  if (!hero) {
    nav.classList.add('is-visible');
  }

  // Hamburger toggle
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('is-open');
    navLinks.classList.toggle('is-open');
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('is-open');
      navLinks.classList.remove('is-open');
    });
  });
})();

// ── Smooth Page Transitions & Portal ──
(function () {
  const overlay = document.getElementById('page-transition');
  if (!overlay) return;

  // Portal effect on home page
  const portalTrigger = document.querySelector('.portal-trigger');
  if (portalTrigger) {
    portalTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('portal-active');
      setTimeout(() => {
        window.location.href = portalTrigger.getAttribute('href');
      }, 1200);
    });
  }

  // Intercept internal links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.classList.contains('portal-trigger')) return;
    const href = a.getAttribute('href');
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
