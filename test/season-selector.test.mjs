// Run with: node --test test/season-selector.test.mjs
// Runs the real src/js/season-selector.js against a small stand-in for the browser (window, document, sessionStorage).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/js/season-selector.js", import.meta.url), "utf-8");
const SEASONS = { seasons: ["2025-26", "2026-27"], currentSeason: "2026-27" };

// A minimal browser. `url` is the page address; `stored` pre-fills sessionStorage; `selectAppearsAfter` = how many
// timer ticks pass before the season <select> exists in the page.
function browser({ url = "https://site.test/app/Teams.html", stored, selectAppearsAfter = 0, readyState = "complete" } = {}) {
  const u = new URL(url);
  const store = new Map(stored ? [["fhl-season", stored]] : []);
  const log = { replaced: [], timers: [], listeners: {}, navigatedTo: null, searchSet: null };
  const options = [];
  const select = {
    appendChild: (o) => options.push(o),
    addEventListener: (type, fn) => { log.listeners.select = { ...(log.listeners.select ?? {}), [type]: fn }; },
    value: "",
  };
  let ticks = 0;
  const window = {
    FHL_SEASONS: SEASONS,
    location: {
      get search() { return u.search; },
      set search(v) { log.searchSet = v; },
      get pathname() { return u.pathname; },
      get href() { return u.href; },
      set href(v) { log.navigatedTo = v; },
      get origin() { return u.origin; },
    },
    history: { replaceState: (_a, _b, to) => log.replaced.push(to) },
  };
  const document = {
    readyState,
    getElementById: (id) => (id === "fhl-season-select" && ticks >= selectAppearsAfter ? select : null),
    createElement: () => ({}),
    addEventListener: (type, fn) => { log.listeners[type] = fn; },
  };
  const setTimeout = (fn) => { ticks++; log.timers.push(fn); };
  const sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  vm.runInNewContext(source, { window, document, sessionStorage, setTimeout, URL, URLSearchParams, console });
  const flush = () => { while (log.timers.length) log.timers.shift()(); };
  return { window, log, store, options, select, flush, click: (href) => clickLink(log, href) };
}

function clickLink(log, href) {
  let prevented = false;
  const link = { getAttribute: () => href };
  log.listeners.click({ target: { closest: () => (href === null ? null : link) }, preventDefault: () => { prevented = true; } });
  return prevented;
}

test("no season anywhere: the current season is used, remembered, and put in the URL without adding a history entry", () => {
  const b = browser();
  assert.equal(b.store.get("fhl-season"), "2026-27");
  assert.deepEqual(b.log.replaced, ["/app/Teams.html?season=2026-27"]);
});

test("a valid ?season= in the URL wins, is remembered, and the URL is left alone", () => {
  const b = browser({ url: "https://site.test/Teams.html?season=2025-26", stored: "2026-27" });
  assert.equal(b.store.get("fhl-season"), "2025-26");
  assert.deepEqual(b.log.replaced, []);
});

test("an unknown ?season= falls back to the remembered season, then to the current one", () => {
  const remembered = browser({ url: "https://site.test/Teams.html?season=1999-00", stored: "2025-26" });
  assert.equal(remembered.store.get("fhl-season"), "2025-26");
  assert.deepEqual(remembered.log.replaced, []); // the URL already has a season= (the bad one); it is not rewritten
  const none = browser({ url: "https://site.test/Teams.html?season=1999-00" });
  assert.equal(none.store.get("fhl-season"), "2026-27");
  const badStored = browser({ stored: "1888-89" });
  assert.equal(badStored.store.get("fhl-season"), "2026-27");
});

test("the remembered season is used when the URL has none, and other query parameters are kept", () => {
  const b = browser({ url: "https://site.test/Roster.html?team=ANA", stored: "2025-26" });
  assert.deepEqual(b.log.replaced, ["/Roster.html?team=ANA&season=2025-26"]);
});

test("the selector lists every season with the active one selected, and choosing one reloads with it", () => {
  const b = browser({ url: "https://site.test/Teams.html?season=2025-26&team=ANA" });
  assert.deepEqual(b.options.map((o) => o.value), ["2025-26", "2026-27"]);
  assert.deepEqual(b.options.map((o) => o.textContent), ["2025-26", "2026-27"]);
  assert.deepEqual(b.options.map((o) => Boolean(o.selected)), [true, false]);
  b.select.value = "2026-27";
  b.log.listeners.select.change();
  assert.equal(b.store.get("fhl-season"), "2026-27");
  assert.equal(b.log.searchSet, "season=2026-27&team=ANA"); // sets location.search, which reloads
});

test("the selector waits for the page header to exist before filling it in", () => {
  const b = browser({ selectAppearsAfter: 3 });
  assert.equal(b.options.length, 0);
  b.flush();
  assert.equal(b.options.length, 2);
});

test("before the page has loaded, setup waits for DOMContentLoaded", () => {
  const b = browser({ readyState: "loading" });
  assert.equal(b.options.length, 0);
  b.log.listeners.DOMContentLoaded();
  assert.equal(b.options.length, 2);
});

test("internal links without a season get the active one added; everything else is left alone", () => {
  const b = browser({ url: "https://site.test/app/Teams.html?season=2025-26" });
  assert.equal(b.click("Standings"), true);
  assert.equal(b.log.navigatedTo, "https://site.test/app/Standings?season=2025-26");
  b.log.navigatedTo = null;
  assert.equal(b.click("/app/Roster.html?team=ANA"), true);
  assert.equal(b.log.navigatedTo, "https://site.test/app/Roster.html?team=ANA&season=2025-26");
  b.log.navigatedTo = null;
  for (const href of ["Standings?season=2026-27", "https://example.com/x", "//cdn.test/x", "#section", "mailto:a@b.c", "", null]) {
    assert.equal(b.click(href), false, String(href));
  }
  assert.equal(b.log.navigatedTo, null);
});

test("after choosing another season, links carry the new one", () => {
  const b = browser({ url: "https://site.test/Teams.html?season=2025-26" });
  b.select.value = "2026-27";
  b.log.listeners.select.change();
  b.click("Standings");
  assert.equal(b.log.navigatedTo, "https://site.test/Standings?season=2026-27");
});
