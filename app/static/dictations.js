const dictationRoot = document.querySelector('#dictation');
const dictationSessionSize = 10;
let dictationTotal = Number(dictationRoot?.dataset.totalWords || 0);
let dictationIds = new Set();
let dictationCurrentId = null;
let dictationSessionNumber = 0;
let dictationFirstTryCorrect = 0;
let dictationAttempts = 0;
let dictationBusy = false;
let dictationAudio = null;
let dictationAudioSource = null;
let dictationAudioRequest = 0;
let dictationDirection = 'ka-fr';

const dictationElements = {
  heading: document.querySelector('#dictation-heading'),
  instruction: document.querySelector('#dictation-instruction'),
  count: document.querySelector('#dictation-count'),
  input: document.querySelector('#dictation-input'),
  area: document.querySelector('#dictation-answer-area'),
  keyboard: document.querySelector('#dictation-keyboard'),
  feedback: document.querySelector('#dictation-feedback'),
  listen: document.querySelector('#dictation-listen'),
  start: document.querySelector('#dictation-start'),
  check: document.querySelector('#dictation-check'),
  skip: document.querySelector('#dictation-skip'),
  next: document.querySelector('#dictation-next'),
  summary: document.querySelector('#dictation-summary')
};
const dictationAnswerLabel = document.querySelector('#dictation-answer-label');

function setFeedback(message, state = '') {
  dictationElements.feedback.textContent = message;
  dictationElements.feedback.className = `feedback ${state}`;
}

function setAnswerButtons({checking = false, next = false} = {}) {
  dictationElements.check.classList.toggle('hidden', !checking);
  dictationElements.skip.classList.toggle('hidden', !checking);
  dictationElements.next.classList.toggle('hidden', !next);
  dictationElements.input.disabled = !checking;
  dictationElements.keyboard.querySelectorAll('button').forEach(button => button.disabled = !checking);
}

async function startDictationSession() {
  dictationIds = new Set();
  dictationSessionNumber = 0;
  dictationFirstTryCorrect = 0;
  dictationElements.start.classList.add('hidden');
  dictationElements.summary.classList.add('hidden');
  dictationElements.area.classList.remove('hidden');
  dictationElements.count.textContent = `Séance · 0 / ${Math.min(dictationSessionSize, dictationTotal)} mots`;
  await loadNextDictation();
}

async function loadNextDictation() {
  clearAutoAdvance();
  const sessionLimit = Math.min(dictationSessionSize, dictationTotal);
  if (dictationSessionNumber >= sessionLimit || dictationIds.size >= dictationTotal) {
    finishDictationSession();
    return;
  }

  dictationElements.heading.textContent = 'Préparation du mot…';
  stopDictationAudio();
  dictationElements.listen.disabled = true;
  setAnswerButtons();
  const exclude = [...dictationIds].join(',');
  try {
    const response = await fetch(appPath(`/api/dictations/next?direction=${dictationDirection}&exclude=${encodeURIComponent(exclude)}`));
    const result = await response.json();
    if (!response.ok || result.empty) {
      finishDictationSession();
      return;
    }
    dictationCurrentId = result.id;
    dictationIds.add(result.id);
    dictationAttempts = 0;
    dictationSessionNumber++;
    dictationElements.heading.classList.remove('ka');
    dictationElements.count.textContent = `Séance · ${dictationSessionNumber} / ${sessionLimit} mots`;
    dictationElements.heading.textContent = dictationDirection === 'ka-fr' ? 'Écoutez le mot, puis écrivez-le' : result.prompt;
    dictationElements.instruction.textContent = dictationDirection === 'ka-fr'
      ? 'Le mot reste caché. Réécoutez-le autant de fois que nécessaire.'
      : 'Traduisez ce mot en géorgien et écrivez-le en mkhedruli.';
    dictationAnswerLabel.textContent = dictationDirection === 'ka-fr' ? 'Votre réponse en géorgien' : 'Traduction en géorgien';
    dictationElements.input.placeholder = dictationDirection === 'ka-fr' ? 'Tapez le mot entendu' : 'Écrivez le mot géorgien';
    dictationElements.listen.classList.toggle('hidden', dictationDirection !== 'ka-fr');
    dictationElements.input.value = '';
    dictationElements.listen.disabled = false;
    dictationElements.summary.classList.add('hidden');
    setFeedback('');
    setAnswerButtons({checking: true});
    if (dictationDirection === 'ka-fr') void playDictationWord();
  } catch (_) {
    dictationElements.heading.textContent = 'La dictée n’a pas pu se charger';
    setFeedback('Vérifiez votre connexion puis réessayez.', 'try-again');
    dictationElements.start.textContent = 'Réessayer →';
    dictationElements.start.classList.remove('hidden');
  }
}

