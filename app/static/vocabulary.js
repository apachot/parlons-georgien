const vocabularyDataNode = document.querySelector('#vocabulary-data');
const vocabularyData = JSON.parse(vocabularyDataNode?.textContent || '{"items":[],"due_ids":[]}');
const vocabularyItems = vocabularyData.items || [];
const vocabularyDueIds = new Set(vocabularyData.due_ids || []);
const gameMenu = document.querySelector('.vocabulary-games-section');
const gameCatalog = document.querySelector('#vocabulary-home-catalog');
const gameScreen = document.querySelector('#vocabulary-game-screen');
const game = {
  round: document.querySelector('#game-round'),
  eyebrow: document.querySelector('#game-eyebrow'),
  title: document.querySelector('#game-title'),
  instruction: document.querySelector('#game-instruction'),
  score: document.querySelector('#game-score'),
  progress: document.querySelector('#game-progress-fill'),
  status: document.querySelector('#game-status'),
  direction: document.querySelector('#audio-direction'),
  audio: document.querySelector('#audio-question'),
  audioLabel: document.querySelector('#audio-prompt-label'),
  audioPrompt: document.querySelector('#audio-prompt'),
  audioReplay: document.querySelector('#audio-replay'),
  audioOptions: document.querySelector('#audio-options'),
  audioFeedback: document.querySelector('#audio-feedback'),
  audioAnswerTools: document.querySelector('#audio-answer-tools'),
  audioNext: document.querySelector('#audio-next'),
  matching: document.querySelector('#matching-game'),
  board: document.querySelector('#matching-board'),
  matchingFeedback: document.querySelector('#matching-feedback'),
  complete: document.querySelector('#game-complete'),
  completeMessage: document.querySelector('#complete-message'),
  back: document.querySelector('#back-to-games'),
  replay: document.querySelector('#play-again'),
  chooseAnother: document.querySelector('#choose-another-game'),
  crossword: document.querySelector('#crossword-game'),
  builder: document.querySelector('#sentence-builder-game'),
  crosswordBoard: document.querySelector('#crossword-board'),
  crosswordAcross: document.querySelector('#crossword-across-clues'),
  crosswordDown: document.querySelector('#crossword-down-clues'),
  crosswordCheck: document.querySelector('#crossword-check'),
  crosswordFeedback: document.querySelector('#crossword-feedback')
};
const crosswordKeyboard = {
  modal: document.querySelector('#crossword-keyboard-modal'),
  keys: document.querySelector('#crossword-keyboard-keys'),
  open: document.querySelector('#crossword-open-keyboard'),
  close: document.querySelector('.crossword-keyboard-close'),
  erase: document.querySelector('.crossword-keyboard-delete'),
  activeCell: null
};

const gameCopy = {
  pairs: {
    eyebrow: 'ASSOCIATION · DANS LES DEUX SENS',
    title: 'Retrouve les paires',
    instruction: 'Touchez un mot géorgien, puis sa traduction française. Les deux colonnes sont mélangées.',
    scoreUnit: 'paires'
  },
  audio: {
    eyebrow: 'ÉCOUTE & SENS · DEUX DIRECTIONS',
    title: 'À l’oreille',
    instruction: 'Écoutez la voix géorgienne et retrouvez le mot, ou partez du français pour choisir le géorgien.',
    scoreUnit: 'mots'
  },
  images: {
    eyebrow: 'ASSOCIATION · MOT & IMAGE',
    title: 'Mot ou image ?',
    instruction: 'Associez chaque mot géorgien à l’illustration correspondante. Les images donnent un indice de sens.',
    scoreUnit: 'images'
  },
  memory: {
    eyebrow: 'MÉMOIRE · GÉORGIEN & FRANÇAIS',
    title: 'Le mémory',
    instruction: 'Retournez deux cartes et retrouvez les paires géorgien–français.',
    scoreUnit: 'paires'
  },
  crossword: {
    eyebrow: 'MOTS FLÉCHÉS · ÉCRIRE EN MKHEDRULI',
    title: 'Mots fléchés',
    instruction: 'Suivez chaque définition en français et écrivez la réponse géorgienne, lettre par lettre.',
    scoreUnit: 'mots'
  },
  builder: {
    eyebrow: 'CONSTRUCTION · ORDRE DES MOTS',
    title: 'Construis la phrase',
    instruction: 'À partir du sens français, remettez les mots géorgiens dans le bon ordre.',
    scoreUnit: 'phrases'
  }
};

