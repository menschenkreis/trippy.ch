/* ── Falling Emy — Content / i18n ────────────────────────────────────────
 * All user-visible text lives here so it can be edited without touching
 * game logic, and so new languages can be added by duplicating a block.
 *
 * Supported languages: 'en' (default), 'de'
 *
 * Template variables use {placeholder} syntax, e.g. "begin as {name}".
 * ─────────────────────────────────────────────────────────────────────── */
window.FE_CONTENT = {

  // ── English ──────────────────────────────────────────────────────────
  en: {
    ui: {
      // Intro sequence
      introThoughtNew:    'Your journey has not been written yet.',
      introThoughtReturn: 'Your journey has already begun',
      introEmbark:        'Embark into life',
      introResume:        'Resume journey',
      introRestart:       'Embark again',

      // Soul-name modal
      soulPrompt:      'you call yourself',
      soulPlaceholder: 'anything',
      soulConfirm:     'begin your journey',
      soulBeginAs:     'begin as {name}',

      // Sound-preference modal
      soundTitle:   'sound & music',
      soundHint:    'headphones make the journey deeper',
      soundYes:     'yes, with sound',
      soundNo:      'begin in silence',

      // Sound hint (HUD overlay)
      soundHintFor:   'tap 🔇 for',
      soundHintLabel: 'sound & music',

      // Bottom-left HUD
      expTag:          'canvas · physics · sacred geometry',
      expTitle:        'Falling Emy',
      soulLabel:       'soul',
      namePlaceholder: 'name your soul',

      // Journey panel — empty state
      journeyEmpty: 'The journey just began…',

      // Relative-time formatting  ({n} = number)
      timeJustNow: 'just now',
      timeMinAgo:  '{n} min ago',
      timeHAgo:    '{n}h ago',
      timeDayAgo:  '{n}d ago',

      // Depth formatting  ({n} = formatted number)
      depthKm: '{n} km',
      depthM:  '{n} m',

      // ── Info panel ──────────────────────────────────────────────────
      infoPanelTitle: 'Falling Emy',
      infoPanelTag:   'Canvas 2D · Verlet Physics · Life Lessons',

      infoJourneyH: 'The Journey',
      infoJourneyP: 'There is no ground. There never was. We are born into the fall and learn to call it living — navigating the space between what happens to us and what we do with it. The shapes you encounter aren\'t obstacles. They\'re the architecture of meaning: love, balance, challenge, pattern. You can slow time, but you can\'t stop it. You can dodge, but you can\'t skip ahead. The only way through is through.',

      infoHowH: 'How to play',
      infoHoldHint: 'Hold to slow time and drag Emy to reposition him.',
      infoTiltHint: 'Enable tilt to steer gravity with your device.',
      infoAddHint:  'Add more souls to the void.',

      infoSymbolsH: 'The Symbols of Life',

      symbolHeartTitle:    'Heart',
      symbolHeartText:     'Rare moments of love and connection. They play a warm, ringing major chord. Gentle reminders of what matters most.',
      symbolYinYangTitle:  'Yin Yang',
      symbolYinYangText:   'Balance between light and dark, action and stillness. Emitting dual harmonic tones that echo through the void.',
      symbolChallengeTitle: 'Challenge',
      symbolChallengeText:  'The edges that force growth. Sharp and threatening, they mark thresholds — each one a portal to a dimension you hadn\'t imagined yet. You don\'t destroy them. They transform you.',
      symbolGeometryTitle:  'Sacred Geometry',
      symbolGeometryText:   'The patterns of existence: Seed of Life, Metatron\'s Cube, and perfect Polygons. The crystalline structure of the universe.',
      symbolSetbackTitle:   'Setback',
      symbolSetbackText:    'A hexagram — the Seal of Solomon. Two triangles pulling in opposite directions, perfectly balanced yet immovable. It sends you back up. Sometimes life does this: just when you found your rhythm, the ground disappears and you fall upward again. Not punishment. Perspective. You\'ll cover the same distance twice, but never see it the same way.',
      symbolChakrasTitle:   'Chakras',
      symbolChakrasText:    'Seven energy centers, from Root to Crown. They resonate like singing bowls, each color a different frequency of being.',
      symbolMerkabTitle:    'Merkaba',
      symbolMerkabText:     'The vehicle of light — two tetrahedra spinning in opposite directions, projecting a field of sacred geometry around the body. A symbol of ascension and multi-dimensional awareness. Each encounter plays a crystalline ascending arpeggio: root, fifth, octave.',
      symbolTorusTitle:     'Torus',
      symbolTorusText:      'The fundamental shape of energy flow — a donut of light that loops endlessly through itself. Every field in nature curves back into itself this way: electromagnetic, gravitational, toroidal. Its sound is a low resonant drone, a reminder that all endings are beginnings.',

      infoPowerUpsH: 'Power-Ups',

      symbolAuraTitle: 'Aura ✦',
      symbolAuraText:  'Three iridescent rings bloom around Emy — a crown of living light that slowly cycles through all colours. Purely meditative. No obstacles to dodge, no force applied. Just Emy, radiant, for five seconds. A reminder that sometimes grace simply arrives.',
      symbolNovaTitle: 'Nova ✦',
      symbolNovaText:  'Eight rays of pure light radiate from Emy\'s head — a starburst of brilliance that lasts three seconds. An outpouring of inner light that transforms Emy briefly into a source rather than a subject of the void. The sound is a bright crystalline chord, clear as glass.',

      infoJourneySoFarH: 'The Journey So Far',
    },

    // ── Life chapters ────────────────────────────────────────────────
    // depth = metres fallen; age = metaphorical years
    chapters: [
      { depth:    5, label: 'birth',         text: 'no past. so much future.' },
      { depth:  100, label: 'flow',           text: 'life is not a problem to be solved, but a reality to be experienced.' },
      { depth:  200, label: 'resistance',     text: 'the obstacle is the path. every collision is an awakening.' },
      { depth:  300, label: 'drift',          text: 'sometimes the void carries you. sometimes you carry the void.' },
      { depth:  400, label: 'pattern',        text: 'the shapes repeat, but you never see them the same way twice.' },
      { depth:  500, label: 'descent',        text: 'to fall is to surrender. to surrender is to find the rhythm.' },
      { depth:  600, label: 'momentum',       text: 'you cannot steer what you do not accept.' },
      { depth:  700, label: 'gravity',        text: 'the pull is not the enemy. it is the only honest direction.' },
      { depth:  800, label: 'echo',           text: 'every sound you make returns — fainter, but never gone.' },
      { depth:  900, label: 'trust',          text: 'the void has caught you every time you have fallen so far.' },
      { depth: 1000, label: 'year 1',         text: 'a thousand meters. the world is finally becoming real.' },
      { depth: 1100, label: 'curiosity',      text: 'we do not travel to find ourselves, but to find how much there is to lose.' },
      { depth: 1200, label: 'stillness',      text: 'the faster you fall, the more still the center must become.' },
      { depth: 1300, label: 'light',          text: 'even in the void, you are the thing that glows.' },
      { depth: 1400, label: 'letting go',     text: 'you stop choosing the fall. the fall was always choosing you.' },
      { depth: 1500, label: 'breath',         text: 'the air changes at depth. so do you.' },
      { depth: 1600, label: 'time',           text: 'time does not pass. you pass through it.' },
      { depth: 1700, label: 'edge',           text: 'standing at the border between who you were and who you are becoming.' },
      { depth: 1800, label: 'fragility',      text: 'what breaks reveals what was holding it together.' },
      { depth: 1900, label: 'resilience',     text: 'the fracture is where the light enters. and the light was always entering.' },
      { depth: 2000, label: 'year 2',         text: 'two kilometers of descent. you are not the same shape that began.' },
      { depth: 2100, label: 'horizon',        text: 'there is no horizon here. only the next moment, and the next.' },
      { depth: 2200, label: 'faith',          text: 'not belief. just the quiet decision to keep falling.' },
      { depth: 2300, label: 'depth',          text: 'depth is merely height seen from a different point of view.' },
      { depth: 2400, label: 'silence',        text: 'the void does not answer. it only reflects the light you bring.' },
      { depth: 2500, label: 'presence',       text: 'you are not falling through the void. you are the void experiencing itself.' },
      { depth: 2600, label: 'interconnected', text: 'there are no separate objects, only different frequencies of the same descent.' },
      { depth: 2700, label: 'acceptance',     text: 'not everything has a reason. some things just are.' },
      { depth: 2800, label: 'gratitude',      text: 'for the fall. for the shapes. for the one who is falling.' },
      { depth: 2900, label: 'wonder',         text: 'after all this distance, everything is still strange and new.' },
      { depth: 3000, label: 'year 3',         text: 'three kilometers. what was once terrifying is now just the way things are.' },
      { age:   5,    label: 'year 5',         text: 'the void gets deeper, but so do you.' },
      { age:   9,    label: 'year 9',         text: 'almost double digits. time starts to feel real.' },
      { age:  12,    label: 'year 12',        text: 'a turning point. everything begins to change.' },
      { age:  13,    label: 'year 13',        text: 'the void gets deeper.' },
      { age:  15,    label: 'year 15',        text: 'first love. first heartbreak. the obstacles get sharper.' },
      { age:  18,    label: 'year 18',        text: 'adulthood arrives. nobody feels ready.' },
      { age:  25,    label: 'year 25',        text: 'a quarter century. who am i now?' },
      { age:  30,    label: 'year 30',        text: 'the fall feels different from here.' },
      { age:  40,    label: 'year 40',        text: 'not a crisis — a clearing.' },
      { age:  50,    label: 'year 50',        text: 'half a century. grace finds its rhythm.' },
      { age:  60,    label: 'year 60',        text: 'wisdom is not knowing more. it is carrying less.' },
      { age:  70,    label: 'year 70',        text: 'the obstacles soften. the geometry becomes beautiful.' },
      { age:  80,    label: 'year 80',        text: 'a long fall. a good fall. still falling.' },
      { age:  90,    label: 'year 90',        text: 'the void and you are old friends.' },
      { age: 100,    label: 'year 100',       text: 'a hundred years of descent. what a journey.' },
    ],
  },

  // ── Deutsch ──────────────────────────────────────────────────────────
  de: {
    ui: {
      // Intro-Sequenz
      introThoughtNew:    'Deine Reise wartet noch auf dich.',
      introThoughtReturn: 'Deine Reise hat bereits begonnen',
      introEmbark:        'Ins Leben stürzen',
      introResume:        'Reise fortsetzen',
      introRestart:       'Neu beginnen',

      // Seelen-Modal
      soulPrompt:      'du nennst dich',
      soulPlaceholder: 'irgendjemand',
      soulConfirm:     'deine Reise beginnen',
      soulBeginAs:     'als {name} beginnen',

      // Ton-Modal
      soundTitle:   'Ton & Musik',
      soundHint:    'Kopfhörer machen die Reise tiefer',
      soundYes:     'ja, mit Ton',
      soundNo:      'in der Stille beginnen',

      // Ton-Hinweis (HUD)
      soundHintFor:   '🔇 antippen für',
      soundHintLabel: 'Ton & Musik',

      // Untere linke Ecke
      expTag:          'Canvas · Physik · Heilige Geometrie',
      expTitle:        'Falling Emy',
      soulLabel:       'Seele',
      namePlaceholder: 'Seele benennen',

      // Reise-Panel — leerer Zustand
      journeyEmpty: 'Die Reise beginnt gerade…',

      // Zeitformatierung
      timeJustNow: 'gerade eben',
      timeMinAgo:  'vor {n} Min.',
      timeHAgo:    'vor {n} Std.',
      timeDayAgo:  'vor {n} Tagen',

      // Tiefenformatierung
      depthKm: '{n} km',
      depthM:  '{n} m',

      // ── Info-Panel ──────────────────────────────────────────────────
      infoPanelTitle: 'Falling Emy',
      infoPanelTag:   'Canvas 2D · Verlet-Physik · Lebenslektionen',

      infoJourneyH: 'Die Reise',
      infoJourneyP: 'Es gibt keinen Boden. Den gab es nie. Wir werden in den Fall hineingeboren und lernen, ihn Leben zu nennen — navigierend im Raum zwischen dem, was uns geschieht, und dem, was wir daraus machen. Die Formen, denen du begegnest, sind keine Hindernisse. Sie sind die Architektur des Sinns: Liebe, Balance, Herausforderung, Muster. Du kannst die Zeit verlangsamen, aber nicht anhalten. Du kannst ausweichen, aber nicht überspringen. Der einzige Weg ist durch.',

      infoHowH:     'Wie man spielt',
      infoHoldHint: 'Halten um die Zeit zu verlangsamen und Emy neu zu positionieren.',
      infoTiltHint: 'Neigung aktivieren um die Schwerkraft mit dem Gerät zu steuern.',
      infoAddHint:  'Weitere Seelen der Leere hinzufügen.',

      infoSymbolsH: 'Die Symbole des Lebens',

      symbolHeartTitle:     'Herz',
      symbolHeartText:      'Seltene Momente der Liebe und Verbindung. Sie spielen einen warmen, klingenden Dur-Akkord. Sanfte Erinnerungen daran, was wirklich wichtig ist.',
      symbolYinYangTitle:   'Yin Yang',
      symbolYinYangText:    'Balance zwischen Licht und Dunkel, Handeln und Stille. Dual harmonische Töne erklingen und hallen durch die Leere.',
      symbolChallengeTitle: 'Herausforderung',
      symbolChallengeText:  'Die Kanten, die Wachstum erzwingen. Scharf und bedrohlich markieren sie Schwellen — jede ein Portal in eine Dimension, die du dir noch nicht vorgestellt hast. Du zerstörst sie nicht. Sie verwandeln dich.',
      symbolGeometryTitle:  'Heilige Geometrie',
      symbolGeometryText:   'Die Muster der Existenz: Samen des Lebens, Metatrons Würfel und perfekte Polygone. Die kristalline Struktur des Universums.',
      symbolSetbackTitle:   'Rückschlag',
      symbolSetbackText:    'Ein Hexagramm — das Siegel Salomons. Zwei Dreiecke, die in entgegengesetzte Richtungen ziehen, perfekt ausbalanciert und doch unbeweglich. Es schickt dich zurück nach oben. Manchmal tut das Leben so: Genau wenn du deinen Rhythmus gefunden hast, verschwindet der Boden und du fällst wieder aufwärts. Keine Strafe. Perspektive. Du wirst dieselbe Strecke zweimal zurücklegen, aber sie nie gleich sehen.',
      symbolChakrasTitle:   'Chakras',
      symbolChakrasText:    'Sieben Energiezentren, von der Wurzel bis zur Krone. Sie schwingen wie Klangschalen — jede Farbe eine andere Frequenz des Seins.',
      symbolMerkabTitle:    'Merkaba',
      symbolMerkabText:     'Das Fahrzeug des Lichts — zwei Tetraeder, die sich in entgegengesetzte Richtungen drehen und ein Feld heiliger Geometrie um den Körper projizieren. Ein Symbol der Himmelfahrt und mehrdimensionalen Bewusstheit. Jede Begegnung spielt ein kristallines aufsteigendes Arpeggio: Grundton, Quinte, Oktave.',
      symbolTorusTitle:     'Torus',
      symbolTorusText:      'Die fundamentale Form des Energieflusses — ein Lichtring, der endlos durch sich selbst läuft. Jedes Feld in der Natur krümmt sich so in sich selbst zurück: elektromagnetisch, gravitativ, toroidal. Sein Klang ist ein tiefer resonanter Drone — eine Erinnerung daran, dass alle Enden Anfänge sind.',

      infoPowerUpsH: 'Power-Ups',

      symbolAuraTitle: 'Aura ✦',
      symbolAuraText:  'Drei schillernde Ringe entfalten sich um Emy — eine Krone aus lebendigem Licht, die langsam durch alle Farben wechselt. Rein meditativ. Keine Hindernisse, keine Kraft. Nur Emy, strahlend, für fünf Sekunden. Eine Erinnerung daran, dass Gnade manchmal einfach ankommt.',
      symbolNovaTitle: 'Nova ✦',
      symbolNovaText:  'Acht Strahlen reinen Lichts strahlen von Emys Kopf — ein Sternausbruch, der drei Sekunden andauert. Ein Ausströmen inneren Lichts, das Emy kurz in eine Quelle verwandelt statt in ein Objekt der Leere. Der Klang ist ein heller kristalliner Akkord, klar wie Glas.',

      infoJourneySoFarH: 'Die Reise bisher',
    },

    // ── Lebenskapitel ────────────────────────────────────────────────
    chapters: [
      { depth:    5, label: 'Geburt',          text: 'keine Vergangenheit. so viel Zukunft.' },
      { depth:  100, label: 'Fluss',           text: 'das Leben ist kein Problem, das gelöst werden muss, sondern eine Wirklichkeit, die erlebt werden will.' },
      { depth:  200, label: 'Widerstand',      text: 'das Hindernis ist der Weg. jede Kollision ist ein Erwachen.' },
      { depth:  300, label: 'Drift',           text: 'manchmal trägt dich die Leere. manchmal trägst du die Leere.' },
      { depth:  400, label: 'Muster',          text: 'die Formen wiederholen sich, aber du siehst sie nie auf dieselbe Weise zweimal.' },
      { depth:  500, label: 'Abstieg',         text: 'zu fallen bedeutet, sich hinzugeben. sich hinzugeben bedeutet, den Rhythmus zu finden.' },
      { depth:  600, label: 'Schwung',         text: 'du kannst nicht steuern, was du nicht annimmst.' },
      { depth:  700, label: 'Schwerkraft',     text: 'die Anziehung ist nicht der Feind. sie ist die einzig ehrliche Richtung.' },
      { depth:  800, label: 'Echo',            text: 'jeder Klang, den du erzeugst, kehrt zurück — leiser, aber niemals ganz weg.' },
      { depth:  900, label: 'Vertrauen',       text: 'die Leere hat dich jedes Mal aufgefangen, wenn du bisher gefallen bist.' },
      { depth: 1000, label: 'Jahr 1',          text: 'tausend Meter. die Welt wird endlich wirklich.' },
      { depth: 1100, label: 'Neugier',         text: 'wir reisen nicht, um uns selbst zu finden, sondern um zu entdecken, wie viel es zu verlieren gibt.' },
      { depth: 1200, label: 'Stille',          text: 'je schneller du fällst, desto stiller muss das Zentrum werden.' },
      { depth: 1300, label: 'Licht',           text: 'selbst in der Leere bist du das, was leuchtet.' },
      { depth: 1400, label: 'Loslassen',       text: 'du hörst auf, den Fall zu wählen. der Fall hat dich schon immer gewählt.' },
      { depth: 1500, label: 'Atem',            text: 'die Luft verändert sich in der Tiefe. du auch.' },
      { depth: 1600, label: 'Zeit',            text: 'die Zeit vergeht nicht. du vergehst durch sie.' },
      { depth: 1700, label: 'Schwelle',        text: 'stehend an der Grenze zwischen dem, der du warst, und dem, der du wirst.' },
      { depth: 1800, label: 'Zerbrechlichkeit', text: 'was zerbricht, zeigt, was es zusammengehalten hat.' },
      { depth: 1900, label: 'Widerstandskraft', text: 'der Riss ist der Ort, wo das Licht eintritt. und das Licht ist immer eingetreten.' },
      { depth: 2000, label: 'Jahr 2',          text: 'zwei Kilometer des Abstiegs. du hast nicht mehr dieselbe Form wie am Anfang.' },
      { depth: 2100, label: 'Horizont',        text: 'es gibt keinen Horizont hier. nur den nächsten Moment, und den nächsten.' },
      { depth: 2200, label: 'Glaube',          text: 'kein Glaubenssatz. nur die stille Entscheidung, weiter zu fallen.' },
      { depth: 2300, label: 'Tiefe',           text: 'Tiefe ist lediglich Höhe, aus einem anderen Blickwinkel gesehen.' },
      { depth: 2400, label: 'Schweigen',       text: 'die Leere antwortet nicht. sie spiegelt nur das Licht, das du mitbringst.' },
      { depth: 2500, label: 'Gegenwart',       text: 'du fällst nicht durch die Leere. du bist die Leere, die sich selbst erlebt.' },
      { depth: 2600, label: 'Verbundenheit',   text: 'es gibt keine getrennten Objekte, nur verschiedene Frequenzen desselben Abstiegs.' },
      { depth: 2700, label: 'Akzeptanz',       text: 'nicht alles hat einen Grund. manche Dinge sind einfach so.' },
      { depth: 2800, label: 'Dankbarkeit',     text: 'für den Fall. für die Formen. für den, der fällt.' },
      { depth: 2900, label: 'Staunen',         text: 'nach all dieser Strecke ist alles noch immer fremd und neu.' },
      { depth: 3000, label: 'Jahr 3',          text: 'drei Kilometer. was einst erschreckend war, ist jetzt einfach so.' },
      { age:   5,    label: 'Jahr 5',          text: 'die Leere wird tiefer, aber du auch.' },
      { age:   9,    label: 'Jahr 9',          text: 'fast zweistellig. die Zeit beginnt sich real anzufühlen.' },
      { age:  12,    label: 'Jahr 12',         text: 'ein Wendepunkt. alles beginnt sich zu verändern.' },
      { age:  13,    label: 'Jahr 13',         text: 'die Leere wird tiefer.' },
      { age:  15,    label: 'Jahr 15',         text: 'erste Liebe. erster Herzschmerz. die Hindernisse werden schärfer.' },
      { age:  18,    label: 'Jahr 18',         text: 'das Erwachsensein kommt. niemand fühlt sich bereit.' },
      { age:  25,    label: 'Jahr 25',         text: 'ein Vierteljahrhundert. wer bin ich jetzt?' },
      { age:  30,    label: 'Jahr 30',         text: 'der Fall fühlt sich von hier anders an.' },
      { age:  40,    label: 'Jahr 40',         text: 'keine Krise — eine Klärung.' },
      { age:  50,    label: 'Jahr 50',         text: 'ein halbes Jahrhundert. Anmut findet ihren Rhythmus.' },
      { age:  60,    label: 'Jahr 60',         text: 'Weisheit bedeutet nicht, mehr zu wissen. es bedeutet, weniger zu tragen.' },
      { age:  70,    label: 'Jahr 70',         text: 'die Hindernisse werden sanfter. die Geometrie wird schön.' },
      { age:  80,    label: 'Jahr 80',         text: 'ein langer Fall. ein guter Fall. noch immer fallend.' },
      { age:  90,    label: 'Jahr 90',         text: 'die Leere und du seid alte Freunde.' },
      { age: 100,    label: 'Jahr 100',        text: 'hundert Jahre des Abstiegs. was für eine Reise.' },
    ],
  },
};
