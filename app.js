// ============================================================================
// Utilities
// ============================================================================
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
}
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/unavailable */ }
}
function levelOf(c) { return parseInt(c.level) || 0; }
function costOf(c) { return parseInt(c.cost) || 0; }
function powerOf(c) { return parseInt(c.power) || 0; }
function isClimax(c) { return (c.cardType || '').toLowerCase() === 'climax'; }
function isCharacter(c) { return (c.cardType || '').toLowerCase() === 'character'; }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ============================================================================
// Card Database
// ============================================================================
const CardDB = {
  cards: CARD_DATA,
  byNumber: {},
  searchText: '',
  colorFilter: null,
  typeFilter: null,
  levelFilter: null,

  init() {
    this.cards.forEach(c => { this.byNumber[c.cardNumber] = c; });
  },
  card(cardNumber) { return this.byNumber[cardNumber]; },
  colors() { return [...new Set(this.cards.map(c => c.color).filter(Boolean))].sort(); },
  types() { return [...new Set(this.cards.map(c => c.cardType).filter(Boolean))].sort(); },
  filtered() {
    const q = this.searchText.trim().toLowerCase();
    return this.cards.filter(c => {
      if (q && !(c.name.toLowerCase().includes(q) || c.cardNumber.toLowerCase().includes(q) || (c.effectText || '').toLowerCase().includes(q))) return false;
      if (this.colorFilter && c.color !== this.colorFilter) return false;
      if (this.typeFilter && c.cardType !== this.typeFilter) return false;
      if (this.levelFilter !== null && levelOf(c) !== this.levelFilter) return false;
      return true;
    });
  }
};
CardDB.init();

// ============================================================================
// Deck storage
// ============================================================================
const DeckStore = {
  decks: lsGet('ws_decks', []),
  save() { lsSet('ws_decks', this.decks); },
  create(name) {
    const deck = { id: uid(), name, entries: [] };
    this.decks.push(deck);
    this.save();
    return deck;
  },
  get(id) { return this.decks.find(d => d.id === id); },
  update(deck) {
    const i = this.decks.findIndex(d => d.id === deck.id);
    if (i >= 0) this.decks[i] = deck;
    this.save();
  },
  delete(id) {
    this.decks = this.decks.filter(d => d.id !== id);
    this.save();
  },
  totalCards(deck) { return deck.entries.reduce((s, e) => s + e.quantity, 0); },
  add(deck, card, max = 4) {
    const e = deck.entries.find(e => e.cardNumber === card.cardNumber);
    if (e) { if (e.quantity < max) e.quantity++; }
    else deck.entries.push({ cardNumber: card.cardNumber, quantity: 1 });
    this.update(deck);
  },
  remove(deck, card) {
    const i = deck.entries.findIndex(e => e.cardNumber === card.cardNumber);
    if (i >= 0) {
      deck.entries[i].quantity--;
      if (deck.entries[i].quantity <= 0) deck.entries.splice(i, 1);
      this.update(deck);
    }
  }
};

// ============================================================================
// Shared Life / Turn state
// ============================================================================
const GameState = {
  data: lsGet('ws_gamestate', {
    player1: { name: 'Player 1', level: 0, clock: 0, stock: 0, hand: 0, waitingRoom: 0, memory: 0 },
    player2: { name: 'Player 2', level: 0, clock: 0, stock: 0, hand: 0, waitingRoom: 0, memory: 0 },
    phase: 0, turn: 1, activePlayer: 1
  }),
  save() { lsSet('ws_gamestate', this.data); },
  reset() {
    const n1 = this.data.player1.name, n2 = this.data.player2.name;
    this.data = {
      player1: { name: n1, level: 0, clock: 0, stock: 0, hand: 0, waitingRoom: 0, memory: 0 },
      player2: { name: n2, level: 0, clock: 0, stock: 0, hand: 0, waitingRoom: 0, memory: 0 },
      phase: 0, turn: 1, activePlayer: 1
    };
    this.save();
  }
};

const PHASES = [
  { title: 'Stand', sub: 'Stand all your resting characters' },
  { title: 'Draw', sub: 'Draw 1 card (skip on your first turn)' },
  { title: 'Clock', sub: 'Optionally put 1 card from hand into clock; if clock reaches 7, draw 2 and check level up' },
  { title: 'Main', sub: 'Play characters/events, use ACT abilities' },
  { title: 'Climax', sub: 'Play up to 1 climax card' },
  { title: 'Attack', sub: 'Attack with each front-row character in turn' },
  { title: 'Encore', sub: 'Opponent may pay encore cost to stand reversed characters' },
  { title: 'End', sub: 'Discard down to 7 cards in hand; pass turn' }
];

// ============================================================================
// Navigation
// ============================================================================
const Screens = ['cards', 'decks', 'deck-editor', 'life', 'turn', 'solo'];
let currentDeckEditorId = null;

function showScreen(name) {
  Screens.forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('hidden', s !== name);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
  if (name === 'cards') renderCards();
  if (name === 'decks') renderDecks();
  if (name === 'deck-editor') renderDeckEditor();
  if (name === 'life') renderLife();
  if (name === 'turn') renderTurn();
  if (name === 'solo') renderSolo();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ============================================================================
// Modal helper
// ============================================================================
function openModal(html) {
  document.getElementById('modal-sheet').innerHTML = html;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-sheet').innerHTML = '';
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});

// ============================================================================
// CARDS SCREEN
// ============================================================================
function renderCardRow(c) {
  const statsHtml = isClimax(c) ? '' : `<div class="stats">Lv ${esc(c.level)} / Cost ${esc(c.cost)}<br>Pow ${esc(c.power)}</div>`;
  return `
    <div class="card-row" data-cardnum="${esc(c.cardNumber)}">
      <img src="${esc(c.imageURL)}" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="info">
        <div class="name">${esc(c.name)}</div>
        <div class="meta">${esc(c.cardNumber)} • ${esc(c.cardType)} • ${esc(c.color)}</div>
      </div>
      ${statsHtml}
    </div>`;
}

function renderCards() {
  document.getElementById('cards-count').textContent = `(${CardDB.cards.length})`;
  const list = document.getElementById('card-list');
  const items = CardDB.filtered();
  list.innerHTML = items.slice(0, 300).map(renderCardRow).join('');
  list.querySelectorAll('.card-row').forEach(el => {
    el.addEventListener('click', () => openCardDetail(el.dataset.cardnum));
  });
  renderFilterChips();
}

