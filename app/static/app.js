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
    refreshExerciseDifficulty();
  }
  document.querySelectorAll('.activity-card[href^="#"]').forEach(card => card.addEventListener('click', event => {
    const target = document.querySelector(card.getAttribute('href'));
    const panel = target?.closest('[data-activity-panel]') || target;
    if (!panel) return;
    event.preventDefault();
    activityPanels.forEach(item => item.classList.toggle('hidden', item !== panel));
    activityMenus.forEach(menu => menu.classList.toggle('hidden', !menu.classList.contains('activity-hero')));
    if (card.dataset.difficulty) panel.dataset.difficulty = card.dataset.difficulty;
    if (card.dataset.activityDirection) document.querySelector(`[data-dictation-direction="${card.dataset.activityDirection}"]`)?.click();
    if (card.dataset.activityCategory) document.querySelector(`.grammar-category-list [data-category="${card.dataset.activityCategory}"]`)?.click();
    panel.querySelector('[data-activity-back]')?.classList.remove('hidden');
    refreshExerciseDifficulty();
  }));
  const fragment = decodeURIComponent(location.hash.slice(1));
  const fragmentTarget = fragment ? document.getElementById(fragment) : null;
  const fragmentPanel = fragmentTarget?.closest('[data-activity-panel]');
  if (fragmentPanel && activityPanels.includes(fragmentPanel)) {
    activityPanels.forEach(panel => panel.classList.toggle('hidden', panel !== fragmentPanel));
    activityMenus.forEach(menu => menu.classList.toggle('hidden', !menu.classList.contains('activity-hero')));
    fragmentPanel.querySelector('[data-activity-back]')?.classList.remove('hidden');
    refreshExerciseDifficulty();
    requestAnimationFrame(() => {
      const briefing = fragmentPanel.querySelector('[data-exercise-briefing]:not([hidden])');
      (briefing || fragmentTarget).scrollIntoView({behavior: 'smooth', block: 'start'});
    });
  }
  document.querySelectorAll('[data-activity-back]').forEach(button => button.addEventListener('click', showActivityMenu));
  const levelDialog = document.querySelector('#exercise-level-dialog');
  const levelSticker = document.querySelector('#exercise-level-sticker');
  levelSticker?.addEventListener('click', () => {
    const panel = activityPanels.find(item => !item.classList.contains('hidden') && item.dataset.difficulty);
    const alphabetOnly = panel?.closest('.alphabet-page') || panel?.classList.contains('alphabet-practice')
      || panel?.classList.contains('alphabet-speed') || panel?.classList.contains('alphabet-word-speed');
    levelDialog?.querySelectorAll('[data-practice-level]').forEach(option => {
      option.disabled = !!alphabetOnly && option.dataset.practiceLevel !== 'A1';
    });
    levelDialog?.showModal();
  });
  levelDialog?.querySelector('[data-level-dialog-close]')?.addEventListener('click', () => levelDialog.close());
  levelDialog?.addEventListener('click', event => { if (event.target === levelDialog) levelDialog.close(); });
  levelDialog?.querySelectorAll('[data-practice-level]').forEach(option => option.addEventListener('click', () => {
    const panel = activityPanels.find(item => !item.classList.contains('hidden') && item.dataset.difficulty);
    if (!panel || option.disabled) return;
    const context = {path: location.pathname, panel: panel.id, activity: window.getActiveVocabularyGame?.() || '',
      category: document.querySelector('.grammar-category-list button.active')?.dataset.category || '',
      direction: document.querySelector('[data-dictation-direction].active')?.dataset.dictationDirection || '',
      started: panel.querySelector('[data-exercise-briefing]')?.hidden ?? true};
    sessionStorage.setItem('practice-level-context', JSON.stringify(context));
    const destination = new URL(location.href);
    ['bank', 'cefr', 'version'].forEach(key => destination.searchParams.delete(key));
    destination.searchParams.set('practice_cefr', option.dataset.practiceLevel);
    destination.searchParams.set('practice_run', String(Date.now()));
    destination.hash = panel.id;
    location.assign(destination.href);
  }));

  const restoreRaw = sessionStorage.getItem('practice-level-context');
  if (restoreRaw) {
    sessionStorage.removeItem('practice-level-context');
    try {
      const context = JSON.parse(restoreRaw);
      const selected = new URLSearchParams(location.search).get('practice_cefr');
      const panel = context.path === location.pathname ? document.getElementById(context.panel) : null;
      if (panel && selected && activityPanels.includes(panel)) {
        activityPanels.forEach(item => item.classList.toggle('hidden', item !== panel));
        activityMenus.forEach(item => item.classList.toggle('hidden', !item.classList.contains('activity-hero')));
        panel.dataset.difficulty = selected;
        panel.querySelector('[data-activity-back]')?.classList.remove('hidden');
        if (context.category) document.querySelector(`.grammar-category-list [data-category="${context.category}"]`)?.click();
        if (context.direction) document.querySelector(`[data-dictation-direction="${context.direction}"]`)?.click();
        if (context.activity && window.openVocabularyGame) window.openVocabularyGame(context.activity);
        else {
          const startIds = {reading:'reading-start','reading-exam':'exam-start','reading-cloze':'cloze-start',
            dictation:'dictation-start','dictation-listening':'listening-dictation-start',
            'dictation-sentences':'sentence-dictation-start','dialogue-flash':'dialogue-flash-start',
            'comprehension-order':'order-start','comprehension-vf':'vf-start',
            'alphabet-speed':'speed-start','alphabet-word-speed':'word-speed-start','grammar-speed':'grammar-speed-start'};
          const start = document.getElementById(startIds[panel.id]);
          if (start && context.started) requestAnimationFrame(() => start.click());
        }
        refreshExerciseDifficulty();
      }
    } catch (_) { /* Ignore an outdated saved exercise context. */ }
  }
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
    const start = card.querySelector('.dialogue-start');
    const replay = card.querySelector('.dialogue-replay');
    const finish = card.querySelector('.dialogue-finish');
    const resetDialogue = () => {
      if (dialogueAdvanceTimer !== null) window.clearTimeout(dialogueAdvanceTimer);
      dialogueAdvanceTimer = null;
      current = 0;
      steps.forEach((step, index) => {
        step.classList.toggle('hidden', index !== 0);
        step.querySelectorAll('.dialogue-choice').forEach(button => { button.disabled = false; });
        const reply = step.querySelector('.dialogue-reply');
        if (reply) { reply.textContent = ''; reply.className = 'dialogue-reply'; }
      });
      advance.classList.toggle('hidden', !!steps[0]?.querySelector('.dialogue-choices'));
      finish.classList.add('hidden');
      start.classList.add('hidden');
    };
    start?.addEventListener('click', resetDialogue);
    replay?.addEventListener('click', () => start?.click());
    steps.forEach((step, index) => {
      if (!step.querySelector('.dialogue-choices') && index === 0) advance.classList.remove('hidden');
      step.querySelectorAll('.dialogue-choice').forEach(choice => choice.addEventListener('click', () => {
        const reply = step.querySelector('.dialogue-reply');
        const correct = choice.dataset.correct === 'true';
        reply.textContent = correct ? `Bonne réponse : ${choice.dataset.ka}` : 'Cette réponse ne correspond pas à la situation. Réessayez.';
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
        finish.classList.remove('hidden');
        return;
      }
      steps[current].classList.remove('hidden');
      advance.classList.toggle('hidden', !!steps[current].querySelector('.dialogue-choices'));
    });
  });
  refreshExerciseDifficulty();
});

