document.addEventListener('DOMContentLoaded', () => {
  // Prepare audio on the first gesture so mobile browsers allow later feedback tones.
  document.addEventListener('pointerdown', unlockSuccessAudio, {once: true});
  document.addEventListener('keydown', unlockSuccessAudio, {once: true});
  const menu = document.querySelector('.menu-toggle');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    document.querySelector('.nav')?.classList.toggle('open', open);
  });
  document.querySelectorAll('.pron-toggle').forEach(button => button.addEventListener('click', () => {
    const text = button.parentElement.querySelector('.pron') || button.nextElementSibling;
    if (!text) return;
    text.classList.toggle('hidden');
    button.textContent = text.classList.contains('hidden') ? 'Afficher la prononciation' : 'Masquer la prononciation';
  }));
  document.querySelectorAll('.audio-btn[data-speak]').forEach(button => button.addEventListener('click', () => playSpeech(button.dataset.speak, button.dataset.lang || 'ka', button)));
  const activityPanels = [...document.querySelectorAll('[data-activity-panel]')];
  const activityMenus = [...document.querySelectorAll('[data-activity-menu]')];
  function showActivityMenu() {
    activityPanels.forEach(panel => panel.classList.add('hidden'));
    activityMenus.forEach(menu => menu.classList.remove('hidden'));
  }
  document.querySelectorAll('.activity-card[href^="#"]').forEach(card => card.addEventListener('click', event => {
    const target = document.querySelector(card.getAttribute('href'));
    const panel = target?.closest('[data-activity-panel]') || target;
    if (!panel) return;
    event.preventDefault();
    activityPanels.forEach(item => item.classList.toggle('hidden', item !== panel));
    activityMenus.forEach(menu => menu.classList.toggle('hidden', !menu.classList.contains('activity-hero')));
    if (card.dataset.activityDirection) document.querySelector(`[data-dictation-direction="${card.dataset.activityDirection}"]`)?.click();
    if (card.dataset.activityCategory) document.querySelector(`.grammar-category-list [data-category="${card.dataset.activityCategory}"]`)?.click();
    panel.querySelector('[data-activity-back]')?.classList.remove('hidden');
  }));
  document.querySelectorAll('[data-activity-back]').forEach(button => button.addEventListener('click', showActivityMenu));
  document.querySelector('#word-search')?.addEventListener('input', e => {
    const query = e.target.value.trim().toLocaleLowerCase('fr');
    document.querySelectorAll('.vocab-card').forEach(card => card.hidden = !card.dataset.search.toLocaleLowerCase('fr').includes(query));
  });
  document.querySelector('.finish-lesson')?.addEventListener('click', async e => {
    const button = e.currentTarget;
    const box = button.closest('[data-lesson]');
    button.disabled = true;
    try {
      const response = await fetch(appPath(`/api/complete/${box.dataset.lesson}`), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({score:Number(box.dataset.score || 0)})});
      if (!response.ok) throw new Error('Enregistrement impossible');
      const result = await response.json();
      button.textContent = `Résultat enregistré : ${result.score}% ✓`;
    } catch (_) {
      button.textContent = 'Réessayer l’enregistrement';
      button.disabled = false;
    }
  });
  document.querySelectorAll('.dialogue-card').forEach(card => {
    const steps = [...card.querySelectorAll('.dialogue-step')];
    let current = 0;
    let dialogueAdvanceTimer = null;
    const advance = card.querySelector('.dialogue-advance');
    steps.forEach((step, index) => {
      if (!step.querySelector('.dialogue-choices') && index === 0) advance.classList.remove('hidden');
      step.querySelectorAll('.dialogue-choice').forEach(choice => choice.addEventListener('click', () => {
        const reply = step.querySelector('.dialogue-reply');
        const correct = choice.dataset.correct === 'true';
        reply.textContent = correct ? `Bonne réponse : ${choice.dataset.ka} · ${choice.dataset.fr}` : 'Cette réponse ne correspond pas à la situation. Réessayez.';
        reply.className = 'dialogue-reply ' + (correct ? 'success' : 'try-again');
        if (correct) {
          playSuccessSound();
          step.querySelectorAll('.dialogue-choice').forEach(b => b.disabled = true);
          advance.classList.remove('hidden');
          dialogueAdvanceTimer = window.setTimeout(() => {
            dialogueAdvanceTimer = null;
            advance.click();
          }, 1700);
        }
      }));
    });
    advance.addEventListener('click', () => {
      if (dialogueAdvanceTimer !== null) window.clearTimeout(dialogueAdvanceTimer);
      dialogueAdvanceTimer = null;
      steps[current]?.classList.add('hidden'); current++;
      if (current >= steps.length) {
        advance.classList.add('hidden');
        card.querySelector('.dialogue-finish').classList.remove('hidden');
        return;
      }
      steps[current].classList.remove('hidden');
      advance.classList.toggle('hidden', !!steps[current].querySelector('.dialogue-choices'));
    });
  });
  document.querySelectorAll('.dialogue-immersion-toggle').forEach(immersionButton => immersionButton.addEventListener('click', () => {
    const immersive = document.body.classList.toggle('dialogue-immersion');
    document.querySelectorAll('.dialogue-immersion-toggle').forEach(button => {
      button.setAttribute('aria-pressed', String(immersive));
      button.textContent = immersive ? 'Afficher le français' : 'Masquer le français';
    });
  }));
});

