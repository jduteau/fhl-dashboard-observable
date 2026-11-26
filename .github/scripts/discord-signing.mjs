// Records the free-agent signings announced on Discord (sent by the Worker, worker/discord-signings.js, as a `discord-signing`
// dispatch, one per message). For each line: finds the player in player_info.csv (by HockeyDB id, else by name), adds him there
// first if he is missing (NHL lookup + Hockey-Reference id, like add-player.mjs), then records a `sign` transaction for the next
// period (like record-transactions.mjs). Lines that cannot be handled are reported and the run fails AFTER the good ones were
// written, so one odd line never blocks the rest.
//
// $DISCORD_SIGNING = {season, messageId, at, signings: [{team, name, hockeyDb, salary, contract}]}
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { createHash } from "crypto";
import { csvParse } from "../../src/components/csv.js";
import { appendPlayers, setHockeyDbId } from "./player-info-lib.mjs";
import { changeTransactions } from "./transactions-lib.mjs";
import { cleanNewPlayer, lookupNhlPlayer, isDuplicatePlayer } from "../../src/components/playerRules.js";
import { createPoliteGet, findHockeyRefId, findHockeyDbId } from "./player-lookup-lib.mjs";

const log = (...a) => console.log("[discord-signing]", ...a);
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };
const payload = JSON.parse(process.env.DISCORD_SIGNING || fail("DISCORD_SIGNING env var missing"));

const root = "src/data/static";
const pad = (n) => String(n).padStart(2, "0");
const read = (p) => csvParse(readFileSync(p, "utf-8").replace(/^﻿/, ""));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

const season = read(`${root}/seasons.csv`).find((s) => s.current === "true")?.season;
if (!season) fail("No current season in seasons.csv");
if (payload.season !== season) fail(`Season ${payload.season} is not the current season (${season})`);
const latest = Math.max(...readdirSync(`${root}/${season}/rosters`).map((f) => /^rosters_p(\d+)\.csv$/.exec(f)?.[1]).filter(Boolean).map(Number));
const teams = new Set(read(`${root}/${season}/owners.csv`).map((o) => o.ABBR));
const base = read(`${root}/${season}/rosters/rosters_p${pad(latest)}.csv`);

const infoPath = `${root}/${season}/player_info.csv`;
let infoText = readFileSync(infoPath, "utf-8");
let info = csvParse(infoText);
const reload = () => { info = csvParse(infoText); };

const txDir = `${root}/${season}/transactions`;
const txFile = `${txDir}/transactions_p${pad(latest + 1)}.json`;
let transactions = existsSync(txFile) ? JSON.parse(readFileSync(txFile, "utf-8")).transactions ?? [] : [];

const get = createPoliteGet({ minDelayMs: Number(process.env.MIN_DELAY_MS ?? 6000), jitterMs: Number(process.env.JITTER_MS ?? 4000), log });
async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`The NHL lookup failed (HTTP ${res.status})`);
  return res.json();
}

// The deterministic id makes a repeated dispatch of the same message a no-op
const txId = (s) => { const h = createHash("sha1").update(`${payload.messageId}|${s.team}|${s.hockeyDb}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

// The player_info.csv ID for this line, adding the player (and filling in his HockeyDB id) when needed.
async function resolvePlayer(s) {
  const byDb = info.filter((r) => r.HockeyDB === s.hockeyDb);
  if (byDb.length === 1) return byDb[0].ID;
  if (byDb.length > 1) throw new Error(`HockeyDB id ${s.hockeyDb} is on several rows of player_info.csv`);
  const byName = info.filter((r) => norm(r.Name) === norm(s.name));
  if (byName.length > 1) throw new Error(`Several players named ${s.name} are in player_info.csv and none has HockeyDB id ${s.hockeyDb}; fix by hand`);
  if (byName.length === 1) {
    const r = byName[0];
    if (r.HockeyDB && r.HockeyDB !== s.hockeyDb) throw new Error(`${s.name} is in player_info.csv with HockeyDB id ${r.HockeyDB}, not ${s.hockeyDb}; is this a different player?`);
    infoText = setHockeyDbId(infoText, r.ID, s.hockeyDb); // blank so far: record it
    reload();
    return r.ID;
  }
  const found = await lookupNhlPlayer(s.name, fetchJson);
  const row = cleanNewPlayer(found, new Set(info.map((r) => r.NHL)));
  if (isDuplicatePlayer(info, row)) throw new Error(`${row.Name} (born ${row.BirthDate}) is in player_info.csv under another spelling; fix by hand`);
  const id = await findHockeyRefId({ first: found.first, last: found.last, birthDate: row.BirthDate }, get, log);
  if (!id) throw new Error(`Could not find ${row.Name} (born ${row.BirthDate}) on Hockey-Reference, so he was not added`);
  if (info.some((r) => r.ID === id)) throw new Error(`${id} is already in player_info.csv under a different name; fix by hand`);
  row.ID = id;
  row.HockeyDB = s.hockeyDb;
  infoText = appendPlayers(infoText, [row]);
  reload();
  log(`Added ${row.Name} as ${id} (${row.Pos}, ${row.NHL})`);
  return id;
}

const failures = [];
let n = 0;
for (const s of payload.signings ?? []) {
  const label = `${s.team} ${s.name}`;
  try {
    if (!teams.has(s.team)) throw new Error(`${s.team} is not a team`);
    const player = await resolvePlayer(s);
    const at = new Date(Date.parse(payload.at) + n++).toISOString();
    const result = changeTransactions(transactions, { add: [{ id: txId(s), type: "sign", team: s.team, player, salary: s.salary, contract: s.contract, at }] }, base);
    transactions = result.transactions;
    log(result.changed ? `Signed ${s.name} (${player}) to ${s.team}: ${s.salary} ${s.contract}` : `${label}: already recorded`);
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    console.error(`::error::Discord signing not recorded - ${label}: ${e.message}`);
  }
}

writeFileSync(infoPath, infoText);
if (transactions.length) {
  mkdirSync(txDir, { recursive: true });
  writeFileSync(txFile, JSON.stringify({ transactions }, null, 2) + "\n");
}
if (failures.length) process.exit(1);
