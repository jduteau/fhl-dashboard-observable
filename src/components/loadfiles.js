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
export const statsPeriods = [
  { period: 1, data: await readStatsFile("src/data/stats_p01.csv") },
  { period: 2, data: await readStatsFile("src/data/stats_p02.csv") },
  { period: 3, data: await readStatsFile("src/data/stats_p03.csv") },
  { period: 4, data: await readStatsFile("src/data/stats_p04.csv") },
  // Add more periods here as files become available:
  // { period: 4, data: await readStatsFile("src/data/stats_p04.csv") },
  // etc...
];

//  Load period-specific roster files (add more as files become available)
export const rosterPeriods = [
  { period: 1, data: await csvParse(stripBom(readFileSync("src/data/rosters_p01.csv", "utf-8"))) },
  { period: 2, data: await csvParse(stripBom(readFileSync("src/data/rosters_p02.csv", "utf-8"))) },
  { period: 3, data: await csvParse(stripBom(readFileSync("src/data/rosters_p03.csv", "utf-8"))) },
  { period: 4, data: await csvParse(stripBom(readFileSync("src/data/rosters_p04.csv", "utf-8"))) },
  // Add more periods here as files become available:
  // { period: 4, data: await csvParse(stripBom(readFileSync("src/data/rosters_p04.csv", "utf-8"))) },
  // etc...
];

export const statsData = {};
export const rosterData = {};

// Populate statsData and rosterData
statsPeriods.forEach(periodInfo => {
  statsData[periodInfo.period] = periodInfo.data;
});

rosterPeriods.forEach(periodInfo => {
  rosterData[periodInfo.period] = periodInfo.data;
});

export const availablePeriods = [...Object.keys(statsData)];

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
  let currentGstat = null;
  if (position === "G") {
    currentGstat = 2 * (currentStats["stats/wins"] || 0) + (currentStats["stats/ties"] || 0) + 2 * (currentStats["stats/so"] || 0) + 0.15 * (currentStats["stats/sa"] || 0) - (currentStats["stats/ga"] || 0);
  }
  
  // Calculate previous period gstat
  let prevGstat = null;
  if (previousStats && position === "G") {
    prevGstat = 2 * (previousStats["stats/wins"] || 0) + (previousStats["stats/ties"] || 0) + 2 * (previousStats["stats/so"] || 0) + 0.15 * (previousStats["stats/sa"] || 0) - (previousStats["stats/ga"] || 0);
  }
  
  // Calculate gstat difference (only for goalies)
  let gstatDiff = null;
  if (position === "G") {
    gstatDiff = (currentGstat || 0) - (prevGstat || 0);
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
    gstat: currentGstat,
    gstat: gstatDiff,
    games_played: (currentStats["stats/gp"] || 0) - (previousStats?.["stats/gp"] || 0)
  };
}

