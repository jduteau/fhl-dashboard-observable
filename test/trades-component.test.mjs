// Run with: node --test test/trades-component.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAgreedTrades, agreedTrades, nextPeriodOf } from "../src/components/trades.js";
const row = (id, Position = "F", Reserve = "", Salary = 1) => ({ PLAYER_ID: id, Position, Reserve, Salary });
const base = { ANA: [row("a1", "D", "", 5), row("a2", "F", "R", 3)], BOS: [row("b1", "G", "", 2)], CAR: [row("c1", "F", "", 4)] };
const pk = { ANA: [{ PICK: "ANA1", DraftSeason: "2026-27" }], BOS: [], CAR: [] };
const T = (n, from, to, give, get) => ({ id: String(n), acceptedAt: `2026-11-19T10:00:0${n}Z`, from, to, give, get });
const side = (players = [], picks = []) => ({ players: players.map((id) => ({ id, name: id })), picks });
const run = (trades) => applyAgreedTrades({ abbrs: ["ANA", "BOS", "CAR"], rosterOf: (a) => base[a], picksOf: (a) => pk[a], trades });

test("moves players and picks, tags them, tracks salary, leaves inputs alone", () => {
  const r = run([T(1, "ANA", "BOS", side(["a1"], [{ pick: "ANA1", season: "2026-27" }]), side(["b1"]))]);
  assert.deepEqual(r.roster.get("ANA").map((p) => p.PLAYER_ID), ["a2", "b1"]); // a1 (D) left, b1 (G) came; F reserve sorts before G
  assert.equal(r.roster.get("ANA").length, 2);
  assert.ok(r.roster.get("ANA").find((p) => p.PLAYER_ID === "b1" && p.Acquired === "from BOS"));
  assert.ok(r.roster.get("BOS").find((p) => p.PLAYER_ID === "a1" && p.Acquired === "from ANA"));
  assert.deepEqual(r.picks.get("BOS"), [{ PICK: "ANA1", DraftSeason: "2026-27", Acquired: "from ANA" }]);
  assert.equal(r.picks.get("ANA").length, 0);
  assert.equal(r.salaryDelta.get("ANA"), -5 + 2);
  assert.equal(r.salaryDelta.get("BOS"), 5 - 2);
  assert.equal(base.ANA.length, 2); assert.equal(pk.ANA.length, 1); // inputs untouched
});
test("a chain replays in order; an acquired player can be sent on", () => {
  const r = run([T(2, "BOS", "CAR", side(["a1"]), side(["c1"])), T(1, "ANA", "BOS", side(["a1"]), side())]);
  assert.ok(r.roster.get("CAR").find((p) => p.PLAYER_ID === "a1" && p.Acquired === "from BOS"));
  assert.ok(r.roster.get("BOS").find((p) => p.PLAYER_ID === "c1" && p.Acquired === "from CAR"));
  assert.equal(r.roster.get("ANA").some((p) => p.PLAYER_ID === "a1"), false);
});
test("stale trade data is ignored rather than inventing players", () => {
  const r = run([T(1, "ANA", "BOS", side(["ghost"]), side())]);
  assert.equal(r.roster.get("BOS").length, 1);
});
test("sorted D, F, G with reserves last; agreedTrades / nextPeriodOf", () => {
  const r = run([T(1, "BOS", "ANA", side(["b1"]), side())]);
  assert.deepEqual(r.roster.get("ANA").map((p) => p.PLAYER_ID), ["a1", "a2", "b1"]); // D, F(reserve), G
  const td = { data: { s: [{ period: 8 }, { period: 8, skipped: "x" }, { period: 7 }] } };
  assert.equal(agreedTrades(td, "s", 8).length, 1);
  assert.equal(nextPeriodOf({ availablePeriods: ["1", "2", "7", "OVERALL"] }), 8);
});
