---
theme: dashboard
toc: false
---

# Compare Teams

```js
import {playerLinksFormat} from "./components/playerLink.js";
import {callTrades, pickLabel, evaluateTrade, nextPeriodOf, agreedTrades, applyAgreedTrades} from "./components/trades.js";

// Load the data files
const rosters = await FileAttachment("./data/rosters.json").json();
const teamInfo = await FileAttachment("./data/teamInfo.json").json();
const tradesData = await FileAttachment("./data/trades.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const _rsd = rosters.data[_season];
const _tisd = teamInfo.data[_season];

const isCurrentSeason = _season === rosters.currentSeason;

// Trades both GMs already agreed to (they take effect in the next period's rosters) are applied here, so players and
// picks a team is about to receive can be traded again, and ones it is about to send away can't be offered twice.
const _nextPeriod = nextPeriodOf(_rsd);
const _agreed = isCurrentSeason ? agreedTrades(tradesData, _season, _nextPeriod) : [];
const _eff = applyAgreedTrades({
  abbrs: _rsd.teams,
  rosterOf: (abbr) => _rsd.teamData.find((t) => t.ABBR === abbr)["OVERALL"].ROSTER,
  picksOf: (abbr) => { const t = _tisd.teams.find((x) => x.ABBR === abbr); return [...t.CURRENT_PICK_LIST, ...t.NEXT_PICK_LIST]; },
  trades: _agreed
});
// Team info with the salary total the agreed trades will leave the team with (budget maths starts from that)
const _effTeam = (t) => ({...t, LatestSalary: t.LatestSalary + _eff.salaryDelta.get(t.ABBR)});

// Optional prefill from the URL (used by "Counter" on the Trades page):
//   team1, team2, p1/p2 = player ids team 1/2 send, k1/k2 = picks team 1/2 send as "ANA1:2026-27,..."
const _team = (key) => _rsd.teams.includes(_params.get(key)) ? _params.get(key) : undefined;
const _list = (key) => new Set((_params.get(key) ?? "").split(",").filter(Boolean));

// Team 1 is the proposing team; team 2 receives the proposal.
const team1Selector = Inputs.select(_rsd.teams, {label: "Select Team 1 (proposing):", value: _team("team1") ?? window._fhlTeam});
const selectedTeam1 = Generators.input(team1Selector);

const team2Selector = Inputs.select(_rsd.teams, {label: "Select Team 2:", value: _team("team2")});
const selectedTeam2 = view(team2Selector);

function createRosterTable(roster, preselectedIds = new Set()) {
  return Inputs.table(roster, {
      value: roster.filter((p) => preselectedIds.has(p.PLAYER_ID)),
      columns: ["Name", "PLAYER_ID", "Position", "Salary", "Contract", "GamesPlayed", "Goals", "Assists", "Toughness", "DStat", "Rating", "NHLTeam", ...(roster.some((p) => p.Acquired) ? ["Acquired"] : [])],
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
        NHLTeam: "NHL",
        Acquired: "Trade"
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
const team1Roster = _eff.roster.get(selectedTeam1);
const team2Roster = _eff.roster.get(selectedTeam2);
```

```js
const team1Table = createRosterTable(team1Roster, _list("p1"));
const team2Table = createRosterTable(team2Roster, _list("p2"));

const team1Selections = view(team1Table);
const team2Selections = view(team2Table);
```

```js
// Draft picks that can be included in a trade (current draft + next year's, when assigned)
const parsePick = (p) => {
  const m = /^([A-Z]+)(\d+)$/.exec(p.PICK);
  return {origin: m?.[1], round: m ? Number(m[2]) : 0};
};
// One row per draft year: "2026-27  [] ANA1  [] ANA2  [] WPG2". Behaves as an input whose value is the array of checked picks.
const createPickSelector = (teamPicks, preselected = new Set()) => {
  const picks = [...teamPicks]
    .sort((a, b) => a.DraftSeason.localeCompare(b.DraftSeason) || parsePick(a).round - parsePick(b).round || a.PICK.localeCompare(b.PICK));
  if (!picks.length) return html`<em>No picks</em>`;
  const boxes = new Map();
  const form = html`<form style="display:flex; flex-direction:column; gap:0.25rem; margin-bottom:1rem;"></form>`;
  for (const season of [...new Set(picks.map((p) => p.DraftSeason))]) {
    const row = html`<div style="display:flex; flex-wrap:wrap; gap:0.25rem 1rem; align-items:center;"><strong style="min-width:4.5rem;">${season}</strong></div>`;
    for (const pick of picks.filter((p) => p.DraftSeason === season)) {
      const box = html`<input type="checkbox">`;
      box.checked = preselected.has(`${pick.PICK}:${pick.DraftSeason}`);
      boxes.set(box, pick);
      // Picks are labelled by their id: original team + round (e.g. ANA1, WPG2)
      row.append(html`<label style="display:inline-flex; gap:0.3rem; align-items:center; width:auto;">${box}${pick.PICK}${pick.Acquired ? html`<small style="opacity:0.65;">(${pick.Acquired})</small>` : ""}</label>`);
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
const team1PickInput = createPickSelector(_eff.picks.get(selectedTeam1), _list("k1"));
const team2PickInput = createPickSelector(_eff.picks.get(selectedTeam2), _list("k2"));
```

