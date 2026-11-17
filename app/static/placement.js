(() => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const TOTAL = 12;
  const base = document.documentElement.dataset.appBase || '';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#placement-dialog');
  if (!dialog) return;

  let state;
  const show = selector => $(selector).classList.remove('hidden');
  const hide = selector => $(selector).classList.add('hidden');
  const start = () => {
    state = {level: 'A2', index: 0, streak: 0, responses: [], used: new Set(), item: null, locked: false};
    hide('#placement-intro');
    hide('#placement-result');
    show('#placement-quiz');
    loadQuestion();
  };
  const loadQuestion = async () => {
    if (state.index >= TOTAL) return finish();
    $('#placement-count').textContent = `Question ${state.index + 1} sur ${TOTAL}`;
    $('#placement-level').textContent = state.level;
    $('#placement-progress-fill').style.width = `${state.index / TOTAL * 100}%`;
    $('#placement-feedback').textContent = '';
    $('#placement-feedback').className = 'placement-feedback';
    hide('#placement-next');
    $('#placement-options').replaceChildren();
    try {
      let response = await fetch(`${base}/api/placement/next?cefr=${state.level}&exclude=${encodeURIComponent([...state.used].join(','))}`);
      if (!response.ok) throw new Error('Impossible de charger une question.');
      let item = await response.json();
      if (item.empty) {
        const fallback = LEVELS[Math.max(0, LEVELS.indexOf(state.level) - 1)] || 'A1';
        response = await fetch(`${base}/api/placement/next?cefr=${fallback}`);
        item = await response.json();
        if (item.empty) throw new Error('Il n’y a pas de question disponible à ce niveau.');
      }
      state.item = item;
      state.used.add(item.id);
      state.locked = false;
      $('#placement-text').textContent = item.text;
      $('#placement-question').textContent = item.question;
      item.options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'placement-option';
        button.textContent = option;
        button.addEventListener('click', () => answer(option, button));
        $('#placement-options').append(button);
      });
      const unknown = document.createElement('button');
      unknown.type = 'button';
      unknown.className = 'placement-option';
      unknown.dataset.unknown = 'true';
      unknown.textContent = 'Je ne sais pas';
      unknown.addEventListener('click', () => answer(null, unknown));
      $('#placement-options').append(unknown);
    } catch (error) {
      $('#placement-feedback').textContent = error.message || 'Une erreur est survenue.';
      $('#placement-feedback').classList.add('is-wrong');
      show('#placement-next');
      $('#placement-next').textContent = 'Réessayer';
      $('#placement-next').onclick = loadQuestion;
    }
  };
  const answer = (choice, button) => {
    if (state.locked) return;
    state.locked = true;
    const item = state.item;
    const correct = choice === item.answer;
    state.responses.push({id: item.id, level: item.cefr, correct});
    document.querySelectorAll('.placement-option').forEach(option => {
      option.disabled = true;
      if (option.textContent === item.answer) option.classList.add('is-correct');
    });
    if (correct) {
      button.classList.add('is-correct');
      state.streak += 1;
      if (state.streak >= 2 && LEVELS.indexOf(state.level) < LEVELS.length - 1) {
        state.level = LEVELS[LEVELS.indexOf(state.level) + 1];
        state.streak = 0;
      }
      $('#placement-feedback').textContent = 'Bonne réponse ! La prochaine question pourra être un peu plus exigeante.';
      $('#placement-feedback').classList.add('is-correct');
    } else {
      const didntKnow = button.dataset.unknown === 'true';
      button.classList.add(didntKnow ? 'is-unknown' : 'is-wrong');
      state.streak = 0;
      if (LEVELS.indexOf(state.level) > 0) state.level = LEVELS[LEVELS.indexOf(state.level) - 1];
      $('#placement-feedback').textContent = `${didntKnow ? 'Bien noté.' : 'Pas tout à fait.'} La bonne réponse était « ${item.answer} ». ${item.explanation || ''}`;
      $('#placement-feedback').classList.add('is-wrong');
    }
    state.index += 1;
    $('#placement-next').textContent = state.index >= TOTAL ? 'Voir mon résultat' : 'Question suivante';
    $('#placement-next').onclick = loadQuestion;
    show('#placement-next');
  };
  const finish = () => {
    hide('#placement-quiz');
    show('#placement-result');
    const correct = state.responses.filter(item => item.correct).length;
    const level = window.recordPlacementAssessment(state.responses);
    $('#placement-progress-fill').style.width = '100%';
    $('#placement-result-title').textContent = `Votre niveau de départ : ${level}`;
    $('#placement-result-copy').textContent = 'Cette estimation est un premier repère, construit à partir de vos réponses. Elle évoluera au fil de vos exercices et de vos réussites.';
    $('#placement-result-stats').innerHTML = `<div><b>${correct}/${state.responses.length}</b><span>bonnes réponses</span></div><div><b>${state.responses[0]?.level || 'A2'} → ${state.responses.at(-1)?.level || 'A2'}</b><span>difficulté explorée</span></div>`;
  };

  window.openPlacementDiagnostic = () => {
    state = null;
    show('#placement-intro');
    hide('#placement-quiz');
    hide('#placement-result');
    if (!dialog.open) dialog.showModal();
  };

  $('#placement-start')?.addEventListener('click', start);
  $('#placement-later')?.addEventListener('click', () => {
    window.dismissPlacementWelcome?.();
    dialog.close();
  });
  $('.placement-close')?.addEventListener('click', () => dialog.close());
  $('#placement-finish')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (!state || !$('#placement-result').classList.contains('hidden')) return;
    window.dismissPlacementWelcome?.();
    state = null;
    show('#placement-intro');
    hide('#placement-quiz');
    hide('#placement-result');
  });
  document.addEventListener('DOMContentLoaded', async () => {
    await window.accountSyncReady;
    try {
      const profile = JSON.parse(localStorage.getItem('parlons-georgien-learning-profile-v1') || '{}');
      if (!profile.onboarding?.completedAt && !profile.onboarding?.dismissedAt && !profile.history?.length) {
        dialog.showModal();
      }
    } catch (_) { /* The assessment remains available from the level profile. */ }
  });
})();
