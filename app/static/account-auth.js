(() => {
  document.querySelectorAll('[data-username-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const field = document.querySelector('input[name="display_name"]');
      if (!field) return;
      field.value = button.dataset.usernameSuggestion || '';
      field.focus();
    });
  });
})();
