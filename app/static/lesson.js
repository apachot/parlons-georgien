const lessonQuiz = document.querySelector('#lesson-quiz');
const lessonQuestionData = JSON.parse(document.querySelector('#lesson-questions')?.textContent || '[]');
let lessonQuestions = [];
let lessonQuestionIndex = 0;
let lessonCorrect = 0;

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function prepareLessonQuestions() {
  lessonQuestions = shuffled(lessonQuestionData);
  lessonQuestionIndex = 0;
  lessonCorrect = 0;
}

function renderLessonQuestion() {
  clearAutoAdvance();
  const question = lessonQuestions[lessonQuestionIndex];
  const questionNode = document.querySelector('#lesson-question');
  const choices = document.querySelector('#lesson-choices');
  const feedback = document.querySelector('#lesson-feedback');
  const audio = document.querySelector('#lesson-audio');
  const progress = document.querySelector('#lesson-progress');

  document.querySelector('#lesson-question-title').textContent = question.direction === 'ka-fr'
    ? 'Que signifie cette phrase ?' : 'Comment le dire en géorgien ?';
  questionNode.textContent = question.prompt;
  questionNode.classList.toggle('ka', question.lang === 'ka');
  audio.dataset.lang = question.lang;
  audio.dataset.speak = question.prompt;
  audio.textContent = question.lang === 'ka' ? '▶ Écouter KA' : '▶ Écouter FR';
  audio.classList.remove('hidden');
  progress.style.width = `${Math.round(lessonQuestionIndex / lessonQuestions.length * 100)}%`;
  document.querySelector('#lesson-next').classList.add('hidden');
  document.querySelector('#lesson-summary').classList.add('hidden');
  document.querySelector('#lesson-restart').classList.add('hidden');
  document.querySelector('.finish-lesson').classList.add('hidden');
  feedback.textContent = '';
  feedback.className = 'feedback';
  choices.replaceChildren();

  shuffled(question.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    if (question.direction === 'fr-ka') button.classList.add('ka');
    button.textContent = option;
    button.dataset.correct = String(option === question.answer);
    button.addEventListener('click', () => answerLessonQuestion(button, question));
    choices.append(button);
  });
}

function answerLessonQuestion(selected, question) {
  const choices = document.querySelectorAll('#lesson-choices .choice');
  choices.forEach(choice => {
    choice.disabled = true;
    if (choice.dataset.correct === 'true') choice.classList.add('choice-correct');
  });
  const correct = selected.dataset.correct === 'true';
  if (correct) {
    lessonCorrect++;
    playSuccessSound();
  }
  if (!correct) selected.classList.add('choice-wrong');

  const feedback = document.querySelector('#lesson-feedback');
  feedback.textContent = correct
    ? 'Exactement ! Vous avez retrouvé la bonne réponse.'
    : `La bonne réponse était : ${question.answer}. Relisez-la avant de continuer.`;
  feedback.className = `feedback ${correct ? 'success' : 'try-again'}`;
  const next = document.querySelector('#lesson-next');
  next.classList.remove('hidden');
  if (correct) scheduleAutoAdvance(advanceLessonQuestion);
}

function advanceLessonQuestion() {
  clearAutoAdvance();
  lessonQuestionIndex++;
  if (lessonQuestionIndex >= lessonQuestions.length) finishLessonQuiz();
  else renderLessonQuestion();
}

function finishLessonQuiz() {
  const total = lessonQuestions.length;
  const score = Math.round(lessonCorrect * 100 / total);
  document.querySelector('#lesson-question-title').textContent = 'Votre résultat';
  document.querySelector('#lesson-question').textContent = '';
  document.querySelector('#lesson-question').classList.remove('ka');
  document.querySelector('#lesson-question-tools').classList.add('hidden');
  document.querySelector('#lesson-choices').replaceChildren();
  document.querySelector('#lesson-feedback').textContent = '';
  document.querySelector('#lesson-next').classList.add('hidden');
  document.querySelector('#lesson-progress').style.width = '100%';
  document.querySelector('#lesson-summary').textContent =
    `Vous avez répondu correctement à ${lessonCorrect} question${lessonCorrect > 1 ? 's' : ''} sur ${total} (${score} %). ${score === 100 ? 'Excellent, tout est acquis !' : 'Reprenez les cartes ci-dessus et recommencez pour consolider.'}`;
  document.querySelector('#lesson-summary').classList.remove('hidden');
  document.querySelector('#lesson-restart').classList.toggle('hidden', score === 100);
  const finish = document.querySelector('.finish-lesson');
  finish.dataset.score = String(score);
  finish.disabled = false;
  finish.textContent = 'Enregistrer mon résultat';
  finish.classList.remove('hidden');
}

document.querySelector('#lesson-next')?.addEventListener('click', advanceLessonQuestion);

document.querySelector('#lesson-restart')?.addEventListener('click', () => {
  document.querySelector('#lesson-question-tools').classList.remove('hidden');
  prepareLessonQuestions();
  renderLessonQuestion();
});

if (lessonQuiz && lessonQuestionData.length) {
  prepareLessonQuestions();
  renderLessonQuestion();
}
