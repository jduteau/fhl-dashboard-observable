---
theme: dashboard
toc: false
---

# Team Roster Management

```js
import {playerLinksFormat} from "./components/playerLink.js";
import {pickLabel, agreedTrades, applyAgreedTrades, WORKER_URL} from "./components/trades.js";
import {pendingTransactions, applyPendingTransactions, describeTransaction} from "./components/transactions.js";
import {lineupProblems} from "./components/leagueRules.js";

const teamInfo = await FileAttachment("./data/rosters.json").json();
const movesData = await FileAttachment("./data/moves.json").json();
const tradesData = await FileAttachment("./data/trades.json").json();
const transactionsData = await FileAttachment("./data/transactions.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || teamInfo.currentSeason;
const _sd = teamInfo.data[_season];

const currentPeriod = _sd.latestPeriod; // the period in progress
const nextPeriod = currentPeriod + 1;
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

```js
// Tabs (same look as the Teams page). Visibility is keyed on body[data-tab] so panels keep
// their state while switching and survive team changes.
document.body.dataset.tab ||= "current";
const tabButton = (id, label) => {
  const b = html`<button class="tab-button">${label}</button>`;
  b.dataset.id = id;
  b.onclick = () => { document.body.dataset.tab = id; };
  return b;
};
display(html`<style>
  body[data-tab="current"] .tab-next, body[data-tab="next"] .tab-current {display: none;}
  body[data-tab="current"] .tab-button[data-id="current"], body[data-tab="next"] .tab-button[data-id="next"] {
    color: #0066cc; border-bottom-color: #0066cc; background-color: #f0f8ff;
  }
  .tabs {margin: 20px 0;}
  .tab-buttons {display: flex; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px;}
  .tab-button {background: none; border: none; padding: 12px 24px; cursor: pointer; font-size: 16px; font-weight: 500; color: #666; border-bottom: 3px solid transparent; transition: all 0.2s ease;}
  .tab-button:hover {color: #333; background-color: #f5f5f5;}
</style>`);
display(html`<div class="tabs"><div class="tab-buttons">${tabButton("current", `Current Roster (Period ${currentPeriod})`)}${tabButton("next", `Next Period (${nextPeriod})`)}</div></div>`);
```

```js
display(html`<div class="tab-current"><p><em>View only.</em></p>${Inputs.table(roster, {...tableOptions, select: false})}</div>`);
```

```js
// The roster for the next period = the current roster with the commissioner's recorded waiver cuts and free-agent
// signings applied (cut players are gone, signed players join in reserve), then the trades both GMs already agreed to:
// players sent away are gone, players acquired are added (keeping their current active/reserve status until you change
// it). This is also the roster the lineup you submit is checked against.
const allTransactions = isCurrentSeason ? pendingTransactions(transactionsData, _season, nextPeriod) : [];
const teamTransactions = allTransactions.filter((t) => t.team === selectedTeam);
const afterTransactions = applyPendingTransactions({
  abbrs: _sd.teams,
  rosterOf: (abbr) => _sd.teamData.find((x) => x.ABBR === abbr)[currentPeriod].ROSTER,
  transactions: allTransactions
}).roster;
const allAgreed = isCurrentSeason ? agreedTrades(tradesData, _season, nextPeriod) : [];
const teamTrades = allAgreed.filter((t) => t.from === selectedTeam || t.to === selectedTeam);
const mySide = (t) => t.from === selectedTeam ? {other: t.to, send: t.give, receive: t.get} : {other: t.from, send: t.get, receive: t.give};
// Applied across the whole league so chains work (a player acquired in one trade and sent on in another).
const nextRoster = applyAgreedTrades({
  abbrs: _sd.teams,
  rosterOf: (abbr) => afterTransactions.get(abbr),
  picksOf: () => [],
  trades: allAgreed
}).roster.get(selectedTeam);
const acquired = nextRoster.filter((p) => p.Acquired);

// Start from the last submission (if any), otherwise from the next-period roster as it stands.
const pending = movesData.moves[nextPeriod]?.[selectedTeam];
const nextIds = new Set(nextRoster.map((p) => p.PLAYER_ID));
const stalePending = pending && [...pending.promote, ...pending.demote].some((id) => !nextIds.has(id));
const startReserve = nextRoster.filter((p) =>
  pending ? (p.Reserve === "R" ? !pending.promote.includes(p.PLAYER_ID) : pending.demote.includes(p.PLAYER_ID)) : p.Reserve === "R");
