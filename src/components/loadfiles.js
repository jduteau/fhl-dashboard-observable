import {readFileSync, readdirSync, existsSync} from "fs";
import {periodCost, mapPosition, DSTAT_TOI_DIVISOR, GSTAT_WEIGHTS} from "./leagueRules.js";

// Re-exported so existing importers keep working; the rules themselves live in leagueRules.js
export {periodCost, mapPosition};
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

export async function readCsvFile(fileName) {
    return csvParse(stripBom(readFileSync(fileName, "utf-8")), (row) => {
      // Convert numeric fields
      let keys = Object.keys(row);
      keys.forEach(key => {
        if (["CASH", "Salary", "Period"].includes(key)) {
          row[key] = +row[key];
        }
      });
      return row;
    });
}

export function readStatsFile(fileName) {
  return csvParse(stripBom(readFileSync(fileName, "utf-8")), (row) => {
    // Convert numeric fields
    const numericFields = ["stats/gp", "stats/goals", "stats/assists", "stats/pim", "stats/hits", "stats/toi", "stats/blocks", "stats/take", "stats/give", "stats/wins", "stats/losses", "stats/ties", "stats/so", "stats/sa", "stats/ga"];
    numericFields.forEach(field => {
      row[field] = row[field] ? +row[field] : 0;
    });
    return row;
  });
}

// ---- Stat formulas: the single place where Toughness, DStat and GStat are defined ----
// Each takes plain stat values (missing/null counts as 0). Change a formula here and it
// changes everywhere.

// Toughness = penalty minutes + hits
export function calcToughness({ pim, hits }) {
  return (pim || 0) + (hits || 0);
}

// DStat (skaters only): TOI / 20 for defensemen, TOI / 30 for forwards, plus blocks and takeaways, less giveaways
export function calcDStat(position, { toi, blocks, take, give }) {
  const toiDivisor = position === "D" ? DSTAT_TOI_DIVISOR.D : DSTAT_TOI_DIVISOR.other;
  return (toi || 0) / toiDivisor + (blocks || 0) + (take || 0) - (give || 0);
}

// GStat (goalies only): 2 per win, 1 per tie, 2 per shutout, 0.15 per shot against, less goals against
export function calcGStat({ wins, ties, so, sa, ga }) {
  const w = GSTAT_WEIGHTS;
  return w.win * (wins || 0) + w.tie * (ties || 0) + w.shutout * (so || 0) + w.shotAgainst * (sa || 0) - (ga || 0);
}

// Pull the formula inputs out of a stats-file row ("stats/xxx" columns), or a name => value function
export function statInputs(row) {
  const get = typeof row === "function" ? row : (name) => row[`stats/${name}`];
  return {
    pim: get("pim"), hits: get("hits"), toi: get("toi"), blocks: get("blocks"), take: get("take"), give: get("give"),
    wins: get("wins"), ties: get("ties"), so: get("so"), sa: get("sa"), ga: get("ga"),
  };
}

// Internal helper: compute stat distributions from a stats array
function computeDistributions(statsArray) {
  const goalDistribution = {};
  const assistDistribution = {};
  const toughnessDistribution = {};
  const dstatDistribution = {};
  const gstatDistribution = {};

  statsArray.forEach(player => {
    if (player.pos === "G") {
      const gstat = calcGStat(statInputs(player));
      const roundedGstat = Math.round(gstat * 100) / 100;
      gstatDistribution[roundedGstat] = (gstatDistribution[roundedGstat] || 0) + 1;
    } else {
      const goals = player["stats/goals"] || 0;
      goalDistribution[goals] = (goalDistribution[goals] || 0) + 1;

      const assists = player["stats/assists"] || 0;
      assistDistribution[assists] = (assistDistribution[assists] || 0) + 1;

      const toughness = calcToughness(statInputs(player));
      toughnessDistribution[toughness] = (toughnessDistribution[toughness] || 0) + 1;

      const dstat = calcDStat(player.pos, statInputs(player));
      const roundedDstat = Math.round(dstat * 1000) / 1000;
      dstatDistribution[roundedDstat] = (dstatDistribution[roundedDstat] || 0) + 1;
    }
  });

  const goalRanges = Object.keys(goalDistribution).map(g => ({ stat: parseInt(g), playerCount: goalDistribution[g] })).sort((a, b) => a.stat - b.stat);
  const assistRanges = Object.keys(assistDistribution).map(a => ({ stat: parseInt(a), playerCount: assistDistribution[a] })).sort((a, b) => a.stat - b.stat);
  const toughnessRanges = Object.keys(toughnessDistribution).map(t => ({ stat: parseInt(t), playerCount: toughnessDistribution[t] })).sort((a, b) => a.stat - b.stat);
  const dstatRanges = Object.keys(dstatDistribution).map(d => ({ stat: parseFloat(d), playerCount: dstatDistribution[d] })).sort((a, b) => a.stat - b.stat);
  const gstatRanges = Object.keys(gstatDistribution).map(g => ({ stat: parseFloat(g), playerCount: gstatDistribution[g] })).sort((a, b) => a.stat - b.stat);

  return { goalRanges, assistRanges, toughnessRanges, dstatRanges, gstatRanges };
}

