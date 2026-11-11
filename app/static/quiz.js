let question = null;
let answered = false;
let attempts = 0;
const seen = new Set();
const quizBox = document.querySelector('#quiz');
const mode = quizBox?.dataset.mode || 'mixed';

async function loadQuestion() {
  clearAutoAdvance();
  answered = false;
  document.querySelector('#quiz-feedback').textContent = '';
  document.querySelector('#quiz-feedback').className = 'feedback';
  document.querySelector('#quiz-next').classList.add('hidden');
  document.querySelector('#difficulty').classList.add('hidden');
  document.querySelector('#georgian-input').disabled = false;
  document.querySelector('#submit-typed').disabled = false;
  document.querySelector('#submit-order').disabled = false;
  document.querySelector('#quiz-choices').innerHTML = '<span class="muted">Préparation de la question…</span>';
  const exclude = [...seen].join(',');
  const exercise = mode === 'review' ? 'mcq' : ['mcq','type','match','order'][(attempts) % 4];
  const response = await fetch(appPath(`/api/quiz?mode=${encodeURIComponent(mode)}&exercise=${exercise}&exclude=${encodeURIComponent(exclude)}`));
  question = await response.json();
  if (question.empty) {
    document.querySelector('#quiz-word').textContent = 'Révisions terminées ✨';
    document.querySelector('#quiz-choices').innerHTML = `<p>${question.message}</p><a class="button primary" href="${appPath('/')}">Retour à l’accueil →</a>`;
    document.querySelector('#quiz-translit').textContent = '';
    document.querySelector('#quiz-pron').textContent = '';
    document.querySelector('#quiz-audio').disabled = true;
    return;
  }
  document.querySelector('#quiz-instruction').textContent = ({mcq:'Traduisez en français',type:'Écrivez en géorgien',match:'Associez le français et le géorgien',order:'Remettez la phrase dans l’ordre'})[exercise];
  document.querySelector('#quiz-word').textContent = question.question;
  document.querySelector('#quiz-word').classList.toggle('ka', exercise === 'mcq');
  document.querySelector('#quiz-translit').textContent = exercise === 'mcq' ? question.translit || '' : '';
  document.querySelector('#quiz-pron').textContent = '≈ ' + (question.pron || '');
  document.querySelector('#quiz-pron').classList.add('hidden');
  document.querySelector('#quiz-pron-toggle').textContent = 'Afficher la prononciation';
  const audio = document.querySelector('#quiz-audio');
  audio.classList.toggle('hidden', exercise !== 'mcq');
  document.querySelector('#quiz-pron-toggle').classList.toggle('hidden', exercise !== 'mcq');
  audio.disabled = false; audio.dataset.speak = question.prompt; audio.dataset.original = '▶ Écouter'; audio.textContent = '▶ Écouter';
  audio.onclick = () => playSpeech(question.prompt, 'ka', audio);
  const holder = document.querySelector('#quiz-choices'); holder.innerHTML = '';
  document.querySelector('#typed-answer').classList.toggle('hidden', exercise !== 'type');
  document.querySelector('#order-answer').classList.toggle('hidden', exercise !== 'order');
  if (exercise === 'type') {
    const input = document.querySelector('#georgian-input'); input.value = ''; input.focus();
    renderKeyboard();
    document.querySelector('#submit-typed').onclick = () => submitAnswer(input.value, document.querySelector('#submit-typed'));
  } else if (exercise === 'order') {
    const bank = document.querySelector('#word-bank'), assembled = document.querySelector('#assembled-answer');
    bank.innerHTML = ''; assembled.textContent = '';
    const words = [...question.order_words].sort(() => Math.random() - .5);
    words.forEach((word, index) => {
      const button = document.createElement('button'); button.className = 'word-tile ka'; button.textContent = word;
      button.onclick = () => { if (button.disabled) return; button.disabled = true; assembled.textContent += (assembled.textContent ? ' ' : '') + word; };
      bank.append(button);
    });
    document.querySelector('#submit-order').onclick = e => submitAnswer(assembled.textContent, e.currentTarget);
  } else {
    const choices = [...question.choices].sort(() => Math.random() - .5);
    choices.forEach(label => {
      const button = document.createElement('button'); button.className = 'choice';
      if (exercise === 'match') button.classList.add('ka');
      button.textContent = label;
      button.addEventListener('click', () => submitAnswer(label, button)); holder.append(button);
    });
  }
  attempts++;
  document.querySelector('#session-count').textContent = `Question ${attempts} · vocabulaire et révision`;
  document.querySelector('.quiz-progress i').style.width = `${Math.min(100, attempts * 10)}%`;
}

