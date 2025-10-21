---
theme: dashboard
toc: false
---

# Team Standings and Rankings

```js
// Load the data files
const teamInfo = await FileAttachment("data/team_info.csv").csv({typed: true});
const playerInfo = await FileAttachment("data/player_info.csv").csv({typed: true});

// Load available stats periods
const statsData = {};
const rosterData = {};

// Load period-specific files
const statsPeriods = [
  { period: 1, data: await FileAttachment("data/stats_p01.csv").csv({typed: true}) },
  { period: 2, data: await FileAttachment("data/stats_p02.csv").csv({typed: true}) },
  { period: 3, data: await FileAttachment("data/stats_p03.csv").csv({typed: true}) },
];

const rosterPeriods = [
  { period: 1, data: await FileAttachment("data/rosters_p01.csv").csv({typed: true}) },
  { period: 2, data: await FileAttachment("data/rosters_p02.csv").csv({typed: true}) },
  { period: 3, data: await FileAttachment("data/rosters_p03.csv").csv({typed: true}) },
];

// Populate data objects
statsPeriods.forEach(periodInfo => {
  statsData[periodInfo.period] = periodInfo.data;
});

rosterPeriods.forEach(periodInfo => {
  rosterData[periodInfo.period] = periodInfo.data;
});

// Get available periods for selector
const availablePeriods = Object.keys(statsData).map(Number).sort((a, b) => a - b);

const periodSelector = Inputs.select(availablePeriods, {label: "Select Period:", value: (availablePeriods.length - 1)});
const selectedPeriod = Generators.input(periodSelector);
```
${periodSelector}

