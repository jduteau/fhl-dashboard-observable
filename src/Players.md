---
theme: dashboard
toc: false
---

# Player Statistics

```js
// Load the data files
const contracts = await FileAttachment("data/contracts.csv").csv({typed: true});
const playerInfo = await FileAttachment("data/player_info.csv").csv({typed: true});
const teamInfo = await FileAttachment("data/team_info.csv").csv({typed: true});

// Load available stats periods (add more as files become available)
const statsData = {};
const rosterData = {};

// Only include FileAttachment calls for files that actually exist
const statsPeriods = [
  { period: 1, data: await FileAttachment("data/stats_p01.csv").csv({typed: true}) },
  { period: 2, data: await FileAttachment("data/stats_p02.csv").csv({typed: true}) },
  { period: 3, data: await FileAttachment("data/stats_p03.csv").csv({typed: true}) },
  // Add more periods here as files become available:
  // { period: 4, data: await FileAttachment("data/stats_p04.csv").csv({typed: true}) },
  // etc...
];

// Load period-specific roster files (add more as files become available)
const rosterPeriods = [
  { period: 1, data: await FileAttachment("data/rosters_p01.csv").csv({typed: true}) },
  { period: 2, data: await FileAttachment("data/rosters_p02.csv").csv({typed: true}) },
  { period: 3, data: await FileAttachment("data/rosters_p03.csv").csv({typed: true}) },
  // Add more periods here as files become available:
  // { period: 4, data: await FileAttachment("data/rosters_p04.csv").csv({typed: true}) },
  // etc...
];

// Populate statsData and rosterData
statsPeriods.forEach(periodInfo => {
  statsData[periodInfo.period] = periodInfo.data;
});

rosterPeriods.forEach(periodInfo => {
  rosterData[periodInfo.period] = periodInfo.data;
});

// Get all available periods for the selector
const availablePeriods = Object.keys(statsData).map(Number).sort((a, b) => a - b);
const periodOptions = ["Overall", ...availablePeriods.map(p => `Period ${p}`)];

// Get unique teams for the selector
const teams = teamInfo.map(team => team.ABBR).sort();

const teamSelector = Inputs.select(teams, {label: "Select Team:", value: teams[0]});
const selectedTeam = Generators.input(teamSelector);

const periodSelector = Inputs.select(periodOptions, {label: "Select Period:", value: "Overall"});
const selectedPeriod = Generators.input(periodSelector);
```

${teamSelector}
${periodSelector}

