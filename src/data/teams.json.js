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

// Function to calculate rankings for a specific stat across all teams
function calculateRankings(teams, period, statKey) {
  if (statKey === 'gstat') {
    return calculateGstatRankings(teams, period);
  }
  
  // Determine precision based on stat type
  let precision, multiplier;
  if (statKey === 'dstat') {
    precision = 0.0001; // 4 decimal places
    multiplier = 10000;
  } else {
    precision = 0; // Integer stats
    multiplier = 1;
  }
  
  const isFloatStat = statKey === 'dstat';
  
  // Get all values for this stat in this period
  const teamStats = teams.map(team => {
    let value = team[period]?.ACTIVE_TOTALS?.[statKey] || 0;
    // Round float values to avoid precision issues
    if (isFloatStat) {
      value = Math.round(value * multiplier) / multiplier;
    }
    return {
      team: team,
      value: value
    };
  });
  
  // Sort by value (descending - highest gets rank 32)
  teamStats.sort((a, b) => b.value - a.value);
  
  // Assign rankings with ties handled properly
  const rankings = {};
  let currentRank = teams.length; // Start with 32 (or total number of teams)
  let previousValue = null;
  let teamsAtCurrentRank = 0;
  
  teamStats.forEach((teamStat, index) => {
    // For float comparison, check if values are approximately equal
    const valuesEqual = isFloatStat ? 
      Math.abs(teamStat.value - (previousValue || 0)) < precision :
      previousValue === teamStat.value;
    
    if (previousValue === null || !valuesEqual) {
      // New value, so rank changes
      currentRank = teams.length - index;
      teamsAtCurrentRank = 1;
    } else {
      // Same value as previous, keep same rank
      teamsAtCurrentRank++;
    }
    
    rankings[teamStat.team.ABBR] = currentRank;
    previousValue = teamStat.value;
  });
  
  return rankings;
}

// Special function to calculate gstat rankings
function calculateGstatRankings(teams, period) {
  // Separate teams into those with goalie games and those without
  const teamsWithGoalieGames = [];
  const teamsWithoutGoalieGames = [];
  
  teams.forEach(team => {
    const roster = team[period]?.ROSTER || [];
    const goalieGamesPlayed = roster
      .filter(player => player.Position === "G" && player.Reserve !== "R")
      .reduce((total, goalie) => total + (goalie.GamesPlayed || 0), 0);
    
    // Round gstat value to 2 decimal places for consistent comparison
    let gstatValue = team[period]?.ACTIVE_TOTALS?.gstat || 0;
    gstatValue = Math.round(gstatValue * 100) / 100;
    
    const teamStat = {
      team: team,
      value: gstatValue,
      hasGoalieGames: goalieGamesPlayed > 0
    };
    
    if (goalieGamesPlayed > 0) {
      teamsWithGoalieGames.push(teamStat);
    } else {
      teamsWithoutGoalieGames.push(teamStat);
    }
  });
  
  // Sort teams with goalie games by gstat (descending)
  teamsWithGoalieGames.sort((a, b) => b.value - a.value);
  
  // Sort teams without goalie games by gstat (descending) for consistent ordering
  teamsWithoutGoalieGames.sort((a, b) => b.value - a.value);
  
  const rankings = {};
  const gstatPrecision = 0.01; // 2 decimal places precision
  
  // Assign rankings to teams with goalie games first (highest ranks)
  let currentRank = teams.length;
  let previousValue = null;
  
  teamsWithGoalieGames.forEach((teamStat, index) => {
    // Use precision comparison for gstat values
    const valuesEqual = previousValue !== null && 
      Math.abs(teamStat.value - previousValue) < gstatPrecision;
    
    if (!valuesEqual) {
      currentRank = teams.length - index;
    }
    rankings[teamStat.team.ABBR] = currentRank;
    previousValue = teamStat.value;
  });
  
  // Find the lowest rank assigned to teams with goalie games
  const lowestRankWithGames = teamsWithGoalieGames.length > 0 ? 
    Math.min(...teamsWithGoalieGames.map(t => rankings[t.team.ABBR])) : teams.length + 1;
  
  // Assign rankings to teams without goalie games (lower than all teams with games)
  let rankForNoGames = lowestRankWithGames - 1;
  previousValue = null;
  
  teamsWithoutGoalieGames.forEach((teamStat, index) => {
    // Use precision comparison for gstat values (teams without goalie games)
    const valuesEqual = previousValue !== null && 
      Math.abs(teamStat.value - previousValue) < gstatPrecision;
    
    if (!valuesEqual) {
      rankForNoGames = lowestRankWithGames - 1 - index;
    }
    rankings[teamStat.team.ABBR] = rankForNoGames;
    previousValue = teamStat.value;
  });
  
  return rankings;
}