```js
// Function to map positions to G, D, or F
function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F"; // All other positions (C, LW, RW, F, etc.) become F
}

// Function to get stats for selected period
function getStatsForPeriod(selectedPeriod) {
  // For specific periods, calculate differences
    const currentPeriodData = statsData[selectedPeriod];
    const previousPeriodData = selectedPeriod > 1 ? statsData[selectedPeriod - 1] : null;
    
    if (!currentPeriodData) return [];
    
    return currentPeriodData.map(stat => {
      const prevStat = previousPeriodData?.find(p => p.hockeyRef === stat.hockeyRef);
      
      return {
        ...stat,
        "stats/goals": (stat["stats/goals"] || 0) - (prevStat?.["stats/goals"] || 0),
        "stats/assists": (stat["stats/assists"] || 0) - (prevStat?.["stats/assists"] || 0),
        "stats/pim": (stat["stats/pim"] || 0) - (prevStat?.["stats/pim"] || 0),
        "stats/hits": (stat["stats/hits"] || 0) - (prevStat?.["stats/hits"] || 0),
        "stats/toi": (stat["stats/toi"] || 0) - (prevStat?.["stats/toi"] || 0),
        "stats/blocks": (stat["stats/blocks"] || 0) - (prevStat?.["stats/blocks"] || 0),
        "stats/take": (stat["stats/take"] || 0) - (prevStat?.["stats/take"] || 0),
        "stats/give": (stat["stats/give"] || 0) - (prevStat?.["stats/give"] || 0),
        "stats/wins": (stat["stats/wins"] || 0) - (prevStat?.["stats/wins"] || 0),
        "stats/ties": (stat["stats/ties"] || 0) - (prevStat?.["stats/ties"] || 0),
        "stats/so": (stat["stats/so"] || 0) - (prevStat?.["stats/so"] || 0),
        "stats/sa": (stat["stats/sa"] || 0) - (prevStat?.["stats/sa"] || 0),
        "stats/ga": (stat["stats/ga"] || 0) - (prevStat?.["stats/ga"] || 0)
      };
    });
}

// Function to get roster for selected period
function getRosterForPeriod(selectedPeriod) {
  return rosterData[selectedPeriod] || [];
}

// Function to check if a period has actual stats data
function periodHasStats(period) {
  const periodStats = getStatsForPeriod(period);
  const periodRoster = getRosterForPeriod(period);
  
  if (!periodStats || !periodRoster || periodStats.length === 0 || periodRoster.length === 0) {
    return false;
  }
  
  // Check if any team has meaningful stats for this period
  return teamInfo.some(team => {
    const teamRoster = periodRoster.filter(player => player.ABBR === team.ABBR && player.RESERVE !== "R");
    
    return teamRoster.some(rosterPlayer => {
      const playerStats = periodStats.find(s => s.hockeyRef === rosterPlayer.ID);
      if (!playerStats) return false;
      
      // Check if player has any non-zero stats
      return (playerStats["stats/goals"] || 0) > 0 ||
             (playerStats["stats/assists"] || 0) > 0 ||
             (playerStats["stats/pim"] || 0) > 0 ||
             (playerStats["stats/hits"] || 0) > 0 ||
             (playerStats["stats/toi"] || 0) > 0 ||
             (playerStats["stats/blocks"] || 0) > 0 ||
             (playerStats["stats/take"] || 0) > 0 ||
             (playerStats["stats/give"] || 0) > 0 ||
             (playerStats["stats/wins"] || 0) > 0 ||
             (playerStats["stats/ties"] || 0) > 0 ||
             (playerStats["stats/so"] || 0) > 0 ||
             (playerStats["stats/sa"] || 0) > 0 ||
             (playerStats["stats/ga"] || 0) > 0;
    });
  });
}

// Get only periods that have actual stats
const periodsWithStats = availablePeriods.filter(period => periodHasStats(period));

// Function to calculate cumulative team stats across periods with actual stats using active players
function calculateCumulativeTeamStats() {
  return teamInfo.map(team => {
    let goals = 0, assists = 0, toughness = 0, dstat = 0, gstat = 0;
    
    // Loop through only periods that have actual stats
    periodsWithStats.forEach(period => {
      const periodRoster = rosterData[period]?.filter(player => player.ABBR === team.ABBR && player.RESERVE !== "R") || [];
      const periodStats = getStatsForPeriod(period);
      
      periodRoster.forEach(rosterPlayer => {
        const playerDetails = playerInfo.find(p => p.ID === rosterPlayer.ID);
        const playerStats = periodStats.find(s => s.hockeyRef === rosterPlayer.ID);
        
        if (playerStats && playerDetails) {
          const position = mapPosition(playerDetails.Pos);
          
          // Only count non-goalie stats for goals, assists, toughness
          if (position !== "G") {
            goals += playerStats["stats/goals"] || 0;
            assists += playerStats["stats/assists"] || 0;
            toughness += (playerStats["stats/pim"] || 0) + (playerStats["stats/hits"] || 0);
            
            // Calculate dstat for non-goalies
            if (position === "D") {
              dstat += (playerStats["stats/toi"] || 0) / 20 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
            } else { // Forward
              dstat += (playerStats["stats/toi"] || 0) / 30 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
            }
          }
          
          // Calculate gstat for goalies
          if (position === "G") {
            gstat += 2 * (playerStats["stats/wins"] || 0) + (playerStats["stats/ties"] || 0) + 2 * (playerStats["stats/so"] || 0) + 0.15 * (playerStats["stats/sa"] || 0) - (playerStats["stats/ga"] || 0);
          }
        }
      });
    });
    
    return {
      ABBR: team.ABBR,
      NAME: team.NAME,
      goals: Math.round(goals * 100) / 100,
      assists: Math.round(assists * 100) / 100,
      toughness: Math.round(toughness * 100) / 100,
      dstat: Math.round(dstat * 100) / 100,
      gstat: Math.round(gstat * 100) / 100
    };
  });
}

// Calculate team statistics for selected period (used for rankings)
const currentStats = getStatsForPeriod(selectedPeriod);
const currentRoster = getRosterForPeriod(selectedPeriod);

const teamStats = teamInfo.map(team => {
  const teamRoster = currentRoster.filter(player => player.ABBR === team.ABBR && player.RESERVE !== "R");
  
  let goals = 0, assists = 0, toughness = 0, dstat = 0, gstat = 0;
  
  teamRoster.forEach(rosterPlayer => {
    const playerDetails = playerInfo.find(p => p.ID === rosterPlayer.ID);
    const playerStats = currentStats.find(s => s.hockeyRef === rosterPlayer.ID);
    
    if (playerStats && playerDetails) {
      const position = mapPosition(playerDetails.Pos);
      
      // Only count non-goalie stats for goals, assists, toughness
      if (position !== "G") {
        goals += playerStats["stats/goals"] || 0;
        assists += playerStats["stats/assists"] || 0;
        toughness += (playerStats["stats/pim"] || 0) + (playerStats["stats/hits"] || 0);
        
        // Calculate dstat for non-goalies
        if (position === "D") {
          dstat += (playerStats["stats/toi"] || 0) / 20 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
        } else { // Forward
          dstat += (playerStats["stats/toi"] || 0) / 30 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
        }
      }
      
      // Calculate gstat for goalies
      if (position === "G") {
        gstat += 2 * (playerStats["stats/wins"] || 0) + (playerStats["stats/ties"] || 0) + 2 * (playerStats["stats/so"] || 0) + 0.15 * (playerStats["stats/sa"] || 0) - (playerStats["stats/ga"] || 0);
      }
    }
  });
  
  return {
    ABBR: team.ABBR,
    NAME: team.NAME,
    goals: goals,
    assists: assists,
    toughness: toughness,
    dstat: dstat,
    gstat: gstat
  };
});

// Calculate cumulative team stats for standings
const cumulativeTeamStats = calculateCumulativeTeamStats();

// Calculate rankings for each stat (reverse order: 32 for highest, 1 for lowest)
// Handle ties by giving same upper rank
function calculateRanking(teams, statKey) {
  const sorted = [...teams].sort((a, b) => b[statKey] - a[statKey]); // Descending order
  const rankings = new Map();
  let currentRank = teams.length; // Start from highest rank (32 for 32 teams)
  
  for (let i = 0; i < sorted.length; i++) {
    const currentValue = sorted[i][statKey];
    
    if (i === 0 || sorted[i-1][statKey] !== currentValue) {
      // New value, update rank
      currentRank = teams.length - i;
    }
    // All teams with same value get the same rank
    rankings.set(sorted[i].ABBR, currentRank);
  }
  
  return rankings;
}

// Special function for gstat ranking that handles teams with no goalie games
function calculateGstatRanking(teams) {
  // First, check which teams have meaningful goalie contributions to gstat
  const teamsWithGstatData = [];
  const teamsWithoutGstatData = [];
  
  teams.forEach(team => {
    // If team has any gstat score (positive or negative), they have goalie data
    if (team.gstat !== 0) {
      teamsWithGstatData.push(team);
    } else {
      teamsWithoutGstatData.push(team);
    }
  });
  
  const rankings = new Map();
  
  // Rank teams with gstat data normally (including negative scores)
  if (teamsWithGstatData.length > 0) {
    const sorted = [...teamsWithGstatData].sort((a, b) => b.gstat - a.gstat);
    let currentRank = teams.length; // Start from total number of teams
    
    for (let i = 0; i < sorted.length; i++) {
      const currentValue = sorted[i].gstat;
      
      if (i === 0 || sorted[i-1].gstat !== currentValue) {
        currentRank = teams.length - i;
      }
      rankings.set(sorted[i].ABBR, currentRank);
    }
  }
  
  // Assign rank 1 to all teams without any goalie stats
  teamsWithoutGstatData.forEach(team => {
    rankings.set(team.ABBR, 1);
  });
  
  return rankings;
}

const goalsRankings = calculateRanking(teamStats, 'goals');
const assistsRankings = calculateRanking(teamStats, 'assists');
const toughnessRankings = calculateRanking(teamStats, 'toughness');
const dstatRankings = calculateRanking(teamStats, 'dstat');
const gstatRankings = calculateGstatRanking(teamStats);

// Add rankings to team data
const teamRankings = teamStats.map(team => {
  const goalsRank = goalsRankings.get(team.ABBR);
  const assistsRank = assistsRankings.get(team.ABBR);
  const toughnessRank = toughnessRankings.get(team.ABBR);
  const dstatRank = dstatRankings.get(team.ABBR);
  const gstatRank = gstatRankings.get(team.ABBR);
  
  // Total rank is simply the sum of individual ranks (higher is better)
  const totalRank = goalsRank + assistsRank + toughnessRank + dstatRank + gstatRank;
  
  return {
    ...team,
    goalsRank: goalsRank,
    assistsRank: assistsRank,
    toughnessRank: toughnessRank,
    dstatRank: dstatRank,
    gstatRank: gstatRank,
    totalRank: totalRank,
    totalScore: team.goals + team.assists + team.toughness + team.dstat + team.gstat
  };
});

// Sort by totalRank to determine overall ranking position (descending since higher total rank is better)
// Tie-breakers: goals, assists, toughness, dstat, gstat (all higher is better)
const sortedTeamRankings = [...teamRankings].sort((a, b) => {
  // Primary sort: total rank (higher is better)
  if (b.totalRank !== a.totalRank) {
    return b.totalRank - a.totalRank;
  }
  
  // Tie-breaker 1: goals (higher is better)
  if (b.goals !== a.goals) {
    return b.goals - a.goals;
  }
  
  // Tie-breaker 2: assists (higher is better)
  if (b.assists !== a.assists) {
    return b.assists - a.assists;
  }
  
  // Tie-breaker 3: toughness (higher is better)
  if (b.toughness !== a.toughness) {
    return b.toughness - a.toughness;
  }
  
  // Tie-breaker 4: dstat (higher is better)
  if (b.dstat !== a.dstat) {
    return b.dstat - a.dstat;
  }
  
  // Tie-breaker 5: gstat (higher is better)
  return b.gstat - a.gstat;
});

// Add record based on overall ranking position
const teamRankingsWithRecord = sortedTeamRankings.map((team, index) => {
  const overallRank = index + 1; // 1-based ranking
  let record;
  
  if (overallRank >= 1 && overallRank <= 4) {
    record = "3-0-0";
  } else if (overallRank >= 5 && overallRank <= 7) {
    record = "2-0-1";
  } else if (overallRank >= 8 && overallRank <= 12) {
    record = "2-1-0";
  } else if (overallRank === 13) {
    record = "1-0-2";
  } else if (overallRank >= 14 && overallRank <= 19) {
    record = "1-1-1";
  } else if (overallRank >= 20 && overallRank <= 24) {
    record = "1-2-0";
  } else if (overallRank === 25) {
    record = "0-1-2";
  } else if (overallRank >= 26 && overallRank <= 28) {
    record = "0-2-1";
  } else if (overallRank >= 29 && overallRank <= 32) {
    record = "0-3-0";
  } else {
    record = "0-0-0"; // fallback
  }
  
  return {
    ...team,
    record: record,
    overallRank: overallRank
  };
});
```

