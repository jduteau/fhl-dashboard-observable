import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

export async function readCsvFile(fileName) {
    return csvParse(stripBom(readFileSync(fileName, "utf-8")), (row) => {
      // Convert numeric fields
      let keys = Object.keys(row);
      keys.forEach(key => {
        if (["CASH", "Salary"].includes(key)) {
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

// Internal helper: compute stat distributions from a stats array
function computeDistributions(statsArray) {
  const goalDistribution = {};
  const assistDistribution = {};
  const toughnessDistribution = {};
  const dstatDistribution = {};
  const gstatDistribution = {};

  statsArray.forEach(player => {
    if (player.pos === "G") {
      const gstat = 2 * (player["stats/wins"] || 0) + (player["stats/ties"] || 0) +
        2 * (player["stats/so"] || 0) + 0.15 * (player["stats/sa"] || 0) - (player["stats/ga"] || 0);
      const roundedGstat = Math.round(gstat * 100) / 100;
      gstatDistribution[roundedGstat] = (gstatDistribution[roundedGstat] || 0) + 1;
    } else {
      const goals = player["stats/goals"] || 0;
      goalDistribution[goals] = (goalDistribution[goals] || 0) + 1;

      const assists = player["stats/assists"] || 0;
      assistDistribution[assists] = (assistDistribution[assists] || 0) + 1;

      const toughness = (player["stats/pim"] || 0) + (player["stats/hits"] || 0);
      toughnessDistribution[toughness] = (toughnessDistribution[toughness] || 0) + 1;

      const toiDivisor = player.pos === "D" ? 20 : 30;
      const dstat = (player["stats/blocks"] || 0) + (player["stats/take"] || 0) -
        (player["stats/give"] || 0) + ((player["stats/toi"] || 0) / toiDivisor);
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
    let dstat = 0;
    if (position === "D") {
      dstat = (currentStats["stats/toi"] || 0) / 20 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
    } else if (position !== "G") {
      dstat = (currentStats["stats/toi"] || 0) / 30 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
    }

    let gstat = null;
    if (position === "G") {
      gstat = 2 * (currentStats["stats/wins"] || 0) + (currentStats["stats/ties"] || 0) + 2 * (currentStats["stats/so"] || 0) + 0.15 * (currentStats["stats/sa"] || 0) - (currentStats["stats/ga"] || 0);
    }

    const toughness = (position === "G") ? 0 : ((currentStats["stats/pim"] || 0) + (currentStats["stats/hits"] || 0));

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
export const seasons = seasonsConfig.map(s => s.season);
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

// Function to calculate age as of September 15 of current year
export function calculateAge(birthDateStr) {
  if (!birthDateStr) return "N/A";
  
  const birthDate = new Date(birthDateStr);
  const cutoffDate = new Date(2025, 8, 15); // September 15, 2025 (month is 0-indexed)
  
  let age = cutoffDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = cutoffDate.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Function to get stats for the selected period
export function getStatsForPeriod(position, currentStats, previousStats) {

  // Calculate current period dstat
  let currentDstat = 0;
  if (position === "G") {
    currentDstat = 0;
  } else if (position === "D") {
    currentDstat = (currentStats["stats/toi"] || 0) / 20 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  } else { // Forward positions
    currentDstat = (currentStats["stats/toi"] || 0) / 30 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  }
  
  // Calculate previous period dstat
  let prevDstat = 0;
  if (previousStats) {
    if (position === "G") {
      prevDstat = 0;
    } else if (position === "D") {
      prevDstat = (previousStats["stats/toi"] || 0) / 20 + (previousStats["stats/blocks"] || 0) + (previousStats["stats/take"] || 0) - (previousStats["stats/give"] || 0);
    } else { // Forward positions
      prevDstat = (previousStats["stats/toi"] || 0) / 30 + (previousStats["stats/blocks"] || 0) + (previousStats["stats/take"] || 0) - (previousStats["stats/give"] || 0);
    }
  }
  
  // Calculate current period gstat
  let currentGstat = 0;
  if (position === "G") {
    currentGstat = 2 * (currentStats["stats/wins"] || 0) + (currentStats["stats/ties"] || 0) + 2 * (currentStats["stats/so"] || 0) + 0.15 * (currentStats["stats/sa"] || 0) - (currentStats["stats/ga"] || 0);
  }
  
  // Calculate previous period gstat
  let prevGstat = 0;
  if (previousStats && position === "G") {
    prevGstat = 2 * (previousStats["stats/wins"] || 0) + (previousStats["stats/ties"] || 0) + 2 * (previousStats["stats/so"] || 0) + 0.15 * (previousStats["stats/sa"] || 0) - (previousStats["stats/ga"] || 0);
  }
  
  // Calculate current period toughness
  let currentToughness = (position === "G") ? 0 : ((currentStats["stats/pim"] || 0) + (currentStats["stats/hits"] || 0));
  
  // Calculate previous period toughness
  let prevToughness = 0;
  if (previousStats && position !== "G") {
    prevToughness = (previousStats["stats/pim"] || 0) + (previousStats["stats/hits"] || 0);
  }
  
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


