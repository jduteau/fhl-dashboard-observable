// Run with: node --test .github/scripts/test/discord-signing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseSignings } from "../../../src/components/signingRules.js";

const script = new URL("../discord-signing.mjs", import.meta.url).pathname;
const stub = new URL("./stub-fetch.mjs", import.meta.url).pathname;
const HEADER = "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia";
const ROWS = ["kiersma01,Matt Kiersted,1998-04-14,D,MIN,181781,matt-kiersted", "kiiskje01,Jesse Kiiskinen,2005-08-23,RW,DET,,jesse-kiiskinen", "haymelu01,Luke Haymes,2003-07-28,F,TOR,248919,luke-haymes"];
const MESSAGE = `Wed Nov 25 21:00:40 EST 2026

\`\`\`
CAR Matt Kiersted             D  181781   1 C-27
PHI Jesse Kiiskinen           F  262778   1 C-27
LAK Joe Smith                 D  555      3 C-27
\`\`\`
3 players signed`;

test("parses the announcement lines and ignores the rest", () => {
  assert.deepEqual(parseSignings(MESSAGE).map((s) => [s.team, s.name, s.hockeyDb, s.salary, s.contract]),
    [["CAR", "Matt Kiersted", "181781", 1, "C-27"], ["PHI", "Jesse Kiiskinen", "262778", 1, "C-27"]].concat([["LAK", "Joe Smith", "555", 3, "C-27"]]));
  assert.deepEqual(parseSignings("hello\n4 players signed"), []);
});

const run = (signings, pages = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "discordsigning-"));
  const season = join(dir, "src/data/static/2026-27");
  mkdirSync(join(season, "rosters"), { recursive: true });
  writeFileSync(join(dir, "src/data/static/seasons.csv"), "season,label,current\n2026-27,2026-27,true\n");
  writeFileSync(join(season, "player_info.csv"), [HEADER, ...ROWS].join("\n"));
  writeFileSync(join(season, "owners.csv"), "ABBR,OWNER,LOCATION\nCAR,a,b\nPHI,a,b\nLAK,a,b\n");
  writeFileSync(join(season, "rosters/rosters_p03.csv"), "ID,ABBR,RESERVE\nhaymelu01,CAR,\n");
  const payload = { season: "2026-27", messageId: "100", at: "2026-11-26T02:00:40.000Z", signings };
  const r = spawnSync("node", ["--import", stub, script], {
    cwd: dir, encoding: "utf-8",
    env: { ...process.env, MIN_DELAY_MS: "0", JITTER_MS: "0", STUB_PAGES: JSON.stringify(pages), DISCORD_SIGNING: JSON.stringify(payload) },
  });
  const tx = (() => { try { return JSON.parse(readFileSync(join(season, "transactions/transactions_p04.json"), "utf-8")).transactions; } catch { return []; } })();
  return { status: r.status, out: r.stdout + r.stderr, tx, csv: readFileSync(join(season, "player_info.csv"), "utf-8") };
};
const sign = (team, name, hockeyDb) => ({ team, name, hockeyDb, salary: 1, contract: "C-27" });

test("records a signing for the next period and back-fills a blank HockeyDB id", () => {
  const r = run([sign("CAR", "Matt Kiersted", "181781"), sign("PHI", "Jesse Kiiskinen", "262778")]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.tx.map((t) => [t.type, t.team, t.player, t.salary, t.contract]), [["sign", "CAR", "kiersma01", 1, "C-27"], ["sign", "PHI", "kiiskje01", 1, "C-27"]]);
  assert.match(r.csv, /kiiskje01,Jesse Kiiskinen,2005-08-23,RW,DET,262778,jesse-kiiskinen/);
});

test("a line that cannot be handled fails the run but the other lines are still recorded", () => {
  const r = run([sign("XXX", "Matt Kiersted", "181781"), sign("PHI", "Jesse Kiiskinen", "262778"), sign("LAK", "Luke Haymes", "248919")]);
  assert.equal(r.status, 1);
  assert.match(r.out, /XXX is not a team/);
  assert.match(r.out, /already on CAR's roster/); // Haymes is rostered
  assert.deepEqual(r.tx.map((t) => t.player), ["kiiskje01"]);
});

test("a player missing from player_info.csv is looked up and added", () => {
  const r = run([sign("LAK", "Joe Smith", "555")], {
    "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=25&q=Joe%20Smith": { body: JSON.stringify([{ playerId: "7", name: "Joe Smith" }]) },
    "https://api-web.nhle.com/v1/player/7/landing": { body: JSON.stringify({ firstName: { default: "Joe" }, lastName: { default: "Smith" }, birthDate: "2005-01-02", position: "D", currentTeamAbbrev: "TOR" }) },
    "https://www.hockey-reference.com/players/s/smithjo01.html": { body: '<span id="necro-birth" data-birth="2005-01-02">x</span>' },
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.csv, /\nsmithjo01,Joe Smith,2005-01-02,D,TOR,555,joe-smith$/);
  assert.deepEqual(r.tx.map((t) => [t.team, t.player]), [["LAK", "smithjo01"]]);
});
