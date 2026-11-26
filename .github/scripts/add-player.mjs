// Adds a player the commissioner entered (sent by the Worker as an `add-player` dispatch) to
//   src/data/static/<season>/player_info.csv
// The Worker already found the birth date, position and NHL team; this finds the Hockey-Reference id (the row's ID) and the
// HockeyDB id. Without a Hockey-Reference page the run fails and nothing is written: a made-up ID would never match the stats.
//
// $ADD_PLAYER = {season, player: {Name, BirthDate, Pos, NHL, first, last}}
import { readFileSync, writeFileSync } from "fs";
import { csvParse } from "../../src/components/csv.js";
import { appendPlayers } from "./player-info-lib.mjs";
import { cleanNewPlayer, isDuplicatePlayer } from "../../src/components/playerRules.js";
import { createPoliteGet, findHockeyRefId, findHockeyDbId } from "./player-lookup-lib.mjs";

const log = (...a) => console.log("[add-player]", ...a);
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };
const payload = JSON.parse(process.env.ADD_PLAYER || fail("ADD_PLAYER env var missing"));

const root = "src/data/static";
const season = csvParse(readFileSync(`${root}/seasons.csv`, "utf-8")).find((s) => s.current === "true")?.season;
if (!season) fail("No current season in seasons.csv");
if (payload.season !== season) fail(`Season ${payload.season} is not the current season (${season})`);

const path = `${root}/${season}/player_info.csv`;
const text = readFileSync(path, "utf-8");
const info = csvParse(text);

const p = payload.player ?? {};
let row;
try { row = cleanNewPlayer({ name: p.Name, birthDate: p.BirthDate, pos: p.Pos, nhl: p.NHL }, new Set(info.map((r) => r.NHL))); } catch (e) { fail(e.message); }
if (isDuplicatePlayer(info, row)) { log(`${row.Name} is already in player_info.csv; nothing to do`); process.exit(0); }
if (typeof p.first !== "string" || typeof p.last !== "string") fail("The first and last name are missing");

const get = createPoliteGet({
  minDelayMs: Number(process.env.MIN_DELAY_MS ?? 6000), jitterMs: Number(process.env.JITTER_MS ?? 4000), log: (...a) => log(...a),
});
const id = await findHockeyRefId({ first: p.first, last: p.last, birthDate: row.BirthDate }, get, log);
if (!id) fail(`Could not find ${row.Name} (born ${row.BirthDate}) on Hockey-Reference, so he was not added. Check the name, or add him by hand to player_info.csv`);
if (info.some((r) => r.ID === id)) { log(`${id} is already in player_info.csv; nothing to do`); process.exit(0); }
row.ID = id;
row.HockeyDB = (await findHockeyDbId(row.Name, row.BirthDate, get, log)) ?? ""; // blank is fine: update-player-info.mjs back-fills it daily

writeFileSync(path, appendPlayers(text, [row]));
log(`Added ${row.Name} as ${row.ID} (${row.Pos}, ${row.NHL}, HockeyDB ${row.HockeyDB || "not found yet"})`);
