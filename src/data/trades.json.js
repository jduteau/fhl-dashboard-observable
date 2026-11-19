// Trades both GMs accepted, from src/data/static/<season>/trades/trades_pNN.json (written by the Record Trades
// workflow; `appliedAt` / `skipped` are set when the next period's roster is created). Player names are added here.
// Pending (not yet accepted) proposals are private and never appear in the repo.
import { readdirSync, readFileSync, existsSync } from "fs";
import { readCsvFile, seasons, currentSeason } from "../components/loadfiles.js";

const data = {};
for (const season of seasons) {
  const dir = `src/data/static/${season}/trades`;
  data[season] = [];
  if (!existsSync(dir)) continue;
  const names = new Map((await readCsvFile(`src/data/static/${season}/player_info.csv`)).map((r) => [r.ID, r.Name]));
  const side = (s) => ({
    players: (s?.players ?? []).map((id) => ({ id, name: names.get(id) ?? id })),
    picks: s?.picks ?? [],
  });
  for (const file of readdirSync(dir).sort()) {
    const period = /^trades_p(\d+)\.json$/.exec(file)?.[1];
    if (!period) continue;
    for (const t of JSON.parse(readFileSync(`${dir}/${file}`, "utf-8")).trades ?? [])
      data[season].push({ ...t, season, period: Number(period), give: side(t.give), get: side(t.get) });
  }
  data[season].sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}
process.stdout.write(JSON.stringify({ currentSeason, data }));
