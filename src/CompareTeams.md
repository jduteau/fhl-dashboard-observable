---
theme: dashboard
toc: false
---

# Compare Teams

```js
// Load the data files
const rosters = await FileAttachment("./data/rosters.json").json();
const teamInfo = await FileAttachment("./data/teamInfo.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const _rsd = rosters.data[_season];
const _tisd = teamInfo.data[_season];

const team1Selector = Inputs.select(_rsd.teams, {label: "Select Team 1:"});
const selectedTeam1 = Generators.input(team1Selector);

const team2Selector = Inputs.select(_rsd.teams, {label: "Select Team 2:"});
const selectedTeam2 = view(team2Selector);

function createRosterTable(roster) {
  return Inputs.table(roster, {
      columns: ["Name", "Position", "Salary", "Contract", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Salary: "Sal",
        Contract: "Cont",
        GamesPlayed: "GP",
        Goals: "G",
        Assists: "A",
        Toughness: "T",
        DStat: "D/GS",
        Rating: "Rate",
        NHLTeam: "NHL"
      },
      format: {
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0)
      },
      sort: null,
      width: {
        Position: 25,
        Salary: 20,
        Contract: 40,
        Goals: 20,
        Assists: 20,
        Toughness: 25,
        DStat: 45,
        GamesPlayed: 20,
        NHLTeam: 35,
        Rating: 30
      },
      rows: 50,
      required: false
    });
}
```

```js
const team1 = _tisd.teams.find((t) => t.ABBR === selectedTeam1);
const team2 = _tisd.teams.find((t) => t.ABBR === selectedTeam2);
const team1Roster = _rsd.teamData.find((t) => t.ABBR === selectedTeam1)["OVERALL"].ROSTER;
const team2Roster = _rsd.teamData.find((t) => t.ABBR === selectedTeam2)["OVERALL"].ROSTER;
```

```js
const team1Table = createRosterTable(team1Roster);
const team2Table = createRosterTable(team2Roster);

const team1Selections = view(team1Table);
const team2Selections = view(team2Table);
```
```js
const team1Trades = team1Selections.map((player) => `${player.Name}`).join(', ');
const team2Trades = team2Selections.map((player) => `${player.Name}`).join(', ');

const team1SalariesOut = team1Selections.map((player) => player.Salary).reduce(function(prev,cur) { return prev + cur; }, 0);
const team2SalariesOut = team2Selections.map((player) => player.Salary).reduce(function(prev,cur) { return prev + cur; }, 0);

const team1NewSalaryPerPeriod = (team1.LatestSalary - team1SalariesOut + team2SalariesOut) / 25;
const team2NewSalaryPerPeriod = (team2.LatestSalary - team2SalariesOut + team1SalariesOut) / 25;
const team1NewBudget = team1.CASH - (team1NewSalaryPerPeriod < 13 ? 13 : team1NewSalaryPerPeriod) * (25 - _tisd.lastPeriodNum);
const team2NewBudget = team2.CASH - (team2NewSalaryPerPeriod < 13 ? 13 : team2NewSalaryPerPeriod) * (25 - _tisd.lastPeriodNum);
```

<pre>
TRADE DETAILS
To ${selectedTeam1}
${team2Trades}
To ${selectedTeam2}
${team1Trades}

New ${selectedTeam1} Budget: ${team1NewBudget.toFixed(2)}
New ${selectedTeam2} Budget: ${team2NewBudget.toFixed(2)}
</pre>

<div class="grid grid-cols-2">
  <div class="card">
    ${team1Selector}
    <p>CASH: $ ${team1.CASH} Budget: $ ${team1.Budget.toFixed(2)} Salaries: $ ${team1.LatestSalary}</p>
    <p>CURRENT PICKS: ${team1["CURRENT_PICKS"]}</p>
    <p>NEXT YEAR PICKS: ${team1["NEXT_PICKS"]}</p>
    ${team1Table}
  </div>
  <div class="card">
    ${team2Selector}
    <p>CASH: $ ${team2.CASH} Budget: $ ${team2.Budget.toFixed(2)} Salaries: $ ${team2.LatestSalary}</p>
    <p>CURRENT PICKS: ${team2["CURRENT_PICKS"]}</p>
    <p>NEXT YEAR PICKS: ${team2["NEXT_PICKS"]}</p>
    ${team2Table}
  </div>
</div>