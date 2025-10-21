---
theme: dashboard
toc: false
---

# Player Statistics

```js
// Load the data files
const teamInfo = await FileAttachment("./data/teams.json").json();

// Get unique teams for the selector
const teams = Object.keys(teamInfo.teams).sort();

const teamSelector = Inputs.select(teams, {label: "Select Team:", value: teams[0]});
const selectedTeam = Generators.input(teamSelector);

const periodSelector = Inputs.select(teamInfo.availablePeriods, {label: "Select Period:", value: "3"});
const selectedPeriod = Generators.input(periodSelector);
```

${teamSelector}
${periodSelector}

<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('stats-tab', this)">Player Stats</button>
    <button class="tab-button" onclick="showTab('roster-tab', this)">Player Roster</button>
    <button class="tab-button" onclick="showTab('contract-tab', this)">Player Contracts</button>
  </div>
  
  <div id="contract-tab" class="tab-content">
    <h3>Player Contract Information</h3>
    ${Inputs.table(teamInfo.teams[selectedTeam][selectedPeriod].ROSTER, {
      columns: ["Name", "Position", "Salary", "Contract", "BirthDate", "Age"],
      header: {
        Name: "Player Name",
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
      rows: 50,
      width: {
        Position: 40,
        Salary: 80,
        Age: 50
      },
      select: false
    })}
  </div>
  
  <div id="roster-tab" class="tab-content">
    <h3>Player Roster Information</h3>
    ${Inputs.table(teamInfo.teams[selectedTeam][selectedPeriod].ROSTER, {
      columns: ["Name", "Position", "Reserve", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Reserve: "R",
        NHLTeam: "NHL"
      },
      format: {
        Reserve: x => x === "R" ? "✓" : ""
      },
      sort: null,
      rows: 50,
      width: {
        NHL: 60,
        Position: 40,
        Reserve: 35
      },
      select: false
    })}
  </div>
  
  <div id="stats-tab" class="tab-content active">
    <h3>Player Statistics</h3>
    <div class="stats-totals">
      <div class="totals-row active-totals">
        <strong>Active Totals:</strong>
        <span>Goals: ${teamInfo.teams[selectedTeam][selectedPeriod].ACTIVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teams[selectedTeam][selectedPeriod].ACTIVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teams[selectedTeam][selectedPeriod].ACTIVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teams[selectedTeam][selectedPeriod].ACTIVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teams[selectedTeam][selectedPeriod].ACTIVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${teamInfo.teams[selectedTeam][selectedPeriod].RESERVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teams[selectedTeam][selectedPeriod].RESERVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teams[selectedTeam][selectedPeriod].RESERVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teams[selectedTeam][selectedPeriod].RESERVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teams[selectedTeam][selectedPeriod].RESERVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(teamInfo.teams[selectedTeam][selectedPeriod].ROSTER, {
      columns: ["Name", "Position", "Reserve", "Goals", "Assists", "Toughness", "DStat", "GStat", "GamesPlayed", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Reserve: "R",
        Goals: "Goals",
        Assists: "Assists",
        Toughness: "Toughness",
        DStat: "D-Stat",
        GStat: "G-Stat", 
        GamesPlayed: "GP",
        NHLTeam: "NHL"
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
      width: {
        Position: 40,
        Reserve: 35,
        Goals: 60,
        Assists: 60,
        Toughness: 80,
        DStat: 70,
        GStat: 70,
        GamesPlayed: 80,
        NHLTeam: 60
      },
      rows: 50,
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
