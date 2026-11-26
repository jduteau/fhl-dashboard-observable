---
theme: dashboard
toc: false
---

# Free Agents & Waivers

Free-agent signings, waiver cuts and waiver claims are recorded here by the commissioner as they happen. They take effect
in the next period's rosters, before trades and before GMs set their lineups: a team's **Next Period** tab on the
[Team Roster](./Roster) page already shows them. Signed players join in reserve on a C-YY contract. A waiver claim moves
the player to the claiming team with his contract and active/reserve status unchanged, like a trade. A waiver cut costs the
team cash, taken off from the period the cut takes effect (half the salary, for the part of the contract still to run).

```js
import {callWorker} from "./components/trades.js";
import {waiverCost} from "./components/leagueRules.js";
import {pendingTransactions, applyPendingTransactions, describeTransaction, parseTransactionLines} from "./components/transactions.js";

const rosters = await FileAttachment("./data/rosters.json").json();
const transactionsData = await FileAttachment("./data/transactions.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const _rsd = rosters.data[_season];
const isCurrentSeason = _season === rosters.currentSeason;
const nextPeriod = _rsd.latestRosterPeriod + 1; // the period after the newest roster file
const log = transactionsData.data[_season] ?? [];
const contract = `C-${_season.slice(5)}`; // in-season signings are always C-YY (C-27 in 2026-27)

// Who is on which team once the transactions already recorded for the next period have happened
const _tx = applyPendingTransactions({
  abbrs: _rsd.teams,
  rosterOf: (abbr) => _rsd.teamData.find((t) => t.ABBR === abbr).OVERALL.ROSTER,
  transactions: isCurrentSeason ? pendingTransactions(transactionsData, _season, nextPeriod) : []
});
const ownerById = new Map([..._tx.roster].flatMap(([abbr, rows]) => rows.map((p) => [p.PLAYER_ID, abbr])));
const byName = (a, b) => a.name.localeCompare(b.name);
```

