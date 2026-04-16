import {readCsvFile, readStatsFile, playoffRounds, availablePlayoffRounds, mapPosition} from "../components/loadfiles.js";

// Load team info for bracket structure
export const teamInfo = await readCsvFile("src/data/static/team_info.csv");

// Load playoff bracket configuration from CSV
const bracketConfig = await readCsvFile("src/data/static/playoff_bracket.csv");

// Transform bracket CSV data into structured format
const playoffBracket = {
  rounds: [
    { round: 1, name: "First Round", matchups: [] },
    { round: 2, name: "Conference Semi-Finals", matchups: [] },
    { round: 3, name: "Conference Finals", matchups: [] },
    { round: 4, name: "Stanley Cup Final", matchups: [] }
  ]
};

// Populate matchups from CSV data
bracketConfig.forEach(row => {
  const roundIndex = row.round - 1;
  if (roundIndex >= 0 && roundIndex < playoffBracket.rounds.length) {
    playoffBracket.rounds[roundIndex].matchups.push({
      matchup: parseInt(row.matchup),
      team1: row.team1,
      team2: row.team2
    });
  }
});

// Function to calculate team stats for a playoff round using roster files
function calculateTeamStats(round, teamAbbr) {
  if (!round.statsFile || !round.rosterFile) return null;
  
  // Get players rostered to this FHL team from the roster file
  const teamRoster = round.rosterFile.filter(player => player.ABBR === teamAbbr);
  
  // Get the hockeyRef IDs (player IDs) for this team
  const teamPlayerIds = teamRoster.map(player => player.ID);
  
  // Find stats for these specific players in the stats file
  const teamPlayers = round.statsFile.filter(player => teamPlayerIds.includes(player.hockeyRef));
  
  // Calculate team totals
  let teamTotals = {
    goals: 0,
    assists: 0,
    points: 0,
    pim: 0,
    hits: 0,
    toughness: 0,
    blocks: 0,
    takeaways: 0,
    giveaways: 0,
    toi: 0,
    dstat: 0,
    gstat: 0,
    gp: 0
  };

  teamPlayers.forEach(player => {
    const position = mapPosition(player.pos);
    
    teamTotals.goals += player["stats/goals"] || 0;
    teamTotals.assists += player["stats/assists"] || 0;
    teamTotals.points += (player["stats/goals"] || 0) + (player["stats/assists"] || 0);
    teamTotals.pim += player["stats/pim"] || 0;
    teamTotals.hits += player["stats/hits"] || 0;
    teamTotals.toughness += (player["stats/pim"] || 0) + (player["stats/hits"] || 0);
    teamTotals.blocks += player["stats/blocks"] || 0;
    teamTotals.takeaways += player["stats/take"] || 0;
    teamTotals.giveaways += player["stats/give"] || 0;
    teamTotals.toi += player["stats/toi"] || 0;
    
    // Calculate D-stat by position
    if (position === "D") {
      teamTotals.dstat += (player["stats/toi"] || 0) / 20 + (player["stats/blocks"] || 0) + (player["stats/take"] || 0) - (player["stats/give"] || 0);
    } else if (position === "F") {
      teamTotals.dstat += (player["stats/toi"] || 0) / 30 + (player["stats/blocks"] || 0) + (player["stats/take"] || 0) - (player["stats/give"] || 0);
    }
    
    // Calculate G-stat for goalies
    if (position === "G") {
      teamTotals.gstat += 2 * (player["stats/wins"] || 0) + (player["stats/ties"] || 0) + 2 * (player["stats/so"] || 0) + 0.15 * (player["stats/sa"] || 0) - (player["stats/ga"] || 0);
    }
    
    teamTotals.gp += player["stats/gp"] || 0;
  });

  const teamData = teamInfo.find(t => t.ABBR === teamAbbr);
  
  return {
    abbr: teamAbbr,
    name: teamData ? teamData.NAME : teamAbbr,
    division: teamData ? teamData.DIVISION : "Unknown",
    ...teamTotals,
    playerCount: teamPlayers.length
  };
}

// Load and process playoff data for each available round
const playoffData = {};

// First, calculate all team stats for rankings
const allTeamStats = {};

