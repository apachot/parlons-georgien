const wordDataNode = document.querySelector('#alphabet-word-data');
const wordSpeedRoot = document.querySelector('#alphabet-word-speed');
if (wordDataNode && wordSpeedRoot) {
  const allWords = JSON.parse(wordDataNode.textContent || '[]');
  const words = [...new Map(allWords.filter(word => word.ka && word.translit).map(word => [word.ka, word])).values()];
  const ui = {
    intro: document.querySelector('#word-speed-intro'), play: document.querySelector('#word-speed-play'), result: document.querySelector('#word-speed-result'),
    start: document.querySelector('#word-speed-start'), retry: document.querySelector('#word-speed-retry'), time: document.querySelector('#word-speed-time'),
    correct: document.querySelector('#word-speed-correct'), accuracy: document.querySelector('#word-speed-accuracy'), progress: document.querySelector('#word-speed-progress'),
    prompt: document.querySelector('#word-speed-prompt'), choices: document.querySelector('#word-speed-choices'), feedback: document.querySelector('#word-speed-feedback'),
    resultTitle: document.querySelector('#word-speed-result-title'), resultDetail: document.querySelector('#word-speed-result-detail')
  };
  let current = null, correct = 0, attempts = 0, endsAt = 0, timer = null, nextTimer = null, locked = false, lastWord = '';
  const shuffle = values => { const result = [...values]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; };

  function update() {
    const remaining = Math.max(0, endsAt - Date.now());
    ui.time.textContent = String(Math.ceil(remaining / 1000)); ui.progress.style.width = `${remaining / 60000 * 100}%`;
    ui.accuracy.textContent = attempts ? `${Math.round(correct * 100 / attempts)} %` : '—';
    if (!remaining) finish();
  }
  function nextWord() {
    if (Date.now() >= endsAt) return finish();
    const pool = words.filter(word => word.ka !== lastWord);
    current = pool[Math.floor(Math.random() * pool.length)] || words[0]; lastWord = current.ka;
    const answers = [...new Set(words.filter(word => word.ka !== current.ka).map(word => word.translit))].filter(value => value !== current.translit);
    const options = shuffle([current.translit, ...shuffle(answers).slice(0, 3)]);
    ui.prompt.textContent = current.ka; ui.choices.replaceChildren(); ui.feedback.textContent = ''; locked = false;
    options.forEach((value, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'speed-choice';
      const label = document.createElement('span'); label.textContent = value;
      const number = document.createElement('small'); number.textContent = String(index + 1);
      button.append(label, number); button.addEventListener('click', () => answer(button, value)); ui.choices.append(button);
    });
  }
  function answer(button, value) {
    if (locked || !current || Date.now() >= endsAt) return;
    attempts++; const isCorrect = value === current.translit;
    button.classList.add(isCorrect ? 'speed-right' : 'speed-wrong');
    if (!isCorrect) { button.disabled = true; ui.feedback.textContent = 'Pas tout à fait. Gardez le mot et réessayez.'; }
    else {
      locked = true; correct++; ui.choices.querySelectorAll('button').forEach(choice => { choice.disabled = true; if (choice === button) choice.classList.add('speed-right'); });
      ui.feedback.textContent = 'Bien lu !'; playSuccessSound(); nextTimer = setTimeout(nextWord, 180);
    }
    ui.correct.textContent = String(correct); update();
  }
  function finish() {
    if (!timer) return;
    clearInterval(timer); clearTimeout(nextTimer); timer = null; locked = true;
    ui.play.classList.add('hidden'); ui.result.classList.remove('hidden');
    const precision = attempts ? Math.round(correct * 100 / attempts) : 0;
    ui.resultTitle.textContent = `${correct} mot${correct === 1 ? '' : 's'} lu${correct === 1 ? '' : 's'} correctement`;
    ui.resultDetail.textContent = `${precision} % de précision sur ${attempts} réponse${attempts === 1 ? '' : 's'} · ${words.length} mots dans le jeu.`;
  }
  function start() {
    clearInterval(timer); clearTimeout(nextTimer); correct = 0; attempts = 0; lastWord = ''; current = null;
    ui.correct.textContent = '0'; ui.time.textContent = '60'; ui.accuracy.textContent = '—'; ui.intro.classList.add('hidden'); ui.result.classList.add('hidden'); ui.play.classList.remove('hidden');
    endsAt = Date.now() + 60000; nextWord(); update(); timer = setInterval(update, 100);
  }
  ui.start.addEventListener('click', start); ui.retry.addEventListener('click', start);
  document.addEventListener('keydown', event => {
    if (ui.play.classList.contains('hidden') || !/^[1-4]$/.test(event.key)) return;
    const button = ui.choices.querySelectorAll('button')[Number(event.key) - 1]; if (button && !button.disabled) button.click();
  });
}
