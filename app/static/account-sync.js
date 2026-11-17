(() => {
  const root = document.documentElement;
  const userId = root.dataset.userId;
  const PROFILE_KEY = 'parlons-georgien-learning-profile-v1';
  const OWNER_KEY = 'parlons-account-owner';
  let ready = false, dirty = false, timer = null;
  const appPath = path => `${root.dataset.appBase || ''}${path}`;
  const savedBrowserData = () => {
    const data = {};
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && key !== OWNER_KEY && key !== PROFILE_KEY
            && (key.startsWith('parlons-course-') || key === 'kartuli-grammar-speed-best')) {
          data[key] = localStorage.getItem(key);
        }
      }
    } catch (_) { /* Browser storage can be disabled. */ }
    return data;
  };
  const persist = async () => {
    if (!userId || !ready) { dirty = true; return; }
    dirty = false;
    let learningProfile = {};
    try { learningProfile = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch (_) {}
    try {
      const response = await fetch(appPath('/api/account/sync'), {method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({learning_profile: learningProfile, browser_data: savedBrowserData()})});
      if (!response.ok) dirty = true;
    } catch (_) { dirty = true; }
  };
  window.queueAccountSync = () => {
    if (!userId) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(persist, 700);
  };
  window.accountSyncReady = Promise.resolve();
  if (!userId) return;

  window.accountSyncReady = (async () => {
    try {
      const response = await fetch(appPath('/api/account/sync'), {credentials: 'same-origin'});
      if (!response.ok) return;
      const remote = await response.json();
      let owner = null, localProfile = {}, localStorageData = {};
      try {
        owner = localStorage.getItem(OWNER_KEY);
        localProfile = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
        localStorageData = savedBrowserData();
      } catch (_) {}
      const mayImportLocal = !owner || owner === String(userId);
      if (!mayImportLocal) {
        Object.keys(localStorageData).forEach(key => { try { localStorage.removeItem(key); } catch (_) {} });
      }
      let profile = remote.learning_profile || {};
      if (mayImportLocal) {
        const localHistory = Array.isArray(localProfile.history) ? localProfile.history : [];
        const remoteHistory = Array.isArray(profile.history) ? profile.history : [];
        const unique = new Map();
        [...remoteHistory, ...localHistory].forEach(item => unique.set(JSON.stringify(item), item));
        const history = [...unique.values()].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).slice(-5000);
        const ratings = {...(profile.ratings || {})};
        Object.entries(localProfile.ratings || {}).forEach(([skill, rating]) => {
          if (!ratings[skill] || Number(rating.count) > Number(ratings[skill].count)) ratings[skill] = rating;
        });
        const localIsNewer = String(localHistory.at(-1)?.at || '') >= String(remoteHistory.at(-1)?.at || '');
        const levels = localIsNewer
          ? {...(profile.levels || {}), ...(localProfile.levels || {})}
          : {...(localProfile.levels || {}), ...(profile.levels || {})};
        const remoteTest = profile.placementTest || profile.onboarding || {};
        const localTest = localProfile.placementTest || localProfile.onboarding || {};
        const placementTest = String(localTest.updatedAt || '') > String(remoteTest.updatedAt || '') ? localTest : remoteTest;
        profile = {...(localIsNewer ? profile : localProfile), ...profile,
          ratings, levels, history,
          overallLevel: (localIsNewer ? localProfile.overallLevel : profile.overallLevel) || localProfile.overallLevel || profile.overallLevel || null,
          placementTest};
      }
      profile.placementTest = profile.placementTest || profile.onboarding || {};
      delete profile.onboarding;
      profile.accountOwner = String(userId);
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (_) {}
      const browserData = {...(remote.browser_data || {}), ...(mayImportLocal ? localStorageData : {})};
      Object.entries(browserData).forEach(([key, value]) => { try { localStorage.setItem(key, value); } catch (_) {} });
      try { localStorage.setItem(OWNER_KEY, String(userId)); } catch (_) {}
      window.dispatchEvent(new CustomEvent('account-profile-restored', {detail: profile}));
      ready = true;
      if (dirty || mayImportLocal || !Object.keys(remote.learning_profile || {}).length) await persist();
    } catch (_) {
      ready = true;
    }
  })();
})();
