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
      start: '#reading-start', goal: 'Comprendre un court texte géorgien et repérer les informations utiles.',
      method: 'Lisez le passage, choisissez une réponse et consultez la correction avant de poursuivre.',
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
      start: '#word-speed-start', goal: 'Lire des mots en mkhedruli et retrouver leur translittération.',
      method: 'Lisez chaque mot et choisissez sa translittération parmi quatre propositions avant la fin du chronomètre.',
      plan: () => '60 secondes · 120 mots dans la banque', level: 'A2',
      score: 'Le résultat affiche le nombre de mots lus correctement et votre précision.'
    },
    {
      start: '#grammar-speed-start', goal: 'Répondre rapidement à des questions de conjugaison au présent, au passé et au futur.',
      method: 'Choisissez la forme verbale correcte. En cas d’erreur, la question reste affichée pour vous permettre de réessayer ou de passer.',
      plan: root => `60 secondes · jusqu’à ${Number(root.dataset.total || 0)} questions`,
      score: 'Le résultat présente les bonnes réponses, les tentatives, le pourcentage de précision et votre record.'
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

  const entries = [];
  for (const config of configs) {
    const start = document.querySelector(config.start);
    const root = start?.closest('[data-activity-panel]');
    if (!root || !start || root.querySelector('[data-exercise-briefing]')) continue;
    const briefing = document.createElement('section');
    briefing.className = 'exercise-briefing';
    briefing.dataset.exerciseBriefing = '';
    briefing.setAttribute('aria-labelledby', `${root.id || 'exercise'}-briefing-title`);
    const title = document.createElement('h2');
    title.id = `${root.id || 'exercise'}-briefing-title`;
    title.textContent = 'Avant de commencer';
    const goal = document.createElement('p');
    goal.className = 'exercise-briefing-goal';
    goal.textContent = config.goal;
    const facts = document.createElement('div');
    facts.className = 'exercise-briefing-facts';
    const levelFact = document.createElement('div');
    levelFact.className = 'exercise-briefing-fact';
    const levelLabel = document.createElement('small');
    levelLabel.textContent = 'NIVEAU PRÉVU';
    const levelValue = document.createElement('b');
    const planFact = document.createElement('div');
    planFact.className = 'exercise-briefing-fact';
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
    briefing.append(title, goal, facts, methodTitle, method, scoreTitle, score, actions);
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
    });
  });
  requestAnimationFrame(updateBriefings);
})();
