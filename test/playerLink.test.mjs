// Run with: node --test test/playerLink.test.mjs
// Links from a player to their Hockey-Reference, HockeyDB and PuckPedia pages.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hockeyRefUrl, hockeyDbUrl, puckPediaUrl, playerLinks, playerLinksFormat } from "../src/components/playerLink.js";

// Just enough of a DOM to build the links
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  append(...nodes) { this.children.push(...nodes); }
}
beforeEach(() => { globalThis.document = { createElement: (tag) => new El(tag) }; });

test("Hockey-Reference: /players/<first letter>/<id>.html, without the internal P- prefix some ids carry", () => {
  assert.equal(hockeyRefUrl("mcdavco01"), "https://www.hockey-reference.com/players/m/mcdavco01.html");
  assert.equal(hockeyRefUrl("P-smithjo01"), "https://www.hockey-reference.com/players/s/smithjo01.html");
});

test("HockeyDB and PuckPedia urls", () => {
  assert.equal(hockeyDbUrl("180671"), "https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid=180671");
  assert.equal(puckPediaUrl("connor-mcdavid"), "https://puckpedia.com/player/connor-mcdavid");
});

test("the link set: HR, HDB, PP in order, each opening in a new window safely, separated by spaces", () => {
  const span = playerLinks({ hockeyRef: "mcdavco01", hockeyDb: "123", puckPedia: "connor-mcdavid" });
  assert.equal(span.tag, "span");
  const links = span.children.filter((c) => c instanceof El);
  assert.deepEqual(links.map((a) => a.textContent), ["HR", "HDB", "PP"]);
  assert.deepEqual(links.map((a) => a.href), [hockeyRefUrl("mcdavco01"), hockeyDbUrl("123"), puckPediaUrl("connor-mcdavid")]);
  for (const a of links) { assert.equal(a.target, "_blank"); assert.equal(a.rel, "noopener noreferrer"); }
  assert.deepEqual(span.children.filter((c) => typeof c === "string"), [" ", " "]); // a space between links, none at the ends
  assert.equal(span.children.length, 5);
});

test("a link is left out when its id is not known", () => {
  const only = (ids) => playerLinks(ids).children.filter((c) => c instanceof El).map((a) => a.textContent);
  assert.deepEqual(only({ hockeyRef: "a01" }), ["HR"]);
  assert.deepEqual(only({ hockeyRef: "a01", puckPedia: "x" }), ["HR", "PP"]);
  assert.deepEqual(only({ hockeyDb: "9" }), ["HDB"]);
  assert.deepEqual(only({ hockeyRef: "a01", hockeyDb: "", puckPedia: undefined }), ["HR"]);
  assert.deepEqual(only({}), []);
});

test("the table column format builds the links from the whole row (the column points at PLAYER_ID)", () => {
  const data = [{ PLAYER_ID: "a01", HockeyDB: "7", PuckPedia: "ann" }, { PLAYER_ID: "b01", HockeyDB: "", PuckPedia: "" }];
  const links = (i) => playerLinksFormat(data[i].PLAYER_ID, i, data).children.filter((c) => c instanceof El).map((a) => a.textContent);
  assert.deepEqual(links(0), ["HR", "HDB", "PP"]);
  assert.deepEqual(links(1), ["HR"]);
});
