// Resolves the current season, stats year and stats period for the Read Stats workflow.
// Season: row with current=true in src/data/static/seasons.csv
// Period: first period in src/data/static/<season>/periods.csv whose end date is today or later
// Next period: on the last day of a period (today == its end date) the run is the period's final stats drop, and the same
// stats also open the following period, so `next_period` is output for the workflow to copy them to stats_p<next>.csv.
// Usage: node resolve-period.mjs [season] [period]   (args override the lookup)
import { readFileSync, appendFileSync } from "fs";
import { csvParse } from "../../src/components/csv.js";

const parseCsv = (path) => csvParse(readFileSync(path, "utf-8"));

const [seasonArg, periodArg] = process.argv.slice(2);
const season = seasonArg || parseCsv("src/data/static/seasons.csv").find((s) => s.current === "true")?.season;
if (!season) throw new Error("No current season found in seasons.csv");
const year = 2000 + parseInt(season.slice(-2), 10); // 2026-27 -> 2027

let period = periodArg;
let nextPeriod = "";
if (!period) {
  const today = new Date().toISOString().slice(0, 10);
  const periods = parseCsv(`src/data/static/${season}/periods.csv`).sort((a, b) => a.end.localeCompare(b.end));
  const current = periods.find((p) => p.end >= today);
  if (!current) {
    console.log(`No period of ${season} ends on or after ${today}; nothing to do.`);
    process.exit(0);
  }
  period = String(parseInt(current.period, 10));
  const next = periods[periods.indexOf(current) + 1];
  if (current.end === today && next) nextPeriod = String(parseInt(next.period, 10)).padStart(2, "0");
}
period = period.padStart(2, "0");

console.log(`season=${season} year=${year} period=${period}${nextPeriod ? ` next_period=${nextPeriod}` : ""}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `season=${season}\nyear=${year}\nperiod=${period}\nnext_period=${nextPeriod}\n`);
