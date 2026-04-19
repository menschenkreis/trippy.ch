(function() {
  const STORAGE_KEY = 'trippy-lang';
  let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

  function getTranslations() {
    const el = document.getElementById('i18n-data');
    if (!el) return {};
    try { return JSON.parse(el.textContent); } catch(e) { return {}; }
  }

  function applyTranslations(lang) {
    const t = getTranslations();
    if (!t[lang]) return;
    const tr = t[lang];

    // data-i18n="key" → textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (tr[key] !== undefined) el.textContent = tr[key];
    });

    // data-i18n-html="key" → innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (tr[key] !== undefined) el.innerHTML = tr[key];
    });

    // data-i18n-placeholder="key"
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (tr[key] !== undefined) el.placeholder = tr[key];
    });

    // data-i18n-title="key"
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (tr[key] !== undefined) el.title = tr[key];
    });

    // <title> and meta tags via data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (tr[key] !== undefined) {
        if (el.tagName === 'TITLE') el.textContent = tr[key];
        else if (el.tagName === 'META') el.setAttribute('content', tr[key]);
      }
    });

    document.documentElement.lang = lang;
  }

  function createToggle() {
    const btn = document.createElement('button');
    btn.id = 'lang-btn';
    const label = document.createElement('span');
    label.textContent = currentLang.toUpperCase();
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'de' : 'en';
      localStorage.setItem(STORAGE_KEY, currentLang);

      // Trippy flip animation — swap text at the midpoint
      btn.classList.add('morphing');
      setTimeout(() => {
        label.textContent = currentLang.toUpperCase();
      }, 200);
      setTimeout(() => {
        btn.classList.remove('morphing');
      }, 500);

      applyTranslations(currentLang);
    });
    document.body.appendChild(btn);
  }

  // Show lang toggle after scrolling past hero, or immediately if no hero
  function initScrollReveal() {
    const hero = document.querySelector('.hero');
    const btn = document.getElementById('lang-btn');
    if (!btn) return;
    if (!hero) { btn.classList.add('is-visible'); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) btn.classList.add('is-visible');
        else btn.classList.remove('is-visible');
      });
    }, { threshold: 0 });
    observer.observe(hero);
  }

  // Init
  createToggle();
  applyTranslations(currentLang);
  initScrollReveal();
})();
