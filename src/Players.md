---
theme: dashboard
toc: false
---

# Player Statistics

```js
// Load the data files
const contracts = await FileAttachment("data/contracts.csv").csv({typed: true});
const rosters = await FileAttachment("data/rosters.csv").csv({typed: true});
const playerInfo = await FileAttachment("data/player_info.csv").csv({typed: true});
const teamInfo = await FileAttachment("data/team_info.csv").csv({typed: true});

// Load all available stats periods (up to 25)
const statsData = {};

// Pre-define all possible FileAttachments
const statsPeriods = [
  { period: 1, data: await FileAttachment("data/stats_p01.csv").csv({typed: true}).catch(() => null) },
  { period: 2, data: await FileAttachment("data/stats_p02.csv").csv({typed: true}).catch(() => null) },
  { period: 3, data: await FileAttachment("data/stats_p03.csv").csv({typed: true}).catch(() => null) },
  { period: 4, data: await FileAttachment("data/stats_p04.csv").csv({typed: true}).catch(() => null) },
  { period: 5, data: await FileAttachment("data/stats_p05.csv").csv({typed: true}).catch(() => null) },
  { period: 6, data: await FileAttachment("data/stats_p06.csv").csv({typed: true}).catch(() => null) },
  { period: 7, data: await FileAttachment("data/stats_p07.csv").csv({typed: true}).catch(() => null) },
  { period: 8, data: await FileAttachment("data/stats_p08.csv").csv({typed: true}).catch(() => null) },
  { period: 9, data: await FileAttachment("data/stats_p09.csv").csv({typed: true}).catch(() => null) },
  { period: 10, data: await FileAttachment("data/stats_p10.csv").csv({typed: true}).catch(() => null) },
  { period: 11, data: await FileAttachment("data/stats_p11.csv").csv({typed: true}).catch(() => null) },
  { period: 12, data: await FileAttachment("data/stats_p12.csv").csv({typed: true}).catch(() => null) },
  { period: 13, data: await FileAttachment("data/stats_p13.csv").csv({typed: true}).catch(() => null) },
  { period: 14, data: await FileAttachment("data/stats_p14.csv").csv({typed: true}).catch(() => null) },
  { period: 15, data: await FileAttachment("data/stats_p15.csv").csv({typed: true}).catch(() => null) },
  { period: 16, data: await FileAttachment("data/stats_p16.csv").csv({typed: true}).catch(() => null) },
  { period: 17, data: await FileAttachment("data/stats_p17.csv").csv({typed: true}).catch(() => null) },
  { period: 18, data: await FileAttachment("data/stats_p18.csv").csv({typed: true}).catch(() => null) },
  { period: 19, data: await FileAttachment("data/stats_p19.csv").csv({typed: true}).catch(() => null) },
  { period: 20, data: await FileAttachment("data/stats_p20.csv").csv({typed: true}).catch(() => null) },
  { period: 21, data: await FileAttachment("data/stats_p21.csv").csv({typed: true}).catch(() => null) },
  { period: 22, data: await FileAttachment("data/stats_p22.csv").csv({typed: true}).catch(() => null) },
  { period: 23, data: await FileAttachment("data/stats_p23.csv").csv({typed: true}).catch(() => null) },
  { period: 24, data: await FileAttachment("data/stats_p24.csv").csv({typed: true}).catch(() => null) },
  { period: 25, data: await FileAttachment("data/stats_p25.csv").csv({typed: true}).catch(() => null) }
];

// Filter out null results and populate statsData
statsPeriods.forEach(periodInfo => {
  if (periodInfo.data) {
    statsData[periodInfo.period] = periodInfo.data;
  }
});

// Calculate period-by-period stats (current period - previous period)
const playerStats = {};

// Get all available periods
const availablePeriods = Object.keys(statsData).map(Number).sort((a, b) => a - b);

availablePeriods.forEach(period => {
  const currentPeriodData = statsData[period];
  const previousPeriodData = period > 1 ? statsData[period - 1] : null;
  
  // Create a map of previous period stats for quick lookup
  const previousStats = {};
  if (previousPeriodData) {
    previousPeriodData.forEach(stat => {
      previousStats[stat.hockeyRef] = stat;
    });
  }
  
  // Process current period data
  currentPeriodData.forEach(currentStat => {
    const id = currentStat.hockeyRef;
    const prevStat = previousStats[id];
    
    // Calculate period stats (current - previous, or current if no previous)
    const periodStats = {
      hockeyRef: id,
      team: currentStat.team,
      pos: currentStat.pos,
      goals: (currentStat["stats/goals"] || 0) - (prevStat ? (prevStat["stats/goals"] || 0) : 0),
      assists: (currentStat["stats/assists"] || 0) - (prevStat ? (prevStat["stats/assists"] || 0) : 0),
      toughness: (currentStat["stats/toughness"] || 0) - (prevStat ? (prevStat["stats/toughness"] || 0) : 0),
      dstat: (currentStat["stats/dstat"] || 0) - (prevStat ? (prevStat["stats/dstat"] || 0) : 0),
      gstat: (currentStat["stats/gstat"] || 0) - (prevStat ? (prevStat["stats/gstat"] || 0) : 0),
      games_played: (currentStat["stats/gp"] || 0) - (prevStat ? (prevStat["stats/gp"] || 0) : 0)
    };
    
    // Add to or update player's total stats
    if (!playerStats[id]) {
      playerStats[id] = {
        hockeyRef: id,
        team: periodStats.team,
        pos: periodStats.pos,
        goals: 0,
        assists: 0,
        toughness: 0,
        dstat: 0,
        gstat: 0,
        games_played: 0
      };
    }
    
    // Add this period's stats to the total
    playerStats[id].goals += periodStats.goals;
    playerStats[id].assists += periodStats.assists;
    playerStats[id].toughness += periodStats.toughness;
    playerStats[id].dstat += periodStats.dstat;
    playerStats[id].gstat += periodStats.gstat;
    playerStats[id].games_played += periodStats.games_played;
    
    // Update team info in case player was traded
    playerStats[id].team = periodStats.team;
  });
});

// Convert back to array
const combinedStats = Object.values(playerStats);

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

// Create player contract data
const playerContractData = playerInfo.map(player => {
  const roster = rosters.find(r => r.ID === player.ID);
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

// Create player roster data  
const playerRosterData = playerInfo.map(player => {
  const roster = rosters.find(r => r.ID === player.ID);
  
  return {
    ID: player.ID,
    Name: player.Name,
    Team: roster ? roster.ABBR : "N/A",
    Position: mapPosition(player.Pos),
    Reserve: roster ? roster.RESERVE : "N/A",
    NHLTeam: player["NHL Team"]
  };
}).filter(player => player.Team !== "N/A");

// Create player stats data
const playerStatsData = playerInfo.map(player => {
  const roster = rosters.find(r => r.ID === player.ID);
  const stats = combinedStats.find(s => s.hockeyRef === player.ID);
  
  return {
    ID: player.ID,
    Name: player.Name,
    Team: roster ? roster.ABBR : "N/A",
    Position: mapPosition(player.Pos),
    Reserve: roster ? roster.RESERVE : "N/A",
    Goals: stats ? stats.goals : 0,
    Assists: stats ? stats.assists : 0,
    Toughness: stats ? stats.toughness : 0,
    DStat: stats ? stats.dstat : 0,
    GStat: stats ? stats.gstat : 0,
    GamesPlayed: stats ? stats.games_played : 0,
    NHLTeam: player["NHL Team"]
  };
}).filter(player => player.Team !== "N/A");

// Get unique teams for the selector
const teams = teamInfo.map(team => team.ABBR).sort();
```

```js
const teamSelector = Inputs.select(teams, {label: "Select Team:", value: teams[0]});
const selectedTeam = Generators.input(teamSelector);
```

${teamSelector}

```js
// Filter data based on selected team
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
        DStat: x => x ? x.toFixed(2) : "0.00",
        GStat: x => x ? x.toFixed(2) : "0.00"
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

<script>
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
      window.playerData.playerContractData = window.contractData;
      window.playerData.playerRosterData = window.rosterData;
      window.playerData.playerStatsData = window.statsData;
      initializeTables();
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
</style>
