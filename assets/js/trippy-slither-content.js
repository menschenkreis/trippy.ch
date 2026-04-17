/* trippy-slither-content.js — UI wiring for Trippy Slither */

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

  window._slitherJourney = {
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

  // ── Game over UI ──
  const gameOverScreen = document.getElementById('game-over');
  const finalScoreEl = document.getElementById('final-score');
  const finalHighEl = document.getElementById('final-high');
  const playAgainBtn = document.getElementById('play-again');

  window._slitherUI = {
    showGameOver(score, highScore) {
      finalScoreEl.textContent = score;
      finalHighEl.textContent = 'BEST: ' + highScore;
      gameOverScreen.classList.add('is-active');
    },
    hideGameOver() {
      gameOverScreen.classList.remove('is-active');
    }
  };

  playAgainBtn.addEventListener('click', () => {
    if (window._slitherGame) window._slitherGame.restart();
  });

  // ── Start button ──
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');

  startBtn.addEventListener('click', () => {
    startScreen.classList.remove('is-active');
    if (window._slitherGame) window._slitherGame.start();
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
    if (window._slitherGame) window._slitherGame.setMuted(muted);
  });

  window._slitherMuted = () => muted;

  // ── Tilt button ──
  const tiltBtn = document.getElementById('tilt-btn');
  let tiltEnabled = false;

  tiltBtn.addEventListener('click', () => {
    tiltEnabled = !tiltEnabled;
    tiltBtn.classList.toggle('is-on', tiltEnabled);
    if (window._slitherGame) window._slitherGame.setTilt(tiltEnabled);
  });

  window._slitherTiltEnabled = () => tiltEnabled;

  // ── Page transition ──
  const pt = document.getElementById('page-transition');
  if (pt) {
    pt.classList.add('is-active');
    requestAnimationFrame(() => requestAnimationFrame(() => pt.classList.remove('is-active')));
  }
})();
