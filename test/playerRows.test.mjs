// Run from the repo root with: node --test test/playerRows.test.mjs
// The row building blocks every data loader composes its published player rows from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { identityColumns, statColumns, isActive, isReserve, sortRoster, sumTotals, activeTotals, reserveTotals } from "../src/components/playerRows.js";
import { getStatsForPeriod } from "../src/components/loadfiles.js";

const info = { Name: "Ann Example", HockeyDB: "123", PuckPedia: "ann-example", BirthDate: "2000-09-15", NHL: "ANA" };
const contract = { Salary: 40, Contract: "3y" };

test("identity columns: who the player is and what they cost, in a fixed order", () => {
  const cols = identityColumns(info, "F", "2099-00", contract);
  assert.deepEqual(Object.keys(cols), ["Name", "HockeyDB", "PuckPedia", "BirthDate", "Age", "Position", "NHLTeam", "Salary", "Contract"]);
  assert.equal(cols.Name, "Ann Example");
  assert.equal(cols.Age, 99); // measured on the season's cutoff date
  assert.equal(cols.NHLTeam, "ANA");
  assert.equal(cols.Salary, 40);
  assert.equal(cols.Contract, "3y");
});

test("identity columns: no contract is a $0 '---' contract, and links can be left out", () => {
  const cols = identityColumns(info, "D", "2099-00", undefined, { links: false });
  assert.deepEqual(Object.keys(cols), ["Name", "BirthDate", "Age", "Position", "NHLTeam", "Salary", "Contract"]);
  assert.equal(cols.Salary, 0);
  assert.equal(cols.Contract, "---");
});

const skaterLine = getStatsForPeriod("F", { "stats/gp": 10, "stats/goals": 4, "stats/assists": 6, "stats/pim": 2, "stats/hits": 8, "stats/toi": 300, "stats/blocks": 3, "stats/take": 1, "stats/give": 2 }, {});
const goalieLine = getStatsForPeriod("G", { "stats/gp": 5, "stats/wins": 3, "stats/losses": 1, "stats/ties": 1, "stats/so": 1, "stats/sa": 120, "stats/ga": 10 }, {});

test("stat columns for a skater: skater stats filled, goalie stats null", () => {
  const cols = statColumns("F", skaterLine);
  assert.deepEqual(Object.keys(cols), ["Goals", "Assists", "PIM", "Hits", "Blocks", "Take", "Give", "TOI", "Record", "SO", "SA", "GA", "Toughness", "DStat", "GamesPlayed"]);
  assert.equal(cols.Goals, 4);
  assert.equal(cols.Toughness, 10); // pim + hits
  assert.equal(cols.DStat, 300 / 30 + 3 + 1 - 2);
  assert.equal(cols.GamesPlayed, 10);
  for (const k of ["Record", "SO", "SA", "GA"]) assert.equal(cols[k], null, k);
});

test("stat columns for a goalie: goalie stats filled, skater stats null, GStat published in the DStat column", () => {
  const cols = statColumns("G", goalieLine);
  for (const k of ["Goals", "Assists", "PIM", "Hits", "Blocks", "Take", "Give", "TOI", "Toughness"]) assert.equal(cols[k], null, k);
  assert.equal(cols.Record, "3-1-1");
  assert.equal(cols.SO, 1);
  assert.equal(cols.SA, 120);
  assert.equal(cols.GA, 10);
  assert.equal(cols.DStat, 2 * 3 + 1 + 2 * 1 + 0.15 * 120 - 10); // 17
  assert.equal(cols.GamesPlayed, 5);
  assert.equal("GStat" in cols, false);
});