let activeGame = null;
let activeDirection = 'ka-fr';
let roundItems = [];
let roundIndex = 0;
let foundCount = 0;
let mistakeCount = 0;
let selectedTiles = [];
let boardLocked = false;
let currentAudioWord = null;
let answerBusy = false;
let crosswordPuzzle = null;
let crosswordActiveEntry = null;
let crosswordInputs = new Map();
let builderWords = [];
let builderSolved = false;

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function pickRoundItems(pool, size, uniqueBy = 'id') {
  const due = shuffled(pool.filter(item => vocabularyDueIds.has(item.id)));
  const other = shuffled(pool.filter(item => !vocabularyDueIds.has(item.id)));
  const used = new Set(), usedGeorgian = new Set(), usedFrench = new Set();
  return [...due, ...other].filter(item => {
    if (uniqueBy === 'pair') {
      if (usedGeorgian.has(item.ka) || usedFrench.has(item.fr)) return false;
      usedGeorgian.add(item.ka);
      usedFrench.add(item.fr);
      return true;
    }
    const key = item[uniqueBy];
    if (used.has(key)) return false;
    used.add(key);
    return true;
  }).slice(0, size);
}

function showGameStatus(message, type = '') {
  game.status.textContent = message;
  game.status.className = `game-status ${type}`;
}

function updateGameScore() {
  const unit = gameCopy[activeGame]?.scoreUnit || 'mots';
  game.score.textContent = `${foundCount} / ${roundItems.length} ${unit} · ${mistakeCount} erreur${mistakeCount === 1 ? '' : 's'}`;
}

function updateGameProgress() {
  const done = activeGame === 'audio' ? roundIndex : foundCount;
  game.progress.style.width = `${Math.round(done / Math.max(roundItems.length, 1) * 100)}%`;
}

function openGame(mode) {
  clearAutoAdvance();
  if (mode === 'catalog') {
    gameMenu.classList.add('hidden'); gameScreen.classList.add('hidden'); gameCatalog.classList.remove('hidden');
    return;
  }
  activeGame = mode;
  activeDirection = 'ka-fr';
  gameMenu.classList.add('hidden');
  gameCatalog.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  game.eyebrow.textContent = gameCopy[mode].eyebrow;
  game.title.textContent = gameCopy[mode].title;
  game.instruction.textContent = gameCopy[mode].instruction;
  game.direction.classList.toggle('hidden', mode !== 'audio');
  game.direction.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.direction === activeDirection));
  startRound();
}

function startRound() {
  clearAutoAdvance();
  roundIndex = 0;
  foundCount = 0;
  mistakeCount = 0;
  selectedTiles = [];
  boardLocked = false;
  answerBusy = false;
  currentAudioWord = null;
  crosswordPuzzle = null;
  game.crosswordCheck.disabled = false;
  game.complete.classList.add('hidden');
  game.audio.classList.toggle('hidden', activeGame !== 'audio');
  game.matching.classList.toggle('hidden', activeGame === 'audio' || activeGame === 'crossword' || activeGame === 'builder');
  game.crossword.classList.toggle('hidden', activeGame !== 'crossword');
  game.builder.classList.toggle('hidden', activeGame !== 'builder');
  game.audioNext.classList.add('hidden');
  game.audioAnswerTools.classList.add('hidden');
  game.audioFeedback.textContent = '';
  game.matchingFeedback.textContent = '';
  showGameStatus('');
  game.score.classList.remove('hidden');

  if (activeGame === 'builder') {
    roundItems = pickRoundItems(vocabularyItems.filter(item => item.example && item.example_fr && item.example.trim().split(/\s+/).length >= 3), 6);
    game.round.textContent = `Manche · ${roundItems.length} phrases`;
    renderSentenceBuilder();
  } else if (activeGame === 'crossword') {
    roundItems = [];
    game.round.textContent = 'Grille · préparation';
    game.crosswordBoard.replaceChildren();
    loadCrosswordRound();
  } else if (activeGame === 'audio') {
    roundItems = pickRoundItems(vocabularyItems, 10);
    showAudioQuestion();
  } else if (activeGame === 'images') {
    const uniquePictures = [...new Map(vocabularyItems.filter(item => item.image).map(item => [item.image, item])).values()];
    roundItems = pickRoundItems(uniquePictures, 6);
    game.round.textContent = `Manche · ${roundItems.length} associations`;
    renderMatchingBoard('image');
  } else {
    roundItems = pickRoundItems(vocabularyItems, 6, 'pair');
    game.round.textContent = `Manche · ${roundItems.length} paires`;
    renderMatchingBoard(activeGame === 'memory' ? 'memory' : 'pairs');
  }
  updateGameScore();
  updateGameProgress();
}

