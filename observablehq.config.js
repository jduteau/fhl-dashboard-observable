// See https://observablehq.com/framework/config for documentation.
import { readFileSync } from "fs";
import { csvParse } from "d3-dsv";
import stripBom from "strip-bom";

// Read seasons at config-load time so they can be inlined into every page's HTML
const _seasonsRaw = csvParse(stripBom(readFileSync("src/data/static/seasons.csv", "utf-8")));
const _seasons = _seasonsRaw.filter(s => s.stub !== "true").map(s => s.season);
const _currentSeason = _seasonsRaw.find(s => s.current === "true")?.season || _seasons[_seasons.length - 1];
export default {
  // The app’s title; used in the sidebar and webpage titles.
  title: "FHL Dashboard",

  // The pages and sections in the sidebar. If you don’t specify this option,
  // all pages will be listed in alphabetical order. Listing pages explicitly
  // lets you organize them into sections and have unlisted pages.
  // pages: [
  //   {
  //     name: "Examples",
  //     pages: [
  //       {name: "Dashboard", path: "/example-dashboard"},
  //       {name: "Report", path: "/example-report"}
  //     ]
  //   }
  // ],
  pages: [
    {name: "Team Standings", path: "/Standings"},
    {name: "Team Information", path: "/Teams"},
    {name: "Team Statistics", path: "/Players"},
    {name: "Team Roster", path: "/Roster"},
    {name: "Overall Stats", path: "/Overall"},
    {name: "Compare Teams", path: "/CompareTeams"},
    {name: "Stats Visualizations", path: "/StatViz"},
    {name: "Playoffs", path: "/Playoffs"},
    {name: "Playoff Statistics", path: "/PlayoffStats"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: `<link rel="icon" href="observable.png" type="image/png" sizes="32x32">
<script>
  (function() {
    var seasons = ${JSON.stringify(_seasons)};
    var currentSeason = ${JSON.stringify(_currentSeason)};
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
      seasons.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === activeSeason) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', function() {
        activeSeason = select.value;
        sessionStorage.setItem(STORAGE_KEY, activeSeason);
        var p = new URLSearchParams(window.location.search);
        p.set('season', activeSeason);
        window.location.search = p.toString();
      });
      // Intercept internal nav links to keep ?season= param across pages
      document.addEventListener('click', function(e) {
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
</script>`,

  // Season selector HTML rendered in every page header
  header: `<div id="fhl-season-bar" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 1rem;font-size:0.875rem;border-bottom:1px solid var(--theme-border,#e0e0e0)">
  <span style="margin-left:auto;display:flex;align-items:center;gap:0.4rem">
    <label for="fhl-season-select" style="font-size:0.8rem">Season:</label>
    <select id="fhl-season-select" style="font-size:0.8rem;padding:2px 6px;border:1px solid var(--theme-border,#ccc);border-radius:4px"></select>
  </span>
</div>`,

  // The path to the source root.
  root: "src",

  // Some additional configuration options and their defaults:
  // theme: "default", // try "light", "dark", "slate", etc.
  // header: "", // what to show in the header (HTML)
  // footer: "Built with Observable.", // what to show in the footer (HTML)
  // sidebar: true, // whether to show the sidebar
  // toc: true, // whether to show the table of contents
  // pager: true, // whether to show previous & next links in the footer
  // output: "dist", // path to the output root for build
  // search: true, // activate search
  // linkify: true, // convert URLs in Markdown to links
  // typographer: false, // smart quotes and other typographic improvements
  // preserveExtension: false, // drop .html from URLs
  // preserveIndex: false, // drop /index from URLs
  pager: false,
  
};