function renderFilterChips() {
  const colorRow = document.getElementById('color-chips');
  colorRow.innerHTML = ['All', ...CardDB.colors()].map(c =>
    `<button class="chip ${(c === 'All' ? CardDB.colorFilter === null : CardDB.colorFilter === c) ? 'selected' : ''}" data-color="${c === 'All' ? '' : esc(c)}">${esc(c)}</button>`
  ).join('');
  colorRow.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    CardDB.colorFilter = chip.dataset.color || null;
    renderCards();
  }));

  const typeRow = document.getElementById('type-chips');
  typeRow.innerHTML = ['All', ...CardDB.types()].map(t =>
    `<button class="chip ${(t === 'All' ? CardDB.typeFilter === null : CardDB.typeFilter === t) ? 'selected' : ''}" data-type="${t === 'All' ? '' : esc(t)}">${esc(t)}</button>`
  ).join('');
  typeRow.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    CardDB.typeFilter = chip.dataset.type || null;
    renderCards();
  }));

  const levelRow = document.getElementById('level-chips');
  levelRow.innerHTML = ['All', 0, 1, 2, 3].map(l =>
    `<button class="chip ${(l === 'All' ? CardDB.levelFilter === null : CardDB.levelFilter === l) ? 'selected' : ''}" data-level="${l === 'All' ? '' : l}">${l === 'All' ? 'All' : 'Lv' + l}</button>`
  ).join('');
  levelRow.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    CardDB.levelFilter = chip.dataset.level === '' ? null : parseInt(chip.dataset.level);
    renderCards();
  }));
}

document.getElementById('card-search').addEventListener('input', (e) => {
  CardDB.searchText = e.target.value;
  renderCards();
});
document.getElementById('filter-btn').addEventListener('click', () => {
  document.getElementById('filter-panel').classList.toggle('hidden');
});
document.getElementById('clear-filters-btn').addEventListener('click', () => {
  CardDB.colorFilter = null; CardDB.typeFilter = null; CardDB.levelFilter = null;
  renderCards();
});

function openCardDetail(cardNumber) {
  const c = CardDB.card(cardNumber);
  if (!c) return;
  const statsHtml = isClimax(c) ? '' : `
    <div class="zone-card-row"><span>Level</span><b>${esc(c.level)}</b></div>
    <div class="zone-card-row"><span>Cost</span><b>${esc(c.cost)}</b></div>
    <div class="zone-card-row"><span>Power</span><b>${esc(c.power)}</b></div>
    <div class="zone-card-row"><span>Soul</span><b>${esc(c.soul)}</b></div>`;
  openModal(`
    <div class="modal-header"><h2>${esc(c.cardNumber)}</h2><button class="text-btn" onclick="closeModal()">Done</button></div>
    <div class="modal-body">
      <div style="text-align:center;margin-bottom:12px;">
        <img src="${esc(c.imageURL)}" style="max-width:240px;width:100%;border-radius:8px;" onerror="this.style.display='none'">
      </div>
      <h2 style="margin:0 0 2px;">${esc(c.name)}</h2>
      <div style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">${esc(c.cardNumber)}</div>
      <div class="zone-card-row"><span>Type</span><b>${esc(c.cardType)}</b></div>
      <div class="zone-card-row"><span>Color</span><b>${esc(c.color)}</b></div>
      <div class="zone-card-row"><span>Rarity</span><b>${esc(c.rarity)}</b></div>
      ${statsHtml}
      <div class="zone-card-row"><span>Trigger</span><b>${esc(c.trigger)}</b></div>
      ${c.effectText ? `<h3 style="margin-top:16px;">Effect</h3><p style="line-height:1.5;">${esc(c.effectText)}</p>` : ''}
    </div>
  `);
}

// ============================================================================
// DECKS SCREEN
// ============================================================================
function renderDecks() {
  const list = document.getElementById('deck-list');
  const empty = document.getElementById('deck-empty');
  if (DeckStore.decks.length === 0) {
    list.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  list.innerHTML = DeckStore.decks.map(d => `
    <div class="deck-row" data-id="${d.id}">
      <button class="del-btn" data-del="${d.id}">Delete</button>
      <div class="name">${esc(d.name)}</div>
      <div class="sub">${DeckStore.totalCards(d)} cards</div>
    </div>
  `).join('');
  list.querySelectorAll('.deck-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.del) return;
      currentDeckEditorId = el.dataset.id;
      showScreen('deck-editor');
    });
  });
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this deck?')) { DeckStore.delete(btn.dataset.del); renderDecks(); }
    });
  });
}

function newDeckFlow() {
  const name = prompt('Deck name:');
  if (name && name.trim()) {
    DeckStore.create(name.trim());
    renderDecks();
  }
}
document.getElementById('new-deck-btn').addEventListener('click', newDeckFlow);
document.getElementById('new-deck-btn-2').addEventListener('click', newDeckFlow);
document.getElementById('deck-editor-back').addEventListener('click', () => showScreen('decks'));

