/*
 * Q-66: set html[data-theme] before first paint. A classic (not module)
 * script loaded from index.html's head, because the CSP allows no inline
 * script. It repeats themePref.js's migrate() and resolve() in a few lines
 * (a classic script cannot import); keep the two in step. ThemeManager.init()
 * takes over once the app's modules run, and adds the live listener.
 */
(function () {
  var pref = null;
  try {
    var ls = window.localStorage;
    pref = ls.getItem('coauthor-theme-pref');
    var ok = pref === 'device' || pref === 'light' || pref === 'dark';
    if (ls.getItem('coauthor-theme-v') !== '2' || !ok) {
      if (!ok) pref = ls.getItem('coauthor-theme') === 'light' ? 'light' : 'device';
      ls.setItem('coauthor-theme-pref', pref);
      ls.setItem('coauthor-theme-v', '2');
    }
  } catch (e) { pref = 'device'; }
  var theme = pref;
  if (pref !== 'light' && pref !== 'dark') {
    var mq = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    theme = mq('(prefers-color-scheme: dark)') ? 'dark' : (mq('(prefers-color-scheme: light)') ? 'light' : 'dark');
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
