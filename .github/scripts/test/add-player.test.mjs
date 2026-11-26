// Run with: node --test .github/scripts/test/add-player.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { findHockeyRefId, findHockeyDbId } from "../player-lookup-lib.mjs";

const script = new URL("../add-player.mjs", import.meta.url).pathname;
const stub = new URL("./stub-fetch.mjs", import.meta.url).pathname;
const HEADER = "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia";
const TOR = "haymelu01,Luke Haymes,2003-07-28,F,TOR,248919,luke-haymes";
const hrPage = (born) => `<span id="necro-birth" data-birth="${born}">x</span>`;
const HR = (id) => `https://www.hockey-reference.com/players/${id[0]}/${id}.html`;
const DB = "https://www.hockeydb.com/ihdb/stats/find_player.php?full_name=Joe%20Smith";
const player = { Name: "Joe Smith", BirthDate: "2005-01-02", Pos: "D", NHL: "TOR", first: "Joe", last: "Smith" };

const run = (p, pages, rows = [TOR]) => {
  const dir = mkdtempSync(join(tmpdir(), "addplayer-"));
  mkdirSync(join(dir, "src/data/static/2026-27"), { recursive: true });
  writeFileSync(join(dir, "src/data/static/seasons.csv"), "season,label,current\n2026-27,2026-27,true\n");
  writeFileSync(join(dir, "src/data/static/2026-27/player_info.csv"), [HEADER, ...rows].join("\n"));
  const r = spawnSync("node", ["--import", stub, script], {
    cwd: dir, encoding: "utf-8",
    env: { ...process.env, MIN_DELAY_MS: "0", JITTER_MS: "0", STUB_PAGES: JSON.stringify(pages), ADD_PLAYER: JSON.stringify({ season: "2026-27", player: p }) },
  });
  return { status: r.status, out: r.stdout + r.stderr, csv: readFileSync(join(dir, "src/data/static/2026-27/player_info.csv"), "utf-8") };
};

test("adds the player under his Hockey-Reference id, with the HockeyDB id", () => {
  const r = run(player, { [HR("smithjo01")]: { body: hrPage("2005-01-02") }, [DB]: { url: "https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid=555" } });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.csv, `${HEADER}\n${TOR}\nsmithjo01,Joe Smith,2005-01-02,D,TOR,555,joe-smith`);
});

test("takes the next Hockey-Reference id when an older namesake has the first", () => {
  const r = run(player, { [HR("smithjo01")]: { body: hrPage("1980-05-05") }, [HR("smithjo02")]: { body: hrPage("2005-01-02") } });
  assert.equal(r.status, 0, r.out);
  assert.match(r.csv, /\nsmithjo02,Joe Smith,2005-01-02,D,TOR,,joe-smith$/); // HockeyDB not found: blank, back-filled later
});

test("no Hockey-Reference page: fails and writes nothing", () => {
  const r = run(player, {});
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Could not find Joe Smith/);
  assert.equal(r.csv, `${HEADER}\n${TOR}`);
});

test("a player already listed is not added twice; bad input fails the run", () => {
  const dup = run(player, {}, [TOR, "smithjo01,Joe Smith,2005-01-02,D,TOR,,x"]);
  assert.equal(dup.status, 0);
  assert.equal(dup.csv.split("\n").length, 3);
  assert.notEqual(run({ ...player, Pos: "X" }, {}).status, 0);
});

test("findHockeyRefId gives up when the site will not answer; findHockeyDbId tells namesakes apart by birth year", async () => {
  assert.equal(await findHockeyRefId({ first: "Joe", last: "Smith", birthDate: "2005-01-02" }, async () => null, () => {}), null);
  const body = `<tr data-status='a'><a href="pdisplay.php?pid=1"><td class='col-yob'>1990</td></tr><tr data-status='b'><a href="pdisplay.php?pid=2"><td class='col-yob'>2005</td></tr>`;
  assert.equal(await findHockeyDbId("Joe Smith", "2005-01-02", async () => ({ url: "https://x/find_player.php", body }), () => {}), "2");
});
