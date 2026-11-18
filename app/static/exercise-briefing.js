(() => {
  const levelNames = {
    A1: 'Débutant', A2: 'Élémentaire', B1: 'Intermédiaire',
    B2: 'Intermédiaire avancé', C1: 'Avancé', C2: 'Maîtrise'
  };
  const countFrom = (root, key, limit) => {
    const total = Number(root.dataset[key] || 0);
    return total ? Math.min(total, limit) : limit;
  };
  const configs = [
    {
      start: '#lesson-start', goal: 'Vérifier ce que vous retenez des mots et expressions de cette leçon.',
      method: 'Répondez aux questions dans les deux sens, puis consultez la correction. Une erreur ne bloque pas la suite.',
      plan: () => `${JSON.parse(document.querySelector('#lesson-questions')?.textContent || '[]').length} questions · quiz de fin de leçon`,
      level: 'A1–A2', score: 'Le résultat résume vos réponses. Vous pouvez refaire les questions et enregistrer la progression de la leçon.'
    },
    {
      start: '#quiz-start', goal: 'Réviser le vocabulaire avec une séance adaptée à votre mode de travail.',
      method: root => ({mcq: 'Lisez le mot géorgien et choisissez sa traduction française.', type: 'Lisez le sens français et écrivez le mot en géorgien.', order: 'Reconstituez une phrase géorgienne à partir des mots proposés.'}[root.dataset.exercise] || 'Répondez à dix questions variées. Après chaque réponse, lisez l’explication et notez la difficulté.'),
      plan: () => '10 questions · réponses et corrections immédiates',
      score: 'Votre bilan présente les réponses travaillées. Les mots difficiles reviendront plus tôt dans vos révisions.'
    },
    {
      start: '#reading-start', goal: root => root.dataset.oral === 'true'
        ? 'Comprendre un court passage oral en géorgien et repérer les informations utiles.'
        : 'Comprendre un court texte géorgien et repérer les informations utiles.',
      method: root => root.dataset.oral === 'true'
        ? 'Écoutez le passage, choisissez une réponse et consultez la correction avant de poursuivre.'
        : 'Lisez le passage, choisissez une réponse et consultez la correction avant de poursuivre.',
      plan: root => `${countFrom(root, 'total', 21)} questions · passages courts`,
      score: 'Le bilan compte les bonnes réponses. Les erreurs restent visibles et vous pouvez réessayer avant de passer.'
    },
    {
      start: '#exam-start', goal: 'Évaluer votre compréhension d’un texte long en géorgien.',
      method: 'Écoutez ou lisez le passage, puis répondez aux questions à choix multiples. Vous pouvez revenir au passage pendant l’épreuve.',
      plan: () => '1 texte · 4 à 5 questions · 15 minutes',
      score: 'Le résultat indique les bonnes réponses sur 4 ou 5 selon le texte, le pourcentage et le temps utilisé.'
    },
    {
      start: '#cloze-start', goal: 'Déduire le sens d’un mot grâce aux indices d’une phrase.',
      method: 'Lisez la phrase, choisissez le mot qui complète le mieux le contexte et prenez connaissance de l’explication.',
      plan: root => `${countFrom(root, 'total', 8)} phrases · 4 choix par question`,
      score: 'Le bilan indique combien de phrases ont été complétées correctement. Une erreur ne bloque pas la suite.'
    },
    {
      start: '#dictation-start', goal: 'Mémoriser des mots courants en passant du géorgien au français ou du français au géorgien.',
      method: root => root.querySelector('[data-dictation-direction="fr-ka"].active')
        ? 'Lisez le mot français et écrivez sa traduction en alphabet géorgien. Le clavier géorgien est disponible.'
        : 'Écoutez le mot géorgien sans le voir, puis écrivez-le en mkhedruli. Vous pouvez réécouter avant de répondre.',
      plan: root => `${countFrom(root, 'totalWords', 10)} mots · réponses écrites`,
      score: 'Le récapitulatif distingue les mots justes du premier essai. Les erreurs peuvent être corrigées ou passées.'
    },
    {
      start: '#listening-dictation-start', goal: 'Entraîner votre oreille et votre orthographe sur des phrases géorgiennes.',
      method: 'Écoutez la phrase, transcrivez-la en alphabet géorgien et corrigez votre réponse si nécessaire. La réécoute est libre.',
      plan: root => `${countFrom(root, 'totalSentences', 6)} phrases audio`,
      score: 'Le bilan indique les phrases transcrites correctement du premier coup.'
    },
    {
      start: '#sentence-dictation-start', goal: 'Construire une phrase géorgienne à partir de son sens en français.',
      method: 'Lisez la phrase française et traduisez-la en mkhedruli. Le clavier virtuel peut vous aider à saisir les lettres.',
      plan: root => `${countFrom(root, 'totalSentences', 6)} phrases à traduire`,
      score: 'Chaque traduction est vérifiée et accompagnée d’une correction. Le résultat tient compte des réponses du premier coup.'
    },
    {
      start: '#speed-start', goal: 'Reconnaître rapidement les sons des lettres géorgiennes.',
      method: 'Pour chaque lettre, choisissez le son entendu parmi quatre propositions. Une erreur peut être corrigée avant la question suivante.',
      plan: () => '60 secondes · questions aléatoires', level: 'A1',
      score: 'Le résultat affiche les bonnes réponses, le nombre de tentatives et votre précision.'
    },
    {
      start: '#word-speed-start', goal: 'Lire rapidement des mots en alphabet géorgien.',
      method: 'Lisez le mot affiché et choisissez sa translittération parmi quatre propositions avant la fin du chronomètre.',
      plan: () => '60 secondes · 120 mots dans la banque', level: 'A2',
      score: 'Le récapitulatif indique le nombre de mots lus correctement et votre précision.'
    },
    {
      start: '#grammar-speed-start', goal: 'Choisir rapidement la bonne forme verbale en géorgien.',
      method: 'Lisez la phrase et sélectionnez la forme qui convient. Une erreur laisse la question ouverte pour réessayer ou passer.',
      plan: root => `60 secondes · jusqu’à ${Number(root.dataset.total || 0)} questions`, level: 'B1',
      score: 'Le bilan affiche les bonnes réponses, les tentatives, la précision et votre record.'
    },
    {
      start: '#grammar-practice .grammar-category-list button.active', goal: 'Comprendre les formes grammaticales à partir de phrases en géorgien.',
      method: 'Choisissez la réponse correcte, puis lisez l’explication. Après une erreur, vous pouvez réessayer ou passer la question.',
      plan: root => `${countFrom(root, 'total', 10)} questions · thème sélectionné`,
      score: 'Le bilan reprend vos réponses et les notions à revoir. Votre progression est mémorisée.'
    },
    {
      start: '#vf-start', goal: 'Vérifier si vous avez compris les informations essentielles d’un passage entendu.',
      method: 'Écoutez le passage, lisez l’affirmation et choisissez « Vrai » ou « Faux ». Vous pouvez réécouter avant de répondre.',
      plan: root => `${countFrom(root, 'total', 10)} affirmations · écoute et vrai/faux`,
      score: 'Le bilan compte les affirmations comprises. Une erreur peut être retentée avant de passer.'
    },
    {
      start: '#order-start', goal: 'Comprendre la chronologie d’un récit entendu en géorgien.',
      method: 'Écoutez le récit, déplacez les événements pour les remettre dans l’ordre, puis validez votre réponse.',
      plan: root => `${countFrom(root, 'total', 2)} récits · événements à ordonner`,
      score: 'Le bilan indique les récits remis dans le bon ordre et affiche la correction.'
    },
    {
      start: '#dialogue-flash-start', goal: 'Comprendre une réplique et choisir une réponse cohérente dans une conversation.',
      method: 'Écoutez la réplique géorgienne puis choisissez la réponse qui convient parmi les propositions.',
      plan: root => `${countFrom(root, 'total', 8)} répliques · écoute et choix`,
      score: 'Le bilan compte les réponses adaptées. Vous pouvez réécouter et réessayer avant de passer.'
    }
  ];

  function exerciseName(root, config) {
    if (config.name) return config.name;
    if (root.id === 'grammar-practice') {
      const category = root.querySelector('.grammar-category-list button.active')?.textContent.trim();
      if (category) return `À vous de conjuguer · ${category}`;
    }
    const card = [...document.querySelectorAll('.activity-card[href^="#"]')].find(item => {
      const targetId = decodeURIComponent(item.getAttribute('href').slice(1));
      const target = document.getElementById(targetId);
      return target && (target === root || target.closest('[data-activity-panel]') === root);
    });
    const cardName = card?.querySelector('.activity-card-copy b')?.textContent.trim();
    if (cardName) return cardName;
    if (root.id === 'quiz') {
      return ({mcq: 'Traduisez en français', type: 'Écrivez le mot en géorgien', order: 'Reconstituez la phrase'})[root.dataset.exercise] || 'Vocabulaire et révision';
    }
    if (root.id === 'lesson-quiz') return 'Quiz de fin de leçon';
    const heading = root.querySelector('.speed-heading h2, .game-title-row h2, h2[id], :scope > h2');
    return heading?.textContent.trim() || 'Exercice';
  }

  const quizPanel = document.querySelector('#quiz');
  if (quizPanel?.dataset.exercise && !quizPanel.querySelector('#quiz-start')) {
    const beginQuiz = document.createElement('button');
    beginQuiz.type = 'button'; beginQuiz.id = 'quiz-start'; beginQuiz.className = 'button primary hidden';
    beginQuiz.textContent = 'Commencer ma séance →';
    quizPanel.insertBefore(beginQuiz, quizPanel.querySelector('#quiz-word'));
  }
  const lessonPanel = document.querySelector('#lesson-quiz');
  if (lessonPanel && !lessonPanel.querySelector('#lesson-start')) {
    const beginLesson = document.createElement('button');
    beginLesson.type = 'button'; beginLesson.id = 'lesson-start'; beginLesson.className = 'button primary hidden';
    beginLesson.textContent = 'Commencer le test →'; lessonPanel.insertBefore(beginLesson, lessonPanel.querySelector('#lesson-question'));
  }

  const entries = [];
  for (const config of configs) {
    const start = document.querySelector(config.start);
    const root = start?.closest('[data-activity-panel]');
    if (!root || !start || root.querySelector('[data-exercise-briefing]')) continue;
    const briefing = document.createElement('section');
    briefing.className = 'exercise-briefing';
    briefing.dataset.exerciseBriefing = '';
    briefing.setAttribute('aria-labelledby', `${root.id || 'exercise'}-briefing-title`);
    const intro = document.createElement('div');
    intro.className = 'exercise-briefing-intro';
    const kicker = document.createElement('span');
    kicker.className = 'exercise-briefing-kicker';
    kicker.textContent = 'Votre séance';
    const title = document.createElement('h2');
    title.id = `${root.id || 'exercise'}-briefing-title`;
    title.textContent = 'Avant de commencer';
    const goal = document.createElement('p');
    goal.className = 'exercise-briefing-goal';
    goal.textContent = typeof config.goal === 'function' ? config.goal(root) : config.goal;
    const testName = document.createElement('p');
    testName.className = 'exercise-briefing-test-name';
    testName.innerHTML = `<span>TEST SÉLECTIONNÉ</span><b></b>`;
    testName.querySelector('b').textContent = exerciseName(root, config);
    const facts = document.createElement('div');
    facts.className = 'exercise-briefing-facts';
    const levelFact = document.createElement('div');
    levelFact.className = 'exercise-briefing-fact exercise-briefing-fact-level';
    const levelLabel = document.createElement('small');
    levelLabel.textContent = 'NIVEAU PRÉVU';
    const levelValue = document.createElement('b');
    const planFact = document.createElement('div');
    planFact.className = 'exercise-briefing-fact exercise-briefing-fact-plan';
    const planLabel = document.createElement('small');
    planLabel.textContent = 'AU PROGRAMME';
    const planValue = document.createElement('b');
    planFact.append(planLabel, planValue);
    levelFact.append(levelLabel, levelValue);
    facts.append(levelFact, planFact);
    const methodTitle = document.createElement('h3');
    methodTitle.textContent = 'Comment ça se passe ?';
    const method = document.createElement('p');
    method.className = 'exercise-briefing-copy';
    const scoreTitle = document.createElement('h3');
    scoreTitle.textContent = 'Comment le résultat est calculé';
    const score = document.createElement('p');
    score.className = 'exercise-briefing-copy';
    score.textContent = config.score;
    const details = document.createElement('div');
    details.className = 'exercise-briefing-details';
    const methodCard = document.createElement('section');
    methodCard.className = 'exercise-briefing-detail';
    const methodIndex = document.createElement('span');
    methodIndex.className = 'exercise-briefing-detail-index';
    methodIndex.textContent = '01';
    methodTitle.prepend(methodIndex);
    methodCard.append(methodTitle, method);
    const scoreCard = document.createElement('section');
    scoreCard.className = 'exercise-briefing-detail';
    const scoreIndex = document.createElement('span');
    scoreIndex.className = 'exercise-briefing-detail-index';
    scoreIndex.textContent = '02';
    scoreTitle.prepend(scoreIndex);
    scoreCard.append(scoreTitle, score);
    details.append(methodCard, scoreCard);
    const actions = document.createElement('div');
    actions.className = 'exercise-briefing-actions';
    const changeLevel = document.createElement('button');
    changeLevel.type = 'button';
    changeLevel.className = 'button secondary';
    changeLevel.textContent = 'Modifier le niveau';
    changeLevel.addEventListener('click', () => document.querySelector('#exercise-level-sticker')?.click());
    const begin = document.createElement('button');
    begin.type = 'button';
    begin.className = 'button primary';
    begin.textContent = 'Commencer le test →';
    begin.addEventListener('click', () => start.click());
    actions.append(changeLevel, begin);
    intro.append(kicker, testName, title, goal);
    briefing.append(intro, facts, details, actions);
    const back = root.querySelector(':scope > [data-activity-back], :scope > .back-to-games');
    if (back) back.after(briefing);
    else root.prepend(briefing);
    root.classList.add('exercise-briefing-active');

    start.addEventListener('click', () => {
      root.classList.remove('exercise-briefing-active');
      briefing.hidden = true;
    }, true);
    entries.push({root, briefing, config, levelValue, planValue, method});
  }

  window.presentExerciseBriefing = ({root, goal, method, plan, level, score, onStart, testName: name = 'Exercice'}) => {
    if (!root || root.querySelector('[data-exercise-briefing]')) return;
    const briefing = document.createElement('section');
    briefing.className = 'exercise-briefing';
    briefing.dataset.exerciseBriefing = '';
    const intro = document.createElement('div'); intro.className = 'exercise-briefing-intro';
    const kicker = document.createElement('span'); kicker.className = 'exercise-briefing-kicker'; kicker.textContent = 'Votre séance';
    const title = document.createElement('h2'); title.textContent = 'Avant de commencer';
    const testName = document.createElement('p'); testName.className = 'exercise-briefing-test-name';
    testName.innerHTML = '<span>TEST SÉLECTIONNÉ</span><b></b>'; testName.querySelector('b').textContent = name;
    const goalText = document.createElement('p'); goalText.className = 'exercise-briefing-goal'; goalText.textContent = goal;
    intro.append(kicker, testName, title, goalText);
    const facts = document.createElement('div'); facts.className = 'exercise-briefing-facts';
    [["NIVEAU PRÉVU", levelNames[level] ? `${level} · ${levelNames[level]}` : level, 'level'], ['AU PROGRAMME', plan, 'plan']].forEach(([label, value, kind]) => {
      const fact = document.createElement('div'); fact.className = `exercise-briefing-fact exercise-briefing-fact-${kind}`;
      const small = document.createElement('small'); small.textContent = label;
      const bold = document.createElement('b'); bold.textContent = value;
      fact.append(small, bold); facts.append(fact);
    });
    const details = document.createElement('div'); details.className = 'exercise-briefing-details';
    [["01", 'Comment ça se passe ?', method], ['02', 'Comment le résultat est calculé', score]].forEach(([number, label, copy]) => {
      const card = document.createElement('section'); card.className = 'exercise-briefing-detail';
      const heading = document.createElement('h3'); const index = document.createElement('span');
      index.className = 'exercise-briefing-detail-index'; index.textContent = number; heading.append(index, document.createTextNode(label));
      const text = document.createElement('p'); text.className = 'exercise-briefing-copy'; text.textContent = copy;
      card.append(heading, text); details.append(card);
    });
    const actions = document.createElement('div'); actions.className = 'exercise-briefing-actions';
    const changeLevel = document.createElement('button'); changeLevel.type = 'button'; changeLevel.className = 'button secondary'; changeLevel.textContent = 'Modifier le niveau';
    changeLevel.addEventListener('click', () => document.querySelector('#exercise-level-sticker')?.click());
    const begin = document.createElement('button'); begin.type = 'button'; begin.className = 'button primary'; begin.textContent = 'Commencer le test →';
    begin.addEventListener('click', () => { root.classList.remove('exercise-briefing-active'); briefing.hidden = true; onStart?.(); });
    actions.append(changeLevel, begin); briefing.append(intro, facts, details, actions);
    const back = root.querySelector(':scope > [data-activity-back], :scope > .back-to-games, :scope > .game-screen-top');
    if (back) back.after(briefing); else root.prepend(briefing);
    root.classList.add('exercise-briefing-active');
    window.refreshExerciseDifficulty?.();
    requestAnimationFrame(() => briefing.scrollIntoView({behavior: 'smooth', block: 'start'}));
  };

  function updateBriefings() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('practice_cefr') || (params.get('bank') ? params.get('cefr') : '');
    for (const entry of entries) {
      const {root, config, levelValue, planValue, method} = entry;
      const path = location.pathname;
      const section = path.includes('comprehension') ? 'comprehension'
        : path.includes('reading') ? 'reading' : path.includes('dictation') ? 'dictation'
          : path.includes('grammar') ? 'grammar' : path.includes('dialogue') ? 'dialogues'
            : path.includes('alphabet') ? 'alphabet' : 'vocabulary';
      const adaptiveLevel = window.getAdaptiveCefr?.(section);
      const existingLevel = root.dataset.difficulty?.trim();
      const estimated = requested || config.level || existingLevel || adaptiveLevel || 'A1';
      if (!existingLevel && !config.level && (requested || adaptiveLevel)) root.dataset.difficulty = estimated;
      const name = levelNames[estimated];
      levelValue.textContent = name ? `${estimated} · ${name}` : estimated;
      planValue.textContent = config.plan(root);
      method.textContent = typeof config.method === 'function' ? config.method(root) : config.method;
    }
    window.refreshExerciseDifficulty?.();
  }

  window.refreshExerciseBriefing = updateBriefings;
  document.addEventListener('DOMContentLoaded', updateBriefings, {once: true});
  document.addEventListener('click', event => {
    const card = event.target.closest('.activity-card[href^="#"]');
    if (!card) return;
    const target = document.querySelector(card.getAttribute('href'));
    const panel = target?.closest('[data-activity-panel]') || target;
    requestAnimationFrame(() => {
      const entry = entries.find(item => item.root === panel);
      if (entry) {
        entry.root.classList.add('exercise-briefing-active');
        entry.briefing.hidden = false;
      }
      updateBriefings();
      if (entry) entry.briefing.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
  });
  requestAnimationFrame(updateBriefings);
})();
