// Free-agent signings and waiver cuts the commissioner recorded, from
// src/data/static/<season>/transactions/transactions_pNN.json (written by the Record Transactions workflow; `appliedAt` /
// `skipped` are set when the next period's roster is created). Each carries the player's name and, for a signing, `row`:
// the player row the roster pages show (identity columns, salary and contract). `players` lists everyone in the current
// season's player_info.csv, for picking a free agent to sign.
import { readdirSync, readFileSync, existsSync } from "fs";
import { readCsvFile, seasons, currentSeason, mapPosition } from "../components/loadfiles.js";
import { identityColumns } from "../components/playerRows.js";

const data = {};
let players = [];
for (const season of seasons) {
  const dir = `src/data/static/${season}/transactions`;
  data[season] = [];
  const info = await readCsvFile(`src/data/static/${season}/player_info.csv`);
  if (season === currentSeason) players = info.map((p) => ({ id: p.ID, name: p.Name, pos: mapPosition(p.Pos), nhl: p.NHL }));
  if (!existsSync(dir)) continue;
  const byId = new Map(info.map((r) => [r.ID, r]));
  for (const file of readdirSync(dir).sort()) {
    const period = /^transactions_p(\d+)\.json$/.exec(file)?.[1];
    if (!period) continue;
    for (const t of JSON.parse(readFileSync(`${dir}/${file}`, "utf-8")).transactions ?? []) {
      const p = byId.get(t.player);
      const out = { ...t, season, period: Number(period), name: p?.Name ?? t.player };
      if (t.type === "sign" && p) out.row = { PLAYER_ID: p.ID, ...identityColumns(p, mapPosition(p.Pos), season, { Salary: t.salary, Contract: t.contract }) };
      data[season].push(out);
    }
  }
  data[season].sort((a, b) => b.at.localeCompare(a.at));
}
process.stdout.write(JSON.stringify({ currentSeason, data, players }));
