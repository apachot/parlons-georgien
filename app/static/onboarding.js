(() => {
  const PROFILE_KEY = 'parlons-georgien-learning-profile-v1';
  const dialog = document.querySelector('#level-onboarding-dialog');
  if (!dialog) return;

  const readProfile = () => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); }
    catch (_) { return {}; }
  };
  const dismiss = () => {
    window.dismissLevelOnboarding?.();
    if (dialog.open) dialog.close();
  };
  window.openLevelOnboarding = async () => {
    await window.accountSyncReady;
    if (!dialog.open) dialog.showModal();
  };

  dialog.querySelectorAll('[data-level]').forEach(button => {
    button.addEventListener('click', () => {
      const level = button.dataset.level;
      window.setSelfAssessedCefr?.(level);
      dismiss();
    });
  });
  document.querySelector('#level-onboarding-close')?.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dismiss();
  });
  document.addEventListener('DOMContentLoaded', async () => {
    await window.accountSyncReady;
    const profile = readProfile();
    const hasPriorAssessment = profile.selfAssessmentLevel || profile.levelOnboardingDismissedAt
      || profile.history?.length || profile.overallLevel
      || Object.values(profile.ratings || {}).some(rating => rating?.count)
      || profile.placementTest?.completedAt || profile.onboarding?.completedAt;
    if (!hasPriorAssessment) dialog.showModal();
  }, {once: true});
})();
