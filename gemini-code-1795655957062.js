import { VERSION, WORDS, UPGRADES } from './config.js';
import { sfx } from './sound.js';
import { GameEngine } from './game.js';

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $('game-canvas'),
  hud: $('hud'),
  verBadge: $('ver-badge'),
  lv: $('hud-lv'),
  hpBar: $('hud-hp-bar'),
  hpText: $('hud-hp-text'),
  xpBar: $('hud-xp-bar'),
  time: $('hud-time'),
  kills: $('hud-kills'),
  combo: $('hud-combo'),
  aimBtn: $('btn-aim-toggle'),
  aimLabel: $('aim-mode-label'),
  soundBtn: $('btn-sound-toggle'),
  typingDock: $('typing-dock'),
  wordDisplay: $('word-display'),
  input: $('typing-input'),
  levelupDock: $('levelup-dock'),
  levelupCards: $('levelup-cards'),
  overlay: $('overlay'),
  startPanel: $('start-panel'),
  gameoverPanel: $('gameover-panel'),
  btnStart: $('btn-start'),
  btnRetry: $('btn-retry'),
  resTime: $('res-time'),
  resLv: $('res-lv'),
  resKills: $('res-kills'),
  resWords: $('res-words'),
};

els.verBadge.textContent = VERSION;

let currentWord = '';
let activeChoices = [];

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function pickNextWord() {
  let next = WORDS[Math.floor(Math.random() * WORDS.length)];
  if (next === currentWord) next = WORDS[(WORDS.indexOf(next) + 1) % WORDS.length];
  currentWord = next;
  els.input.value = '';
  renderWordFeedback('');
}

function renderWordFeedback(typed) {
  let html = '';
  for (let i = 0; i < currentWord.length; i++) {
    const ch = currentWord[i];
    if (i < typed.length) {
      const cls = typed[i] === ch ? 'ok' : 'bad';
      html += `<span class="${cls}">${ch}</span>`;
    } else {
      html += `<span class="rest">${ch}</span>`;
    }
  }
  els.wordDisplay.innerHTML = html;
}

function showLevelUpChoices() {
  if (activeChoices.length > 0) return;
  const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  activeChoices = pool;

  els.levelupCards.innerHTML = pool.map((u, idx) => `
    <button class="upg-card" data-idx="${idx}" type="button">
      <div><span class="upg-key">${idx + 1}</span><span class="upg-name">${u.name}</span></div>
      <div class="upg-desc">${u.desc}</div>
    </button>
  `).join('');

  els.levelupCards.querySelectorAll('.upg-card').forEach((btn) => {
    btn.addEventListener('click', () => selectUpgrade(Number(btn.dataset.idx)));
  });

  els.levelupDock.classList.remove('hidden');
}

function selectUpgrade(idx) {
  const chosen = activeChoices[idx];
  if (!chosen) return;
  engine.consumeLevelUp(chosen);
  activeChoices = [];

  if (engine.pendingLevelUps > 0) {
    showLevelUpChoices();
  } else {
    els.levelupDock.classList.add('hidden');
  }
  els.input.focus();
}

const engine = new GameEngine(els.canvas, {
  onCanvasClick: () => els.input.focus(),
  onHudUpdate: (s) => {
    els.lv.textContent = s.level;
    els.hpText.textContent = `${s.hp} / ${s.maxHp}`;
    els.hpBar.style.width = `${(s.hp / s.maxHp) * 100}%`;
    els.xpBar.style.width = `${Math.min(100, s.xpRatio * 100)}%`;
    els.time.textContent = formatTime(s.elapsed);
    els.kills.textContent = s.kills;
    els.combo.textContent = s.combo;
  },
  onLevelUp: () => showLevelUpChoices(),
  onGameOver: (s) => {
    els.typingDock.classList.add('hidden');
    els.levelupDock.classList.add('hidden');
    els.resTime.textContent = formatTime(s.elapsed);
    els.resLv.textContent = s.level;
    els.resKills.textContent = s.kills;
    els.resWords.textContent = s.wordsTyped;
    els.startPanel.classList.add('hidden');
    els.gameoverPanel.classList.remove('hidden');
    els.overlay.classList.remove('hidden');
  },
});

function startGame() {
  activeChoices = [];
  els.overlay.classList.add('hidden');
  els.hud.classList.remove('hidden');
  els.typingDock.classList.remove('hidden');
  els.levelupDock.classList.add('hidden');
  engine.start();
  pickNextWord();
  els.input.focus();
}

els.btnStart.addEventListener('click', startGame);
els.btnRetry.addEventListener('click', startGame);

els.aimBtn.addEventListener('click', () => {
  const mode = engine.toggleAimMode();
  els.aimLabel.textContent = mode === 'auto' ? '자동' : '마우스';
  els.input.focus();
});

els.soundBtn.addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  els.soundBtn.textContent = sfx.muted ? '🔇' : '🔊';
  els.input.focus();
});

// 타자 입력 실시간 피드백
els.input.addEventListener('input', () => {
  sfx.typeClick();
  renderWordFeedback(els.input.value.trim());
});

// 전역 키보드 제어 (Tab 조준 전환, 1·2·3 레벨업 선택, Space/Enter 발사)
window.addEventListener('keydown', (e) => {
  if (!engine.running) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    const mode = engine.toggleAimMode();
    els.aimLabel.textContent = mode === 'auto' ? '자동' : '마우스';
    return;
  }

  if (activeChoices.length > 0 && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    selectUpgrade(Number(e.key) - 1);
    return;
  }

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const val = els.input.value.trim();
    if (!val) return;

    if (val === currentWord) {
      engine.fireTypingAttack();
      pickNextWord();
    } else {
      sfx.miss();
      engine.resetCombo();
      els.typingDock.classList.remove('shake');
      void els.typingDock.offsetWidth;
      els.typingDock.classList.add('shake');
      els.input.value = '';
      renderWordFeedback('');
    }
  }
});