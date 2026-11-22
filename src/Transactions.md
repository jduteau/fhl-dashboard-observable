---
theme: dashboard
toc: false
---

# Free Agents & Waivers

Free-agent signings and waiver cuts are recorded here by the commissioner as they happen. They take effect in the
next period's rosters, before trades and before GMs set their lineups: a team's **Next Period** tab on the
[Team Roster](./Roster) page already shows them. Signed players join in reserve. A player claimed off waivers is
recorded as a signing by the claiming team.

```js
import {callWorker} from "./components/trades.js";
import {pendingTransactions, applyPendingTransactions, describeTransaction} from "./components/transactions.js";

const rosters = await FileAttachment("./data/rosters.json").json();
const transactionsData = await FileAttachment("./data/transactions.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const _rsd = rosters.data[_season];
const isCurrentSeason = _season === rosters.currentSeason;
const nextPeriod = _rsd.latestPeriod + 1;
const log = transactionsData.data[_season] ?? [];

// Who is on which team once the transactions already recorded for the next period have happened
const _tx = applyPendingTransactions({
  abbrs: _rsd.teams,
  rosterOf: (abbr) => _rsd.teamData.find((t) => t.ABBR === abbr).OVERALL.ROSTER,
  transactions: isCurrentSeason ? pendingTransactions(transactionsData, _season, nextPeriod) : []
});
const rostered = new Set([..._tx.roster.values()].flatMap((rows) => rows.map((p) => p.PLAYER_ID)));
```

```js
const logStatus = (t) => t.skipped ? html`<em style="color:#b91c1c;">Not applied: ${t.skipped}</em>`
  : t.appliedAt ? html`<em>Completed (in period ${t.period}'s rosters)</em>`
  : html`<em>Recorded; takes effect in period ${t.period}'s rosters</em>`;
display(log.length
  ? html`<div>${log.map((t) => html`<div class="card" style="max-width:50em;">
      <div><strong>${t.team}</strong> ${describeTransaction(t)} · ${new Date(t.at).toLocaleDateString()} · ${logStatus(t)}</div>
    </div>`)}</div>`
  : html`<p><em>No free-agent signings or waiver cuts recorded this season.</em></p>`);
```

```js
// Commissioner: record or remove a transaction (behind the Worker's ADMIN_PASSWORD).
const adminPassword = html`<input type="password" placeholder="Commissioner password" autocomplete="off">`;
adminPassword.value = window._fhlAdminPw ?? "";
adminPassword.oninput = () => { window._fhlAdminPw = adminPassword.value; };
const typeInput = Inputs.radio(["Sign free agent", "Waive player"], {label: "Transaction", value: "Sign free agent"});
const type = Generators.input(typeInput);
const teamInput = Inputs.select(_rsd.teams, {label: "Team"});
const team = Generators.input(teamInput);
display(html`<details style="margin-top:1.5rem;" ${isCurrentSeason ? "open" : ""}><summary><strong>Commissioner: record a transaction</strong></summary>
  <div style="margin-top:0.5rem;">${adminPassword}</div>${typeInput}${teamInput}
  <div id="tx-form"></div></details>`);
```

```js
const sign = type === "Sign free agent";
const names = new Map(transactionsData.players.map((p) => [p.id, p]));
const playerChoices = sign
  ? transactionsData.players.filter((p) => !rostered.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  : (_tx.roster.get(team) ?? []).map((p) => ({id: p.PLAYER_ID, name: p.Name, pos: p.Position, nhl: p.NHLTeam})).sort((a, b) => a.name.localeCompare(b.name));
const playerInput = Inputs.select(playerChoices, {label: sign ? "Free agent" : "Player to waive", format: (p) => `${p.name} (${p.pos}, ${p.nhl})`});
const salaryInput = Inputs.number({label: "Salary ($)", min: 0, step: 1, value: 1});
const contract = `C-${_season.slice(5)}`; // in-season signings are always C-YY (C-27 in 2026-27)
const status = html`<div style="margin:0.5rem 0;"></div>`;
const go = html`<button ${isCurrentSeason ? "" : "disabled"}>${sign ? "Sign" : "Waive"} for period ${nextPeriod}</button>`;
go.onclick = async () => {
  const player = playerInput.value; // (read it here: a generator made in this cell would be the generator itself)
  if (!player?.id) { status.textContent = "Pick a player."; return; }
  const salary = Number(salaryInput.value);
  if (sign && !(Number.isInteger(salary) && salary >= 0)) { status.textContent = "Enter the salary as a whole number."; return; }
  status.textContent = "Submitting…";
  const r = await callWorker("transactions/add", {
    password: adminPassword.value, season: _season, type: sign ? "sign" : "waive", team, player: player.id,
    ...(sign ? {salary} : {})
  });
  status.textContent = r.ok ? "Recorded! The dashboard will update in a few minutes." : `FAILED: ${r.error}`;
};
document.getElementById("tx-form")?.replaceChildren(playerInput, ...(sign ? [salaryInput, html`<div>Contract: <strong>${contract}</strong></div>`] : []), html`<div style="margin-top:0.5rem;">${go}</div>`, status);
```

```js
// Remove a recorded transaction (e.g. entered by mistake) before the next period is created
const removable = log.filter((t) => isCurrentSeason && t.period === nextPeriod && !t.appliedAt);
const removeStatus = html`<div style="margin:0.5rem 0;"></div>`;
const removeButton = (t) => {
  const b = html`<button>Remove</button>`;
  b.onclick = async () => {
    removeStatus.textContent = "Submitting…";
    const r = await callWorker("transactions/remove", {password: window._fhlAdminPw ?? "", season: _season, id: t.id});
    removeStatus.textContent = r.ok ? "Removal requested. The dashboard will update in a few minutes." : `FAILED: ${r.error}`;
  };
  return html`<div>${t.team} ${describeTransaction(t)} ${b}</div>`;
};
display(removable.length ? html`<details style="margin-top:1rem;"><summary><strong>Commissioner: remove a recorded transaction</strong></summary>${removable.map(removeButton)}${removeStatus}</details>` : "");
```
