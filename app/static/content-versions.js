document.querySelectorAll('[data-versions-page]').forEach(page => {
  const buttons = [...page.querySelectorAll('[data-version-filter]')];
  const cards = [...page.querySelectorAll('[data-version-level]')];
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.classList.toggle('is-active', item === button));
    const level = button.dataset.versionFilter;
    cards.forEach(card => { card.hidden = level !== 'all' && card.dataset.versionLevel !== level; });
  }));
});
