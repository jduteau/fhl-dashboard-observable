// Roster moves for the NEXT period.
//
//   node apply-moves.mjs                       validate $MOVES (JSON) and store it in
//                                              src/data/static/<season>/moves/moves_pNN.json
//   node apply-moves.mjs materialize [season] [period]
//                                              (safe to run again: see below)
//                                              write rosters_pNN.csv = previous roster + the agreed trades in
//                                              src/data/static/<season>/transactions/transactions_pNN.json (waivers, then FA signings;
//                                              see record-transactions.mjs; signings also get a contracts.csv row), then the agreed trades in
//                                              src/data/static/<season>/trades/trades_pNN.json (see record-trades.mjs; traded picks
//                                              are rewritten in the draft_picks.csv files) + the stored moves.
//                                              If $REPORT_FILE is set, the league report (trades, moves, signings, waivers; see
//                                              league-report-lib.mjs) is also written there as JSON {subject, message}; the
//                                              workflow emails it once the commit is pushed.
//
// $MOVES = {season, period, team, promote:[playerId], demote:[playerId]}
//   promote = reserve -> active, demote = active -> reserve, relative to the latest roster file AFTER the recorded
//   transactions and agreed trades for the next period have been applied (traded players keep their status until their new GM changes it)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { csvParse } from "d3-dsv";
import { applyTrades, updatePicksText, reconcileMoves, materializeTarget, revertAppliedPicks } from "./trades-lib.mjs";
import { upsertContractRows } from "./transactions-lib.mjs";
import { applyTransactions } from "../../src/components/transactionRules.js";
import { lineupProblems, mapPosition } from "../../src/components/leagueRules.js";
import { buildLeagueReport } from "./league-report-lib.mjs";

const root = "src/data/static";
const read = (p) => csvParse(readFileSync(p, "utf-8").replace(/^﻿/, ""));
const pad = (n) => String(n).padStart(2, "0");
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };

const currentSeason = () => read(`${root}/seasons.csv`).find((s) => s.current === "true")?.season;
const periodsIn = (dir, prefix) =>
  existsSync(dir) ? readdirSync(dir).map((f) => new RegExp(`^${prefix}_p(\\d+)\\.csv$`).exec(f)?.[1]).filter(Boolean).map(Number) : [];
const rosterPeriods = (season) => periodsIn(`${root}/${season}/rosters`, "rosters");
const statsPeriods = (season) => periodsIn(`${root}/${season}/stats`, "stats");
const latestRosterPeriod = (season) => Math.max(...rosterPeriods(season));
const movesPath = (season, period) => `${root}/${season}/moves/moves_p${pad(period)}.json`;
const transactionsPath = (season, period) => `${root}/${season}/transactions/transactions_p${pad(period)}.json`;
const tradesPath = (season, period) => `${root}/${season}/trades/trades_p${pad(period)}.json`;
const loadMoves = (season, period) => (existsSync(movesPath(season, period)) ? JSON.parse(readFileSync(movesPath(season, period), "utf-8")) : {});

// Returns the new full roster after applying one team's moves to its base roster, or throws.
function applyToTeam(base, team, promote, demote, playerInfo) {
  const roster = base.filter((r) => r.ABBR === team);
  if (!roster.length) throw new Error(`No roster found for ${team}`);
  const byId = new Map(roster.map((r) => [r.ID, { ...r }]));
  const dup = promote.filter((id) => demote.includes(id));
  if (dup.length) throw new Error(`Player in both promote and demote: ${dup}`);
  for (const id of promote) {
    if (byId.get(id)?.RESERVE !== "R") throw new Error(`${id} is not a reserve player on ${team}`);
    byId.get(id).RESERVE = "";
  }
  for (const id of demote) {
    const r = byId.get(id);
    if (!r || r.RESERVE === "R") throw new Error(`${id} is not an active player on ${team}`);
    r.RESERVE = "R";
  }
  const active = [...byId.values()].filter((r) => r.RESERVE !== "R" && r.RESERVE !== "N/A");
  const count = (p) => active.filter((r) => mapPosition(playerInfo.find((i) => i.ID === r.ID)?.Pos) === p).length;
  const problems = lineupProblems({ total: active.length, defensemen: count("D"), goalies: count("G") });
  if (problems.length) throw new Error(`Illegal roster for ${team}: ${problems.map((p) => p.message).join("; ")}`);
  return [...byId.values()];
}

