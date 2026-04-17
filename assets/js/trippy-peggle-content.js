/* trippy-peggle-content.js — UI wiring for Trippy Peggle */

(function () {
  'use strict';

  // ── Panel open/close ──
  const panel = document.getElementById('info-panel');
  const overlay = document.getElementById('panel-overlay');
  const openPanel = () => { panel.classList.add('is-open'); overlay.classList.add('is-active'); };
  const closePanel = () => { panel.classList.remove('is-open'); overlay.classList.remove('is-active'); };

  document.getElementById('info-btn').addEventListener('click', openPanel);
  document.getElementById('close-panel').addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  // ── Journey log helpers ──
  const journeyLog = document.getElementById('journey-log');
  const journeyEmpty = document.getElementById('journey-empty');

  window._peggleJourney = {
    _entries: [],
    _milestones: {},

    add(icon, text) {
      this._entries.push({ icon, text });
      if (journeyEmpty) journeyEmpty.remove();
      const entry = document.createElement('div');
      entry.className = 'journey-entry';
      entry.innerHTML = `<span class="journey-icon">${icon}</span><span class="journey-entry-text">${text}</span>`;
      journeyLog.appendChild(entry);
    },

    check(key, icon, text) {
      if (!this._milestones[key]) {
        this._milestones[key] = true;
        this.add(icon, text);
      }
    },

    reset() {
      this._entries = [];
      this._milestones = {};
      journeyLog.innerHTML = '<p id="journey-empty" style="font-size:0.82rem;color:rgba(255,255,255,0.2);font-style:italic;margin:0">The void awaits…</p>';
    }
  };

  // ── Level complete UI ──
  const lcScreen = document.getElementById('level-complete');
  const lcLevelEl = document.getElementById('lc-level');
  const lcScoreEl = document.getElementById('lc-score');
  const lcBreakdownEl = document.getElementById('lc-breakdown');
  const nextLevelBtn = document.getElementById('next-level-btn');

  window._peggleUI = {
    showLevelComplete(level, score, breakdown) {
      lcLevelEl.textContent = 'LEVEL ' + level;
      lcScoreEl.textContent = score;
      lcBreakdownEl.textContent = breakdown;
      lcScreen.classList.add('is-active');
    },
    hideLevelComplete() {
      lcScreen.classList.remove('is-active');
    },

    showGameOver(score, highScore) {
      document.getElementById('final-score').textContent = score;
      document.getElementById('final-high').textContent = 'BEST: ' + highScore;
      document.getElementById('game-over').classList.add('is-active');
    },
    hideGameOver() {
      document.getElementById('game-over').classList.remove('is-active');
    }
  };

  nextLevelBtn.addEventListener('click', () => {
    if (window._peggleGame) window._peggleGame.nextLevel();
  });

  // ── Game over UI ──
  document.getElementById('play-again').addEventListener('click', () => {
    if (window._peggleGame) window._peggleGame.restart();
  });

  // ── Start button ──
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');

  startBtn.addEventListener('click', () => {
    startScreen.classList.remove('is-active');
    if (window._peggleGame) window._peggleGame.start();
  });

  // ── Mute button ──
  const muteBtn = document.getElementById('mute-btn');
  let muted = true;
  muteBtn.textContent = '🔇';
  muteBtn.classList.add('is-on');

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('is-on', !muted);
    if (window._peggleGame) window._peggleGame.setMuted(muted);
  });

  window._peggleMuted = () => muted;

  // ── Page transition ──
  const pt = document.getElementById('page-transition');
  if (pt) {
    pt.classList.add('is-active');
    requestAnimationFrame(() => requestAnimationFrame(() => pt.classList.remove('is-active')));
  }
})();
