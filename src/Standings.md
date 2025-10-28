---
theme: dashboard
toc: false
---

# Team Standings and Rankings

```js
// Load the data files
const teamInfo = await FileAttachment("./data/standings.json").json();

const periodSelector = Inputs.select(teamInfo.availablePeriods, {label: "Select Period:", value: teamInfo.availablePeriods[teamInfo.availablePeriods.length-1]});
const selectedPeriod = Generators.input(periodSelector);

// Create division-grouped standings
const divisionStandings = {};
teamInfo.rankings.overallStandings.forEach(team => {
  // Get team division from teams data
  const teamData = teamInfo.teams.find(t => t.ABBR === team.team);
  const division = teamData.DIVISION;
  
  if (!divisionStandings[division]) {
    divisionStandings[division] = [];
  }
  
  divisionStandings[division].push({
    ...team,
    division: division
  });
});

Object.keys(divisionStandings).forEach(division => {
  // Add division rank
  divisionStandings[division].forEach((team, index) => {
    team.divisionRank = index + 1;
  });
});
```
<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('standings-tab', this)">Team Standings</button>
    <button class="tab-button" onclick="showTab('rankings-tab', this)">Team Rankings</button>
  </div>
  
  <div id="standings-tab" class="tab-content active">
    <div>
      ${Object.keys(divisionStandings).sort().map(division => html`
        <div>
          <h4>${division} Division</h4>
          ${Inputs.table(divisionStandings[division], {
            columns: [
              "divisionRank",
              "teamName", 
              "wins",
              "losses",
              "ties",
              "points",
              "overallRank",
              "goals",
              "goalsRank",
              "assists",
              "assistsRank",
              "toughness", 
              "toughnessRank",
              "dstat",
              "dstatRank",
              "gstat",
              "gstatRank"
            ],
            header: {
              divisionRank: "Rank",
              teamName: "Team",
              wins: "Wins",
              losses: "Losses", 
              ties: "Ties",
              points: "Points",
              overallRank: "Overall",
              goals: "Goals",
              goalsRank: "GRank",
              assists: "Assists",
              assistsRank: "ARank",
              toughness: "Toughness",
              toughnessRank: "TRank",
              dstat: "D-Stat",
              dstatRank: "DRank",
              gstat: "G-Stat",
              gstatRank: "GRank",
            },
            format: {
              goals: x => x.toLocaleString("en-US"),
              assists: x => x.toLocaleString("en-US"),
              toughness: x => x.toLocaleString("en-US"),
              dstat: x => x.toFixed(4),
              gstat: x => x.toFixed(2),
            },
            width: {
              divisionRank: 60,
              teamName: 130,
              wins: 30,
              losses: 30,
              ties: 30,
              points: 30,
              overallRank: 70,
              goals: 50,
              assists: 50,
              toughness: 50,
              dstat: 50,
              gstat: 50,
              goalsRank: 50,
              assistsRank: 50,
              toughnessRank: 50,
              dstatRank: 50,
              gstatRank: 50,
            },
            select: false
          })}
        </div>
      `)}
    </div>
  </div>
  
  <div id="rankings-tab" class="tab-content">
   ${periodSelector}
    ${Inputs.table(teamInfo.rankings.periods[selectedPeriod-1], {
      columns: [
        "overallRank",
        "team",
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
        "overall",
        "record"
      ],
      header: {
        overallRank: "Rank",
        team: "Team",
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
        overall: "Total",
        record: "Record"
      },
      format: {
        goals: x => x.toLocaleString("en-US"),
        assists: x => x.toLocaleString("en-US"),
        toughness: x => x.toLocaleString("en-US"),
        dstat: x => x.toFixed(4),
        gstat: x => x.toFixed(2)
      },
      sort: "overallRank",
      rows: 33,
      width: {
        overallRank: 30,
        team: 30,
        goals: 50,
        goalsRank: 30,
        assists: 50,
        assistsRank: 30,
        toughness: 50,
        toughnessRank: 30,
        dstat: 50,
        dstatRank: 30,
        gstat: 50,
        gstatRank: 30,
        overall: 30,
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