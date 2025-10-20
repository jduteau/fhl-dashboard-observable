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
const periodOptions = availablePeriods.map(p => `Period ${p}`);

const periodSelector = Inputs.select(periodOptions, {label: "Select Period:", value: `Period ${availablePeriods[availablePeriods.length - 1]}`});
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
  const selectedPeriodNum = parseInt(selectedPeriod.replace('Period ', ''));
    const currentPeriodData = statsData[selectedPeriodNum];
    const previousPeriodData = selectedPeriodNum > 1 ? statsData[selectedPeriodNum - 1] : null;
    
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
  const selectedPeriodNum = parseInt(selectedPeriod.replace('Period ', ''));
  return rosterData[selectedPeriodNum] || [];
}

// Calculate team statistics for selected period
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
  // First, check which teams have goalie games played
  const teamsWithGstatData = [];
  const teamsWithoutGstatData = [];
  
  teams.forEach(team => {
    const teamRoster = currentRoster.filter(player => player.ABBR === team.ABBR && player.RESERVE !== "R");
    let hasGoalieGames = false;
    
    teamRoster.forEach(rosterPlayer => {
      const playerDetails = playerInfo.find(p => p.ID === rosterPlayer.ID);
      const playerStats = currentStats.find(s => s.hockeyRef === rosterPlayer.ID);
      
      if (playerStats && playerDetails && mapPosition(playerDetails.Pos) === "G") {
        const gamesPlayed = playerStats["stats/gp"] || 0;
        if (gamesPlayed > 0) {
          hasGoalieGames = true;
        }
      }
    });
    
    if (hasGoalieGames) {
      teamsWithGstatData.push(team);
    } else {
      teamsWithoutGstatData.push(team);
    }
  });
  
  const rankings = new Map();
  
  // Rank teams with gstat data normally
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
  
  // Assign rank 1 to all teams without goalie games
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

// Sort by total score for standings
const teamStandings = [...teamRankingsWithRecord].sort((a, b) => b.totalScore - a.totalScore);
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
        "ABBR",
        "NAME",
        "goals",
        "assists", 
        "toughness",
        "dstat",
        "gstat",
        "totalScore"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        goals: "Goals",
        assists: "Assists",
        toughness: "Toughness",
        dstat: "D-Stat",
        gstat: "G-Stat",
        totalScore: "Total Score"
      },
      format: {
        goals: x => x.toLocaleString("en-US"),
        assists: x => x.toLocaleString("en-US"),
        toughness: x => x.toLocaleString("en-US"),
        dstat: x => x.toFixed(2),
        gstat: x => x.toFixed(2),
        totalScore: x => x.toFixed(2)
      },
      sort: null,
      rows: 33,
      width: {
        ABBR: 60,
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