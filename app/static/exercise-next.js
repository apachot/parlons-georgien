(() => {
  const nextBySection = {
    alphabet: {
      section: 'Vocabulaire', title: 'Traduisez à toute vitesse',
      detail: 'Retrouvez le sens des mots géorgiens en 60 secondes.',
      href: '/vocabulary?next=speed'
    },
    vocabulary: {
      section: 'Lecture', title: 'Lecture guidée',
      detail: 'Lisez un passage en géorgien et répondez à des questions.',
      href: '/reading#reading'
    },
    reading: {
      section: 'Compréhension orale', title: 'Écoute pas à pas',
      detail: 'Écoutez un passage en géorgien puis vérifiez ce que vous avez compris.',
      href: '/comprehension#reading'
    },
    comprehension: {
      section: 'Dictées', title: 'Dictée de phrases',
      detail: 'Écoutez une phrase géorgienne et retranscrivez-la.',
      href: '/dictations#dictation-listening'
    },
    dictations: {
      section: 'Grammaire', title: 'Quiz de conjugaison',
      detail: 'Entraînez-vous aux temps verbaux et comprenez chaque réponse.',
      href: '/grammar#grammar-practice'
    },
    grammar: {
      section: 'Dialogues', title: 'Répliques éclair',
      detail: 'Écoutez une phrase et choisissez la réponse adaptée.',
      href: '/dialogues#dialogue-flash'
    },
    dialogues: {
      section: 'Leçons', title: 'L’alphabet géorgien',
      detail: 'Découvrez les lettres et leurs sons dans une leçon interactive.',
      href: '/lessons/alphabet-georgien'
    },
    lessons: {
      section: 'Révisions', title: 'Séance mélangée',
      detail: 'Révisez le vocabulaire avec plusieurs formats de questions.',
      href: '/session?exercise=mixed'
    },
    session: {
      section: 'Alphabet', title: 'Lecture contre la montre',
      detail: 'Reconnaissez les sons des lettres géorgiennes en 60 secondes.',
      href: '/alphabet#alphabet-speed-title'
    }
  };

  function sectionForCurrentPage() {
    const appBase = document.documentElement.dataset.appBase || '';
    let path = location.pathname;
    if (appBase && path.startsWith(appBase)) path = path.slice(appBase.length) || '/';
    if (path.startsWith('/lessons')) return 'lessons';
    return path.replace(/^\/+|\/+$/g, '') || 'session';
  }

  function visible(element) {
    return !element.classList.contains('hidden') && !element.closest('.hidden');
  }

  function buildCallout(section, destination) {
    const appBase = (document.documentElement.dataset.appBase || '').replace(/\/$/, '');
    const card = document.createElement('aside');
    card.className = 'next-exercise-callout';
    card.dataset.nextExercise = 'true';

    const kicker = document.createElement('div');
    kicker.className = 'next-exercise-kicker';
    kicker.textContent = `POUR CONTINUER · ${destination.section}`;
    const title = document.createElement('h3');
    title.textContent = destination.title;
    const detail = document.createElement('p');
    detail.textContent = destination.detail;
    const link = document.createElement('a');
    link.className = 'button primary';
    link.href = `${appBase}${destination.href}`;
    link.textContent = 'Faire cet exercice ↗';

    card.append(kicker, title, detail, link);
    card.dataset.sourceSection = section;
    return card;
  }

  function offer(target, completed, section) {
    const following = nextBySection[section];
    if (!target || !following) return;
    let card = target.nextElementSibling;
    if (!card?.matches('[data-next-exercise="true"]')) {
      card = buildCallout(section, following);
      target.insertAdjacentElement('afterend', card);
    }
    card.classList.toggle('hidden', !completed);
  }

  function scan() {
    const section = sectionForCurrentPage();
    document.querySelectorAll('.lesson-summary, .speed-result, .game-complete, .course-result, .dialogue-finish').forEach(target => {
      offer(target, visible(target) && Boolean(target.textContent.trim()), section);
    });

    const quizWord = document.querySelector('#quiz-word');
    const quizFinished = /^(Révisions terminées|Belle régularité)/.test(quizWord?.textContent.trim() || '');
    offer(document.querySelector('#quiz-choices'), quizFinished, section);

    const grammarPrompt = document.querySelector('#grammar-prompt');
    const grammarFinished = (grammarPrompt?.textContent.trim() || '').startsWith('Série terminée :');
    offer(grammarPrompt, grammarFinished, section);

    const letterPrompt = document.querySelector('#letter-prompt');
    const lettersFinished = (letterPrompt?.textContent.trim() || '') === 'Manche terminée !';
    offer(document.querySelector('#letter-restart'), lettersFinished, section);
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.body, {
    attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true
  });
  scan();
})();
