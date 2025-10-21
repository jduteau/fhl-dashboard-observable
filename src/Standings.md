---
theme: dashboard
toc: false
---

# Team Standings and Rankings

```js
// Load the data files
const teamInfo = await FileAttachment("./data/teams.json").json();

const periodSelector = Inputs.select(teamInfo.availablePeriods, {label: "Select Period:", value: teamInfo.availablePeriods.length});
const selectedPeriod = Generators.input(periodSelector);

```
<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('standings-tab', this)">Team Standings</button>
    <button class="tab-button" onclick="showTab('rankings-tab', this)">Team Rankings</button>
  </div>
  
  <div id="standings-tab" class="tab-content active">
    <h3>Team Standings</h3>
  </div>
  
  <div id="rankings-tab" class="tab-content">
   ${periodSelector}
   <h3>Team Rankings by Category</h3>
    ${Inputs.table(teamInfo.rankings[selectedPeriod-1], {
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
        dstat: x => x.toFixed(2),
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