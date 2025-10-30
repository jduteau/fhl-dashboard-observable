---
theme: dashboard
toc: false
---

# Compare Teams

```js
// Load the data files
const teamPlayers = await FileAttachment("./data/players.json").json();
const teamInfo = await FileAttachment("./data/teams.json").json();

const team1Selector = Inputs.select(teamPlayers.teams, {label: "Select Team 1:"});
const selectedTeam1 = Generators.input(team1Selector);

const team2Selector = Inputs.select(teamPlayers.teams, {label: "Select Team 2:"});
const selectedTeam2 = Generators.input(team2Selector);

const team1 = teamInfo.teams.find((t) => t.ABBR === selectedTeam1);
const team2 = teamInfo.teams.find((t) => t.ABBR === selectedTeam2);

```
<div class="grid grid-cols-2">
    <div class="card">
    ${team1Selector}
    <p>CASH: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam1).CASH} Budget: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam1).Budget.toFixed(2)} Salaries: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam1).LatestSalary}</p>
    <p>CURRENT PICKS: ${teamInfo.teams.find((t) => t.ABBR === selectedTeam1)["CURRENT_PICKS"]}</p>
    <p>NEXT YEAR PICKS: ${teamInfo.teams.find((t) => t.ABBR === selectedTeam1)["NEXT_PICKS"]}</p>
    ${Inputs.table(teamPlayers.teamData.find((t) => t.ABBR === selectedTeam1)["OVERALL"].ROSTER, {
      columns: ["Name", "Position", "Salary", "Contract", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "GStat", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Salary: "Sal",
        Contract: "Cont",
        GamesPlayed: "GP",
        Goals: "G",
        Assists: "A",
        Toughness: "T",
        DStat: "DS",
        GStat: "GS", 
        Rating: "Rate",
        NHLTeam: "NHL"
      },
      format: {
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        GStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0)
      },
      sort: null,
      width: {
        Position: 25,
        Salary: 20,
        Contract: 40,
        Goals: 20,
        Assists: 20,
        Toughness: 20,
        DStat: 40,
        GStat: 40,
        GamesPlayed: 20,
        NHLTeam: 35,
        Rating: 30
      },
      rows: 50,
      select: false
    })}
    </div>
    <div class="card">
    ${team2Selector}
    <p>CASH: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam2).CASH} Budget: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam2).Budget.toFixed(2)} Salaries: $ ${teamInfo.teams.find((t) => t.ABBR === selectedTeam2).LatestSalary}</p>
    <p>CURRENT PICKS: ${teamInfo.teams.find((t) => t.ABBR === selectedTeam2)["CURRENT_PICKS"]}</p>
    <p>NEXT YEAR PICKS: ${teamInfo.teams.find((t) => t.ABBR === selectedTeam2)["NEXT_PICKS"]}</p>
    ${Inputs.table(teamPlayers.teamData.find((t) => t.ABBR === selectedTeam2)["OVERALL"].ROSTER, {
      columns: ["Name", "Position", "Salary", "Contract", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "GStat", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        Position: "Pos",
        Salary: "Sal",
        Contract: "Cont",
        GamesPlayed: "GP",
        Goals: "G",
        Assists: "A",
        Toughness: "T",
        DStat: "DS",
        GStat: "GS", 
        Rating: "Rate",
        NHLTeam: "NHL"
      },
      format: {
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        GStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0)
      },
      sort: null,
      width: {
        Position: 25,
        Salary: 20,
        Contract: 40,
        Goals: 20,
        Assists: 20,
        Toughness: 20,
        DStat: 40,
        GStat: 40,
        GamesPlayed: 20,
        NHLTeam: 35,
        Rating: 30
      },
      rows: 50,
      select: false
    })}
    </div>