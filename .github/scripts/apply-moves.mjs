// Roster moves for the NEXT period.
//
//   node apply-moves.mjs                       validate $MOVES (JSON) and store it in
//                                              src/data/static/<season>/moves/moves_pNN.json
//   node apply-moves.mjs materialize [season] [period]
//                                              write rosters_pNN.csv = previous roster + stored moves, then the accepted trades in
//                                              src/data/static/<season>/trades/trades_pNN.json (see record-trades.mjs); traded
//                                              picks are rewritten in the draft_picks.csv files
//
// $MOVES = {season, period, team, promote:[playerId], demote:[playerId]}
//   promote = reserve -> active, demote = active -> reserve (relative to the latest roster file)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { csvParse } from "d3-dsv";
import { applyTrades, updatePicksText } from "./trades-lib.mjs";

const root = "src/data/static";
const read = (p) => csvParse(readFileSync(p, "utf-8").replace(/^﻿/, ""));
const pad = (n) => String(n).padStart(2, "0");
const fail = (msg) => { console.error(`::error::${msg}`); process.exit(1); };
const pos = (p) => ({ G: "G", D: "D" }[(p || "").toUpperCase()] || "F");

const currentSeason = () => read(`${root}/seasons.csv`).find((s) => s.current === "true")?.season;
const latestRosterPeriod = (season) =>
  Math.max(...readdirSync(`${root}/${season}/rosters`).map((f) => /^rosters_p(\d+)\.csv$/.exec(f)?.[1]).filter(Boolean).map(Number));
const movesPath = (season, period) => `${root}/${season}/moves/moves_p${pad(period)}.json`;
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
  const count = (p) => active.filter((r) => pos(playerInfo.find((i) => i.ID === r.ID)?.Pos) === p).length;
  const [d, g] = [count("D"), count("G")];
  const problems = [];
  if (active.length !== 20) problems.push(`${active.length} active players (need exactly 20)`);
  if (d < 6 || d > 7) problems.push(`${d} defensemen (need 6-7)`);
  if (g !== 2) problems.push(`${g} goalies (need exactly 2)`);
  if (problems.length) throw new Error(`Illegal roster for ${team}: ${problems.join("; ")}`);
  return [...byId.values()];
}

const [mode, a1, a2] = process.argv.slice(2);

if (mode === "materialize") {
  const season = a1 || currentSeason();
  const base = latestRosterPeriod(season);
  const period = a2 ? Number(a2) : base + 1;
  if (period !== base + 1) fail(`Can only materialize period ${base + 1}`);
  const baseRows = read(`${root}/${season}/rosters/rosters_p${pad(base)}.csv`);
  const playerInfo = read(`${root}/${season}/player_info.csv`);
  const moves = loadMoves(season, period);
  const changed = new Map();
  for (const [team, m] of Object.entries(moves)) {
    try { for (const r of applyToTeam(baseRows, team, m.promote, m.demote, playerInfo)) changed.set(r.ID + "|" + r.ABBR, r.RESERVE); }
    catch (e) { console.warn(`Skipping invalid moves for ${team}: ${e.message}`); }
  }
  const rows = baseRows.map((r) => ({ ID: r.ID, ABBR: r.ABBR, RESERVE: changed.get(r.ID + "|" + r.ABBR) ?? r.RESERVE }));

  // Trades come AFTER the moves: each GM set their lineup against the roster they could see, and a traded player
  // keeps whatever active/reserve designation they have.
  const tradesFile = tradesPath(season, period);
  let tradeSummary = "";
  if (existsSync(tradesFile)) {
    const stored = JSON.parse(readFileSync(tradesFile, "utf-8"));
    const trades = stored.trades ?? [];
    const pickSeasons = [...new Set(trades.flatMap((t) => [...(t.give?.picks ?? []), ...(t.get?.picks ?? [])].map((p) => p.season)))];
    const picksBySeason = new Map(pickSeasons.map((s) => [s, new Map(existsSync(`${root}/${s}/draft_picks.csv`) ? read(`${root}/${s}/draft_picks.csv`).map((r) => [r.PICK, r.OWNER]) : [])]));
    const before = new Map([...picksBySeason].map(([s, m]) => [s, new Map(m)]));

    const { applied, skipped } = applyTrades(rows, trades, picksBySeason);
    for (const { id, reason } of skipped) console.warn(`::warning::Trade ${id} NOT applied: ${reason}`);

    for (const [s, owners] of picksBySeason) {
      const moved = new Map([...owners].filter(([pick, owner]) => before.get(s).get(pick) !== owner));
      const f = `${root}/${s}/draft_picks.csv`;
      if (moved.size && existsSync(f)) writeFileSync(f, updatePicksText(readFileSync(f, "utf-8"), moved));
    }
    writeFileSync(tradesFile, JSON.stringify({ ...stored, trades }, null, 2) + "\n");
    tradeSummary = `; trades: ${applied.length} applied, ${skipped.length} skipped`;
  }

  const lines = ["ID,ABBR,RESERVE", ...rows.map((r) => `${r.ID},${r.ABBR},${r.RESERVE}`)];
  writeFileSync(`${root}/${season}/rosters/rosters_p${pad(period)}.csv`, lines.join("\n") + "\n");
  console.log(`Wrote rosters_p${pad(period)}.csv with moves for ${Object.keys(moves).length} team(s)${tradeSummary}`);
} else {
  const m = JSON.parse(process.env.MOVES || fail("MOVES env var missing"));
  const season = currentSeason();
  const base = latestRosterPeriod(season);
  const arr = (x) => (Array.isArray(x) ? x.map(String) : fail("promote/demote must be arrays"));
  const [promote, demote] = [arr(m.promote), arr(m.demote)];
  if (m.season !== season) fail(`Season ${m.season} is not the current season`);
  if (Number(m.period) !== base + 1) fail(`Moves are for period ${m.period} but the next period is ${base + 1} (stale page?)`);
  try {
    applyToTeam(read(`${root}/${season}/rosters/rosters_p${pad(base)}.csv`), m.team, promote, demote, read(`${root}/${season}/player_info.csv`));
  } catch (e) { fail(e.message); }
  const all = loadMoves(season, base + 1);
  all[m.team] = { promote, demote, submittedAt: new Date().toISOString() };
  mkdirSync(`${root}/${season}/moves`, { recursive: true });
  writeFileSync(movesPath(season, base + 1), JSON.stringify(all, null, 2) + "\n");
  console.log(`Stored moves for ${m.team}, period ${base + 1}: +${promote.length} / -${demote.length}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `team=${m.team}\nperiod=${pad(base + 1)}\n`, { flag: "a" });
}
