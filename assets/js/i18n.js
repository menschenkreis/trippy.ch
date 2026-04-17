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
    btn.textContent = currentLang.toUpperCase();
    btn.addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'de' : 'en';
      localStorage.setItem(STORAGE_KEY, currentLang);

      // Trippy morph animation
      btn.classList.add('morphing');
      setTimeout(() => {
        btn.textContent = currentLang.toUpperCase();
        btn.classList.remove('morphing');
      }, 250);

      applyTranslations(currentLang);
    });
    document.body.appendChild(btn);
  }

  // Init
  createToggle();
  applyTranslations(currentLang);
})();
