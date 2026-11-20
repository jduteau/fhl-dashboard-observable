// Run from the repo root with: node --test test/loadfiles.test.mjs
// The league's scoring core: stat formulas, per-period deltas, ratings, contracts and cash.
// (Importing loadfiles.js also loads the real current season, so the tests must run from the repo root.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcToughness, calcDStat, calcGStat, statInputs, mapPosition, calculateAge, getAgeCutoff, getStatsForPeriod,
  getContract, latestContracts, periodCost, computeTeamCash, loadSeasonData, readStatsFile,
} from "../src/components/loadfiles.js";

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} !== ${expected}`);

// ---- Stat formulas -------------------------------------------------------------------------

test("toughness = penalty minutes + hits, missing values count as 0", () => {
  assert.equal(calcToughness({ pim: 10, hits: 5 }), 15);
  assert.equal(calcToughness({ pim: 4 }), 4);
  assert.equal(calcToughness({}), 0);
  assert.equal(calcToughness({ pim: null, hits: undefined }), 0);
});

test("DStat = TOI/20 for defensemen, TOI/30 for everyone else, + blocks + takeaways - giveaways", () => {
  const s = { toi: 600, blocks: 10, take: 4, give: 6 };
  near(calcDStat("D", s), 600 / 20 + 10 + 4 - 6); // 38
  near(calcDStat("F", s), 600 / 30 + 10 + 4 - 6); // 28
  near(calcDStat("C", s), 600 / 30 + 10 + 4 - 6); // anything that is not exactly "D" uses the forward divisor
  near(calcDStat("F", {}), 0);
  assert.ok(calcDStat("F", { give: 5 }) < 0); // can go negative
});

test("GStat = 2/win + 1/tie + 2/shutout + 0.15/shot against - goals against", () => {
  near(calcGStat({ wins: 10, ties: 2, so: 1, sa: 300, ga: 25 }), 20 + 2 + 2 + 45 - 25); // 44
  near(calcGStat({}), 0);
  near(calcGStat({ sa: 100, ga: 100 }), -85); // a bad goalie is negative
  near(calcGStat({ wins: 1, losses: 99 }), 2); // losses are ignored
});

test("statInputs reads stats/ columns from a row, or values through a getter", () => {
  const row = { "stats/pim": 1, "stats/hits": 2, "stats/toi": 3, "stats/blocks": 4, "stats/take": 5, "stats/give": 6, "stats/wins": 7, "stats/ties": 8, "stats/so": 9, "stats/sa": 10, "stats/ga": 11 };
  const expected = { pim: 1, hits: 2, toi: 3, blocks: 4, take: 5, give: 6, wins: 7, ties: 8, so: 9, sa: 10, ga: 11 };
  assert.deepEqual(statInputs(row), expected);
  assert.deepEqual(statInputs((name) => row[`stats/${name}`]), expected);
  assert.equal(statInputs({}).pim, undefined); // the formulas treat that as 0
});

test("mapPosition folds every skater position into F", () => {
  assert.equal(mapPosition("G"), "G");
  assert.equal(mapPosition("g"), "G");
  assert.equal(mapPosition("D"), "D");
  for (const p of ["C", "LW", "RW", "F", "W", "", null, undefined]) assert.equal(mapPosition(p), "F", String(p));
});

// ---- Age -----------------------------------------------------------------------------------

test("age is measured on the season's cutoff date (September 15 of the first year by default)", () => {
  assert.equal(getAgeCutoff("2099-00").getFullYear(), 2099);
  assert.equal(getAgeCutoff("2099-00").getMonth(), 8);
  assert.equal(getAgeCutoff("2099-00").getDate(), 15);
  assert.equal(calculateAge("2000-09-15", "2099-00"), 99); // birthday on the cutoff counts
  assert.equal(calculateAge("2000-09-16", "2099-00"), 98); // the day after does not
  assert.equal(calculateAge("2000-01-01", "2099-00"), 99);
  assert.equal(calculateAge("2000-12-31", "2099-00"), 98);
  assert.equal(calculateAge("", "2099-00"), "N/A");
  assert.equal(calculateAge(undefined, "2099-00"), "N/A");
});

// ---- Per-period stats ----------------------------------------------------------------------

const skater = { hockeyRef: "s", team: "ANA", "stats/gp": 20, "stats/goals": 8, "stats/assists": 12, "stats/pim": 6, "stats/hits": 30, "stats/toi": 900, "stats/blocks": 10, "stats/take": 5, "stats/give": 7 };
const skaterBefore = { "stats/gp": 12, "stats/goals": 5, "stats/assists": 7, "stats/pim": 2, "stats/hits": 20, "stats/toi": 540, "stats/blocks": 6, "stats/take": 3, "stats/give": 4 };

test("a skater's period stats are the difference between two cumulative files", () => {
  const s = getStatsForPeriod("F", skater, skaterBefore);
  assert.equal(s.hockeyRef, "s");
  assert.equal(s.team, "ANA");
  assert.equal(s.goals, 3);
  assert.equal(s.assists, 5);
  assert.equal(s.pim, 4);
  assert.equal(s.hits, 10);
  assert.equal(s.toughness, 14);
  assert.equal(s.games_played, 8);
  // DStat is computed on each cumulative total and subtracted, which equals the formula applied to the differences
  near(s.dstat, calcDStat("F", { toi: 360, blocks: 4, take: 2, give: 3 }));
  assert.equal(s.gstat, 0);
  for (const k of ["wins", "losses", "ties", "so", "sa", "ga"]) assert.equal(s[k], null, k); // goalie fields are null for skaters
});

test("with no previous file the period stats are the totals; missing players are all zeros", () => {
  const s = getStatsForPeriod("F", skater, undefined);
  assert.equal(s.goals, 8);
  near(s.dstat, calcDStat("F", { toi: 900, blocks: 10, take: 5, give: 7 }));
  const none = getStatsForPeriod("F", {}, {});
  assert.equal(none.goals, 0);
  assert.equal(none.games_played, 0);
  assert.equal(none.dstat, 0);
});

test("a defenseman's DStat uses the TOI/20 divisor in period stats too", () => {
  const d = getStatsForPeriod("D", { "stats/toi": 400, "stats/blocks": 5 }, { "stats/toi": 200, "stats/blocks": 2 });
  near(d.dstat, 400 / 20 + 5 - (200 / 20 + 2)); // 25 - 12
});

test("a goalie's period stats use goalie fields; skater fields are null", () => {
  const now = { hockeyRef: "g", team: "BOS", "stats/gp": 10, "stats/wins": 6, "stats/losses": 3, "stats/ties": 1, "stats/so": 2, "stats/sa": 280, "stats/ga": 22 };
  const before = { "stats/gp": 6, "stats/wins": 3, "stats/losses": 3, "stats/ties": 0, "stats/so": 1, "stats/sa": 160, "stats/ga": 14 };
  const g = getStatsForPeriod("G", now, before);
  assert.equal(g.wins, 3);
  assert.equal(g.losses, 0);
  assert.equal(g.ties, 1);
  assert.equal(g.so, 1);
  assert.equal(g.sa, 120);
  assert.equal(g.ga, 8);
  assert.equal(g.games_played, 4);
  near(g.gstat, calcGStat({ wins: 3, ties: 1, so: 1, sa: 120, ga: 8 })); // 6+1+2+18-8 = 19
  near(g.gstat, 19);
  for (const k of ["goals", "assists", "pim", "hits", "toughness", "blocks", "take", "give", "toi", "dstat"]) assert.equal(g[k], null, k);
});

// ---- Contracts and cash --------------------------------------------------------------------

const contracts = [
  { ID: "a", Salary: 100, Contract: "1y" },
  { ID: "b", Salary: 50, Contract: "old", Period: 0 }, // blank Period (parsed as 0) = from period 1
  { ID: "b", Salary: 80, Contract: "new", Period: 4 }, // a new contract from period 4
  { ID: "b", Salary: 65, Contract: "mid", Period: 2 }, // rows need not be in order
  { ID: "late", Salary: 30, Contract: "signed", Period: 5 },
];

test("getContract picks the row in effect for the period (default: the latest)", () => {
  assert.equal(getContract(contracts, "a").Salary, 100);
  assert.equal(getContract(contracts, "b").Salary, 80);
  assert.equal(getContract(contracts, "b", 1).Salary, 50);
  assert.equal(getContract(contracts, "b", 2).Salary, 65);
  assert.equal(getContract(contracts, "b", 3).Salary, 65);
  assert.equal(getContract(contracts, "b", 4).Salary, 80);
  assert.equal(getContract(contracts, "b", 99).Salary, 80);
  assert.equal(getContract(contracts, "nobody"), undefined);
});

test("before a player's first contract applies, their earliest contract is used", () => {
  assert.equal(getContract(contracts, "late", 1).Salary, 30);
  assert.equal(getContract(contracts, "late", 5).Salary, 30);
});

test("latestContracts has one row per player: the one in effect now", () => {
  const latest = latestContracts(contracts);
  assert.equal(latest.length, 3);
  assert.deepEqual(latest.map((c) => [c.ID, c.Salary]).sort(), [["a", 100], ["b", 80], ["late", 30]]);
});

test("a period costs salary/25, with a minimum of 13", () => {
  assert.equal(periodCost(0), 13);
  assert.equal(periodCost(300), 13);
  assert.equal(periodCost(324.99), 13);
  assert.equal(periodCost(325), 13); // 325/25 = 13: the boundary is seamless
  assert.equal(periodCost(500), 20);
  near(periodCost(412), 16.48);
});

test("team cash: start less each earlier period's cost; the period in progress is not charged yet", () => {
  const cs = [
    { ID: "p1", Salary: 200 }, { ID: "p2", Salary: 150 }, // 350 total: 14/period
    { ID: "p3", Salary: 60 }, { ID: "p3", Salary: 400, Period: 3 }, // p3's contract changes in period 3
  ];
  const rp = [
    { period: 1, data: [{ ID: "p1", ABBR: "ANA" }, { ID: "p2", ABBR: "ANA" }, { ID: "p3", ABBR: "BOS" }] },
    { period: 2, data: [{ ID: "p1", ABBR: "ANA" }, { ID: "p2", ABBR: "ANA" }, { ID: "p3", ABBR: "BOS" }] },
    { period: 3, data: [{ ID: "p1", ABBR: "ANA" }, { ID: "p2", ABBR: "ANA" }, { ID: "p3", ABBR: "ANA" }] },
  ];
  assert.equal(computeTeamCash(100, "ANA", rp, cs), 100 - 14 - 14); // periods 1 and 2 only
  assert.equal(computeTeamCash(100, "BOS", rp, cs), 100 - 13 - 13); // 60 salary is under the minimum
  assert.equal(computeTeamCash(100, "ANA", rp.slice(0, 1), cs), 100); // only one period exists: nothing charged yet
  assert.equal(computeTeamCash(100, "ANA", [], cs), 100);
  // each period is priced from that period's roster and the contracts in effect then: p3 costs 60 until period 3, then 400
  const later = [...rp, { period: 4, data: [{ ID: "p1", ABBR: "ANA" }] }]; // period 4 is in progress: not charged
  assert.equal(computeTeamCash(100, "ANA", later, cs), 100 - 14 - 14 - (200 + 150 + 400) / 25); // = 42
});

test("team cash is rounded to cents each period", () => {
  const cs = [{ ID: "x", Salary: 333 }]; // 13.32 per period
  const rp = [1, 2, 3].map((period) => ({ period, data: [{ ID: "x", ABBR: "ANA" }] }));
  assert.equal(computeTeamCash(50, "ANA", rp, cs), 23.36);
});

// ---- Loading a season and ratings (fixture league in test/fixtures/league) -----------------

// loadSeasonData reads src/data/static/<season>; this path resolves to test/fixtures/league from there.
const sf = await loadSeasonData("../../../test/fixtures/league");

test("loadSeasonData: periods come from the stats files; the latest roster is the one for the latest stats", () => {
  assert.deepEqual(sf.availablePeriods, ["1", "2"]);
  assert.equal(sf.lastPeriodNum, 1);
  assert.equal(sf.statsPeriods.length, 2);
  assert.equal(sf.rosterPeriods.length, 3); // p03's roster exists already (next period's lineup)...
  assert.equal(sf.latestStatsFile, sf.statsData[2]);
  assert.equal(sf.latestRosterFile, sf.rosterData[2]); // ...but "latest" means the period that has stats
  assert.deepEqual(sf.playoffRounds, []);
});

test("readStatsFile turns the numeric columns into numbers and blanks into 0", () => {
  const rows = readStatsFile("test/fixtures/league/stats/stats_p01.csv");
  assert.equal(rows.length, 7);
  assert.equal(rows[3]["stats/goals"], 3);
  assert.equal(typeof rows[3]["stats/toi"], "number");
});

test("skater rating: the average of four percentile ratings (a tie counts half), against everyone in the league", () => {
  // Fixture skaters s1..s4 have goals 0,1,1,3 / assists 0,0,2,2 / toughness 0,10,10,20 / DStat 0,1,2,3
  const rating = (id) => sf.getOverallStats("F", sf.latestStatsFile.find((r) => r.hockeyRef === id)).rating;
  near(rating("s1"), (12.5 + 25 + 12.5 + 12.5) / 4);
  near(rating("s2"), (50 + 25 + 50 + 37.5) / 4);
  near(rating("s3"), (50 + 75 + 50 + 62.5) / 4);
  near(rating("s4"), (87.5 + 75 + 87.5 + 87.5) / 4);
  assert.ok(rating("s1") < rating("s2") && rating("s2") < rating("s3") && rating("s3") < rating("s4"));
});

test("goalie rating: percentile of GStat among goalies only (skaters do not count)", () => {
  const stat = (id) => sf.getOverallStats("G", sf.latestStatsFile.find((r) => r.hockeyRef === id));
  assert.equal(stat("g1").gstat, 0);
  near(stat("g2").gstat, 3); // 2 + 0.15*20 - 2
  near(stat("g3").gstat, 8); // 4 + 2 + 0.15*40 - 4
  near(stat("g1").rating, (100 * 0.5) / 3);
  near(stat("g2").rating, (100 * 1.5) / 3);
  near(stat("g3").rating, (100 * 2.5) / 3);
});

test("overall stats expose skater fields for skaters and goalie fields for goalies", () => {
  const s = sf.getOverallStats("F", sf.latestStatsFile.find((r) => r.hockeyRef === "s4"));
  assert.equal(s.goals, 3);
  assert.equal(s.toughness, 20);
  near(s.dstat, 3);
  assert.equal(s.games_played, 10);
  assert.equal(s.wins, null);
  assert.equal(s.gstat, null);
  const g = sf.getOverallStats("G", sf.latestStatsFile.find((r) => r.hockeyRef === "g3"));
  assert.equal(g.wins, 2);
  assert.equal(g.so, 1);
  assert.equal(g.goals, null);
  assert.equal(g.dstat, null);
});

test("a player missing from the stats file rates against the league as all zeros", () => {
  const s = sf.getOverallStats("F", {});
  assert.equal(s.games_played, 0);
  assert.equal(s.goals, 0);
  near(s.rating, (12.5 + 25 + 12.5 + 12.5) / 4 * 1); // same as a real all-zero skater (s1)
});
