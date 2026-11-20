// Run from the repo root with: node --test test/standings.test.mjs
// Period rankings, ties, tie-breakers, the record-by-rank table and the overall standings, exercised through
// buildSeasonStandings with a synthetic 32-team league (each team: one forward, one goalie, optionally a reserve).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeasonStandings } from "../src/components/standingsHelpers.js";

const N = 32;
const abbr = (i) => `T${String(i).padStart(2, "0")}`;
const ZERO = { goals: 0, assists: 0, pim: 0, hits: 0, toi: 0, gp: 0, wins: 0, sa: 0, ga: 0 };

// spec(i, period) -> cumulative stats {f: {...}, g: {...}, r?: {...}} for team i at the END of that period.
// f = the active forward, g = the active goalie, r = a reserve forward (must never count).
function league(spec, periods = [1], { rosterOnlyPeriods = [], dropPlayer = null } = {}) {
  const teamInfo = [], playerInfo = [], rosters = [];
  const statsData = {};
  for (let i = 0; i < N; i++) {
    teamInfo.push({ ABBR: abbr(i), NAME: `Team ${i}`, DIVISION: i % 2 ? "East" : "West" });
    playerInfo.push({ ID: `f${i}`, Name: `Fwd ${i}`, Pos: "C", NHL: "X" }, { ID: `g${i}`, Name: `Goalie ${i}`, Pos: "G", NHL: "X" }, { ID: `r${i}`, Name: `Res ${i}`, Pos: "LW", NHL: "X" });
  }
  for (const period of periods) {
    const rows = [];
    const roster = [];
    for (let i = 0; i < N; i++) {
      const s = spec(i, period);
      const stat = (id, pos, v) => ({ hockeyRef: id, team: "X", pos, "stats/gp": v.gp, "stats/goals": v.goals, "stats/assists": v.assists, "stats/pim": v.pim, "stats/hits": v.hits, "stats/toi": v.toi, "stats/blocks": 0, "stats/take": 0, "stats/give": 0, "stats/wins": v.wins, "stats/ties": 0, "stats/so": 0, "stats/sa": v.sa, "stats/ga": v.ga });
      rows.push(stat(`f${i}`, "C", { ...ZERO, ...s.f }), stat(`g${i}`, "G", { ...ZERO, ...s.g }), stat(`r${i}`, "LW", { ...ZERO, ...s.r }));
      roster.push({ ID: `f${i}`, ABBR: abbr(i), RESERVE: "" }, { ID: `g${i}`, ABBR: abbr(i), RESERVE: "" }, { ID: `r${i}`, ABBR: abbr(i), RESERVE: "R" });
    }
    statsData[period] = rows;
    rosters.push({ period, data: roster });
  }
  // Rosters for periods that have no stats yet (the upcoming period's lineup)
  for (const period of rosterOnlyPeriods) rosters.push({ period, data: rosters[rosters.length - 1].data });
  if (dropPlayer) playerInfo.splice(playerInfo.findIndex((p) => p.ID === dropPlayer), 1);
  const sf = { season: "test", statsData, rosterPeriods: rosters, availablePeriods: periods.map(String) };
  return buildSeasonStandings(sf, teamInfo, playerInfo);
}

// Every category rises with the team number, so team i is better than team i-1 in all five.
const ordered = (i) => ({
  f: { gp: 10, goals: i, assists: i, pim: i, hits: 0, toi: i * 30 }, // goals, assists, toughness and DStat all = i (toi/30)
  g: { gp: 5, wins: i, sa: 0, ga: 0 }, // GStat = 2i
});
const entry = (r, period, team) => r.rankings.periods[period].find((e) => e.team === team);

test("a league ordered the same way in every category: ranks 1..32 and the record-by-rank table", () => {
  const r = league(ordered);
  assert.equal(r.rankings.periods.length, 1);
  assert.equal(r.rankings.periods[0].length, N);
  const best = entry(r, 0, abbr(31)), worst = entry(r, 0, abbr(0));
  for (const k of ["goalsRank", "assistsRank", "toughnessRank", "dstatRank", "gstatRank"]) {
    assert.equal(best[k], 32, k); // the highest value gets the highest rank (32 = best)
    assert.equal(worst[k], 1, k);
  }
  assert.equal(best.overall, 160);
  assert.equal(best.overallRank, 1); // overall rank 1 = best
  assert.equal(worst.overallRank, 32);
  assert.deepEqual(r.rankings.periods[0].map((e) => e.overallRank).sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i + 1));
  assert.equal(best.record, "3-0-0");
  assert.equal(worst.record, "0-3-0");

  // The table: ranks 1-4 3-0-0, 5-7 2-0-1, 8-12 2-1-0, 13 1-0-2, 14-19 1-1-1, 20-24 1-2-0, 25 0-1-2, 26-28 0-2-1, 29-32 0-3-0
  const byRank = (rank) => r.rankings.periods[0].find((e) => e.overallRank === rank).record;
  const table = [[1, 4, "3-0-0"], [5, 7, "2-0-1"], [8, 12, "2-1-0"], [13, 13, "1-0-2"], [14, 19, "1-1-1"], [20, 24, "1-2-0"], [25, 25, "0-1-2"], [26, 28, "0-2-1"], [29, 32, "0-3-0"]];
  for (const [from, to, record] of table) for (let k = from; k <= to; k++) assert.equal(byRank(k), record, `overall rank ${k}`);
});