// Function to calculate wins, losses, ties based on overall rank
function calculateRecordByRank(overallRank) {
  if (overallRank >= 1 && overallRank <= 4) {
    return { wins: 3, losses: 0, ties: 0 };
  } else if (overallRank >= 5 && overallRank <= 7) {
    return { wins: 2, losses: 0, ties: 1 };
  } else if (overallRank >= 8 && overallRank <= 12) {
    return { wins: 2, losses: 1, ties: 0 };
  } else if (overallRank === 13) {
    return { wins: 1, losses: 0, ties: 2 };
  } else if (overallRank >= 14 && overallRank <= 19) {
    return { wins: 1, losses: 1, ties: 1 };
  } else if (overallRank >= 20 && overallRank <= 24) {
    return { wins: 1, losses: 2, ties: 0 };
  } else if (overallRank === 25) {
    return { wins: 0, losses: 1, ties: 2 };
  } else if (overallRank >= 26 && overallRank <= 28) {
    return { wins: 0, losses: 2, ties: 1 };
  } else if (overallRank >= 29 && overallRank <= 32) {
    return { wins: 0, losses: 3, ties: 0 };
  } else {
    // Default case for ranks outside expected range
    return { wins: 0, losses: 0, ties: 0 };
  }
}

// Function to calculate overall rankings based on sum of individual ranks
function calculateOverallRankings(teams, period, individualRankings) {
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  
  // Calculate total rank for each team
  const teamTotals = teams.map(team => {
    const totalRank = statKeys.reduce((sum, statKey) => sum + (individualRankings[statKey][team.ABBR] || 0), 0);
    
    return {
      team: team,
      totalRank: totalRank,
      // Include individual values for tiebreaking
      goals: team[period]?.ACTIVE_TOTALS?.goals || 0,
      assists: team[period]?.ACTIVE_TOTALS?.assists || 0,
      toughness: team[period]?.ACTIVE_TOTALS?.toughness || 0,
      dstat: team[period]?.ACTIVE_TOTALS?.dstat || 0,
      gstat: team[period]?.ACTIVE_TOTALS?.gstat || 0
    };
  });
  
  // Sort by total rank (ascending - lower total rank is better), then by tiebreakers
  teamTotals.sort((a, b) => {
    // First sort by total rank (ascending)
    if (a.totalRank !== b.totalRank) {
      return b.totalRank - a.totalRank;
    }
    
    // Tiebreakers in order: goals, assists, toughness, dstat, gstat (all descending)
    if (a.goals !== b.goals) return b.goals - a.goals;
    if (a.assists !== b.assists) return b.assists - a.assists;
    if (a.toughness !== b.toughness) return b.toughness - a.toughness;
    if (a.dstat !== b.dstat) return b.dstat - a.dstat;
    return b.gstat - a.gstat;
  });
  
  // Assign overall rankings with ties handled properly
  const overallRankings = {};
  let currentRank = 1;
  let previousTotalRank = null;
  let previousTiebreakers = null;
  
  teamTotals.forEach((teamTotal, index) => {
    const currentTiebreakers = {
      goals: teamTotal.goals,
      assists: teamTotal.assists,
      toughness: teamTotal.toughness,
      dstat: teamTotal.dstat,
      gstat: teamTotal.gstat
    };
    
    // Check if this team has the same total rank and all tiebreakers as the previous team
    const isTie = previousTotalRank === teamTotal.totalRank &&
      previousTiebreakers &&
      previousTiebreakers.goals === currentTiebreakers.goals &&
      previousTiebreakers.assists === currentTiebreakers.assists &&
      previousTiebreakers.toughness === currentTiebreakers.toughness &&
      previousTiebreakers.dstat === currentTiebreakers.dstat &&
      previousTiebreakers.gstat === currentTiebreakers.gstat;
    
    if (!isTie && index > 0) {
      currentRank = index + 1;
    }
    
    overallRankings[teamTotal.team.ABBR] = currentRank;
    previousTotalRank = teamTotal.totalRank;
    previousTiebreakers = currentTiebreakers;
  });
  
  return overallRankings;
}

