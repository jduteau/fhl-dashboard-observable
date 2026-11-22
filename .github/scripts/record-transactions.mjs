// Records the free-agent signings, waiver cuts and waiver claims the commissioner entered (sent by the Worker as a
// `transaction` dispatch, one batch per dispatch) in
//   src/data/static/<season>/transactions/transactions_pNN.json   (pNN = the period whose roster they take effect in)
//
// $TRANSACTION = {season, period, add?: [{id, type, team, player, salary?, contract?, from?, at}], remove?: [id]}
// They are applied to the rosters (and signings to contracts.csv) later by `apply-moves.mjs materialize`.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { csvParse } from "d3-dsv";
import { changeTransactions } from "./transactions-lib.mjs";

const root = "src/data/static";
const pad = (n) => String(n).padStart(2, "0");
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };
const read = (p) => csvParse(readFileSync(p, "utf-8").replace(/^﻿/, ""));

const season = read(`${root}/seasons.csv`).find((s) => s.current === "true")?.season;
if (!season) fail("No current season in seasons.csv");
const payload = JSON.parse(process.env.TRANSACTION || fail("TRANSACTION env var missing"));
const latest = Math.max(...readdirSync(`${root}/${season}/rosters`).map((f) => /^rosters_p(\d+)\.csv$/.exec(f)?.[1]).filter(Boolean).map(Number));
if (payload.season !== season) fail(`Season ${payload.season} is not the current season (${season})`);
if (Number(payload.period) !== latest + 1) fail(`Transaction is for period ${payload.period} but the next period is ${latest + 1} (it may already have started)`);

const dir = `${root}/${season}/transactions`;
const file = `${dir}/transactions_p${pad(latest + 1)}.json`;
const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")).transactions ?? [] : [];
const base = read(`${root}/${season}/rosters/rosters_p${pad(latest)}.csv`);
const known = new Set(read(`${root}/${season}/player_info.csv`).map((p) => p.ID));
for (const t of payload.add ?? []) if (!known.has(t?.player)) fail(`${t?.player} is not in player_info.csv`);

let result;
try { result = changeTransactions(existing, payload, base); } catch (e) { fail(e.message); }
if (!result.changed) {
  console.log("Nothing to change");
} else {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ transactions: result.transactions }, null, 2) + "\n");
  console.log(`Period ${latest + 1}: ${(payload.add ?? []).length} transaction(s) added, ${(payload.remove ?? []).length} removal(s) requested`);
}