```js
// Function to get stats for the selected period
function getStatsForPeriod(selectedPeriod) {
  if (selectedPeriod === "Overall") {
    // Show cumulative stats from the latest period (no subtraction)
    const latestPeriod = Math.max(...availablePeriods);
    const latestPeriodData = statsData[latestPeriod];
    
    return latestPeriodData.map(stat => {
      // Calculate dstat based on position
      let dstat = null;
      if (stat.pos === "G") {
        dstat = null;
      } else if (stat.pos === "D") {
        dstat = (stat["stats/toi"] || 0) / 20 + (stat["stats/blocks"] || 0) + (stat["stats/take"] || 0) - (stat["stats/give"] || 0);
      } else { // Forward positions (F, C, LW, RW, etc.)
        dstat = (stat["stats/toi"] || 0) / 30 + (stat["stats/blocks"] || 0) + (stat["stats/take"] || 0) - (stat["stats/give"] || 0);
      }
      
      // Calculate gstat based on position
      let gstat = null;
      if (stat.pos === "G") {
        gstat = 2 * (stat["stats/wins"] || 0) + (stat["stats/ties"] || 0) + 2 * (stat["stats/so"] || 0) + 0.15 * (stat["stats/sa"] || 0) - (stat["stats/ga"] || 0);
      }
      
      return {
        hockeyRef: stat.hockeyRef,
        team: stat.team,
        pos: stat.pos,
        goals: (stat.pos === "G") ? null : (stat["stats/goals"] || 0),
        assists: (stat.pos === "G") ? null : (stat["stats/assists"] || 0),
        toughness: (stat.pos === "G") ? null : ((stat["stats/pim"] || 0) + (stat["stats/hits"] || 0)),
        dstat: dstat,
        gstat: gstat,
        games_played: stat["stats/gp"] || 0
      };
    });
  } else {
    // For specific periods, calculate differences
    const selectedPeriodNum = parseInt(selectedPeriod.replace('Period ', ''));
    
    if (availablePeriods.includes(selectedPeriodNum)) {
      const currentPeriodData = statsData[selectedPeriodNum];
      const previousPeriodData = selectedPeriodNum > 1 ? statsData[selectedPeriodNum - 1] : null;
      
      return currentPeriodData.map(stat => {
        const prevStat = previousPeriodData?.find(p => p.hockeyRef === stat.hockeyRef);
        
        // Calculate current period dstat
        let currentDstat = 0;
        if (stat.pos === "G") {
          currentDstat = 0;
        } else if (stat.pos === "D") {
          currentDstat = (stat["stats/toi"] || 0) / 20 + (stat["stats/blocks"] || 0) + (stat["stats/take"] || 0) - (stat["stats/give"] || 0);
        } else { // Forward positions
          currentDstat = (stat["stats/toi"] || 0) / 30 + (stat["stats/blocks"] || 0) + (stat["stats/take"] || 0) - (stat["stats/give"] || 0);
        }
        
        // Calculate previous period dstat
        let prevDstat = 0;
        if (prevStat) {
          if (prevStat.pos === "G") {
            prevDstat = 0;
          } else if (prevStat.pos === "D") {
            prevDstat = (prevStat["stats/toi"] || 0) / 20 + (prevStat["stats/blocks"] || 0) + (prevStat["stats/take"] || 0) - (prevStat["stats/give"] || 0);
          } else { // Forward positions
            prevDstat = (prevStat["stats/toi"] || 0) / 30 + (prevStat["stats/blocks"] || 0) + (prevStat["stats/take"] || 0) - (prevStat["stats/give"] || 0);
          }
        }
        
        // Calculate current period gstat
        let currentGstat = null;
        if (stat.pos === "G") {
          currentGstat = 2 * (stat["stats/wins"] || 0) + (stat["stats/ties"] || 0) + 2 * (stat["stats/so"] || 0) + 0.15 * (stat["stats/sa"] || 0) - (stat["stats/ga"] || 0);
        }
        
        // Calculate previous period gstat
        let prevGstat = null;
        if (prevStat && prevStat.pos === "G") {
          prevGstat = 2 * (prevStat["stats/wins"] || 0) + (prevStat["stats/ties"] || 0) + 2 * (prevStat["stats/so"] || 0) + 0.15 * (prevStat["stats/sa"] || 0) - (prevStat["stats/ga"] || 0);
        }
        
        // Calculate gstat difference (only for goalies)
        let gstatDiff = null;
        if (stat.pos === "G") {
          gstatDiff = (currentGstat || 0) - (prevGstat || 0);
        }
        
        // Calculate current period toughness
        let currentToughness = (stat.pos === "G") ? 0 : ((stat["stats/pim"] || 0) + (stat["stats/hits"] || 0));
        
        // Calculate previous period toughness
        let prevToughness = 0;
        if (prevStat && prevStat.pos !== "G") {
          prevToughness = (prevStat["stats/pim"] || 0) + (prevStat["stats/hits"] || 0);
        }
        
        return {
          hockeyRef: stat.hockeyRef,
          team: stat.team,
          pos: stat.pos,
          goals: (stat.pos === "G") ? null : ((stat["stats/goals"] || 0) - (prevStat?.["stats/goals"] || 0)),
          assists: (stat.pos === "G") ? null : ((stat["stats/assists"] || 0) - (prevStat?.["stats/assists"] || 0)),
          toughness: (stat.pos === "G") ? null : (currentToughness - prevToughness),
          dstat: (stat.pos === "G") ? null : (currentDstat - prevDstat),
          gstat: gstatDiff,
          games_played: (stat["stats/gp"] || 0) - (prevStat?.["stats/gp"] || 0)
        };
      });
    }
  }
  
  return [];
}

// Calculate stats for the selected period using the function
const combinedStats = getStatsForPeriod(selectedPeriod);

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

// Function to get roster data for a specific period
function getRosterData(selectedPeriod) {
  if (selectedPeriod === "Overall") {
    // For Overall, combine all roster periods
    const allRosters = [];
    Object.values(rosterData).forEach(periodRoster => {
      allRosters.push(...periodRoster);
    });
    // Remove duplicates based on playerId and teamName
    const uniqueRosters = [];
    const seen = new Set();
    allRosters.forEach(roster => {
      const key = `${roster.ID}-${roster.ABBR}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRosters.push({
          ...roster,
          RESERVE: "" // Always set reserve to false for Overall period
        });
      }
    });
    return uniqueRosters;
  } else {
    // For specific periods, extract the period number
    const selectedPeriodNum = parseInt(selectedPeriod.replace('Period ', ''));
    return rosterData[selectedPeriodNum] || [];
  }
}

