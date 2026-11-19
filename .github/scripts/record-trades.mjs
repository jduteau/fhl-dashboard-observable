// Records trades that both GMs accepted (sent by the Worker as a `trade-approved` dispatch) in
//   src/data/static/<season>/trades/trades_pNN.json   (pNN = the period whose roster they take effect in)
//
// $TRADES = {season, period, trades: [{id, from, to, give, get, acceptedAt}]}
// The Worker sends ALL accepted trades for that period every time, and trades are merged by id, so a run that
// GitHub cancels (it keeps only one queued run per concurrency group) can't lose a trade.
// The trades are applied to the rosters / draft picks later by `apply-moves.mjs materialize`.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { mergeTrades } from "./trades-lib.mjs";

const root = "src/data/static";
const pad = (n) => String(n).padStart(2, "0");
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };

// seasons.csv is tiny, so parse it by hand and keep this workflow free of `npm ci`.
const [head, ...body] = readFileSync(`${root}/seasons.csv`, "utf-8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.split(","));
const season = body.find((r) => r[head.indexOf("current")] === "true")?.[head.indexOf("season")];
if (!season) fail("No current season in seasons.csv");

const payload = JSON.parse(process.env.TRADES || fail("TRADES env var missing"));
const latest = Math.max(...readdirSync(`${root}/${season}/rosters`).map((f) => /^rosters_p(\d+)\.csv$/.exec(f)?.[1]).filter(Boolean).map(Number));
if (payload.season !== season) fail(`Season ${payload.season} is not the current season (${season})`);
if (Number(payload.period) !== latest + 1) fail(`Trades are for period ${payload.period} but the next period is ${latest + 1} (it may already have started)`);
if (!Array.isArray(payload.trades)) fail("trades must be an array");

const dir = `${root}/${season}/trades`;
const file = `${dir}/trades_p${pad(latest + 1)}.json`;
const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")).trades ?? [] : [];
let merged;
try { merged = mergeTrades(existing, payload.trades); } catch (e) { fail(e.message); }

if (!merged.added.length) {
  console.log(`No new trades (${existing.length} already recorded for period ${latest + 1})`);
} else {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ trades: merged.trades }, null, 2) + "\n");
  console.log(`Recorded ${merged.added.length} new trade(s) for period ${latest + 1}: ${merged.added.join(", ")}`);
}
