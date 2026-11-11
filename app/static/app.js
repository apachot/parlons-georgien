document.addEventListener('DOMContentLoaded', () => {
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
    const advance = card.querySelector('.dialogue-advance');
    steps.forEach((step, index) => {
      if (!step.querySelector('.dialogue-choices') && index === 0) advance.classList.remove('hidden');
      step.querySelectorAll('.dialogue-choice').forEach(choice => choice.addEventListener('click', () => {
        const reply = step.querySelector('.dialogue-reply');
        const correct = choice.dataset.correct === 'true';
        reply.textContent = correct ? `Bonne réponse : ${choice.dataset.ka} · ${choice.dataset.fr}` : 'Cette réponse ne correspond pas à la situation. Réessayez.';
        reply.className = 'dialogue-reply ' + (correct ? 'success' : 'try-again');
        if (correct) {
          step.querySelectorAll('.dialogue-choice').forEach(b => b.disabled = true);
          advance.classList.remove('hidden');
        }
      }));
    });
    advance.addEventListener('click', () => {
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
});

function appPath(path) {
  const base = document.documentElement.dataset.appBase || '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

let activeTtsAudio = null;
async function playSpeech(text, language, button) {
  button.dataset.original ||= button.textContent;
  button.disabled = true;
  button.textContent = 'Préparation…';
  try {
    const response = await fetch(appPath('/api/audio'), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({lang: language, text})
    });
    if (!response.ok) throw new Error('audio indisponible');
    const source = URL.createObjectURL(await response.blob());
    if (activeTtsAudio) {
      activeTtsAudio.audio.pause();
      URL.revokeObjectURL(activeTtsAudio.source);
      activeTtsAudio.button.textContent = activeTtsAudio.button.dataset.original;
      activeTtsAudio.button.disabled = false;
    }
    const audio = new Audio(source);
    activeTtsAudio = {audio, source, button};
    const finish = () => {
      URL.revokeObjectURL(source);
      button.textContent = button.dataset.original;
      button.disabled = false;
      if (activeTtsAudio?.audio === audio) activeTtsAudio = null;
    };
    audio.addEventListener('ended', finish, {once:true});
    audio.addEventListener('error', finish, {once:true});
    button.textContent = '▶ Lecture…';
    try { await audio.play(); } catch (error) { finish(); throw error; }
  } catch (_) {
    button.textContent = button.dataset.original;
    button.disabled = false;
    button.title = language === 'fr' ? 'Audio français non préparé sur cette installation.' : 'Audio géorgien non préparé sur cette installation.';
  }
}