// The trades agreed for `period` (fresh copies each call, since applying them annotates the trade objects) and the
// pick ownership they refer to.
function loadTrades(season, period) {
  const file = tradesPath(season, period);
  if (!existsSync(file)) return null;
  const stored = JSON.parse(readFileSync(file, "utf-8"));
  const trades = stored.trades ?? [];
  const pickSeasons = [...new Set(trades.flatMap((t) => [...(t.give?.picks ?? []), ...(t.get?.picks ?? [])].map((p) => p.season)))];
  const picksBySeason = new Map(pickSeasons.map((s) => [s, new Map(existsSync(`${root}/${s}/draft_picks.csv`) ? read(`${root}/${s}/draft_picks.csv`).map((r) => [r.PICK, r.OWNER]) : [])]));
  return { file, stored, trades, picksBySeason };
}

// The recorded free-agent signings / waiver cuts for `period` (null if there are none).
function loadTransactions(season, period) {
  const file = transactionsPath(season, period);
  if (!existsSync(file)) return null;
  const stored = JSON.parse(readFileSync(file, "utf-8"));
  return { file, stored, transactions: stored.transactions ?? [] };
}

// The latest roster with the recorded transactions and agreed trades for `period` applied (players only; nothing is
// written).
function postTradeRows(baseRows, season, period) {
  const rows = baseRows.map((r) => ({ ID: r.ID, ABBR: r.ABBR, RESERVE: r.RESERVE }));
  const x = loadTransactions(season, period);
  if (x) applyTransactions(rows, x.transactions);
  const t = loadTrades(season, period);
  if (t) applyTrades(rows, t.trades, t.picksBySeason);
  return rows;
}

const [mode, a1, a2] = process.argv.slice(2);