async function submitAnswer(value, button) {
  if (answered) return;
  answered = true; seen.add(question.id);
  const response = await fetch(appPath('/api/answer'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:question.id, kind:question.kind, answer:value})});
  const result = await response.json();
  const answerCorrect = result.correct;
  if (result.correct) playSuccessSound();
  document.querySelectorAll('#quiz-choices .choice').forEach(c => c.disabled = true);
  button.classList.add(result.correct ? 'choice-correct' : 'choice-wrong');
  document.querySelectorAll('.word-tile').forEach(c => c.disabled = true);
  document.querySelector('#submit-typed').disabled = true;
  document.querySelector('#submit-order').disabled = true;
  document.querySelector('#georgian-input').disabled = true;
  const feedback = document.querySelector('#quiz-feedback');
  feedback.innerHTML = `${result.correct ? 'Bien joué !' : `La bonne réponse était : <b>${result.solution}</b>.`} ${result.explanation}`;
  feedback.classList.add(result.correct ? 'success' : 'try-again');
  const difficulty = document.querySelector('#difficulty'); difficulty.classList.remove('hidden');
  difficulty.querySelectorAll('button').forEach(b => b.disabled = false);
  difficulty.querySelectorAll('button').forEach(button => button.onclick = async () => {
    clearAutoAdvance();
    const saved = await fetch(appPath(`/api/difficulty/${question.id}`), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({quality:Number(button.dataset.quality)})}).then(r=>r.json());
    difficulty.querySelectorAll('button').forEach(b => b.disabled = true);
    difficulty.querySelector('span').textContent = saved.due_in_days === 0 ? 'Noté : retour dans environ 10 minutes.' : `Noté : prochaine révision dans ${saved.due_in_days} jour(s).`;
    if (answerCorrect) scheduleAutoAdvance(advanceQuiz, 1200);
  });
  document.querySelector('#quiz-next').classList.remove('hidden');
  if (result.correct) scheduleAutoAdvance(advanceQuiz, 2600);
}

function advanceQuiz() {
  clearAutoAdvance();
  if (attempts >= 10) finishSession();
  else loadQuestion();
}

async function renderKeyboard() {
  const letters = await fetch(appPath('/api/alphabet/keys')).then(r => r.json());
  const keyboard = document.querySelector('#georgian-keyboard'); keyboard.innerHTML = '';
  for (let i = 0; i < letters.length; i += 11) {
    const line = document.createElement('div'); line.className = 'keyboard-row';
    letters.slice(i, i + 11).forEach(letter => {
      const key = document.createElement('button'); key.type = 'button'; key.className = 'key ka'; key.textContent = letter;
      key.onclick = () => { const input = document.querySelector('#georgian-input'); input.value += letter; input.focus(); };
      line.append(key);
    }); keyboard.append(line);
  }
  const controls = document.createElement('div'); controls.className = 'keyboard-row';
  [['␣','space'],['⌫','delete']].forEach(([label,action]) => {
    const key = document.createElement('button'); key.type='button'; key.className='key key-wide'; key.textContent=label;
    key.onclick=()=>{const input=document.querySelector('#georgian-input');input.value=action==='space'?input.value+' ':input.value.slice(0,-1);input.focus();};controls.append(key);
  }); keyboard.append(controls);
}
document.querySelector('#quiz-next')?.addEventListener('click', advanceQuiz);
function finishSession() {
  document.querySelector('#quiz-instruction').textContent = 'Séance terminée';
  document.querySelector('#quiz-word').textContent = 'Belle régularité !';
  document.querySelector('#quiz-word').classList.remove('ka');
  document.querySelector('#quiz-translit').textContent = '';
  document.querySelector('#quiz-pron').textContent = '';
  document.querySelector('#quiz-pron-toggle').classList.add('hidden');
  document.querySelector('#quiz-audio').classList.add('hidden');
  document.querySelector('#quiz-choices').innerHTML = `<p>Vous avez travaillé plusieurs mots et tournures. Revenez demain pour les prochaines révisions.</p><a class="button primary" href="${appPath('/')}">Retour au tableau de bord →</a>`;
  document.querySelector('#typed-answer').classList.add('hidden');
  document.querySelector('#order-answer').classList.add('hidden');
  document.querySelector('#difficulty').classList.add('hidden');
  document.querySelector('#quiz-next').classList.add('hidden');
}
document.querySelector('#quiz-pron-toggle')?.addEventListener('click', () => {
  const pron = document.querySelector('#quiz-pron'); pron.classList.toggle('hidden');
  document.querySelector('#quiz-pron-toggle').textContent = pron.classList.contains('hidden') ? 'Afficher la prononciation' : 'Masquer la prononciation';
});
loadQuestion();
