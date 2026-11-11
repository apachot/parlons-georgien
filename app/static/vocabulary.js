const vocabularyDataNode = document.querySelector('#vocabulary-data');
const vocabularyData = JSON.parse(vocabularyDataNode?.textContent || '{"items":[],"due_ids":[]}');
const vocabularyItems = vocabularyData.items || [];
const vocabularyDueIds = new Set(vocabularyData.due_ids || []);
const gameHome = document.querySelector('#vocabulary-home');
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
  crosswordBoard: document.querySelector('#crossword-board'),
  crosswordFeedback: document.querySelector('#crossword-feedback')
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
    title: 'La grille géorgienne',
    instruction: 'Suivez chaque définition en français et écrivez la réponse géorgienne, lettre par lettre.',
    scoreUnit: 'mots'
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
    gameHome.classList.add('hidden'); gameScreen.classList.add('hidden'); gameCatalog.classList.remove('hidden');
    gameCatalog.scrollIntoView({behavior: 'smooth', block: 'start'});
    return;
  }
  activeGame = mode;
  activeDirection = 'ka-fr';
  gameHome.classList.add('hidden');
  gameCatalog.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  game.eyebrow.textContent = gameCopy[mode].eyebrow;
  game.title.textContent = gameCopy[mode].title;
  game.instruction.textContent = gameCopy[mode].instruction;
  game.direction.classList.toggle('hidden', mode !== 'audio');
  game.direction.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.direction === activeDirection));
  startRound();
  gameScreen.scrollIntoView({behavior: 'smooth', block: 'start'});
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
  game.complete.classList.add('hidden');
  game.audio.classList.toggle('hidden', activeGame !== 'audio');
  game.matching.classList.toggle('hidden', activeGame === 'audio' || activeGame === 'crossword');
  game.crossword.classList.toggle('hidden', activeGame !== 'crossword');
  game.audioNext.classList.add('hidden');
  game.audioAnswerTools.classList.add('hidden');
  game.audioFeedback.textContent = '';
  game.matchingFeedback.textContent = '';
  showGameStatus('');
  game.score.classList.remove('hidden');

  if (activeGame === 'crossword') {
    const eligible = vocabularyItems.filter(item => item.ka && !/\s/.test(item.ka.trim()) && [...item.ka].length >= 3 && item.fr);
    roundItems = pickRoundItems(eligible, 6, 'fr');
    game.round.textContent = `Grille · ${roundItems.length} définitions`;
    renderCrosswordBoard();
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

function renderCrosswordBoard() {
  game.crosswordBoard.replaceChildren();
  game.crosswordFeedback.textContent = '';
  roundItems.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'crossword-entry'; row.dataset.id = item.id;
    const clue = document.createElement('div'); clue.className = 'crossword-clue';
    const number = document.createElement('small'); number.textContent = `${String(index + 1).padStart(2, '0')} · DÉFINITION`;
    const label = document.createElement('b'); label.textContent = item.fr;
    const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
    clue.append(number, label, arrow);
    const cells = document.createElement('div'); cells.className = 'crossword-cells';
    [...item.ka].forEach((_, position) => {
      const input = document.createElement('input'); input.className = 'crossword-cell ka'; input.lang = 'ka';
      input.maxLength = 1; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('aria-label', `Définition ${index + 1}, lettre ${position + 1}`);
      input.addEventListener('input', () => {
        input.value = [...input.value].slice(-1).join('');
        if (input.value && cells.children[position + 1]) cells.children[position + 1].focus();
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Backspace' && !input.value && cells.children[position - 1]) cells.children[position - 1].focus();
        if (event.key === 'Enter') { event.preventDefault(); checkCrosswordEntry(row, item); }
      });
      cells.append(input);
    });
    const check = document.createElement('button'); check.type = 'button'; check.className = 'crossword-check'; check.textContent = 'Vérifier';
    check.addEventListener('click', () => checkCrosswordEntry(row, item));
    row.append(clue, cells, check); game.crosswordBoard.append(row);
  });
}

async function checkCrosswordEntry(row, item) {
  if (row.classList.contains('solved') || answerBusy) return;
  const answer = [...row.querySelectorAll('.crossword-cell')].map(cell => cell.value).join('');
  if (!answer) {
    game.crosswordFeedback.textContent = 'Écrivez le mot dans les cases avant de vérifier.';
    game.crosswordFeedback.className = 'feedback try-again'; return;
  }
  answerBusy = true;
  try {
    const result = await saveWordAnswer(item, 'type', answer);
    if (!result.correct) {
      mistakeCount++; updateGameScore();
      row.classList.add('crossword-error');
      game.crosswordFeedback.textContent = 'Pas tout à fait. Corrigez les cases puis réessayez.';
      game.crosswordFeedback.className = 'feedback try-again';
      window.setTimeout(() => row.classList.remove('crossword-error'), 550);
      return;
    }
    foundCount++; row.classList.add('solved');
    row.querySelectorAll('input,button').forEach(control => control.disabled = true);
    game.crosswordFeedback.textContent = `Bien trouvé : ${item.ka} · ${item.fr}`;
    game.crosswordFeedback.className = 'feedback success';
    playSuccessSound(); updateGameScore(); updateGameProgress();
    if (foundCount === roundItems.length) scheduleAutoAdvance(finishGame, 900);
  } catch (_) {
    showGameStatus('La réponse n’a pas pu être vérifiée. Réessayez.', 'error');
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
  gameHome.classList.remove('hidden');
  gameCatalog.classList.add('hidden');
  gameHome.scrollIntoView({behavior: 'smooth', block: 'start'});
}

document.querySelectorAll('.vocabulary-module').forEach(button => {
  button.addEventListener('click', () => openGame(button.dataset.module));
});
game.back.addEventListener('click', returnToGameHome);
document.querySelector('#back-to-vocabulary-games')?.addEventListener('click', returnToGameHome);
game.replay.addEventListener('click', startRound);
game.chooseAnother.addEventListener('click', returnToGameHome);
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
