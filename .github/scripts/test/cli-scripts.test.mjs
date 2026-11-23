// Run with: node --test .github/scripts/test/cli-scripts.test.mjs
// The small scripts the workflows run: resolve-period.mjs, record-trades.mjs and countActiveRoster.js, run for real
// against a throwaway league.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (p) => new URL(p, import.meta.url).pathname;
const SEASON = "2027-28";

function league() {
  const dir = mkdtempSync(join(tmpdir(), "fhl-cli-"));
  const s = join(dir, "src/data/static");
  mkdirSync(join(s, SEASON, "rosters"), { recursive: true });
  writeFileSync(join(s, "seasons.csv"), `season,label,ageCutoff,current,stub,autoCash\n2026-27,2026-27,2026-09-15,false,false,true\n${SEASON},${SEASON},2027-09-15,true,false,true\n`);
  writeFileSync(join(s, SEASON, "periods.csv"), "period,start,end\n01,2000-01-01,2000-01-08\n02,2000-01-08,2000-01-15\n03,2999-01-01,2999-01-08\n04,2999-01-08,2999-01-15\n");
  writeFileSync(join(s, SEASON, "rosters", "rosters_p02.csv"), "ID,ABBR,RESERVE\n");
  return { dir, s, read: (p) => readFileSync(join(s, SEASON, p), "utf-8"), exists: (p) => existsSync(join(s, SEASON, p)) };
}
const run = (cwd, script, args = [], env = {}) =>
  spawnSync("node", [here(`../${script}`), ...args], { cwd, encoding: "utf-8", env: { ...process.env, GITHUB_OUTPUT: "", TRADES: "", ...env } });

// ---- resolve-period.mjs ----------------------------------------------------------------------

