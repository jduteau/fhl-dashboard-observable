// Run from the repo root with: node --test test/playoffHelpers.test.mjs
// Playoff matchups: each team's totals over a round (the round's stats less the previous round's), the stat rankings
// among the teams in the round, and the overall rank that decides who is ahead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeasonPlayoffs } from "../src/components/playoffHelpers.js";
import { calcDStat, calcGStat } from "../src/components/loadfiles.js";

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} !== ${expected}`);

// A stats-file row (cumulative totals for the playoffs so far)
const row = (hockeyRef, pos, v = {}) => ({
  hockeyRef, team: "X", pos,
  "stats/gp": v.gp ?? 0, "stats/goals": v.goals ?? 0, "stats/assists": v.assists ?? 0, "stats/pim": v.pim ?? 0, "stats/hits": v.hits ?? 0,
  "stats/toi": v.toi ?? 0, "stats/blocks": v.blocks ?? 0, "stats/take": v.take ?? 0, "stats/give": v.give ?? 0,
  "stats/wins": v.wins ?? 0, "stats/ties": v.ties ?? 0, "stats/so": v.so ?? 0, "stats/sa": v.sa ?? 0, "stats/ga": v.ga ?? 0,
});
// Each team has a forward (f-XXX) and a goalie (g-XXX) in its lineup, and a reserve forward (r-XXX) on the roster
const roster = (teams) => teams.flatMap((t) => [
  { ID: `f-${t}`, ABBR: t, RESERVE: "" }, { ID: `g-${t}`, ABBR: t, RESERVE: "" }, { ID: `r-${t}`, ABBR: t, RESERVE: "R" },
]);
// n: 4 = best ... 1 = worst, so every stat is ordered the same way
const stats = (t, n, scale = 1) => [
  row(`f-${t}`, "C", { gp: 4 * scale, goals: n * 2 * scale, assists: n * scale, pim: n * scale, hits: n * 3 * scale, toi: n * 60 * scale, blocks: n * scale, take: n * scale, give: scale }),
  row(`g-${t}`, "G", { gp: 4 * scale, wins: n * scale, sa: n * 20 * scale, ga: scale }),
  row(`r-${t}`, "C", { gp: 4 * scale, goals: 99, assists: 99 }), // a reserve: counted as a player, never in the totals
];
const TEAMS = { AAA: 4, BBB: 3, CCC: 2, DDD: 1 };
const teamInfo = [
  { ABBR: "AAA", NAME: "Alpha", DIVISION: "East" }, { ABBR: "BBB", NAME: "Bravo", DIVISION: "East" },
  { ABBR: "CCC", NAME: "Charlie", DIVISION: "West" }, // DDD deliberately has no team info
];
const bracketConfig = [
  { round: "1", matchup: "1", team1: "AAA", team2: "BBB" }, { round: "1", matchup: "2", team1: "CCC", team2: "DDD" },
  { round: "2", matchup: "1", team1: "AAA", team2: "CCC" },
  { round: "5", matchup: "1", team1: "AAA", team2: "BBB" }, // there is no round 5: ignored
];
const round1 = {
  round: 1, name: "First Round", available: true, rosterFile: roster(Object.keys(TEAMS)),
  statsFile: Object.entries(TEAMS).flatMap(([t, n]) => stats(t, n)),
};
const sf = (...rounds) => ({ availablePlayoffRounds: rounds });

test("the bracket comes from the config rows; rounds beyond the fourth are ignored", () => {
  const r = buildSeasonPlayoffs(sf(round1), teamInfo, bracketConfig);
  assert.deepEqual(r.bracket.rounds.map((x) => x.name), ["First Round", "Conference Semi-Finals", "Conference Finals", "Stanley Cup Final"]);
  assert.deepEqual(r.bracket.rounds[0].matchups, [{ matchup: 1, team1: "AAA", team2: "BBB" }, { matchup: 2, team1: "CCC", team2: "DDD" }]);
  assert.deepEqual(r.bracket.rounds[1].matchups, [{ matchup: 1, team1: "AAA", team2: "CCC" }]);
  assert.equal(r.bracket.rounds[2].matchups.length + r.bracket.rounds[3].matchups.length, 0);
  assert.deepEqual(r.availableRounds, [1]);
  assert.deepEqual(r.roundNames, { 1: "First Round" });
  assert.equal(r.teams, teamInfo);
});

test("a team's totals: active players only, points = goals + assists, DStat and GStat from the formulas", () => {
  const m = buildSeasonPlayoffs(sf(round1), teamInfo, bracketConfig).data[1].matchups[0];
  assert.equal(m.matchup, 1);
  assert.equal(m.winner, null);
  const a = m.team1; // AAA: n = 4
  assert.equal(a.abbr, "AAA");
  assert.equal(a.name, "Alpha");
  assert.equal(a.division, "East");
  assert.equal(a.goals, 8); // the forward's 8; the reserve's 99 is not counted
  assert.equal(a.assists, 4);
  assert.equal(a.points, 12);
  assert.equal(a.pim, 4);
  assert.equal(a.hits, 12);
  assert.equal(a.toughness, 16); // pim + hits
  assert.equal(a.blocks, 4);
  assert.equal(a.takeaways, 4);
  assert.equal(a.giveaways, 1);
  assert.equal(a.toi, 240);
  near(a.dstat, calcDStat("F", { toi: 240, blocks: 4, take: 4, give: 1 }));
  near(a.gstat, calcGStat({ wins: 4, ties: 0, so: 0, sa: 80, ga: 1 }));
  assert.equal(a.gp, 8); // forward and goalie; the reserve does not play
  assert.equal(a.goalieGp, 4);
  assert.equal(a.playerCount, 3); // every rostered player with a stats row, reserves included
});

test("a team with no team info falls back to its abbreviation and an unknown division", () => {
  const d = buildSeasonPlayoffs(sf(round1), teamInfo, bracketConfig).data[1].matchups[1].team2;
  assert.equal(d.abbr, "DDD");
  assert.equal(d.name, "DDD");
  assert.equal(d.division, "Unknown");
});

test("rankings among the teams in the round: best value ranks highest, overall rank 1 is best", () => {
  const { matchups } = buildSeasonPlayoffs(sf(round1), teamInfo, bracketConfig).data[1];
  const ranks = (t) => (matchups.flatMap((m) => [m.team1, m.team2]).find((x) => x.abbr === t)).rankings;
  assert.deepEqual(ranks("AAA"), { goals: 4, assists: 4, toughness: 4, dstat: 4, gstat: 4, total: 1 });
  assert.deepEqual(ranks("BBB"), { goals: 3, assists: 3, toughness: 3, dstat: 3, gstat: 3, total: 2 });
  assert.deepEqual(ranks("CCC"), { goals: 2, assists: 2, toughness: 2, dstat: 2, gstat: 2, total: 3 });
  assert.deepEqual(ranks("DDD"), { goals: 1, assists: 1, toughness: 1, dstat: 1, gstat: 1, total: 4 });
});

test("equal values share a rank, and equal overall standing is a tie", () => {
  const same = (t) => [row(`f-${t}`, "C", { gp: 2, goals: 5 }), row(`g-${t}`, "G", { gp: 2, wins: 1 })];
  const r1 = { ...round1, statsFile: ["AAA", "BBB", "CCC", "DDD"].flatMap(same) };
  const { matchups } = buildSeasonPlayoffs(sf(r1), teamInfo, bracketConfig).data[1];
  for (const t of matchups.flatMap((m) => [m.team1, m.team2])) {
    assert.equal(t.rankings.goals, 4, t.abbr); // all level: they all share the top rank
    assert.equal(t.rankings.total, 1, t.abbr); // and all tie for first overall
  }
});

test("a team whose goalies played no games ranks below every team whose goalies did, whatever their GStat", () => {
  const r1 = {
    ...round1,
    statsFile: [
      ...stats("AAA", 4), ...stats("BBB", 3), ...stats("CCC", 2),
      row("f-DDD", "C", { gp: 4, goals: 2 }), row("g-DDD", "G", { gp: 0 }), // DDD: GStat 0, no goalie games
    ],
  };
  const { matchups } = buildSeasonPlayoffs(sf({ ...r1, statsFile: r1.statsFile.map((r) => (r.hockeyRef === "g-CCC" ? { ...r, "stats/ga": 500 } : r)) }), teamInfo, bracketConfig).data[1];
  const gstat = (t) => matchups.flatMap((m) => [m.team1, m.team2]).find((x) => x.abbr === t);
  assert.ok(gstat("CCC").gstat < 0 && gstat("DDD").gstat === 0); // CCC's goalie was awful, DDD's did not play
  assert.ok(gstat("CCC").rankings.gstat > gstat("DDD").rankings.gstat);
  assert.equal(gstat("DDD").rankings.gstat, 1);
});

test("a later round counts only what happened since the previous round", () => {
  const round2 = {
    round: 2, name: "Conference Semi-Finals", available: true, rosterFile: roster(["AAA", "CCC"]),
    // cumulative totals double: so the round-2 totals equal round 1's
    statsFile: [...stats("AAA", 4, 2), ...stats("CCC", 2, 2)],
  };
  const r = buildSeasonPlayoffs(sf(round1, round2), teamInfo, bracketConfig);
  assert.deepEqual(r.availableRounds, [1, 2]);
  const m = r.data[2].matchups[0];
  assert.equal(m.team1.goals, 8); // (16 - 8)
  assert.equal(m.team2.goals, 4); // (8 - 4)
  assert.equal(m.team1.gp, 8);
  assert.equal(m.team1.rankings.total, 1);
  assert.equal(m.team2.rankings.total, 2);
});

test("a matchup team with no one on the round's roster has zero totals", () => {
  const r1 = { ...round1, rosterFile: roster(["AAA", "BBB", "CCC"]) }; // DDD has no one
  const d = buildSeasonPlayoffs(sf(r1), teamInfo, bracketConfig).data[1].matchups[1].team2;
  assert.equal(d.playerCount, 0);
  assert.equal(d.goals, 0);
});

test("no playoff rounds yet: an empty bracket and no data", () => {
  const r = buildSeasonPlayoffs(sf(), teamInfo, bracketConfig);
  assert.deepEqual(r.availableRounds, []);
  assert.deepEqual(r.data, {});
  assert.equal(r.bracket.rounds[0].matchups.length, 2); // the bracket itself is still known
});
