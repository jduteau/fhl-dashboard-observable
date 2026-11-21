// The season selector shown in every page's header (see `header` in observablehq.config.js).
//
// Runs in the page <head> before the page's own code, so that ?season= is already in the URL when the pages read it.
// The build supplies the seasons it knows about in window.FHL_SEASONS = {seasons: [...], currentSeason: "..."}.
//
// The active season is, in order: the ?season= in the URL, the season last chosen in this browser tab
// (sessionStorage), the current season. It is kept in the URL, and carried across the site's own links.
(function () {
  var config = window.FHL_SEASONS;
  var seasons = config.seasons;
  var currentSeason = config.currentSeason;
  var STORAGE_KEY = 'fhl-season';

  // Resolve active season: URL param → sessionStorage → default
  var _p = new URLSearchParams(window.location.search);
  var activeSeason = _p.get('season');
  if (!activeSeason || seasons.indexOf(activeSeason) === -1) {
    activeSeason = sessionStorage.getItem(STORAGE_KEY) || currentSeason;
    if (seasons.indexOf(activeSeason) === -1) activeSeason = currentSeason;
  }
  sessionStorage.setItem(STORAGE_KEY, activeSeason);
  // If season wasn't in the URL, add it silently so Observable page cells
  // see the correct ?season= when they evaluate
  if (!_p.get('season')) {
    _p.set('season', activeSeason);
    window.history.replaceState(null, '', window.location.pathname + '?' + _p.toString());
  }

  function init() {
    var select = document.getElementById('fhl-season-select');
    if (!select) { setTimeout(init, 50); return; }
    seasons.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (s === activeSeason) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      activeSeason = select.value;
      sessionStorage.setItem(STORAGE_KEY, activeSeason);
      var p = new URLSearchParams(window.location.search);
      p.set('season', activeSeason);
      window.location.search = p.toString();
    });
    // Intercept internal nav links to keep ?season= param across pages
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') ||
          href.startsWith('#') || href.startsWith('mailto:')) return;
      try {
        var url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (!url.searchParams.get('season')) {
          e.preventDefault();
          url.searchParams.set('season', activeSeason);
          window.location.href = url.toString();
        }
      } catch (_e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
