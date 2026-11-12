const listeningRoot = document.querySelector('#dictation-listening');
if (listeningRoot) {
  const ui = {
    count: document.querySelector('#listening-dictation-count'), status: document.querySelector('#listening-dictation-status'),
    play: document.querySelector('#listening-dictation-play'), input: document.querySelector('#listening-dictation-input'),
    keyboard: document.querySelector('#listening-dictation-keyboard'), feedback: document.querySelector('#listening-dictation-feedback'),
    answer: document.querySelector('#listening-dictation-answer'), start: document.querySelector('#listening-dictation-start'),
    check: document.querySelector('#listening-dictation-check'), next: document.querySelector('#listening-dictation-next'),
    summary: document.querySelector('#listening-dictation-summary')
  };
  const total = Number(listeningRoot.dataset.totalSentences || 0), limit = Math.min(6, total);
  let seen = new Set(), current = null, completed = 0, firstTry = 0, attempts = 0, audio = null, audioUrl = null, busy = false;

  function feedback(message, state = '') { ui.feedback.textContent = message; ui.feedback.className = `feedback ${state}`; }
  function stopAudio() { if (audio) { audio.pause(); audio.src = ''; audio = null; } if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; } }
  async function playCurrent() {
    if (!current || busy) return;
    stopAudio(); ui.play.disabled = true; ui.status.textContent = 'Chargement de l’enregistrement…';
    try {
      const response = await fetch(appPath(`/api/dictations/sentences/audio/${encodeURIComponent(current.id)}`));
      if (!response.ok) throw new Error('audio absent');
      audioUrl = URL.createObjectURL(await response.blob()); audio = new Audio(audioUrl);
      audio.addEventListener('ended', () => { ui.play.disabled = false; ui.status.textContent = 'Vous pouvez réécouter la phrase.'; }, {once: true});
      audio.addEventListener('error', () => { ui.play.disabled = false; ui.status.textContent = 'La lecture a échoué. Réessayez.'; }, {once: true});
      ui.status.textContent = 'Lecture…'; await audio.play();
    } catch (_) { ui.play.disabled = false; ui.status.textContent = 'Audio indisponible. Vous pouvez continuer ou réessayer.'; }
  }
  async function loadQuestion() {
    if (completed >= limit) return finish();
    current = null; ui.input.value = ''; ui.input.disabled = false; ui.check.disabled = false;
    ui.check.classList.remove('hidden'); ui.next.classList.add('hidden'); ui.answer.classList.add('hidden');
    ui.keyboard.querySelectorAll('button').forEach(key => key.disabled = false);
    ui.count.textContent = `Phrase audio · ${completed + 1} / ${limit}`; ui.status.textContent = 'La phrase reste cachée.'; feedback('');
    try {
      const response = await fetch(appPath(`/api/dictations/sentences/next?exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error('question absente');
      current = item; seen.add(item.id); attempts = 0;
    } catch (_) { feedback('Impossible de charger la phrase. Réessayez.', 'try-again'); }
  }
  async function checkAnswer() {
    if (!current || busy) return;
    if (!ui.input.value.trim()) { feedback('Écrivez la phrase entendue avant de vérifier.', 'try-again'); return; }
    busy = true; ui.check.disabled = true;
    try {
      const response = await fetch(appPath('/api/dictations/sentences/answer'), {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: current.id, answer: ui.input.value})});
      const result = await response.json(); if (!response.ok) throw new Error('correction indisponible');
      attempts++;
      if (!result.correct) { ui.check.disabled = false; feedback('Pas tout à fait. Gardez votre transcription, réécoutez et corrigez-la.', 'try-again'); return; }
      completed++; if (attempts === 1) firstTry++;
      ui.input.value = result.solution; ui.input.disabled = true; ui.keyboard.querySelectorAll('button').forEach(key => key.disabled = true);
      ui.answer.textContent = result.explanation; ui.answer.classList.remove('hidden'); ui.check.classList.add('hidden');
      ui.next.textContent = completed >= limit ? 'Voir le résultat →' : 'Phrase suivante →'; ui.next.classList.remove('hidden');
      feedback(attempts === 1 ? 'Bravo, transcription juste du premier coup !' : 'Bien corrigé, la transcription est juste.', 'success'); playSuccessSound();
    } catch (_) { ui.check.disabled = false; feedback('La réponse n’a pas pu être vérifiée. Réessayez.', 'try-again'); }
    finally { busy = false; }
  }
  function finish() {
    current = null; stopAudio(); ui.play.disabled = true; ui.status.textContent = 'Séance terminée.';
    ui.count.textContent = 'Dictée audio · résultat'; ui.input.disabled = true; ui.keyboard.querySelectorAll('button').forEach(key => key.disabled = true);
    ui.check.classList.add('hidden'); ui.next.classList.add('hidden');
    ui.summary.textContent = `${firstTry} / ${completed} phrases transcrites correctement du premier coup.`;
    ui.summary.classList.remove('hidden'); ui.start.textContent = 'Recommencer →'; ui.start.classList.remove('hidden');
  }
  async function buildKeyboard() {
    try {
      const response = await fetch(appPath('/api/alphabet/keys')); if (!response.ok) throw new Error('clavier absent');
      const keys = await response.json();
      for (let i = 0; i < keys.length; i += 7) {
        const row = document.createElement('div'); row.className = 'keyboard-row';
        keys.slice(i, i + 7).forEach(letter => { const key = document.createElement('button'); key.type = 'button'; key.className = 'key ka'; key.textContent = letter; key.addEventListener('click', () => { ui.input.value += letter; ui.input.focus(); }); row.append(key); });
        ui.keyboard.append(row);
      }
      const row = document.createElement('div'); row.className = 'keyboard-row';
      const space = document.createElement('button'); space.type = 'button'; space.className = 'key key-wide'; space.textContent = 'Espace'; space.addEventListener('click', () => { ui.input.value += ' '; ui.input.focus(); });
      const erase = document.createElement('button'); erase.type = 'button'; erase.className = 'key key-wide'; erase.textContent = '⌫ Effacer'; erase.addEventListener('click', () => { ui.input.value = ui.input.value.slice(0, -1); ui.input.focus(); });
      row.append(space, erase); ui.keyboard.append(row);
    } catch (_) { ui.keyboard.textContent = 'Le clavier géorgien est indisponible.'; }
  }
  ui.play.addEventListener('click', playCurrent); ui.check.addEventListener('click', checkAnswer); ui.next.addEventListener('click', loadQuestion);
  ui.start.addEventListener('click', () => { seen = new Set(); completed = 0; firstTry = 0; busy = false; ui.summary.classList.add('hidden'); ui.start.classList.add('hidden'); ui.input.disabled = false; loadQuestion(); });
  ui.input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); checkAnswer(); } });
  buildKeyboard();
}