function renderDeckEditor() {
  const deck = DeckStore.get(currentDeckEditorId);
  if (!deck) { showScreen('decks'); return; }
  document.getElementById('deck-editor-title').textContent = deck.name;
  const climaxCount = deck.entries.reduce((sum, e) => {
    const c = CardDB.card(e.cardNumber);
    return sum + (c && isClimax(c) ? e.quantity : 0);
  }, 0);
  document.getElementById('deck-editor-stats').innerHTML = `
    <span>${DeckStore.totalCards(deck)}/50 cards</span>
    <span>Climax: ${climaxCount}/8</span>`;

  const inList = document.getElementById('deck-editor-inlist');
  inList.innerHTML = deck.entries.map(e => {
    const c = CardDB.card(e.cardNumber);
    if (!c) return '';
    return `
      <div class="card-row" data-num="${esc(e.cardNumber)}">
        <div class="info"><div class="name">${esc(c.name)}</div><div class="meta">${esc(c.cardNumber)}</div></div>
        <div class="stats" style="display:flex;align-items:center;gap:10px;">
          <button class="secondary-btn" data-action="remove" data-num="${esc(e.cardNumber)}">−</button>
          <span>x${e.quantity}</span>
          <button class="secondary-btn" data-action="add" data-num="${esc(e.cardNumber)}">+</button>
        </div>
      </div>`;
  }).join('');
  inList.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = CardDB.card(btn.dataset.num);
      if (btn.dataset.action === 'add') DeckStore.add(deck, c);
      else DeckStore.remove(deck, c);
      renderDeckEditor();
    });
  });

  const q = (document.getElementById('deck-editor-search').value || '').trim().toLowerCase();
  const candidates = CardDB.cards.filter(c => !q || c.name.toLowerCase().includes(q) || c.cardNumber.toLowerCase().includes(q)).slice(0, 60);
  const addList = document.getElementById('deck-editor-addlist');
  addList.innerHTML = candidates.map(c => `
    <div class="card-row" data-num="${esc(c.cardNumber)}">
      <div class="info"><div class="name">${esc(c.name)}</div><div class="meta">${esc(c.cardNumber)}</div></div>
      <button class="secondary-btn" data-add="${esc(c.cardNumber)}">＋</button>
    </div>
  `).join('');
  addList.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      DeckStore.add(deck, CardDB.card(btn.dataset.add));
      renderDeckEditor();
    });
  });
}
document.getElementById('deck-editor-search').addEventListener('input', renderDeckEditor);

// ============================================================================
// LIFE SCREEN
// ============================================================================
function counterBox(label, key, playerKey, max) {
  const val = GameState.data[playerKey][key];
  return `
    <div class="counter-box">
      <div class="label">${label}</div>
      <div class="controls">
        <button data-dec="${playerKey}.${key}">−</button>
        <span class="value">${val}${max ? '/' + max : ''}</span>
        <button data-inc="${playerKey}.${key}" data-max="${max || ''}">＋</button>
      </div>
    </div>`;
}

function renderLife() {
  const content = document.getElementById('life-content');
  content.innerHTML = ['player1', 'player2'].map(pk => `
    <div class="player-panel">
      <input class="player-name-input" data-name="${pk}" value="${esc(GameState.data[pk].name)}">
      <div class="counter-grid">
        ${counterBox('Level', 'level', pk, 4)}
        ${counterBox('Clock', 'clock', pk, 7)}
        ${counterBox('Stock', 'stock', pk)}
        ${counterBox('Hand', 'hand', pk)}
        ${counterBox('Waiting Rm', 'waitingRoom', pk)}
        ${counterBox('Memory', 'memory', pk)}
      </div>
    </div>
  `).join('');

  content.querySelectorAll('[data-name]').forEach(inp => {
    inp.addEventListener('input', () => {
      GameState.data[inp.dataset.name].name = inp.value;
      GameState.save();
    });
  });
  content.querySelectorAll('[data-dec]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [pk, key] = btn.dataset.dec.split('.');
      if (GameState.data[pk][key] > 0) GameState.data[pk][key]--;
      GameState.save(); renderLife();
    });
  });
  content.querySelectorAll('[data-inc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [pk, key] = btn.dataset.inc.split('.');
      const max = btn.dataset.max ? parseInt(btn.dataset.max) : null;
      if (max === null || GameState.data[pk][key] < max) GameState.data[pk][key]++;
      GameState.save(); renderLife();
    });
  });
}
document.getElementById('life-reset-btn').addEventListener('click', () => {
  if (confirm('Reset life tracker for both players?')) { GameState.reset(); renderLife(); renderTurn(); }
});

// ============================================================================
// TURN SCREEN
// ============================================================================
function renderTurn() {
  const s = GameState.data;
  const phase = PHASES[s.phase];
  const activeName = s.activePlayer === 1 ? s.player1.name : s.player2.name;
  const content = document.getElementById('turn-content');
  content.innerHTML = `
    <div class="phase-card">
      <div class="turn-label">Turn ${s.turn}</div>
      <div class="active-player">${esc(activeName)}</div>
      <div class="phase-name">${phase.title}</div>
      <div class="phase-sub">${phase.sub}</div>
    </div>
    <div class="pip-row">
      ${PHASES.map((p, i) => `<div class="pip ${i === s.phase ? 'active' : ''}"></div>`).join('')}
    </div>
    <button class="action-btn" id="turn-next-btn">Next Phase</button>
  `;
  document.getElementById('turn-next-btn').addEventListener('click', () => {
    if (s.phase < PHASES.length - 1) {
      s.phase++;
    } else {
      s.phase = 0;
      s.activePlayer = s.activePlayer === 1 ? 2 : 1;
      s.turn++;
    }
    GameState.save();
    renderTurn();
  });
}
document.getElementById('turn-reset-btn').addEventListener('click', () => {
  if (confirm('Reset the turn tracker?')) { GameState.reset(); renderTurn(); renderLife(); }
});

// ============================================================================
// SOLO PLAY ENGINE
// A from-scratch, simplified rules engine (see README for scope/limits).
// Manual override lets you resolve any card ability by hand via the board
// manager, regardless of phase or normal legality checks.
// ============================================================================
const SOLO_PHASE_LABEL = { stand: 'Stand', draw: 'Draw', clock: 'Clock', main: 'Main', climax: 'Climax', attack: 'Attack', end: 'End' };
const SOLO_NEXT_LABEL = { stand: 'Draw', draw: 'Clock', clock: 'Main', main: 'Climax', climax: 'Attack', attack: 'End', end: 'End Turn' };
const STAGE_SLOTS = ['left', 'center', 'right'];
const ZONE_LIST = ['hand', 'stageLeft', 'stageCenter', 'stageRight', 'climax', 'stock', 'clock', 'level', 'waitingRoom', 'deck'];
const ZONE_LABEL = {
  hand: 'Hand', deck: 'Deck', waitingRoom: 'Waiting Room', clock: 'Clock', level: 'Level',
  stock: 'Stock', climax: 'Climax Area', stageLeft: 'Stage (Left)', stageCenter: 'Stage (Center)', stageRight: 'Stage (Right)'
};
function zoneStageSlot(zone) {
  return { stageLeft: 'left', stageCenter: 'center', stageRight: 'right' }[zone] || null;
}

