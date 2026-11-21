// Run with: node --test test/leagueRules.test.mjs
// The league's rules in one module: money, roster limits and stat weights.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERIODS_PER_SEASON, MIN_PERIOD_COST, periodCost, projectedBudget, MIN_ROSTER, MAX_ROSTER, ACTIVE_LINEUP, lineupProblems,
  DSTAT_TOI_DIVISOR, GSTAT_WEIGHTS, mapPosition, POSITION_ORDER, recordForRank, TEAMS_IN_LEAGUE,
} from "../src/components/leagueRules.js";
import { calcDStat, calcGStat, periodCost as periodCostFromLoader } from "../src/components/loadfiles.js";

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} !== ${expected}`);
const codes = (counts, opts) => lineupProblems(counts, opts).map((p) => p.code);

test("the rules are what the league plays by", () => {
  assert.equal(PERIODS_PER_SEASON, 25);
  assert.equal(MIN_PERIOD_COST, 13);
  assert.equal(MIN_ROSTER, 20);
  assert.equal(MAX_ROSTER, 36);
  assert.deepEqual(ACTIVE_LINEUP, { players: 20, minDefensemen: 6, maxDefensemen: 7, goalies: 2 });
});

test("a period costs salary / 25 with a minimum of 13: payrolls up to 325 all pay the minimum", () => {
  assert.equal(periodCost(0), 13);
  assert.equal(periodCost(324), 13);
  assert.equal(periodCost(325), 13);
  assert.equal(periodCost(326), 326 / 25);
  assert.equal(periodCost(500), 20);
  assert.equal(MIN_PERIOD_COST * PERIODS_PER_SEASON, 325); // where the minimum stops mattering
  assert.equal(periodCostFromLoader, periodCost); // loadfiles.js re-exports the same function
});

test("projected budget: cash less the cost of every period still to be charged", () => {
  // 500 payroll = 20 a period. After 5 completed periods there are 20 left (the one in progress included).
  assert.equal(projectedBudget(500, 500, 5), 500 - 20 * 20);
  assert.equal(projectedBudget(500, 100, 5), 500 - 13 * 20); // a small payroll still pays the minimum
  assert.equal(projectedBudget(100, 500, 24), 100 - 20); // one period left
  assert.equal(projectedBudget(100, 500, 25), 100); // season over: nothing left to charge
  assert.equal(projectedBudget(100, 500, 0), 100 - 20 * 25); // before the first period completes
});

test("a legal regular-season lineup has no problems", () => {
  assert.deepEqual(lineupProblems({ total: 20, defensemen: 6, goalies: 2 }), []);
  assert.deepEqual(lineupProblems({ total: 20, defensemen: 7, goalies: 2 }), []);
});

test("regular season: exactly 20 players, 6-7 defensemen and exactly 2 goalies", () => {
  assert.deepEqual(codes({ total: 21, defensemen: 6, goalies: 2 }), ["TOO_MANY_PLAYERS"]);
  assert.deepEqual(codes({ total: 19, defensemen: 6, goalies: 2 }), ["TOO_FEW_PLAYERS"]);
  assert.deepEqual(codes({ total: 20, defensemen: 8, goalies: 2 }), ["TOO_MANY_DEFENSEMEN"]);
  assert.deepEqual(codes({ total: 20, defensemen: 5, goalies: 2 }), ["TOO_FEW_DEFENSEMEN"]);
  assert.deepEqual(codes({ total: 20, defensemen: 6, goalies: 3 }), ["TOO_MANY_GOALIES"]);
  assert.deepEqual(codes({ total: 20, defensemen: 6, goalies: 1 }), ["TOO_FEW_GOALIES"]);
  assert.deepEqual(codes({ total: 0, defensemen: 0, goalies: 0 }), ["TOO_FEW_PLAYERS", "TOO_FEW_DEFENSEMEN", "TOO_FEW_GOALIES"]);
});

test("playoffs: only the maximums apply, so a team can run short of players", () => {
  const playoff = { playoff: true };
  assert.deepEqual(lineupProblems({ total: 12, defensemen: 3, goalies: 1 }, playoff), []);
  assert.deepEqual(lineupProblems({ total: 0, defensemen: 0, goalies: 0 }, playoff), []);
  assert.deepEqual(codes({ total: 21, defensemen: 8, goalies: 3 }, playoff), ["TOO_MANY_PLAYERS", "TOO_MANY_DEFENSEMEN", "TOO_MANY_GOALIES"]);
});

test("problem messages say what is wrong and by how much", () => {
  const messages = lineupProblems({ total: 21, defensemen: 4, goalies: 3 }).map((p) => p.message);
  assert.deepEqual(messages, [
    "Too many active players (21, max 20)",
    "Too many goalies (3, max 2)",
    "Too few defensemen (4, min 6)",
  ]);
});

test("the stat formulas use the shared weights", () => {
  assert.deepEqual(DSTAT_TOI_DIVISOR, { D: 20, other: 30 });
  assert.deepEqual(GSTAT_WEIGHTS, { win: 2, tie: 1, shutout: 2, shotAgainst: 0.15 });
  near(calcDStat("D", { toi: 200 }), 200 / DSTAT_TOI_DIVISOR.D);
  near(calcDStat("F", { toi: 300 }), 300 / DSTAT_TOI_DIVISOR.other);
  near(calcGStat({ wins: 1, ties: 1, so: 1, sa: 100, ga: 3 }),
    GSTAT_WEIGHTS.win + GSTAT_WEIGHTS.tie + GSTAT_WEIGHTS.shutout + GSTAT_WEIGHTS.shotAgainst * 100 - 3);
});

test("positions: G and D are kept, every other (or missing) position is a forward", () => {
  assert.equal(mapPosition("G"), "G");
  assert.equal(mapPosition("g"), "G");
  assert.equal(mapPosition("D"), "D");
  for (const p of ["C", "LW", "RW", "F", "W", "", null, undefined]) assert.equal(mapPosition(p), "F", String(p));
  assert.deepEqual(Object.keys(POSITION_ORDER).sort((a, b) => POSITION_ORDER[a] - POSITION_ORDER[b]), ["D", "F", "G"]);
});

test("record by rank: every rank of a 32-team league earns a 3-game record, outside the table earns nothing", () => {
  assert.equal(TEAMS_IN_LEAGUE, 32);
  const record = (rank) => { const r = recordForRank(rank); return `${r.wins}-${r.losses}-${r.ties}`; };
  const expected = [[1, 4, "3-0-0"], [5, 7, "2-0-1"], [8, 12, "2-1-0"], [13, 13, "1-0-2"], [14, 19, "1-1-1"], [20, 24, "1-2-0"], [25, 25, "0-1-2"], [26, 28, "0-2-1"], [29, 32, "0-3-0"]];
  for (const [from, to, rec] of expected) for (let r = from; r <= to; r++) assert.equal(record(r), rec, `rank ${r}`);
  for (let r = 1; r <= 32; r++) { const x = recordForRank(r); assert.equal(x.wins + x.losses + x.ties, 3, `rank ${r}`); }
  assert.equal(record(0), "0-0-0");
  assert.equal(record(33), "0-0-0");
});
