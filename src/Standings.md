---
theme: dashboard
toc: false
---

# Team Standings and Rankings

```js
// Load the data files
const teamInfo = await FileAttachment("./data/standings.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || teamInfo.currentSeason;
const _sd = teamInfo.data[_season];
const _cashInfo = await FileAttachment("./data/teamInfo.json").json();
const _cash = Object.fromEntries(_cashInfo.data[_season].teams.map(t => [t.ABBR, t.CASH]));

const periodSelector = Inputs.select(_sd.availablePeriods, {label: "Select Period:", value: _sd.availablePeriods[_sd.availablePeriods.length-1]});
const selectedPeriod = Generators.input(periodSelector);

// Create division-grouped standings
const divisionStandings = {};
_sd.rankings.overallStandings.forEach(team => {
  // Get team division from teams data
  const teamData = _sd.teams.find(t => t.ABBR === team.team);
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

// Proposed playoff order: 16 teams, division winners seeded 1-4, rest by record.
// Teams with a negative bank balance are ineligible; the best eligible team in a division is its winner.
const _ranked = _sd.rankings.overallStandings.map(t => ({
  ...t,
  division: _sd.teams.find(x => x.ABBR === t.team).DIVISION,
  bank: +_cash[t.team]
}));
const _eligible = _ranked.filter(t => t.bank >= 0);
const playoffIneligible = _ranked.filter(t => t.bank < 0);
const _winners = [...new Set(_eligible.map(t => t.division))]
  .map(d => _eligible.find(t => t.division === d))
  .sort((a, b) => a.overallRank - b.overallRank);
const _others = _eligible.filter(t => !_winners.includes(t)).slice(0, 16 - _winners.length);
const _qualified = [..._winners, ..._others.sort((a, b) => a.overallRank - b.overallRank)];
const _n = _qualified.length;
const playoffMatchups = _qualified.slice(0, Math.floor(_n / 2)).map((t, i) => {
  const o = _qualified[_n - 1 - i];
  return {
    seed: i + 1, teamName: t.teamName, division: t.division, divWinner: _winners.includes(t) ? "Yes" : "",
    oppSeed: _n - i, oppName: o.teamName, oppDivision: o.division, oppDivWinner: _winners.includes(o) ? "Yes" : ""
  };
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
    <h3>Proposed Playoff Order</h3>
    <p>Top 16 teams qualify (1 vs 16 matchups). Division winners are seeded 1-4; the rest are seeded by record. Teams with a negative bank balance are ineligible.</p>
    ${Inputs.table(playoffMatchups, {
      columns: ["seed", "teamName", "division", "divWinner", "oppSeed", "oppName", "oppDivision"],
      header: {seed: "Seed", teamName: "Team", division: "Division", divWinner: "Div Winner", oppSeed: "Seed", oppName: "Opponent", oppDivision: "Division"},
      width: {seed: 40, teamName: 130, division: 90, divWinner: 70, oppSeed: 40, oppName: 130, oppDivision: 90},
      rows: 9,
      select: false
    })}
    ${playoffIneligible.length ? html`<h4>Ineligible (negative bank balance)</h4>${Inputs.table(playoffIneligible, {
      columns: ["teamName", "division", "overallRank", "bank"],
      header: {teamName: "Team", division: "Division", overallRank: "Overall", bank: "Bank"},
      format: {bank: x => x.toFixed(2)},
      select: false
    })}` : ""}
  </div>
  
  <div id="rankings-tab" class="tab-content">
   ${periodSelector}
    ${Inputs.table(_sd.rankings.periods[selectedPeriod-1], {
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

<link rel="stylesheet" href="./styles/tabs.css">

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

</style>