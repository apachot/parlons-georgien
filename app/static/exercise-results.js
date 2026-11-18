(() => {
  const resultSelector = '.lesson-summary:not(.hidden), .speed-result:not(.hidden), .game-complete:not(.hidden), .dialogue-finish:not(.hidden)';
  const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const textOf = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = node => !!node && !node.classList.contains('hidden') && !node.hidden && !node.closest('.hidden');

  function resultMessage(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('button, a, h1, h2, h3, .eyebrow, .complete-confetti, [data-next-exercise]').forEach(item => item.remove());
    return textOf(copy) || textOf(node);
  }

  function getNativeReplay(root) {
    return [...root.querySelectorAll('button')].find(button => visible(button) && /rejouer|recommencer|nouvelle épreuve|recommencer la série/i.test(textOf(button))) || null;
  }

  function buildStats(text) {
    const fraction = text.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    const percent = text.match(/\b(\d{1,3})\s*%/);
    const values = [];
    if (fraction) values.push([`${fraction[1]} / ${fraction[2]}`, 'réponses justes']);
    if (percent) values.push([`${percent[1]} %`, 'de précision']);
    return values;
  }

  function adjacentLevels(root) {
    const appBase = document.documentElement.dataset.appBase || '';
    let path = location.pathname;
    if (appBase && path.startsWith(appBase)) path = path.slice(appBase.length) || '/';
    if (path.startsWith('/alphabet') || /^\/lessons\/[^/]+/.test(path) || root.matches('.dialogue-card')) return null;
    const requested = new URLSearchParams(location.search).get('practice_cefr');
    const level = requested || root.dataset.difficulty?.trim();
    const index = cefrLevels.indexOf(level);
    if (index < 0) return null;
    return {lower: cefrLevels[index - 1] || null, current: level, upper: cefrLevels[index + 1] || null};
  }

  function changeLevel(target) {
    const sticker = document.querySelector('#exercise-level-sticker');
    const option = document.querySelector(`#exercise-level-dialog [data-practice-level="${target}"]`);
    if (!sticker || sticker.classList.contains('hidden') || !option || option.disabled) return;
    sticker.click();
    option.click();
  }

  function createResult(root, nativeNode, options = {}) {
    if (!root || root.classList.contains('exercise-result-active')) return;
    window.refreshNextExerciseCallout?.();
    const title = options.title || textOf(nativeNode?.querySelector('h1, h2, h3')) || 'Séance terminée';
    const detail = options.detail || resultMessage(nativeNode);
    const originalParent = nativeNode?.parentNode || null;
    const originalNext = nativeNode?.nextSibling || null;
    const saveAction = root.querySelector('.finish-lesson:not(.hidden)');
    const saveParent = saveAction?.parentNode || null;
    const saveNext = saveAction?.nextSibling || null;
    const replay = options.replay || getNativeReplay(root);
    const back = root.querySelector('[data-activity-back], .back-to-games');
    const result = document.createElement('section');
    result.className = 'exercise-result-screen';
    result.dataset.exerciseResult = '';
    result.setAttribute('aria-live', 'polite');
    const header = document.createElement('div'); header.className = 'exercise-result-heading';
    const mark = document.createElement('span'); mark.className = 'exercise-result-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = '✓';
    const kicker = document.createElement('span'); kicker.className = 'exercise-result-kicker'; kicker.textContent = 'Test terminé';
    header.append(mark, kicker);
    const heading = document.createElement('h2'); heading.textContent = title;
    const level = document.createElement('span'); level.className = 'exercise-result-level';
    const levelValue = root.dataset.difficulty || '';
    level.textContent = levelValue ? `Niveau ${levelValue}` : 'Votre séance';
    const availableLevels = adjacentLevels(root);
    let levelActions = null;
    if (availableLevels) {
      levelActions = document.createElement('div'); levelActions.className = 'exercise-result-level-actions';
      levelActions.setAttribute('role', 'group'); levelActions.setAttribute('aria-label', 'Adapter la difficulté');
      const lower = document.createElement('button'); lower.type = 'button'; lower.className = 'button secondary';
      lower.textContent = availableLevels.lower ? `Passer au niveau inférieur · ${availableLevels.lower} ↓` : 'Niveau inférieur indisponible · A1';
      lower.disabled = !availableLevels.lower;
      if (availableLevels.lower) lower.addEventListener('click', () => changeLevel(availableLevels.lower));
      const upper = document.createElement('button'); upper.type = 'button'; upper.className = 'button secondary';
      upper.textContent = availableLevels.upper ? `Passer au niveau supérieur · ${availableLevels.upper} ↑` : 'Niveau supérieur indisponible · C2';
      upper.disabled = !availableLevels.upper;
      if (availableLevels.upper) upper.addEventListener('click', () => changeLevel(availableLevels.upper));
      levelActions.append(lower, upper);
    }
    const message = document.createElement('p'); message.className = 'exercise-result-message'; message.textContent = detail;
    const stats = document.createElement('div'); stats.className = 'exercise-result-stats';
    buildStats(`${title} ${detail}`).forEach(([value, label]) => {
      const stat = document.createElement('div'); stat.className = 'exercise-result-stat';
      const strong = document.createElement('b'); strong.textContent = value;
      const caption = document.createElement('span'); caption.textContent = label;
      stat.append(strong, caption); stats.append(stat);
    });
    const encouragement = document.createElement('p'); encouragement.className = 'exercise-result-encouragement';
    encouragement.textContent = 'Chaque séance vous fait avancer. Vous pouvez revoir vos réponses ou poursuivre avec un autre exercice.';
    const actions = document.createElement('div'); actions.className = 'exercise-result-actions';
    const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'button primary';
    primary.textContent = replay ? 'Rejouer →' : 'Voir les exercices →';
    primary.addEventListener('click', () => {
      closeResult(root, result, nativeNode, originalParent, originalNext, saveAction, saveParent, saveNext);
      if (replay?.isConnected) replay.click(); else back?.click();
    });
    const secondary = document.createElement('button'); secondary.type = 'button'; secondary.className = 'button secondary';
    secondary.textContent = 'Choisir un autre exercice';
    secondary.addEventListener('click', () => { closeResult(root, result, nativeNode, originalParent, originalNext, saveAction, saveParent, saveNext); back?.click(); });
    actions.append(primary, secondary);
    if (saveAction) actions.append(saveAction);
    result.append(header, heading, level);
    if (levelActions) result.append(levelActions);
    result.append(message, stats, encouragement, actions);
    const nextExercise = root.querySelector('[data-next-exercise="true"]');
    if (nextExercise) { nextExercise.classList.remove('hidden'); result.append(nextExercise); }
    if (nativeNode) {
      nativeNode.classList.add('hidden');
      nativeNode.hidden = true;
      root.append(nativeNode);
    }
    root.append(result);
    root.classList.add('exercise-result-active');
    window.playSuccessSound?.();
  }

  function closeResult(root, result, nativeNode, originalParent, originalNext, saveAction, saveParent, saveNext) {
    root.classList.remove('exercise-result-active');
    result.querySelector('[data-next-exercise="true"]')?.remove();
    if (saveAction && saveParent) saveParent.insertBefore(saveAction, saveNext?.parentNode === saveParent ? saveNext : null);
    result.remove();
    if (nativeNode && originalParent) {
      nativeNode.hidden = false;
      nativeNode.classList.remove('hidden');
      originalParent.insertBefore(nativeNode, originalNext?.parentNode === originalParent ? originalNext : null);
    }
  }

  function detectSpecial(root) {
    const grammarPrompt = root.querySelector('#grammar-prompt');
    if (grammarPrompt && /^Série terminée\s*:/i.test(textOf(grammarPrompt))) {
      const native = root.querySelector('#grammar-quiz');
      return native ? {native, title: 'Série terminée', detail: `${textOf(grammarPrompt)} ${textOf(root.querySelector('#grammar-feedback'))}`, replay: root.querySelector('#grammar-next')} : null;
    }
    const letterPrompt = root.querySelector('#letter-prompt');
    if (letterPrompt && textOf(letterPrompt) === 'Manche terminée !') {
      const native = root.querySelector('#letter-prompt');
      return {native, title: 'Reconnaissance des sons terminée', detail: textOf(root.querySelector('#letter-session-count')) || 'Votre manche de reconnaissance est terminée.', replay: root.querySelector('#letter-restart')};
    }
    const quizWord = root.querySelector('#quiz-word');
    if (quizWord && /^Révisions terminées|^Belle régularité/i.test(textOf(quizWord))) {
      const native = root.querySelector('#quiz-choices');
      const detail = textOf(native?.querySelector('p')) || 'Vous avez terminé les mots disponibles dans cette séance.';
      return native ? {native, title: 'Séance terminée', detail} : null;
    }
    return null;
  }

  function scan() {
    document.querySelectorAll('[data-activity-panel]').forEach(root => {
      if (root.classList.contains('hidden') || root.classList.contains('exercise-result-active')) return;
      const special = detectSpecial(root);
      if (special) { createResult(root, special.native, special); return; }
      const native = [...root.querySelectorAll(resultSelector)].find(node => visible(node) && textOf(node));
      if (native) createResult(root, native);
    });
  }

  new MutationObserver(scan).observe(document.body, {attributes:true, attributeFilter:['class'], childList:true, characterData:true, subtree:true});
  scan();
})();
