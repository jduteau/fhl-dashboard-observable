import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

const teamInfo = await csvParse(stripBom(readFileSync("src/data/team_info.csv", "utf-8")));
const teams = teamInfo.map(team=>team.ABBR).sort();

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

const availablePeriods = [...Object.keys(statsData),"OVERALL"];

const rankingCategories = {
  "Goals": { min: 0, max: 0 },
  "Assists": { min: 0, max: 0 },
  "Toughness": { min: 0, max: 0 },
  "DStat": { min: 0, max: 0 }, 
  "GStat": { min: 0, max: 0 }
}

statsPeriods[statsPeriods.length - 1].data.forEach(player => {
  const info = playerInfo.find(p => p.ID === player.ID);
  if (!info) return;
  // Determine max for each category
  if (info.Pos !== "G") {
    if (player['stats/goals'] > rankingCategories.Goals.max) {
      rankingCategories.Goals.max = player['stats/goals'];
    }
    if (player['stats/assists'] > rankingCategories.Assists.max) {
      rankingCategories.Assists.max = player['stats/assists'];
    }
    const toughness = (player["stats/pim"] || 0) + (player["stats/hits"] || 0);
    if (toughness > rankingCategories.Toughness.max) {
      rankingCategories.Toughness.max = toughness;
    }
    const toiDivisor = info.Pos === "D" ? 20 : 30;
    const dstat = (player["stats/blocks"] || 0) + 
                  (player["stats/take"] || 0) - 
                  (player["stats/give"] || 0) + 
                  ((player["stats/toi"] || 0) / toiDivisor);
    if (dstat > rankingCategories.DStat.max) {
      rankingCategories.DStat.max = dstat;
    }
    // Determine min for each category 
    if (player['stats/goals'] < rankingCategories.Goals.min) {
      rankingCategories.Goals.min = player['stats/goals'];
    }
    if (player['stats/assists'] < rankingCategories.Assists.min) {
      rankingCategories.Assists.min = player['stats/assists'];
    }
    if (toughness < rankingCategories.Toughness.min) {
      rankingCategories.Toughness.min = toughness;
    }
    if (dstat < rankingCategories.DStat.min) {
      rankingCategories.DStat.min = dstat;
    }
  } else {
    // Calculate GStat: 2 * wins + ties + 2 * shutouts + 0.15 * shots_against - goals_against
    const gstat = 2 * (player["stats/wins"] || 0) + 
                  (player["stats/ties"] || 0) + 
                  2 * (player["stats/so"] || 0) + 
                  0.15 * (player["stats/sa"] || 0) - 
                  (player["stats/ga"] || 0);
    if (gstat > rankingCategories.GStat.max) {
      rankingCategories.GStat.max = gstat;
    }
    if (gstat < rankingCategories.GStat.min) {
      rankingCategories.GStat.min = gstat;
    }
  }
});

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
function getStatsForPeriod(position, currentStats, previousStats) {

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
    gstat: gstatDiff,
    games_played: (currentStats["stats/gp"] || 0) - (previousStats?.["stats/gp"] || 0)
  };
}

// Function to get stats for the selected period
function getOverallStats(position, currentStats) {

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
  
  // Calculate overall ranking

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
  };
}

const teamData = teamInfo.map(team => {

  team["OVERALL"] = {};
  const roster = rosterPeriods[rosterPeriods.length - 1].data.filter(player => player.ABBR === team.ABBR);
  const currentStats = statsPeriods[rosterPeriods.length - 1].data;
  team["OVERALL"]['ROSTER'] = roster.map(player => {
    const info = playerInfo.find(p => p.ID === player.ID);
    const contract = contracts.find(c => c.ID === player.ID);
    const position = mapPosition(info.Pos);
    const playerStats = getOverallStats(position, currentStats.find(s => s.hockeyRef === player.ID) || {}); 
    return {
      PLAYER_ID: player.PLAYER_ID,
      Name: info.Name,
      BirthDate: info.BirthDate,
      Age: calculateAge(info.BirthDate),
      Position: position,
      NHLTeam: info.NHL,
      Salary: contract.Salary,
      Contract: contract.Contract,
      Reserve: "",
      Goals: position === "G" ? null : playerStats.goals,
      Assists: position === "G" ? null : playerStats.assists,
      PIM: position === "G" ? null : playerStats.pim,
      Hits: position === "G" ? null : playerStats.hits,
      Blocks: position === "G" ? null : playerStats.blocks,
      Take: position === "G" ? null : playerStats.take,
      Give: position === "G" ? null : playerStats.give,
      TOI: position === "G" ? null : playerStats.toi,
      Record: position === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
      SO: position === "G" ? (playerStats.so || 0) : null,
      SA: position === "G" ? (playerStats.sa || 0) : null,
      GA: position === "G" ? (playerStats.ga || 0) : null,
      Toughness: position === "G" ? null : playerStats.toughness,
      DStat: position === "G" ? null : playerStats.dstat,
      GStat: position === "G" ? (playerStats.gstat || 0) : null,
      GamesPlayed: playerStats.games_played,
    };
  });
  team["OVERALL"]['ACTIVE_TOTALS'] = team["OVERALL"]['ROSTER']
    .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
    .reduce((totals, player) => ({
      goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
      assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
      toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
      dstat: totals.dstat + (player.DStat || 0),
      gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
    }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

  team["OVERALL"]['RESERVE_TOTALS'] = { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 };

  // Add period-specific rosters with salaries  
  rosterPeriods.forEach(periodInfo => {
    team[periodInfo.period] = {};
    const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
    const currentStats = statsData[periodInfo.period];
    const previousStats = (periodInfo.period > 1) ? statsData[periodInfo.period - 1] : [];
    team[periodInfo.period]['ROSTER'] = roster.map(player => {
      const info = playerInfo.find(p => p.ID === player.ID);
      const contract = contracts.find(c => c.ID === player.ID);
      const position = mapPosition(info.Pos);
      const playerStats = getStatsForPeriod(position, currentStats.find(s => s.hockeyRef === player.ID) || {}, previousStats.find(s => s.hockeyRef === player.ID) || {}); 
      return {
        PLAYER_ID: player.PLAYER_ID,
        Name: info.Name,
        BirthDate: info.BirthDate,
        Age: calculateAge(info.BirthDate),
        Position: position,
        NHLTeam: info.NHL,
        Salary: contract.Salary,
        Contract: contract.Contract,
        Reserve: player.RESERVE,
        Goals: position === "G" ? null : playerStats.goals,
        Assists: position === "G" ? null : playerStats.assists,
        PIM: position === "G" ? null : playerStats.pim,
        Hits: position === "G" ? null : playerStats.hits,
        Blocks: position === "G" ? null : playerStats.blocks,
        Take: position === "G" ? null : playerStats.take,
        Give: position === "G" ? null : playerStats.give,
        TOI: position === "G" ? null : playerStats.toi,
        Record: position === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
        SO: position === "G" ? (playerStats.so || 0) : null,
        SA: position === "G" ? (playerStats.sa || 0) : null,
        GA: position === "G" ? (playerStats.ga || 0) : null,
        Toughness: position === "G" ? null : playerStats.toughness,
        DStat: position === "G" ? null : playerStats.dstat,
        GStat: position === "G" ? (playerStats.gstat || 0) : null,
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

process.stdout.write(JSON.stringify({ teamData, teams, availablePeriods }));
//process.stdout.write(JSON.stringify(teamData[0]));