async function playDictationWord() {
  if (!dictationCurrentId || dictationBusy || dictationDirection !== 'ka-fr') return;
  stopDictationAudio();
  const requestId = ++dictationAudioRequest;
  const itemId = dictationCurrentId;
  dictationElements.listen.disabled = true;
  const original = dictationElements.listen.textContent;
  dictationElements.listen.textContent = 'Chargement…';
  let audioLoaded = false;
  try {
    const response = await fetch(appPath(`/api/dictations/audio/${encodeURIComponent(itemId)}`));
    if (!response.ok) throw new Error('audio absent');
    const source = URL.createObjectURL(await response.blob());
    audioLoaded = true;
    if (requestId !== dictationAudioRequest || itemId !== dictationCurrentId) {
      URL.revokeObjectURL(source);
      return;
    }
    dictationAudioSource = source;
    dictationAudio = new Audio(source);
    const currentAudio = dictationAudio;
    const finishAudio = () => {
      if (dictationAudio === currentAudio) {
        stopDictationAudio();
        dictationElements.listen.disabled = false;
        dictationElements.listen.textContent = original;
      }
    };
    dictationAudio.addEventListener('ended', finishAudio, {once: true});
    dictationAudio.addEventListener('error', finishAudio, {once: true});
    dictationElements.listen.textContent = '▶ Lecture…';
    await dictationAudio.play();
  } catch (_) {
    if (requestId !== dictationAudioRequest || itemId !== dictationCurrentId) return;
    stopDictationAudio();
    dictationElements.listen.disabled = false;
    dictationElements.listen.textContent = original;
    setFeedback(audioLoaded
      ? 'Votre navigateur a bloqué la lecture automatique. Touchez « Réécouter le mot » pour lancer l’audio.'
      : 'Audio indisponible pour ce mot. Vous pouvez continuer la dictée.', 'try-again');
  }
}

function stopDictationAudio() {
  dictationAudioRequest++;
  if (dictationAudio) {
    dictationAudio.pause();
    dictationAudio.src = '';
    dictationAudio = null;
  }
  if (dictationAudioSource) {
    URL.revokeObjectURL(dictationAudioSource);
    dictationAudioSource = null;
  }
  dictationElements.listen.textContent = '↻ Réécouter le mot';
}