async function saveWordAnswer(item, kind, answer) {
  const response = await fetch(appPath('/api/answer'), {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: item.id, kind, answer})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'La réponse n’a pas pu être enregistrée.');
  return result;
}

async function loadCrosswordRound() {
  try {
    const response = await fetch(appPath('/api/crossword/next'));
    if (!response.ok) throw new Error('Grille indisponible');
    const puzzle = await response.json();
    if (activeGame !== 'crossword') return;
    crosswordPuzzle = puzzle;
    roundItems = crosswordPuzzle.entries.map(entry => vocabularyItems.find(item => item.id === entry.id)).filter(Boolean);
    game.round.textContent = `Grille · ${roundItems.length} mots croisés`;
    renderCrosswordBoard();
    updateGameScore(); updateGameProgress();
  } catch (_) {
    game.round.textContent = 'Grille indisponible';
    showGameStatus('Impossible de composer la grille. Réessayez.', 'error');
  }
}

function renderSentenceBuilder() {
  if (roundIndex >= roundItems.length) { finishGame(); return; }
  const item = roundItems[roundIndex];
  builderWords = item.example.trim().split(/\s+/).map((text, index) => ({id: index, text}));
  builderSolved = false;
  document.querySelector('#builder-prompt').textContent = item.example_fr;
  document.querySelector('#builder-answer').replaceChildren();
  document.querySelector('#builder-bank').replaceChildren();
  document.querySelector('#builder-feedback').textContent = '';
  document.querySelector('#builder-feedback').className = 'feedback';
  document.querySelector('#builder-check').classList.remove('hidden');
  document.querySelector('#builder-next').classList.add('hidden');
  document.querySelector('#builder-next').textContent = 'Phrase suivante →';
  document.querySelector('#builder-check').disabled = false;
  shuffled(builderWords).forEach(word => createBuilderChip(word, document.querySelector('#builder-bank')));
  updateGameScore(); updateGameProgress();
}

function createBuilderChip(word, holder) {
  const chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'sentence-builder-chip ka'; chip.lang = 'ka';
  chip.dataset.wordId = String(word.id); chip.textContent = word.text;
  chip.addEventListener('click', () => {
    if (builderSolved) return;
    const destination = chip.parentElement.id === 'builder-bank' ? document.querySelector('#builder-answer') : document.querySelector('#builder-bank');
    destination.append(chip);
  });
  holder.append(chip);
}

async function checkSentenceBuilder() {
  if (activeGame !== 'builder' || answerBusy || builderSolved) return;
  const answerHolder = document.querySelector('#builder-answer');
  if (answerHolder.children.length !== builderWords.length) {
    const feedback = document.querySelector('#builder-feedback');
    feedback.textContent = 'Placez tous les mots dans la phrase avant de vérifier.';
    feedback.className = 'feedback try-again';
    return;
  }
  const item = roundItems[roundIndex];
  const answer = [...answerHolder.children].map(chip => chip.textContent).join(' ');
  answerBusy = true;
  const check = document.querySelector('#builder-check'); check.disabled = true;
  try {
    const result = await saveWordAnswer(item, 'order', answer);
    const feedback = document.querySelector('#builder-feedback');
    if (!result.correct) {
      mistakeCount++;
      feedback.textContent = 'L’ordre ne convient pas encore. Déplacez les mots et réessayez.';
      feedback.className = 'feedback try-again';
      updateGameScore(); check.disabled = false;
      return;
    }
    builderSolved = true; foundCount++;
    [...document.querySelectorAll('#builder-answer button, #builder-bank button')].forEach(button => button.disabled = true);
    feedback.textContent = `Bonne phrase ! ${item.example}`;
    feedback.className = 'feedback success';
    document.querySelector('#builder-check').classList.add('hidden');
    const next = document.querySelector('#builder-next');
    next.textContent = foundCount >= roundItems.length ? 'Voir le résultat →' : 'Phrase suivante →';
    next.classList.remove('hidden'); playSuccessSound(); updateGameScore(); updateGameProgress();
  } catch (_) {
    const feedback = document.querySelector('#builder-feedback');
    feedback.textContent = 'La phrase n’a pas pu être vérifiée. Réessayez.';
    feedback.className = 'feedback try-again'; check.disabled = false;
  } finally { answerBusy = false; }
}