test("every team plays 3 games a period and wins always equal losses across the league", () => {
  const r = league(ordered);
  const all = r.rankings.periods[0];
  for (const e of all) assert.equal(e.wins + e.losses + e.ties, 3, e.team);
  assert.equal(all.reduce((s, e) => s + e.wins, 0), all.reduce((s, e) => s + e.losses, 0));
  assert.equal(all.reduce((s, e) => s + e.ties, 0) % 2, 0); // ties come in pairs
});

test("equal values share a rank, and the next value skips the places taken", () => {
  const r = league((i) => {
    const t = ordered(i);
    if (i >= 30) t.f.goals = 99; // teams 30 and 31 tie for the most goals
    return t;
  });
  assert.equal(entry(r, 0, abbr(31)).goalsRank, 32);
  assert.equal(entry(r, 0, abbr(30)).goalsRank, 32);
  assert.equal(entry(r, 0, abbr(29)).goalsRank, 30); // 31 is skipped
  assert.equal(entry(r, 0, abbr(28)).goalsRank, 29);
});

test("reserve players never count toward a team's totals", () => {
  const r = league((i) => ({ ...ordered(i), r: { gp: 10, goals: 500, assists: 500, pim: 500, hits: 500, toi: 9000 } }));
  assert.equal(entry(r, 0, abbr(0)).goals, 0);
  assert.equal(entry(r, 0, abbr(0)).toughness, 0);
  assert.equal(entry(r, 0, abbr(31)).goals, 31);
  assert.equal(entry(r, 0, abbr(31)).goalsRank, 32);
});

test("toughness is penalty minutes + hits and DStat comes from time on ice", () => {
  const r = league((i) => ({ f: { gp: 10, pim: i, hits: 2 * i, toi: 60 * i }, g: { gp: 5 } }));
  const e = entry(r, 0, abbr(10));
  assert.equal(e.toughness, 30);
  assert.equal(e.dstat, 20); // 600 minutes / 30 for a forward
});

test("a team with no goalie games ranks below every team that played, even one with a worse GStat", () => {
  const r = league((i) => {
    if (i === 0) return { f: { gp: 10, goals: 1 }, g: { gp: 0 } }; // nobody in goal played: GStat 0
    if (i === 1) return { f: { gp: 10, goals: 1 }, g: { gp: 5, ga: 50 } }; // played and was awful: GStat -50
    return ordered(i);
  });
  assert.equal(entry(r, 0, abbr(0)).gstat, 0);
  assert.equal(entry(r, 0, abbr(1)).gstat, -50);
  assert.equal(entry(r, 0, abbr(0)).goalieGames, 0);
  assert.equal(entry(r, 0, abbr(1)).goalieGames, 5);
  assert.equal(entry(r, 0, abbr(1)).gstatRank, 2);
  assert.equal(entry(r, 0, abbr(0)).gstatRank, 1); // lowest of all
});

test("tie-break: equal rank totals are split by goals, then assists, toughness, DStat, GStat", () => {
  // Teams 30 (A) and 31 (B) tie on everything but goals/assists, which they split so their rank totals are equal.
  const build = (aGoals, bGoals, aAssists, bAssists) => league((i) => {
    if (i < 30) return { f: { gp: 10, goals: i % 20, assists: i % 20, pim: i, toi: i * 30 }, g: { gp: 5, wins: i % 20 } };
    const goals = i === 30 ? aGoals : bGoals, assists = i === 30 ? aAssists : bAssists;
    return { f: { gp: 10, goals, assists, pim: 500, toi: 30000 }, g: { gp: 5, wins: 100 } };
  });
  const aAhead = build(100, 90, 50, 60); // A: more goals, B: more assists
  assert.equal(entry(aAhead, 0, abbr(30)).overall, entry(aAhead, 0, abbr(31)).overall);
  assert.equal(entry(aAhead, 0, abbr(30)).overallRank, 1);
  assert.equal(entry(aAhead, 0, abbr(31)).overallRank, 2);
  const bAhead = build(90, 100, 60, 50);
  assert.equal(entry(bAhead, 0, abbr(31)).overallRank, 1);
  assert.equal(entry(bAhead, 0, abbr(30)).overallRank, 2);
  // with goals level too, assists decide
  const byAssists = build(100, 100, 60, 50);
  assert.equal(entry(byAssists, 0, abbr(30)).overallRank, 1);
  assert.equal(entry(byAssists, 0, abbr(31)).overallRank, 2);
});

