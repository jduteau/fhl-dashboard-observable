---
theme: dashboard
toc: false
---

# Player Statistics

```js
import {playerLinksFormat} from "./components/playerLink.js";

// Load the data files
const teamInfo = await FileAttachment("./data/rosters.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || teamInfo.currentSeason;
const _sd = teamInfo.data[_season];

const teamSelector = Inputs.select(_sd.teams, {label: "Select Team:"});
const selectedTeam = Generators.input(teamSelector);

const periodSelector = Inputs.select(_sd.availablePeriods, {label: "Select Period:", value: String(_sd.latestPeriod)}); // opens on the period in progress
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
    ${Inputs.table(_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
      columns: ["Name", "PLAYER_ID", "Position", "Salary", "Contract", "BirthDate", "Age"],
      header: {
        Name: "Player Name",
        PLAYER_ID: "Links",
        Position: "Pos",
        Salary: "Salary ($)",
        Contract: "Contract",
        BirthDate: "Birth Date",
        Age: "Age"
      },
      format: {
        PLAYER_ID: playerLinksFormat,
        Salary: x => x ? x.toLocaleString("en-US") : "0",
        BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
      },
      sort: "Name",
      rows: 50,
      width: {
        PLAYER_ID: 90,
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
        <span>Goals: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.goals}</span>
        <span>Assists: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.assists}</span>
        <span>Toughness: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.toughness}</span>
        <span>D-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.goals}</span>
        <span>Assists: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.assists}</span>
        <span>Toughness: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.toughness}</span>
        <span>D-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
      columns: ["Name", "PLAYER_ID", "Position", "Reserve", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "Rating", "NHLTeam", "Salary", "Contract", "BirthDate", "Age"],
      header: {
        Name: "Player Name",
        PLAYER_ID: "Links",
        Position: "Pos",
        Reserve: "R",
        GamesPlayed: "GP",
        Goals: "Goals",
        Assists: "Assists",
        Toughness: "Toughness",
        DStat: "D/G-Stat",
        Rating: "Rate",
        NHLTeam: "NHL",
        Salary: "Salary ($)",
        Contract: "Contract",
        BirthDate: "Birth Date",
        Age: "Age"
      },
      format: {
        PLAYER_ID: playerLinksFormat,
        Reserve: x => x === "R" ? "✓" : "",
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0),
        Salary: x => x ? x.toLocaleString("en-US") : "0",
        BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
      },
      sort: null,
      width: {
        PLAYER_ID: 90,
        Position: 40,
        Reserve: 20,
        Goals: 40,
        Assists: 40,
        Toughness: 40,
        DStat: 70,
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
        <span>Goals: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.goals}</span>
        <span>Assists: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.assists}</span>
        <span>Toughness: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.toughness}</span>
        <span>D-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ACTIVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
      <div class="totals-row reserve-totals">
        <strong>Reserve Totals:</strong>
        <span>Goals: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.goals}</span>
        <span>Assists: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.assists}</span>
        <span>Toughness: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.toughness}</span>
        <span>D-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.dstat.toFixed(2)}</span>
        <span>G-Stat: ${_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].RESERVE_TOTALS.gstat.toFixed(2)}</span>
      </div>
    </div>
    ${Inputs.table(_sd.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER, {
      columns: ["Name", "PLAYER_ID", "Position", "Reserve", "GamesPlayed", "Goals", "Assists", "PIM", "Hits", "Toughness", "Blocks", "Take", "Give", "TOI", "DStat", "Record", "SO", "GA", "SA", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        PLAYER_ID: "Links",
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
        DStat: "D-GStat",
        Record: "Record",
        SO: "SO",
        GA: "GA",
        SA: "SA",
        GamesPlayed: "GP",
        NHLTeam: "NHL",
        Rating: "Rate"
      },
      format: {
        PLAYER_ID: playerLinksFormat,
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
        Rating: x => x.toFixed(0)
      },
      width: {
        PLAYER_ID: 90,
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
        GamesPlayed: 40,
        NHLTeam: 40,
        Rating: 40
     },
      rows: 50,
      select: false
    })}
  </div>
</div>


<link rel="stylesheet" href="./styles/tabs.css">

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
#ext-stats-tab table th:nth-child(7), /* Goals */
#ext-stats-tab table td:nth-child(7),
#ext-stats-tab table th:nth-child(8), /* Assists */
#ext-stats-tab table td:nth-child(8),
#ext-stats-tab table th:nth-child(11), /* Toughness */
#ext-stats-tab table td:nth-child(11),
#ext-stats-tab table th:nth-child(16), /* DStat */
#ext-stats-tab table td:nth-child(16),
#ext-stats-tab table th:nth-child(21), /* GStat */
#ext-stats-tab table td:nth-child(21) {
  font-weight: bold;
}
</style>