function newCardInstance(card) {
  return { id: uid(), card, isReversed: false, isResting: false, powerModifier: 0 };
}
function effectivePower(inst) { return powerOf(inst.card) + inst.powerModifier; }

function newBoard(name) {
  return { deck: [], hand: [], waitingRoom: [], clock: [], level: [], stock: [], stage: { left: null, center: null, right: null }, climaxArea: null, name };
}

const Solo = {
  human: newBoard('You'),
  ai: newBoard('CPU'),
  phase: 'stand',
  turn: 1,
  isHumanTurn: true,
  outcome: 'ongoing', // ongoing | humanWins | aiWins
  log: [],
  selectedHandId: null,
  started: false,

  addLog(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  },
  board(side) { return side === 'human' ? this.human : this.ai; },
  levelValue(b) { return b.level.length; },
  canPlayColor(b) {
    const colors = new Set(Object.values(b.stage).filter(Boolean).map(i => i.card.color));
    b.clock.forEach(c => colors.add(c.color));
    return colors;
  },
  drawCards(b, n) {
    for (let i = 0; i < n; i++) {
      if (b.deck.length === 0) this.refreshDeck(b);
      if (b.deck.length === 0) return;
      b.hand.push(newCardInstance(b.deck.shift()));
    }
  },
  refreshDeck(b) {
    if (b.deck.length === 0 && b.waitingRoom.length > 0) {
      b.deck = shuffle(b.waitingRoom.slice());
      b.waitingRoom = [];
    }
  },
  takeDamage(b, amount) {
    for (let i = 0; i < amount; i++) {
      if (b.deck.length === 0) this.refreshDeck(b);
      if (b.deck.length === 0) continue;
      b.clock.push(b.deck.shift());
      if (b.clock.length >= 7) {
        const levelCard = b.clock.pop();
        b.level.push(levelCard);
        b.waitingRoom.push(...b.clock);
        b.clock = [];
      }
    }
    return this.levelValue(b) >= 4;
  },
  checkLoss() {
    if (this.levelValue(this.human) >= 4) this.outcome = 'aiWins';
    if (this.levelValue(this.ai) >= 4) this.outcome = 'humanWins';
  },
  standAll(b) {
    STAGE_SLOTS.forEach(slot => {
      if (b.stage[slot]) { b.stage[slot].isResting = false; b.stage[slot].isReversed = false; }
    });
  },

  setup(humanDeck, aiDeck) {
    const expand = (deck) => {
      let cards = [];
      deck.entries.forEach(e => {
        const c = CardDB.card(e.cardNumber);
        if (c) for (let i = 0; i < e.quantity; i++) cards.push(c);
      });
      return shuffle(cards);
    };
    this.human = newBoard('You');
    this.ai = newBoard('CPU');
    this.human.deck = expand(humanDeck);
    this.ai.deck = expand(aiDeck);
    this.drawCards(this.human, 6);
    this.drawCards(this.ai, 6);
    this.turn = 1; this.isHumanTurn = true; this.phase = 'stand'; this.outcome = 'ongoing';
    this.log = ['Game started. You go first (no draw on turn 1).'];
    this.selectedHandId = null;
    this.started = true;
  },

  advancePhase() {
    if (this.outcome !== 'ongoing') return;
    const b = this.isHumanTurn ? this.human : this.ai;
    switch (this.phase) {
      case 'stand':
        this.standAll(b); this.phase = 'draw'; this.runDrawPhase(); break;
      case 'draw': this.phase = 'clock'; break;
      case 'clock': this.phase = 'main'; break;
      case 'main': this.phase = 'climax'; break;
      case 'climax': this.phase = 'attack'; break;
      case 'attack': this.phase = 'end'; break;
      case 'end':
        this.runEndPhase(b);
        if (!this.isHumanTurn) this.turn++;
        this.isHumanTurn = !this.isHumanTurn;
        this.phase = 'stand';
        if (!this.isHumanTurn) this.runAITurn();
        break;
    }
  },
  runDrawPhase() {
    const b = this.isHumanTurn ? this.human : this.ai;
    if (this.turn === 1 && this.isHumanTurn) { this.addLog(`${b.name}: first turn, no draw.`); return; }
    this.drawCards(b, 1);
    this.addLog(`${b.name} draws a card.`);
  },
  performClockAction(instanceId) {
    if (this.phase !== 'clock' || !this.isHumanTurn) return;
    const b = this.human;
    const idx = b.hand.findIndex(i => i.id === instanceId);
    if (idx < 0) return;
    const inst = b.hand.splice(idx, 1)[0];
    b.clock.push(inst.card);
    if (b.clock.length >= 7) {
      const levelCard = b.clock.pop();
      b.level.push(levelCard);
      b.waitingRoom.push(...b.clock);
      b.clock = [];
    }
    this.drawCards(b, 2);
    this.checkLoss();
    this.addLog('You clock a card and draw 2.');
  },
  playCharacter(instanceId, slot) {
    if (this.phase !== 'main') return false;
    const b = this.isHumanTurn ? this.human : this.ai;
    const idx = b.hand.findIndex(i => i.id === instanceId);
    if (idx < 0) return false;
    const inst = b.hand[idx];
    if (levelOf(inst.card) > this.levelValue(b)) return false;
    const colorsOk = this.canPlayColor(b);
    const stageEmpty = STAGE_SLOTS.every(s => !b.stage[s]);
    if (!colorsOk.has(inst.card.color) && !stageEmpty) return false;
    if (b.stock.length < costOf(inst.card)) return false;

    for (let i = 0; i < costOf(inst.card); i++) b.waitingRoom.push(b.stock.pop());
    if (b.stage[slot]) b.waitingRoom.push(b.stage[slot].card);
    inst.isResting = false; inst.isReversed = false;
    b.stage[slot] = inst;
    b.hand.splice(idx, 1);
    this.addLog(`${b.name} plays ${inst.card.name} to ${slot}.`);
    return true;
  },
  bankToStock(instanceId) {
    if (this.phase !== 'main' || !this.isHumanTurn) return;
    const b = this.human;
    const idx = b.hand.findIndex(i => i.id === instanceId);
    if (idx < 0) return;
    const inst = b.hand.splice(idx, 1)[0];
    b.stock.push(inst.card);
    this.addLog('You bank a card to stock.');
  },
  playClimax(instanceId) {
    if (this.phase !== 'climax') return;
    const b = this.isHumanTurn ? this.human : this.ai;
    if (b.climaxArea) return;
    const idx = b.hand.findIndex(i => i.id === instanceId);
    if (idx < 0) return;
    const inst = b.hand.splice(idx, 1)[0];
    b.climaxArea = inst.card;
    this.addLog(`${b.name} plays climax: ${inst.card.name}.`);
  },
  attack(slot) {
    if (this.phase !== 'attack') return;
    const atk = this.isHumanTurn ? this.human : this.ai;
    const def = this.isHumanTurn ? this.ai : this.human;
    const attacker = atk.stage[slot];
    if (!attacker || attacker.isResting || attacker.isReversed) return;
    attacker.isResting = true;

    const defender = def.stage[slot];
    if (defender && !defender.isReversed) {
      if (effectivePower(attacker) > effectivePower(defender)) {
        defender.isReversed = true;
        this.addLog(`${atk.name}'s ${attacker.card.name} reverses ${defender.card.name}.`);
      } else if (effectivePower(attacker) === effectivePower(defender)) {
        this.addLog(`${attacker.card.name} battles ${defender.card.name}: no effect (tie).`);
      } else {
        this.addLog(`${attacker.card.name} attacks but ${defender.card.name} holds (insufficient power).`);
      }
    } else {
      const dmg = Math.max(1, parseInt(attacker.card.soul) || 0);
      const lost = this.takeDamage(def, dmg);
      this.addLog(`${atk.name}'s ${attacker.card.name} hits directly for ${dmg} damage.`);
      if (lost) {
        this.outcome = this.isHumanTurn ? 'humanWins' : 'aiWins';
        this.addLog(`${def.name} reached Level 4 and loses!`);
      }
    }
    this.checkLoss();
  },
  runEndPhase(b) {
    while (b.hand.length > 7) {
      const removed = b.hand.pop();
      b.waitingRoom.push(removed.card);
    }
  },

  runAITurn() {
    if (this.outcome !== 'ongoing') return;
    const ai = this.ai;
    this.standAll(ai); this.phase = 'draw'; this.drawCards(ai, 1); this.phase = 'clock';

    if (ai.hand.length > 4 && ai.clock.length < 5 && ai.hand[0]) {
      const inst = ai.hand.shift();
      ai.clock.push(inst.card);
      if (ai.clock.length >= 7) {
        const levelCard = ai.clock.pop();
        ai.level.push(levelCard);
        ai.waitingRoom.push(...ai.clock);
        ai.clock = [];
      }
      this.drawCards(ai, 2);
      this.addLog('CPU clocks a card and draws 2.');
      this.checkLoss();
    }
    this.phase = 'main';

    if (ai.stock.length < 2) {
      const idx = ai.hand.findIndex(i => isCharacter(i.card) || (i.card.cardType || '').toLowerCase() === 'event');
      if (idx >= 0) {
        const inst = ai.hand.splice(idx, 1)[0];
        ai.stock.push(inst.card);
        this.addLog('CPU banks a card to stock.');
      }
    }
    STAGE_SLOTS.forEach(slot => {
      if (ai.stage[slot]) return;
      const candidates = ai.hand
        .filter(i => isCharacter(i.card) && levelOf(i.card) <= this.levelValue(ai) && costOf(i.card) <= ai.stock.length)
        .sort((a, c) => costOf(a.card) - costOf(c.card));
      if (candidates.length) {
        const inst = candidates[0];
        for (let i = 0; i < costOf(inst.card); i++) ai.waitingRoom.push(ai.stock.pop());
        ai.hand.splice(ai.hand.indexOf(inst), 1);
        inst.isResting = false; inst.isReversed = false;
        ai.stage[slot] = inst;
        this.addLog(`CPU plays ${inst.card.name} to ${slot}.`);
      }
    });
    this.phase = 'climax';

    if (!ai.climaxArea) {
      const idx = ai.hand.findIndex(i => isClimax(i.card));
      if (idx >= 0) {
        const inst = ai.hand.splice(idx, 1)[0];
        ai.climaxArea = inst.card;
        this.addLog('CPU plays a climax.');
      }
    }
    this.phase = 'attack';

    for (const slot of STAGE_SLOTS) {
      if (ai.stage[slot]) {
        this.isHumanTurn = false;
        this.attack(slot);
        if (this.outcome !== 'ongoing') break;
      }
    }
    this.phase = 'end';
    this.runEndPhase(ai);
    this.turn++;
    this.isHumanTurn = true;
    this.phase = 'stand';
    this.standAll(this.human);
    this.phase = 'draw';
    this.drawCards(this.human, 1);
    this.phase = 'clock';
  },

  cardsIn(zone, side) {
    const b = this.board(side);
    const wrap = (card, index, extra) => ({ card, index, isReversed: false, isResting: false, powerModifier: 0, ...extra });
    switch (zone) {
      case 'hand': return b.hand.map((i, idx) => wrap(i.card, idx, { isReversed: i.isReversed, isResting: i.isResting, powerModifier: i.powerModifier, instId: i.id }));
      case 'deck': return b.deck.map((c, idx) => wrap(c, idx));
      case 'waitingRoom': return b.waitingRoom.map((c, idx) => wrap(c, idx));
      case 'clock': return b.clock.map((c, idx) => wrap(c, idx));
      case 'level': return b.level.map((c, idx) => wrap(c, idx));
      case 'stock': return b.stock.map((c, idx) => wrap(c, idx));
      case 'climax': return b.climaxArea ? [wrap(b.climaxArea, 0)] : [];
      case 'stageLeft': case 'stageCenter': case 'stageRight': {
        const slot = zoneStageSlot(zone);
        const inst = b.stage[slot];
        return inst ? [wrap(inst.card, 0, { isReversed: inst.isReversed, isResting: inst.isResting, powerModifier: inst.powerModifier, instId: inst.id })] : [];
      }
    }
    return [];
  },
  extract(zone, index, side) {
    const b = this.board(side);
    let result = null;
    switch (zone) {
      case 'hand': result = b.hand.splice(index, 1)[0]; break;
      case 'deck': result = newCardInstance(b.deck.splice(index, 1)[0]); break;
      case 'waitingRoom': result = newCardInstance(b.waitingRoom.splice(index, 1)[0]); break;
      case 'clock': result = newCardInstance(b.clock.splice(index, 1)[0]); break;
      case 'level': result = newCardInstance(b.level.splice(index, 1)[0]); break;
      case 'stock': result = newCardInstance(b.stock.splice(index, 1)[0]); break;
      case 'climax': if (b.climaxArea) { result = newCardInstance(b.climaxArea); b.climaxArea = null; } break;
      case 'stageLeft': case 'stageCenter': case 'stageRight': {
        const slot = zoneStageSlot(zone);
        if (b.stage[slot]) { result = b.stage[slot]; b.stage[slot] = null; }
        break;
      }
    }
    return result;
  },
  insert(instance, zone, side, atTop) {
    const b = this.board(side);
    switch (zone) {
      case 'hand': b.hand.push(instance); break;
      case 'deck': atTop ? b.deck.unshift(instance.card) : b.deck.push(instance.card); break;
      case 'waitingRoom': b.waitingRoom.push(instance.card); break;
      case 'clock':
        b.clock.push(instance.card);
        if (b.clock.length >= 7) {
          const levelCard = b.clock.pop();
          b.level.push(levelCard);
          b.waitingRoom.push(...b.clock);
          b.clock = [];
        }
        break;
      case 'level': b.level.push(instance.card); break;
      case 'stock': b.stock.push(instance.card); break;
      case 'climax':
        if (b.climaxArea) b.waitingRoom.push(b.climaxArea);
        b.climaxArea = instance.card;
        break;
      case 'stageLeft': case 'stageCenter': case 'stageRight': {
        const slot = zoneStageSlot(zone);
        if (b.stage[slot]) b.waitingRoom.push(b.stage[slot].card);
        b.stage[slot] = instance;
        break;
      }
    }
    this.checkLoss();
  },
  manualMove(fromSide, fromZone, index, toSide, toZone, toTop) {
    const inst = this.extract(fromZone, index, fromSide);
    if (!inst) return;
    this.insert(inst, toZone, toSide, !!toTop);
    this.addLog(`Manual: moved ${inst.card.name} from ${ZONE_LABEL[fromZone]} (${fromSide === 'human' ? 'You' : 'CPU'}) to ${ZONE_LABEL[toZone]} (${toSide === 'human' ? 'You' : 'CPU'}).`);
  },
  manualToggle(side, slot, field) {
    const b = this.board(side);
    if (b.stage[slot]) b.stage[slot][field] = !b.stage[slot][field];
  },
  manualAdjustPower(side, slot, delta) {
    const b = this.board(side);
    if (b.stage[slot]) b.stage[slot].powerModifier += delta;
  },
  manualDraw(side, count = 1) {
    const b = this.board(side);
    this.drawCards(b, count);
    this.addLog(`Manual: ${side === 'human' ? 'You' : 'CPU'} drew ${count}.`);
  },
  manualShuffleDeck(side) {
    const b = this.board(side);
    b.deck = shuffle(b.deck);
    this.addLog(`Manual: ${side === 'human' ? 'You' : 'CPU'} shuffled their deck.`);
  },
  manualRefresh(side) {
    const b = this.board(side);
    const wasEmpty = b.deck.length === 0;
    this.refreshDeck(b);
    if (wasEmpty) this.addLog(`Manual: ${side === 'human' ? 'You' : 'CPU'} refreshed their deck from waiting room.`);
  }
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Solo UI rendering ----
function renderSolo() {
  document.getElementById('solo-board-btn').classList.toggle('hidden', !Solo.started);
  document.getElementById('solo-restart-btn').classList.toggle('hidden', !Solo.started);
  document.getElementById('solo-title').textContent = Solo.started ? `Turn ${Solo.turn} — ${SOLO_PHASE_LABEL[Solo.phase]}` : 'Solo Practice';
  const content = document.getElementById('solo-content');
  content.innerHTML = Solo.started ? soloGameHtml() : soloSetupHtml();
  if (!Solo.started) bindSoloSetup(); else bindSoloGame();
}

function soloSetupHtml() {
  const options = DeckStore.decks.map(d => `<option value="${d.id}">${esc(d.name)} (${DeckStore.totalCards(d)})</option>`).join('');
  return `
    <p class="setup-note">Solo practice plays out core turn structure and combat using printed stats. Individual card abilities aren't automated — tap the folder icon any time to open the full board manager: every zone for both players is visible, and you can move any card anywhere, toggle Reversed/Resting, or nudge Power to resolve an effect by hand.</p>
    <label class="section-label" style="margin-left:0;">Your Deck</label>
    <select class="setup-select" id="solo-human-deck"><option value="">Select…</option>${options}</select>
    <label class="section-label" style="margin-left:0;">CPU Deck</label>
    <select class="setup-select" id="solo-ai-deck"><option value="">Select…</option>${options}</select>
    <button class="primary-btn" id="solo-start-btn" ${DeckStore.decks.length === 0 ? 'disabled' : ''}>Start Game</button>
    ${DeckStore.decks.length === 0 ? '<p class="setup-note">Create at least one deck in the Decks tab first.</p>' : ''}
  `;
}
function bindSoloSetup() {
  document.getElementById('solo-start-btn')?.addEventListener('click', () => {
    const hId = document.getElementById('solo-human-deck').value;
    const aId = document.getElementById('solo-ai-deck').value;
    const hDeck = DeckStore.get(hId), aDeck = DeckStore.get(aId);
    if (!hDeck || !aDeck) return;
    Solo.setup(hDeck, aDeck);
    renderSolo();
  });
}

function stageSlotHtml(inst, ownBoard, slot) {
  if (!inst) return `<div class="stage-slot" data-own="${ownBoard}" data-slot="${slot}"><span class="plus">＋</span></div>`;
  const powerText = inst.powerModifier !== 0 ? ` (${inst.powerModifier > 0 ? '+' : ''}${inst.powerModifier})` : '';
  return `
    <div class="stage-slot ${inst.isReversed ? 'reversed' : ''}" data-own="${ownBoard}" data-slot="${slot}">
      <div class="slot-name">${esc(inst.card.name)}</div>
      <div class="slot-power">P${effectivePower(inst)}${powerText}</div>
      ${inst.isReversed ? '<div class="slot-flag reversed-flag">REVERSED</div>' : (inst.isResting ? '<div class="slot-flag resting-flag">resting</div>' : '')}
    </div>`;
}

function soloGameHtml() {
  let html = '';
  if (Solo.outcome !== 'ongoing') {
    html += `<div class="outcome-banner">${Solo.outcome === 'humanWins' ? '🎉 You win!' : 'CPU wins'}</div>`;
  }
  html += `<div class="status-row">
    You: Lv ${Solo.levelValue(Solo.human)} • Clock ${Solo.human.clock.length}/7 • Stock ${Solo.human.stock.length}<br>
    CPU: Lv ${Solo.levelValue(Solo.ai)} • Clock ${Solo.ai.clock.length}/7 • Stock ${Solo.ai.stock.length}
  </div>`;

  html += `<div class="board-title">CPU</div><div class="stage-row">`;
  STAGE_SLOTS.forEach(slot => { html += stageSlotHtml(Solo.ai.stage[slot], false, slot); });
  html += `</div>`;
  if (Solo.ai.climaxArea) html += `<div class="climax-label">Climax: ${esc(Solo.ai.climaxArea.name)}</div>`;

  html += `<div class="board-title" style="margin-top:14px;">You</div><div class="stage-row">`;
  STAGE_SLOTS.forEach(slot => { html += stageSlotHtml(Solo.human.stage[slot], true, slot); });
  html += `</div>`;
  if (Solo.human.climaxArea) html += `<div class="climax-label">Climax: ${esc(Solo.human.climaxArea.name)}</div>`;

  html += `<button class="action-btn" id="solo-next-btn" ${Solo.outcome !== 'ongoing' ? 'disabled' : ''}>${Solo.phase === 'end' ? 'End Turn' : 'Next: ' + SOLO_NEXT_LABEL[Solo.phase]}</button>`;

  const selected = Solo.human.hand.find(i => i.id === Solo.selectedHandId);
  if (selected) {
    if (Solo.phase === 'main') html += `<button class="sub-action-btn" id="solo-bank-btn">Bank "${esc(selected.card.name)}" to Stock</button>`;
    if (Solo.phase === 'clock') html += `<button class="sub-action-btn" id="solo-clock-btn">Clock "${esc(selected.card.name)}" (draw 2)</button>`;
    if (Solo.phase === 'climax' && isClimax(selected.card)) html += `<button class="sub-action-btn" id="solo-climax-btn">Play Climax "${esc(selected.card.name)}"</button>`;
  }

  html += `<div class="section-label" style="margin-left:0;">Your Hand (${Solo.human.hand.length})</div>`;
  html += `<div class="hand-scroll">`;
  Solo.human.hand.forEach(inst => {
    html += `<div class="hand-card ${inst.id === Solo.selectedHandId ? 'selected' : ''}" data-hand-id="${inst.id}">
      <div>${esc(inst.card.name)}</div>
      <div class="stats">${isClimax(inst.card) ? 'CX' : `Lv${esc(inst.card.level)}/C${esc(inst.card.cost)}/P${esc(inst.card.power)}`}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="section-label" style="margin-left:0;">Log</div>`;
  html += Solo.log.slice(-8).map(l => `<div class="log-line">${esc(l)}</div>`).join('');

  return html;
}

function bindSoloGame() {
  document.getElementById('solo-next-btn')?.addEventListener('click', () => { Solo.advancePhase(); renderSolo(); });
  document.getElementById('solo-bank-btn')?.addEventListener('click', () => { Solo.bankToStock(Solo.selectedHandId); Solo.selectedHandId = null; renderSolo(); });
  document.getElementById('solo-clock-btn')?.addEventListener('click', () => { Solo.performClockAction(Solo.selectedHandId); Solo.selectedHandId = null; renderSolo(); });
  document.getElementById('solo-climax-btn')?.addEventListener('click', () => { Solo.playClimax(Solo.selectedHandId); Solo.selectedHandId = null; renderSolo(); });

  document.querySelectorAll('.hand-card').forEach(el => {
    el.addEventListener('click', () => {
      Solo.selectedHandId = (Solo.selectedHandId === el.dataset.handId) ? null : el.dataset.handId;
      renderSolo();
    });
  });
  document.querySelectorAll('.stage-slot').forEach(el => {
    el.addEventListener('click', () => {
      const own = el.dataset.own === 'true';
      const slot = el.dataset.slot;
      if (own && Solo.phase === 'attack') {
        Solo.attack(slot); renderSolo();
      } else if (own && Solo.phase === 'main' && Solo.selectedHandId) {
        if (Solo.playCharacter(Solo.selectedHandId, slot)) { Solo.selectedHandId = null; renderSolo(); }
      }
    });
  });
}

document.getElementById('solo-restart-btn').addEventListener('click', () => {
  Solo.started = false;
  renderSolo();
});
document.getElementById('solo-board-btn').addEventListener('click', openZoneManager);

// ============================================================================
// ZONE MANAGER (manual override modal)
// ============================================================================
let zoneManagerSide = 'human';

function openZoneManager() {
  zoneManagerSide = 'human';
  renderZoneManager();
}

function renderZoneManager() {
  let html = `
    <div class="modal-header"><h2>Board Manager</h2><button class="text-btn" onclick="closeModal()">Done</button></div>
    <div class="zone-tabs">
      <button class="zone-tab ${zoneManagerSide === 'human' ? 'selected' : ''}" id="zm-side-human">You</button>
      <button class="zone-tab ${zoneManagerSide === 'ai' ? 'selected' : ''}" id="zm-side-ai">CPU</button>
    </div>
    <div style="display:flex;gap:8px;padding:0 16px 8px;">
      <button class="secondary-btn" id="zm-draw">Draw 1</button>
      <button class="secondary-btn" id="zm-shuffle">Shuffle Deck</button>
      <button class="secondary-btn" id="zm-refresh">Refresh</button>
    </div>
  `;
  ZONE_LIST.forEach(zone => {
    const contents = Solo.cardsIn(zone, zoneManagerSide);
    html += `<div class="zone-section-title">${ZONE_LABEL[zone]} (${contents.length})</div>`;
    if (contents.length === 0) {
      html += `<div class="zone-card-row"><span style="color:var(--text-dim);font-size:12px;">Empty</span></div>`;
    }
    contents.forEach(zc => {
      const statsBits = [];
      if (!isClimax(zc.card)) statsBits.push(`Lv${esc(zc.card.level)} C${esc(zc.card.cost)} P${powerOf(zc.card) + zc.powerModifier}`);
      if (zc.isReversed) statsBits.push('<span style="color:var(--red);">REVERSED</span>');
      if (zc.isResting) statsBits.push('<span style="color:var(--orange);">resting</span>');
      if (zc.powerModifier) statsBits.push(`<span style="color:var(--accent);">${zc.powerModifier > 0 ? '+' : ''}${zc.powerModifier}</span>`);
      const slot = zoneStageSlot(zone);
      html += `
        <div class="zone-card-row">
          <div class="info">
            <div class="name">${esc(zc.card.name)}</div>
            <div class="meta">${statsBits.join(' • ')}</div>
          </div>
          <div class="actions">
            ${slot ? `<button data-stage-menu="${zone}">⋯</button>` : ''}
            <button data-move="${zone}:${zc.index}">Move</button>
          </div>
        </div>`;
    });
  });

  openModal(html);

  document.getElementById('zm-side-human').addEventListener('click', () => { zoneManagerSide = 'human'; renderZoneManager(); });
  document.getElementById('zm-side-ai').addEventListener('click', () => { zoneManagerSide = 'ai'; renderZoneManager(); });
  document.getElementById('zm-draw').addEventListener('click', () => { Solo.manualDraw(zoneManagerSide); renderZoneManager(); });
  document.getElementById('zm-shuffle').addEventListener('click', () => { Solo.manualShuffleDeck(zoneManagerSide); renderZoneManager(); });
  document.getElementById('zm-refresh').addEventListener('click', () => { Solo.manualRefresh(zoneManagerSide); renderZoneManager(); });

  document.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [zone, idxStr] = btn.dataset.move.split(':');
      openMoveDestination(zoneManagerSide, zone, parseInt(idxStr));
    });
  });
  document.querySelectorAll('[data-stage-menu]').forEach(btn => {
    btn.addEventListener('click', () => {
      const zone = btn.dataset.stageMenu;
      const slot = zoneStageSlot(zone);
      openStageMenu(zoneManagerSide, slot);
    });
  });
}

