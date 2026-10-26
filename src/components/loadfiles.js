import {readFileSync} from "fs";
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
    const numericFields = ["stats/gp", "stats/goals", "stats/assists", "stats/pim", "stats/hits", "stats/toi", "stats/blocks", "stats/take", "stats/give", "stats/wins", "stats/ties", "stats/so", "stats/sa", "stats/ga"];
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
  const toiDivisor = position === "D" ? 20 : 30;
  return (toi || 0) / toiDivisor + (blocks || 0) + (take || 0) - (give || 0);
}

// GStat (goalies only): 2 per win, 1 per tie, 2 per shutout, 0.15 per shot against, less goals against
export function calcGStat({ wins, ties, so, sa, ga }) {
  return 2 * (wins || 0) + (ties || 0) + 2 * (so || 0) + 0.15 * (sa || 0) - (ga || 0);
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
    const inputs = statInputs(currentStats);
    const dstat = position === "G" ? 0 : calcDStat(position, inputs);
    const gstat = position === "G" ? calcGStat(inputs) : null;
    const toughness = position === "G" ? 0 : calcToughness(inputs);

    return {
      hockeyRef: currentStats.hockeyRef,
      team: currentStats.team,
      goals: (position === "G") ? null : (currentStats["stats/goals"] || 0),
      assists: (position === "G") ? null : (currentStats["stats/assists"] || 0),
      pim: (position === "G") ? null : (currentStats["stats/pim"] || 0),
      hits: (position === "G") ? null : (currentStats["stats/hits"] || 0),
      toughness: (position === "G") ? null : toughness,
      blocks: (position === "G") ? null : (currentStats["stats/blocks"] || 0),
      take: (position === "G") ? null : (currentStats["stats/take"] || 0),
      give: (position === "G") ? null : (currentStats["stats/give"] || 0),
      toi: (position === "G") ? null : (currentStats["stats/toi"] || 0),
      dstat: (position === "G") ? null : dstat,
      wins: (position === "G") ? (currentStats["stats/wins"] || 0) : null,
      losses: (position === "G") ? (currentStats["stats/losses"] || 0) : null,
      ties: (position === "G") ? (currentStats["stats/ties"] || 0) : null,
      so: (position === "G") ? (currentStats["stats/so"] || 0) : null,
      sa: (position === "G") ? (currentStats["stats/sa"] || 0) : null,
      ga: (position === "G") ? (currentStats["stats/ga"] || 0) : null,
      gstat: gstat,
      games_played: (currentStats["stats/gp"] || 0),
      rating: getOverallRanking(position, (currentStats["stats/goals"] || 0), (currentStats["stats/assists"] || 0), toughness, dstat, gstat),
    };
  };
}

