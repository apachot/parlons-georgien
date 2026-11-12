const dialogueFlashRoot = document.querySelector('#dialogue-flash');
if (dialogueFlashRoot) {
  const flash = {
    count: document.querySelector('#dialogue-flash-count'),
    score: document.querySelector('#dialogue-flash-score'), meter: document.querySelector('#dialogue-flash-meter'),
    scene: document.querySelector('#dialogue-flash-scene'), prompt: document.querySelector('#dialogue-flash-prompt'),
    replay: document.querySelector('#dialogue-flash-replay'), options: document.querySelector('#dialogue-flash-options'),
    feedback: document.querySelector('#dialogue-flash-feedback'), reveal: document.querySelector('#dialogue-flash-reveal'),
    start: document.querySelector('#dialogue-flash-start'), next: document.querySelector('#dialogue-flash-next'),
    summary: document.querySelector('#dialogue-flash-summary')
  };
  const total = Number(dialogueFlashRoot.dataset.total || 0);
  const sessionSize = Math.min(8, total);
  let current = null, seen = new Set(), turn = 0, correct = 0, busy = false, audioButton = null;

  function setFlashFeedback(message, state = '') {
    flash.feedback.textContent = message;
    flash.feedback.className = `feedback ${state}`;
  }

  function speakFlashPrompt() {
    if (current && audioButton) playSpeech(current.prompt, 'ka', audioButton);
  }

  async function loadFlashQuestion() {
    if (turn >= sessionSize) return finishFlashSession();
    current = null; flash.options.replaceChildren(); flash.next.classList.add('hidden');
    flash.reveal.classList.add('hidden'); setFlashFeedback('');
    flash.count.textContent = `Réplique · ${turn + 1} / ${sessionSize}`;
    flash.score.textContent = `${correct} / ${turn}`;
    flash.meter.style.width = `${Math.round(turn / sessionSize * 100)}%`;
    try {
      const response = await fetch(appPath(`/api/dialogues/flash/next?exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error('Réplique indisponible');
      current = item; seen.add(item.id); flash.scene.textContent = item.scene; flash.prompt.textContent = item.prompt;
      item.options.forEach((option, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'dialogue-flash-choice';
        const text = document.createElement('span'); text.className = 'ka'; text.lang = 'ka'; text.textContent = option.ka;
        const key = document.createElement('small'); key.textContent = String(index + 1);
        button.append(text, key); button.addEventListener('click', () => answerFlashQuestion(option.ka, button));
        flash.options.append(button);
      });
      flash.replay.disabled = false; speakFlashPrompt();
    } catch (_) {
      setFlashFeedback('La réplique n’a pas pu être chargée. Réessayez.', 'try-again');
      flash.start.textContent = 'Réessayer →'; flash.start.classList.remove('hidden');
    }
  }

  async function answerFlashQuestion(answer, selected) {
    if (!current || busy || selected.disabled) return;
    busy = true; selected.disabled = true;
    try {
      const response = await fetch(appPath('/api/dialogues/flash/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: current.id, answer})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      if (!result.correct) {
        selected.classList.add('choice-wrong');
        setFlashFeedback('Cette réplique ne convient pas. Écoutez encore et essayez une autre réponse.', 'try-again');
        offerSkipButton(flash.feedback, () => {
          turn++;
          loadFlashQuestion();
        }, 'Passer cette réplique →');
        return;
      }
      correct++; turn++;
      flash.options.querySelectorAll('button').forEach(button => {
        button.disabled = true;
        if (button === selected) button.classList.add('choice-correct');
      });
      flash.score.textContent = `${correct} / ${turn}`;
      flash.meter.style.width = `${Math.round(turn / sessionSize * 100)}%`;
      flash.reveal.textContent = `« ${result.prompt_fr} » → ${result.answer_fr}`;
      flash.reveal.classList.remove('hidden'); setFlashFeedback('Bonne réponse, la conversation continue !', 'success');
      flash.next.textContent = turn >= sessionSize ? 'Voir le résultat →' : 'Réplique suivante →';
      flash.next.classList.remove('hidden'); playSuccessSound();
    } catch (_) {
      selected.disabled = false; setFlashFeedback('La réponse n’a pas pu être vérifiée. Réessayez.', 'try-again');
    } finally { busy = false; }
  }

  function finishFlashSession() {
    current = null; flash.options.replaceChildren(); flash.prompt.textContent = 'Séance terminée.';
    flash.scene.textContent = ''; flash.next.classList.add('hidden'); flash.meter.style.width = '100%';
    flash.replay.disabled = true; flash.reveal.classList.add('hidden'); setFlashFeedback('');
    flash.summary.textContent = `${correct} / ${turn} répliques adaptées. Votre progression est enregistrée.`;
    flash.summary.classList.remove('hidden'); flash.start.textContent = 'Recommencer →'; flash.start.classList.remove('hidden');
  }

  flash.start.addEventListener('click', () => {
    seen.clear(); current = null; turn = 0; correct = 0; flash.summary.classList.add('hidden');
    flash.start.classList.add('hidden'); loadFlashQuestion();
  });
  flash.next.addEventListener('click', loadFlashQuestion);
  flash.replay.addEventListener('click', speakFlashPrompt);
  audioButton = flash.replay;
}
