// Run with: node --test .github/scripts/test/league-report-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeagueReport, weekEnding, volumeNumber } from "../league-report-lib.mjs";

const info = new Map([
  ["a", { Name: "Noah Dobson", Pos: "D", HockeyDB: "1" }],
  ["b", { Name: "Sam Reinhart", Pos: "C", HockeyDB: "2" }],
  ["c", { Name: "Dylan McIlrath", Pos: "D", HockeyDB: "116161" }],
]);
const mapPos = (p) => (p === "D" ? "D" : p === "G" ? "G" : "F");

test("week ending is the day before the period starts; volume counts from the anchor", () => {
  assert.equal(weekEnding("2026-10-26"), "Oct 25, 2026");
  assert.equal(weekEnding("2026-11-01"), "Oct 31, 2026");
  assert.equal(volumeNumber("2026-27", 4), 577);
  assert.equal(volumeNumber("2026-27", 8), 581);
  assert.equal(volumeNumber("2027-28", 1), null);
});

test("report lists trades, moves, signings and waivers, and leaves out empty sections", () => {
  const { subject, message } = buildLeagueReport({
    season: "2026-27", period: 4, periodStart: "2026-10-26", info, mapPos,
    trades: [{ from: "ANA", to: "SEA", give: { players: ["a"], picks: [{ pick: "SEA2", season: "2026-27" }] }, get: { players: ["b"], picks: [] } }],
    moves: [{ team: "SEA", promote: [], demote: ["b"] }, { team: "ANA", promote: ["a"], demote: [] }, { team: "BOS", promote: [], demote: [] }],
    transactions: [{ type: "sign", team: "ANA", player: "c", salary: 1, contract: "C-27" }],
  });
  assert.equal(subject, "FHL Trader Volume 577 (Week ending Oct 25, 2026)");
  assert.equal(message, [
    subject,
    "TRADES\n\nTo ANA: Sam Reinhart\nTo SEA: Noah Dobson, SEA2(27)",
    "ROSTER MOVES\n\nANA\nPromote: Noah Dobson\n\nSEA\nDemote: Sam Reinhart",
    "Free-Agent Signings\n-------------------\nANA Dylan McIlrath D 116161 1 C-27",
  ].join("\n\n"));
});

test("claims and cuts get their own sections; an empty week says so", () => {
  const r = buildLeagueReport({ season: "2026-27", period: 8, periodStart: "2026-11-23", info, mapPos,
    transactions: [{ type: "claim", team: "CAR", from: "BUF", player: "a" }, { type: "waive", team: "BOS", player: "b" }] });
  assert.match(r.message, /Waiver Claims\n-+\nCAR claimed Noah Dobson from BUF/);
  assert.match(r.message, /Waiver Cuts\n-+\nBOS Sam Reinhart/);
  assert.match(buildLeagueReport({ season: "2026-27", period: 8, periodStart: "2026-11-23", info, mapPos }).message, /No trades/);
});
