(() => {
  const data = document.getElementById('course-data');
  const stage = document.getElementById('course-stage');
  if (!data || !stage) return;
  let lesson;
  try { lesson = JSON.parse(data.textContent); } catch (_) { return; }

  const $ = selector => document.querySelector(selector);
  const controls = $('#course-controls'), prev = $('#course-prev'), next = $('#course-next');
  const progressFill = $('#course-progress-fill'), progressLabel = $('#course-progress-label');
  const stepLabel = $('#course-step-label'), live = $('#course-live'), result = $('#course-result');
  let slideIndex = 0, checkpoint = null, questionIndex = 0, wrongOnQuestion = 0;
  let score = 0, wrongTotal = 0, answered = 0;
  const checkpoints = new Map((lesson.checks || []).map(item => [item.after_slide, item]));
  const totalQuestions = (lesson.checks || []).reduce((n, item) => n + item.questions.length, 0);
  const progressMax = lesson.slides.length + (lesson.checks || []).length;

  const node = (tag, cls, content) => { const el = document.createElement(tag); if (cls) el.className = cls; if (content != null) el.textContent = content; return el; };
  function updateProgress() {
    const done = slideIndex + (checkpoint ? 0.5 : 0);
    const pct = Math.min(100, Math.round(done / progressMax * 100));
    progressFill.style.width = `${pct}%`; progressLabel.textContent = `${pct} %`;
    stepLabel.textContent = checkpoint ? `Point d’étape · ${questionIndex + 1}/${checkpoint.questions.length}` : `Slide ${Math.min(slideIndex + 1, lesson.slides.length)} / ${lesson.slides.length}`;
  }
  function renderSlide() {
    checkpoint = null;
    const slide = lesson.slides[slideIndex];
    stage.replaceChildren(); stage.className = 'course-slide';
    stage.append(node('div', 'eyebrow', slide.eyebrow), node('h2', '', slide.title), node('p', 'course-slide-body', slide.body));
    if (slide.examples?.length) {
      const examples = node('div', 'course-examples');
      slide.examples.forEach(example => {
        const card = node('div', 'course-example');
        card.append(node('b', 'course-example-ka ka', example.ka), node('span', '', example.fr));
        if (example.note) card.append(node('small', '', example.note));
        examples.append(card);
      });
      stage.append(examples);
    }
    stage.append(node('div', 'course-takeaway', slide.takeaway));
    prev.disabled = slideIndex === 0;
    next.textContent = checkpoints.has(slideIndex + 1) ? 'Faire le point →' : (slideIndex === lesson.slides.length - 1 ? 'Terminer la leçon →' : 'Continuer →');
    updateProgress();
    live.textContent = `${slide.title}. ${slide.body}`;
  }
  function renderQuestion() {
    const q = checkpoint.questions[questionIndex];
    const correctAnswer = q.answer_index == null ? q.answer : q.options[q.answer_index];
    stage.replaceChildren(); stage.className = 'course-slide course-quiz';
    stage.append(node('div', 'eyebrow', checkpoint.title || 'À VOUS DE JOUER'), node('h2', '', q.prompt));
    if (q.context) stage.append(node('p', 'course-quiz-context', q.context));
    const options = node('div', 'course-quiz-options');
    q.options.forEach((option, index) => {
      const button = node('button', 'course-quiz-option', option); button.type = 'button';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        if (option === correctAnswer) {
          button.classList.add('is-correct');
          const earned = 1 / (wrongOnQuestion + 1); score += earned; answered++;
          Array.from(options.children).forEach(item => item.disabled = true);
          const feedback = node('p', 'course-quiz-feedback is-correct', q.explanation || 'Exact !');
          stage.append(feedback); next.textContent = questionIndex + 1 < checkpoint.questions.length ? 'Question suivante →' : 'Continuer la leçon →';
          next.dataset.quizAnswered = 'true';
        } else {
          wrongOnQuestion++; wrongTotal++;
          button.classList.add('is-wrong'); button.disabled = true;
          stage.append(node('p', 'course-quiz-feedback is-wrong', 'Pas encore. Réessayez avec une autre réponse.'));
          live.textContent = 'Réponse incorrecte. Vous pouvez réessayer.';
        }
      });
      options.append(button);
    });
    stage.append(options); next.dataset.quizAnswered = 'false'; next.textContent = 'Répondre aux questions';
    next.disabled = true;
    options.addEventListener('click', () => { next.disabled = !next.dataset.quizAnswered || next.dataset.quizAnswered !== 'true'; });
    // Re-enable the advance control when the correct answer is selected.
    options.addEventListener('click', () => { if (next.dataset.quizAnswered === 'true') next.disabled = false; });
    prev.disabled = true; updateProgress();
  }
  function startCheckpoint(item) { checkpoint = item; questionIndex = 0; wrongOnQuestion = 0; renderQuestion(); }
  function showResult() {
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
    const again = node('button', 'button secondary', 'Refaire la leçon'); again.type = 'button'; again.addEventListener('click', () => location.reload());
    const catalog = node('a', 'button primary', 'Toutes les leçons →'); catalog.href = document.documentElement.dataset.appBase + '/lessons';
    actions.append(again, catalog); result.append(links, actions);
    progressFill.style.width = '100%'; progressLabel.textContent = '100 %'; stepLabel.textContent = 'Leçon terminée';
    try { localStorage.setItem(`parlons-course-${lesson.id}`, JSON.stringify({completedAt: new Date().toISOString(), score:pct})); } catch (_) {}
    if (typeof playSuccessSound === 'function') playSuccessSound();
    live.textContent = `${heading} Score : ${pct} pour cent.`;
  }
  prev.addEventListener('click', () => { if (!checkpoint && slideIndex > 0) { slideIndex--; renderSlide(); } });
  next.addEventListener('click', () => {
    if (checkpoint) {
      if (next.dataset.quizAnswered !== 'true') return;
      if (questionIndex + 1 < checkpoint.questions.length) { questionIndex++; wrongOnQuestion = 0; renderQuestion(); }
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
  renderSlide();
})();