async function submitDictation(answer, skipped = false) {
  if (!dictationCurrentId || dictationBusy) return;
  if (!skipped && !answer.trim()) {
    setFeedback(dictationDirection === 'ka-fr' ? 'Écrivez le mot entendu, ou passez au mot suivant.' : 'Écrivez la traduction géorgienne avant de continuer.', 'try-again');
    return;
  }
  dictationBusy = true;
  let replayWord = false;
  dictationElements.check.disabled = true;
  dictationElements.skip.disabled = true;
  try {
    const response = await fetch(appPath('/api/dictations/answer'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: dictationCurrentId, answer: skipped ? '' : answer})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Correction impossible');
    dictationAttempts++;
    if (result.correct) {
      playSuccessSound();
      if (dictationAttempts === 1) dictationFirstTryCorrect++;
      dictationElements.heading.textContent = result.solution;
      dictationElements.heading.classList.add('ka');
      dictationElements.instruction.textContent = `${result.fr} · ${result.translit}`;
      setFeedback(dictationAttempts === 1 ? 'Bravo, juste du premier coup !' : 'Bien joué, vous l’avez retrouvé.', 'success');
      dictationElements.listen.disabled = true;
      setAnswerButtons({next: true});
      scheduleAutoAdvance(loadNextDictation, 1900);
    } else if (skipped) {
      dictationElements.heading.textContent = result.solution;
      dictationElements.heading.classList.add('ka');
      dictationElements.instruction.textContent = `${result.fr} · ${result.translit}`;
      setFeedback(dictationDirection === 'ka-fr' ? 'La réponse était affichée ci-dessus. Écoutez-la encore avant de continuer.' : 'La réponse était affichée ci-dessus. Relisez-la avant de continuer.', 'try-again');
      dictationElements.listen.disabled = true;
      setAnswerButtons({next: true});
      replayWord = dictationDirection === 'ka-fr';
    } else {
      dictationElements.instruction.textContent = dictationDirection === 'ka-fr'
        ? `Sens : ${result.fr} · Aide de lecture : ${result.translit}`
        : `Aide de lecture : ${result.translit} · Gardez votre traduction et corrigez-la.`;
      setFeedback(dictationDirection === 'ka-fr' ? 'Pas tout à fait. Réécoutez le mot et essayez encore.' : 'Pas tout à fait. Gardez la question et corrigez votre réponse.', 'try-again');
      dictationElements.input.focus();
      replayWord = dictationDirection === 'ka-fr';
    }
  } catch (_) {
    setFeedback('La correction n’a pas pu être enregistrée. Réessayez.', 'try-again');
  } finally {
    dictationBusy = false;
    dictationElements.check.disabled = false;
    dictationElements.skip.disabled = false;
  }
  if (replayWord) window.setTimeout(playDictationWord, 160);
}

function finishDictationSession() {
  const total = dictationSessionNumber;
  const percentage = total ? Math.round(dictationFirstTryCorrect * 100 / total) : 0;
  dictationCurrentId = null;
  dictationElements.listen.disabled = true;
  dictationElements.heading.classList.remove('ka');
  dictationElements.heading.textContent = 'Séance terminée';
  dictationElements.instruction.textContent = 'Les mots difficiles reviendront plus vite lors des prochaines révisions.';
  dictationElements.count.textContent = 'Dictées de mots';
  setFeedback('');
  setAnswerButtons();
  dictationElements.area.classList.add('hidden');
  dictationElements.summary.textContent = total
    ? `${dictationFirstTryCorrect} / ${total} mots justes du premier coup (${percentage} %). Votre progression est enregistrée.`
    : 'Il n’y a plus de mots dans cette séance.';
  dictationElements.summary.classList.remove('hidden');
  dictationElements.start.textContent = 'Recommencer →';
  dictationElements.start.classList.remove('hidden');
}

async function buildDictationKeyboard() {
  try {
    const letters = await fetch(appPath('/api/alphabet/keys')).then(response => response.json());
    for (let index = 0; index < letters.length; index += 7) {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      letters.slice(index, index + 7).forEach(letter => {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'key ka';
        key.textContent = letter;
        key.addEventListener('click', () => {
          dictationElements.input.value += letter;
          dictationElements.input.focus();
        });
        row.append(key);
      });
      dictationElements.keyboard.append(row);
    }
    const controls = document.createElement('div');
    controls.className = 'keyboard-row';
    const erase = document.createElement('button');
    erase.type = 'button';
    erase.className = 'key key-wide';
    erase.textContent = '⌫ Effacer';
    erase.addEventListener('click', () => {
      dictationElements.input.value = dictationElements.input.value.slice(0, -1);
      dictationElements.input.focus();
    });
    controls.append(erase);
    dictationElements.keyboard.append(controls);
  } catch (_) {
    dictationElements.keyboard.textContent = 'Le clavier virtuel est indisponible.';
  }
}