// Internal helper: create a season-scoped getOverallStats using given distributions
function createGetOverallStats(distributions) {
  const { goalRanges, assistRanges, toughnessRanges, dstatRanges, gstatRanges } = distributions;

  function getStatRating(stat, statRanges) {
    const total = statRanges.reduce((sum, e) => sum + e.playerCount, 0);
    const below = statRanges.filter(e => e.stat < stat).reduce((sum, e) => sum + e.playerCount, 0);
    const atStat = statRanges.find(e => e.stat === stat)?.playerCount || 0;
    return total > 0 ? 100 * (below + 0.5 * atStat) / total : 0;
  }

  function getOverallRanking(position, goals, assists, toughness, dstat, gstat) {
    return position === "G" ? getStatRating(gstat, gstatRanges) :
      (getStatRating(goals, goalRanges) +
       getStatRating(assists, assistRanges) +
       getStatRating(toughness, toughnessRanges) +
       getStatRating(dstat, dstatRanges)) / 4;
  }

  return function getOverallStats(position, currentStats) {
    const stats = statLine(position, currentStats, null, true);
    return {
      ...stats,
      gstat: position === "G" ? stats.gstat : null,
      rating: getOverallRanking(position, stats.goals, stats.assists, stats.toughness, stats.dstat, stats.gstat),
    };
  };
}

// ---- Lookup helpers ----

// Rows keyed by a column. The FIRST row wins on duplicates, exactly like Array.find, so swapping a find() for a
// lookup never changes which row is used.
export function indexBy(rows, key) {
  const map = new Map();
  for (const row of rows) if (!map.has(row[key])) map.set(row[key], row);
  return map;
}

const EMPTY_INDEX = new Map();
const lookups = new WeakMap();

// Per-period lookups over a statsData object ({period: rows}): stats(period) is a hockeyRef -> row Map for that period;
// previous(period) is the same for the nearest EARLIER period that has a stats file (empty before the first one), which
// is what a period's stats are measured against. Cached per statsData object.
export function periodLookup(statsData) {
  let lookup = lookups.get(statsData);
  if (lookup) return lookup;
  const periods = Object.keys(statsData).map(Number).sort((x, y) => x - y);
  const byPeriod = new Map(periods.map(p => [p, indexBy(statsData[p], "hockeyRef")]));
  lookup = {
    periods,
    stats: (period) => byPeriod.get(Number(period)) ?? EMPTY_INDEX,
    previous: (period) => {
      const earlier = periods.filter(p => p < Number(period));
      return earlier.length ? byPeriod.get(earlier[earlier.length - 1]) : EMPTY_INDEX;
    },
  };
  lookups.set(statsData, lookup);
  return lookup;
}

