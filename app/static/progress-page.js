(() => {
  const STORAGE_KEY = 'parlons-georgien-learning-profile-v1';
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const levelFromRating = rating => rating < 900 ? 'A1' : rating < 1100 ? 'A2' : rating < 1300 ? 'B1' : rating < 1500 ? 'B2' : rating < 1700 ? 'C1' : 'C2';
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const formatDate = key => new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
  const readProfile = () => {
    if (window.getLearningProgressSnapshot) return window.getLearningProgressSnapshot();
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const render = () => {
    const target = document.querySelector('#daily-level-chart');
    if (!target) return;
    const profile = readProfile();
    const history = Array.isArray(profile.history) ? profile.history : [];
    const byDay = new Map();
    history.forEach(item => {
      const date = new Date(item.at);
      const rating = Number(item.rating);
      if (!Number.isFinite(date.getTime()) || !Number.isFinite(rating)) return;
      const key = localDateKey(date);
      const day = byDay.get(key) || {key, rating, level: item.estimatedLevel, count: 0};
      day.rating = rating;
      if (levels.includes(item.estimatedLevel)) day.level = item.estimatedLevel;
      day.count += 1;
      byDay.set(key, day);
    });
    const days = [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-45);
    const current = window.getEstimatedCefr?.() || profile.overallLevel || profile.selfAssessmentLevel || (days.length ? levelFromRating(days.at(-1).rating) : '—');
    const currentNode = document.querySelector('#progress-page-current');
    if (currentNode) currentNode.textContent = current;
    const accountLevel = document.querySelector('#account-level');
    if (accountLevel) accountLevel.textContent = current;
    const daysNode = document.querySelector('#progress-page-days');
    if (daysNode) daysNode.textContent = String(days.length);
    const answersNode = document.querySelector('#progress-page-answers');
    if (answersNode) answersNode.textContent = String(history.length);
    const spanNode = document.querySelector('#progress-page-span');
    if (spanNode) spanNode.textContent = days.length ? `${formatDate(days[0].key)} – ${formatDate(days.at(-1).key)}` : '—';

    if (!days.length) {
      target.innerHTML = '<div class="progress-empty">Vos premières réponses évaluées feront apparaître votre évolution ici. Choisissez un exercice pour commencer.</div>';
      return;
    }
    const width = 760, height = 270, left = 48, right = 20, top = 20, bottom = 38;
    const plotHeight = height - top - bottom;
    const x = index => days.length === 1 ? (width + left - right) / 2 : left + index * (width - left - right) / (days.length - 1);
    const y = level => top + (levels.length - 1 - levels.indexOf(level)) * plotHeight / (levels.length - 1);
    const dailyLevels = days.map(day => levels.includes(day.level) ? day.level : levelFromRating(day.rating));
    const guides = levels.map(level => `<g><line x1="${left}" x2="${width-right}" y1="${y(level)}" y2="${y(level)}"/><text x="${left-10}" y="${y(level)+4}" text-anchor="end">${level}</text></g>`).join('');
    const points = dailyLevels.map((level, index) => `${x(index)},${y(level)}`).join(' ');
    const dots = days.map((day, index) => `<circle cx="${x(index)}" cy="${y(dailyLevels[index])}" r="5"><title>${escapeHtml(formatDate(day.key))} · ${dailyLevels[index]} · ${day.count} réponse${day.count > 1 ? 's' : ''}</title></circle>`).join('');
    const labels = days.length <= 8 ? days.map((day, index) => `<text class="day-label" x="${x(index)}" y="${height-8}" text-anchor="middle">${escapeHtml(formatDate(day.key))}</text>`).join('') : [0, Math.floor((days.length - 1) / 2), days.length - 1].map(index => `<text class="day-label" x="${x(index)}" y="${height-8}" text-anchor="middle">${escapeHtml(formatDate(days[index].key))}</text>`).join('');
    const first = formatDate(days[0].key), last = formatDate(days.at(-1).key);
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Progression quotidienne du niveau ${dailyLevels[0]} au ${dailyLevels.at(-1)}, du ${escapeHtml(first)} au ${escapeHtml(last)}"><g class="daily-chart-guides">${guides}</g><polyline points="${points}"/>${dots}<g class="daily-chart-labels">${labels}</g></svg>`;
  };
  document.addEventListener('DOMContentLoaded', async () => {
    try { await (window.accountSyncReady || Promise.resolve()); } catch (_) {}
    render();
  });
  window.addEventListener('account-profile-restored', render);
})();