// Function to create player contract data for a specific period
function createPlayerContractData(selectedPeriod) {
  const rostersForPeriod = getRosterData(selectedPeriod);
  
  return playerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
    const contract = contracts.find(c => c.ID === player.ID);
  
  return {
    ID: player.ID,
    Name: player.Name,
    Team: roster ? roster.ABBR : "N/A",
    Position: mapPosition(player.Pos),
    Age: calculateAge(player.BirthDate),
    Salary: contract ? contract.Salary : 0,
    Contract: contract ? contract.Contract : "N/A",
    BirthDate: player.BirthDate
  };
  }).filter(player => player.Team !== "N/A");
}

// Function to create player roster data for a specific period
function createPlayerRosterData(selectedPeriod) {
  const rostersForPeriod = getRosterData(selectedPeriod);
  
  return playerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
  
  return {
    ID: player.ID,
    Name: player.Name,
    Team: roster ? roster.ABBR : "N/A",
    Position: mapPosition(player.Pos),
    Reserve: roster ? roster.RESERVE : "N/A",
    NHLTeam: player["NHL Team"]
  };
  }).filter(player => player.Team !== "N/A");
}

// Function to create player stats data for a specific period
function createPlayerStatsData(selectedPeriod) {
  const rostersForPeriod = getRosterData(selectedPeriod);
  
  return playerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
    const stats = getStatsForPeriod(selectedPeriod).find(s => s.hockeyRef === player.ID);
  
  return {
    ID: player.ID,
    Name: player.Name,
    Team: roster ? roster.ABBR : "N/A",
    Position: mapPosition(player.Pos),
    Reserve: roster ? roster.RESERVE : "N/A",
    Goals: stats ? stats.goals : (mapPosition(player.Pos) === "G" ? null : 0),
    Assists: stats ? stats.assists : (mapPosition(player.Pos) === "G" ? null : 0),
    Toughness: stats ? stats.toughness : (mapPosition(player.Pos) === "G" ? null : 0),
    DStat: stats ? stats.dstat : (mapPosition(player.Pos) === "G" ? null : 0),
    GStat: stats ? (stats.gstat !== null ? stats.gstat : (mapPosition(player.Pos) === "G" ? 0 : null)) : (mapPosition(player.Pos) === "G" ? 0 : null),
    GamesPlayed: stats ? stats.games_played : 0,
    NHLTeam: player["NHL Team"]
  };
  }).filter(player => player.Team !== "N/A");
}

// Create initial data for default period (Overall)
const playerContractData = createPlayerContractData(selectedPeriod);
const playerRosterData = createPlayerRosterData(selectedPeriod);
const playerStatsData = createPlayerStatsData(selectedPeriod);

// Filter data based on selected team and sort
const filteredContractData = playerContractData.filter(player => player.Team === selectedTeam);
const filteredRosterData = playerRosterData
  .filter(player => player.Team === selectedTeam)
  .sort((a, b) => {
    // Sort by reserve status first (non-reserve players first)
    if (a.Reserve !== b.Reserve) {
      if (a.Reserve === "R" && b.Reserve !== "R") return 1;
      if (a.Reserve !== "R" && b.Reserve === "R") return -1;
      return a.Reserve.localeCompare(b.Reserve);
    }
    // Then by position
    return a.Position.localeCompare(b.Position);
  });
const filteredStatsData = playerStatsData
  .filter(player => player.Team === selectedTeam)
  .sort((a, b) => {
    // Sort by position first
    if (a.Position !== b.Position) {
      return a.Position.localeCompare(b.Position);
    }
    // Then by reserve status (non-reserve players first)
    if (a.Reserve !== b.Reserve) {
      if (a.Reserve === "R" && b.Reserve !== "R") return 1;
      if (a.Reserve !== "R" && b.Reserve === "R") return -1;
      return a.Reserve.localeCompare(b.Reserve);
    }
    // Finally by games played (descending - more games first)
    return b.GamesPlayed - a.GamesPlayed;
  });