dictationElements.start?.addEventListener('click', startDictationSession);
dictationElements.listen?.addEventListener('click', playDictationWord);
dictationElements.check?.addEventListener('click', () => submitDictation(dictationElements.input.value));
dictationElements.skip?.addEventListener('click', () => submitDictation('', true));
dictationElements.next?.addEventListener('click', () => {
  clearAutoAdvance();
  loadNextDictation();
});
dictationElements.input?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitDictation(dictationElements.input.value);
  }
});
document.querySelectorAll('[data-dictation-direction]').forEach(button => button.addEventListener('click', () => {
  clearAutoAdvance(); stopDictationAudio(); dictationCurrentId = null;
  dictationDirection = button.dataset.dictationDirection;
  document.querySelectorAll('[data-dictation-direction]').forEach(option => option.classList.toggle('active', option === button));
  dictationElements.heading.textContent = 'Prête ou prêt à commencer ?';
  dictationElements.heading.classList.toggle('ka', false);
  dictationElements.instruction.textContent = dictationDirection === 'ka-fr'
    ? 'Le mot reste caché pendant l’écoute. Vous pouvez le réécouter autant de fois que nécessaire.'
    : 'Lisez le mot français, puis écrivez sa traduction en géorgien.';
  dictationElements.listen.classList.toggle('hidden', dictationDirection !== 'ka-fr');
  dictationElements.start.textContent = 'Commencer →';
  dictationElements.start.classList.remove('hidden');
  dictationElements.summary.classList.add('hidden');
  dictationElements.area.classList.add('hidden');
}));
buildDictationKeyboard();

