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
  document.querySelectorAll('.audio-btn[data-speak]').forEach(button => button.addEventListener('click', () => speakGeorgian(button.dataset.speak, button)));
  document.querySelector('#word-search')?.addEventListener('input', e => {
    const query = e.target.value.trim().toLocaleLowerCase('fr');
    document.querySelectorAll('.vocab-card').forEach(card => card.hidden = !card.dataset.search.toLocaleLowerCase('fr').includes(query));
  });
  document.querySelectorAll('.exercise-box[data-lesson] .choice').forEach(choice => choice.addEventListener('click', () => {
    const box = choice.closest('.exercise-box');
    box.querySelectorAll('.choice').forEach(c => c.disabled = true);
    const correct = choice.dataset.correct === 'true';
    box.dataset.score = correct ? '100' : '0';
    box.querySelector('.feedback').textContent = correct ? 'Exactement ! Belle lecture.' : 'Pas tout à fait. Relisez la phrase et sa traduction, puis réessayez dans votre prochaine révision.';
    box.querySelector('.feedback').className = 'feedback ' + (correct ? 'success' : 'try-again');
    box.querySelector('.finish-lesson').disabled = false;
  }));
  document.querySelector('.finish-lesson')?.addEventListener('click', async e => {
    const box = e.currentTarget.closest('[data-lesson]');
    await fetch(appPath(`/api/complete/${box.dataset.lesson}`), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({score:Number(box.dataset.score || 0)})});
    e.currentTarget.textContent = 'Leçon enregistrée ✓';
    e.currentTarget.disabled = true;
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

async function speakGeorgian(text, button) {
  if (!('speechSynthesis' in window)) { audioUnavailable(button); return; }
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    voices = await new Promise(resolve => {
      let timer;
      const finish = () => { clearTimeout(timer); speechSynthesis.removeEventListener('voiceschanged', finish); resolve(speechSynthesis.getVoices()); };
      speechSynthesis.addEventListener('voiceschanged', finish, {once:true});
      timer = setTimeout(finish, 900);
    });
  }
  const voice = voices.find(v => v.lang.toLowerCase().startsWith('ka'));
  if (!voice) { audioUnavailable(button); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = voice.lang;
  button.dataset.original ||= button.textContent;
  button.textContent = '▶ Lecture…';
  utterance.onend = utterance.onerror = () => button.textContent = button.dataset.original;
  speechSynthesis.speak(utterance);
}
function audioUnavailable(button) {
  const original = button.dataset.original || button.textContent;
  button.dataset.original = original;
  button.textContent = 'Audio géorgien indisponible';
  button.title = 'Aucun enregistrement ni voix géorgienne disponible sur cet appareil.';
  button.disabled = true;
}