```

```js
// Calculate totals for active and reserve players
const activeTotals = filteredStatsData
  .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
  .reduce((totals, player) => ({
    goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
    assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
    toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
    dstat: totals.dstat + (player.DStat || 0),
    gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
  }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

const reserveTotals = filteredStatsData
  .filter(player => player.Reserve === "R")
  .reduce((totals, player) => ({
    goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
    assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
    toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
    dstat: totals.dstat + (player.DStat || 0),
    gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
  }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
```

<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('contract-tab', this)">Player Contracts</button>
    <button class="tab-button" onclick="showTab('roster-tab', this)">Player Roster</button>
    <button class="tab-button" onclick="showTab('stats-tab', this)">Player Stats</button>
  </div>
  
  <div id="contract-tab" class="tab-content active">
    <h3>Player Contract Information</h3>
    ${Inputs.table(filteredContractData, {
      columns: ["Name", "Team", "Position", "Salary", "Contract", "BirthDate", "Age"],
      header: {
        Name: "Player Name",
        Team: "Team",
        Position: "Pos",
        Salary: "Salary ($)",
        Contract: "Contract",
        BirthDate: "Birth Date",
        Age: "Age"
      },
      format: {
        Salary: x => x ? x.toLocaleString("en-US") : "0",
        BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
      },
      sort: "Name",
      rows: Math.min(filteredContractData.length, 50),
      width: {
        Team: 60,
        Position: 40,
        Salary: 80,
        Age: 50
      },
      select: false
    })}
  </div>
  
  <div id="roster-tab" class="tab-content">
    <h3>Player Roster Information</h3>
    ${Inputs.table(filteredRosterData, {
      columns: ["Name", "Team", "Position", "Reserve", "NHLTeam"],
      header: {
        Name: "Player Name",
        Team: "Team",
        Position: "Pos",
        Reserve: "R",
        NHLTeam: "NHL Team"
      },
      format: {
        Reserve: x => x === "R" ? "✓" : ""
      },
      sort: null,
      rows: Math.min(filteredRosterData.length, 50),
      width: {
        Team: 60,
        Position: 40,
        Reserve: 35
      },
      select: false
    })}
  </div>
  
  <div id="stats-tab" class="tab-content">
    <h3>Player Statistics</h3>
    <div class="stats-totals">
      <div class="totals-row active-totals">
        <strong>Active Totals:</strong>
        <span>Goals: ${activeTotals.goals}</span>
        <span>Assists: ${activeTotals.assists}</span>
        <span>Toughness: ${activeTotals.toughness}</span>
        <span>D-Stat: ${activeTotals.dstat.toFixed(2)}</span>
        <span>G-Stat: ${activeTotals.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${reserveTotals.goals}</span>
        <span>Assists: ${reserveTotals.assists}</span>
        <span>Toughness: ${reserveTotals.toughness}</span>
        <span>D-Stat: ${reserveTotals.dstat.toFixed(2)}</span>
        <span>G-Stat: ${reserveTotals.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(filteredStatsData, {
      columns: ["Name", "Team", "Position", "Reserve", "Goals", "Assists", "Toughness", "DStat", "GStat", "GamesPlayed", "NHLTeam"],
      header: {
        Name: "Player Name",
        Team: "Team", 
        Position: "Pos",
        Reserve: "R",
        Goals: "Goals",
        Assists: "Assists",
        Toughness: "Toughness",
        DStat: "D-Stat",
        GStat: "G-Stat", 
        GamesPlayed: "GP",
        NHLTeam: "NHL Team"
      },
      format: {
        Reserve: x => x === "R" ? "✓" : "",
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        GStat: x => x !== null ? x.toFixed(2) : ""
      },
      sort: null,
      rows: Math.min(filteredStatsData.length, 50),
      width: {
        Team: 60,
        Position: 40,
        Reserve: 35,
        Goals: 60,
        Assists: 60,
        Toughness: 80,
        DStat: 70,
        GStat: 70,
        GamesPlayed: 80
      },
      select: false
    })}
  </div>
</div>

```js
// Make the data globally accessible for JavaScript
window.teamsData = teams;
window.contractData = playerContractData;
window.rosterData = playerRosterData;
window.statsData = playerStatsData;

// Pass raw data for period-based processing
window.allPlayerInfo = playerInfo;
window.allContracts = contracts;
window.rosterPeriodData = rosterData;
window.statsPeriodData = statsData;

// Pass utility functions
window.mapPosition = mapPosition;
window.calculateAge = calculateAge;
window.getStatsForPeriod = getStatsForPeriod;

// Pass current period selection to JavaScript
window.currentObservablePeriod = selectedPeriod;
```

<script>
// Make period-specific data creation functions globally available
window.getRosterData = function(selectedPeriod) {
  if (selectedPeriod === "Overall") {
    // For Overall, combine all roster periods
    const allRosters = [];
    Object.values(window.rosterPeriodData).forEach(periodRoster => {
      allRosters.push(...periodRoster);
    });
    // Remove duplicates based on playerId and teamName
    const uniqueRosters = [];
    const seen = new Set();
    allRosters.forEach(roster => {
      const key = `${roster.ID}-${roster.ABBR}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRosters.push({
          ...roster,
          RESERVE: "" // Always set reserve to false for Overall period
        });
      }
    });
    return uniqueRosters;
  } else {
    // For specific periods, extract the period number
    const selectedPeriodNum = parseInt(selectedPeriod.replace('Period ', ''));
    return window.rosterPeriodData[selectedPeriodNum] || [];
  }
};

