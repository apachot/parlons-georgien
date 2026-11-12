const vfRoot = document.querySelector('#comprehension-vf');
if (vfRoot) {
  const vf = {
    count: document.querySelector('#vf-count'), level: document.querySelector('#vf-level'),
    text: document.querySelector('#vf-text'), question: document.querySelector('#vf-question'),
    audio: document.querySelector('#vf-player'),
    claim: document.querySelector('#vf-claim'), feedback: document.querySelector('#vf-feedback'),
    reveal: document.querySelector('#vf-reveal'), meter: document.querySelector('#vf-meter'),
    start: document.querySelector('#vf-start'), next: document.querySelector('#vf-next'),
    summary: document.querySelector('#vf-summary'), choices: [...document.querySelectorAll('[data-vf-answer]')]
  };
  const vfTotal = Math.min(10, Number(vfRoot.dataset.total || 0));
  let vfTurn = 0, vfCorrect = 0, vfCurrent = null, vfSeen = new Set(), vfBusy = false;

  function setVfFeedback(message, state = '') {
    vf.feedback.textContent = message;
    vf.feedback.className = `feedback ${state}`;
  }

  function startVfSession() {
    vfTurn = 0; vfCorrect = 0; vfCurrent = null; vfSeen.clear();
    vf.start.classList.add('hidden'); vf.summary.classList.add('hidden');
    vf.reveal.classList.add('hidden'); loadVfClaim();
  }

  async function loadVfClaim() {
    if (vfTurn >= vfTotal) return finishVfSession();
    vfCurrent = null; vf.text.textContent = '';
    stopOralPlayer(vf.audio);
    vf.question.textContent = ''; vf.claim.textContent = ''; vf.choices.forEach(button => { button.disabled = false; button.classList.remove('choice-correct', 'choice-wrong'); });
    vf.next.classList.add('hidden'); vf.reveal.classList.add('hidden'); setVfFeedback('');
    vf.count.textContent = `Affirmation · ${vfTurn + 1} / ${vfTotal}`;
    vf.meter.style.width = `${Math.round(vfTurn / vfTotal * 100)}%`;
    try {
      const exclude = [...vfSeen].join(',');
      const response = await fetch(appPath(`/api/comprehension/true-false?exclude=${encodeURIComponent(exclude)}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error(item.error || 'Texte indisponible');
      vfCurrent = item; vfSeen.add(item.id); vf.level.textContent = item.level_name;
      vf.text.textContent = ''; vf.question.textContent = item.question; vf.claim.textContent = item.claim;
      loadOralPlayer(vf.audio, item.text);
    } catch (_) {
      vf.text.textContent = '';
      setVfFeedback('Réessayez dans un instant.', 'try-again');
      vf.start.textContent = 'Réessayer →'; vf.start.classList.remove('hidden');
    }
  }

  async function answerVf(answer, selected) {
    if (!vfCurrent || vfBusy || selected.disabled) return;
    vfBusy = true; vf.choices.forEach(button => button.disabled = true);
    try {
      const response = await fetch(appPath('/api/comprehension/true-false/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: vfCurrent.id, answer})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      if (result.correct) {
        vfCorrect++; selected.classList.add('choice-correct'); playSuccessSound();
        setVfFeedback('Bien vu, cette réponse correspond au texte.', 'success');
        vf.reveal.textContent = `${result.translation} — ${result.explanation}`;
        vf.reveal.classList.remove('hidden'); vf.next.classList.remove('hidden');
        vfTurn++; vf.meter.style.width = `${Math.round(vfTurn / vfTotal * 100)}%`;
        scheduleAutoAdvance(loadVfClaim, 2400);
      } else {
        selected.classList.add('choice-wrong'); selected.disabled = true;
        vf.choices.forEach(button => { if (!button.disabled) button.disabled = false; });
        setVfFeedback('Pas tout à fait. Réécoutez le passage et essayez l’autre choix.', 'try-again');
      }
    } catch (_) {
      vf.choices.forEach(button => button.disabled = false);
      setVfFeedback('La réponse n’a pas pu être enregistrée. Réessayez.', 'try-again');
    } finally { vfBusy = false; }
  }

  function finishVfSession() {
    vf.text.textContent = ''; vf.question.textContent = 'Les affirmations travaillées sont enregistrées dans votre progression.';
    vf.claim.textContent = ''; vf.level.textContent = 'Votre progression';
    stopOralPlayer(vf.audio);
    vf.choices.forEach(button => button.classList.add('hidden'));
    vf.next.classList.add('hidden'); vf.reveal.classList.add('hidden'); setVfFeedback(''); vf.meter.style.width = '100%';
    vf.summary.textContent = `${vfCorrect} / ${vfTotal} affirmations comprises.`;
    vf.summary.classList.remove('hidden'); vf.start.textContent = 'Recommencer →'; vf.start.classList.remove('hidden');
  }
  vf.start.addEventListener('click', () => { vf.choices.forEach(button => button.classList.remove('hidden')); startVfSession(); });
  vf.next.addEventListener('click', () => { clearAutoAdvance(); loadVfClaim(); });
  vf.choices.forEach(button => button.addEventListener('click', () => answerVf(button.dataset.vfAnswer === 'true', button)));
}

const orderRoot = document.querySelector('#comprehension-order');
if (orderRoot) {
  const order = {
    count: document.querySelector('#order-count'), level: document.querySelector('#order-level'),
    title: document.querySelector('#order-title'), audio: document.querySelector('#order-player'),
    events: document.querySelector('#order-events'), feedback: document.querySelector('#order-feedback'),
    reveal: document.querySelector('#order-reveal'), meter: document.querySelector('#order-meter'),
    start: document.querySelector('#order-start'), check: document.querySelector('#order-check'),
    next: document.querySelector('#order-next'), summary: document.querySelector('#order-summary')
  };
  const orderTotal = Math.min(2, Number(orderRoot.dataset.total || 0));
  let turn = 0, correct = 0, current = null, seen = new Set(), busy = false;

  function setOrderFeedback(message, state = '') {
    order.feedback.textContent = message;
    order.feedback.className = `feedback ${state}`;
  }

  function updateOrderControls() {
    [...order.events.children].forEach((item, index, all) => {
      item.querySelector('[data-move="up"]').disabled = index === 0;
      item.querySelector('[data-move="down"]').disabled = index === all.length - 1;
      item.querySelector('.order-number').textContent = String(index + 1).padStart(2, '0');
    });
  }

  function renderOrderEvents(events) {
    order.events.replaceChildren();
    events.forEach(event => {
      const row = document.createElement('li'); row.dataset.eventId = event.id;
      const number = document.createElement('span'); number.className = 'order-number';
      const text = document.createElement('span'); text.className = 'order-event-text'; text.textContent = event.text;
      const tools = document.createElement('span'); tools.className = 'order-event-tools';
      [['up', '↑', 'Monter'], ['down', '↓', 'Descendre']].forEach(([direction, glyph, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.move = direction;
        button.setAttribute('aria-label', `${label} : ${event.text}`); button.textContent = glyph;
        button.addEventListener('click', () => {
          const sibling = direction === 'up' ? row.previousElementSibling : row.nextElementSibling;
          if (!sibling) return;
          if (direction === 'up') order.events.insertBefore(row, sibling);
          else order.events.insertBefore(sibling, row);
          updateOrderControls();
        });
        tools.append(button);
      });
      row.append(number, text, tools); order.events.append(row);
    });
    updateOrderControls(); order.events.classList.remove('hidden');
  }

  async function loadOrderStory() {
    if (turn >= orderTotal) return finishOrderSession();
    order.current = null; order.next.classList.add('hidden'); order.check.classList.remove('hidden');
    order.check.disabled = false; order.reveal.classList.add('hidden'); setOrderFeedback('');
    order.events.replaceChildren(); order.events.classList.add('hidden'); stopOralPlayer(order.audio);
    order.count.textContent = `Récit · ${turn + 1} / ${orderTotal}`;
    order.meter.style.width = `${Math.round(turn / orderTotal * 100)}%`;
    try {
      const response = await fetch(appPath(`/api/comprehension/order?exclude=${encodeURIComponent([...seen].join(','))}`));
      const item = await response.json();
      if (!response.ok || item.empty) throw new Error(item.error || 'Récit indisponible');
      current = item; seen.add(item.id); order.current = item;
      order.title.textContent = item.title; order.level.textContent = item.level_name;
      renderOrderEvents(item.events); loadOralPlayer(order.audio, item.text);
    } catch (_) {
      setOrderFeedback('Le récit n’a pas pu être chargé. Réessayez.', 'try-again');
      order.check.classList.add('hidden'); order.start.textContent = 'Réessayer →'; order.start.classList.remove('hidden');
    }
  }

  async function checkOrder() {
    if (!order.current || busy) return;
    busy = true; order.check.disabled = true;
    try {
      const sequence = [...order.events.children].map(row => Number(row.dataset.eventId));
      const response = await fetch(appPath('/api/comprehension/order/answer'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: order.current.id, order: sequence})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Correction impossible');
      if (!result.correct) {
        order.check.disabled = false; setOrderFeedback('Pas encore. Réécoutez le récit et ajustez l’ordre, puis réessayez.', 'try-again');
        return;
      }
      correct++; [...order.events.querySelectorAll('button')].forEach(button => button.disabled = true);
      setOrderFeedback('Dans le bon ordre !', 'success');
      order.reveal.textContent = result.explanation; order.reveal.classList.remove('hidden');
      order.check.classList.add('hidden'); turn++;
      order.meter.style.width = `${Math.round(turn / orderTotal * 100)}%`;
      order.next.textContent = turn >= orderTotal ? 'Voir le résultat →' : 'Récit suivant →';
      order.next.classList.remove('hidden'); playSuccessSound();
    } catch (_) {
      order.check.disabled = false; setOrderFeedback('La réponse n’a pas pu être vérifiée. Réessayez.', 'try-again');
    } finally { busy = false; }
  }

  function startOrderSession() {
    turn = 0; correct = 0; current = null; seen.clear(); order.start.classList.add('hidden');
    order.summary.classList.add('hidden'); order.events.classList.remove('hidden'); loadOrderStory();
  }

  function finishOrderSession() {
    stopOralPlayer(order.audio); order.events.classList.add('hidden'); order.check.classList.add('hidden');
    order.next.classList.add('hidden'); order.meter.style.width = '100%';
    order.summary.textContent = `${correct} / ${orderTotal} récits remis dans l’ordre.`;
    order.summary.classList.remove('hidden'); order.start.textContent = 'Recommencer →'; order.start.classList.remove('hidden');
  }

  order.start.addEventListener('click', startOrderSession);
  order.check.addEventListener('click', checkOrder);
  order.next.addEventListener('click', loadOrderStory);
}