function renderCrosswordBoard() {
  const {rows, columns, entries} = crosswordPuzzle;
  game.crosswordBoard.replaceChildren();
  game.crosswordAcross.replaceChildren();
  game.crosswordDown.replaceChildren();
  game.crosswordFeedback.textContent = '';
  crosswordInputs = new Map();
  crosswordActiveEntry = null;
  if (!crosswordKeyboard.keys.childElementCount) renderCrosswordKeyboard();

  const lettersAt = new Map();
  const numbersAt = new Map();
  const entriesAt = new Map();
  entries.forEach(entry => {
    const start = entry.cells[0].join(',');
    numbersAt.set(start, Math.min(numbersAt.get(start) || Infinity, entry.number));
    entry.cells.forEach(([row, column], index) => {
      const key = `${row},${column}`;
      lettersAt.set(key, entry.ka[index]);
      if (!entriesAt.has(key)) entriesAt.set(key, []);
      entriesAt.get(key).push(entry);
    });
  });

  game.crosswordBoard.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  game.crosswordBoard.setAttribute('aria-rowcount', String(rows));
  game.crosswordBoard.setAttribute('aria-colcount', String(columns));
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const key = `${row},${column}`;
    const square = document.createElement('div');
    square.className = `crossword-square${lettersAt.has(key) ? '' : ' blocked'}`;
    square.setAttribute('role', 'gridcell');
    if (!lettersAt.has(key)) { game.crosswordBoard.append(square); continue; }
    if (numbersAt.has(key)) {
      const number = document.createElement('small'); number.className = 'crossword-square-number';
      number.textContent = String(numbersAt.get(key)); square.append(number);
    }
    const input = document.createElement('input');
    input.className = 'crossword-cell ka'; input.lang = 'ka'; input.maxLength = 1;
    input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('aria-label', `Case ${row + 1}, ${column + 1}`);
    input.addEventListener('focus', () => { crosswordKeyboard.activeCell = input; });
    input.addEventListener('click', () => {
      if (!crosswordActiveEntry || !crosswordActiveEntry.cells.some(cell => cell[0] === row && cell[1] === column)) {
        const choices = entriesAt.get(key) || [];
        setCrosswordActiveEntry(choices[0]);
      }
      openCrosswordKeyboard(input);
    });
    input.addEventListener('input', () => {
      input.value = [...input.value].slice(-1).join('');
      input.classList.remove('crossword-wrong-cell');
      if (input.value && crosswordActiveEntry) focusCrosswordNextCell(input, crosswordActiveEntry, 1);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && crosswordActiveEntry) {
        event.preventDefault(); focusCrosswordNextCell(input, crosswordActiveEntry, -1);
      }
      if (event.key === 'Enter') { event.preventDefault(); checkCrosswordGrid(); }
    });
    crosswordInputs.set(key, input);
    square.append(input); game.crosswordBoard.append(square);
  }

  entries.forEach(entry => {
    const list = entry.direction === 'across' ? game.crosswordAcross : game.crosswordDown;
    const item = document.createElement('li');
    const clue = document.createElement('button'); clue.type = 'button'; clue.className = 'crossword-clue-button';
    clue.dataset.entryId = entry.id;
    const number = document.createElement('b'); number.textContent = String(entry.number);
    const direction = document.createElement('span'); direction.className = 'crossword-clue-arrow';
    direction.textContent = entry.direction === 'across' ? '→' : '↓';
    const definition = document.createElement('span'); definition.textContent = entry.fr;
    clue.append(number, direction, definition);
    clue.addEventListener('click', () => setCrosswordActiveEntry(entry));
    item.append(clue); list.append(item);
  });
  const first = entries.find(entry => entry.direction === 'across') || entries[0];
  setCrosswordActiveEntry(first);
}