window.createPlayerContractData = function(selectedPeriod) {
  const rostersForPeriod = window.getRosterData(selectedPeriod);
  
  return window.allPlayerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
    const contract = window.allContracts.find(c => c.ID === player.ID);
  
    return {
      ID: player.ID,
      Name: player.Name,
      Team: roster ? roster.ABBR : "N/A",
      Position: window.mapPosition(player.Pos),
      Age: window.calculateAge(player.BirthDate),
      Salary: contract ? contract.Salary : 0,
      Contract: contract ? contract.Contract : "N/A",
      BirthDate: player.BirthDate
    };
  }).filter(player => player.Team !== "N/A");
};

window.createPlayerRosterData = function(selectedPeriod) {
  const rostersForPeriod = window.getRosterData(selectedPeriod);
  
  return window.allPlayerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
  
    return {
      ID: player.ID,
      Name: player.Name,
      Team: roster ? roster.ABBR : "N/A",
      Position: window.mapPosition(player.Pos),
      Reserve: roster ? roster.RESERVE : "N/A",
      NHLTeam: player["NHL Team"]
    };
  }).filter(player => player.Team !== "N/A");
};

window.createPlayerStatsData = function(selectedPeriod) {
  const rostersForPeriod = window.getRosterData(selectedPeriod);
  const statsForPeriod = window.getStatsForPeriod(selectedPeriod);
  
  return window.allPlayerInfo.map(player => {
    const roster = rostersForPeriod.find(r => r.ID === player.ID);
    const stats = statsForPeriod.find(s => s.hockeyRef === player.ID);
  
    return {
      ID: player.ID,
      Name: player.Name,
      Team: roster ? roster.ABBR : "N/A",
      Position: window.mapPosition(player.Pos),
      Reserve: roster ? roster.RESERVE : "N/A",
      Goals: stats ? stats.goals : (window.mapPosition(player.Pos) === "G" ? null : 0),
      Assists: stats ? stats.assists : (window.mapPosition(player.Pos) === "G" ? null : 0),
      Toughness: stats ? stats.toughness : (window.mapPosition(player.Pos) === "G" ? null : 0),
      DStat: stats ? stats.dstat : (window.mapPosition(player.Pos) === "G" ? null : 0),
      GStat: stats ? (stats.gstat !== null ? stats.gstat : (window.mapPosition(player.Pos) === "G" ? 0 : null)) : (window.mapPosition(player.Pos) === "G" ? 0 : null),
      GamesPlayed: stats ? stats.games_played : 0,
      NHLTeam: player["NHL Team"]
    };
  }).filter(player => player.Team !== "N/A");
};

