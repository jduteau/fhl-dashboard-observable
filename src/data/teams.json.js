import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

const teamInfo = await csvParse(stripBom(readFileSync("src/data/team_info.csv", "utf-8")));
const teamCash = await csvParse(stripBom(readFileSync("src/data/team_cash.csv", "utf-8")), (row) => {
  return {  ABBR: row.ABBR, CASH: +row.CASH };
});
const owners = await csvParse(stripBom(readFileSync("src/data/owners.csv", "utf-8")));

const contracts = await csvParse(stripBom(readFileSync("src/data/contracts.csv", "utf-8")), (row) => {
  return { ID: row.ID, Salary: +row.Salary, Contract: row.Contract };
});
const playerInfo = await csvParse(stripBom(readFileSync("src/data/player_info.csv", "utf-8")), (row) => {
  return { ID: row.ID, Name: row.Name, BirthDate: new Date(row.BirthDate), Pos: row.Pos, NHL: row.NHL };
});

function readStatsFile(fileName) {
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
const statsPeriods = [
  { period: 1, data: await readStatsFile("src/data/stats_p01.csv") },
  { period: 2, data: await readStatsFile("src/data/stats_p02.csv") },
  { period: 3, data: await readStatsFile("src/data/stats_p03.csv") },
  // Add more periods here as files become available:
  // { period: 4, data: await readStatsFile("src/data/stats_p04.csv") },
  // etc...
];

//  Load period-specific roster files (add more as files become available)
const rosterPeriods = [
  { period: 1, data: await csvParse(stripBom(readFileSync("src/data/rosters_p01.csv", "utf-8"))) },
  { period: 2, data: await csvParse(stripBom(readFileSync("src/data/rosters_p02.csv", "utf-8"))) },
  { period: 3, data: await csvParse(stripBom(readFileSync("src/data/rosters_p03.csv", "utf-8"))) },
  // Add more periods here as files become available:
  // { period: 4, data: await csvParse(stripBom(readFileSync("src/data/rosters_p04.csv", "utf-8"))) },
  // etc...
];

const statsData = {};
const rosterData = {};

// Populate statsData and rosterData
statsPeriods.forEach(periodInfo => {
  statsData[periodInfo.period] = periodInfo.data;
});

rosterPeriods.forEach(periodInfo => {
  rosterData[periodInfo.period] = periodInfo.data;
});

const availablePeriods = Object.keys(statsData).map(Number).sort((a, b) => a - b);

// Function to map positions to G, D, or F
function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F"; // All other positions (C, LW, RW, F, etc.) become F
}

