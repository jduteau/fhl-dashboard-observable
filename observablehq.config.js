// See https://observablehq.com/framework/config for documentation.
import { readFileSync } from "fs";
import { csvParse } from "d3-dsv";
import stripBom from "strip-bom";

// Read seasons at config-load time so they can be inlined into every page's HTML
const _seasonsRaw = csvParse(stripBom(readFileSync("src/data/static/seasons.csv", "utf-8")));
const _seasons = _seasonsRaw.filter(s => s.stub !== "true").map(s => s.season);
const _currentSeason = _seasonsRaw.find(s => s.current === "true")?.season || _seasons[_seasons.length - 1];

// Evaluated when the config loads (i.e. at build time), so this is the build timestamp
const _builtAt = new Date().toLocaleString("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Edmonton",
});
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
    {name: "Draft Results", path: "/DraftResults"},
    {name: "Team Statistics", path: "/Players"},
    {name: "Team Roster", path: "/Roster"},
    {name: "Overall Stats", path: "/Overall"},
    {name: "Compare Teams", path: "/CompareTeams"},
    {name: "Trades", path: "/Trades"},
    {name: "Free Agents & Waivers", path: "/Transactions"},
    {name: "Stats Visualizations", path: "/StatViz"},
    {name: "Playoffs", path: "/Playoffs"},
    {name: "Playoff Statistics", path: "/PlayoffStats"},
    {name: "My Account", path: "/Account"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: `<link rel="icon" href="observable.png" type="image/png" sizes="32x32">
<link rel="stylesheet" href="/styles/responsive.css">
<script>window.FHL_SEASONS = ${JSON.stringify({seasons: _seasons, currentSeason: _currentSeason})};</script>
<script src="/js/season-selector.js"></script>
<script src="/js/tabs.js"></script>`,

  // Season selector HTML rendered in every page header
  header: `<div id="fhl-season-bar" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 1rem;font-size:0.875rem;border-bottom:1px solid var(--theme-border,#e0e0e0)">
  <span style="margin-left:auto;display:flex;align-items:center;gap:0.4rem">
    <label for="fhl-season-select" style="font-size:0.8rem">Season:</label>
    <select id="fhl-season-select" style="font-size:0.8rem;padding:2px 6px;border:1px solid var(--theme-border,#ccc);border-radius:4px"></select>
  </span>
</div>`,

  // Same as the default footer, but showing the full build date and time
  footer: `Built with <a href="https://observablehq.com/" target="_blank">Observable</a> on ${_builtAt} (Mountain Time).`,

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