```js
const team1PickSelections = pickValues(team1PickInput);
const team2PickSelections = pickValues(team2PickInput);
```
```js
const tradeAssets = (players, picks) => [...players.map((player) => player.Name), ...picks.map(pickLabel)].join(', ');
const team1Trades = tradeAssets(team1Selections, team1PickSelections);
const team2Trades = tradeAssets(team2Selections, team2PickSelections);

const {budget1: team1NewBudget, budget2: team2NewBudget, size1: team1NewSize, size2: team2NewSize, warnings, blockers} = evaluateTrade({
  tisd: _tisd, team1: _effTeam(team1), team2: _effTeam(team2), roster1: team1Roster, roster2: team2Roster, out1: team1Selections, out2: team2Selections
});
```

```js
if (_agreed.length) display(html`<div class="card" style="max-width:60em;">
  Rosters and picks below already include the ${_agreed.length} trade${_agreed.length === 1 ? "" : "s"} both GMs agreed to, which take effect in period ${_nextPeriod}
  (${_agreed.map((t) => `${t.from} ⇄ ${t.to}`).join(", ")}). Assets a team is about to receive are marked <em>Trade / from XYZ</em> and can be traded again;
  assets it is about to send away are no longer listed.
</div>`);
// Plain text (not html) so it can sit inside the inline expressions of the team cards below.
const afterTrades = (team) => _eff.salaryDelta.get(team.ABBR) ? ` (→ $ ${_effTeam(team).LatestSalary} after agreed trades)` : "";
```

<pre>
TRADE DETAILS
To ${selectedTeam1}
${team2Trades}
To ${selectedTeam2}
${team1Trades}

New ${selectedTeam1} Budget: ${team1NewBudget.toFixed(2)}   Players: ${team1NewSize}
New ${selectedTeam2} Budget: ${team2NewBudget.toFixed(2)}   Players: ${team2NewSize}
</pre>
${warnings.map((w) => html`<div style="color:#b45309;">⚠ ${w}</div>`)}
${blockers.map((b) => html`<div style="color:#b91c1c;">✖ ${b}</div>`)}

```js
// Propose the trade above: team 1 (the proposing GM) -> team 2. The other GM then accepts/declines on the Trades page.
const counterId = (_params.get("counter") && _params.get("team1") === selectedTeam1 && _params.get("team2") === selectedTeam2) ? _params.get("counter") : null;
const hasAssets = team1Selections.length + team1PickSelections.length + team2Selections.length + team2PickSelections.length > 0;
const proposeError = !isCurrentSeason ? "Trades can only be proposed for the current season."
  : selectedTeam1 === selectedTeam2 ? "Pick two different teams."
  : !hasAssets ? "Select at least one player or pick."
  : blockers.length ? "Fix the roster sizes above first." : "";

const pwInput = html`<input type="password" placeholder="${selectedTeam1} password" autocomplete="off">`;
pwInput.value = window._fhlPw ?? "";
pwInput.oninput = () => { window._fhlPw = pwInput.value; };
const noteInput = html`<input type="text" maxlength="500" placeholder="Note to ${selectedTeam2} (optional)" style="width:20em;">`;
const proposeStatus = html`<div></div>`;
const proposeButton = html`<button ${proposeError ? "disabled" : ""}>${counterId ? "Send counter-offer" : "Propose this trade"}</button>`;
proposeButton.onclick = async () => {
  proposeStatus.textContent = "Submitting…";
  const side = (players, picks) => ({players: players.map((p) => p.PLAYER_ID), picks: picks.map((p) => ({pick: p.PICK, season: p.DraftSeason}))});
  const r = await callTrades("propose", {
    season: _season, team: selectedTeam1, password: pwInput.value, to: selectedTeam2,
    give: side(team1Selections, team1PickSelections), get: side(team2Selections, team2PickSelections),
    note: noteInput.value || undefined, counters: counterId ?? undefined
  });
  if (!r.ok) { proposeStatus.textContent = `FAILED: ${r.error}`; return; }
  window._fhlTeam = selectedTeam1;
  proposeStatus.replaceChildren(html`Proposed for period ${r.data.period}. ${selectedTeam2}'s GM can accept or decline it on the <a href="./Trades">Trades</a> page, where you can also withdraw it.`);
};
display(html`<div class="card" style="max-width:50em;">
  <strong>Propose this trade</strong>: ${selectedTeam1} proposes to ${selectedTeam2}. It only happens if ${selectedTeam2}'s GM accepts, and then takes effect in the next period's rosters.
  ${counterId ? html`<p><em>This is a counter-offer: sending it replaces ${selectedTeam2}'s earlier proposal.</em></p>` : ""}
  ${proposeError ? html`<p><em>${proposeError}</em></p>` : ""}
  <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">${pwInput} ${noteInput} ${proposeButton}</div>
  ${proposeStatus}
</div>`);
```

<div class="grid grid-cols-2">
  <div class="card">
    ${team1Selector}
    <p>CASH: $ ${team1.CASH} Budget: $ ${team1.Budget.toFixed(2)} Salaries: $ ${team1.LatestSalary}${afterTrades(team1)}</p>
    <p><strong>Picks to trade:</strong></p>
    ${team1PickInput}
    ${team1Table}
  </div>
  <div class="card">
    ${team2Selector}
    <p>CASH: $ ${team2.CASH} Budget: $ ${team2.Budget.toFixed(2)} Salaries: $ ${team2.LatestSalary}${afterTrades(team2)}</p>
    <p><strong>Picks to trade:</strong></p>
    ${team2PickInput}
    ${team2Table}
  </div>
</div>