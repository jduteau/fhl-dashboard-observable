// Pending roster moves for the next period of the current season (written by the Apply Roster Moves workflow).
import { readdirSync, readFileSync, existsSync } from "fs";
import { currentSeason } from "../components/loadfiles.js";

const dir = `src/data/static/${currentSeason}/moves`;
const out = {};
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) {
    const m = /^moves_p(\d+)\.json$/.exec(f);
    if (m) out[Number(m[1])] = JSON.parse(readFileSync(`${dir}/${f}`, "utf-8"));
  }
}
process.stdout.write(JSON.stringify({ season: currentSeason, moves: out }));
