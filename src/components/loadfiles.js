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

// Only include FileAttachment calls for files that actually exist
export const statsPeriods = [];
export const statsData = {};
for (let i = 1; i <= 25; i++) {
  const paddedNum = i.toString().padStart(2, '0');
  try {
    const data = await readStatsFile(`src/data/static/stats/stats_p${paddedNum}.csv`);
    statsPeriods.push({ period: i, data });
    statsData[i] = data;
  } catch (error) {
    // File doesn't exist yet, skip
  }
}

//  Load period-specific roster files (add more as files become available)
export const rosterPeriods = [];
export const rosterData = {};
for (let i = 1; i <= 25; i++) {
  const paddedNum = i.toString().padStart(2, '0');
  try {
    const data = csvParse(stripBom(readFileSync(`src/data/static/rosters/rosters_p${paddedNum}.csv`, "utf-8")));
    rosterPeriods.push({ period: i, data });
    rosterData[i] = data;
  } catch (error) {
    // File doesn't exist yet, skip
  }
}

export const availablePeriods = [...Object.keys(statsData)];
export const lastPeriodNum = availablePeriods.length-1;

export const latestStatsFile = statsPeriods[lastPeriodNum].data;
export const latestRosterFile = rosterPeriods[lastPeriodNum].data;

// Load playoff round configuration
const playoffRoundsConfig = await readCsvFile("src/data/static/playoff_rounds.csv");

// Initialize playoff rounds array from configuration
export const playoffRounds = playoffRoundsConfig.map(config => ({
  round: parseInt(config.round),
  name: config.name,
  statsFile: null,
  rosterFile: null,
  available: false
}));

// Try to load playoff stats and roster files for each configured round
for (let i = 0; i < playoffRounds.length; i++) {
  const roundNum = playoffRounds[i].round;
  const paddedNum = roundNum.toString().padStart(2, '0');
  try {
    // Load stats file
    const statsFilename = `src/data/static/stats/stats_playoff_r${paddedNum}.csv`;
    const playoffStats = await readStatsFile(statsFilename);
    playoffRounds[i].statsFile = playoffStats;
    
    // Load roster file 
    const rosterFilename = `src/data/static/rosters/rosters_playoff_r${paddedNum}.csv`;
    const playoffRoster = await csvParse(stripBom(readFileSync(rosterFilename, "utf-8")));
    playoffRounds[i].rosterFile = playoffRoster;
    
    // Only mark as available if both files exist
    playoffRounds[i].available = true;
  } catch (error) {
    // Files don't exist yet, keep as unavailable
  }
}

export const availablePlayoffRounds = playoffRounds.filter(round => round.available);

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


// Extract goal distribution - count players by goal totals
const goalDistribution = {};
const assistDistribution = {};
const toughnessDistribution = {};
const dstatDistribution = {};
const gstatDistribution = {};

statsPeriods[lastPeriodNum].data.forEach(player => {
  if (player.pos === "G") {
    // Calculate GStat: 2 * wins + ties + 2 * shutouts + 0.15 * shots_against - goals_against
    const gstat = 2 * (player["stats/wins"] || 0) + 
                  (player["stats/ties"] || 0) + 
                  2 * (player["stats/so"] || 0) + 
                  0.15 * (player["stats/sa"] || 0) - 
                  (player["stats/ga"] || 0);
    
    // Round GStat to 2 decimal places for grouping
    const roundedGstat = Math.round(gstat * 100) / 100;
    if (gstatDistribution[roundedGstat]) {
      gstatDistribution[roundedGstat]++;
    } else {
      gstatDistribution[roundedGstat] = 1;
    }
  } else {  
    // Count goals
    const goals = player["stats/goals"] || 0;
    if (goalDistribution[goals]) {
      goalDistribution[goals]++;
    } else {
      goalDistribution[goals] = 1;
    }
    
    // Count assists
    const assists = player["stats/assists"] || 0;
    if (assistDistribution[assists]) {
      assistDistribution[assists]++;
    } else {
      assistDistribution[assists] = 1;
    }
    
    // Count toughness (PIM + Hits)
    const toughness = (player["stats/pim"] || 0) + (player["stats/hits"] || 0);
    if (toughnessDistribution[toughness]) {
      toughnessDistribution[toughness]++;
    } else {
      toughnessDistribution[toughness] = 1;
    }
    
    // Calculate DStat: blocks + take - give + toi / (20 if D else 30)
    const toiDivisor = player.pos === "D" ? 20 : 30;
    const dstat = (player["stats/blocks"] || 0) + 
                  (player["stats/take"] || 0) - 
                  (player["stats/give"] || 0) + 
                  ((player["stats/toi"] || 0) / toiDivisor);

    const roundedDstat = Math.round(dstat * 1000) / 1000;
    if (dstatDistribution[roundedDstat]) {
      dstatDistribution[roundedDstat]++;
    } else {
      dstatDistribution[roundedDstat] = 1;
    }
  }
});