availablePlayoffRounds.forEach(round => {
  playoffData[round.round] = {
    ...round,
    matchups: []
  };
  
  // Calculate stats for all teams in this round for ranking purposes
  const allTeams = [...new Set(bracketConfig.map(row => [row.team1, row.team2]).flat())];
  const roundTeamStats = [];
  
  allTeams.forEach(teamAbbr => {
    const teamStats = calculateTeamStats(round, teamAbbr);
    if (teamStats) {
      roundTeamStats.push(teamStats);
    }
  });
  
// Function to calculate rankings for a specific stat across all teams (matches standings logic)
function calculateRankings(teams, statKey) {
  if (statKey === 'gstat') {
    return calculateGstatRankings(teams);
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
  
  // Get all values for this stat
  const teamStats = teams.map(team => {
    let value = team[statKey] || 0;
    // Round float values to avoid precision issues
    if (isFloatStat) {
      value = Math.round(value * multiplier) / multiplier;
    }
    return {
      team: team,
      value: value
    };
  });
  
  // Sort by value (descending - highest gets rank equal to team count)
  teamStats.sort((a, b) => b.value - a.value);
  
  // Assign rankings with ties handled properly
  const rankings = {};
  let currentRank = teams.length; // Start with total number of teams
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
    
    rankings[teamStat.team.abbr] = currentRank;
    previousValue = teamStat.value;
  });
  
  return rankings;
}

// Special function to calculate gstat rankings (matches standings logic)
function calculateGstatRankings(teams) {
  // Separate teams into those with goalie games and those without
  const teamsWithGoalieGames = [];
  const teamsWithoutGoalieGames = [];
  
  teams.forEach(team => {
    // Check if team has any gstat value (indicating goalie games played)
    const hasGoalieGames = (team.gstat || 0) > 0;
    
    // Round gstat value to 2 decimal places for consistent comparison
    let gstatValue = team.gstat || 0;
    gstatValue = Math.round(gstatValue * 100) / 100;
    
    const teamStat = {
      team: team,
      value: gstatValue,
      hasGoalieGames: hasGoalieGames
    };
    
    if (hasGoalieGames) {
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
    rankings[teamStat.team.abbr] = currentRank;
    previousValue = teamStat.value;
  });
  
  // Find the lowest rank assigned to teams with goalie games
  const lowestRankWithGames = teamsWithGoalieGames.length > 0 ? 
    Math.min(...teamsWithGoalieGames.map(t => rankings[t.team.abbr])) : teams.length + 1;
  
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
    rankings[teamStat.team.abbr] = rankForNoGames;
    previousValue = teamStat.value;
  });
  
  return rankings;
}

// Function to calculate overall rankings based on sum of individual ranks (matches standings logic)
function calculateOverallRankings(teams, individualRankings) {
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  
  // Calculate total rank for each team
  const teamTotals = teams.map(team => {
    const totalRank = statKeys.reduce((sum, statKey) => sum + (individualRankings[statKey][team.abbr] || 0), 0);
    
    return {
      team: team,
      totalRank: totalRank,
      // Include individual values for tiebreaking
      goals: team.goals || 0,
      assists: team.assists || 0,
      toughness: team.toughness || 0,
      dstat: team.dstat || 0,
      gstat: team.gstat || 0
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
    
    overallRankings[teamTotal.team.abbr] = currentRank;
    previousTotalRank = teamTotal.totalRank;
    previousTiebreakers = currentTiebreakers;
  });
  
  return overallRankings;
}
  
  // Calculate individual stat rankings for this round
  const individualRankings = {};
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  statKeys.forEach(statKey => {
    individualRankings[statKey] = calculateRankings(roundTeamStats, statKey);
  });
  
  // Calculate overall rankings for this round
  const overallRankings = calculateOverallRankings(roundTeamStats, individualRankings);
  
  const bracketRound = playoffBracket.rounds[round.round - 1];
  if (bracketRound) {
    bracketRound.matchups.forEach(matchup => {
      const team1Stats = calculateTeamStats(round, matchup.team1);
      const team2Stats = calculateTeamStats(round, matchup.team2);
      
      // Add rankings to each team
      if (team1Stats) {
        team1Stats.rankings = {
          goals: individualRankings.goals[matchup.team1],
          assists: individualRankings.assists[matchup.team1],
          toughness: individualRankings.toughness[matchup.team1],
          dstat: individualRankings.dstat[matchup.team1],
          gstat: individualRankings.gstat[matchup.team1],
          total: overallRankings[matchup.team1]
        };
      }
      
      if (team2Stats) {
        team2Stats.rankings = {
          goals: individualRankings.goals[matchup.team2],
          assists: individualRankings.assists[matchup.team2],
          toughness: individualRankings.toughness[matchup.team2],
          dstat: individualRankings.dstat[matchup.team2],
          gstat: individualRankings.gstat[matchup.team2],
          total: overallRankings[matchup.team2]
        };
      }
      
      playoffData[round.round].matchups.push({
        matchup: matchup.matchup,
        team1: team1Stats,
        team2: team2Stats,
        winner: null // This could be determined by some logic or manually set
      });
    });
  }
});

process.stdout.write(JSON.stringify({
  availableRounds: availablePlayoffRounds.map(r => r.round),
  roundNames: availablePlayoffRounds.reduce((acc, r) => {
    acc[r.round] = r.name;
    return acc;
  }, {}),
  bracket: playoffBracket,
  data: playoffData,
  teams: teamInfo
}));