// Function to create team rankings double array
function createTeamRankings(teams, availablePeriods) {
  const teamRankings = [];
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  
  availablePeriods.forEach((period, periodIndex) => {
    // Initialize period array
    teamRankings[periodIndex] = [];
    
    // Calculate individual stat rankings for this period
    const individualRankings = {};
    statKeys.forEach(statKey => {
      individualRankings[statKey] = calculateRankings(teams, period, statKey);
    });
    
    // Calculate overall rankings for this period
    const overallRankings = calculateOverallRankings(teams, period, individualRankings);
    
    // Create rankings data for each team for this period
    teams.forEach(team => {
      const activeTotals = team[period]?.ACTIVE_TOTALS || {};
      const teamOverallRank = overallRankings[team.ABBR] || 0;
      const record = calculateRecordByRank(teamOverallRank);
      
      teamRankings[periodIndex].push({
        period: period,
        team: team.ABBR,
        // Stat totals
        goals: activeTotals.goals || 0,
        assists: activeTotals.assists || 0,
        toughness: activeTotals.toughness || 0,
        dstat: activeTotals.dstat || 0,
        gstat: activeTotals.gstat || 0,
        // Individual stat rankings
        goalsRank: individualRankings.goals[team.ABBR] || 0,
        assistsRank: individualRankings.assists[team.ABBR] || 0,
        toughnessRank: individualRankings.toughness[team.ABBR] || 0,
        dstatRank: individualRankings.dstat[team.ABBR] || 0,
        gstatRank: individualRankings.gstat[team.ABBR] || 0,
        // Overall ranking
        overall: individualRankings.goals[team.ABBR] + individualRankings.assists[team.ABBR] + individualRankings.toughness[team.ABBR] + individualRankings.dstat[team.ABBR] + individualRankings.gstat[team.ABBR],
        overallRank: teamOverallRank,
        // Record based on overall rank
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
        record: `${record.wins}-${record.losses}-${record.ties}`
      });
    });
  });
  
  // Calculate overall standings by summing across all periods
  const overallStandings = [];
  const teamAbbrs = teams.map(team => team.ABBR);
  
  teamAbbrs.forEach(teamAbbr => {
    let totalGoals = 0;
    let totalAssists = 0;
    let totalToughness = 0;
    let totalDstat = 0;
    let totalGstat = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    
    // Get team info for full name
    const teamInfo = teams.find(t => t.ABBR === teamAbbr);
    
    // Sum across all periods for this team
    teamRankings.forEach(periodData => {
      const teamData = periodData.find(t => t.team === teamAbbr);
      if (teamData) {
        totalGoals += teamData.goals || 0;
        totalAssists += teamData.assists || 0;
        totalToughness += teamData.toughness || 0;
        totalDstat += teamData.dstat || 0;
        totalGstat += teamData.gstat || 0;
        totalWins += teamData.wins || 0;
        totalLosses += teamData.losses || 0;
        totalTies += teamData.ties || 0;
      }
    });
    
    overallStandings.push({
      team: teamAbbr,
      teamName: teamInfo.NAME,
      division: teamInfo.DIVISION,
      goals: totalGoals,
      assists: totalAssists,
      toughness: totalToughness,
      dstat: totalDstat,
      gstat: totalGstat,
      wins: totalWins,
      losses: totalLosses,
      ties: totalTies,
      points: totalWins * 2 + totalTies // Standard hockey points calculation
    });
  });
  
  // Sort overall standings by points (descending), then by wins (descending)
  overallStandings.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.goals !== b.goals) return b.goals - a.goals;
    return b.assists - a.assists;
  });
  
  // Add overall ranking based on standings position
  overallStandings.forEach((team, index) => {
    team.overallRank = index + 1;
  });
  
  // Return object with both period rankings and overall standings
  return {
    periods: teamRankings,
    overallStandings: overallStandings
  };
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
    pim: (currentStats.pos === "G") ? null : ((currentStats["stats/pim"] || 0) - (previousStats?.["stats/pim"] || 0)),
    hits: (currentStats.pos === "G") ? null : ((currentStats["stats/hits"] || 0) - (previousStats?.["stats/hits"] || 0)),
    toughness: (currentStats.pos === "G") ? null : (currentToughness - prevToughness),
    blocks: (currentStats.pos === "G") ? null : ((currentStats["stats/blocks"] || 0) - (previousStats?.["stats/blocks"] || 0)),
    take: (currentStats.pos === "G") ? null : ((currentStats["stats/take"] || 0) - (previousStats?.["stats/take"] || 0)),
    give: (currentStats.pos === "G") ? null : ((currentStats["stats/give"] || 0) - (previousStats?.["stats/give"] || 0)),
    toi:  (currentStats.pos === "G") ? null : ((currentStats["stats/toi"] || 0) - (previousStats?.["stats/toi"] || 0)),
    dstat: (currentStats.pos === "G") ? null : (currentDstat - prevDstat),
    wins: (currentStats.pos === "G") ? ((currentStats["stats/wins"] || 0) - (previousStats?.["stats/wins"] || 0)) : null,
    losses: (currentStats.pos === "G") ? ((currentStats["stats/losses"] || 0) - (previousStats?.["stats/losses"] || 0)) : null,
    ties: (currentStats.pos === "G") ? ((currentStats["stats/ties"] || 0) - (previousStats?.["stats/ties"] || 0)) : null,
    so: (currentStats.pos === "G") ? ((currentStats["stats/so"] || 0) - (previousStats?.["stats/so"] || 0)) : null,
    sa: (currentStats.pos === "G") ? ((currentStats["stats/sa"] || 0) - (previousStats?.["stats/sa"] || 0)) : null,
    ga: (currentStats.pos === "G") ? ((currentStats["stats/ga"] || 0) - (previousStats?.["stats/ga"] || 0)) : null,
    gstat: currentGstat,
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
        Goals: info.Pos === "G" ? null : playerStats.goals,
        Assists: info.Pos === "G" ? null : playerStats.assists,
        PIM: info.Pos === "G" ? null : playerStats.pim,
        Hits: info.Pos === "G" ? null : playerStats.hits,
        Blocks: info.Pos === "G" ? null : playerStats.blocks,
        Take: info.Pos === "G" ? null : playerStats.take,
        Give: info.Pos === "G" ? null : playerStats.give,
        TOI: info.Pos === "G" ? null : playerStats.toi,
        Record: info.Pos === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
        SO: info.Pos === "G" ? (playerStats.so || 0) : null,
        SA: info.Pos === "G" ? (playerStats.sa || 0) : null,
        GA: info.Pos === "G" ? (playerStats.ga || 0) : null,
        Toughness: info.Pos === "G" ? null : playerStats.toughness,
        DStat: info.Pos === "G" ? null : playerStats.dstat,
        GStat: info.Pos === "G" ? (playerStats.gstat || 0) : null,
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

    team[periodInfo.period]['TOTAL_COUNTS'] = team[periodInfo.period]['ROSTER']
      .reduce((counts, player) => ({
        G: counts.G + (player.Position === "G" ? 1 : 0),
        D: counts.D + (player.Position === "D" ? 1 : 0),
        F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
      }), { F: 0, D: 0, G: 0 });

    team[periodInfo.period]['ACTIVE_COUNTS'] = team[periodInfo.period]['ROSTER']
      .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
      .reduce((counts, player) => ({
        G: counts.G + (player.Position === "G" ? 1 : 0),
        D: counts.D + (player.Position === "D" ? 1 : 0),
        F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
      }), { F: 0, D: 0, G: 0 });

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

  team['LatestSalary'] = team[availablePeriods[availablePeriods.length-1]]['TOTAL_SALARY'];
  team['SalaryPerPeriod'] = team['LatestSalary'] / 25;
  team['Budget'] = team.CASH - team['SalaryPerPeriod'] * (26 - availablePeriods.length);
  team['AddSalary'] = availablePeriods.length < 22 ? team['Budget']*25 / (25 - availablePeriods.length) : '---';
  team['TotalPlayerCount'] = `(${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].F}-${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].D}-${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].G}) ${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].F+team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].D+team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].G}`;
  team['ActivePlayerCount'] = `(${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].F}-${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].D}-${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].G}) ${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].F+team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].D+team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].G}`;

  return team;
});

// Create team rankings object
const teamRankings = createTeamRankings(teamData, availablePeriods);

process.stdout.write(JSON.stringify({ teams: teamData, rankings: teamRankings, availablePeriods: availablePeriods }));
//process.stdout.write(JSON.stringify(teamRankings));