// Convert to array format sorted by goal count
const goalRanges = Object.keys(goalDistribution)
  .map(goals => ({
    stat: parseInt(goals),
    playerCount: goalDistribution[goals]
  }))
  .sort((a, b) => a.stat - b.stat);

// Convert to array format sorted by assist count
const assistRanges = Object.keys(assistDistribution)
  .map(assists => ({
    stat: parseInt(assists),
    playerCount: assistDistribution[assists]
  }))
  .sort((a, b) => a.stat - b.stat);

// Convert to array format sorted by toughness count
const toughnessRanges = Object.keys(toughnessDistribution)
  .map(toughness => ({
    stat: parseInt(toughness),
    playerCount: toughnessDistribution[toughness]
  }))
  .sort((a, b) => a.stat - b.stat);

// Convert to array format sorted by dstat value
const dstatRanges = Object.keys(dstatDistribution)
  .map(dstat => ({
    stat: parseFloat(dstat),
    playerCount: dstatDistribution[dstat]
  }))
  .sort((a, b) => a.stat - b.stat);

// Convert to array format sorted by gstat value
const gstatRanges = Object.keys(gstatDistribution)
  .map(gstat => ({
    stat: parseFloat(gstat),
    playerCount: gstatDistribution[gstat]
  }))
  .sort((a, b) => a.stat - b.stat);


function getStatRating(stat, statRanges) {
  // Calculate stat ranking 
  const total = statRanges.map(entry => entry.playerCount).reduce((a, b) => a + b, 0);
  const below = statRanges.filter(entry => entry.stat < stat).map(entry => entry.playerCount).reduce((a, b) => a + b, 0);
  const at_stat = statRanges.find(entry => entry.stat === stat)?.playerCount || 0;
  return 100 * (below + 0.5 * at_stat) / total
}

function getOverallRanking(position, goals, assists, toughness, dstat, gstat) {
  // Calculate overall ranking
  return position === "G" ? getStatRating(gstat, gstatRanges) :
    (getStatRating(goals, goalRanges) +
    getStatRating(assists, assistRanges) +
    getStatRating(toughness, toughnessRanges) +
    getStatRating(dstat, dstatRanges))/4;
}


// Function to get stats for the selected period
export function getOverallStats(position, currentStats) {

  // Calculate current period dstat
  let dstat = 0;
  if (position === "G") {
    dstat = 0;
  } else if (position === "D") {
    dstat = (currentStats["stats/toi"] || 0) / 20 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  } else { // Forward positions
    dstat = (currentStats["stats/toi"] || 0) / 30 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  }
  
  // Calculate current period gstat
  let gstat = null;
  if (position === "G") {
    gstat = 2 * (currentStats["stats/wins"] || 0) + (currentStats["stats/ties"] || 0) + 2 * (currentStats["stats/so"] || 0) + 0.15 * (currentStats["stats/sa"] || 0) - (currentStats["stats/ga"] || 0);
  }

  // Calculate current period toughness
  let toughness = (position === "G") ? 0 : ((currentStats["stats/pim"] || 0) + (currentStats["stats/hits"] || 0));
  
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
    toi:  (position === "G") ? null : (currentStats["stats/toi"] || 0),
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
}



