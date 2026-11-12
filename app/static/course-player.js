(() => {
  const data = document.getElementById('course-data');
  const stage = document.getElementById('course-stage');
  if (!data || !stage) return;
  let lesson;
  try { lesson = JSON.parse(data.textContent); } catch (_) { return; }
  let nextLesson = null;
  try { nextLesson = JSON.parse(document.getElementById('next-course-data')?.textContent || 'null'); } catch (_) {}

  const $ = selector => document.querySelector(selector);
  const controls = $('#course-controls'), prev = $('#course-prev'), next = $('#course-next');
  const progressFill = $('#course-progress-fill'), progressLabel = $('#course-progress-label');
  const stepLabel = $('#course-step-label'), live = $('#course-live'), result = $('#course-result');
  let slideIndex = 0, checkpoint = null, questionIndex = 0, wrongOnQuestion = 0;
  let score = 0, wrongTotal = 0, answered = 0;
  const checkpoints = new Map((lesson.checks || []).map(item => [item.after_slide, item]));
  const totalQuestions = (lesson.checks || []).reduce((n, item) => n + item.questions.length, 0);
  const progressMax = lesson.slides.length + (lesson.checks || []).length;
  const progressKey = `parlons-course-progress-${lesson.id}`;
  let wrongChoices = new Set(), questionSolved = false, restoredCompleted = false;

  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
    if (saved?.version === 1) {
      slideIndex = Number.isInteger(saved.slideIndex) ? Math.max(0, Math.min(saved.slideIndex, lesson.slides.length - 1)) : 0;
      score = Number.isFinite(saved.score) ? saved.score : 0;
      wrongTotal = Number.isInteger(saved.wrongTotal) ? Math.max(0, saved.wrongTotal) : 0;
      answered = Number.isInteger(saved.answered) ? Math.max(0, saved.answered) : 0;
      restoredCompleted = saved.completed === true;
      const savedCheckpoint = checkpoints.get(saved.checkpointAfter);
      if (savedCheckpoint && Number.isInteger(saved.questionIndex)
          && saved.questionIndex >= 0 && saved.questionIndex < savedCheckpoint.questions.length) {
        checkpoint = savedCheckpoint;
        questionIndex = saved.questionIndex;
        wrongOnQuestion = Number.isInteger(saved.wrongOnQuestion) ? Math.max(0, saved.wrongOnQuestion) : 0;
        wrongChoices = new Set(Array.isArray(saved.wrongChoices) ? saved.wrongChoices : []);
        questionSolved = saved.questionSolved === true;
      }
    }
  } catch (_) {}

  const node = (tag, cls, content) => { const el = document.createElement(tag); if (cls) el.className = cls; if (content != null) el.textContent = content; return el; };
  const georgianSegments = text => String(text || '').match(/[\u10A0-\u10FF]+(?:[\s.,;:!?·-]+[\u10A0-\u10FF]+)*/gu) || [];
  function addAudioButton(parent, text, label = 'Écouter en géorgien') {
    const button = node('button', 'course-audio-button', '▶ Écouter');
    button.type = 'button'; button.setAttribute('aria-label', label); button.title = label;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (typeof window.playSpeech === 'function') window.playSpeech(text, 'ka', button);
      else button.title = 'Le lecteur audio est indisponible.';
    });
    parent.append(button);
    return button;
  }
  function addInlineAudio(parent, text) {
    const segments = georgianSegments(text);
    if (!segments.length) return;
    const controls = node('div', 'course-inline-audio');
    segments.forEach((segment, index) => addAudioButton(controls, segment, `Écouter ${segment}`));
    parent.append(controls);
  }
  function saveProgress(completed = false) {
    try {
      localStorage.setItem(progressKey, JSON.stringify({
        version: 1, slideIndex, checkpointAfter: checkpoint?.after_slide ?? null,
        questionIndex, wrongOnQuestion, wrongTotal, score, answered,
        wrongChoices: [...wrongChoices], questionSolved, completed,
      }));
    } catch (_) {}
  }
  function updateProgress() {
    const done = slideIndex + (checkpoint ? 0.5 : 0);
    const pct = Math.min(100, Math.round(done / progressMax * 100));
    progressFill.style.width = `${pct}%`; progressLabel.textContent = `${pct} %`;
    stepLabel.textContent = checkpoint ? `Point d’étape · ${questionIndex + 1}/${checkpoint.questions.length}` : `Slide ${Math.min(slideIndex + 1, lesson.slides.length)} / ${lesson.slides.length}`;
  }
  function renderSlide() {
    checkpoint = null;
    questionSolved = false; wrongOnQuestion = 0; wrongChoices = new Set();
    const slide = lesson.slides[slideIndex];
    stage.replaceChildren(); stage.className = 'course-slide';
    stage.append(node('div', 'eyebrow', slide.eyebrow), node('h2', '', slide.title));
    const body = node('p', 'course-slide-body', slide.body);
    stage.append(body);
    addInlineAudio(stage, slide.body);
    if (slide.reading_text) {
      const passage = node('div', 'course-reading-passage');
      passage.append(node('span', 'course-reading-label', 'Texte géorgien'), node('p', 'ka', slide.reading_text));
      passage.lang = 'ka';
      addAudioButton(passage, slide.reading_text, 'Écouter le passage en géorgien');
      stage.append(passage);
    }
    if (slide.examples?.length) {
      const examples = node('div', 'course-examples');
      slide.examples.forEach(example => {
        const card = node('div', 'course-example');
        card.append(node('b', 'course-example-ka ka', example.ka));
        addInlineAudio(card, example.ka);
        card.append(node('span', '', example.fr));
        if (example.note) card.append(node('small', '', example.note));
        examples.append(card);
      });
      stage.append(examples);
    }
    const takeaway = node('div', 'course-takeaway', slide.takeaway);
    stage.append(takeaway);
    addInlineAudio(takeaway, slide.takeaway);
    prev.disabled = slideIndex === 0;
    next.textContent = checkpoints.has(slideIndex + 1) ? 'Faire le point →' : (slideIndex === lesson.slides.length - 1 ? 'Terminer la leçon →' : 'Continuer →');
    updateProgress();
    live.textContent = `${slide.title}. ${slide.body}`;
    saveProgress();
  }
  function renderQuestion() {
    const q = checkpoint.questions[questionIndex];
    const correctAnswer = q.answer_index == null ? q.answer : q.options[q.answer_index];
    stage.replaceChildren(); stage.className = 'course-slide course-quiz';
    stage.append(node('div', 'eyebrow', checkpoint.title || 'À VOUS DE JOUER'), node('h2', '', q.prompt));
    addInlineAudio(stage, q.prompt);
    if (q.context) stage.append(node('p', 'course-quiz-context', q.context));
    const options = node('div', 'course-quiz-options');
    q.options.forEach((option, index) => {
      const row = node('div', 'course-quiz-option-row');
      const button = node('button', 'course-quiz-option', option); button.type = 'button';
      if (wrongChoices.has(index)) { button.classList.add('is-wrong'); button.disabled = true; }
      button.addEventListener('click', () => {
        if (button.disabled || questionSolved) return;
        if (option === correctAnswer) {
          questionSolved = true;
          button.classList.add('is-correct');
          const earned = 1 / (wrongOnQuestion + 1); score += earned; answered++;
          options.querySelectorAll('.course-quiz-option').forEach(item => item.disabled = true);
          const feedback = node('div', 'course-quiz-feedback is-correct', q.explanation || 'Exact !');
          addInlineAudio(feedback, q.explanation);
          stage.querySelector('.course-quiz-feedback')?.remove();
          stage.append(feedback); next.textContent = questionIndex + 1 < checkpoint.questions.length ? 'Question suivante →' : 'Continuer la leçon →';
          next.dataset.quizAnswered = 'true';
        } else {
          wrongOnQuestion++; wrongTotal++; wrongChoices.add(index);
          button.classList.add('is-wrong'); button.disabled = true;
          stage.querySelector('.course-quiz-feedback')?.remove();
          stage.append(node('p', 'course-quiz-feedback is-wrong', 'Pas encore. Réessayez avec une autre réponse.'));
          live.textContent = 'Réponse incorrecte. Vous pouvez réessayer.';
        }
        saveProgress();
      });
      row.append(button);
      if (georgianSegments(option).length) addAudioButton(row, option, `Écouter ${option}`);
      options.append(row);
    });
    stage.append(options); next.dataset.quizAnswered = String(questionSolved);
    if (questionSolved) {
      const correctIndex = q.options.indexOf(correctAnswer);
      const correctButton = options.querySelectorAll('.course-quiz-option')[correctIndex];
      correctButton?.classList.add('is-correct');
      options.querySelectorAll('.course-quiz-option').forEach(item => item.disabled = true);
      const feedback = node('div', 'course-quiz-feedback is-correct', q.explanation || 'Exact !');
      addInlineAudio(feedback, q.explanation); stage.append(feedback);
    }
    next.textContent = questionSolved ? (questionIndex + 1 < checkpoint.questions.length ? 'Question suivante →' : 'Continuer la leçon →') : 'Répondre aux questions';
    next.disabled = !questionSolved;
    options.addEventListener('click', () => { next.disabled = !next.dataset.quizAnswered || next.dataset.quizAnswered !== 'true'; });
    // Re-enable the advance control when the correct answer is selected.
    options.addEventListener('click', () => { if (next.dataset.quizAnswered === 'true') next.disabled = false; });
    prev.disabled = true; updateProgress(); saveProgress();
  }
  function startCheckpoint(item) { checkpoint = item; questionIndex = 0; wrongOnQuestion = 0; wrongChoices = new Set(); questionSolved = false; renderQuestion(); }
  function showResult(playSound = true) {
    controls.classList.add('hidden'); stage.classList.add('hidden'); result.classList.remove('hidden');
    const pct = totalQuestions ? Math.round(score / totalQuestions * 100) : 100;
    const heading = pct >= 80 ? 'Bravo, leçon maîtrisée !' : pct >= 50 ? 'Belle progression !' : 'Chaque lecture vous fait avancer.';
    const message = pct >= 80 ? 'Vous avez de bons repères pour poursuivre votre apprentissage du géorgien.' : pct >= 50 ? 'Vous avez déjà posé de bons repères. Continuez à pratiquer pour les consolider.' : 'Reprenez tranquillement les exemples, puis refaites les questions pour consolider vos acquis.';
    result.append(node('div', 'course-result-spark', '✦　✳　✦'), node('div', 'eyebrow', 'LEÇON TERMINÉE'), node('h2', '', heading), node('p', 'course-result-message', message));
    const stats = node('div', 'course-result-stats');
    [[`${pct} %`, 'score de première réponse pondéré'], [`${wrongTotal}`, 'erreur(s) avant validation'], [`${lesson.slides.length}`, 'slides étudiées']].forEach(([value, label]) => { const card = node('div', ''); card.append(node('b', '', value), node('span', '', label)); stats.append(card); });
    result.append(stats);
    const links = node('div', 'course-related'); links.append(node('h3', '', 'Pour continuer à apprendre'));
    (lesson.related || []).forEach(link => { const a = node('a', '', `${link.title} ↗`); a.href = `${document.documentElement.dataset.appBase || ''}${link.href}`; links.append(a); });
    const actions = node('div', 'course-result-actions');
    const again = node('button', 'button secondary', 'Refaire la leçon'); again.type = 'button'; again.addEventListener('click', () => { try { localStorage.removeItem(progressKey); } catch (_) {} location.reload(); });
    if (nextLesson) {
      const following = node('a', 'button primary', `Leçon suivante → ${nextLesson.title}`);
      following.href = nextLesson.url;
      actions.append(following);
    }
    const catalog = node('a', nextLesson ? 'button secondary' : 'button primary', 'Toutes les leçons →'); catalog.href = `${document.documentElement.dataset.appBase || ''}/lessons`;
    actions.append(again, catalog); result.append(links, actions);
    progressFill.style.width = '100%'; progressLabel.textContent = '100 %'; stepLabel.textContent = 'Leçon terminée';
    try { localStorage.setItem(`parlons-course-${lesson.id}`, JSON.stringify({completedAt: new Date().toISOString(), score:pct})); } catch (_) {}
    saveProgress(true);
    if (playSound && typeof playSuccessSound === 'function') playSuccessSound();
    live.textContent = `${heading} Score : ${pct} pour cent.`;
  }
  prev.addEventListener('click', () => { if (!checkpoint && slideIndex > 0) { slideIndex--; renderSlide(); } });
  next.addEventListener('click', () => {
    if (checkpoint) {
      if (next.dataset.quizAnswered !== 'true') return;
      if (questionIndex + 1 < checkpoint.questions.length) {
        questionIndex++; wrongOnQuestion = 0; wrongChoices = new Set(); questionSolved = false; renderQuestion();
      }
      else { slideIndex = checkpoint.after_slide; if (slideIndex >= lesson.slides.length) showResult(); else renderSlide(); }
      return;
    }
    if (slideIndex === lesson.slides.length - 1) {
      const finalCheckpoint = checkpoints.get(lesson.slides.length);
      if (finalCheckpoint) startCheckpoint(finalCheckpoint); else showResult();
      return;
    }
    const upcoming = slideIndex + 1;
    if (checkpoints.has(upcoming)) startCheckpoint(checkpoints.get(upcoming));
    else { slideIndex++; renderSlide(); }
  });
  if (restoredCompleted) showResult(false);
  else if (checkpoint) renderQuestion();
  else renderSlide();
})();