// Make variables global
window.playerData = {
  teams: [],
  currentTeam: '',
  playerContractData: [],
  playerRosterData: [],
  playerStatsData: []
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Set up data (this will be called after the Observable data loads)
  setTimeout(function() {
    if (window.teamsData && window.contractData) {
      window.playerData.teams = window.teamsData;
      window.playerData.currentTeam = window.teamsData[0];
      
      // Store raw data for period-based processing
      window.allPlayerInfo = window.allPlayerInfo || [];
      window.allContracts = window.allContracts || [];
      window.rosterPeriodData = window.rosterPeriodData || {};
      window.statsPeriodData = window.statsPeriodData || {};
      
      // Initial data load with current Observable data
      window.playerData.playerContractData = window.contractData;
      window.playerData.playerRosterData = window.rosterData;
      window.playerData.playerStatsData = window.statsData;
      
      initializeTables();
      
      // Set up periodic check for period changes
      window.currentSelectedPeriod = "Overall";
      setInterval(function() {
        // Check if period has changed by looking at the Observable data
        if (window.currentObservablePeriod && window.currentObservablePeriod !== window.currentSelectedPeriod) {
          window.currentSelectedPeriod = window.currentObservablePeriod;
          // Update data for new period
          window.playerData.playerContractData = window.createPlayerContractData(window.currentSelectedPeriod);
          window.playerData.playerRosterData = window.createPlayerRosterData(window.currentSelectedPeriod);
          window.playerData.playerStatsData = window.createPlayerStatsData(window.currentSelectedPeriod);
          updateTables();
        }
      }, 100);
    } else {
      // Retry if data not loaded yet
      setTimeout(arguments.callee, 500);
    }
  }, 1000);
});

// Initialize tables and populate team selector
function initializeTables() {
  // Populate the team selector
  const teamSelect = document.getElementById('team-select');
  if (teamSelect && window.playerData.teams.length > 0) {
    teamSelect.innerHTML = '';
    window.playerData.teams.forEach(team => {
      const option = document.createElement('option');
      option.value = team;
      option.textContent = team;
      teamSelect.appendChild(option);
    });
    
    // Set default selection
    teamSelect.value = window.playerData.currentTeam;
    updateTables();
  }
}

// Function to filter data by team
window.filterByTeam = function(team) {
  window.playerData.currentTeam = team;
  updateTables();
}

// Function to filter player data based on selected team
function filterPlayers(data) {
  return data.filter(player => player.Team === window.playerData.currentTeam);
}

