---
theme: dashboard
toc: false
---

# Team Roster Management

```js
// Load the data files
const teamInfo = await FileAttachment("./data/players.json").json();

const selectedPeriod = teamInfo.availablePeriods[teamInfo.availablePeriods.length-2];

const teamSelector = Inputs.select(teamInfo.teams, {label: "Select Team:"});

const selectedTeam = view(teamSelector);
```

```js
const roster = teamInfo.teamData.find((t) => t.ABBR === selectedTeam)[selectedPeriod].ROSTER;
const selection = view(Inputs.table(roster, {
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
  value: roster.filter((p) => p.Reserve === "R")
}));
```

<pre>
    ${selectedTeam} Roster Moves
    Promote: ${roster.filter((p)=>p.Reserve==="R" && !selection.some((s)=> s.Name === p.Name)).map((player) => `${player.Name}`).join(', ')}
    Demote: ${selection.filter((p)=>p.Reserve !== "R").map((player) => `${player.Name}`).join(', ')}
</pre>

```js
const numForwards = roster.filter((p)=>(p.Position === "F") && !selection.some((s)=>s.Name === p.Name)).length;
const numDefence = roster.filter((p)=>(p.Position === "D") && !selection.some((s)=>s.Name === p.Name)).length;
const numGoalies = roster.filter((p)=>(p.Position === "G") && !selection.some((s)=>s.Name === p.Name)).length;
```
${(numForwards+numDefence+numGoalies > 20 ? "FIX YOUR ROSTER - TOO MANY PLAYERS" : "")}
${(numForwards+numDefence+numGoalies < 20 ? "FIX YOUR ROSTER - NOT ENOUGH PLAYERS" : "")}
${(numDefence < 6 ? "FIX YOUR ROSTER - NOT ENOUGH DEFENCEMEN" : "")}
${(numDefence > 7 ? "FIX YOUR ROSTER - TOO MANY DEFENCEMEN" : "")}

Active Forwards: ${numForwards}

Active Defence: ${numDefence}

Active Goalies: ${numGoalies}