// Throws one clear error naming every rostered player that player_info.csv doesn't know, instead of a bare
// "cannot read properties of undefined" on the first one. rosterFiles = [{name, rows}] with rows having an ID column.
export function assertPlayersKnown(playerIndex, rosterFiles, where = "player_info.csv") {
  const missing = new Map(); // id -> first file it was seen in
  for (const { name, rows } of rosterFiles)
    for (const { ID } of rows) if (!playerIndex.has(ID) && !missing.has(ID)) missing.set(ID, name);
  if (missing.size === 0) return;
  const list = [...missing].map(([id, name]) => `${id} (in ${name})`).join(", ");
  throw new Error(`${missing.size} rostered player(s) are missing from ${where}: ${list}`);
}

// A row that must exist (an owner, a team's cash...): fail with a message naming what is missing and where.
export function requireRow(index, key, what, where) {
  const row = index.get(key);
  if (!row) throw new Error(`${what} "${key}" is missing from ${where}`);
  return row;
}

// ---- Season loading ----

// Files named <prefix>_pNN.csv in a directory, as [{period, file}] sorted by period number (p1, p01 and p001 all mean 1).
function listPeriodFiles(dir, prefix) {
  if (!existsSync(dir)) return [];
  const pattern = new RegExp(`^${prefix}_p(\\d+)\\.csv$`);
  return readdirSync(dir)
    .map(name => pattern.exec(name))
    .filter(Boolean)
    .map(m => ({ period: Number(m[1]), file: `${dir}/${m[0]}` }))
    .sort((x, y) => x.period - y.period);
}

// Blank lines in a roster file parse as rows with no ID; they are not players, so drop them.
const readRosterFile = (file) => csvParse(stripBom(readFileSync(file, "utf-8"))).filter(row => row.ID);

// Periods are meant to be numbered 1..N without gaps; say so (once, on stderr) when they are not.
function warnIfGaps(season, kind, periods) {
  if (periods.some((p, i) => p !== i + 1))
    console.warn(`[${season}] ${kind} files are not numbered 1..${periods.length} consecutively: ${periods.join(", ")}`);
}

const seasonCache = new Map();

// Load all data files for a given season directory. Cached per season, so loaders that visit the same season more than
// once (or import the current-season exports below) read and parse the files only once.
//
// Periods are discovered from the files themselves, keyed by period NUMBER:
//   statsData / rosterData       {period: rows}
//   statsPeriods / rosterPeriods [{period, data}] in period order. rosterPeriods can run one ahead of statsPeriods
//                                (next period's roster is created before its stats exist).
//   availablePeriods             the periods that have stats, as strings ("1", "2", ...)
//   latestPeriod                 the highest period with stats (0 if none): the period in progress
//   lastPeriodNum                latestPeriod - 1, the number of completed periods
//   latestStatsFile/latestRosterFile (+ ...Index Maps) are the stats and roster for latestPeriod
export function loadSeasonData(season) {
  if (!seasonCache.has(season)) seasonCache.set(season, loadSeason(season));
  return seasonCache.get(season);
}

