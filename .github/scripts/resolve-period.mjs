// Resolves the current season, stats year and stats period for the Read Stats workflow.
// Season: row with current=true in src/data/static/seasons.csv
// Period: first period in src/data/static/<season>/periods.csv whose end date is today or later
// Usage: node resolve-period.mjs [season] [period]   (args override the lookup)
import { readFileSync, appendFileSync } from "fs";

const parseCsv = (path) => {
  const [header, ...rows] = readFileSync(path, "utf-8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = header.split(",").map((c) => c.trim());
  return rows.filter(Boolean).map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v.trim()])));
};

const [seasonArg, periodArg] = process.argv.slice(2);
const season = seasonArg || parseCsv("src/data/static/seasons.csv").find((s) => s.current === "true")?.season;
if (!season) throw new Error("No current season found in seasons.csv");
const year = 2000 + parseInt(season.slice(-2), 10); // 2026-27 -> 2027

let period = periodArg;
if (!period) {
  const today = new Date().toISOString().slice(0, 10);
  const current = parseCsv(`src/data/static/${season}/periods.csv`)
    .sort((a, b) => a.end.localeCompare(b.end))
    .find((p) => p.end >= today);
  if (!current) {
    console.log(`No period of ${season} ends on or after ${today}; nothing to do.`);
    process.exit(0);
  }
  period = String(parseInt(current.period, 10));
}
period = period.padStart(2, "0");

console.log(`season=${season} year=${year} period=${period}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `season=${season}\nyear=${year}\nperiod=${period}\n`);
