// ── Central Navigation Component ──
(function () {
  'use strict';

  // Page detection
  var path = window.location.pathname;

  // Detect subdirectory depth (blog/ or experiments/ subpages)
  var isSubdir = /\/(blog|experiments)\//.test(path);
  var base = isSubdir ? '../' : '';

  var isIndex = (path === '/' || path === '/index.html' || path.endsWith('/index.html'));
  var isExperiments = path.includes('/experiments.html') || path.endsWith('/experiments');
  var isBlog = path.includes('/blog.html') || path.endsWith('/blog') || /\/blog\/[^/]+\.html/.test(path);
  var isAbout = path.includes('/about.html');

  // Only inject nav on pages with the nav element
  var navEl = document.getElementById('sticky-nav');
  if (!navEl) return;

  // Build nav links (with correct base path for subdirectory pages)
  var links = [
    { href: isIndex ? '#' : base + 'index.html', label: 'Portal', i18n: 'nav.portal', match: isIndex },
    { href: base + 'experiments.html', label: 'Experiments', i18n: 'nav.experiments', match: isExperiments },
    { href: base + 'about.html', label: 'About', i18n: 'nav.about', match: isAbout },
    { href: base + 'blog.html', label: 'Insights', i18n: 'nav.insights', match: isBlog }
  ];

  var navLinksContainer = document.getElementById('nav-links');
  if (navLinksContainer) {
    navLinksContainer.innerHTML = '';
    links.forEach(function (link) {
      var a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.label;
      if (link.i18n) a.setAttribute('data-i18n', link.i18n);
      if (link.match) a.classList.add('is-active');
      navLinksContainer.appendChild(a);
    });
  }

  // Update logo link
  var logo = navEl.querySelector('.nav-logo');
  if (logo) {
    logo.href = isIndex ? '#' : base + 'index.html';
  }

  // Scroll visibility — observe hero on index, show immediately otherwise
  var hero = document.querySelector('.hero');
  if (hero) {
    var obs = new IntersectionObserver(function (entries) {
      navEl.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0.15 });
    obs.observe(hero);
  } else {
    navEl.classList.add('is-visible');
  }

  // Hamburger toggle
  var hamburger = document.getElementById('nav-hamburger');
  if (hamburger && navLinksContainer) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('is-open');
      navLinksContainer.classList.toggle('is-open');
    });
    navLinksContainer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        hamburger.classList.remove('is-open');
        navLinksContainer.classList.remove('is-open');
      });
    });
  }
})();