test("teams identical in every stat share an overall rank and the same record", () => {
  const r = league((i) => (i >= 30 ? { f: { gp: 10, goals: 80, assists: 80, pim: 80, toi: 2400 }, g: { gp: 5, wins: 80 } } : ordered(i)));
  const a = entry(r, 0, abbr(30)), b = entry(r, 0, abbr(31));
  assert.equal(a.overallRank, b.overallRank);
  assert.equal(a.overallRank, 1);
  assert.equal(a.record, b.record);
});

test("stats are cumulative: each period counts only what happened since the previous file", () => {
  // Team i scores i goals in period 1 and 2i more in period 2 (cumulative 3i by period 2).
  const r = league((i, p) => ({ f: { gp: 10 * p, goals: p === 1 ? i : 3 * i, assists: i, pim: i, toi: i * 30 * p }, g: { gp: 5 * p, wins: i * p } }), [1, 2]);
  assert.equal(r.rankings.periods.length, 2);
  assert.equal(entry(r, 0, abbr(10)).goals, 10);
  assert.equal(entry(r, 1, abbr(10)).goals, 20); // 30 - 10
  assert.equal(entry(r, 1, abbr(31)).goals, 62);
  assert.equal(entry(r, 1, abbr(31)).goalsRank, 32);
});

test("overall standings add up the periods: points = 2 per win + 1 per tie, sorted by points, wins, goals, assists", () => {
  const r = league((i, p) => ({ f: { gp: 10 * p, goals: i * p, assists: i * p, pim: i * p, toi: i * 30 * p }, g: { gp: 5 * p, wins: i * p } }), [1, 2]);
  const s = r.rankings.overallStandings;
  assert.equal(s.length, N);
  const top = s[0], bottom = s[N - 1];
  assert.equal(top.team, abbr(31));
  assert.equal(top.overallRank, 1);
  assert.equal(top.wins, 6); // 3-0-0 in each of two periods
  assert.equal(top.points, 12);
  assert.equal(top.teamName, "Team 31");
  assert.equal(top.division, "East");
  assert.equal(bottom.team, abbr(0));
  assert.equal(bottom.losses, 6);
  assert.equal(bottom.points, 0);
  for (const t of s) {
    assert.equal(t.points, t.wins * 2 + t.ties);
    assert.equal(t.wins + t.losses + t.ties, 6, t.team);
  }
  for (let k = 1; k < s.length; k++) assert.ok(s[k - 1].points >= s[k].points, "sorted by points");
  assert.deepEqual(s.map((t) => t.overallRank), Array.from({ length: N }, (_, i) => i + 1)); // 1..32 with no gaps
  // team 10's cumulative goals are 10 after period 1 and 20 after period 2, so it scored 10 in each period
  const t10 = s.find((t) => t.team === abbr(10));
  assert.equal(t10.goals, 10 + 10);
});

test("overall standings have per-stat ranks across the whole season", () => {
  const r = league(ordered);
  const s = r.rankings.overallStandings;
  const top = s.find((t) => t.team === abbr(31)), bottom = s.find((t) => t.team === abbr(0));
  for (const k of ["goalsRank", "assistsRank", "toughnessRank", "dstatRank", "gstatRank"]) {
    assert.equal(top[k], 32, k);
    assert.equal(bottom[k], 1, k);
  }
});

test("a period with no stats yet is left out", () => {
  // Period 2's file is identical to period 1's (the stats download ran before anything happened): all deltas are zero.
  const r = league((i) => ordered(i), [1, 2]);
  assert.deepEqual(r.availablePeriods, ["1"]);
  assert.equal(r.rankings.periods.length, 1);
});

test("with no stats at all, no periods and an all-zero overall table", () => {
  const r = league(() => ({ f: {}, g: {} }));
  assert.deepEqual(r.availablePeriods, []);
  assert.equal(r.rankings.periods.length, 0);
  assert.ok(r.rankings.overallStandings.every((t) => t.points === 0 && t.wins === 0));
});

test("a roster file whose period has no stats yet (the upcoming period) is skipped, not a crash", () => {
  const r = league(ordered, [1], { rosterOnlyPeriods: [2] });
  assert.equal(r.rankings.periods.length, 1);
  assert.deepEqual(r.availablePeriods, ["1"]);
  assert.equal(entry(r, 0, abbr(31)).overallRank, 1);
});

test("a rostered player missing from player_info.csv fails with a message that names them", () => {
  assert.throws(() => league(ordered, [1], { dropPlayer: "f5" }), /1 rostered player\(s\) are missing from player_info\.csv: f5 \(in test rosters_p01\.csv\)/);
});
