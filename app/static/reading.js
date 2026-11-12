const oralClipCache = new Map();
const oralPlayerUrls = new WeakMap();
const oralPlayerRequests = new WeakMap();

function stopOralPlayer(player) {
  if (!player) return;
  oralPlayerRequests.set(player, null);
  player.querySelector('audio')?.pause();
  player.classList.add('hidden');
}

async function loadOralPlayer(player, text) {
  if (!player) return;
  const audio = player.querySelector('audio');
  const status = player.querySelector('.oral-player-status');
  const speed = player.querySelector('.oral-speed');
  const requestToken = Symbol('oral-audio-request');
  oralPlayerRequests.set(player, requestToken);
  player.classList.remove('hidden');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  const previousUrl = oralPlayerUrls.get(audio);
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  oralPlayerUrls.delete(audio);
  status.textContent = 'Préparation de l’enregistrement…';
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  const cacheKey = `ka\0${normalized}`;
  try {
    let blobPromise = oralClipCache.get(cacheKey);
    if (!blobPromise) {
      blobPromise = fetch(appPath('/api/audio'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lang: 'ka', text: normalized})
      }).then(async response => {
        if (!response.ok) throw new Error('Enregistrement indisponible');
        return response.blob();
      });
      oralClipCache.set(cacheKey, blobPromise);
    }
    const blob = await blobPromise;
    if (oralPlayerRequests.get(player) !== requestToken) return;
    const url = URL.createObjectURL(blob);
    oralPlayerUrls.set(audio, url);
    audio.src = url;
    audio.playbackRate = Number(speed.value || 1);
    audio.load();
    status.textContent = 'Écoute prête : vous pouvez mettre sur pause, vous déplacer dans le passage et régler la vitesse.';
    try {
      await audio.play();
      if (oralPlayerRequests.get(player) === requestToken) status.textContent = 'Lecture en cours.';
    } catch (_) {
      if (oralPlayerRequests.get(player) === requestToken) status.textContent = 'Appuyez sur ▶ dans le lecteur pour commencer.';
    }
  } catch (_) {
    if (oralPlayerRequests.get(player) === requestToken) status.textContent = 'L’enregistrement n’a pas pu être chargé. Réessayez en lançant le passage à nouveau.';
    oralClipCache.delete(cacheKey);
  }
}

document.querySelectorAll('[data-oral-player]').forEach(player => {
  const audio = player.querySelector('audio');
  const speed = player.querySelector('.oral-speed');
  const rewind = player.querySelector('.oral-rewind');
  const status = player.querySelector('.oral-player-status');
  speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value); });
  rewind.addEventListener('click', () => {
    try { audio.currentTime = Math.max(0, audio.currentTime - 5); } catch (_) {}
  });
  audio.addEventListener('ended', () => { status.textContent = 'Fin du passage.'; });
  audio.addEventListener('error', () => { status.textContent = 'Erreur de lecture. Essayez de recharger le passage.'; });
});
document.querySelectorAll('.activity-card[href^="#"], [data-activity-back]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-oral-player]').forEach(player => player.querySelector('audio')?.pause());
  });
});

window.addEventListener('pagehide', () => {
  document.querySelectorAll('[data-oral-player] audio').forEach(audio => {
    const url = oralPlayerUrls.get(audio);
    if (url) URL.revokeObjectURL(url);
  });
});

const readingRoot = document.querySelector('#reading');
const readingTotal = Number(readingRoot?.dataset.total || 0);
const readingSessionSize = Math.min(12, readingTotal);
const readingSeenIds = new Map([[1, new Set()], [2, new Set()], [3, new Set()], [4, new Set()]]);
const reading = {
  count: document.querySelector('#reading-count'),
  level: document.querySelector('#reading-level'),
  text: document.querySelector('#reading-text'),
  audio: document.querySelector('#reading-player'),
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
  reading.text.textContent = readingRoot.dataset.oral === 'true' ? '' : 'Préparation du texte…';
  stopOralPlayer(reading.audio);
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
    if (readingRoot.dataset.oral === 'true') {
      reading.text.textContent = '';
      reading.audio.classList.remove('hidden');
      loadOralPlayer(reading.audio, item.text);
    } else reading.text.textContent = item.text;
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
    reading.text.textContent = readingRoot.dataset.oral === 'true' ? '' : 'Le texte n’a pas pu être chargé';
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
      reading.feedback.textContent = 'Oui, vous avez bien compris !';
      reading.feedback.className = 'feedback success';
      reading.reveal.textContent = `${result.translation} — ${result.explanation}`;
      reading.reveal.classList.remove('hidden');
      reading.next.classList.remove('hidden');
      readingTurn++;
      reading.meter.style.width = `${Math.round(readingTurn / readingSessionSize * 100)}%`;
      scheduleAutoAdvance(loadReadingQuestion, 2400);
    } else {
      selected.classList.add('choice-wrong');
      reading.options.querySelectorAll('button').forEach(button => button.disabled = button === selected);
      reading.feedback.textContent = readingRoot.dataset.oral === 'true'
        ? 'Pas tout à fait. Réécoutez le passage et essayez une autre proposition.'
        : 'Pas tout à fait. Gardez le texte affiché et réessayez avec une autre proposition.';
      reading.feedback.className = 'feedback try-again';
      offerSkipButton(reading.feedback, () => {
        clearAutoAdvance();
        readingTurn++;
        loadReadingQuestion();
      }, 'Passer ce texte →');
    }
  } catch (_) {
    reading.options.querySelectorAll('button').forEach(button => button.disabled = false);
    setReadingFeedback('La réponse n’a pas pu être enregistrée. Réessayez.', 'try-again');
  } finally {
    readingBusy = false;
  }
}