const sentenceRoot = document.querySelector('#dictation-sentences');
if (sentenceRoot) {
  const sentence = {
    count: document.querySelector('#sentence-dictation-count'),
    heading: document.querySelector('#sentence-dictation-heading'),
    prompt: document.querySelector('#sentence-dictation-prompt'),
    input: document.querySelector('#sentence-dictation-input'),
    keyboard: document.querySelector('#sentence-dictation-keyboard'),
    feedback: document.querySelector('#sentence-dictation-feedback'),
    answer: document.querySelector('#sentence-dictation-answer'),
    start: document.querySelector('#sentence-dictation-start'),
    check: document.querySelector('#sentence-dictation-check'),
    next: document.querySelector('#sentence-dictation-next'),
    summary: document.querySelector('#sentence-dictation-summary')
  };
  const total = Number(sentenceRoot.dataset.totalSentences || 0);
  const sessionSize = Math.min(6, total);
  let seen = new Set(), current = null, turn = 0, firstTry = 0, attempts = 0, busy = false;

  function sentenceFeedback(message, state = '') {
    sentence.feedback.textContent = message;
    sentence.feedback.className = `feedback ${state}`;
  }

  async function loadSentence() {
    if (turn >= sessionSize) return finishSentenceSession();
    current = null; sentence.input.value = ''; sentence.input.disabled = false;
    sentence.keyboard.querySelectorAll('button').forEach(button => button.disabled = false);
    sentence.check.disabled = false; sentence.check.classList.remove('hidden'); sentence.next.classList.add('hidden');
    sentence.answer.classList.add('hidden'); sentenceFeedback('');
    sentence.count.textContent = `Phrases · ${turn + 1} / ${sessionSize}`;
    try {
      const response = await fetch(appPath(`/api/dictations/sentences/next?exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error('Phrase indisponible');
      current = item; seen.add(item.id); attempts = 0; sentence.prompt.textContent = item.prompt;
      sentence.input.focus();
    } catch (_) {
      sentenceFeedback('La phrase n’a pas pu être chargée. Réessayez.', 'try-again');
      sentence.check.classList.add('hidden'); sentence.start.textContent = 'Réessayer →'; sentence.start.classList.remove('hidden');
    }
  }

  async function checkSentence() {
    if (!current || busy) return;
    if (!sentence.input.value.trim()) {
      sentenceFeedback('Écrivez votre traduction avant de vérifier.', 'try-again'); return;
    }
    busy = true; sentence.check.disabled = true;
    try {
      const response = await fetch(appPath('/api/dictations/sentences/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: current.id, answer: sentence.input.value})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      attempts++;
      if (!result.correct) {
        sentence.check.disabled = false;
        sentenceFeedback('Pas tout à fait. Corrigez votre phrase et réessayez.', 'try-again');
        offerSkipButton(sentence.feedback, () => {
          turn++;
          loadSentence();
        }, 'Passer cette phrase →');
        sentence.input.focus(); return;
      }
      if (attempts === 1) firstTry++;
      turn++; sentence.input.value = result.solution; sentence.input.disabled = true;
      sentence.keyboard.querySelectorAll('button').forEach(button => button.disabled = true);
      sentence.answer.textContent = result.explanation; sentence.answer.classList.remove('hidden');
      sentenceFeedback(attempts === 1 ? 'Bien joué, juste du premier coup !' : 'Bonne correction, la phrase est juste.', 'success');
      sentence.check.classList.add('hidden'); sentence.next.textContent = turn >= sessionSize ? 'Voir le résultat →' : 'Phrase suivante →';
      sentence.next.classList.remove('hidden'); playSuccessSound();
    } catch (_) {
      sentence.check.disabled = false; sentenceFeedback('La réponse n’a pas pu être vérifiée. Réessayez.', 'try-again');
    } finally { busy = false; }
  }

  function finishSentenceSession() {
    current = null; sentence.prompt.textContent = 'Séance terminée.'; sentence.count.textContent = 'Traduction de phrases';
    sentence.input.disabled = true; sentence.keyboard.querySelectorAll('button').forEach(button => button.disabled = true);
    sentence.check.classList.add('hidden'); sentence.next.classList.add('hidden'); sentence.answer.classList.add('hidden'); sentenceFeedback('');
    sentence.summary.textContent = `${firstTry} / ${turn} phrases justes du premier coup. Votre progression est enregistrée.`;
    sentence.summary.classList.remove('hidden'); sentence.start.textContent = 'Recommencer →'; sentence.start.classList.remove('hidden');
  }

  async function buildSentenceKeyboard() {
    try {
      const letters = await fetch(appPath('/api/alphabet/keys')).then(response => response.json());
      for (let index = 0; index < letters.length; index += 7) {
        const row = document.createElement('div'); row.className = 'keyboard-row';
        letters.slice(index, index + 7).forEach(letter => {
          const key = document.createElement('button'); key.type = 'button'; key.className = 'key ka'; key.textContent = letter;
          key.addEventListener('click', () => { sentence.input.value += letter; sentence.input.focus(); }); row.append(key);
        });
        sentence.keyboard.append(row);
      }
      const controls = document.createElement('div'); controls.className = 'keyboard-row';
      const erase = document.createElement('button'); erase.type = 'button'; erase.className = 'key key-wide'; erase.textContent = '⌫ Effacer';
      erase.addEventListener('click', () => { sentence.input.value = sentence.input.value.slice(0, -1); sentence.input.focus(); });
      const space = document.createElement('button'); space.type = 'button'; space.className = 'key key-wide'; space.textContent = 'Espace';
      space.addEventListener('click', () => { sentence.input.value += ' '; sentence.input.focus(); });
      controls.append(space, erase); sentence.keyboard.append(controls);
    } catch (_) { sentence.keyboard.textContent = 'Le clavier géorgien est indisponible.'; }
  }

  sentence.start.addEventListener('click', () => {
    seen = new Set(); current = null; turn = 0; firstTry = 0; sentence.summary.classList.add('hidden');
    sentence.start.classList.add('hidden'); sentence.input.disabled = false; loadSentence();
  });
  sentence.check.addEventListener('click', checkSentence);
  sentence.next.addEventListener('click', loadSentence);
  sentence.input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); checkSentence(); }
  });
  buildSentenceKeyboard();
}
