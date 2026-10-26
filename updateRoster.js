#!/usr/bin/env node
// Builds the next period's roster file from an FHL Trader transaction report.
//
// Usage: node updateRoster.js [fhl_trader.txt] [--dry-run]
//
// Reads the latest rosters_pNN.csv in ./current/rosters and writes rosters_p(NN+1).csv.
// Transactions are applied in this order: waived players, FA signings, trades, roster moves.
// Traded draft picks are updated in place in the current and next season's draft_picks.csv.
// FA signings also get a row in contracts.csv, effective from the new period.
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { csvParse } from "d3-dsv";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const traderFile = args.find(a => !a.startsWith("--")) || join(root, "fhl_trader.txt");

const seasonDir = realpathSync(join(root, "current"));
const nextSeasonDir = (() => {
  const m = basename(seasonDir).match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]) + 1;
  const dir = join(dirname(seasonDir), `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return existsSync(join(dir, "draft_picks.csv")) ? dir : null;
})();

const warnings = [];
const warn = msg => warnings.push(msg);
const stripBom = s => s.replace(/^﻿/, "");
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const readCsv = file => csvParse(stripBom(readFileSync(file, "utf-8")));
const writeCsv = (file, header, rows) =>
  writeFileSync(file, [header.join(","), ...rows.map(r => header.map(h => r[h] ?? "").join(","))].join("\r\n") + "\r\n");

// ---- load current roster ----
const rosterDir = join(seasonDir, "rosters");
const periods = readdirSync(rosterDir).map(f => f.match(/^rosters_p(\d+)\.csv$/)).filter(Boolean).map(m => Number(m[1]));
const latest = Math.max(...periods);
const pad = n => String(n).padStart(2, "0");
const roster = readCsv(join(rosterDir, `rosters_p${pad(latest)}.csv`)).map(r => ({ ID: r.ID, ABBR: r.ABBR, RESERVE: r.RESERVE }));
const outFile = join(rosterDir, `rosters_p${pad(latest + 1)}.csv`);

// ---- player lookup ----
const playerInfo = readCsv(join(seasonDir, "player_info.csv"));
const byName = new Map();
for (const p of playerInfo) {
  const k = norm(p.Name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
const byHockeyDB = new Map(playerInfo.map(p => [p.HockeyDB, p]));

// Resolves a name to a player ID; with duplicate names, prefers whichever is on a roster.
function findId(name) {
  const matches = byName.get(norm(name)) || [];
  if (matches.length === 1) return matches[0].ID;
  const rostered = matches.filter(p => roster.some(r => r.ID === p.ID));
  if (rostered.length === 1) return rostered[0].ID;
  warn(matches.length ? `Ambiguous player name "${name}" (${matches.map(p => p.ID).join(", ")})` : `Unknown player "${name}"`);
  return null;
}
const findOnRoster = (id) => roster.find(r => r.ID === id);

// ---- parse the trader file ----
const text = stripBom(readFileSync(traderFile, "utf-8"));
const lines = text.split(/\r?\n/).map(l => l.trim());
const sections = { trades: [], moves: [], waived: [], signings: [] };
let section = null;
let team = null;
let tradeTeam = null;

for (const line of lines) {
  if (!line) continue;
  if (/^TRADES\b/i.test(line)) { section = "trades"; continue; }
  if (/^ROSTER MOVES\b/i.test(line)) { section = "moves"; continue; }
  if (/^Waived Players\b/i.test(line)) { section = "waived"; continue; }
  if (/^Free-Agent Signings\b/i.test(line)) { section = "signings"; continue; }
  if (/^[=-]{3,}$/.test(line)) continue;

  if (section === "trades") {
    const m = line.match(/^to\s+([A-Z]{3})\s*:?\s*(.*)$/i);
    if (!m) { warn(`Unrecognized trade line: ${line}`); continue; }
    sections.trades.push({ to: m[1].toUpperCase(), items: m[2].split(",").map(s => s.trim()).filter(Boolean) });
  } else if (section === "moves") {
    const t = line.match(/^([A-Z]{3})\s*:?$/);
    if (t) { team = t[1]; continue; }
    const m = line.match(/^(Promote|Demote)\s*:\s*(.*)$/i);
    if (!m) { warn(`Unrecognized roster move line: ${line}`); continue; }
    sections.moves.push({ team, action: m[1].toLowerCase(), names: m[2].split(",").map(s => s.trim()).filter(Boolean) });
  } else if (section === "waived") {
    const m = line.match(/^([A-Z]{3})\s+(.+?)\s+\([FDG]\)/);
    if (!m) { warn(`Unrecognized waiver line: ${line}`); continue; }
    sections.waived.push({ team: m[1], name: m[2] });
  } else if (section === "signings") {
    const m = line.match(/^([A-Z]{3})\s+(.+?)\s+[FDG]\s+(\d+)\s+(\S+)\s+(\S+)$/);
    if (!m) { warn(`Unrecognized signing line: ${line}`); continue; }
    sections.signings.push({ team: m[1], name: m[2], hockeyDB: m[3], salary: m[4], contract: m[5] });
  }
}

const log = [];

// ---- 1. waived players: no longer on any FHL team ----
for (const w of sections.waived) {
  const id = findId(w.name);
  if (!id) continue;
  const i = roster.findIndex(r => r.ID === id);
  if (i < 0) { warn(`Waived ${w.name} is not on any roster`); continue; }
  if (roster[i].ABBR !== w.team) warn(`Waived ${w.name} listed for ${w.team} but rostered by ${roster[i].ABBR}`);
  roster.splice(i, 1);
  log.push(`WAIVED   ${w.name} (${w.team})`);
}

const newContracts = [];

// ---- 2. FA signings: added in reserve ----
for (const s of sections.signings) {
  const id = byHockeyDB.get(s.hockeyDB)?.ID || findId(s.name);
  if (!id) continue;
  if (findOnRoster(id)) { warn(`Signed ${s.name} is already on ${findOnRoster(id).ABBR}`); continue; }
  roster.push({ ID: id, ABBR: s.team, RESERVE: "R" });
  newContracts.push({ ID: id, Salary: s.salary, Contract: s.contract, Period: String(latest + 1) });
  log.push(`SIGNED   ${s.name} -> ${s.team} (R)`);
}

// ---- 3. trades: players change team, picks change owner ----
// "SEA2 (2027)" is SEA's round 2 pick in the 2027 draft (current season); "(2028)" is next season's.
// A pick with no year is the current season's.
const currentEndYear = Number(basename(seasonDir).slice(0, 4)) + 1;
const pickDirs = new Map([[currentEndYear, seasonDir]]);
if (nextSeasonDir) pickDirs.set(currentEndYear + 1, nextSeasonDir);
const pickFiles = new Map();
const loadPicks = dir => {
  if (!pickFiles.has(dir)) pickFiles.set(dir, readCsv(join(dir, "draft_picks.csv")));
  return pickFiles.get(dir);
};

for (const t of sections.trades) {
  for (const item of t.items) {
    const pm = item.match(/^([A-Z]{3}\d)(?:\s*\((\d{4})\))?$/);
    if (pm) {
      const yy = pm[2] ? Number(pm[2]) : currentEndYear;
      const dir = pickDirs.get(yy);
      if (!dir) { warn(`No draft_picks.csv for ${item} (year ${yy})`); continue; }
      const pick = loadPicks(dir).find(p => p.PICK === pm[1]);
      if (!pick) { warn(`Pick ${pm[1]} not found in ${basename(dir)}`); continue; }
      log.push(`PICK     ${item}: ${pick.OWNER} -> ${t.to} (${basename(dir)})`);
      pick.OWNER = t.to;
      continue;
    }
    const id = findId(item);
    if (!id) continue;
    const r = findOnRoster(id);
    if (!r) { warn(`Traded ${item} is not on any roster`); continue; }
    log.push(`TRADE    ${item}: ${r.ABBR} -> ${t.to}`);
    r.ABBR = t.to;
  }
}

// ---- 4. roster moves: promote = active, demote = reserve ----
for (const m of sections.moves) {
  for (const name of m.names) {
    const id = findId(name);
    if (!id) continue;
    const r = findOnRoster(id);
    if (!r) { warn(`${m.action} ${name}: not on any roster`); continue; }
    if (r.ABBR !== m.team) warn(`${m.action} ${name} listed for ${m.team} but rostered by ${r.ABBR}`);
    const reserve = m.action === "demote" ? "R" : "";
    if (r.RESERVE === reserve) warn(`${name} (${r.ABBR}) was already ${reserve ? "reserve" : "active"}`);
    r.RESERVE = reserve;
    log.push(`${m.action === "demote" ? "DEMOTE  " : "PROMOTE "} ${name} (${r.ABBR})`);
  }
}

// ---- output ----
console.log(log.join("\n"));
if (warnings.length) console.log(`\nWARNINGS (${warnings.length}):\n` + warnings.map(w => `  ${w}`).join("\n"));

if (dryRun) {
  console.log("\nDry run: nothing written.");
} else {
  writeCsv(outFile, ["ID", "ABBR", "RESERVE"], roster);
  console.log(`\nWrote ${outFile} (${roster.length} players)`);
  if (newContracts.length) {
    const file = join(seasonDir, "contracts.csv");
    let body = readFileSync(file, "utf-8");
    const nl = body.includes("\r\n") ? "\r\n" : "\n";
    // Period column is optional; make sure the header has it so the new rows are read.
    body = body.replace(/^([^\r\n]*?)(\r?\n)/, (m, h, e) => (/\bPeriod\b/.test(h) ? m : `${h},Period${e}`));
    if (!body.endsWith("\n")) body += nl;
    body += newContracts.map(c => `${c.ID},${c.Salary},${c.Contract},${c.Period}`).join(nl) + nl;
    writeFileSync(file, body);
    console.log(`Added ${newContracts.length} contracts to ${file}`);
  }
  for (const [dir, rows] of pickFiles) {
    writeCsv(join(dir, "draft_picks.csv"), ["PICK", "OWNER"], rows);
    console.log(`Updated ${join(dir, "draft_picks.csv")}`);
  }
}