function setCrosswordActiveEntry(entry) {
  if (!entry) return;
  crosswordActiveEntry = entry;
  document.querySelectorAll('.crossword-clue-button').forEach(button => {
    button.classList.toggle('active', button.dataset.entryId === entry.id);
  });
  const activeCells = new Set(entry.cells.map(cell => cell.join(',')));
  crosswordInputs.forEach((input, key) => input.classList.toggle('crossword-active-cell', activeCells.has(key)));
  const firstEmpty = entry.cells.map(([row, column]) => crosswordInputs.get(`${row},${column}`)).find(input => input && !input.value);
  const first = firstEmpty || crosswordInputs.get(entry.cells[0].join(','));
  first?.focus({preventScroll: true});
}

function focusCrosswordNextCell(input, entry, direction) {
  const key = [...crosswordInputs.entries()].find(([, candidate]) => candidate === input)?.[0];
  const index = entry.cells.findIndex(cell => cell.join(',') === key);
  const next = entry.cells[index + direction];
  if (next) crosswordInputs.get(next.join(','))?.focus();
}

function renderCrosswordKeyboard() {
  const letters = [...'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ'];
  for (let index = 0; index < letters.length; index += 11) {
    const row = document.createElement('div'); row.className = 'crossword-keyboard-row';
    letters.slice(index, index + 11).forEach(letter => {
      const key = document.createElement('button'); key.type = 'button'; key.className = 'crossword-key ka'; key.textContent = letter;
      key.setAttribute('aria-label', `Insérer ${letter}`);
      key.addEventListener('click', () => {
        const cell = crosswordKeyboard.activeCell || game.crosswordBoard.querySelector('.crossword-cell:not(:disabled)');
        if (!cell) return;
        crosswordKeyboard.activeCell = cell;
        cell.value = letter;
        cell.dispatchEvent(new Event('input', {bubbles: true}));
      });
      row.append(key);
    });
    crosswordKeyboard.keys.append(row);
  }
}

function openCrosswordKeyboard(cell = crosswordKeyboard.activeCell) {
  crosswordKeyboard.activeCell = cell || game.crosswordBoard.querySelector('.crossword-cell:not(:disabled)');
  crosswordKeyboard.modal.classList.remove('hidden');
  crosswordKeyboard.keys.querySelector('.crossword-key')?.focus();
}

function closeCrosswordKeyboard() {
  crosswordKeyboard.modal.classList.add('hidden');
  crosswordKeyboard.activeCell?.focus({preventScroll: true});
}

crosswordKeyboard.open?.addEventListener('click', () => openCrosswordKeyboard());
crosswordKeyboard.close?.addEventListener('click', closeCrosswordKeyboard);
crosswordKeyboard.modal?.addEventListener('click', event => {
  if (event.target === crosswordKeyboard.modal) closeCrosswordKeyboard();
});
crosswordKeyboard.erase?.addEventListener('click', () => {
  const cell = crosswordKeyboard.activeCell;
  if (!cell) return;
  if (!cell.value) {
    if (crosswordActiveEntry) focusCrosswordNextCell(cell, crosswordActiveEntry, -1);
    const previous = crosswordKeyboard.activeCell;
    if (previous && previous !== cell) { previous.value = ''; previous.focus(); return; }
  }
  cell.value = '';
  cell.focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !crosswordKeyboard.modal?.classList.contains('hidden')) closeCrosswordKeyboard();
});
game.crosswordCheck.addEventListener('click', checkCrosswordGrid);