```js
// Calculate cumulative rankings for standings
const cumulativeGoalsRankings = calculateRanking(cumulativeTeamStats, 'goals');
const cumulativeAssistsRankings = calculateRanking(cumulativeTeamStats, 'assists');
const cumulativeToughnessRankings = calculateRanking(cumulativeTeamStats, 'toughness');
const cumulativeDstatRankings = calculateRanking(cumulativeTeamStats, 'dstat');

// Calculate cumulative gstat rankings (modified for cumulative data)
function calculateCumulativeGstatRanking(teams) {
  const teamsWithGstatData = [];
  const teamsWithoutGstatData = [];
  
  teams.forEach(team => {
    if (team.gstat !== 0) {
      teamsWithGstatData.push(team);
    } else {
      teamsWithoutGstatData.push(team);
    }
  });
  
  const rankings = new Map();
  
  if (teamsWithGstatData.length > 0) {
    const sorted = [...teamsWithGstatData].sort((a, b) => b.gstat - a.gstat);
    let currentRank = teams.length;
    
    for (let i = 0; i < sorted.length; i++) {
      const currentValue = sorted[i].gstat;
      
      if (i === 0 || sorted[i-1].gstat !== currentValue) {
        currentRank = teams.length - i;
      }
      rankings.set(sorted[i].ABBR, currentRank);
    }
  }
  
  teamsWithoutGstatData.forEach(team => {
    rankings.set(team.ABBR, 1);
  });
  
  return rankings;
}

const cumulativeGstatRankings = calculateCumulativeGstatRanking(cumulativeTeamStats);

// Function to calculate team record for a specific period
function calculateTeamRecordForPeriod(period) {
  const periodStats = getStatsForPeriod(period);
  const periodRoster = getRosterForPeriod(period);
  
  const periodTeamStats = teamInfo.map(team => {
    const teamRoster = periodRoster.filter(player => player.ABBR === team.ABBR && player.RESERVE !== "R");
    
    let goals = 0, assists = 0, toughness = 0, dstat = 0, gstat = 0;
    
    teamRoster.forEach(rosterPlayer => {
      const playerDetails = playerInfo.find(p => p.ID === rosterPlayer.ID);
      const playerStats = periodStats.find(s => s.hockeyRef === rosterPlayer.ID);
      
      if (playerStats && playerDetails) {
        const position = mapPosition(playerDetails.Pos);
        
        if (position !== "G") {
          goals += playerStats["stats/goals"] || 0;
          assists += playerStats["stats/assists"] || 0;
          toughness += (playerStats["stats/pim"] || 0) + (playerStats["stats/hits"] || 0);
          
          if (position === "D") {
            dstat += (playerStats["stats/toi"] || 0) / 20 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
          } else {
            dstat += (playerStats["stats/toi"] || 0) / 30 + (playerStats["stats/blocks"] || 0) + (playerStats["stats/take"] || 0) - (playerStats["stats/give"] || 0);
          }
        }
        
        if (position === "G") {
          gstat += 2 * (playerStats["stats/wins"] || 0) + (playerStats["stats/ties"] || 0) + 2 * (playerStats["stats/so"] || 0) + 0.15 * (playerStats["stats/sa"] || 0) - (playerStats["stats/ga"] || 0);
        }
      }
    });
    
    return {
      ABBR: team.ABBR,
      goals: goals,
      assists: assists,
      toughness: toughness,
      dstat: dstat,
      gstat: gstat
    };
  });
  
  // Calculate rankings for this period
  const periodGoalsRankings = calculateRanking(periodTeamStats, 'goals');
  const periodAssistsRankings = calculateRanking(periodTeamStats, 'assists');
  const periodToughnessRankings = calculateRanking(periodTeamStats, 'toughness');
  const periodDstatRankings = calculateRanking(periodTeamStats, 'dstat');
  const periodGstatRankings = calculateGstatRanking(periodTeamStats);
  
  // Calculate total ranks and determine records
  const periodTeamRankings = periodTeamStats.map(team => {
    const goalsRank = periodGoalsRankings.get(team.ABBR);
    const assistsRank = periodAssistsRankings.get(team.ABBR);
    const toughnessRank = periodToughnessRankings.get(team.ABBR);
    const dstatRank = periodDstatRankings.get(team.ABBR);
    const gstatRank = periodGstatRankings.get(team.ABBR);
    
    const totalRank = goalsRank + assistsRank + toughnessRank + dstatRank + gstatRank;
    
    return { ...team, totalRank };
  });
  
  // Sort by total rank and assign records
  const sortedPeriodTeams = [...periodTeamRankings].sort((a, b) => {
    if (b.totalRank !== a.totalRank) return b.totalRank - a.totalRank;
    if (b.goals !== a.goals) return b.goals - a.goals;
    if (b.assists !== a.assists) return b.assists - a.assists;
    if (b.toughness !== a.toughness) return b.toughness - a.toughness;
    if (b.dstat !== a.dstat) return b.dstat - a.dstat;
    return b.gstat - a.gstat;
  });
  
  const periodRecords = new Map();
  sortedPeriodTeams.forEach((team, index) => {
    const overallRank = index + 1;
    let wins = 0, losses = 0, ties = 0;
    
    if (overallRank >= 1 && overallRank <= 4) {
      wins = 3; losses = 0; ties = 0;
    } else if (overallRank >= 5 && overallRank <= 7) {
      wins = 2; losses = 0; ties = 1;
    } else if (overallRank >= 8 && overallRank <= 12) {
      wins = 2; losses = 1; ties = 0;
    } else if (overallRank === 13) {
      wins = 1; losses = 0; ties = 2;
    } else if (overallRank >= 14 && overallRank <= 19) {
      wins = 1; losses = 1; ties = 1;
    } else if (overallRank >= 20 && overallRank <= 24) {
      wins = 1; losses = 2; ties = 0;
    } else if (overallRank === 25) {
      wins = 0; losses = 1; ties = 2;
    } else if (overallRank >= 26 && overallRank <= 28) {
      wins = 0; losses = 2; ties = 1;
    } else if (overallRank >= 29 && overallRank <= 32) {
      wins = 0; losses = 3; ties = 0;
    }
    
    periodRecords.set(team.ABBR, { wins, losses, ties });
  });
  
  return periodRecords;
}

// Calculate cumulative records from periods with stats only
const cumulativeRecords = new Map();
teamInfo.forEach(team => {
  let totalWins = 0, totalLosses = 0, totalTies = 0;
  
  periodsWithStats.forEach(period => {
    const periodRecords = calculateTeamRecordForPeriod(period);
    const teamRecord = periodRecords.get(team.ABBR);
    if (teamRecord) {
      totalWins += teamRecord.wins;
      totalLosses += teamRecord.losses;
      totalTies += teamRecord.ties;
    }
  });
  
  cumulativeRecords.set(team.ABBR, {
    wins: totalWins,
    losses: totalLosses,
    ties: totalTies,
    points: totalWins * 2 + totalTies
  });
});

// Add cumulative rankings and records
const cumulativeTeamRankings = cumulativeTeamStats.map(team => {
  const goalsRank = cumulativeGoalsRankings.get(team.ABBR);
  const assistsRank = cumulativeAssistsRankings.get(team.ABBR);
  const toughnessRank = cumulativeToughnessRankings.get(team.ABBR);
  const dstatRank = cumulativeDstatRankings.get(team.ABBR);
  const gstatRank = cumulativeGstatRankings.get(team.ABBR);
  
  const totalRank = goalsRank + assistsRank + toughnessRank + dstatRank + gstatRank;
  const teamRecord = cumulativeRecords.get(team.ABBR);
  
  return {
    ...team,
    goalsRank: goalsRank,
    assistsRank: assistsRank,
    toughnessRank: toughnessRank,
    dstatRank: dstatRank,
    gstatRank: gstatRank,
    totalRank: totalRank,
    record: `${teamRecord.wins}-${teamRecord.losses}-${teamRecord.ties}`,
    points: teamRecord.points
  };
});

// Function to compare team records (wins-losses-ties)
function compareRecords(recordA, recordB) {
  const [winsA, lossesA, tiesA] = recordA.split('-').map(Number);
  const [winsB, lossesB, tiesB] = recordB.split('-').map(Number);
  
  // First compare wins (more wins is better)
  if (winsB !== winsA) return winsB - winsA;
  
  // Then compare losses (fewer losses is better)
  if (lossesA !== lossesB) return lossesA - lossesB;
  
  // Finally compare ties (more ties is better)
  return tiesB - tiesA;
}

// Sort teams by points, then record, then goals, then assists for standings
const cumulativeTeamsWithRecords = [...cumulativeTeamRankings].sort((a, b) => {
  // 1. Points (higher is better)
  if (b.points !== a.points) return b.points - a.points;
  
  // 2. Record (wins-losses-ties)
  const recordComparison = compareRecords(a.record, b.record);
  if (recordComparison !== 0) return recordComparison;
  
  // 3. Goals (higher is better)
  if (b.goals !== a.goals) return b.goals - a.goals;
  
  // 4. Assists (higher is better)
  if (b.assists !== a.assists) return b.assists - a.assists;
  
  // 5. Tiebreakers: toughness, dstat, gstat
  if (b.toughness !== a.toughness) return b.toughness - a.toughness;
  if (b.dstat !== a.dstat) return b.dstat - a.dstat;
  return b.gstat - a.gstat;
});

// Create standings grouped by division
const divisionOrder = ["ATLANTIC", "METROPOLITAN", "CENTRAL", "PACIFIC"];
const teamStandings = [];

divisionOrder.forEach(division => {
  const divisionTeams = cumulativeTeamsWithRecords
    .filter(team => teamInfo.find(t => t.ABBR === team.ABBR)?.DIVISION === division)
    .sort((a, b) => {
      // 1. Points (higher is better)
      if (b.points !== a.points) return b.points - a.points;
      
      // 2. Record (wins-losses-ties)
      const recordComparison = compareRecords(a.record, b.record);
      if (recordComparison !== 0) return recordComparison;
      
      // 3. Goals (higher is better)
      if (b.goals !== a.goals) return b.goals - a.goals;
      
      // 4. Assists (higher is better)
      return b.assists - a.assists;
    });
  
  if (divisionTeams.length > 0) {
    // Add division header
    teamStandings.push({
      ABBR: "",
      NAME: `${division} DIVISION`,
      record: "",
      points: "",
      goals: "",
      assists: "", 
      toughness: "",
      dstat: "",
      gstat: "",
      isDivisionHeader: true
    });
    
    // Add teams in this division
    teamStandings.push(...divisionTeams);
  }
});
```