test("stat columns options: Wins/Losses/Ties before Record; a separate GStat column leaves a goalie's DStat null", () => {
  const goalie = statColumns("G", goalieLine, { goalieRecord: true, separateGStat: true });
  assert.deepEqual(Object.keys(goalie), ["Goals", "Assists", "PIM", "Hits", "Blocks", "Take", "Give", "TOI", "Wins", "Losses", "Ties", "Record", "SO", "SA", "GA", "Toughness", "DStat", "GStat", "GamesPlayed"]);
  assert.deepEqual([goalie.Wins, goalie.Losses, goalie.Ties], [3, 1, 1]);
  assert.equal(goalie.DStat, null);
  assert.equal(goalie.GStat, 17);
  const skater = statColumns("F", skaterLine, { goalieRecord: true, separateGStat: true });
  assert.deepEqual([skater.Wins, skater.Losses, skater.Ties, skater.GStat], [null, null, null, null]);
  assert.equal(skater.DStat, 12);
});

const row = (Position, Reserve, extra = {}) => ({ Position, Reserve, Name: extra.Name ?? "x", ...extra });

test("active vs reserve: reserves (R) and unavailable (N/A) players are not in the lineup", () => {
  assert.equal(isActive(row("F", "")), true);
  assert.equal(isActive(row("F", undefined)), true);
  assert.equal(isActive(row("F", "R")), false);
  assert.equal(isActive(row("F", "N/A")), false);
  assert.equal(isReserve(row("F", "R")), true);
  assert.equal(isReserve(row("F", "N/A")), false); // N/A players are neither active nor reserves
});

test("sortRoster: defensemen, forwards, goalies; active before reserve within a position; then the tie-breaker", () => {
  const roster = [
    row("G", "", { Name: "g1" }), row("F", "R", { Name: "f-res" }), row("D", "R", { Name: "d-res" }),
    row("F", "", { Name: "fb", Rating: 1 }), row("D", "", { Name: "d1" }), row("F", "", { Name: "fa", Rating: 9 }),
  ];
  const sorted = sortRoster(roster, (a, b) => b.Rating - a.Rating);
  assert.equal(sorted, roster); // sorts in place and returns it
  assert.deepEqual(roster.map((p) => p.Name), ["d1", "d-res", "fa", "fb", "f-res", "g1"]);
  const byName = sortRoster([row("F", "", { Name: "b" }), row("F", "", { Name: "a" })], (x, y) => x.Name.localeCompare(y.Name));
  assert.deepEqual(byName.map((p) => p.Name), ["a", "b"]);
  assert.deepEqual(sortRoster([row("F", "", { Name: "2" }), row("F", "", { Name: "1" })]).map((p) => p.Name), ["2", "1"]); // no tie-breaker: order kept
});

const players = [
  { Position: "F", Reserve: "", Goals: 3, Assists: 4, Toughness: 10, DStat: 5.5 },
  { Position: "D", Reserve: "", Goals: 1, Assists: 2, Toughness: 6, DStat: 8 },
  { Position: "G", Reserve: "", Goals: null, Assists: null, Toughness: null, DStat: 12.5 }, // a goalie's GStat is in DStat
  { Position: "F", Reserve: "R", Goals: 9, Assists: 9, Toughness: 9, DStat: 9 },
  { Position: "G", Reserve: "R", Goals: null, Assists: null, Toughness: null, DStat: 20 },
];

test("totals: skater stats add up, a goalie's DStat column counts as GStat, reserves are counted separately", () => {
  assert.deepEqual(activeTotals(players), { goals: 4, assists: 6, toughness: 16, dstat: 13.5, gstat: 12.5 });
  assert.deepEqual(reserveTotals(players), { goals: 9, assists: 9, toughness: 9, dstat: 9, gstat: 20 });
  assert.deepEqual(activeTotals([]), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
  assert.deepEqual(sumTotals(players, (p) => p.Position === "D"), { goals: 1, assists: 2, toughness: 6, dstat: 8, gstat: 0 });
});

test("totals with a separate GStat column (the standings rows)", () => {
  const rows = [
    { Position: "F", Reserve: "", Goals: 2, Assists: 3, Toughness: 4, DStat: 1.5, GStat: null },
    { Position: "G", Reserve: "", Goals: null, Assists: null, Toughness: null, DStat: null, GStat: 7 },
  ];
  assert.deepEqual(activeTotals(rows, { separateGStat: true }), { goals: 2, assists: 3, toughness: 4, dstat: 1.5, gstat: 7 });
});
