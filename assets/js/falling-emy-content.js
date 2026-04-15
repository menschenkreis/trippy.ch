/* ── Falling Emy — Content loader ────────────────────────────────────────
 * Reads all user-visible text from the companion JSON file and exposes it
 * as window.FE_CONTENT in the shape falling-emy.js expects:
 *
 *   { en: { ui: { key: 'string', … }, chapters: [{depth/age, label, text}] },
 *     de: { … },
 *     … }
 *
 * To edit or translate any text, open:
 *   assets/data/falling-emy-content.json
 *
 * Each entry in the JSON has a "context" field describing where the text
 * appears in the game, with "en" and "de" translations right beside it.
 * Adding a new language requires only adding its key to every entry in the
 * JSON — no code changes needed.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '../assets/data/falling-emy-content.json', false); // synchronous
  xhr.send();

  var data = JSON.parse(xhr.responseText);

  // Discover languages from the keys of the first ui entry (excluding "context")
  var langs = Object.keys(data.ui[Object.keys(data.ui)[0]])
    .filter(function (k) { return k !== 'context'; });

  window.FE_CONTENT = {};

  langs.forEach(function (lang) {
    window.FE_CONTENT[lang] = {

      ui: Object.fromEntries(
        Object.entries(data.ui).map(function (entry) {
          return [entry[0], entry[1][lang] !== undefined ? entry[1][lang] : entry[1].en];
        })
      ),

      chapters: data.chapters.map(function (ch) {
        return {
          depth: ch.depth,
          age:   ch.age,
          label: ch.label[lang] !== undefined ? ch.label[lang] : ch.label.en,
          text:  ch.text[lang]  !== undefined ? ch.text[lang]  : ch.text.en,
        };
      }),

    };
  });
})();
