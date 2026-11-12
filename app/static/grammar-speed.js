const grammarSpeedRoot = document.querySelector('#grammar-speed');
if (grammarSpeedRoot) {
  const speed = {
    time: document.querySelector('#grammar-speed-time'), meter: document.querySelector('#grammar-speed-meter'),
    correct: document.querySelector('#grammar-speed-correct'), attempts: document.querySelector('#grammar-speed-attempts'),
    accuracy: document.querySelector('#grammar-speed-accuracy'), question: document.querySelector('#grammar-speed-question'),
    round: document.querySelector('#grammar-speed-round'), prompt: document.querySelector('#grammar-speed-prompt'),
    choices: document.querySelector('#grammar-speed-choices'), feedback: document.querySelector('#grammar-speed-feedback'),
    summary: document.querySelector('#grammar-speed-summary'), start: document.querySelector('#grammar-speed-start')
  };
  const total = Number(grammarSpeedRoot.dataset.total || 0);
  const duration = 60;
  let current = null, seen = new Set(), correct = 0, attempts = 0, endsAt = 0;
  let timer = null, advance = null, busy = false;
  let best = 0;
  try { best = Number(localStorage.getItem('kartuli-grammar-speed-best') || 0); } catch (_) { /* Le défi reste jouable sans stockage local. */ }

  function updateSpeedStats() {
    const remaining = Math.max(0, endsAt - Date.now());
    speed.time.textContent = String(Math.ceil(remaining / 1000));
    speed.meter.style.width = `${remaining / (duration * 1000) * 100}%`;
    speed.correct.textContent = String(correct);
    speed.attempts.textContent = String(attempts);
    speed.accuracy.textContent = attempts ? `${Math.round(correct * 100 / attempts)} %` : '—';
    if (remaining <= 0) finishSpeedChallenge();
  }

  async function loadSpeedQuestion() {
    clearTimeout(advance); advance = null;
    if (Date.now() >= endsAt || seen.size >= total) return finishSpeedChallenge();
    current = null; speed.choices.replaceChildren(); speed.feedback.textContent = '';
    speed.feedback.className = 'feedback';
    speed.round.textContent = `Question · ${seen.size + 1} · ${correct} réussie${correct === 1 ? '' : 's'}`;
    try {
      const response = await fetch(appPath(`/api/grammar/next?category=temps&exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) return finishSpeedChallenge();
      if (Date.now() >= endsAt) return finishSpeedChallenge();
      current = item;
      speed.prompt.textContent = item.prompt;
      item.options.forEach((option, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'choice';
        button.textContent = option;
        button.addEventListener('click', () => answerSpeedQuestion(option, button));
        speed.choices.append(button);
      });
    } catch (_) {
      speed.feedback.textContent = 'La question n’a pas pu être chargée. Réessayez.';
      speed.feedback.className = 'feedback try-again';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button secondary';
      retry.textContent = 'Réessayer'; retry.addEventListener('click', loadSpeedQuestion, {once: true});
      speed.choices.replaceChildren(retry);
    }
  }

  async function answerSpeedQuestion(answer, selected) {
    if (!current || busy || selected.disabled || Date.now() >= endsAt) return;
    busy = true; selected.disabled = true; attempts++;
    try {
      const response = await fetch(appPath('/api/grammar/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: current.id, answer})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      if (!result.correct) {
        selected.classList.add('choice-wrong');
        speed.feedback.textContent = 'Pas tout à fait. Gardez cette question et choisissez une autre forme.';
        speed.feedback.className = 'feedback try-again';
        offerSkipButton(speed.feedback, () => {
          if (!current) return;
          seen.add(current.id);
          loadSpeedQuestion();
        });
      } else {
        correct++; seen.add(current.id);
        speed.choices.querySelectorAll('button').forEach(button => {
          button.disabled = true;
          if (button === selected) button.classList.add('choice-correct');
        });
        speed.feedback.textContent = 'Exact ! Question suivante…';
        speed.feedback.className = 'feedback success';
        playSuccessSound(); advance = setTimeout(loadSpeedQuestion, 350);
      }
      updateSpeedStats();
    } catch (_) {
      attempts = Math.max(0, attempts - 1); selected.disabled = false;
      speed.feedback.textContent = 'La réponse n’a pas pu être vérifiée. Réessayez.';
      speed.feedback.className = 'feedback try-again'; updateSpeedStats();
    } finally { busy = false; }
  }

  function finishSpeedChallenge() {
    if (!timer) return;
    clearInterval(timer); timer = null; clearTimeout(advance); advance = null; current = null;
    speed.question.classList.add('hidden'); speed.meter.style.width = '0%'; speed.time.textContent = '0';
    const accuracy = attempts ? Math.round(correct * 100 / attempts) : 0;
    if (correct > best) {
      best = correct;
      try { localStorage.setItem('kartuli-grammar-speed-best', String(best)); } catch (_) { /* Record local facultatif. */ }
    }
    speed.summary.textContent = `${correct} bonne${correct === 1 ? '' : 's'} réponse${correct === 1 ? '' : 's'} sur ${attempts} tentatives · ${accuracy} % de précision · record : ${best}.`;
    speed.summary.classList.remove('hidden'); speed.start.textContent = 'Rejouer →'; speed.start.classList.remove('hidden');
  }

  function startSpeedChallenge() {
    clearInterval(timer); clearTimeout(advance); advance = null; seen.clear(); correct = 0; attempts = 0; current = null; busy = false;
    speed.summary.classList.add('hidden'); speed.start.classList.add('hidden'); speed.question.classList.remove('hidden');
    endsAt = Date.now() + duration * 1000; updateSpeedStats();
    timer = setInterval(updateSpeedStats, 100); loadSpeedQuestion();
  }

  speed.start.addEventListener('click', startSpeedChallenge);
}