// Load all data files for a given season directory
export async function loadSeasonData(season) {
  const basePath = `src/data/static/${season}`;

  // Load period-specific stats files
  const statsPeriods = [];
  const statsData = {};
  for (let i = 1; i <= 25; i++) {
    const paddedNum = i.toString().padStart(2, '0');
    try {
      const data = readStatsFile(`${basePath}/stats/stats_p${paddedNum}.csv`);
      statsPeriods.push({ period: i, data });
      statsData[i] = data;
    } catch (error) {
      // File doesn't exist yet, skip
    }
  }

  // Load period-specific roster files
  const rosterPeriods = [];
  const rosterData = {};
  for (let i = 1; i <= 25; i++) {
    const paddedNum = i.toString().padStart(2, '0');
    try {
      const data = csvParse(stripBom(readFileSync(`${basePath}/rosters/rosters_p${paddedNum}.csv`, "utf-8")));
      rosterPeriods.push({ period: i, data });
      rosterData[i] = data;
    } catch (error) {
      // File doesn't exist yet, skip
    }
  }

  const availablePeriods = [...Object.keys(statsData)];
  const lastPeriodNum = availablePeriods.length - 1;
  const latestStatsFile = statsPeriods.length > 0 ? statsPeriods[lastPeriodNum].data : [];
  const latestRosterFile = rosterPeriods.length > 0 ? rosterPeriods[lastPeriodNum].data : [];

  // Load playoff round configuration
  let playoffRoundsConfig = [];
  try {
    playoffRoundsConfig = await readCsvFile(`${basePath}/playoff_rounds.csv`);
  } catch (e) {
    // No playoff config for this season yet
  }

  const playoffRounds = playoffRoundsConfig.map(config => ({
    round: parseInt(config.round),
    name: config.name,
    statsFile: null,
    rosterFile: null,
    available: false
  }));

  for (let i = 0; i < playoffRounds.length; i++) {
    const roundNum = playoffRounds[i].round;
    const paddedNum = roundNum.toString().padStart(2, '0');
    try {
      playoffRounds[i].statsFile = readStatsFile(`${basePath}/stats/stats_playoff_r${paddedNum}.csv`);
      playoffRounds[i].rosterFile = csvParse(stripBom(readFileSync(`${basePath}/rosters/rosters_playoff_r${paddedNum}.csv`, "utf-8")));
      playoffRounds[i].available = true;
    } catch (error) {
      // Files don't exist yet, keep as unavailable
    }
  }

  const availablePlayoffRounds = playoffRounds.filter(round => round.available);

  // Build distributions and season-scoped getOverallStats
  const distributions = computeDistributions(latestStatsFile);
  const getOverallStats = createGetOverallStats(distributions);

  return {
    season,
    basePath,
    statsPeriods, statsData, rosterPeriods, rosterData,
    playoffRounds, availablePlayoffRounds,
    availablePeriods, lastPeriodNum,
    latestStatsFile, latestRosterFile,
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

// Function to map positions to G, D, or F
export function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F"; // All other positions (C, LW, RW, F, etc.) become F
}

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

// Function to get stats for the selected period
export function getStatsForPeriod(position, currentStats, previousStats) {

  const currentInputs = statInputs(currentStats);
  const prevInputs = previousStats ? statInputs(previousStats) : null;
  const isGoalie = position === "G";

  const currentDstat = isGoalie ? 0 : calcDStat(position, currentInputs);
  const prevDstat = prevInputs && !isGoalie ? calcDStat(position, prevInputs) : 0;
  const currentGstat = isGoalie ? calcGStat(currentInputs) : 0;
  const prevGstat = prevInputs && isGoalie ? calcGStat(prevInputs) : 0;
  const currentToughness = isGoalie ? 0 : calcToughness(currentInputs);
  const prevToughness = prevInputs && !isGoalie ? calcToughness(prevInputs) : 0;

  return {
    hockeyRef: currentStats.hockeyRef,
    team: currentStats.team,
    goals: (position === "G") ? null : ((currentStats["stats/goals"] || 0) - (previousStats?.["stats/goals"] || 0)),
    assists: (position === "G") ? null : ((currentStats["stats/assists"] || 0) - (previousStats?.["stats/assists"] || 0)),
    pim: (position === "G") ? null : ((currentStats["stats/pim"] || 0) - (previousStats?.["stats/pim"] || 0)),
    hits: (position === "G") ? null : ((currentStats["stats/hits"] || 0) - (previousStats?.["stats/hits"] || 0)),
    toughness: (position === "G") ? null : (currentToughness - prevToughness),
    blocks: (position === "G") ? null : ((currentStats["stats/blocks"] || 0) - (previousStats?.["stats/blocks"] || 0)),
    take: (position === "G") ? null : ((currentStats["stats/take"] || 0) - (previousStats?.["stats/take"] || 0)),
    give: (position === "G") ? null : ((currentStats["stats/give"] || 0) - (previousStats?.["stats/give"] || 0)),
    toi:  (position === "G") ? null : ((currentStats["stats/toi"] || 0) - (previousStats?.["stats/toi"] || 0)),
    dstat: (position === "G") ? null : (currentDstat - prevDstat),
    wins: (position === "G") ? ((currentStats["stats/wins"] || 0) - (previousStats?.["stats/wins"] || 0)) : null,
    losses: (position === "G") ? ((currentStats["stats/losses"] || 0) - (previousStats?.["stats/losses"] || 0)) : null,
    ties: (position === "G") ? ((currentStats["stats/ties"] || 0) - (previousStats?.["stats/ties"] || 0)) : null,
    so: (position === "G") ? ((currentStats["stats/so"] || 0) - (previousStats?.["stats/so"] || 0)) : null,
    sa: (position === "G") ? ((currentStats["stats/sa"] || 0) - (previousStats?.["stats/sa"] || 0)) : null,
    ga: (position === "G") ? ((currentStats["stats/ga"] || 0) - (previousStats?.["stats/ga"] || 0)) : null,
    gstat: (currentGstat - prevGstat),
    games_played: (currentStats["stats/gp"] || 0) - (previousStats?.["stats/gp"] || 0)
  };
}


// getOverallStats is season-scoped; export current season's version for backward compat
export const getOverallStats = _currentSeasonData.getOverallStats;




// Contracts can change in-season (a waived player signed by another team gets a new contract).
// contracts.csv may hold several rows per player; the optional Period column is the first
// period a row applies to (blank = 1). Returns the row in effect for the given period
// (default: the latest), or undefined if the player has no contract.
export function getContract(contracts, id, period = Infinity) {
  let best, earliest;
  for (const c of contracts) {
    if (c.ID !== id) continue;
    const from = c.Period > 1 ? c.Period : 1;
    if (!earliest || from < (earliest.Period > 1 ? earliest.Period : 1)) earliest = c;
    if (from <= period && (!best || from >= (best.Period > 1 ? best.Period : 1))) best = c;
  }
  return best || earliest;
}

// One contract per player: the one in effect for the latest period
export function latestContracts(contracts) {
  return [...new Set(contracts.map(c => c.ID))].map(id => getContract(contracts, id));
}

// Cash charged to a team for one period: salary/25, with a minimum of 13
export function periodCost(totalSalary) {
  return totalSalary < 325 ? 13 : totalSalary / 25;
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