function finishReadingSession() {
  const percentage = readingSessionSize ? Math.round(readingCorrect * 100 / readingSessionSize) : 0;
  reading.text.textContent = readingRoot.dataset.oral === 'true' ? ' ' : 'Lecture terminée';
  reading.question.textContent = 'Chaque texte travaillé est enregistré pour vos prochaines révisions.';
  reading.level.textContent = 'Votre progression';
  reading.options.replaceChildren();
  stopOralPlayer(reading.audio);
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

const examRoot = document.querySelector('#reading-exam');
const exam = {
  level: document.querySelector('#exam-level'), title: document.querySelector('#exam-title'),
  clock: document.querySelector('#exam-clock'), meter: document.querySelector('#exam-meter'),
  text: document.querySelector('#exam-text'), audio: document.querySelector('#exam-player'), questionArea: document.querySelector('#exam-question-area'),
  questionCount: document.querySelector('#exam-question-count'), question: document.querySelector('#exam-question'),
  options: document.querySelector('#exam-options'), feedback: document.querySelector('#exam-feedback'),
  next: document.querySelector('#exam-next'), instruction: document.querySelector('#exam-instruction'),
  start: document.querySelector('#exam-start'), restart: document.querySelector('#exam-restart'), summary: document.querySelector('#exam-summary'),
  translationToggle: document.querySelector('#exam-translation-toggle'), translation: document.querySelector('#exam-translation')
};
let examItem = null;
let examIndex = 0;
let examScore = 0;
let examStartedAt = 0;
let examDeadline = 0;
let examTimer = null;
let examSeen = new Set();
let examBusy = false;
let examLocked = false;
let examTranslation = '';

document.querySelectorAll('[data-reading-mode]').forEach(button => button.addEventListener('click', () => {
  const useExam = button.dataset.readingMode === 'exam';
  document.querySelectorAll('[data-reading-mode]').forEach(option => option.classList.toggle('active', option === button));
  document.querySelector('#reading').classList.toggle('hidden', useExam);
  examRoot.classList.toggle('hidden', !useExam);
  (useExam ? examRoot : document.querySelector('#reading')).scrollIntoView({behavior: 'smooth', block: 'start'});
}));

function updateExamClock() {
  const seconds = Math.max(0, Math.ceil((examDeadline - Date.now()) / 1000));
  exam.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (seconds <= 0) finishExam(true);
}

async function startReadingExam() {
  clearInterval(examTimer);
  examStartedAt = Date.now();
  examDeadline = examStartedAt + 15 * 60 * 1000;
  examIndex = 0; examScore = 0; examItem = null; examLocked = false;
  examTranslation = '';
  exam.summary.classList.add('hidden');
  exam.translationToggle.classList.add('hidden'); exam.translation.classList.add('hidden');
  exam.translationToggle.setAttribute('aria-expanded', 'false');
  exam.start.classList.add('hidden'); exam.restart.classList.add('hidden');
  exam.questionArea.classList.add('hidden');
  exam.text.textContent = examRoot.dataset.oral === 'true' ? '' : 'Chargement du texte…';
  stopOralPlayer(exam.audio);
  exam.instruction.textContent = examRoot.dataset.oral === 'true'
    ? 'Écoutez le passage à votre rythme. Les questions portent sur les faits, les liens logiques et les intentions.'
    : 'Lisez le passage à votre rythme. Les questions portent sur les faits, les liens logiques et les intentions.';
  try {
    const requestExam = () => fetch(appPath(`/api/reading/exam?exclude=${encodeURIComponent([...examSeen].join(','))}`));
    let response = await requestExam();
    let result = await response.json();
    if (result.empty && examSeen.size) {
      examSeen.clear(); response = await requestExam(); result = await response.json();
    }
    if (!response.ok || result.empty) throw new Error('Aucun texte disponible.');
    examItem = result; examSeen.add(result.id);
    exam.level.textContent = result.level_name;
    exam.title.textContent = result.title;
    if (examRoot.dataset.oral === 'true') {
      exam.text.textContent = '';
      exam.audio.classList.remove('hidden');
      loadOralPlayer(exam.audio, result.text);
    } else exam.text.textContent = result.text;
    examIndex = 0; examScore = 0;
    showExamQuestion();
    updateExamClock();
    examTimer = window.setInterval(updateExamClock, 250);
  } catch (_) {
    exam.title.textContent = 'Le texte n’a pas pu être chargé';
    exam.instruction.textContent = 'Réessayez dans un instant.';
    exam.start.textContent = 'Réessayer →'; exam.start.classList.remove('hidden');
  }
}

function showExamQuestion() {
  if (!examItem || examIndex >= examItem.questions.length) return finishExam(false);
  examLocked = false;
  const current = examItem.questions[examIndex];
  exam.questionArea.classList.remove('hidden');
  exam.questionCount.textContent = `QUESTION ${examIndex + 1} / ${examItem.questions.length}`;
  exam.question.textContent = current.question;
  exam.options.replaceChildren();
  exam.feedback.textContent = ''; exam.feedback.className = 'feedback';
  exam.next.classList.add('hidden');
  exam.meter.style.width = `${Math.round(examIndex / examItem.questions.length * 100)}%`;
  current.options.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'choice'; button.textContent = option;
    button.addEventListener('click', () => answerExamQuestion(option, button));
    exam.options.append(button);
  });
}