// Function to update all tables with filtered data
function updateTables() {
  if (!window.playerData.playerContractData.length) return;
  
  const filteredContractData = filterPlayers(window.playerData.playerContractData);
  const filteredRosterData = filterPlayers(window.playerData.playerRosterData);
  const filteredStatsData = filterPlayers(window.playerData.playerStatsData);
  
  // Calculate totals for active and reserve players
  const activeTotals = filteredStatsData
    .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
    .reduce((totals, player) => ({
      goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
      assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
      toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
      dstat: totals.dstat + (player.DStat || 0),
      gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
    }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

  const reserveTotals = filteredStatsData
    .filter(player => player.Reserve === "R")
    .reduce((totals, player) => ({
      goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
      assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
      toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
      dstat: totals.dstat + (player.DStat || 0),
      gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
    }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
  
  console.log('Filtered data lengths:', {
    contract: filteredContractData.length,
    roster: filteredRosterData.length, 
    stats: filteredStatsData.length
  });
  
  // Update contract table
  const contractContainer = document.getElementById('contract-table');
  if (contractContainer && typeof Inputs !== 'undefined') {
    contractContainer.innerHTML = filteredContractData.length > 0 ? '' : '<p>No players found for this team.</p>';
    if (filteredContractData.length > 0) {
      try {
        const contractTableElement = Inputs.table(filteredContractData, {
          columns: ["Name", "Team", "Position", "Salary", "Contract", "BirthDate"],
          header: {
            Name: "Player Name",
            Team: "Team",
            Position: "Position", 
            Salary: "Salary ($)",
            Contract: "Contract",
            BirthDate: "Birth Date"
          },
          format: {
            Salary: x => x ? x.toLocaleString("en-US") : "0",
            BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
          },
          sort: "Name",
          rows: Math.min(filteredContractData.length, 50),
          width: {
            Team: 60
          },
          select: false
        });
        contractContainer.appendChild(contractTableElement);
      } catch (e) {
        console.error('Error creating contract table:', e);
        contractContainer.innerHTML = '<p>Error loading contract data.</p>';
      }
    }
  }
  
  // Update roster table
  const rosterContainer = document.getElementById('roster-table');
  if (rosterContainer && typeof Inputs !== 'undefined') {
    rosterContainer.innerHTML = filteredRosterData.length > 0 ? '' : '<p>No players found for this team.</p>';
    if (filteredRosterData.length > 0) {
      try {
        const rosterTableElement = Inputs.table(filteredRosterData, {
          columns: ["Name", "Team", "Position", "Reserve", "NHLTeam"],
          header: {
            Name: "Player Name",
            Team: "Team",
            Position: "Position",
            Reserve: "Reserve Status",
            NHLTeam: "NHL Team"
          },
          sort: "Name",
          rows: Math.min(filteredRosterData.length, 50),
          width: {
            Team: 60,
            Reserve: 80
          },
          select: false
        });
        rosterContainer.appendChild(rosterTableElement);
      } catch (e) {
        console.error('Error creating roster table:', e);
        rosterContainer.innerHTML = '<p>Error loading roster data.</p>';
      }
    }
  }
  
  // Update stats table
  const statsContainer = document.getElementById('stats-table');
  if (statsContainer && typeof Inputs !== 'undefined') {
    // Update totals display
    const statsTotalsContainer = statsContainer.parentElement.querySelector('.stats-totals');
    if (statsTotalsContainer) {
      statsTotalsContainer.innerHTML = `
        <div class="totals-row active-totals">
          <strong>Active Totals:</strong>
          <span>Goals: ${activeTotals.goals}</span>
          <span>Assists: ${activeTotals.assists}</span>
          <span>Toughness: ${activeTotals.toughness}</span>
          <span>D-Stat: ${activeTotals.dstat.toFixed(2)}</span>
          <span>G-Stat: ${activeTotals.gstat.toFixed(2)}</span>
        </div>
        <div class="totals-row reserve-totals">
          <strong>Reserve Totals:</strong>
          <span>Goals: ${reserveTotals.goals}</span>
          <span>Assists: ${reserveTotals.assists}</span>
          <span>Toughness: ${reserveTotals.toughness}</span>
          <span>D-Stat: ${reserveTotals.dstat.toFixed(2)}</span>
          <span>G-Stat: ${reserveTotals.gstat.toFixed(2)}</span>
        </div>
      `;
    }
    
    statsContainer.innerHTML = filteredStatsData.length > 0 ? '' : '<p>No players found for this team.</p>';
    if (filteredStatsData.length > 0) {
      try {
        const statsTableElement = Inputs.table(filteredStatsData, {
          columns: ["Name", "Team", "Position", "Reserve", "Goals", "Assists", "Toughness", "DStat", "GStat", "GamesPlayed", "NHLTeam"],
          header: {
            Name: "Player Name",
            Team: "Team", 
            Position: "Position",
            Reserve: "Reserve",
            Goals: "Goals",
            Assists: "Assists",
            Toughness: "Toughness",
            DStat: "D-Stat",
            GStat: "G-Stat", 
            GamesPlayed: "Games Played",
            NHLTeam: "NHL Team"
          },
          format: {
            DStat: x => x ? x.toFixed(2) : "0.00",
            GStat: x => x ? x.toFixed(2) : "0.00"
          },
          sort: "Name",
          rows: Math.min(filteredStatsData.length, 50),
          width: {
            Team: 60,
            Reserve: 60,
            Goals: 60,
            Assists: 60,
            Toughness: 80,
            DStat: 70,
            GStat: 70,
            GamesPlayed: 80
          },
          select: false
        });
        statsContainer.appendChild(statsTableElement);
      } catch (e) {
        console.error('Error creating stats table:', e);
        statsContainer.innerHTML = '<p>Error loading stats data.</p>';
      }
    }
  }
}

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
.team-selector {
  margin: 20px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.team-selector label {
  font-weight: 600;
  margin-right: 10px;
  color: #333;
}

.team-selector select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  min-width: 150px;
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

.stats-totals {
  margin: 15px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.totals-row {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px 0;
}

.totals-row:last-child {
  margin-bottom: 0;
}

.active-totals {
  border-bottom: 1px solid #ddd;
  padding-bottom: 12px;
}

.totals-row strong {
  min-width: 120px;
  color: #333;
}

.totals-row span {
  font-weight: 500;
  color: #555;
  background-color: white;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
  font-size: 14px;
}
</style>
