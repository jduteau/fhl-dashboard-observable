// Run with: node --test test/tabs.test.mjs
// The tab switching shared by the Team Information, Team Statistics, Standings and Playoff Statistics pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");
const PAGES = ["Teams", "Players", "Standings", "PlayoffStats"];

// A stand-in page: elements with a class list, found by class name or id
function page({ tabs, buttons }) {
  const el = (id, active = false) => ({ id, classList: { set: new Set(active ? ["active"] : []), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } } });
  const contents = tabs.map(([id, active]) => el(id, active));
  const buttonEls = buttons.map(([id, active]) => el(id, active));
  const document = {
    querySelectorAll: (sel) => ({ ".tab-content": contents, ".tab-button": buttonEls })[sel],
    getElementById: (id) => contents.find((c) => c.id === id) ?? null,
  };
  const window = {};
  vm.runInNewContext(read("src/js/tabs.js"), { window, document });
  const active = (list) => list.filter((e) => e.classList.set.has("active")).map((e) => e.id);
  return { window, contents, buttonEls, activeTabs: () => active(contents), activeButtons: () => active(buttonEls) };
}

test("showTab shows the chosen tab and marks its button, hiding every other tab and unmarking the other buttons", () => {
  const p = page({ tabs: [["a-tab", true], ["b-tab", false], ["c-tab", false]], buttons: [["a-btn", true], ["b-btn", false], ["c-btn", false]] });
  assert.equal(typeof p.window.showTab, "function");
  p.window.showTab("b-tab", p.buttonEls[1]);
  assert.deepEqual(p.activeTabs(), ["b-tab"]);
  assert.deepEqual(p.activeButtons(), ["b-btn"]);
  p.window.showTab("c-tab", p.buttonEls[2]);
  assert.deepEqual(p.activeTabs(), ["c-tab"]);
  assert.deepEqual(p.activeButtons(), ["c-btn"]);
  p.window.showTab("c-tab", p.buttonEls[2]); // choosing the same tab again changes nothing
  assert.deepEqual([p.activeTabs(), p.activeButtons()], [["c-tab"], ["c-btn"]]);
});

test("showTab copes with an unknown tab id or no button", () => {
  const p = page({ tabs: [["a-tab", true]], buttons: [["a-btn", true]] });
  p.window.showTab("nope", p.buttonEls[0]); // every tab is hidden, nothing is shown, and it does not throw
  assert.deepEqual(p.activeTabs(), []);
  assert.deepEqual(p.activeButtons(), ["a-btn"]);
  p.window.showTab("a-tab"); // no button given
  assert.deepEqual(p.activeTabs(), ["a-tab"]);
  assert.deepEqual(p.activeButtons(), []);
});

for (const name of PAGES) {
  test(`${name}.md: links the shared tab styles, does not define showTab itself, and every tab button points at a tab that exists`, () => {
    const md = read(`src/${name}.md`);
    assert.ok(md.includes('<link rel="stylesheet" href="./styles/tabs.css">'), "links tabs.css");
    assert.ok(!md.includes("window.showTab"), "does not redefine showTab");
    assert.ok(!/\.tab-button\s*\{/.test(md), "does not carry its own copy of the tab styles");
    const targets = [...md.matchAll(/onclick="showTab\('([^']+)'/g)].map((m) => m[1]);
    assert.ok(targets.length >= 2, "has tab buttons");
    for (const id of targets) assert.ok(new RegExp(`id="${id}"`).test(md), `a tab with id "${id}" exists`);
    assert.ok(new RegExp(`id="${targets[0]}"[^>]*class="tab-content active"|class="tab-content active"[^>]*id="${targets[0]}"`).test(md) || md.includes("tab-content active"), "one tab starts active");
  });
}

test("the shared stylesheet has the tab rules, and the site loads the script on every page", () => {
  const css = read("src/styles/tabs.css");
  for (const selector of [".tabs", ".tab-buttons", ".tab-button", ".tab-button:hover", ".tab-button.active", ".tab-content", ".tab-content.active", ".tab-content h3"])
    assert.ok(css.includes(`${selector} {`), selector);
  assert.ok(read("observablehq.config.js").includes('<script src="/js/tabs.js"></script>'));
});

test("pages with their own tab systems do not link the shared styles (their .tab-content rules would clash)", () => {
  for (const name of ["Roster", "Playoffs", "Overall"]) assert.ok(!read(`src/${name}.md`).includes("styles/tabs.css"), name);
});