async function answerExamQuestion(answer, selected) {
  if (!examItem || examBusy || examLocked) return;
  examBusy = true;
  try {
    const response = await fetch(appPath('/api/reading/exam/answer'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: examItem.id, index: examIndex, answer})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Correction impossible');
    if (!result.correct) {
      selected.classList.add('choice-wrong'); selected.disabled = true;
      exam.feedback.textContent = 'Pas tout à fait. Gardez le texte affiché et essayez une autre réponse.';
      exam.feedback.className = 'feedback try-again';
      offerSkipButton(exam.feedback, () => {
        examIndex++;
        showExamQuestion();
      }, 'Passer cette question →');
      return;
    }
    examLocked = true; examScore++; examTranslation = result.translation;
    exam.options.querySelectorAll('button').forEach(button => button.disabled = true);
    selected.classList.add('choice-correct');
    exam.feedback.textContent = `Bonne réponse. ${result.explanation}`;
    exam.feedback.className = 'feedback success';
    exam.next.textContent = examIndex + 1 === examItem.questions.length ? 'Voir mon résultat →' : 'Question suivante →';
    exam.next.classList.remove('hidden');
    exam.meter.style.width = `${Math.round((examIndex + 1) / examItem.questions.length * 100)}%`;
  } catch (_) {
    exam.feedback.textContent = 'La réponse n’a pas pu être vérifiée. Réessayez.';
    exam.feedback.className = 'feedback try-again';
  } finally { examBusy = false; }
}

function finishExam(timeUp) {
  clearInterval(examTimer); examTimer = null;
  if (!examItem) return;
  const total = examItem.questions.length;
  const elapsed = Math.max(0, Math.floor((Date.now() - examStartedAt) / 1000));
  const pct = Math.round(examScore * 100 / total);
  examLocked = true; exam.options.replaceChildren(); exam.questionArea.classList.add('hidden');
  exam.meter.style.width = '100%';
  exam.instruction.textContent = timeUp ? 'Le temps est écoulé. Vous pouvez relire le passage et refaire une épreuve.' : 'Épreuve terminée. Le corrigé détaillé est disponible question par question pendant la reprise.';
  exam.summary.textContent = `${examScore} / ${total} bonnes réponses · ${pct} % · ${Math.floor(elapsed / 60)} min ${elapsed % 60} s${timeUp ? ' · temps écoulé' : ''}.`;
  exam.summary.classList.remove('hidden');
  exam.start.classList.add('hidden'); exam.restart.classList.remove('hidden');
  if (examTranslation) {
    exam.translation.textContent = examTranslation;
    exam.translationToggle.classList.remove('hidden');
  }
  exam.clock.textContent = timeUp ? '00:00' : exam.clock.textContent;
}

exam.start?.addEventListener('click', startReadingExam);
exam.restart?.addEventListener('click', startReadingExam);
exam.next?.addEventListener('click', () => { examIndex++; showExamQuestion(); });
exam.translationToggle?.addEventListener('click', () => {
  const visible = exam.translation.classList.toggle('hidden') === false;
  exam.translationToggle.setAttribute('aria-expanded', String(visible));
  exam.translationToggle.textContent = visible ? 'Masquer la traduction' : 'Afficher la traduction du texte';
});