```js
const logStatus = (t) => t.skipped ? html`<em style="color:#b91c1c;">Not applied: ${t.skipped}</em>`
  : t.appliedAt ? html`<em>Completed (in period ${t.period}'s rosters)</em>`
  : html`<em>Recorded; takes effect in period ${t.period}'s rosters</em>`;
display(log.length
  ? html`<div>${log.map((t) => html`<div class="card" style="max-width:50em;">
      <div><strong>${t.team}</strong> ${describeTransaction(t)} · ${new Date(t.at).toLocaleDateString()} · ${logStatus(t)}</div>
    </div>`)}</div>`
  : html`<p><em>No free-agent signings or waiver transactions recorded this season.</em></p>`);
```

## Commissioner: record transactions

Build a list (by the form or by pasting lines), check it, then submit the whole list at once.

```js
// The list being built. Everything else only calls addItems / removeItem / clearQueue, so editing the list redraws just
// the preview, not the forms.
const queue = Mutable([]);
const playerById = new Map(transactionsData.players.map((p) => [p.id, p]));
const priced = (t) => { // a cut carries what it will cost the team in cash
  if (t.type !== "waive") return t;
  const p = playerById.get(t.player);
  return {...t, cost: waiverCost({salary: p?.salary, contract: p?.contract, period: nextPeriod, season: _season})};
};
const addItems = (...items) => { queue.value = [...queue.value, ...items.map(priced)]; };
const removeItem = (i) => { queue.value = queue.value.filter((_, j) => j !== i); };
const clearQueue = () => { queue.value = []; };
```

```js
// Add one transaction with the form
const typeInput = Inputs.radio(["Sign free agent", "Waive player", "Waiver claim"], {label: "Transaction", value: "Sign free agent"});
const teamInput = Inputs.select(_rsd.teams, {label: "Team"});
const fromInput = Inputs.select(_rsd.teams, {label: "Claimed from"});
const salaryInput = Inputs.number({label: "Salary ($)", min: 0, step: 1, value: 1});
const playerSlot = html`<div></div>`;
const extras = html`<div></div>`;
const formStatus = html`<div style="margin:0.5rem 0;"></div>`;
let playerInput;
const refresh = () => {
  const kind = typeInput.value;
  const sign = kind === "Sign free agent", claim = kind === "Waiver claim";
  const where = claim ? fromInput.value : teamInput.value;
  const choices = (sign
    ? transactionsData.players.filter((p) => !ownerById.has(p.id))
    : (_tx.roster.get(where) ?? []).map((p) => ({id: p.PLAYER_ID, name: p.Name, pos: p.Position, nhl: p.NHLTeam}))).sort(byName);
  playerInput = Inputs.select(choices, {label: sign ? "Free agent" : claim ? "Player claimed" : "Player to waive", format: (p) => `${p.name} (${p.pos}, ${p.nhl})`});
  playerSlot.replaceChildren(playerInput);
  extras.replaceChildren(...(claim ? [fromInput] : []), ...(sign ? [salaryInput, html`<div>Contract: <strong>${contract}</strong></div>`] : []));
};
for (const input of [typeInput, teamInput, fromInput]) input.addEventListener("input", refresh);
refresh();
const addButton = html`<button>Add to list</button>`;
addButton.onclick = () => {
  const p = playerInput.value; // read here: a value generated in this cell would be the generator itself
  const kind = typeInput.value;
  const team = teamInput.value;
  if (!p?.id) { formStatus.textContent = "Pick a player."; return; }
  if (kind === "Waiver claim" && fromInput.value === team) { formStatus.textContent = "A team cannot claim its own player."; return; }
  if (kind === "Sign free agent") {
    const salary = Number(salaryInput.value);
    if (!Number.isInteger(salary) || salary < 0) { formStatus.textContent = "Enter the salary as a whole number."; return; }
    addItems({type: "sign", team, player: p.id, name: p.name, pos: p.pos, salary});
  } else if (kind === "Waiver claim") addItems({type: "claim", team, from: fromInput.value, player: p.id, name: p.name, pos: p.pos});
  else addItems({type: "waive", team, player: p.id, name: p.name, pos: p.pos});
  formStatus.textContent = `Added ${p.name}.`;
};
display(html`<div>${typeInput}${teamInput}${extras}${playerSlot}<div style="margin-top:0.5rem;">${addButton}</div>${formStatus}</div>`);
```

```js
// ...or paste many lines at once
const pasteBox = html`<textarea rows="8" style="width:100%; max-width:50em; font-family:monospace;" placeholder="Paste the FHL Trader waiver report (CLAIMED PLAYERS / WAIVED PLAYERS), or lines like:&#10;waive ANA Player Name&#10;claim BOS from ANA Player Name&#10;sign CAR Player Name 3"></textarea>`;
const pasteStatus = html`<div style="margin:0.5rem 0;"></div>`;
const pasteButton = html`<button>Add pasted lines to list</button>`;
pasteButton.onclick = () => {
  const {items, errors} = parseTransactionLines(pasteBox.value, {players: transactionsData.players, ownerOf: (id) => ownerById.get(id)});
  if (items.length) addItems(...items);
  pasteBox.value = errors.map((e) => e.line).join("\n"); // keep only the lines that need fixing
  pasteStatus.replaceChildren(html`<div>Added ${items.length} line(s).${errors.length ? " These need fixing (left in the box):" : ""}</div>`,
    ...errors.map((e) => html`<div style="color:#b91c1c;">${e.line} — ${e.message}</div>`));
};
display(html`<details style="margin:1rem 0;"><summary><strong>Paste a batch</strong></summary>
  <p style="font-size:0.9em;">Paste the CLAIMED PLAYERS and WAIVED PLAYERS sections of the FHL Trader report as they are, or type one per line:
  <code>waive TEAM Player Name</code>, <code>claim TEAM from OTHER Player Name</code>, <code>sign TEAM Player Name SALARY</code>.
  Names are matched against free agents (signings) or the team's roster (cuts and claims).</p>
  ${pasteBox}<div style="margin-top:0.5rem;">${pasteButton}</div>${pasteStatus}</details>`);
```

```js
// The list so far, and the single submit
const adminPassword = html`<input type="password" placeholder="Commissioner password" autocomplete="off">`;
adminPassword.value = window._fhlAdminPw ?? "";
adminPassword.oninput = () => { window._fhlAdminPw = adminPassword.value; };
const submitStatus = html`<div style="margin:0.5rem 0;"></div>`;
const submitButton = html`<button ${isCurrentSeason && queue.length ? "" : "disabled"}>Submit ${queue.length} transaction(s) for period ${nextPeriod}</button>`;
submitButton.onclick = async () => {
  submitStatus.textContent = "Submitting…";
  const r = await callWorker("transactions/add", {
    password: adminPassword.value, season: _season,
    transactions: queue.map(({type, team, player, salary, from}) => ({type, team, player, salary, from}))
  });
  if (r.ok) { clearQueue(); submitStatus.textContent = `Recorded ${r.data.count}! The dashboard will update in a few minutes.`; }
  else submitStatus.textContent = `FAILED: ${r.error}`; // nothing was recorded; fix the list and submit again
};
const clearButton = html`<button>Clear list</button>`;
clearButton.onclick = clearQueue;
const costs = [...queue.reduce((m, t) => t.cost ? m.set(t.team, (m.get(t.team) ?? 0) + t.cost) : m, new Map())];
display(queue.length ? html`<div>
  <h3>List to submit (${queue.length})</h3>
  ${queue.map((t, i) => {
    const x = html`<button>Remove</button>`;
    x.onclick = () => removeItem(i);
    return html`<div>${i + 1}. <strong>${t.team}</strong> ${describeTransaction({...t, contract})} ${x}</div>`;
  })}
  ${costs.length ? html`<div style="margin-top:0.5rem;">Waiver cost, off cash from period ${nextPeriod}: ${costs.map(([team, c]) => `${team} $${c.toFixed(2)}`).join(" · ")}</div>` : ""}
  <div style="margin-top:0.5rem; display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">${adminPassword} ${submitButton} ${clearButton}</div>
  ${submitStatus}
</div>` : html`<p><em>The list is empty.</em> ${submitStatus}</p>`);
```

```js
// Remove recorded transactions (e.g. entered by mistake) before the next period is created
const removable = log.filter((t) => isCurrentSeason && t.period === nextPeriod && !t.appliedAt);
const removeStatus = html`<div style="margin:0.5rem 0;"></div>`;
const removeButton = (t) => {
  const b = html`<button>Remove</button>`;
  b.onclick = async () => {
    removeStatus.textContent = "Submitting…";
    const r = await callWorker("transactions/remove", {password: window._fhlAdminPw ?? "", season: _season, ids: [t.id]});
    removeStatus.textContent = r.ok ? "Removal requested. The dashboard will update in a few minutes." : `FAILED: ${r.error}`;
  };
  return html`<div>${t.team} ${describeTransaction(t)} ${b}</div>`;
};
display(removable.length ? html`<details style="margin-top:1rem;"><summary><strong>Commissioner: remove a recorded transaction</strong></summary>${removable.map(removeButton)}${removeStatus}</details>` : "");
```

```js
// Commissioner: add a player the daily stats download has not picked up yet, so he can be signed above
const adminPlayerPw = html`<input type="password" placeholder="Commissioner password" autocomplete="off">`;
adminPlayerPw.value = window._fhlAdminPw ?? "";
adminPlayerPw.oninput = () => { window._fhlAdminPw = adminPlayerPw.value; };
const npName = html`<input type="text" size="28" placeholder="Full name" autocomplete="off">`;
const npBirth = html`<input type="date">`;
const npStatus = html`<div style="margin:0.5rem 0;"></div>`;
const npButton = html`<button ${isCurrentSeason ? "" : "disabled"}>Look up and add player</button>`;
npButton.onclick = async () => {
  npStatus.textContent = "Looking him up…";
  const r = await callWorker("players/add", {password: adminPlayerPw.value, season: _season, name: npName.value, birthDate: npBirth.value});
  if (r.ok) {
    const {name, birthDate, pos, nhl} = r.data;
    npName.value = npBirth.value = "";
    npStatus.textContent = `Found ${name} (${pos}, ${nhl === "---" ? "no NHL team" : nhl}, born ${birthDate}). The Hockey-Reference and HockeyDB ids are being looked up, which takes a minute or two; then the site rebuilds and he can be signed above.`;
  } else npStatus.textContent = `FAILED: ${r.error}`;
};
display(html`<details style="margin-top:1rem;"><summary><strong>Commissioner: add a player to the player list</strong></summary>
  <p style="font-size:0.9em;">Type the name of a player who is not in the player list yet. His birth date, position and NHL team come from the NHL, his
  Hockey-Reference and HockeyDB ids from those sites. Give the birth date only if two players share the name. He is a free agent until signed above.</p>
  <div style="display:flex; flex-direction:column; gap:0.5rem; max-width:32em;">
    ${npName}<label>Birth date (only if needed) ${npBirth}</label>${adminPlayerPw}<div>${npButton}</div>
  </div>${npStatus}</details>`);
```
