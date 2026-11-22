// Run with: node --test test/nextRoster.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPeriodRosters, activeCounts } from "../src/components/nextRoster.js";

const row = (id, Position = "F", Reserve = "", Salary = 1) => ({ PLAYER_ID: id, Position, Reserve, Salary });
const base = { ANA: [row("a1", "D"), row("a2", "F", "R"), row("a3", "G")], BOS: [row("b1", "F"), row("b2", "D", "R")] };
const none = { data: {} };
const run = (extra = {}) => nextPeriodRosters({
  abbrs: ["ANA", "BOS"], rosterOf: (a) => base[a], season: "2026-27", nextPeriod: 8,
  transactionsData: none, tradesData: none, movesData: { moves: {} }, ...extra,
});
const ids = (m, t) => m.get(t).map((p) => `${p.PLAYER_ID}${p.Reserve === "R" ? "*" : ""}`).sort();

test("with nothing recorded the next roster is the current one", () => {
  const m = run();
  assert.deepEqual(ids(m, "ANA"), ["a1", "a2*", "a3"]);
  assert.deepEqual(activeCounts(m.get("ANA")), { F: 0, D: 1, G: 1, total: 2 });
});

test("submitted lineup moves change who is active; other teams are untouched", () => {
  const m = run({ movesData: { moves: { 8: { ANA: { promote: ["a2"], demote: ["a1", "ghost"] } } } } });
  assert.deepEqual(ids(m, "ANA"), ["a1*", "a2", "a3"]);
  assert.deepEqual(ids(m, "BOS"), ["b1", "b2*"]);
  assert.equal(run({ movesData: { moves: { 7: { ANA: { promote: ["a2"], demote: [] } } } } }).get("ANA").find((p) => p.PLAYER_ID === "a2").Reserve, "R"); // another period's moves are ignored
});

test("transactions, then trades, then moves, in that order", () => {
  const signed = { PLAYER_ID: "fa1", Position: "G", Salary: 2, Contract: "C-27" };
  const transactionsData = { data: { "2026-27": [
    { id: "1", type: "waive", team: "ANA", player: "a3", period: 8, at: "2026-11-20T00:00:00Z" },
    { id: "2", type: "sign", team: "ANA", player: "fa1", period: 8, at: "2026-11-20T00:00:01Z", salary: 2, row: signed },
  ] } };
  const tradesData = { data: { "2026-27": [
    { id: "t", period: 8, from: "ANA", to: "BOS", acceptedAt: "2026-11-21T00:00:00Z", give: { players: [{ id: "fa1", name: "x" }], picks: [] }, get: { players: [], picks: [] } },
  ] } };
  const m = run({ transactionsData, tradesData, movesData: { moves: { 8: { BOS: { promote: ["fa1"], demote: [] } } } } });
  assert.deepEqual(ids(m, "ANA"), ["a1", "a2*"]); // a3 cut; fa1 signed then traded on
  assert.deepEqual(ids(m, "BOS"), ["b1", "b2*", "fa1"]); // a signed player arrives in reserve, but BOS promoted him
  assert.deepEqual(activeCounts(m.get("BOS")), { F: 1, D: 0, G: 1, total: 2 });
});
