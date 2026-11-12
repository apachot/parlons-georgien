(() => {
  const STORAGE_KEY = 'parlons-georgien-learning-profile-v1';
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const POINTS = {A1: 800, A2: 1000, B1: 1200, B2: 1400, C1: 1600, C2: 1800};
  const SKILL_NAMES = {
    alphabet: 'Alphabet', vocabulary: 'Vocabulaire', reading: 'Lecture',
    comprehension: 'Compréhension orale', dictation: 'Dictées',
    grammar: 'Grammaire', dialogues: 'Dialogues', mixed: 'Révisions'
  };
  const levelFromRating = rating => {
    if (rating < 900) return 'A1';
    if (rating < 1100) return 'A2';
    if (rating < 1300) return 'B1';
    if (rating < 1500) return 'B2';
    if (rating < 1700) return 'C1';
    return 'C2';
  };
  const hysteresisLevel = (rating, previous) => {
    let index = Math.max(0, LEVELS.indexOf(previous || levelFromRating(rating)));
    const upThresholds = [900, 1100, 1300, 1500, 1700];
    const margin = 60;
    while (index < LEVELS.length - 1 && rating >= upThresholds[index] + margin) index += 1;
    while (index > 0 && rating < upThresholds[index - 1] - margin) index -= 1;
    return LEVELS[index];
  };
  const normalizeLevel = raw => {
    const match = String(raw || '').match(/A1|A2|B1|B2|C1|C2/);
    return match ? match[0] : 'A1';
  };
  const readProfile = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {ratings: data.ratings || {}, history: Array.isArray(data.history) ? data.history : [],
        levels: data.levels || {}, overallLevel: data.overallLevel || null, pending: data.pending || {}};
    } catch (_) { return {ratings: {}, history: [], levels: {}, overallLevel: null, pending: {}}; }
  };
  let profile = readProfile();
  const activeQuestion = {};
  const skillForUrl = url => {
    const path = new URL(url, location.href).pathname;
    if (path.includes('/alphabet')) return 'alphabet';
    if (path.includes('/vocabulary') || path.includes('/crossword')) return 'vocabulary';
    if (path.includes('/dictation')) return 'dictation';
    if (path.includes('/grammar')) return 'grammar';
    if (path.includes('/dialogue')) return 'dialogues';
    if (path.includes('/comprehension')) return 'comprehension';
    if (path.includes('/reading')) return 'reading';
    if (path.endsWith('/quiz')) return 'vocabulary';
    if (path.endsWith('/answer')) return 'mixed';
    return 'mixed';
  };
  const overallRating = () => {
    const ratings = Object.values(profile.ratings).filter(item => item && item.count > 0);
    if (!ratings.length) return 800;
    return Math.round(ratings.reduce((sum, item) => sum + item.value, 0) / ratings.length);
  };
  const overallLevel = () => hysteresisLevel(overallRating(), profile.overallLevel);
  window.getEstimatedCefr = skill => {
    if (skill && profile.levels[skill]) return profile.levels[skill];
    return overallLevel();
  };
  window.getAdaptiveCefr = skill => {
    const overall = overallLevel();
    const personal = window.getEstimatedCefr(skill);
    return LEVELS[Math.max(LEVELS.indexOf(overall), LEVELS.indexOf(personal))];
  };
  const saveProfile = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (_) { /* Storage may be disabled. */ }
    refreshBadge();
  };
  const refreshBadge = () => {
    const value = document.querySelector('#learner-level-value');
    if (!value) return;
    const answered = profile.history.length;
    value.textContent = overallLevel();
    document.querySelector('#learner-level-caption').textContent = answered
      ? `${answered} question${answered === 1 ? '' : 's'} évaluée${answered === 1 ? '' : 's'}`
      : 'À confirmer';
  };
  const currentExerciseLevel = () => {
    const panel = [...document.querySelectorAll('[data-activity-panel]')]
      .find(item => !item.classList.contains('hidden') && item.dataset.difficulty);
    return normalizeLevel(panel?.dataset.difficulty || document.querySelector('#exercise-level-value')?.textContent);
  };
  const questionKey = (skill, id) => `${skill}:${id}`;
  const scoreQuestion = (skill, id, solved) => {
    const key = questionKey(skill, id);
    const question = profile.pending[key];
    if (!question || (question.wrong < 1 && !solved)) return;
    const score = 1 / (question.wrong + 1);
    const rating = profile.ratings[skill] || {value: overallRating(), count: 0, correct: 0};
    const expected = 1 / (1 + (10 ** ((POINTS[question.level] - rating.value) / 400)));
    const k = rating.count < 10 ? 40 : 24;
    rating.value = Math.max(600, Math.min(2200, Math.round(rating.value + k * (score - expected))));
    rating.count += 1;
    rating.correct += score;
    profile.ratings[skill] = rating;
    profile.levels[skill] = hysteresisLevel(rating.value, profile.levels[skill] || levelFromRating(rating.value));
    profile.overallLevel = hysteresisLevel(overallRating(), profile.overallLevel || levelFromRating(overallRating()));
    profile.history.push({at: new Date().toISOString(), skill, level: question.level,
      correct: solved, score, attempts: question.wrong + (solved ? 1 : 0), wrong: question.wrong,
      rating: overallRating()});
    delete profile.pending[key];
    if (profile.history.length > 5000) profile.history.splice(0, profile.history.length - 5000);
    saveProfile();
  };
  const trackQuestionAnswer = (skill, id, correct) => {
    if (typeof correct !== 'boolean' || id === undefined || id === null) return;
    const key = questionKey(skill, id);
    if (!profile.pending[key]) profile.pending[key] = {wrong: 0, level: currentExerciseLevel()};
    if (correct) scoreQuestion(skill, id, true);
    else {
      profile.pending[key].wrong += 1;
      saveProfile();
    }
  };
  const trackNextQuestion = (skill, id) => {
    if (id === undefined || id === null) return;
    const nextId = String(id);
    const previousId = activeQuestion[skill];
    if (previousId && previousId !== nextId) scoreQuestion(skill, previousId, false);
    Object.keys(profile.pending).forEach(key => {
      const prefix = `${skill}:`;
      if (key.startsWith(prefix) && key !== questionKey(skill, nextId)) scoreQuestion(skill, key.slice(prefix.length), false);
    });
    activeQuestion[skill] = nextId;
  };
  const installAnswerHistory = () => {
    if (window.__learningProfileFetchWrapped) return;
    window.__learningProfileFetchWrapped = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const request = args[0];
        const url = typeof request === 'string' || request instanceof URL ? request : request.url;
        const method = (args[1]?.method || request?.method || 'GET').toUpperCase();
        const parsedUrl = new URL(url, location.href);
        const payload = typeof args[1]?.body === 'string' ? JSON.parse(args[1].body) : {};
        let skill = skillForUrl(url);
        const kind = String(payload.kind || payload.type || parsedUrl.searchParams.get('kind') || parsedUrl.searchParams.get('exercise') || '').toLowerCase();
        if (parsedUrl.pathname.endsWith('/quiz')) {
          skill = kind.includes('alphabet') || kind.includes('letter') ? 'alphabet' : 'vocabulary';
        } else if (skill === 'mixed') {
          if (kind.includes('alphabet') || kind.includes('letter')) skill = 'alphabet';
          else if (kind.includes('vocab') || kind.includes('match') || kind.includes('order') || kind.includes('type')) skill = 'vocabulary';
          else if (parsedUrl.pathname.endsWith('/answer')) skill = 'vocabulary';
        }
        const path = parsedUrl.pathname;
        const isQuestionRequest = method === 'GET' && (
          path.endsWith('/next') || path.endsWith('/quiz') || path.endsWith('/true-false') ||
          path.endsWith('/order') || path.endsWith('/exam')
        );
        if (response.ok && isQuestionRequest) {
          const item = await response.clone().json();
          if (item.id !== undefined) trackNextQuestion(skill, item.id);
        }
        if (method === 'POST' && /\/answer(?:\?|$)/.test(path)) {
          const result = await response.clone().json();
          const id = payload.index === undefined ? payload.id : `${payload.id}:${payload.index}`;
          if (response.ok && typeof result.correct === 'boolean' && id !== undefined) {
            trackQuestionAnswer(skill, id, result.correct);
          }
        }
      } catch (_) { /* A history write must never interrupt an exercise. */ }
      return response;
    };
  };

  const esc = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const renderChart = () => {
    const target = document.querySelector('#progress-chart');
    if (!target) return;
    const history = profile.history.slice(-60);
    if (!history.length) {
      target.innerHTML = '<div class="progress-empty">Vos premières réponses feront apparaître votre courbe ici.</div>';
      return;
    }
    const width = 620, height = 190, padX = 30, padY = 20;
    const values = history.map(item => item.rating);
    const low = Math.max(600, Math.floor((Math.min(...values, 800) - 100) / 200) * 200);
    const high = Math.min(2200, Math.ceil((Math.max(...values, 800) + 100) / 200) * 200);
    const x = index => history.length === 1 ? width / 2 : padX + index * (width - 2 * padX) / (history.length - 1);
    const y = rating => height - padY - ((rating - low) / Math.max(high - low, 1)) * (height - 2 * padY);
    const points = history.map((item, index) => `${x(index)},${y(item.rating)}`).join(' ');
    const grid = LEVELS.map(level => {
      const rating = POINTS[level];
      if (rating < low || rating > high) return '';
      const cy = y(rating);
      return `<line x1="${padX}" x2="${width-padX}" y1="${cy}" y2="${cy}"/><text x="2" y="${cy+4}">${level}</text>`;
    }).join('');
    const firstDate = new Date(history[0].at).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
    const lastDate = new Date(history.at(-1).at).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution du niveau estimé du ${firstDate} au ${lastDate}, sur ${history.length} questions"><g class="chart-grid">${grid}</g><polyline points="${points}"/><circle cx="${x(history.length-1)}" cy="${y(values.at(-1))}" r="5"/></svg><div class="progress-chart-caption"><span>${firstDate} → ${lastDate} · ${history.length} questions</span><b>${overallLevel()}</b></div>`;
  };
  const renderDialog = () => {
    const total = profile.history.length;
    const earned = profile.history.reduce((sum, item) => sum + (Number.isFinite(item.score) ? item.score : Number(Boolean(item.correct))), 0);
    const recent = profile.history.slice(-30);
    const accuracy = total ? Math.round(earned * 100 / total) : 0;
    document.querySelector('#progress-summary').innerHTML = `<div><b>${overallLevel()}</b><span>Niveau estimé</span></div><div><b>${total}</b><span>Questions évaluées</span></div><div><b>${total ? `${accuracy}%` : '—'}</b><span>Score moyen · erreurs incluses</span></div>`;
    const skills = document.querySelector('#progress-skills');
    const entries = Object.entries(profile.ratings).filter(([, rating]) => rating.count).sort((a,b) => b[1].count-a[1].count);
    skills.innerHTML = entries.length ? entries.map(([skill, rating]) => {
      const score = Math.round(rating.correct * 100 / rating.count);
      return `<div class="progress-skill"><span>${esc(SKILL_NAMES[skill] || skill)}</span><b>${window.getEstimatedCefr(skill)}</b><span>${rating.count} question${rating.count === 1 ? '' : 's'}</span><i><em style="width:${score}%"></em></i><small>${score}% du score parfait</small></div>`;
    }).join('') : '<div class="progress-empty">Les résultats par compétence apparaîtront après vos premières réponses.</div>';
    document.querySelector('#progress-period').textContent = recent.length ? `sur ${recent.length} questions récentes` : '';
    const first = profile.history[0]?.at;
    const last = profile.history.at(-1)?.at;
    const period = document.querySelector('#progress-history');
    period.textContent = total ? `Historique conservé depuis le ${new Date(first).toLocaleDateString('fr-FR')} · dernière activité le ${new Date(last).toLocaleDateString('fr-FR')}.` : 'Aucun résultat enregistré pour le moment.';
    renderChart();
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshBadge();
    installAnswerHistory();
    const dialog = document.querySelector('#progress-dialog');
    document.querySelector('#learner-level')?.addEventListener('click', () => {
      renderDialog();
      dialog?.showModal();
    });
    dialog?.querySelector('.progress-close')?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  });
})();