function openStageMenu(side, slot) {
  const b = Solo.board(side);
  const inst = b.stage[slot];
  if (!inst) return;
  openModal(`
    <div class="modal-header"><h2>${esc(inst.card.name)}</h2><button class="text-btn" onclick="closeModal()">Close</button></div>
    <div class="modal-body">
      <button class="dest-btn" id="sm-toggle-rev">Toggle Reversed</button>
      <button class="dest-btn" id="sm-toggle-rest">Toggle Resting</button>
      <button class="dest-btn" id="sm-pow-up">Power +500</button>
      <button class="dest-btn" id="sm-pow-down">Power −500</button>
      <button class="dest-btn" id="sm-pow-reset">Reset Power Modifier</button>
    </div>
  `);
  document.getElementById('sm-toggle-rev').addEventListener('click', () => { Solo.manualToggle(side, slot, 'isReversed'); renderZoneManager(); });
  document.getElementById('sm-toggle-rest').addEventListener('click', () => { Solo.manualToggle(side, slot, 'isResting'); renderZoneManager(); });
  document.getElementById('sm-pow-up').addEventListener('click', () => { Solo.manualAdjustPower(side, slot, 500); renderZoneManager(); });
  document.getElementById('sm-pow-down').addEventListener('click', () => { Solo.manualAdjustPower(side, slot, -500); renderZoneManager(); });
  document.getElementById('sm-pow-reset').addEventListener('click', () => {
    const b2 = Solo.board(side);
    if (b2.stage[slot]) b2.stage[slot].powerModifier = 0;
    renderZoneManager();
  });
}