async function loadSeason(season) {
  const basePath = `src/data/static/${season}`;

  const statsPeriods = listPeriodFiles(`${basePath}/stats`, "stats").map(({ period, file }) => ({ period, data: readStatsFile(file) }));
  const rosterPeriods = listPeriodFiles(`${basePath}/rosters`, "rosters").map(({ period, file }) => ({ period, data: readRosterFile(file) }));
  const statsData = Object.fromEntries(statsPeriods.map(p => [p.period, p.data]));
  const rosterData = Object.fromEntries(rosterPeriods.map(p => [p.period, p.data]));
  warnIfGaps(season, "stats", statsPeriods.map(p => p.period));
  warnIfGaps(season, "roster", rosterPeriods.map(p => p.period));

  const availablePeriods = statsPeriods.map(p => String(p.period));
  const latestPeriod = statsPeriods.length ? statsPeriods[statsPeriods.length - 1].period : 0;
  const lastPeriodNum = latestPeriod - 1;
  const latestStatsFile = statsData[latestPeriod] ?? [];
  const latestRosterFile = rosterData[latestPeriod] ?? [];
  if (latestPeriod > 0 && !rosterData[latestPeriod])
    console.warn(`[${season}] stats exist for period ${latestPeriod} but there is no rosters_p${String(latestPeriod).padStart(2, "0")}.csv`);

  // Playoff round configuration (a season without playoffs yet simply has none)
  const playoffRoundsFile = `${basePath}/playoff_rounds.csv`;
  const playoffRoundsConfig = existsSync(playoffRoundsFile) ? await readCsvFile(playoffRoundsFile) : [];
  const playoffRounds = playoffRoundsConfig.map(config => {
    const round = parseInt(config.round);
    const padded = round.toString().padStart(2, '0');
    const statsFile = `${basePath}/stats/stats_playoff_r${padded}.csv`;
    const rosterFile = `${basePath}/rosters/rosters_playoff_r${padded}.csv`;
    const available = existsSync(statsFile) && existsSync(rosterFile);
    return {
      round,
      name: config.name,
      statsFile: available ? readStatsFile(statsFile) : null,
      rosterFile: available ? readRosterFile(rosterFile) : null,
      available,
    };
  });
  const availablePlayoffRounds = playoffRounds.filter(round => round.available);

  // Build distributions and season-scoped getOverallStats
  const distributions = computeDistributions(latestStatsFile);
  const getOverallStats = createGetOverallStats(distributions);

  return {
    season,
    basePath,
    statsPeriods, statsData, rosterPeriods, rosterData,
    playoffRounds, availablePlayoffRounds,
    availablePeriods, latestPeriod, lastPeriodNum,
    latestStatsFile, latestRosterFile,
    latestStatsIndex: indexBy(latestStatsFile, "hockeyRef"),
    latestRosterIndex: indexBy(latestRosterFile, "ID"),
    distributions, getOverallStats,
  };
}

// Load available seasons from config
export const seasonsConfig = await readCsvFile("src/data/static/seasons.csv");
export const allSeasons = seasonsConfig.map(s => s.season);
export const seasons = seasonsConfig.filter(s => s.stub !== 'true').map(s => s.season);
export const currentSeason = seasonsConfig.find(s => s.current === "true")?.season || seasons[seasons.length - 1];

// Backward-compatible top-level exports pointing to current season data
const _currentSeasonData = await loadSeasonData(currentSeason);
export const statsPeriods = _currentSeasonData.statsPeriods;
export const statsData = _currentSeasonData.statsData;
export const rosterPeriods = _currentSeasonData.rosterPeriods;
export const rosterData = _currentSeasonData.rosterData;
export const playoffRounds = _currentSeasonData.playoffRounds;
export const availablePlayoffRounds = _currentSeasonData.availablePlayoffRounds;
export const availablePeriods = _currentSeasonData.availablePeriods;
export const lastPeriodNum = _currentSeasonData.lastPeriodNum;
export const latestStatsFile = _currentSeasonData.latestStatsFile;
export const latestRosterFile = _currentSeasonData.latestRosterFile;
export const latestStatsIndex = _currentSeasonData.latestStatsIndex;
export const latestRosterIndex = _currentSeasonData.latestRosterIndex;

// Parse a YYYY-MM-DD date string as a local date (avoids the UTC shift of new Date(str))
function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

// Age cutoff for a season: the ageCutoff from seasons.csv, else September 15 of the season's first year
export function getAgeCutoff(season) {
  const config = seasonsConfig.find(s => s.season === season);
  if (config?.ageCutoff) return parseLocalDate(config.ageCutoff);
  const seasonYear = parseInt(String(season).split("-")[0], 10);
  return new Date(seasonYear, 8, 15); // September 15 (month is 0-indexed)
}

