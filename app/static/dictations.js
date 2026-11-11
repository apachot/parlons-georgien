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
  const sessionLimit = Math.min(dictationSessionSize, dictationTotal);
  if (dictationSessionNumber >= sessionLimit || dictationIds.size >= dictationTotal) {
    finishDictationSession();
    return;
  }

  dictationElements.heading.textContent = 'Préparation du mot…';
  dictationElements.listen.disabled = true;
  setAnswerButtons();
  const exclude = [...dictationIds].join(',');
  try {
    const response = await fetch(appPath(`/api/dictations/next?exclude=${encodeURIComponent(exclude)}`));
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
    dictationElements.heading.textContent = 'Écoutez le mot, puis écrivez-le';
    dictationElements.instruction.textContent = 'Le mot reste caché. Réécoutez-le autant de fois que nécessaire.';
    dictationElements.input.value = '';
    dictationElements.listen.disabled = false;
    dictationElements.summary.classList.add('hidden');
    setFeedback('');
    setAnswerButtons({checking: true});
  } catch (_) {
    dictationElements.heading.textContent = 'La dictée n’a pas pu se charger';
    setFeedback('Vérifiez votre connexion puis réessayez.', 'try-again');
    dictationElements.start.textContent = 'Réessayer →';
    dictationElements.start.classList.remove('hidden');
  }
}

async function playDictationWord() {
  if (!dictationCurrentId || dictationBusy) return;
  dictationElements.listen.disabled = true;
  const original = dictationElements.listen.textContent;
  dictationElements.listen.textContent = 'Chargement…';
  try {
    const response = await fetch(appPath(`/api/dictations/audio/${encodeURIComponent(dictationCurrentId)}`));
    if (!response.ok) throw new Error('audio absent');
    const source = URL.createObjectURL(await response.blob());
    dictationAudio?.pause();
    dictationAudio = new Audio(source);
    dictationAudio.addEventListener('ended', () => {
      URL.revokeObjectURL(source);
      dictationElements.listen.disabled = false;
      dictationElements.listen.textContent = original;
    }, {once: true});
    dictationElements.listen.textContent = '▶ Lecture…';
    await dictationAudio.play();
  } catch (_) {
    dictationElements.listen.disabled = false;
    dictationElements.listen.textContent = original;
    setFeedback('Audio indisponible pour le moment. Réessayez dans un instant.', 'try-again');
  }
}

async function submitDictation(answer, skipped = false) {
  if (!dictationCurrentId || dictationBusy) return;
  if (!skipped && !answer.trim()) {
    setFeedback('Écrivez le mot entendu, ou passez au mot suivant.', 'try-again');
    return;
  }
  dictationBusy = true;
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
      if (dictationAttempts === 1) dictationFirstTryCorrect++;
      dictationElements.heading.textContent = result.solution;
      dictationElements.heading.classList.add('ka');
      dictationElements.instruction.textContent = `${result.fr} · ${result.translit}`;
      setFeedback(dictationAttempts === 1 ? 'Bravo, juste du premier coup !' : 'Bien joué, vous l’avez retrouvé.', 'success');
      dictationElements.listen.disabled = true;
      setAnswerButtons({next: true});
    } else if (skipped) {
      dictationElements.heading.textContent = result.solution;
      dictationElements.heading.classList.add('ka');
      dictationElements.instruction.textContent = `${result.fr} · ${result.translit}`;
      setFeedback('La réponse était affichée ci-dessus. Écoutez-la encore avant de continuer.', 'try-again');
      dictationElements.listen.disabled = true;
      setAnswerButtons({next: true});
    } else {
      dictationElements.instruction.textContent = `Sens : ${result.fr} · Aide de lecture : ${result.translit}`;
      setFeedback('Pas tout à fait. Réécoutez le mot et essayez encore.', 'try-again');
      dictationElements.input.focus();
    }
  } catch (_) {
    setFeedback('La correction n’a pas pu être enregistrée. Réessayez.', 'try-again');
  } finally {
    dictationBusy = false;
    dictationElements.check.disabled = false;
    dictationElements.skip.disabled = false;
  }
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
dictationElements.next?.addEventListener('click', loadNextDictation);
dictationElements.input?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitDictation(dictationElements.input.value);
  }
});
buildDictationKeyboard();
