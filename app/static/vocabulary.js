const vocabGame = document.querySelector('#vocab-game');
const vocabSessionSize = 10;
let vocabMode = 'cards';
let vocabCurrent = null;
let vocabTurn = 0;
let vocabCorrect = 0;
let vocabBusy = false;
const vocabSeen = new Set();
const vocabUi = {
  modes: [...document.querySelectorAll('.vocab-mode')],
  score: document.querySelector('#vocab-score'),
  round: document.querySelector('#vocab-round-label'),
  progress: document.querySelector('#vocab-progress'),
  promptLabel: document.querySelector('#vocab-prompt-label'),
  prompt: document.querySelector('#vocab-prompt'),
  tools: document.querySelector('#vocab-word-tools'),
  choices: document.querySelector('#vocab-choices'),
  typeArea: document.querySelector('#vocab-type-area'),
  typeInput: document.querySelector('#vocab-type-input'),
  keyboard: document.querySelector('#vocab-keyboard'),
  submit: document.querySelector('#vocab-submit'),
  feedback: document.querySelector('#vocab-feedback'),
  reveal: document.querySelector('#vocab-reveal'),
  again: document.querySelector('#vocab-again'),
  knew: document.querySelector('#vocab-knew'),
  next: document.querySelector('#vocab-next'),
  restart: document.querySelector('#vocab-restart'),
  summary: document.querySelector('#vocab-summary')
};

function setVocabFeedback(message, state = '') {
  vocabUi.feedback.textContent = message;
  vocabUi.feedback.className = `vocab-feedback ${state}`;
}

function showVocabControl(control) {
  for (const element of [vocabUi.reveal, vocabUi.again, vocabUi.knew, vocabUi.next, vocabUi.restart]) {
    element.classList.toggle('hidden', element !== control);
  }
}

function vocabularyQuestionUrl(exclude = [...vocabSeen]) {
  const exercise = vocabMode === 'quiz' ? 'mcq' : 'type';
  return appPath(`/api/quiz?exercise=${exercise}&exclude=${encodeURIComponent(exclude.join(','))}`);
}

async function startVocabGame(mode = vocabMode) {
  clearAutoAdvance();
  vocabMode = mode;
  vocabTurn = 0;
  vocabCorrect = 0;
  vocabCurrent = null;
  vocabSeen.clear();
  vocabUi.modes.forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  vocabUi.summary.classList.add('hidden');
  vocabUi.score.textContent = '0 / 10 justes';
  vocabUi.typeArea.classList.toggle('hidden', mode !== 'type');
  vocabUi.keyboard.classList.toggle('hidden', mode !== 'type');
  vocabUi.choices.classList.toggle('hidden', mode !== 'quiz');
  vocabUi.promptLabel.textContent = mode === 'quiz' ? 'Que signifie ce mot ?' : 'Trouvez le mot géorgien';
  vocabUi.prompt.classList.remove('ka');
  vocabUi.prompt.textContent = 'Préparation…';
  vocabUi.tools.replaceChildren();
  vocabUi.typeInput.value = '';
  vocabUi.typeInput.disabled = false;
  vocabUi.typeArea.classList.toggle('hidden', mode !== 'type');
  vocabUi.progress.style.width = '0%';
  setVocabFeedback('');
  await loadVocabularyWord();
}

async function loadVocabularyWord() {
  clearAutoAdvance();
  if (vocabTurn >= vocabSessionSize) {
    finishVocabGame();
    return;
  }
  vocabUi.round.textContent = `Mot ${vocabTurn + 1} / ${vocabSessionSize}`;
  vocabUi.progress.style.width = `${Math.round(vocabTurn / vocabSessionSize * 100)}%`;
  vocabUi.choices.replaceChildren();
  vocabUi.tools.replaceChildren();
  vocabUi.typeInput.value = '';
  vocabUi.typeInput.disabled = false;
  vocabUi.typeArea.classList.toggle('hidden', vocabMode !== 'type');
  vocabUi.choices.classList.toggle('hidden', vocabMode !== 'quiz');
  vocabUi.keyboard.classList.toggle('hidden', vocabMode !== 'type');
  vocabUi.reveal.classList.add('hidden');
  vocabUi.again.classList.add('hidden');
  vocabUi.knew.classList.add('hidden');
  vocabUi.next.classList.add('hidden');
  vocabUi.restart.classList.add('hidden');
  vocabUi.summary.classList.add('hidden');
  setVocabFeedback('');
  try {
    const response = await fetch(vocabularyQuestionUrl());
    const question = await response.json();
    if (!response.ok || question.empty) throw new Error('Question indisponible');
    vocabCurrent = question;
    vocabSeen.add(question.id);
    const isQuiz = vocabMode === 'quiz';
    vocabUi.prompt.textContent = question.question;
    vocabUi.prompt.classList.toggle('ka', isQuiz);
    if (isQuiz) {
      [...question.choices].sort(() => Math.random() - 0.5).forEach(choice => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.textContent = choice;
        button.addEventListener('click', () => answerVocabWord(choice, button));
        vocabUi.choices.append(button);
      });
    }
    if (vocabMode === 'cards') showVocabControl(vocabUi.reveal);
    if (vocabMode === 'type') vocabUi.typeInput.focus();
  } catch (_) {
    vocabUi.prompt.textContent = 'Le mot n’a pas pu être chargé';
    setVocabFeedback('Réessayez dans un instant.', 'try-again');
    vocabUi.restart.textContent = 'Réessayer →';
    vocabUi.restart.classList.remove('hidden');
  }
}

