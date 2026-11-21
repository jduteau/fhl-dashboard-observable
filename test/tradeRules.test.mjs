// Run with: node --test test/tradeRules.test.mjs
// The rules a trade must meet, shared by the Worker and the roster script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEAM, PLAYER, PICK, SEASON, TRADE_ID, tradeProblem } from "../src/components/tradeRules.js";

test("identifier formats: what a team, player, pick, season and trade id look like", () => {
  for (const ok of ["ANA", "NJD", "UTA", "AB"]) assert.ok(TEAM.test(ok), ok);
  for (const bad of ["ana", "A", "ABCDE", "AN1", "", "ANA "]) assert.ok(!TEAM.test(bad), JSON.stringify(bad));
  for (const ok of ["berglja01", "P-smithjo01", "o'reilly01", "a.b-c_d"]) assert.ok(PLAYER.test(ok), ok);
  for (const bad of ["", "../etc/passwd", "a b", "x".repeat(21), "a;b", "a/b"]) assert.ok(!PLAYER.test(bad), JSON.stringify(bad));
  for (const ok of ["ANA1", "WPG2", "NJD12"]) assert.ok(PICK.test(ok), ok);
  for (const bad of ["ANA", "ana1", "ANA123", "1ANA", ""]) assert.ok(!PICK.test(bad), JSON.stringify(bad));
  for (const ok of ["2026-27", "1999-00"]) assert.ok(SEASON.test(ok), ok);
  for (const bad of ["2026", "2026-2027", "26-27", "2026/27", ""]) assert.ok(!SEASON.test(bad), JSON.stringify(bad));
  assert.ok(TRADE_ID.test("123e4567-e89b-12d3-a456-426614174000"));
  for (const bad of ["", "not-a-uuid", "123E4567-E89B-12D3-A456-426614174000", "x".repeat(36)]) assert.ok(!TRADE_ID.test(bad), bad);
});

// A league: ANA owns a1, a2 and the pick ANA1; BOS owns b1 and BOS1. Sizes are set per test.
const owners = { a1: "ANA", a2: "ANA", b1: "BOS" };
const picks = { "2026-27|ANA1": "ANA", "2026-27|BOS1": "BOS", "2027-28|ANA1": "BOS" };
const state = (sizes = { ANA: 21, BOS: 21 }) => ({
  playerOwner: (id) => owners[id],
  pickOwner: (season, pick) => picks[`${season}|${pick}`],
  size: (team) => sizes[team] ?? 0,
});
const legs = (give = {}, get = {}) => [
  { giver: "ANA", receiver: "BOS", players: give.players ?? [], picks: give.picks ?? [] },
  { giver: "BOS", receiver: "ANA", players: get.players ?? [], picks: get.picks ?? [] },
];
const P = (pick, season = "2026-27") => ({ season, pick });

test("a legal trade has no problem", () => {
  assert.equal(tradeProblem(legs({ players: ["a1"], picks: [P("ANA1")] }, { players: ["b1"], picks: [P("BOS1")] }), state()), null);
  assert.equal(tradeProblem(legs({ picks: [P("ANA1")] }, {}), state()), null); // picks only
  assert.equal(tradeProblem(legs({ picks: [P("ANA1", "2027-28")] }, {}), state()), "ANA does not own ANA1 (2027-28)"); // the same pick id in another draft
});

test("each side must own the players it gives", () => {
  assert.equal(tradeProblem(legs({ players: ["b1"] }, {}), state()), "b1 is not on ANA's roster");
  assert.equal(tradeProblem(legs({}, { players: ["a1"] }), state()), "a1 is not on BOS's roster");
  assert.equal(tradeProblem(legs({ players: ["nobody"] }, {}), state()), "nobody is not on ANA's roster");
});

test("each side must own the picks it gives, and a pick must exist", () => {
  assert.equal(tradeProblem(legs({ picks: [P("BOS1")] }, {}), state()), "ANA does not own BOS1 (2026-27)");
  assert.equal(tradeProblem(legs({ picks: [P("ZZZ9")] }, {}), state()), "Pick ZZZ9 (2026-27) does not exist");
  assert.equal(tradeProblem(legs({ picks: [P("ANA1", "2099-00")] }, {}), state()), "Pick ANA1 (2099-00) does not exist");
});

test("both teams must stay within 20 to 36 players", () => {
  // ANA gives two players for none: 21 - 2 = 19 for ANA
  assert.equal(tradeProblem(legs({ players: ["a1", "a2"] }, {}), state()), "ANA would have 19 players after this trade (must be 20-36)");
  // BOS at 36 receiving a player goes to 37
  assert.equal(tradeProblem(legs({ players: ["a1"] }, {}), state({ ANA: 25, BOS: 36 })), "BOS would have 37 players after this trade (must be 20-36)");
  // a swap leaves both sizes alone; the limits are inclusive
  assert.equal(tradeProblem(legs({ players: ["a1"] }, { players: ["b1"] }), state({ ANA: 20, BOS: 36 })), null);
  assert.equal(tradeProblem(legs({ players: ["a1"] }, {}), state({ ANA: 21, BOS: 35 })), null); // ANA 20, BOS 36
});

test("ownership is checked before sizes, and in the order given", () => {
  // both wrong: the player problem is reported, not the size
  assert.equal(tradeProblem(legs({ players: ["b1"] }, {}), state({ ANA: 1, BOS: 1 })), "b1 is not on ANA's roster");
  // players of a side are checked before its picks
  assert.equal(tradeProblem(legs({ players: ["b1"], picks: [P("ZZZ9")] }, {}), state()), "b1 is not on ANA's roster");
});