function refreshExerciseDifficulty() {
  const sticker = document.querySelector('#exercise-level-sticker');
  if (!sticker) return;
  const activePanel = [...document.querySelectorAll('[data-activity-panel]')]
    .find(panel => !panel.classList.contains('hidden') && panel.dataset.difficulty);
  const level = activePanel?.dataset.difficulty?.trim();
  if (!level) {
    sticker.classList.add('hidden');
    return;
  }
  const labels = {A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire avancé', C1:'Avancé', C2:'Maîtrise'};
  const range = level.match(/^(A1|A2|B1|B2|C1|C2)[–—-](A1|A2|B1|B2|C1|C2)$/);
  sticker.querySelector('#exercise-level-value').textContent = range ? `${range[1]}–${range[2]}` : level;
  sticker.querySelector('#exercise-level-name').textContent = range ? 'Progression' : (labels[level] || 'Niveau estimé');
  const selected = new URLSearchParams(location.search).get('practice_cefr');
  if (selected) {
    sticker.querySelector('#exercise-level-value').textContent = selected;
    sticker.querySelector('#exercise-level-name').textContent = labels[selected] || 'Niveau choisi';
  }
  sticker.classList.remove('hidden');
}

window.setExerciseDifficulty = (panel, level) => {
  const selected = new URLSearchParams(location.search).get('practice_cefr');
  if (selected) level = selected;
  if (panel && level) panel.dataset.difficulty = level;
  refreshExerciseDifficulty();
};
window.refreshExerciseDifficulty = refreshExerciseDifficulty;

function appPath(path) {
  const base = document.documentElement.dataset.appBase || '';
  const destination = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`, location.origin);
  const selected = new URLSearchParams(location.search);
  ['bank', 'cefr', 'version', 'practice_cefr', 'practice_run'].forEach(key => {
    const value = selected.get(key);
    if (value && !destination.searchParams.has(key)) destination.searchParams.set(key, value);
  });
  return `${destination.pathname}${destination.search}`;
}

function offerSkipButton(feedback, onSkip, label = 'Passer à la suite →') {
  if (!feedback) return;
  feedback.querySelector('[data-skip-question]')?.remove();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary skip-question';
  button.dataset.skipQuestion = 'true';
  button.textContent = label;
  button.addEventListener('click', onSkip);
  feedback.append(button);
}

function offerDontKnowButton(container, onSkip) {
  if (!container) return null;
  container.querySelector('[data-dont-know]')?.remove();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary dont-know-button';
  button.dataset.dontKnow = 'true';
  button.textContent = 'Je ne sais pas →';
  button.addEventListener('click', onSkip, {once: true});
  container.append(button);
  return button;
}
window.offerDontKnowButton = offerDontKnowButton;

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
window.playSpeech = playSpeech;
