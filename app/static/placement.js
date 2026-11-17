(() => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const TOTAL = 12;
  const PROFILE_KEY = 'parlons-georgien-learning-profile-v1';
  const base = document.documentElement.dataset.appBase || '';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#placement-dialog');
  if (!dialog) return;

  let state;
  const show = selector => $(selector).classList.remove('hidden');
  const hide = selector => $(selector).classList.add('hidden');
  const readDraft = () => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}').onboarding?.draft || null; }
    catch (_) { return null; }
  };
  const saveDraft = () => {
    if (!state) return;
    window.savePlacementDraft?.({...state, used: [...state.used]});
  };
  const beginScreen = () => {
    hide('#placement-intro');
    hide('#placement-result');
    show('#placement-quiz');
  };
  const renderItem = item => {
    $('#placement-count').textContent = `Question ${state.locked ? state.index : state.index + 1} sur ${TOTAL}`;
    $('#placement-level').textContent = state.level;
    $('#placement-progress-fill').style.width = `${state.index / TOTAL * 100}%`;
    $('#placement-feedback').textContent = '';
    $('#placement-feedback').className = 'placement-feedback';
    hide('#placement-next');
    $('#placement-options').replaceChildren();
    $('#placement-text').textContent = item.text || '';
    $('#placement-question').textContent = item.question || '';
    const addOption = (label, choice, unknown = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'placement-option';
      button.textContent = label;
      if (unknown) button.dataset.unknown = 'true';
      button.addEventListener('click', () => answer(choice, button));
      $('#placement-options').append(button);
      return button;
    };
    item.options.forEach(option => addOption(option, option));
    const unknownButton = addOption('Je ne sais pas', null, true);
    if (!state.locked) return;

    document.querySelectorAll('.placement-option').forEach(button => {
      button.disabled = true;
      if (!button.dataset.unknown && button.textContent === item.answer) button.classList.add('is-correct');
    });
    const selected = [...document.querySelectorAll('.placement-option')].find(button =>
      state.selectedUnknown ? button === unknownButton : !button.dataset.unknown && button.textContent === state.selectedChoice);
    selected?.classList.add(state.selectedUnknown ? 'is-unknown' : state.lastCorrect ? 'is-correct' : 'is-wrong');
    const prefix = state.selectedUnknown ? 'Bien noté.' : state.lastCorrect ? 'Bonne réponse !' : 'Pas tout à fait.';
    $('#placement-feedback').textContent = state.lastCorrect
      ? `${prefix} La prochaine question pourra être un peu plus exigeante.`
      : `${prefix} La bonne réponse était « ${item.answer} ». ${item.explanation || ''}`;
    $('#placement-feedback').classList.add(state.lastCorrect ? 'is-correct' : 'is-wrong');
    $('#placement-next').textContent = state.index >= TOTAL ? 'Voir mon résultat' : 'Question suivante';
    $('#placement-next').onclick = loadQuestion;
    show('#placement-next');
  };
  const start = () => {
    state = {level: 'A2', index: 0, streak: 0, responses: [], used: new Set(), item: null, locked: false};
    beginScreen();
    loadQuestion();
  };
  const restore = draft => {
    if (!draft || !draft.item || !Array.isArray(draft.responses) || !Number.isInteger(draft.index)) return false;
    const level = LEVELS.includes(draft.level) ? draft.level : 'A1';
    const index = Math.max(0, Math.min(TOTAL, draft.index));
    state = {...draft, level, index, streak: Math.max(0, Number(draft.streak) || 0),
      responses: draft.responses, used: new Set(Array.isArray(draft.used) ? draft.used : []),
      locked: Boolean(draft.locked)};
    beginScreen();
    renderItem(state.item);
    return true;
  };
  const loadQuestion = async () => {
    if (state.index >= TOTAL) return finish();
    state.locked = false;
    state.selectedChoice = null;
    state.selectedUnknown = false;
    beginScreen();
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
      renderItem(item);
      saveDraft();
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
    state.selectedChoice = choice;
    state.selectedUnknown = button.dataset.unknown === 'true';
    const item = state.item;
    const correct = choice === item.answer;
    state.lastCorrect = correct;
    state.responses.push({id: item.id, level: item.cefr, correct});
    if (correct) {
      state.streak += 1;
      if (state.streak >= 2 && LEVELS.indexOf(state.level) < LEVELS.length - 1) {
        state.level = LEVELS[LEVELS.indexOf(state.level) + 1];
        state.streak = 0;
      }
    } else {
      state.streak = 0;
      if (LEVELS.indexOf(state.level) > 0) state.level = LEVELS[LEVELS.indexOf(state.level) - 1];
    }
    state.index += 1;
    renderItem(item);
    saveDraft();
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
    const draft = readDraft();
    if (!restore(draft)) {
      state = null;
      show('#placement-intro');
      hide('#placement-quiz');
      hide('#placement-result');
    }
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
    saveDraft();
    state = null;
    show('#placement-intro');
    hide('#placement-quiz');
    hide('#placement-result');
  });
  document.addEventListener('DOMContentLoaded', async () => {
    await window.accountSyncReady;
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      if (!profile.onboarding?.completedAt && restore(profile.onboarding?.draft)) {
        dialog.showModal();
      } else if (!profile.onboarding?.completedAt && !profile.onboarding?.dismissedAt && !profile.history?.length) {
        dialog.showModal();
      }
    } catch (_) { /* The assessment remains available from the level profile. */ }
  });
})();
