let activeLetter = null;
async function newLetterQuestion() {
  const response = await fetch(appPath('/api/quiz?kind=alphabet'));
  activeLetter = await response.json();
  document.querySelector('#letter-prompt').textContent = activeLetter.prompt;
  document.querySelector('#letter-feedback').textContent = '';
  const holder = document.querySelector('#letter-choices'); holder.innerHTML = '';
  [...activeLetter.choices].sort(() => Math.random() - .5).forEach(letter => {
    const button = document.createElement('button'); button.className = 'letter-choice ka'; button.textContent = letter;
    button.addEventListener('click', async () => {
      const result = await fetch(appPath('/api/answer'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:activeLetter.id,kind:'alphabet',answer:letter})}).then(r=>r.json());
      holder.querySelectorAll('button').forEach(b=>b.disabled=true);
      button.classList.add(result.correct?'choice-correct':'choice-wrong');
      document.querySelector('#letter-feedback').textContent = result.correct ? 'Oui, c’est la bonne lettre !' : `On la retrouve : ${result.solution}. ${result.explanation}`;
    }); holder.append(button);
  });
}
document.querySelector('#letter-next')?.addEventListener('click', newLetterQuestion);
newLetterQuestion();
