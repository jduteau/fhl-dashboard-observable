// Run from the repo root with: node --test test/season-rollover.test.mjs
// Runs the real build-time data loaders against a throwaway league in its first moments: the season is current and the
// opening roster exists, but no stats have been downloaded yet. A loader that fails here fails the whole site build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectedBudget, periodCost } from "../src/components/leagueRules.js";

const loader = (name) => new URL(`../src/data/${name}`, import.meta.url).pathname;
const SEASON = "2027-28";

function newSeason({ withStats = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fhl-rollover-"));
  const s = join(dir, "src/data/static");
  mkdirSync(join(s, SEASON, "rosters"), { recursive: true });
  const w = (file, text) => writeFileSync(join(s, file), text);
  w("seasons.csv", `season,label,ageCutoff,current,stub,autoCash\n${SEASON},${SEASON},2027-09-15,true,false,false\n`);
  w(`${SEASON}/team_info.csv`, "ABBR,NAME,DIVISION\nANA,Anaheim,West\nBOS,Boston,East\n");
  w(`${SEASON}/team_cash.csv`, "ABBR,CASH\nANA,100\nBOS,100\n");
  w(`${SEASON}/owners.csv`, "ABBR,OWNER,LOCATION\nANA,A,\"Hamilton, Ontario\"\nBOS,B,Boston\n");
  w(`${SEASON}/player_info.csv`, "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia\nf1,Fwd One,2000-01-01,C,ANA,1,fwd-one\ng1,Goalie One,1999-01-01,G,BOS,2,goalie-one\n");
  w(`${SEASON}/contracts.csv`, "ID,Salary,Contract,Period\nf1,40,1y,\ng1,30,1y,\n");
  w(`${SEASON}/draft_picks.csv`, "PICK,OWNER\nANA1,ANA\nBOS1,BOS\n");
  w(`${SEASON}/drafted_players.csv`, "hockeydb\n");
  w(`${SEASON}/playoff_bracket.csv`, "round,matchup,team1,team2\n");
  w(`${SEASON}/rosters/rosters_p01.csv`, "ID,ABBR,RESERVE\nf1,ANA,\ng1,BOS,\n");
  if (withStats) {
    mkdirSync(join(s, SEASON, "stats"), { recursive: true });
    w(`${SEASON}/stats/stats_p01.csv`, "hockeyRef,team,pos,stats/gp,stats/goals\nf1,ANA,C,2,1\ng1,BOS,G,2,0\n");
  }
  return dir;
}
const run = (dir, name) => {
  const r = spawnSync("node", [loader(name)], { cwd: dir, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `${name} failed:\n${r.stderr.slice(0, 600)}`);
  return r.stdout;
};
const json = (dir, name) => JSON.parse(run(dir, name)).data[SEASON];

test("every loader survives a brand-new season: roster, no stats yet", () => {
  const dir = newSeason();
  try {
    for (const name of ["rosters.json.js", "stats.json.js", "allplayers.json.js", "playoffRosters.json.js", "standings.json.js", "teamInfo.json.js", "playoffs.json.js", "allplayers.csv.js"])
      run(dir, name);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a brand-new season publishes period 1 with the opening roster and zeroed stats", () => {
  const dir = newSeason();
  try {
    const rosters = json(dir, "rosters.json.js");
    assert.equal(rosters.latestPeriod, 1);
    assert.deepEqual(rosters.availablePeriods, ["1", "OVERALL"]);
    const ana = rosters.teamData.find((t) => t.ABBR === "ANA");
    assert.deepEqual(ana["1"].ROSTER.map((p) => [p.PLAYER_ID, p.Goals, p.GamesPlayed]), [["f1", 0, 0]]);
    assert.deepEqual(ana.OVERALL.ROSTER.map((p) => p.PLAYER_ID), ["f1"]);

    const info = json(dir, "teamInfo.json.js");
    assert.equal(info.latestPeriod, 1);
    const anaInfo = info.teams.find((t) => t.ABBR === "ANA");
    assert.equal(anaInfo.LatestSalary, 40);
    assert.equal(anaInfo.Budget, projectedBudget(100, 40, 0)); // a whole season of periods still to pay for
    assert.equal(anaInfo.TotalPlayerCount, "(1-0-0) 1");

    const standings = json(dir, "standings.json.js");
    assert.deepEqual(standings.availablePeriods, []); // nothing has been played, so nothing to rank yet
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("once the first stats arrive the same season reports them", () => {
  const dir = newSeason({ withStats: true });
  try {
    const rosters = json(dir, "rosters.json.js");
    assert.equal(rosters.latestPeriod, 1);
    const ana = rosters.teamData.find((t) => t.ABBR === "ANA");
    assert.equal(ana["1"].ROSTER[0].Goals, 1);
    assert.equal(ana["1"].ROSTER[0].GamesPlayed, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("once the next period's roster exists, cash and budgets are as of that period even before its stats arrive", () => {
  const dir = newSeason({ withStats: true });
  try {
    const s = join(dir, "src/data/static");
    writeFileSync(join(s, "seasons.csv"), `season,label,ageCutoff,current,stub,autoCash\n${SEASON},${SEASON},2027-09-15,true,false,true\n`);
    writeFileSync(join(s, SEASON, "rosters/rosters_p02.csv"), "ID,ABBR,RESERVE\nf1,ANA,\ng1,BOS,\n"); // period 2 created, no stats_p02 yet
    const info = json(dir, "teamInfo.json.js");
    assert.equal(info.latestPeriod, 2);
    assert.equal(info.lastPeriodNum, 1);
    assert.deepEqual(info.availablePeriods, ["1"]); // stats still only cover period 1
    const ana = info.teams.find((t) => t.ABBR === "ANA");
    assert.equal(ana.CASH, 100 - periodCost(40)); // period 1 is complete and charged
    assert.equal(ana.Budget, projectedBudget(ana.CASH, 40, 1));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rosters.json publishes the newest roster file as the base for next-period moves, even without stats", () => {
  const dir = newSeason({ withStats: true });
  try {
    writeFileSync(join(dir, "src/data/static", SEASON, "rosters/rosters_p02.csv"), "ID,ABBR,RESERVE\nf1,BOS,\ng1,ANA,\n"); // both players swapped teams
    const rosters = json(dir, "rosters.json.js");
    assert.equal(rosters.latestPeriod, 1);
    assert.equal(rosters.latestRosterPeriod, 2);
    assert.deepEqual(rosters.availablePeriods, ["1", "OVERALL"]);
    const ana = rosters.teamData.find((t) => t.ABBR === "ANA");
    assert.deepEqual(ana["2"].ROSTER.map((p) => p.PLAYER_ID), ["g1"]);
    assert.deepEqual(ana.OVERALL.ROSTER.map((p) => p.PLAYER_ID), ["g1"]); // trades and transactions start from the newest roster
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