function openMoveDestination(fromSide, fromZone, index) {
  const contents = Solo.cardsIn(fromZone, fromSide);
  const zc = contents[index];
  if (!zc) return;
  let html = `
    <div class="modal-header"><h2>Move Card</h2><button class="text-btn" id="mv-cancel">Cancel</button></div>
    <div class="modal-body">
      <p><b>${esc(zc.card.name)}</b><br><span style="color:var(--text-dim);font-size:13px;">from ${ZONE_LABEL[fromZone]} (${fromSide === 'human' ? 'You' : 'CPU'})</span></p>
      <div class="dest-group-title">Move to — Your side</div>
      ${ZONE_LIST.map(z => destButtonHtml(z, 'human')).join('')}
      <div class="dest-group-title">Move to — CPU side</div>
      ${ZONE_LIST.map(z => destButtonHtml(z, 'ai')).join('')}
    </div>
  `;
  openModal(html);
  document.getElementById('mv-cancel').addEventListener('click', renderZoneManager);

  ZONE_LIST.forEach(z => {
    if (z === 'deck') {
      document.getElementById(`dest-${z}-human-top`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'human', z, true));
      document.getElementById(`dest-${z}-human-bottom`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'human', z, false));
      document.getElementById(`dest-${z}-ai-top`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'ai', z, true));
      document.getElementById(`dest-${z}-ai-bottom`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'ai', z, false));
    } else {
      document.getElementById(`dest-${z}-human`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'human', z, false));
      document.getElementById(`dest-${z}-ai`)?.addEventListener('click', () => doMove(fromSide, fromZone, index, 'ai', z, false));
    }
  });
}
function destButtonHtml(zone, side) {
  if (zone === 'deck') {
    return `<div class="dest-btn">${ZONE_LABEL[zone]}
      <div class="sub-btn-row">
        <button id="dest-${zone}-${side}-top">Top</button>
        <button id="dest-${zone}-${side}-bottom">Bottom</button>
      </div></div>`;
  }
  return `<button class="dest-btn" id="dest-${zone}-${side}">${ZONE_LABEL[zone]}</button>`;
}
function doMove(fromSide, fromZone, index, toSide, toZone, toTop) {
  Solo.manualMove(fromSide, fromZone, index, toSide, toZone, toTop);
  renderZoneManager();
}

// ============================================================================
// Init
// ============================================================================
showScreen('cards');