<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('standings-tab', this)">Team Standings</button>
    <button class="tab-button" onclick="showTab('rankings-tab', this)">Team Rankings</button>
  </div>
  
  <div id="standings-tab" class="tab-content active">
    <h3>Team Standings</h3>
    ${Inputs.table(teamStandings, {
      columns: [
        "NAME",
        "record",
        "points",
        "goals",
        "assists", 
        "toughness",
        "dstat",
        "gstat"
      ],
      header: {
        NAME: "Team Name",
        record: "Record",
        points: "Points",
        goals: "Goals",
        assists: "Assists",
        toughness: "Toughness",
        dstat: "D-Stat",
        gstat: "G-Stat"
      },
      format: {
        goals: x => typeof x === 'number' ? x.toLocaleString("en-US") : x,
        assists: x => typeof x === 'number' ? x.toLocaleString("en-US") : x,
        toughness: x => typeof x === 'number' ? x.toLocaleString("en-US") : x,
        dstat: x => typeof x === 'number' ? x.toFixed(2) : x,
        gstat: x => typeof x === 'number' ? x.toFixed(2) : x,
        NAME: (d, i, data) => data[i].isDivisionHeader ? 
          html`<div class="division-header">${d}</div>` : d
      },
      sort: false,
      rows: 37,
      width: {
        NAME: 200
      },
      select: false
    })}
  </div>
  
  <div id="rankings-tab" class="tab-content">
    <h3>Team Rankings by Category</h3>
    ${Inputs.table(teamRankingsWithRecord, {
      columns: [
        "overallRank",
        "ABBR",
        "goals",
        "goalsRank",
        "assists",
        "assistsRank",
        "toughness", 
        "toughnessRank",
        "dstat",
        "dstatRank",
        "gstat",
        "gstatRank",
        "totalRank",
        "record"
      ],
      header: {
        overallRank: "Rank",
        ABBR: "Team",
        goals: "Goals",
        goalsRank: "GRank",
        assists: "Assists",
        assistsRank: "ARank",
        toughness: "Toughness",
        toughnessRank: "TRank",
        dstat: "D-Stat",
        dstatRank: "DRank",
        gstat: "G-Stat",
        gstatRank: "GSRank",
        totalRank: "Rank",
        record: "Record"
      },
      format: {
        goals: x => x.toLocaleString("en-US"),
        assists: x => x.toLocaleString("en-US"),
        toughness: x => x.toLocaleString("en-US"),
        dstat: x => x.toFixed(2),
        gstat: x => x.toFixed(2)
      },
      sort: null,
      rows: 33,
      width: {
        overallRank: 50,
        ABBR: 60,
        goalsRank: 70,
        assistsRank: 70,
        toughnessRank: 80,
        dstatRank: 70,
        gstatRank: 70,
        totalRank: 80,
        record: 70
      },
      select: false
    })}
  </div>
</div>

<script>
// JavaScript function to handle tab switching
window.showTab = function(tabId, buttonElement) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Show the selected tab and mark button as active
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  if (buttonElement) {
    buttonElement.classList.add('active');
  }
}
</script>

<style>
.division-header {
  background: #34495e;
  color: white;
  font-weight: bold;
  text-align: center;
}

.standings-table td.division-header {
  background: #34495e !important;
  color: white !important;
  font-weight: bold !important;
  text-align: center !important;
}

.tabs {
  margin: 20px 0;
}

.tab-buttons {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 20px;
}

.tab-button {
  background: none;
  border: none;
  padding: 12px 24px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #666;
  border-bottom: 3px solid transparent;
  transition: all 0.2s ease;
}

.tab-button:hover {
  color: #333;
  background-color: #f5f5f5;
}

.tab-button.active {
  color: #0066cc;
  border-bottom-color: #0066cc;
  background-color: #f0f8ff;
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

.tab-content h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}
</style>