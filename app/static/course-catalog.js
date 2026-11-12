(() => {
  document.querySelectorAll('[data-course-id]').forEach(card => {
    try {
      if (localStorage.getItem(`parlons-course-${card.dataset.courseId}`)) {
        card.querySelector('.course-completed')?.classList.remove('hidden');
        card.classList.add('is-complete');
      }
    } catch (_) {}
  });
})();