// Function to calculate age as of September 15 of current year
function calculateAge(birthDateStr) {
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
function getStatsForPeriod(currentStats, previousStats) {

  // Calculate current period dstat
  let currentDstat = 0;
  if (currentStats.pos === "G") {
    currentDstat = 0;
  } else if (currentStats.pos === "D") {
    currentDstat = (currentStats["stats/toi"] || 0) / 20 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  } else { // Forward positions
    currentDstat = (currentStats["stats/toi"] || 0) / 30 + (currentStats["stats/blocks"] || 0) + (currentStats["stats/take"] || 0) - (currentStats["stats/give"] || 0);
  }
  
  // Calculate previous period dstat
  let prevDstat = 0;
  if (previousStats) {
    if (previousStats.pos === "G") {
      prevDstat = 0;
    } else if (previousStats.pos === "D") {
      prevDstat = (previousStats["stats/toi"] || 0) / 20 + (previousStats["stats/blocks"] || 0) + (previousStats["stats/take"] || 0) - (previousStats["stats/give"] || 0);
    } else { // Forward positions
      prevDstat = (previousStats["stats/toi"] || 0) / 30 + (previousStats["stats/blocks"] || 0) + (previousStats["stats/take"] || 0) - (previousStats["stats/give"] || 0);
    }
  }
  
  // Calculate current period gstat
  let currentGstat = null;
  if (currentStats.pos === "G") {
    currentGstat = 2 * (currentStats["stats/wins"] || 0) + (currentStats["stats/ties"] || 0) + 2 * (currentStats["stats/so"] || 0) + 0.15 * (currentStats["stats/sa"] || 0) - (currentStats["stats/ga"] || 0);
  }
  
  // Calculate previous period gstat
  let prevGstat = null;
  if (previousStats && previousStats.pos === "G") {
    prevGstat = 2 * (previousStats["stats/wins"] || 0) + (previousStats["stats/ties"] || 0) + 2 * (previousStats["stats/so"] || 0) + 0.15 * (previousStats["stats/sa"] || 0) - (previousStats["stats/ga"] || 0);
  }
  
  // Calculate gstat difference (only for goalies)
  let gstatDiff = null;
  if (currentStats.pos === "G") {
    gstatDiff = (currentGstat || 0) - (prevGstat || 0);
  }
  
  // Calculate current period toughness
  let currentToughness = (currentStats.pos === "G") ? 0 : ((currentStats["stats/pim"] || 0) + (currentStats["stats/hits"] || 0));
  
  // Calculate previous period toughness
  let prevToughness = 0;
  if (previousStats && previousStats.pos !== "G") {
    prevToughness = (previousStats["stats/pim"] || 0) + (previousStats["stats/hits"] || 0);
  }
  
  return {
    hockeyRef: currentStats.hockeyRef,
    team: currentStats.team,
    goals: (currentStats.pos === "G") ? null : ((currentStats["stats/goals"] || 0) - (previousStats?.["stats/goals"] || 0)),
    assists: (currentStats.pos === "G") ? null : ((currentStats["stats/assists"] || 0) - (previousStats?.["stats/assists"] || 0)),
    toughness: (currentStats.pos === "G") ? null : (currentToughness - prevToughness),
    dstat: (currentStats.pos === "G") ? null : (currentDstat - prevDstat),
    gstat: gstatDiff,
    games_played: (currentStats["stats/gp"] || 0) - (previousStats?.["stats/gp"] || 0)
  };
}


    
const teamData = teamInfo.map(team => {
  const cashInfo = teamCash.find(cash => cash.ABBR === team.ABBR);
  team['CASH'] = cashInfo.CASH;
  const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
  team['OWNER'] = ownerInfo.OWNER;
  team['EMAIL'] = ownerInfo.EMAIL;
  team['LOCATION'] = ownerInfo.LOCATION;

  // Add period-specific rosters with salaries  
  rosterPeriods.forEach(periodInfo => {
    team[periodInfo.period] = {};
    const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
    const currentStats = statsData[periodInfo.period];
    const previousStats = (periodInfo.period > 1) ? statsData[periodInfo.period - 1] : [];
    team[periodInfo.period]['ROSTER'] = roster.map(player => {
      const info = playerInfo.find(p => p.ID === player.ID);
      const contract = contracts.find(c => c.ID === player.ID);
      const playerStats = getStatsForPeriod(currentStats.find(s => s.hockeyRef === player.ID) || {}, previousStats.find(s => s.hockeyRef === player.ID) || {}); 
      return {
        PLAYER_ID: player.PLAYER_ID,
        Name: info.Name,
        BirthDate: info.BirthDate,
        Age: calculateAge(info.BirthDate),
        Position: mapPosition(info.Pos),
        NHLTeam: info.NHL,
        Salary: contract.Salary,
        Contract: contract.Contract,
        Reserve: player.RESERVE,
        Goals: playerStats.goals,
        Assists: playerStats.assists,
        Toughness: playerStats.toughness,
        DStat: playerStats.dstat,
        GStat: playerStats.gstat,
        GamesPlayed: playerStats.games_played,
      };
    });
    team[periodInfo.period]['ROSTER'].sort((a, b) => {
      const posOrder = { 'G': 3, 'D': 1, 'F': 2 };
      if (posOrder[a.Position] !== posOrder[b.Position]) {
        return posOrder[a.Position] - posOrder[b.Position];
      }
      if (a.Reserve !== b.Reserve) {
        return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
      }
      return a.GamesPlayed - b.GamesPlayed;
    });
    team[periodInfo.period]['TOTAL_SALARY'] = team[periodInfo.period]['ROSTER'].reduce((sum, p) => sum + (p.Salary || 0), 0);
    team[periodInfo.period]['ACTIVE_TOTALS'] = team[periodInfo.period]['ROSTER']
      .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.DStat || 0),
        gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
    team[periodInfo.period]['RESERVE_TOTALS'] = team[periodInfo.period]['ROSTER']
      .filter(player => player.Reserve === "R")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.DStat || 0),
        gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

  });

  return team;
});

const teams = {};
teamData.forEach(team => {
  teams[team.ABBR] = team;
});

process.stdout.write(JSON.stringify({ teams: teams, availablePeriods: availablePeriods }));
