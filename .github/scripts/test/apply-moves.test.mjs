// Run with: node --test .github/scripts/test/apply-moves.test.mjs
// Runs the real `apply-moves.mjs materialize` against a small throwaway league, more than once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../apply-moves.mjs", import.meta.url).pathname;
const SEASON = "2026-27";

// ANA has 21 players (one reserve), BOS 20: 12 F, 6 D, 2 G active on each
const team = (abbr, extra = 0) => [
  ...Array.from({ length: 12 }, (_, i) => `${abbr}-f${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `${abbr}-d${i + 1}`),
  `${abbr}-g1`, `${abbr}-g2`,
  ...Array.from({ length: extra }, (_, i) => `${abbr}-r${i + 1}`),
];
const rosterCsv = () => "ID,ABBR,RESERVE\n" + [...team("ANA", 1).map((id) => `${id},ANA,${id.includes("-r") ? "R" : ""}`), ...team("BOS").map((id) => `${id},BOS,`)].join("\n") + "\n";
const posOf = (id) => (id.includes("-d") ? "D" : id.includes("-g") ? "G" : "C");
const infoCsv = () => "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia\n" + [...team("ANA", 1), ...team("BOS")].map((id) => `${id},${id},2000-01-01,${posOf(id)},X,,${id}`).join("\n");
const trade = (id, at, giveP, giveK, getP, getK) => ({
  id, from: "ANA", to: "BOS", acceptedAt: at,
  give: { players: giveP, picks: giveK.map((pick) => ({ pick, season: SEASON })) },
  get: { players: getP, picks: getK.map((pick) => ({ pick, season: SEASON })) },
});
const T1 = trade("00000000-0000-0000-0000-000000000001", "2026-11-20T10:00:00.000Z", ["ANA-f2"], ["ANA1"], ["BOS-f2"], []);
const T2 = trade("00000000-0000-0000-0000-000000000002", "2026-11-21T10:00:00.000Z", ["ANA-f3"], [], ["BOS-f3"], ["BOS1"]);

function league() {
  const dir = mkdtempSync(join(tmpdir(), "fhl-moves-"));
  const s = join(dir, "src/data/static");
  for (const d of ["rosters", "stats", "trades", "moves"]) mkdirSync(join(s, SEASON, d), { recursive: true });
  writeFileSync(join(s, "seasons.csv"), `season,label,current\n${SEASON},${SEASON},true\n`);
  writeFileSync(join(s, SEASON, "player_info.csv"), infoCsv());
  writeFileSync(join(s, SEASON, "draft_picks.csv"), "PICK,OWNER\r\nANA1,ANA\r\nBOS1,BOS\r\n");
  for (const p of ["01", "02"]) {
    writeFileSync(join(s, SEASON, "rosters", `rosters_p${p}.csv`), rosterCsv());
    writeFileSync(join(s, SEASON, "stats", `stats_p${p}.csv`), "hockeyRef,team,pos\n");
  }
  const w = (path, data) => writeFileSync(join(s, SEASON, path), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
  w("trades/trades_p03.json", { trades: [T1] });
  w("moves/moves_p03.json", { ANA: { promote: ["ANA-r1"], demote: ["ANA-f1"], submittedAt: "2026-11-20T12:00:00.000Z" } });
  return {
    dir, s, w,
    read: (path) => readFileSync(join(s, SEASON, path), "utf-8"),
    exists: (path) => existsSync(join(s, SEASON, path)),
    materialize: (...args) => spawnSync("node", [script, "materialize", ...args], { cwd: dir, encoding: "utf-8" }),
    snapshot: () => Object.fromEntries(walk(join(s, SEASON)).map((f) => [f.slice(s.length), readFileSync(f, "utf-8")])),
  };
}
function walk(dir) {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])).sort();
}
const teamOf = (csv, id) => csv.split("\n").find((l) => l.startsWith(id + ","))?.split(",")[1];
const reserveOf = (csv, id) => csv.split("\n").find((l) => l.startsWith(id + ","))?.split(",")[2];

test("materialize writes the next period's roster from the previous one, the agreed trades and the stored moves", () => {
  const L = league();
  try {
    const r = L.materialize();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const csv = L.read("rosters/rosters_p03.csv");
    assert.equal(teamOf(csv, "ANA-f2"), "BOS"); // traded
    assert.equal(teamOf(csv, "BOS-f2"), "ANA");
    assert.equal(reserveOf(csv, "ANA-r1"), ""); // promoted
    assert.equal(reserveOf(csv, "ANA-f1"), "R"); // demoted
    assert.match(L.read("draft_picks.csv"), /ANA1,BOS/); // the traded pick changed owner, in place
    assert.match(L.read("draft_picks.csv"), /\r\n/); // line endings untouched
    const stored = JSON.parse(L.read("trades/trades_p03.json"));
    assert.ok(stored.trades[0].appliedAt);
    assert.equal(stored.trades[0].skipped, undefined);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("running materialize again regenerates the same period and changes nothing (no new period, picks stay put)", () => {
  const L = league();
  try {
    assert.equal(L.materialize().status, 0);
    const first = L.snapshot();
    const again = L.materialize();
    assert.equal(again.status, 0, again.stderr + again.stdout);
    assert.match(again.stdout, /rosters_p03\.csv already exists and period 3 has not started: regenerating it from rosters_p02\.csv/);
    assert.equal(L.exists("rosters/rosters_p04.csv"), false); // it did NOT create another period
    assert.deepEqual(L.snapshot(), first); // every file byte for byte the same, appliedAt included
    assert.equal(L.materialize().status, 0);
    assert.deepEqual(L.snapshot(), first);
    // and the pick trade was not skipped on the second run just because the pick had already moved
    assert.equal(JSON.parse(L.read("trades/trades_p03.json")).trades[0].skipped, undefined);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("running again picks up a trade agreed (and moves submitted) after the first run, leaving the first trade as it was", () => {
  const L = league();
  try {
    assert.equal(L.materialize().status, 0);
    const firstApplied = JSON.parse(L.read("trades/trades_p03.json")).trades[0].appliedAt;
    L.w("trades/trades_p03.json", { trades: [JSON.parse(L.read("trades/trades_p03.json")).trades[0], T2] });
    L.w("moves/moves_p03.json", { ANA: { promote: ["ANA-r1"], demote: ["ANA-f4"], submittedAt: "2026-11-21T12:00:00.000Z" } });
    assert.equal(L.materialize().status, 0);
    const csv = L.read("rosters/rosters_p03.csv");
    assert.equal(teamOf(csv, "ANA-f2"), "BOS"); // first trade still applied
    assert.equal(teamOf(csv, "ANA-f3"), "BOS"); // second trade now applied too
    assert.equal(teamOf(csv, "BOS-f3"), "ANA");
    assert.equal(reserveOf(csv, "ANA-f4"), "R"); // the newer moves
    assert.equal(reserveOf(csv, "ANA-f1"), ""); // the older moves are gone
    const picks = L.read("draft_picks.csv");
    assert.match(picks, /ANA1,BOS/);
    assert.match(picks, /BOS1,ANA/);
    const stored = JSON.parse(L.read("trades/trades_p03.json")).trades;
    assert.equal(stored[0].appliedAt, firstApplied);
    assert.ok(stored[1].appliedAt);
    assert.equal(L.exists("rosters/rosters_p04.csv"), false);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("a trade that can no longer happen is skipped on regeneration and its pick goes back to its owner", () => {
  const L = league();
  try {
    assert.equal(L.materialize().status, 0);
    assert.match(L.read("draft_picks.csv"), /ANA1,BOS/);
    // Before the next run the trade stops being possible: it now names a player ANA does not have
    const trades = JSON.parse(L.read("trades/trades_p03.json"));
    trades.trades[0].give.players = ["ANA-NOBODY"];
    L.w("trades/trades_p03.json", trades);
    assert.equal(L.materialize().status, 0);
    assert.match(JSON.parse(L.read("trades/trades_p03.json")).trades[0].skipped, /not on ANA's roster/);
    assert.match(L.read("draft_picks.csv"), /ANA1,ANA/); // handed back
    assert.equal(teamOf(L.read("rosters/rosters_p03.csv"), "ANA-f2"), "ANA");
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("once the period has started (it has stats), the next run creates the following period", () => {
  const L = league();
  try {
    assert.equal(L.materialize().status, 0);
    writeFileSync(join(L.s, SEASON, "stats", "stats_p03.csv"), "hockeyRef,team,pos\n");
    const r = L.materialize();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(L.exists("rosters/rosters_p04.csv"), true);
    assert.equal(teamOf(L.read("rosters/rosters_p04.csv"), "ANA-f2"), "BOS"); // built from p03, which already has the trade
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});

test("asking for a period other than the one that can be materialized is refused", () => {
  const L = league();
  try {
    const r = L.materialize(SEASON, "9");
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /Can only materialize period 3/);
    assert.equal(L.exists("rosters/rosters_p03.csv"), false);
    assert.equal(L.materialize(SEASON, "3").status, 0);
  } finally { rmSync(L.dir, { recursive: true, force: true }); }
});
