// Free-agent signings, waiver cuts and waiver claims the commissioner recorded, from
// src/data/static/<season>/transactions/transactions_pNN.json (written by the Record Transactions workflow; `appliedAt` /
// `skipped` are set when the next period's roster is created). Each carries the player's name; a signing carries `row`, the
// player row the roster pages show (identity columns, salary and contract); a waiver cut carries `cost`, what it costs the
// team in cash (waiverCost in leagueRules.js). `players` lists everyone in the current season's player_info.csv with the
// contract they are on, for picking a free agent to sign or a player to cut, and pricing a cut before it is recorded.
import { readCsvFile, readTransactions, waiverCostsFor, getContract, seasons, currentSeason, mapPosition } from "../components/loadfiles.js";
import { identityColumns } from "../components/playerRows.js";

const data = {};
let players = [];
for (const season of seasons) {
  const base = `src/data/static/${season}`;
  const info = await readCsvFile(`${base}/player_info.csv`);
  const contracts = await readCsvFile(`${base}/contracts.csv`);
  if (season === currentSeason) {
    players = info.map((p) => {
      const c = getContract(contracts, p.ID);
      return { id: p.ID, name: p.Name, pos: mapPosition(p.Pos), nhl: p.NHL, salary: c?.Salary ?? 0, contract: c?.Contract ?? "" };
    });
  }
  const byId = new Map(info.map((r) => [r.ID, r]));
  const transactions = readTransactions(base);
  const costs = new Map(waiverCostsFor(transactions, contracts, season).map((w) => [w.id, w.cost]));
  data[season] = transactions.map((t) => {
    const p = byId.get(t.player);
    const out = { ...t, name: p?.Name ?? t.player };
    if (t.type === "sign" && p) out.row = { PLAYER_ID: p.ID, ...identityColumns(p, mapPosition(p.Pos), season, { Salary: t.salary, Contract: t.contract }) };
    if (t.type === "waive") out.cost = costs.get(t.id) ?? 0;
    return out;
  }).sort((a, b) => b.at.localeCompare(a.at));
}
process.stdout.write(JSON.stringify({ currentSeason, data, players }));
