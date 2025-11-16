---
theme: dashboard
toc: false
---

# Player Statistics

```js
// Load the data files
const teamInfo = await FileAttachment("./data/players.json").json();

const teamSelector = Inputs.select(teamInfo.teams, {label: "Select Team:"});
const selectedTeam = Generators.input(teamSelector);

const periodSelector = Inputs.select(teamInfo.availablePeriods, {label: "Select Period:", value: teamInfo.availablePeriods[teamInfo.availablePeriods.length-2]});
const selectedPeriod = Generators.input(periodSelector);
```

${teamSelector}
${periodSelector}

<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('stats-tab', this)">Player Stats</button>
    <button class="tab-button" onclick="showTab('ext-stats-tab', this)">Player Extended Stats</button>
  </div>
  
  <div id="contract-tab" class="tab-content">
    ${Inputs.table(teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
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
  
  <div id="stats-tab" class="tab-content active">
    <div class="stats-totals">
      <div class="totals-row active-totals">
        <strong>Active Totals:</strong>
        <span>Goals: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
      columns: ["Name", "Position", "Reserve", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "GStat", "Rating", "NHLTeam", "Salary", "Contract", "BirthDate", "Age"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Reserve: "R",
        GamesPlayed: "GP",
        Goals: "Goals",
        Assists: "Assists",
        Toughness: "Toughness",
        DStat: "D-Stat",
        GStat: "G-Stat", 
        Rating: "Rate",
        NHLTeam: "NHL",
        Salary: "Salary ($)",
        Contract: "Contract",
        BirthDate: "Birth Date",
        Age: "Age"
      },
      format: {
        Reserve: x => x === "R" ? "✓" : "",
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        GStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0),
        Salary: x => x ? x.toLocaleString("en-US") : "0",
        BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
      },
      sort: null,
      width: {
        Position: 40,
        Reserve: 20,
        Goals: 40,
        Assists: 40,
        Toughness: 40,
        DStat: 70,
        GStat: 70,
        GamesPlayed: 40,
        NHLTeam: 40,
        Rating: 40,
        Salary: 40,
        Contract: 40,
        BirthDate: 70,
        Age: 40
      },
      rows: 50,
      select: false
    })}
  </div>

  <div id="ext-stats-tab" class="tab-content">
    <div class="stats-totals">
      <div class="totals-row active-totals">
        <strong>Active Totals:</strong>
        <span>Goals: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.goals}</span>
        <span>Assists: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.assists}</span>
        <span>Toughness: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.toughness}</span>
        <span>D-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
      columns: ["Name", "Position", "Reserve", "GamesPlayed", "Goals", "Assists", "PIM", "Hits", "Toughness", "Blocks", "Take", "Give", "TOI", "DStat", "Record", "SO", "GA", "SA", "GStat", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Reserve: "R",
        Goals: "G",
        Assists: "A",
        PIM: "PIM",
        Hits: "Hits",
        Toughness: "TGH",
        Blocks: "Blks",
        Take: "Take",
        Give: "Give",
        TOI: "TOI",
        DStat: "DStat",
        Record: "Record",
        SO: "SO",
        GA: "GA",
        SA: "SA",
        GStat: "GStat", 
        GamesPlayed: "GP",
        NHLTeam: "NHL",
        Rating: "Rate"
      },
      format: {
        Reserve: x => x === "R" ? "✓" : "",
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        PIM: x => x !== null ? x : "",
        Hits:  x => x !== null ? x : "",
        Blocks:  x => x !== null ? x : "",
        Take:  x => x !== null ? x : "",
        Give:  x => x !== null ? x : "",
        TOI:  x => x !== null ? x : "",
        Record:   x => x !== null ? x : "",
        SO:  x => x !== null ? x : "",
        GA:  x => x !== null ? x : "",
        SA:  x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        GStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0)
      },
      width: {
        Position: 40,
        Reserve: 20,
        Goals: 40,
        Assists: 40,
        PIM: 40,
        Hits: 40,
        Toughness: 40,
        Blocks: 40,
        Take: 40,
        Give: 40,
        TOI: 70,
        DStat: 70,
        Record: 70,
        SO: 40,
        GA: 50,
        SA: 60,
        GStat: 70,
        GamesPlayed: 40,
        NHLTeam: 40,
        Rating: 40
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

/* Bold specific columns in ext-stats-tab */
#ext-stats-tab table th:nth-child(6), /* Goals */
#ext-stats-tab table td:nth-child(6),
#ext-stats-tab table th:nth-child(7), /* Assists */
#ext-stats-tab table td:nth-child(7),
#ext-stats-tab table th:nth-child(10), /* Toughness */
#ext-stats-tab table td:nth-child(10),
#ext-stats-tab table th:nth-child(15), /* DStat */
#ext-stats-tab table td:nth-child(15),
#ext-stats-tab table th:nth-child(20), /* GStat */
#ext-stats-tab table td:nth-child(20) {
  font-weight: bold;
}
</style>
