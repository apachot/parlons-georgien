const clozeRoot = document.querySelector('#reading-cloze');
if (clozeRoot) {
  const cloze = {
    count: document.querySelector('#cloze-count'), meter: document.querySelector('#cloze-meter'),
    sentence: document.querySelector('#cloze-sentence'), options: document.querySelector('#cloze-options'),
    feedback: document.querySelector('#cloze-feedback'), reveal: document.querySelector('#cloze-reveal'),
    start: document.querySelector('#cloze-start'), next: document.querySelector('#cloze-next'),
    summary: document.querySelector('#cloze-summary')
  };
  const total = Number(clozeRoot.dataset.total || 0);
  const sessionSize = Math.min(8, total);
  let current = null, seen = new Set(), turn = 0, correct = 0, busy = false;

  function setClozeFeedback(message, state = '') {
    cloze.feedback.textContent = message;
    cloze.feedback.className = `feedback ${state}`;
  }

  async function loadClozeQuestion() {
    if (turn >= sessionSize) return finishClozeSession();
    current = null; cloze.options.replaceChildren(); cloze.reveal.classList.add('hidden');
    cloze.next.classList.add('hidden'); setClozeFeedback('');
    cloze.count.textContent = `Phrase · ${turn + 1} / ${sessionSize}`;
    cloze.meter.style.width = `${Math.round(turn / sessionSize * 100)}%`;
    try {
      const response = await fetch(appPath(`/api/reading/cloze/next?exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error('Phrase indisponible');
      current = item; seen.add(item.id); cloze.sentence.textContent = item.sentence;
      item.options.forEach(option => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'choice ka';
        button.lang = 'ka'; button.textContent = option;
        button.addEventListener('click', () => answerClozeQuestion(option, button));
        cloze.options.append(button);
      });
    } catch (_) {
      setClozeFeedback('La phrase n’a pas pu être chargée. Réessayez.', 'try-again');
      cloze.start.textContent = 'Réessayer →'; cloze.start.classList.remove('hidden');
    }
  }

  async function answerClozeQuestion(answer, selected) {
    if (!current || busy || selected.disabled) return;
    busy = true; selected.disabled = true;
    try {
      const response = await fetch(appPath('/api/reading/cloze/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: current.id, answer})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      if (!result.correct) {
        selected.classList.add('choice-wrong');
        cloze.options.querySelectorAll('button').forEach(button => button.disabled = button === selected);
        setClozeFeedback('Ce mot ne convient pas. Relisez la phrase et essayez une autre proposition.', 'try-again');
        return;
      }
      correct++; turn++;
      cloze.options.querySelectorAll('button').forEach(button => {
        button.disabled = true;
        if (button === selected) button.classList.add('choice-correct');
      });
      cloze.meter.style.width = `${Math.round(turn / sessionSize * 100)}%`;
      cloze.reveal.textContent = `${result.translation} — ${result.explanation}`;
      cloze.reveal.classList.remove('hidden'); setClozeFeedback('Bien déduit !', 'success');
      cloze.next.textContent = turn >= sessionSize ? 'Voir le résultat →' : 'Phrase suivante →';
      cloze.next.classList.remove('hidden'); playSuccessSound();
    } catch (_) {
      selected.disabled = false; setClozeFeedback('La réponse n’a pas pu être vérifiée. Réessayez.', 'try-again');
    } finally { busy = false; }
  }

  function finishClozeSession() {
    current = null; cloze.sentence.textContent = 'Lecture terminée.'; cloze.options.replaceChildren();
    cloze.next.classList.add('hidden'); cloze.meter.style.width = '100%'; setClozeFeedback('');
    cloze.summary.textContent = `${correct} / ${turn} phrases complétées. Votre progression est enregistrée.`;
    cloze.summary.classList.remove('hidden'); cloze.start.textContent = 'Recommencer →'; cloze.start.classList.remove('hidden');
  }

  cloze.start.addEventListener('click', () => {
    seen.clear(); current = null; turn = 0; correct = 0; cloze.summary.classList.add('hidden');
    cloze.start.classList.add('hidden'); loadClozeQuestion();
  });
  cloze.next.addEventListener('click', loadClozeQuestion);
}
