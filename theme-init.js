// No-flash theme. Runs before any CSS loads, so dark visitors never
// see a white flash on first paint. Reads saved choice; falls back to
// OS preference. Anything else fails silently and we serve light.
//
// Lives in an external file (not inline) so the site's CSP can keep
// script-src tight without 'unsafe-inline'.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