function showVocabAnswer(solution, translation, translit, example, exampleFr) {
  vocabUi.prompt.textContent = solution;
  vocabUi.prompt.classList.add('ka');
  const details = document.createElement('div');
  details.className = 'vocab-answer-details';
  const gloss = document.createElement('b');
  gloss.textContent = translation;
  const romanization = document.createElement('span');
  romanization.textContent = `${translit} · aide : ${vocabCurrent.pron || ''}`;
  const exampleLine = document.createElement('p');
  exampleLine.innerHTML = '';
  const exampleGeorgian = document.createElement('b');
  exampleGeorgian.className = 'ka';
  exampleGeorgian.textContent = example || '';
  const exampleTranslation = document.createElement('span');
  exampleTranslation.textContent = exampleFr || '';
  exampleLine.append(exampleGeorgian, exampleTranslation);
  details.append(gloss, romanization, exampleLine);
  vocabUi.tools.replaceChildren(details);
  const audio = document.createElement('button');
  audio.type = 'button';
  audio.className = 'audio-btn';
  audio.textContent = '▶ Écouter le mot';
  audio.dataset.original = audio.textContent;
  audio.addEventListener('click', () => playSpeech(solution, 'ka', audio));
  vocabUi.tools.append(audio);
}

async function recordVocabAnswer(answer, quality = 4) {
  if (!vocabCurrent || vocabBusy) return null;
  vocabBusy = true;
  try {
    const response = await fetch(appPath('/api/answer'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: vocabCurrent.id, kind: vocabMode === 'quiz' ? 'vocabulary' : 'type', answer, quality})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Réponse non enregistrée');
    if (result.correct) {
      vocabCorrect++;
      playSuccessSound();
    }
    vocabUi.score.textContent = `${vocabCorrect} / 10 justes`;
    vocabUi.progress.style.width = `${Math.round((vocabTurn + 1) / vocabSessionSize * 100)}%`;
    return result;
  } catch (_) {
    setVocabFeedback('Impossible d’enregistrer cette réponse. Réessayez.', 'try-again');
    return null;
  } finally {
    vocabBusy = false;
  }
}

function showAfterAnswer(result, wasRight) {
  vocabUi.typeInput.disabled = true;
  vocabUi.typeArea.classList.add('hidden');
  vocabUi.keyboard.classList.add('hidden');
  vocabUi.choices.querySelectorAll('button').forEach(button => button.disabled = true);
  showVocabAnswer(result.solution,
    vocabCurrent.fr, vocabCurrent.translit, vocabCurrent.example, vocabCurrent.example_fr);
  // The multiple-choice answer endpoint returns French; its Georgian prompt is the word being studied.
  if (vocabMode === 'quiz') vocabUi.prompt.textContent = vocabCurrent.prompt;
  setVocabFeedback(wasRight ? 'Bien joué, ce mot est pour vous !' : `Le mot signifie « ${vocabCurrent.fr} ».`, wasRight ? 'success' : 'try-again');
  showVocabControl(vocabUi.next);
  vocabTurn++;
}

async function answerVocabWord(answer, selectedButton = null) {
  const result = await recordVocabAnswer(answer);
  if (!result) return;
  const wasRight = result.correct;
  if (selectedButton) selectedButton.classList.add(wasRight ? 'choice-correct' : 'choice-wrong');
  if (vocabMode === 'quiz') {
    showVocabAnswer(vocabCurrent.prompt, vocabCurrent.fr, vocabCurrent.translit, vocabCurrent.example, vocabCurrent.example_fr);
    setVocabFeedback(wasRight ? 'Bonne réponse !' : `Pas tout à fait. « ${vocabCurrent.prompt} » signifie « ${vocabCurrent.fr} ».`, wasRight ? 'success' : 'try-again');
    showVocabControl(vocabUi.next);
    vocabTurn++;
    if (wasRight) scheduleAutoAdvance(loadVocabularyWord, 1900);
  } else {
    showAfterAnswer(result, wasRight);
    if (wasRight) scheduleAutoAdvance(loadVocabularyWord, 1900);
  }
}

