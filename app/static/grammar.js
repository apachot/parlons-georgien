const grammar = {
  prompt: document.querySelector('#grammar-prompt'), choices: document.querySelector('#grammar-choices'),
  feedback: document.querySelector('#grammar-feedback'), next: document.querySelector('#grammar-next'),
  round: document.querySelector('#grammar-round'), score: document.querySelector('#grammar-score')
};
let grammarCategory = 'temps';
let grammarCurrent = null;
let grammarSeen = new Set();
let grammarTurn = 0;
let grammarCorrect = 0;
let grammarTotal = 0;
let grammarBusy = false;
let grammarLocked = false;
let grammarFinished = false;

function resetGrammarQuiz() {
  grammarSeen.clear(); grammarTurn = 0; grammarCorrect = 0; grammarCurrent = null; grammarLocked = false; grammarFinished = false;
  grammar.score.textContent = '0 / 0'; grammar.round.textContent = 'Pratique libre';
  grammar.prompt.textContent = 'Prête ou prêt ?'; grammar.choices.replaceChildren();
  grammar.feedback.textContent = ''; grammar.feedback.className = 'feedback';
  grammar.next.textContent = 'Commencer →'; grammar.next.classList.remove('hidden');
}

async function loadGrammarQuestion() {
  grammar.next.classList.add('hidden'); grammar.choices.replaceChildren();
  grammar.feedback.textContent = ''; grammar.feedback.className = 'feedback';
  const response = await fetch(appPath(`/api/grammar/next?category=${encodeURIComponent(grammarCategory)}&exclude=${encodeURIComponent([...grammarSeen].join(','))}`));
  const item = await response.json();
  grammarTotal = item.total || grammarTotal;
  if (item.empty) {
    grammarFinished = true;
    grammar.prompt.textContent = grammarSeen.size
      ? `Série terminée : ${grammarCorrect} / ${grammarSeen.size} bonnes réponses.`
      : 'Aucune question pour ce thème.';
    grammar.round.textContent = grammarSeen.size ? `${grammarSeen.size} / ${grammarTotal} questions vues` : 'Thème indisponible';
    grammar.choices.replaceChildren();
    grammar.feedback.textContent = grammarSeen.size ? 'Vous avez répondu à toutes les questions de ce thème.' : '';
    grammar.feedback.className = grammarSeen.size ? 'feedback success' : 'feedback';
    grammar.next.textContent = grammarSeen.size ? 'Recommencer la série →' : 'Réessayer';
    grammar.next.classList.remove('hidden');
    return;
  }
  grammarCurrent = item; grammarLocked = false;
  grammar.round.textContent = `Question ${grammarSeen.size + 1} / ${grammarTotal} · ${grammarCategory === 'all' ? 'mélange' : grammarCategory}`;
  grammar.prompt.textContent = item.prompt;
  item.options.forEach(option => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'choice'; button.textContent = option;
    button.addEventListener('click', () => answerGrammar(option, button)); grammar.choices.append(button);
  });
}

async function answerGrammar(answer, selected) {
  if (!grammarCurrent || grammarBusy || grammarLocked) return;
  grammarBusy = true;
  try {
    const response = await fetch(appPath('/api/grammar/answer'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:grammarCurrent.id, answer})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Correction impossible');
    if (!result.correct) {
      selected.disabled = true; selected.classList.add('choice-wrong');
      grammar.feedback.textContent = 'Pas tout à fait. Gardez cette question et réessayez.';
      grammar.feedback.className = 'feedback try-again'; return;
    }
    grammarLocked = true; grammarSeen.add(grammarCurrent.id); grammarTurn++; grammarCorrect++;
    grammar.score.textContent = `${grammarCorrect} / ${grammarTurn}`;
    grammar.choices.querySelectorAll('button').forEach(button => button.disabled = true);
    selected.classList.add('choice-correct');
    grammar.feedback.textContent = `Bonne réponse. ${result.explanation}`;
    grammar.feedback.className = 'feedback success';
    grammar.next.textContent = grammarSeen.size >= grammarTotal ? 'Terminer la série →' : 'Question suivante →';
    grammar.next.classList.remove('hidden'); playSuccessSound();
  } catch (_) {
    grammar.feedback.textContent = 'La réponse n’a pas pu être vérifiée. Réessayez.';
    grammar.feedback.className = 'feedback try-again';
  } finally { grammarBusy = false; }
}

grammar.next.addEventListener('click', async () => {
  if (grammarFinished) {
    resetGrammarQuiz();
    await loadGrammarQuestion();
    return;
  }
  if (grammarLocked && grammarSeen.size >= grammarTotal) {
    grammarFinished = true;
    grammar.prompt.textContent = `Série terminée : ${grammarCorrect} / ${grammarSeen.size} bonnes réponses.`;
    grammar.choices.replaceChildren();
    grammar.feedback.textContent = 'Votre progression sur ces notions est enregistrée.';
    grammar.feedback.className = 'feedback success';
    grammar.next.textContent = 'Recommencer la série →';
    return;
  }
  await loadGrammarQuestion();
});

document.querySelectorAll('.grammar-category-list button').forEach(button => button.addEventListener('click', () => {
  grammarCategory = button.dataset.category;
  document.querySelectorAll('.grammar-category-list button').forEach(option => option.classList.toggle('active', option === button));
  resetGrammarQuiz();
}));