async function checkCrosswordGrid() {
  if (answerBusy || !crosswordPuzzle || !roundItems.length) return;
  const missing = [...crosswordInputs.values()].some(input => !input.value);
  if (missing) {
    game.crosswordFeedback.textContent = 'Remplissez toutes les cases avant de vérifier la grille.';
    game.crosswordFeedback.className = 'feedback try-again'; return;
  }
  const wrong = new Set();
  crosswordPuzzle.entries.forEach(entry => entry.cells.forEach(([row, column], index) => {
    const key = `${row},${column}`;
    if (crosswordInputs.get(key)?.value !== entry.ka[index]) wrong.add(key);
  }));
  crosswordInputs.forEach((input, key) => input.classList.toggle('crossword-wrong-cell', wrong.has(key)));
  if (wrong.size) {
    mistakeCount++; updateGameScore();
    game.crosswordFeedback.textContent = 'Il reste des lettres à corriger. Les cases en couleur ne correspondent pas aux croisements.';
    game.crosswordFeedback.className = 'feedback try-again'; return;
  }
  answerBusy = true; game.crosswordCheck.disabled = true;
  try {
    for (const item of roundItems) {
      const result = await saveWordAnswer(item, 'type', item.ka);
      if (!result.correct) throw new Error('Correction impossible');
    }
    foundCount = roundItems.length;
    crosswordInputs.forEach(input => { input.disabled = true; });
    document.querySelectorAll('.crossword-clue-button').forEach(button => {
      button.disabled = true; button.classList.add('solved');
    });
    game.crosswordFeedback.textContent = `Grille réussie ! ${foundCount} mots croisés.`;
    game.crosswordFeedback.className = 'feedback success';
    playSuccessSound(); updateGameScore(); updateGameProgress();
    scheduleAutoAdvance(finishGame, 1000);
  } catch (_) {
    game.crosswordCheck.disabled = false;
    showGameStatus('La progression n’a pas pu être enregistrée. Réessayez.', 'error');
  } finally { answerBusy = false; }
}

function renderMatchingBoard(boardMode) {
  game.board.className = `matching-board board-${boardMode}`;
  game.board.replaceChildren();
  const tiles = [];
  roundItems.forEach(item => {
    tiles.push({id: item.id, item, side: 'ka'});
    if (boardMode === 'image') tiles.push({id: item.id, item, side: 'image'});
    else tiles.push({id: item.id, item, side: 'fr'});
  });
  shuffled(tiles).forEach(tile => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `matching-tile tile-${tile.side}`;
    button.dataset.id = tile.id;
    button.dataset.side = tile.side;
    if (boardMode === 'memory') {
      button.classList.add('memory-hidden');
      button.setAttribute('aria-label', 'Carte cachée');
      button.innerHTML = '<span aria-hidden="true">✦</span>';
    } else {
      fillMatchingTile(button, tile);
    }
    button.addEventListener('click', () => selectMatchingTile(button, tile, boardMode));
    game.board.append(button);
  });
}

function fillMatchingTile(button, tile) {
  button.replaceChildren();
  if (tile.side === 'ka') {
    button.textContent = tile.item.ka;
    button.lang = 'ka';
    button.classList.add('ka');
  } else if (tile.side === 'fr') {
    button.textContent = tile.item.fr;
  } else {
    const image = document.createElement('img');
    image.src = tile.item.image;
    image.alt = tile.item.image_alt;
    image.loading = 'lazy';
    button.append(image);
  }
}

async function selectMatchingTile(button, tile, boardMode) {
  if (boardLocked || button.disabled || button.classList.contains('matched')) return;
  const selectedIndex = selectedTiles.findIndex(entry => entry.button === button);
  if (selectedIndex !== -1) {
    selectedTiles.splice(selectedIndex, 1);
    button.classList.remove('selected');
    if (boardMode === 'memory') {
      button.classList.add('memory-hidden');
      button.setAttribute('aria-label', 'Carte cachée');
      button.innerHTML = '<span aria-hidden="true">✦</span>';
    }
    return;
  }
  if (boardMode === 'memory') {
    button.classList.remove('memory-hidden');
    fillMatchingTile(button, tile);
    button.setAttribute('aria-label', tile.side === 'ka' ? tile.item.ka : tile.item.fr);
  }
  button.classList.add('selected');
  selectedTiles.push({button, tile});
  if (selectedTiles.length < 2) return;
  boardLocked = true;
  const [first, second] = selectedTiles;
  const isPair = first.tile.id === second.tile.id && first.tile.side !== second.tile.side;
  if (isPair) {
    const item = first.tile.item;
    first.button.classList.remove('selected'); second.button.classList.remove('selected');
    first.button.classList.add('matched'); second.button.classList.add('matched');
    first.button.disabled = true; second.button.disabled = true;
    foundCount++;
    game.matchingFeedback.textContent = `${item.ka} · ${item.fr}`;
    game.matchingFeedback.className = 'feedback success';
    playSuccessSound();
    updateGameScore(); updateGameProgress();
    selectedTiles = [];
    try {
      const kind = boardMode === 'image' ? 'type' : 'vocabulary';
      await saveWordAnswer(item, kind, boardMode === 'image' ? item.ka : item.fr);
    } catch (_) {
      showGameStatus('La paire est trouvée, mais sa progression n’a pas pu être enregistrée.', 'error');
    }
    boardLocked = false;
    if (foundCount === roundItems.length) scheduleAutoAdvance(finishGame, 800);
    return;
  }

  mistakeCount++;
  game.matchingFeedback.textContent = 'Ces deux cartes ne vont pas ensemble. Réessayez !';
  game.matchingFeedback.className = 'feedback try-again';
  updateGameScore();
  try {
    const firstItem = first.tile.item;
    const kind = first.tile.side === 'fr' ? 'vocabulary' : 'type';
    await saveWordAnswer(firstItem, kind, '__wrong__');
  } catch (_) {
    showGameStatus('La progression n’a pas pu être enregistrée.', 'error');
  }
  window.setTimeout(() => {
    first.button.classList.remove('selected'); second.button.classList.remove('selected');
    if (boardMode === 'memory') {
      [first, second].forEach(({button: card}) => {
        card.classList.add('memory-hidden');
        card.classList.remove('ka');
        card.setAttribute('aria-label', 'Carte cachée');
        card.innerHTML = '<span aria-hidden="true">✦</span>';
      });
    }
    selectedTiles = [];
    boardLocked = false;
  }, boardMode === 'memory' ? 900 : 650);
}