function revealVocabCard() {
  if (!vocabCurrent) return;
  const answer = vocabCurrent.choices[0];
  showVocabAnswer(answer, vocabCurrent.fr, vocabCurrent.translit, vocabCurrent.example, vocabCurrent.example_fr);
  setVocabFeedback('Vous souveniez-vous du mot ?', '');
  vocabUi.reveal.classList.add('hidden');
  vocabUi.again.classList.remove('hidden');
  vocabUi.knew.classList.remove('hidden');
}

async function rateVocabCard(knew) {
  const answer = knew ? vocabCurrent.choices[0] : '';
  const result = await recordVocabAnswer(answer, knew ? 5 : 1);
  if (!result) return;
  setVocabFeedback(knew ? 'Bien joué, vous le connaissiez !' : 'Pas grave, il reviendra bientôt.', knew ? 'success' : 'try-again');
  showVocabControl(vocabUi.next);
  vocabTurn++;
  if (knew) scheduleAutoAdvance(loadVocabularyWord, 1900);
}

function finishVocabGame() {
  vocabUi.prompt.classList.remove('ka');
  vocabUi.prompt.textContent = vocabMode === 'cards' ? 'Belle mémoire !' : 'Séance terminée !';
  vocabUi.promptLabel.textContent = 'Votre résultat';
  vocabUi.choices.replaceChildren();
  vocabUi.tools.replaceChildren();
  vocabUi.typeArea.classList.add('hidden');
  vocabUi.keyboard.classList.add('hidden');
  vocabUi.reveal.classList.add('hidden');
  vocabUi.again.classList.add('hidden');
  vocabUi.knew.classList.add('hidden');
  vocabUi.next.classList.add('hidden');
  vocabUi.progress.style.width = '100%';
  vocabUi.summary.textContent = `${vocabCorrect} / ${vocabSessionSize} mots retrouvés. Les mots difficiles reviendront plus tôt dans vos révisions.`;
  vocabUi.summary.classList.remove('hidden');
  vocabUi.restart.textContent = 'Rejouer →';
  vocabUi.restart.classList.remove('hidden');
  vocabUi.score.textContent = `${vocabCorrect} / 10 justes`;
}

async function buildVocabKeyboard() {
  try {
    const letters = await fetch(appPath('/api/alphabet/keys')).then(response => response.json());
    for (let index = 0; index < letters.length; index += 11) {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      letters.slice(index, index + 11).forEach(letter => {
        const key = document.createElement('button');
        key.type = 'button'; key.className = 'key ka'; key.textContent = letter;
        key.addEventListener('click', () => { vocabUi.typeInput.value += letter; vocabUi.typeInput.focus(); });
        row.append(key);
      });
      vocabUi.keyboard.append(row);
    }
    const erase = document.createElement('button');
    erase.type = 'button'; erase.className = 'key key-wide'; erase.textContent = '⌫ Effacer';
    erase.addEventListener('click', () => { vocabUi.typeInput.value = vocabUi.typeInput.value.slice(0, -1); vocabUi.typeInput.focus(); });
    const row = document.createElement('div'); row.className = 'keyboard-row'; row.append(erase); vocabUi.keyboard.append(row);
  } catch (_) {
    vocabUi.keyboard.textContent = 'Clavier virtuel indisponible.';
  }
}

vocabUi.modes.forEach(button => button.addEventListener('click', () => startVocabGame(button.dataset.mode)));
vocabUi.reveal?.addEventListener('click', revealVocabCard);
vocabUi.again?.addEventListener('click', () => rateVocabCard(false));
vocabUi.knew?.addEventListener('click', () => rateVocabCard(true));
vocabUi.next?.addEventListener('click', () => {
  clearAutoAdvance();
  loadVocabularyWord();
});
vocabUi.restart?.addEventListener('click', () => startVocabGame(vocabMode));
vocabUi.submit?.addEventListener('click', () => answerVocabWord(vocabUi.typeInput.value));
vocabUi.typeInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); answerVocabWord(vocabUi.typeInput.value); }
});
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
buildVocabKeyboard();
startVocabGame('cards');