if (mode === "materialize") {
  const season = a1 || currentSeason();
  // The period to write: normally the one after the latest roster; if that latest roster is for a period that has not
  // started yet (an earlier run's output), it is rebuilt from the roster before it, so running again is safe and picks
  // up trades agreed and moves submitted since.
  const { period: target, base, regenerate } = materializeTarget(rosterPeriods(season), statsPeriods(season));
  const period = a2 ? Number(a2) : target;
  if (period !== target) fail(`Can only materialize period ${target}`);
  if (regenerate) console.log(`rosters_p${pad(period)}.csv already exists and period ${period} has not started: regenerating it from rosters_p${pad(base)}.csv`);
  const baseRows = read(`${root}/${season}/rosters/rosters_p${pad(base)}.csv`);
  const playerInfo = read(`${root}/${season}/player_info.csv`);
  const rows = baseRows.map((r) => ({ ID: r.ID, ABBR: r.ABBR, RESERVE: r.RESERVE }));

  // 0. Waived players leave their team, signed free agents join in reserve (with a new contract): the order FHL Trader
  //    uses. Trades come next, so a player signed this period can be traded on.
  let transactionSummary = "";
  let reportTransactions = [];
  let reportTrades = [];
  const reportMoves = [];
  const x = loadTransactions(season, period);
  if (x) {
    const { applied, skipped } = applyTransactions(rows, x.transactions);
    for (const { id, reason } of skipped) console.warn(`::warning::Transaction ${id} NOT applied: ${reason}`);
    writeFileSync(x.file, JSON.stringify({ ...x.stored, transactions: x.transactions }, null, 2) + "\n");
    const signed = x.transactions.filter((t) => t.type === "sign" && !t.skipped).map((t) => ({ ID: t.player, Salary: t.salary, Contract: t.contract }));
    const contractsFile = `${root}/${season}/contracts.csv`;
    if (signed.length) writeFileSync(contractsFile, upsertContractRows(readFileSync(contractsFile, "utf-8"), signed, period));
    reportTransactions = x.transactions.filter((t) => !t.skipped);
    transactionSummary = `; transactions: ${applied.length} applied, ${skipped.length} skipped`;
  }

  // 1. Agreed trades: players change team (keeping their active/reserve status) and traded picks change owner.
  //    GMs set their lineups against this post-trade roster (see the Roster page), so moves are applied after.
  let tradeSummary = "";
  const t = loadTrades(season, period);
  if (t) {
    const before = new Map([...t.picksBySeason].map(([s, m]) => [s, new Map(m)]));
    // Picks moved by an earlier run are already in draft_picks.csv: hand them back first so the trades apply from the
    // same starting point every time (the roster itself is rebuilt from the previous period's file)
    revertAppliedPicks(t.trades, t.picksBySeason);
    const { applied, skipped } = applyTrades(rows, t.trades, t.picksBySeason);
    for (const { id, reason } of skipped) console.warn(`::warning::Trade ${id} NOT applied: ${reason}`);
    for (const [s, owners] of t.picksBySeason) {
      const moved = new Map([...owners].filter(([pick, owner]) => before.get(s).get(pick) !== owner));
      const f = `${root}/${s}/draft_picks.csv`;
      if (moved.size && existsSync(f)) writeFileSync(f, updatePicksText(readFileSync(f, "utf-8"), moved));
    }
    writeFileSync(t.file, JSON.stringify({ ...t.stored, trades: t.trades }, null, 2) + "\n");
    reportTrades = t.trades.filter((tr) => !tr.skipped);
    tradeSummary = `; trades: ${applied.length} applied, ${skipped.length} skipped`;
  }

  // 2. Each team's roster moves, validated against the post-trade roster.
  const moves = loadMoves(season, period);
  const changed = new Map();
  for (const [team, m] of Object.entries(moves)) {
    // A trade agreed after the GM submitted can leave moves that name players who are no longer theirs; drop those.
    const { promote, demote, dropped } = reconcileMoves(rows, team, m.promote, m.demote);
    if (dropped.length) console.warn(`::warning::${team}: ignored moves for ${dropped.join(", ")} (no longer on their roster or already changed by a trade); the GM should re-check their lineup`);
    try {
      for (const r of applyToTeam(rows, team, promote, demote, playerInfo)) changed.set(r.ID + "|" + r.ABBR, r.RESERVE);
      reportMoves.push({ team, promote, demote });
    }
    catch (e) { console.warn(`::warning::Skipping invalid moves for ${team}: ${e.message}`); }
  }
  for (const r of rows) r.RESERVE = changed.get(r.ID + "|" + r.ABBR) ?? r.RESERVE;

  const lines = ["ID,ABBR,RESERVE", ...rows.map((r) => `${r.ID},${r.ABBR},${r.RESERVE}`)];
  writeFileSync(`${root}/${season}/rosters/rosters_p${pad(period)}.csv`, lines.join("\n") + "\n");
  if (process.env.REPORT_FILE) {
    const periodStart = existsSync(`${root}/${season}/periods.csv`) ? read(`${root}/${season}/periods.csv`).find((p) => Number(p.period) === period)?.start : undefined;
    const report = buildLeagueReport({
      season, period, periodStart, trades: reportTrades, moves: reportMoves, transactions: reportTransactions,
      info: new Map(playerInfo.map((i) => [i.ID, i])), mapPos: mapPosition,
    });
    writeFileSync(process.env.REPORT_FILE, JSON.stringify(report));
  }
  console.log(`Wrote rosters_p${pad(period)}.csv with moves for ${Object.keys(moves).length} team(s)${transactionSummary}${tradeSummary}`);
} else {
  const m = JSON.parse(process.env.MOVES || fail("MOVES env var missing"));
  const season = currentSeason();
  const base = latestRosterPeriod(season);
  const arr = (x) => (Array.isArray(x) ? x.map(String) : fail("promote/demote must be arrays"));
  const [promote, demote] = [arr(m.promote), arr(m.demote)];
  if (m.season !== season) fail(`Season ${m.season} is not the current season`);
  if (Number(m.period) !== base + 1) fail(`Moves are for period ${m.period} but the next period is ${base + 1} (stale page?)`);
  try {
    // Validate against the roster as it will be after the agreed trades, which is what the GM sees on the Roster page.
    const postTrade = postTradeRows(read(`${root}/${season}/rosters/rosters_p${pad(base)}.csv`), season, base + 1);
    applyToTeam(postTrade, m.team, promote, demote, read(`${root}/${season}/player_info.csv`));
  } catch (e) { fail(e.message); }
  const all = loadMoves(season, base + 1);
  all[m.team] = { promote, demote, submittedAt: new Date().toISOString() };
  mkdirSync(`${root}/${season}/moves`, { recursive: true });
  writeFileSync(movesPath(season, base + 1), JSON.stringify(all, null, 2) + "\n");
  console.log(`Stored moves for ${m.team}, period ${base + 1}: +${promote.length} / -${demote.length}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `team=${m.team}\nperiod=${pad(base + 1)}\n`, { flag: "a" });
}
