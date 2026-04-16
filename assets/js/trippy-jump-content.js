/* ── Trippy Jump — Content loader ─────────────────────────────────────────
 * Reads all milestone text from the companion JSON and exposes it as
 * window.TJ_CONTENT in the shape trippy-jump.js expects:
 *
 *   { en: { ui: { key: 'string', … }, milestones: [{score, label, text}] },
 *     de: { … },
 *     … }
 *
 * To edit or translate any text, open:
 *   assets/data/trippy-jump-content.json
 *
 * Each entry has a "context" field describing where it appears in the game,
 * with language translations right beside it.  Adding a new language only
 * requires adding its key to every entry in the JSON — no code changes needed.
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '../assets/data/trippy-jump-content.json', false); // synchronous
  xhr.send();

  var data = JSON.parse(xhr.responseText);

  // Discover languages from the keys of the first ui entry (excluding 'context')
  var firstKey = Object.keys(data.ui)[0];
  var langs = Object.keys(data.ui[firstKey]).filter(function (k) { return k !== 'context'; });

  window.TJ_CONTENT = {};

  langs.forEach(function (lang) {
    window.TJ_CONTENT[lang] = {

      // Flat ui dictionary — each key maps directly to its translated string.
      // Falls back to English when a translation is missing.
      ui: Object.fromEntries(
        Object.entries(data.ui).map(function (entry) {
          return [entry[0], entry[1][lang] !== undefined ? entry[1][lang] : entry[1].en];
        })
      ),

      // Milestones array sorted ascending by score.
      milestones: (data.milestones || []).map(function (m) {
        return {
          score: m.score,
          label: m.label[lang] !== undefined ? m.label[lang] : m.label.en,
          text:  m.text[lang]  !== undefined ? m.text[lang]  : m.text.en,
        };
      }).sort(function (a, b) { return a.score - b.score; }),

    };
  });
})();
