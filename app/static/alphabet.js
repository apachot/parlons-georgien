let activeLetter = null;
const alphabetSpeedLetters = JSON.parse(document.querySelector('#alphabet-data')?.textContent || '[]');
const speed = {
  intro: document.querySelector('#speed-intro'),
  play: document.querySelector('#speed-play'),
  result: document.querySelector('#speed-result'),
  start: document.querySelector('#speed-start'),
  retry: document.querySelector('#speed-retry'),
  time: document.querySelector('#speed-time'),
  correct: document.querySelector('#speed-correct'),
  accuracy: document.querySelector('#speed-accuracy'),
  progress: document.querySelector('#speed-progress-fill'),
  letter: document.querySelector('#speed-letter'),
  choices: document.querySelector('#speed-choices'),
  feedback: document.querySelector('#speed-feedback'),
  resultTitle: document.querySelector('#speed-result-title'),
  resultDetail: document.querySelector('#speed-result-detail')
};
let speedCurrentLetter = null;
let speedCorrectCount = 0;
let speedAnswerCount = 0;
let speedEndsAt = 0;
let speedTimer = null;
let speedAdvanceTimer = null;
let speedLocked = false;
let speedLastId = null;

function shuffleLetters(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function updateSpeedStats() {
  const remaining = Math.max(0, speedEndsAt - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  speed.time.textContent = String(seconds);
  speed.progress.style.width = `${(remaining / 60000) * 100}%`;
  speed.accuracy.textContent = speedAnswerCount ? `${Math.round(speedCorrectCount * 100 / speedAnswerCount)} %` : '—';
  if (remaining <= 0) finishSpeedRound();
}

function nextSpeedLetter() {
  if (Date.now() >= speedEndsAt) return finishSpeedRound();
  const pool = alphabetSpeedLetters.filter(item => item.id !== speedLastId);
  speedCurrentLetter = pool[Math.floor(Math.random() * pool.length)];
  speedLastId = speedCurrentLetter.id;
  const sounds = shuffleLetters(alphabetSpeedLetters.filter(item => item.id !== speedCurrentLetter.id)).slice(0, 3);
  const options = shuffleLetters([speedCurrentLetter, ...sounds]);
  speed.letter.textContent = speedCurrentLetter.letter;
  speed.choices.replaceChildren();
  speed.feedback.textContent = '';
  options.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-choice';
    button.innerHTML = `<span>${item.sound}</span><small>${index + 1}</small>`;
    button.addEventListener('click', () => answerSpeedLetter(button, item, index));
    speed.choices.append(button);
  });
  speedLocked = false;
}

function answerSpeedLetter(button, choice) {
  if (speedLocked || !speedCurrentLetter || Date.now() >= speedEndsAt) return;
  speedAnswerCount++;
  const correct = choice.id === speedCurrentLetter.id;
  if (correct) {
    speedLocked = true;
    speedCorrectCount++;
    speed.choices.querySelectorAll('button').forEach(option => {
      option.disabled = true;
      if (option.querySelector('span')?.textContent === speedCurrentLetter.sound) option.classList.add('speed-right');
    });
  } else {
    button.disabled = true;
  }
  button.classList.add(correct ? 'speed-right' : 'speed-wrong');
  speed.feedback.textContent = correct ? 'Bien lu !' : 'Pas tout à fait. Gardez cette lettre et réessayez.';
  speed.correct.textContent = String(speedCorrectCount);
  updateSpeedStats();
  if (correct) playSuccessSound();
  fetch(appPath('/api/answer'), {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: speedCurrentLetter.id, kind: 'alphabet', answer: correct ? speedCurrentLetter.sound : choice.sound, quality: correct ? 5 : 1})
  }).catch(() => {});
  if (correct && Date.now() < speedEndsAt) speedAdvanceTimer = setTimeout(nextSpeedLetter, 240);
}

function finishSpeedRound() {
  if (!speedTimer && speed.result.classList.contains('hidden')) return;
  clearInterval(speedTimer);
  clearTimeout(speedAdvanceTimer);
  speedTimer = null;
  speedLocked = true;
  speed.play.classList.add('hidden');
  speed.result.classList.remove('hidden');
  const accuracy = speedAnswerCount ? Math.round(speedCorrectCount * 100 / speedAnswerCount) : 0;
  speed.resultTitle.textContent = `${speedCorrectCount} lettre${speedCorrectCount === 1 ? '' : 's'} lue${speedCorrectCount === 1 ? '' : 's'} correctement`;
  speed.resultDetail.textContent = speedAnswerCount
    ? `${accuracy} % de précision sur ${speedAnswerCount} réponse${speedAnswerCount === 1 ? '' : 's'}. Refaites une manche pour battre votre score !`
    : 'Aucune réponse cette fois. Relancez une manche pour vous tester.';
}

function startSpeedRound() {
  clearInterval(speedTimer);
  clearTimeout(speedAdvanceTimer);
  speedCorrectCount = 0;
  speedAnswerCount = 0;
  speedLastId = null;
  speed.correct.textContent = '0';
  speed.letter.textContent = 'ა';
  speed.intro.classList.add('hidden');
  speed.result.classList.add('hidden');
  speed.play.classList.remove('hidden');
  speedEndsAt = Date.now() + 60000;
  nextSpeedLetter();
  updateSpeedStats();
  speedTimer = setInterval(updateSpeedStats, 100);
}

speed.start?.addEventListener('click', startSpeedRound);
speed.retry?.addEventListener('click', startSpeedRound);
document.addEventListener('keydown', event => {
  if (speed.play.classList.contains('hidden') || !/^[1-4]$/.test(event.key)) return;
  const button = speed.choices.querySelectorAll('button')[Number(event.key) - 1];
  button?.click();
});

async function newLetterQuestion() {
  const response = await fetch(appPath('/api/quiz?kind=alphabet'));
  activeLetter = await response.json();
  document.querySelector('#letter-prompt').textContent = activeLetter.prompt;
  const audioButton = document.querySelector('#letter-audio');
  audioButton.classList.remove('hidden');
  audioButton.disabled = false;
  audioButton.textContent = '▶ Écouter en géorgien';
  audioButton.dataset.original = audioButton.textContent;
  audioButton.onclick = () => playSpeech(activeLetter.prompt, 'ka', audioButton);
  document.querySelector('#letter-feedback').textContent = '';
  const holder = document.querySelector('#letter-choices'); holder.innerHTML = '';
  [...activeLetter.choices].sort(() => Math.random() - .5).forEach(letter => {
    const button = document.createElement('button'); button.className = 'letter-choice ka'; button.textContent = letter;
    button.addEventListener('click', async () => {
      const result = await fetch(appPath('/api/answer'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:activeLetter.id,kind:'alphabet',answer:letter})}).then(r=>r.json());
      button.classList.add(result.correct?'choice-correct':'choice-wrong');
      if (result.correct) {
        holder.querySelectorAll('button').forEach(b=>b.disabled=true);
        playSuccessSound();
        scheduleAutoAdvance(newLetterQuestion);
      } else {
        button.disabled = true;
      }
      document.querySelector('#letter-feedback').textContent = result.correct ? 'Oui, c’est la bonne lettre !' : 'Pas tout à fait. Gardez le même son et essayez une autre lettre.';
    }); holder.append(button);
  });
}
document.querySelector('#letter-next')?.addEventListener('click', () => {
  clearAutoAdvance();
  newLetterQuestion();
});
newLetterQuestion();
