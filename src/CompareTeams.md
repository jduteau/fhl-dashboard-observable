---
theme: dashboard
toc: false
---

# Compare Teams

```js
import {playerLinksFormat} from "./components/playerLink.js";

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
      columns: ["Name", "PLAYER_ID", "Position", "Salary", "Contract", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "Rating", "NHLTeam"],
      header: {
        Name: "Player Name",
        PLAYER_ID: "Links",
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
        PLAYER_ID: playerLinksFormat,
        Goals: x => x !== null ? x : "",
        Assists: x => x !== null ? x : "",
        Toughness: x => x !== null ? x : "",
        DStat: x => x !== null ? x.toFixed(2) : "",
        Rating: x => x.toFixed(0)
      },
      sort: null,
      width: {
        PLAYER_ID: 90,
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
// Draft picks that can be included in a trade (current draft + next year's, when assigned)
const parsePick = (p) => {
  const m = /^([A-Z]+)(\d+)$/.exec(p.PICK);
  return {origin: m?.[1], round: m ? Number(m[2]) : 0};
};
// Picks are labelled by their id: original team + round (e.g. ANA1, WPG2)
const roundLabel = (p) => p.PICK;
const pickLabel = (p) => `${roundLabel(p)} (${p.DraftSeason})`;
// One row per draft year: "2026-27  [] ANA1  [] ANA2  [] WPG2". Behaves as an input whose value is the array of checked picks.
const createPickSelector = (team) => {
  const picks = [...team.CURRENT_PICK_LIST, ...team.NEXT_PICK_LIST]
    .sort((a, b) => a.DraftSeason.localeCompare(b.DraftSeason) || parsePick(a).round - parsePick(b).round || a.PICK.localeCompare(b.PICK));
  if (!picks.length) return html`<em>No picks</em>`;
  const boxes = new Map();
  const form = html`<form style="display:flex; flex-direction:column; gap:0.25rem; margin-bottom:1rem;"></form>`;
  for (const season of [...new Set(picks.map((p) => p.DraftSeason))]) {
    const row = html`<div style="display:flex; flex-wrap:wrap; gap:0.25rem 1rem; align-items:center;"><strong style="min-width:4.5rem;">${season}</strong></div>`;
    for (const pick of picks.filter((p) => p.DraftSeason === season)) {
      const box = html`<input type="checkbox">`;
      boxes.set(box, pick);
      row.append(html`<label style="display:inline-flex; gap:0.3rem; align-items:center; width:auto;">${box}${roundLabel(pick)}</label>`);
    }
    form.append(row);
  }
  const update = () => { form.value = [...boxes].filter(([box]) => box.checked).map(([, pick]) => pick); };
  update();
  form.addEventListener("change", () => { update(); form.dispatchEvent(new Event("input", {bubbles: true})); });
  return form;
};
// Generators.input reads the value without displaying the input here (it is shown in the team card instead)
const pickValues = (input) => (input.matches?.("form") ? Generators.input(input) : Generators.observe((notify) => notify([])));
const team1PickInput = createPickSelector(team1);
const team2PickInput = createPickSelector(team2);
```

```js
const team1PickSelections = pickValues(team1PickInput);
const team2PickSelections = pickValues(team2PickInput);
```
```js
const tradeAssets = (players, picks) => [...players.map((player) => player.Name), ...picks.map(pickLabel)].join(', ');
const team1Trades = tradeAssets(team1Selections, team1PickSelections);
const team2Trades = tradeAssets(team2Selections, team2PickSelections);

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
    <p><strong>Picks to trade:</strong></p>
    ${team1PickInput}
    ${team1Table}
  </div>
  <div class="card">
    ${team2Selector}
    <p>CASH: $ ${team2.CASH} Budget: $ ${team2.Budget.toFixed(2)} Salaries: $ ${team2.LatestSalary}</p>
    <p><strong>Picks to trade:</strong></p>
    ${team2PickInput}
    ${team2Table}
  </div>
</div>