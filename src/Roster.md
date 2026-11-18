---
theme: dashboard
toc: false
---

# Team Roster Management

```js
import {playerLinksFormat} from "./components/playerLink.js";

// Deployed Cloudflare Worker (see worker/README.md)
const WORKER_URL = "https://fhl-roster-moves.fhldashboard.workers.dev";

const teamInfo = await FileAttachment("./data/rosters.json").json();
const movesData = await FileAttachment("./data/moves.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || teamInfo.currentSeason;
const _sd = teamInfo.data[_season];

const currentPeriod = _sd.availablePeriods[_sd.availablePeriods.length-2];
const nextPeriod = Number(currentPeriod) + 1;
const isCurrentSeason = _season === teamInfo.currentSeason;

const teamSelector = Inputs.select(_sd.teams, {label: "Select Team:"});
const selectedTeam = view(teamSelector);
```

```js
const team = _sd.teamData.find((t) => t.ABBR === selectedTeam);
const roster = team[currentPeriod].ROSTER;
const tableOptions = {
  columns: ["Name", "PLAYER_ID", "Position", "Reserve", "NHLTeam", "Salary", "Contract", "BirthDate", "Age"],
  header: {Name: "Player Name", PLAYER_ID: "Links", Position: "Pos", Reserve: "R", NHLTeam: "NHL", Salary: "Salary ($)", Contract: "Contract", BirthDate: "Birth Date", Age: "Age"},
  format: {
    PLAYER_ID: playerLinksFormat,
    Reserve: x => x === "R" ? "✓" : "",
    Salary: x => x ? x.toLocaleString("en-US") : "0",
    BirthDate: x => x ? new Date(x).toLocaleDateString() : "N/A"
  },
  sort: null,
  rows: 50,
  layout: "auto",
  width: {PLAYER_ID: 90, NHLTeam: 60, Position: 40, Reserve: 35, Salary: 80, BirthDate: 90, Age: 40}
};
```

## Current roster (period ${currentPeriod}) — view only

```js
display(Inputs.table(roster, tableOptions));
```

## Next period (${nextPeriod}) — select reserves

${isCurrentSeason ? html`Tick the players who should be on the **reserve** list for period ${nextPeriod}, then submit. Submitting again replaces your earlier submission.` : html`<em>Roster moves can only be made for the current season.</em>`}

```js
// Start from the last submission (if any), otherwise from the current roster.
const pending = movesData.moves[nextPeriod]?.[selectedTeam];
const startReserve = roster.filter((p) =>
  pending ? (p.Reserve === "R" ? !pending.promote.includes(p.PLAYER_ID) : pending.demote.includes(p.PLAYER_ID)) : p.Reserve === "R");
const selection = view(Inputs.table(roster, {...tableOptions, value: startReserve}));
```

```js
const isRes = (p) => selection.some((s) => s.PLAYER_ID === p.PLAYER_ID);
const promoteIds = roster.filter((p) => p.Reserve === "R" && !isRes(p)).map((p) => p.PLAYER_ID);
const demoteIds = roster.filter((p) => p.Reserve !== "R" && isRes(p)).map((p) => p.PLAYER_ID);
const nameOf = (id) => roster.find((p) => p.PLAYER_ID === id).Name;
const active = roster.filter((p) => !isRes(p));
const numForwards = active.filter((p) => p.Position === "F").length;
const numDefence = active.filter((p) => p.Position === "D").length;
const numGoalies = active.filter((p) => p.Position === "G").length;
const total = active.length;
const errors = [
  total > 20 ? "TOO MANY PLAYERS" : "", total < 20 ? "NOT ENOUGH PLAYERS" : "",
  numDefence < 6 ? "NOT ENOUGH DEFENCEMEN" : "", numDefence > 7 ? "TOO MANY DEFENCEMEN" : "",
  numGoalies !== 2 ? "NEED EXACTLY 2 GOALIES" : ""
].filter(Boolean);
```

<pre>
${selectedTeam} roster moves for period ${nextPeriod}
Promote: ${promoteIds.map(nameOf).join(", ")}
Demote:  ${demoteIds.map(nameOf).join(", ")}
</pre>

${errors.map((e) => html`<div><strong>FIX YOUR ROSTER - ${e}</strong></div>`)}

Active Forwards: ${numForwards} · Active Defence: ${numDefence} · Active Goalies: ${numGoalies}

${pending ? html`<p>Last submitted ${new Date(pending.submittedAt).toLocaleString()}.</p>` : ""}

```js
const passwordInput = html`<input type="password" placeholder="Team password" autocomplete="off">`;
const status = html`<div></div>`;
const submit = html`<button ${(!isCurrentSeason || errors.length) ? "disabled" : ""}>Submit moves</button>`;
submit.onclick = async () => {
  status.textContent = "Submitting…";
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({season: _season, period: nextPeriod, team: selectedTeam, password: passwordInput.value, promote: promoteIds, demote: demoteIds})
    });
    const body = await res.json().catch(() => ({}));
    status.textContent = res.ok
      ? "Submitted! The dashboard will update in a few minutes."
      : `FAILED: ${body.error ?? res.status}`;
  } catch (e) { status.textContent = `FAILED: ${e}`; }
};
display(html`<div>${passwordInput} ${submit}${status}</div>`);
```