const nextColumns = [...tableOptions.columns.filter((c) => c !== "Reserve"), ...(acquired.length ? ["Acquired"] : [])];
const selTable = Inputs.table(nextRoster, {...tableOptions, columns: nextColumns, header: {...tableOptions.header, Acquired: "New"}, value: startReserve});
const selection = Generators.input(selTable);

const assetText = (side) => [...side.players.map((p) => p.name), ...side.picks.map(pickLabel)].join(", ") || "nothing";
const transactionNote = teamTransactions.length ? html`<div class="card">
  <strong>Free agents and waivers taking effect in period ${nextPeriod}</strong>
  ${teamTransactions.map((t) => html`<div>${describeTransaction(t)}.</div>`)}
  <div style="font-size:0.9em;"><em>The roster below already includes these. Signed players join as reserves until you change it here.</em></div>
</div>` : "";
const tradeNote = teamTrades.length ? html`<div class="card">
  <strong>Agreed trades taking effect in period ${nextPeriod}</strong>
  ${teamTrades.map((t) => { const {other, send, receive} = mySide(t); return html`<div>With ${other}: you send ${assetText(send)}; you receive ${assetText(receive)}.</div>`; })}
  <div style="font-size:0.9em;"><em>The roster below already includes these trades. Players you acquire keep their current active/reserve status until you change it here.</em></div>
</div>` : "";
const staleNote = stalePending ? html`<div class="card" style="border-color:#b45309;"><strong>⚠ Review your lineup.</strong> Your last submission (${new Date(pending.submittedAt).toLocaleString()}) names players who are no longer on your roster (a trade or a waiver cut). Fix the lineup below and submit again, otherwise those moves are ignored.</div>` : "";
display(html`<div class="tab-next">
  ${transactionNote}${tradeNote}${staleNote}
  ${isCurrentSeason
    ? html`<p>A checked box means the player is on the <strong>reserve</strong> list. Check the players who should be reserves for period ${nextPeriod}, then submit. Submitting again replaces your earlier submission.</p>`
    : html`<p><em>Roster moves can only be made for the current season.</em></p>`}
  ${selTable}
</div>`);
```

```js
const isRes = (p) => selection.some((s) => s.PLAYER_ID === p.PLAYER_ID);
const promoteIds = nextRoster.filter((p) => p.Reserve === "R" && !isRes(p)).map((p) => p.PLAYER_ID);
const demoteIds = nextRoster.filter((p) => p.Reserve !== "R" && isRes(p)).map((p) => p.PLAYER_ID);
const nameOf = (id) => nextRoster.find((p) => p.PLAYER_ID === id).Name;
const active = nextRoster.filter((p) => !isRes(p));
const numForwards = active.filter((p) => p.Position === "F").length;
const numDefence = active.filter((p) => p.Position === "D").length;
const numGoalies = active.filter((p) => p.Position === "G").length;
const total = active.length;
const errors = lineupProblems({total, defensemen: numDefence, goalies: numGoalies}).map((p) => p.message.toUpperCase());
```

```js
display(html`<div class="tab-next">
<pre>${selectedTeam} roster moves for period ${nextPeriod}
Promote: ${promoteIds.map(nameOf).join(", ")}
Demote:  ${demoteIds.map(nameOf).join(", ")}</pre>
${errors.map((e) => html`<div><strong>FIX YOUR ROSTER - ${e}</strong></div>`)}
<p>Active Forwards: ${numForwards} · Active Defence: ${numDefence} · Active Goalies: ${numGoalies}</p>
${pending ? html`<p>Last submitted ${new Date(pending.submittedAt).toLocaleString()}.</p>` : ""}
</div>`);
```

```js
const passwordInput = html`<input type="password" placeholder="Team password" autocomplete="off">`;
passwordInput.value = window._fhlPw ?? "";
passwordInput.oninput = () => { window._fhlPw = passwordInput.value; };
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
display(html`<div class="tab-next">${passwordInput} ${submit}${status}</div>`);
```