function showAudioQuestion() {
  if (roundIndex >= roundItems.length) {
    finishGame();
    return;
  }
  clearAutoAdvance();
  currentAudioWord = roundItems[roundIndex];
  const isGeorgianAudio = activeDirection === 'ka-fr';
  game.round.textContent = `Question ${roundIndex + 1} / ${roundItems.length}`;
  game.audioLabel.textContent = isGeorgianAudio ? 'Écoutez le mot géorgien' : 'Lisez le mot français';
  game.audioPrompt.textContent = isGeorgianAudio ? 'Quel mot entendez-vous ?' : currentAudioWord.fr;
  game.audioPrompt.classList.toggle('ka', false);
  game.audioReplay.classList.toggle('hidden', !isGeorgianAudio);
  game.audioReplay.disabled = false;
  game.audioFeedback.textContent = '';
  game.audioFeedback.className = 'feedback';
  game.audioAnswerTools.classList.add('hidden');
  game.audioAnswerTools.replaceChildren();
  game.audioNext.classList.add('hidden');
  game.audioOptions.replaceChildren();
  showGameStatus('');
  const correctText = isGeorgianAudio ? currentAudioWord.fr : currentAudioWord.ka;
  const field = isGeorgianAudio ? 'fr' : 'ka';
  const otherChoices = shuffled(vocabularyItems.filter(item => item.id !== currentAudioWord.id && item[field] !== correctText));
  const choices = [currentAudioWord];
  const usedLabels = new Set([correctText]);
  for (const candidate of otherChoices) {
    if (usedLabels.has(candidate[field])) continue;
    usedLabels.add(candidate[field]);
    choices.push(candidate);
    if (choices.length === 4) break;
  }
  shuffled(choices).forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice ${field === 'ka' ? 'ka' : ''}`;
    button.textContent = item[field];
    button.addEventListener('click', () => answerAudioChoice(item[field], button, isGeorgianAudio));
    game.audioOptions.append(button);
  });
  updateGameProgress();
  if (isGeorgianAudio) playSpeech(currentAudioWord.ka, 'ka', game.audioReplay);
}

async function answerAudioChoice(value, selectedButton, isGeorgianAudio) {
  if (!currentAudioWord || answerBusy) return;
  answerBusy = true;
  game.audioOptions.querySelectorAll('button').forEach(button => button.disabled = true);
  const kind = isGeorgianAudio ? 'vocabulary' : 'type';
  try {
    const result = await saveWordAnswer(currentAudioWord, kind, value);
    if (result.correct) {
      foundCount++;
      roundIndex++;
      selectedButton.classList.add('choice-correct');
      game.audioFeedback.textContent = 'Oui, c’est bien le mot entendu !';
      game.audioFeedback.className = 'feedback success';
      playSuccessSound();
      showAudioAnswer(currentAudioWord);
      game.audioNext.classList.remove('hidden');
      updateGameScore(); updateGameProgress();
      scheduleAutoAdvance(showAudioQuestion, 1800);
    } else {
      mistakeCount++;
      selectedButton.classList.add('choice-wrong');
      game.audioOptions.querySelectorAll('button').forEach(button => button.disabled = button === selectedButton);
      game.audioFeedback.textContent = 'Pas tout à fait. Gardez cette question et réessayez avec une autre réponse.';
      game.audioFeedback.className = 'feedback try-again';
      updateGameScore();
    }
  } catch (_) {
    game.audioOptions.querySelectorAll('button').forEach(button => button.disabled = false);
    showGameStatus('Impossible d’enregistrer la réponse. Réessayez.', 'error');
  } finally {
    answerBusy = false;
  }
}

function showAudioAnswer(item) {
  game.audioAnswerTools.replaceChildren();
  const word = document.createElement('b');
  word.className = 'ka audio-answer-word';
  word.textContent = item.ka;
  const translation = document.createElement('span');
  translation.textContent = item.fr;
  const pronunciation = document.createElement('small');
  pronunciation.textContent = `${item.translit} · aide approximative : ${item.pron}`;
  const replay = document.createElement('button');
  replay.type = 'button'; replay.className = 'audio-btn'; replay.textContent = '▶ Écouter';
  replay.addEventListener('click', () => playSpeech(item.ka, 'ka', replay));
  game.audioAnswerTools.append(word, translation, pronunciation, replay);
  game.audioAnswerTools.classList.remove('hidden');
}

function finishGame() {
  clearAutoAdvance();
  game.audio.classList.add('hidden');
  game.matching.classList.add('hidden');
  game.crossword.classList.add('hidden');
  game.builder.classList.add('hidden');
  game.complete.classList.remove('hidden');
  game.completeMessage.textContent = `${foundCount} ${gameCopy[activeGame].scoreUnit} retrouvés · ${mistakeCount} erreur${mistakeCount === 1 ? '' : 's'}. Votre progression est enregistrée.`;
  game.score.classList.add('hidden');
  game.round.textContent = 'Manche terminée';
  game.progress.style.width = '100%';
  showGameStatus('');
}

function returnToGameHome() {
  clearAutoAdvance();
  activeGame = null;
  gameScreen.classList.add('hidden');
  gameMenu.classList.remove('hidden');
  gameCatalog.classList.add('hidden');
}

document.querySelectorAll('.vocabulary-module').forEach(button => {
  button.addEventListener('click', () => openGame(button.dataset.module));
});
game.back.addEventListener('click', returnToGameHome);
document.querySelector('#back-to-vocabulary-games')?.addEventListener('click', returnToGameHome);
game.replay.addEventListener('click', startRound);
game.chooseAnother.addEventListener('click', returnToGameHome);
document.querySelector('#builder-check')?.addEventListener('click', checkSentenceBuilder);
document.querySelector('#builder-reset')?.addEventListener('click', () => {
  if (activeGame !== 'builder' || builderSolved) return;
  const bank = document.querySelector('#builder-bank');
  [...document.querySelector('#builder-answer').children].forEach(chip => bank.append(chip));
  shuffled([...bank.children]).forEach(chip => bank.append(chip));
  document.querySelector('#builder-feedback').textContent = '';
  document.querySelector('#builder-feedback').className = 'feedback';
});
document.querySelector('#builder-next')?.addEventListener('click', () => {
  if (activeGame !== 'builder') return;
  roundIndex++;
  if (roundIndex >= roundItems.length) finishGame();
  else renderSentenceBuilder();
});
game.audioReplay.addEventListener('click', () => {
  if (currentAudioWord) playSpeech(currentAudioWord.ka, 'ka', game.audioReplay);
});
game.audioNext.addEventListener('click', () => {
  clearAutoAdvance();
  if (roundIndex >= roundItems.length) finishGame();
  else showAudioQuestion();
});
game.direction.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
  if (activeDirection === button.dataset.direction) return;
  activeDirection = button.dataset.direction;
  game.direction.querySelectorAll('button').forEach(option => option.classList.toggle('active', option === button));
  startRound();
}));

document.querySelector('#word-search')?.addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase('fr');
  const cards = [...document.querySelectorAll('.vocab-card')];
  const shown = cards.filter(card => {
    const visible = card.dataset.search.toLocaleLowerCase('fr').includes(query);
    card.hidden = !visible;
    return visible;
  }).length;
  document.querySelector('#catalog-count').textContent = `${shown} mot${shown === 1 ? '' : 's'}`;
});
