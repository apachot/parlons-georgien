const readingRoot = document.querySelector('#reading');
const readingTotal = Number(readingRoot?.dataset.total || 0);
const readingSessionSize = Math.min(12, readingTotal);
const readingSeenIds = new Map([[1, new Set()], [2, new Set()], [3, new Set()], [4, new Set()]]);
const reading = {
  count: document.querySelector('#reading-count'),
  level: document.querySelector('#reading-level'),
  text: document.querySelector('#reading-text'),
  question: document.querySelector('#reading-question'),
  options: document.querySelector('#reading-options'),
  feedback: document.querySelector('#reading-feedback'),
  reveal: document.querySelector('#reading-reveal'),
  meter: document.querySelector('#reading-meter-fill'),
  start: document.querySelector('#reading-start'),
  next: document.querySelector('#reading-next'),
  summary: document.querySelector('#reading-summary')
};
let readingTurn = 0;
let readingCorrect = 0;
let readingCurrent = null;
let readingBusy = false;

function setReadingFeedback(message, state = '') {
  reading.feedback.textContent = message;
  reading.feedback.className = `feedback ${state}`;
}

function startReadingSession() {
  readingTurn = 0;
  readingCorrect = 0;
  readingCurrent = null;
  for (const ids of readingSeenIds.values()) ids.clear();
  reading.start.classList.add('hidden');
  reading.summary.classList.add('hidden');
  reading.reveal.classList.add('hidden');
  loadReadingQuestion();
}

async function loadReadingQuestion() {
  clearAutoAdvance();
  if (readingTurn >= readingSessionSize) {
    finishReadingSession();
    return;
  }
  const level = Math.floor(readingTurn / 3) + 1;
  readingCurrent = null;
  reading.options.replaceChildren();
  reading.text.textContent = 'Préparation du texte…';
  reading.question.textContent = '';
  reading.level.textContent = `Niveau ${level} · ${['Premiers repères', 'Petits textes du quotidien', 'Repérer le temps des actions', 'Comprendre les détails'][level - 1]}`;
  reading.count.textContent = `Séance · ${readingTurn + 1} / ${readingSessionSize}`;
  reading.meter.style.width = `${Math.round(readingTurn / readingSessionSize * 100)}%`;
  reading.reveal.classList.add('hidden');
  reading.next.classList.add('hidden');
  reading.start.classList.add('hidden');
  setReadingFeedback('');
  try {
    const exclude = [...readingSeenIds.get(level)].join(',');
    const response = await fetch(appPath(`/api/reading/next?level=${level}&exclude=${encodeURIComponent(exclude)}`));
    const item = await response.json();
    if (!response.ok || item.empty) throw new Error(item.error || 'Texte indisponible');
    readingCurrent = item;
    readingSeenIds.get(level).add(item.id);
    reading.text.textContent = item.text;
    reading.question.textContent = item.question;
    item.options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      button.textContent = option;
      button.addEventListener('click', () => answerReading(option, button));
      reading.options.append(button);
    });
  } catch (_) {
    reading.text.textContent = 'Le texte n’a pas pu être chargé';
    setReadingFeedback('Réessayez dans un instant.', 'try-again');
    reading.start.textContent = 'Réessayer →';
    reading.start.classList.remove('hidden');
  }
}

async function answerReading(answer, selected) {
  if (!readingCurrent || readingBusy) return;
  readingBusy = true;
  reading.options.querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    const response = await fetch(appPath('/api/reading/answer'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: readingCurrent.id, answer})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Correction impossible');
    if (result.correct) {
      readingCorrect++;
      selected.classList.add('choice-correct');
      playSuccessSound();
    } else {
      selected.classList.add('choice-wrong');
    }
    reading.feedback.textContent = result.correct ? 'Oui, vous avez bien compris !' : 'Pas tout à fait : voici le sens du texte.';
    reading.feedback.className = `feedback ${result.correct ? 'success' : 'try-again'}`;
    reading.reveal.textContent = `${result.translation} — ${result.explanation}`;
    reading.reveal.classList.remove('hidden');
    reading.next.classList.remove('hidden');
    readingTurn++;
    reading.meter.style.width = `${Math.round(readingTurn / readingSessionSize * 100)}%`;
    if (result.correct) scheduleAutoAdvance(loadReadingQuestion, 2400);
  } catch (_) {
    reading.options.querySelectorAll('button').forEach(button => button.disabled = false);
    setReadingFeedback('La réponse n’a pas pu être enregistrée. Réessayez.', 'try-again');
  } finally {
    readingBusy = false;
  }
}

function finishReadingSession() {
  const percentage = readingSessionSize ? Math.round(readingCorrect * 100 / readingSessionSize) : 0;
  reading.text.textContent = 'Lecture terminée';
  reading.question.textContent = 'Chaque texte travaillé est enregistré pour vos prochaines révisions.';
  reading.level.textContent = 'Votre progression';
  reading.options.replaceChildren();
  reading.next.classList.add('hidden');
  reading.reveal.classList.add('hidden');
  setReadingFeedback('');
  reading.meter.style.width = '100%';
  reading.summary.textContent = `${readingCorrect} / ${readingSessionSize} bonnes réponses (${percentage} %). Les textes difficiles reviendront plus tôt.`;
  reading.summary.classList.remove('hidden');
  reading.start.textContent = 'Recommencer →';
  reading.start.classList.remove('hidden');
}

reading.start?.addEventListener('click', startReadingSession);
reading.next?.addEventListener('click', () => {
  clearAutoAdvance();
  loadReadingQuestion();
});