// Function to calculate age as of the season's age cutoff date
export function calculateAge(birthDateStr, season = currentSeason) {
  if (!birthDateStr) return "N/A";

  const birthDate = parseLocalDate(birthDateStr);
  const cutoffDate = getAgeCutoff(season);

  let age = cutoffDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = cutoffDate.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// ---- One player's stat line ----
//
// getOverallStats (the season so far) and getStatsForPeriod (one period) return the same line: skaters have the skater
// stats and goalies the goalie stats, and the other kind is null. The two differ only in the numbers:
//   raw = true   running totals, as the stats file has them (the file's own value, 0 when blank)
//   raw = false  what was added since the previous file (`previous` null/undefined = since the start)
const SKATER_STATS_BEFORE_TOUGHNESS = ["goals", "assists", "pim", "hits"];
const SKATER_STATS_AFTER_TOUGHNESS = ["blocks", "take", "give", "toi"];
const GOALIE_STATS = ["wins", "losses", "ties", "so", "sa", "ga"];

const statValue = (row, name) => row?.[`stats/${name}`] || 0;

function statLine(position, current, previous, raw) {
  const isGoalie = position === "G";
  const currentInputs = statInputs(current);
  const previousInputs = previous ? statInputs(previous) : null;
  const value = (name) => (raw ? statValue(current, name) : statValue(current, name) - statValue(previous, name));
  // A computed stat (toughness, DStat, GStat) over the same span
  const computed = (formula) => (raw || !previousInputs ? formula(currentInputs) : formula(currentInputs) - formula(previousInputs));
  const skater = (stat) => (isGoalie ? null : stat());
  const goalie = (stat) => (isGoalie ? stat() : null);

  const line = { hockeyRef: current.hockeyRef, team: current.team };
  for (const name of SKATER_STATS_BEFORE_TOUGHNESS) line[name] = skater(() => value(name));
  line.toughness = skater(() => computed(calcToughness));
  for (const name of SKATER_STATS_AFTER_TOUGHNESS) line[name] = skater(() => value(name));
  line.dstat = skater(() => computed((inputs) => calcDStat(position, inputs)));
  for (const name of GOALIE_STATS) line[name] = goalie(() => value(name));
  line.gstat = isGoalie ? computed(calcGStat) : 0;
  line.games_played = value("gp");
  return line;
}

// Function to get stats for the selected period
export function getStatsForPeriod(position, currentStats, previousStats) {
  return statLine(position, currentStats, previousStats, false);
}


// getOverallStats is season-scoped; export current season's version for backward compat
export const getOverallStats = _currentSeasonData.getOverallStats;




// Contracts can change in-season (a waived player signed by another team gets a new contract).
// contracts.csv may hold several rows per player; the optional Period column is the first
// period a row applies to (blank = 1). Returns the row in effect for the given period
// (default: the latest), or undefined if the player has no contract.
const contractIndexes = new WeakMap();

// Contract rows grouped by player ID (row order kept), built once per contracts array. The array must not be changed
// after its first lookup.
function contractsById(contracts) {
  let index = contractIndexes.get(contracts);
  if (!index) {
    index = new Map();
    for (const c of contracts) {
      if (!index.has(c.ID)) index.set(c.ID, []);
      index.get(c.ID).push(c);
    }
    contractIndexes.set(contracts, index);
  }
  return index;
}

export function getContract(contracts, id, period = Infinity) {
  let best, earliest;
  for (const c of contractsById(contracts).get(id) ?? []) {
    const from = c.Period > 1 ? c.Period : 1;
    if (!earliest || from < (earliest.Period > 1 ? earliest.Period : 1)) earliest = c;
    if (from <= period && (!best || from >= (best.Period > 1 ? best.Period : 1))) best = c;
  }
  return best || earliest;
}

// One contract per player: the one in effect for the latest period
export function latestContracts(contracts) {
  return [...contractsById(contracts).keys()].map(id => getContract(contracts, id));
}

// A team's cash going into the latest period: its starting cash less the cost of every
// earlier period, each priced from that period's roster and the contracts in effect then.
// The latest period is still in progress, so it has not been charged yet.
export function computeTeamCash(startCash, abbr, rosterPeriods, contracts) {
  const latest = rosterPeriods.length ? rosterPeriods[rosterPeriods.length - 1].period : 0;
  return rosterPeriods.filter(rp => rp.period < latest).reduce((cash, rp) => {
    const salary = rp.data
      .filter(player => player.ABBR === abbr)
      .reduce((sum, player) => sum + (getContract(contracts, player.ID, rp.period)?.Salary || 0), 0);
    return Math.round((cash - periodCost(salary)) * 100) / 100;
  }, startCash);
}