test("resolve-period: the current season, its stats year, and the first period that ends today or later", () => {
  const L = league();
  try {
    const out = join(L.dir, "gh-output");
    const r = run(L.dir, "resolve-period.mjs", [], { GITHUB_OUTPUT: out });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /season=2027-28 year=2028 period=03/); // periods 1 and 2 ended long ago; 3 is the first still to end
    assert.equal(readFileSync(out, "utf-8"), "season=2027-28\nyear=2028\nperiod=03\nnext_period=\n");
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("resolve-period: on a period's last day the next period is also output, since the same stats start it", () => {
  const L = league();
  try {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(L.s, SEASON, "periods.csv"), `period,start,end\n07,2000-01-01,${today}\n08,${today},2999-01-01\n`);
    const out = join(L.dir, "gh-output");
    const r = run(L.dir, "resolve-period.mjs", [], { GITHUB_OUTPUT: out });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(out, "utf-8"), "season=2027-28\nyear=2028\nperiod=07\nnext_period=08\n");
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("resolve-period: arguments override the lookup, and a period is zero-padded", () => {
  const L = league();
  try {
    assert.match(run(L.dir, "resolve-period.mjs", ["2026-27", "7"]).stdout, /season=2026-27 year=2027 period=07/);
    assert.match(run(L.dir, "resolve-period.mjs", [SEASON, "12"]).stdout, /season=2027-28 year=2028 period=12/);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("resolve-period: when every period has ended there is nothing to do, and no output is written", () => {
  const L = league();
  try {
    writeFileSync(join(L.s, SEASON, "periods.csv"), "period,start,end\n01,2000-01-01,2000-01-08\n");
    const out = join(L.dir, "gh-output");
    const r = run(L.dir, "resolve-period.mjs", [], { GITHUB_OUTPUT: out });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /nothing to do/);
    assert.equal(existsSync(out), false);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

// ---- record-trades.mjs -----------------------------------------------------------------------

const trade = (n, extra = {}) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`, from: "ANA", to: "BOS", acceptedAt: `2026-11-2${n}T10:00:00.000Z`,
  give: { players: [`ana0${n}`], picks: [] }, get: { players: [`bos0${n}`], picks: [] }, ...extra,
});
const payload = (trades, extra = {}) => JSON.stringify({ season: SEASON, period: 3, trades, ...extra });

test("record-trades: stores the accepted trades for the next period; sending them again records nothing new", () => {
  const L = league();
  try {
    const first = run(L.dir, "record-trades.mjs", [], { TRADES: payload([trade(1)]) });
    assert.equal(first.status, 0, first.stderr + first.stdout);
    assert.match(first.stdout, /Recorded 1 new trade\(s\) for period 3/);
    assert.deepEqual(JSON.parse(L.read("trades/trades_p03.json")).trades.map((t) => t.id), [trade(1).id]);
    const before = L.read("trades/trades_p03.json");
    const again = run(L.dir, "record-trades.mjs", [], { TRADES: payload([trade(1)]) });
    assert.match(again.stdout, /No new trades \(1 already recorded for period 3\)/);
    assert.equal(L.read("trades/trades_p03.json"), before);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("record-trades: a newly accepted trade is added to the ones already there, oldest first", () => {
  const L = league();
  try {
    run(L.dir, "record-trades.mjs", [], { TRADES: payload([trade(2)]) });
    const r = run(L.dir, "record-trades.mjs", [], { TRADES: payload([trade(2), trade(1)]) }); // the Worker resends them all
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(L.read("trades/trades_p03.json")).trades.map((t) => t.id), [trade(1).id, trade(2).id]);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("record-trades: refuses a payload for the wrong season, the wrong period, or with an invalid trade, writing nothing", () => {
  const L = league();
  try {
    const refuse = (env, message) => {
      const r = run(L.dir, "record-trades.mjs", [], env);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stderr, new RegExp(`::error::.*${message}`));
      assert.equal(L.exists("trades/trades_p03.json"), false);
    };
    refuse({ TRADES: payload([trade(1)], { season: "2026-27" }) }, "not the current season");
    refuse({ TRADES: payload([trade(1)], { period: 9 }) }, "next period is 3");
    refuse({ TRADES: payload("nope") }, "trades must be an array");
    refuse({ TRADES: payload([trade(1, { to: "ANA" })]) }, "Invalid teams");
    refuse({ TRADES: payload([trade(1, { give: { players: [], picks: [] }, get: { players: [], picks: [] } })]) }, "is empty");
    refuse({ TRADES: "" }, "TRADES env var missing");
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

// ---- countActiveRoster.js (imported, so the season's player_info.csv is read from the working directory) ----

test("countActiveRoster: counts active players by position and reports the illegal rosters", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fhl-count-"));
  const season = join(dir, "src/data/static", SEASON);
  mkdirSync(join(season, "rosters"), { recursive: true });
  const ids = (abbr, f, d, g, r = 0) => [
    ...Array.from({ length: f }, (_, i) => `${abbr}f${i}`), ...Array.from({ length: d }, (_, i) => `${abbr}d${i}`),
    ...Array.from({ length: g }, (_, i) => `${abbr}g${i}`), ...Array.from({ length: r }, (_, i) => `${abbr}r${i}`),
  ];
  const teams = { ANA: ids("ANA", 12, 6, 2, 3), BOS: ids("BOS", 12, 5, 2), CAR: ids("CAR", 11, 6, 2) }; // BOS: 5 D; CAR: 19 players
  const pos = (id) => (/d\d+$/.test(id) ? "D" : /g\d+$/.test(id) ? "G" : "C");
  writeFileSync(join(season, "player_info.csv"), "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia\n" + Object.values(teams).flat().map((id) => `${id},${id},2000-01-01,${pos(id)},X,,`).join("\n") + "\n");
  const rosterCsv = "ID,ABBR,RESERVE\n" + Object.entries(teams).flatMap(([abbr, list]) => list.map((id) => `${id},${abbr},${/r\d+$/.test(id) ? "R" : ""}`)).join("\n") + "\n";
  const file = join(season, "rosters", "rosters_p01.csv");
  writeFileSync(file, rosterCsv);
  const playoffFile = join(season, "rosters", "rosters_playoff_r01.csv");
  writeFileSync(playoffFile, rosterCsv);

  const cwd = process.cwd();
  process.chdir(dir);
  const lines = [];
  const realLog = console.log;
  try {
    const { countActiveRoster, printResults } = await import("../../../countActiveRoster.js");
    const regular = countActiveRoster(file);
    assert.equal(regular.isPlayoffRoster, false);
    assert.equal(regular.totalPlayers, 23 + 19 + 19); // ANA 23 (3 reserves), BOS 19, CAR 19
    assert.equal(regular.totalReservePlayers, 3);
    assert.equal(regular.totalActivePlayers, 58);
    assert.deepEqual(regular.overallCounts, { forwards: 35, defensemen: 17, goalies: 6, unknown: 0 });
    assert.deepEqual(regular.teamCounts.ANA, { forwards: 12, defensemen: 6, goalies: 2, unknown: 0 }); // reserves not counted
    assert.deepEqual(Object.keys(regular.rosterViolations).sort(), ["BOS", "CAR"]);
    assert.match(regular.rosterViolations.BOS.join(), /Too few defensemen \(5, min 6\)/);
    assert.match(regular.rosterViolations.CAR.join(), /Too few active players \(19, need 20\)/);

    // a playoff roster (detected from the file name) only has the maximums, so short teams are fine
    const playoff = countActiveRoster(playoffFile);
    assert.equal(playoff.isPlayoffRoster, true);
    assert.deepEqual(playoff.rosterViolations, {});

    console.log = (...a) => lines.push(a.join(" "));
    printResults(regular);
    console.log = realLog;
    const text = lines.join("\n");
    assert.match(text, /REGULAR SEASON ROSTER ANALYSIS/);
    assert.match(text, /ANA: 20 total \(F:12, D:6, G:2\)$/m);
    assert.match(text, /BOS: 19 total \(F:12, D:5, G:2\) ❌ ILLEGAL: Too few active players \(19, need 20\), Too few defensemen/m);
    assert.match(text, /ROSTER VIOLATIONS DETECTED: 2 team\(s\)/);
    assert.equal(countActiveRoster(join(season, "rosters", "missing.csv")), null); // an unreadable file reports and returns null
  } finally {
    console.log = realLog;
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