function appPath(path) {
  const base = document.documentElement.dataset.appBase || '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function offerSkipButton(feedback, onSkip, label = 'Passer à la suite →') {
  if (!feedback) return;
  feedback.querySelector('[data-skip-question]')?.remove();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary skip-question';
  button.dataset.skipQuestion = 'true';
  button.textContent = label;
  button.addEventListener('click', onSkip, {once: true});
  feedback.append(button);
}

let autoAdvanceTimer = null;
function scheduleAutoAdvance(callback, delay = 1600) {
  clearAutoAdvance();
  autoAdvanceTimer = window.setTimeout(() => {
    autoAdvanceTimer = null;
    callback();
  }, delay);
}

function clearAutoAdvance() {
  if (autoAdvanceTimer !== null) window.clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
}

let successAudioContext = null;
function unlockSuccessAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    successAudioContext ||= new AudioContextClass();
    if (successAudioContext.state === 'suspended') successAudioContext.resume().catch(() => {});
  } catch (_) {
    // Audio is optional; exercises must keep working if the browser has no Web Audio support.
  }
}

function playSuccessSound() {
  unlockSuccessAudio();
  if (!successAudioContext || successAudioContext.state !== 'running') return;
  const now = successAudioContext.currentTime;
  [[659.25, 0], [880, 0.105]].forEach(([frequency, delay]) => {
    const oscillator = successAudioContext.createOscillator();
    const gain = successAudioContext.createGain();
    const start = now + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
    oscillator.connect(gain);
    gain.connect(successAudioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}

let activeTtsAudio = null;
let activeTtsButton = null;
let ttsRequestGeneration = 0;
function resetActiveTts() {
  if (activeTtsAudio) {
    activeTtsAudio.audio.pause();
    URL.revokeObjectURL(activeTtsAudio.source);
    activeTtsAudio = null;
  }
  if (activeTtsButton) {
    activeTtsButton.textContent = activeTtsButton.dataset.original;
    activeTtsButton.disabled = false;
    activeTtsButton = null;
  }
}
function stopSpeechPlayback() {
  ttsRequestGeneration++;
  resetActiveTts();
}
async function playSpeech(text, language, button) {
  const generation = ++ttsRequestGeneration;
  resetActiveTts();
  button.dataset.original ||= button.textContent;
  activeTtsButton = button;
  button.disabled = true;
  button.textContent = 'Préparation…';
  try {
    const response = await fetch(appPath('/api/audio'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({lang: language, text})
    });
    if (!response.ok) throw new Error('audio indisponible');
    const source = URL.createObjectURL(await response.blob());
    if (generation !== ttsRequestGeneration) { URL.revokeObjectURL(source); return; }
    const audio = new Audio(source);
    activeTtsAudio = {audio, source};
    const finish = () => {
      URL.revokeObjectURL(source);
      if (activeTtsAudio?.audio === audio) {
        activeTtsAudio = null;
        if (activeTtsButton === button) activeTtsButton = null;
        button.textContent = button.dataset.original;
        button.disabled = false;
      }
    };
    audio.addEventListener('ended', finish, {once:true});
    audio.addEventListener('error', finish, {once:true});
    button.textContent = '▶ Lecture…';
    try { await audio.play(); } catch (error) { finish(); throw error; }
  } catch (_) {
    if (generation !== ttsRequestGeneration) return;
    button.textContent = button.dataset.original;
    button.disabled = false;
    if (activeTtsButton === button) activeTtsButton = null;
    button.title = language === 'fr' ? 'Audio français non préparé sur cette installation.' : 'Audio géorgien non préparé sur cette installation.';
  }
}
