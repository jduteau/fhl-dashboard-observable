---
theme: dashboard
toc: false
---

# Trades

Trades are proposed on the [Compare Teams](./CompareTeams) page. A trade only happens when **both** GMs agree:
the proposing GM approves by proposing, and the other GM accepts here. Accepted trades take effect in the next
period's rosters. Proposals are private: you only see the ones that involve your team (enter your password to load them),
and an unanswered proposal expires when the next period starts.

```js
import {pendingTransactions, applyPendingTransactions} from "./components/transactions.js";
import {callTrades, pickLabel, evaluateTrade, nextPeriodOf, agreedTrades, applyAgreedTrades} from "./components/trades.js";

const rosters = await FileAttachment("./data/rosters.json").json();
const teamInfo = await FileAttachment("./data/teamInfo.json").json();
const tradesData = await FileAttachment("./data/trades.json").json();
const transactionsData = await FileAttachment("./data/transactions.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const _rsd = rosters.data[_season];
const _tisd = teamInfo.data[_season];
const isCurrentSeason = _season === rosters.currentSeason;
const logTrades = tradesData.data[_season] ?? []; // accepted trades recorded in the repo (public)
const loggedIds = new Set(logTrades.map((t) => t.id));

// Budgets and roster sizes are checked against the league as it will be after the trades already agreed to, because that
// is what the Worker validates against (an asset acquired in an agreed trade can be traded again).
const _tx = applyPendingTransactions({ // the commissioner's free-agent signings and waiver cuts happen before trades
  abbrs: _rsd.teams,
  rosterOf: (abbr) => _rsd.teamData.find((t) => t.ABBR === abbr).OVERALL.ROSTER,
  transactions: isCurrentSeason ? pendingTransactions(transactionsData, _season, nextPeriodOf(_rsd)) : []
});
const _eff = applyAgreedTrades({
  abbrs: _rsd.teams,
  rosterOf: (abbr) => _tx.roster.get(abbr),
  picksOf: () => [],
  trades: isCurrentSeason ? agreedTrades(tradesData, _season, nextPeriodOf(_rsd)) : []
});
const rosterOf = (abbr) => _eff.roster.get(abbr);
const teamOf = (abbr) => {
  const t = _tisd.teams.find((x) => x.ABBR === abbr);
  return {...t, LatestSalary: t.LatestSalary + _eff.salaryDelta.get(abbr) + _tx.salaryDelta.get(abbr)};
};
const playerById = new Map(_rsd.teamData.flatMap((t) => t.OVERALL.ROSTER.map((p) => [p.PLAYER_ID, p])));
const playerText = (id) => {
  const p = playerById.get(id);
  return p ? `${p.Name} (${p.Position}, $${p.Salary})` : id;
};
```

```js
const teamSelector = Inputs.select(_rsd.teams, {label: "Your team:", value: window._fhlTeam});
const passwordInput = html`<input type="password" placeholder="Team password" autocomplete="off">`;
passwordInput.value = window._fhlPw ?? "";
passwordInput.oninput = () => { window._fhlPw = passwordInput.value; };
const loadButton = html`<button>Show my trades</button>`;
const status = html`<div style="margin:0.5rem 0;"></div>`;
const inbox = html`<div></div>`;

// Public: every trade both GMs agreed to. "Agreed" trades happen when the next period's roster is created.
const logAssets = (side) => [...side.players.map((p) => p.name), ...side.picks.map(pickLabel)].join(", ") || "nothing";
const logStatus = (t) => t.skipped ? html`<em style="color:#b91c1c;">Not applied: ${t.skipped}</em>`
  : t.appliedAt ? html`<em>Completed (in period ${t.period}'s rosters)</em>`
  : html`<em>Agreed; takes effect in period ${t.period}'s rosters</em>`;
const tradeLog = logTrades.length
  ? html`<div>${logTrades.map((t) => html`<div class="card" style="max-width:50em;">
      <div><strong>${t.from} ⇄ ${t.to}</strong> · agreed ${new Date(t.acceptedAt).toLocaleDateString()} · ${logStatus(t)}</div>
      <div>${t.to} receives: ${logAssets(t.give)}</div>
      <div>${t.from} receives: ${logAssets(t.get)}</div>
    </div>`)}</div>`
  : html`<p><em>No trades yet this season.</em></p>`;

const section = (title, trades, build, open = true) => {
  if (!trades.length && open) return html`<h3>${title} (0)</h3>`;
  if (!trades.length) return "";
  const body = html`<div>${trades.map(build)}</div>`;
  return open
    ? html`<div><h3>${title} (${trades.length})</h3>${body}</div>`
    : html`<details><summary><strong>${title} (${trades.length})</strong></summary>${body}</details>`;
};

const assetList = (side) => html`<ul style="margin:0.25rem 0; padding-left:1.25rem;">
  ${side.players.map((id) => html`<li>${playerText(id)}</li>`)}
  ${side.picks.map((p) => html`<li>${pickLabel(p)}</li>`)}
  ${!side.players.length && !side.picks.length ? html`<li><em>nothing</em></li>` : ""}
</ul>`;

function tradeCard(t, me, period) {
  const mine = t.from === me;
  const other = mine ? t.to : t.from;
  const send = mine ? t.give : t.get;
  const receive = mine ? t.get : t.give;
  const pending = t.status === "PROPOSED";
  const buttons = html`<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;"></div>`;
  let ev = null;

  if (pending) {
    ev = evaluateTrade({
      tisd: _tisd, team1: teamOf(me), team2: teamOf(other), roster1: rosterOf(me), roster2: rosterOf(other),
      out1: send.players.map((id) => playerById.get(id) ?? {}), out2: receive.players.map((id) => playerById.get(id) ?? {})
    });
    // Two-step buttons instead of a browser confirm() dialog: first click arms, second click acts.
    const action = (label, decision, danger) => {
      const b = html`<button>${label}</button>`;
      let armed;
      b.onclick = async () => {
        if (!armed) {
          armed = setTimeout(() => { armed = null; b.textContent = label; }, 5000);
          b.textContent = `Confirm ${label.toLowerCase()}?`;
          return;
        }
        clearTimeout(armed);
        b.disabled = true;
        const r = await callTrades("respond", {season: _season, team: me, password: passwordInput.value, id: t.id, decision});
        await load(r.ok
          ? (decision === "accept" ? `Accepted. The trade takes effect in period ${t.period}'s rosters.` : `Trade ${decision === "decline" ? "declined" : "withdrawn"}.`)
          : `FAILED: ${r.error}`);
      };
      return b;
    };
    if (mine) {
      buttons.append(action("Withdraw", "withdraw"));
    } else {
      const accept = action("Accept", "accept");
      if (ev.blockers.length) accept.disabled = true;
      buttons.append(accept, action("Decline", "decline"));
      // Counter: open Compare Teams with this team as team 1 and the original assets prefilled
      const q = new URLSearchParams({
        season: _season, team1: me, team2: other, counter: t.id,
        p1: send.players.join(","), k1: send.picks.map((p) => `${p.pick}:${p.season}`).join(","),
        p2: receive.players.join(","), k2: receive.picks.map((p) => `${p.pick}:${p.season}`).join(",")
      });
      buttons.append(html`<a href="./CompareTeams?${q}" style="display:inline-block; padding:2px 8px; border:1px solid currentColor; border-radius:4px; text-decoration:none; color:inherit;">Counter…</a>`);
    }
  }

  if (t.status === "ACCEPTED" || t.status === "APPLIED") {
    const recorded = loggedIds.has(t.id);
    const resend = html`<button>Re-send</button>`;
    resend.onclick = async () => {
      resend.disabled = true;
      const r = await callTrades("republish", {season: _season, team: me, password: passwordInput.value});
      await load(r.ok ? "Re-sent to the league record; the trade log updates in a few minutes." : `FAILED: ${r.error}`);
    };
    buttons.append(recorded
      ? html`<span style="font-size:0.9em;">✓ Recorded in the league trade log below</span>`
      : html`<span style="font-size:0.9em;">Not in the league trade log yet (this can take a few minutes after accepting).</span>`);
    if (!recorded) buttons.append(resend);
  }

  const label = {PROPOSED: "", ACCEPTED: "Accepted", APPLIED: "Completed", DECLINED: "Declined", WITHDRAWN: "Withdrawn", COUNTERED: "Countered", VOID: "Void (an asset went to another trade)", EXPIRED: "Expired"}[t.status];
  return html`<div class="card" style="max-width:50em;">
    <div><strong>${mine ? `You → ${other}` : `${other} → You`}</strong> · takes effect in period ${t.period} · proposed ${new Date(t.createdAt).toLocaleString()}${label ? html` · <em>${label}</em>` : ""}${t.counters ? " · counter-offer" : ""}</div>
    <div class="grid grid-cols-2" style="margin-top:0.5rem;">
      <div><strong>You send</strong>${assetList(send)}</div>
      <div><strong>You receive</strong>${assetList(receive)}</div>
    </div>
    ${t.note ? html`<p><em>"${t.note}"</em></p>` : ""}
    ${ev ? html`<div style="font-size:0.9em;">
      After this trade: ${me} budget $${ev.budget1.toFixed(2)}, ${ev.size1} players · ${other} budget $${ev.budget2.toFixed(2)}, ${ev.size2} players
      ${ev.warnings.map((w) => html`<div style="color:#b45309;">⚠ ${w}</div>`)}
      ${ev.blockers.map((b) => html`<div style="color:#b91c1c;">✖ ${b}</div>`)}
    </div>` : ""}
    ${buttons}
  </div>`;
}

async function load(message = "") {
  const team = teamSelector.value;
  window._fhlTeam = team;
  window._fhlPw = passwordInput.value;
  if (!isCurrentSeason) { status.textContent = "Trades are only available for the current season."; return; }
  status.textContent = "Loading…";
  const r = await callTrades("list", {season: _season, team, password: passwordInput.value});
  if (!r.ok) { status.textContent = `FAILED: ${r.error}`; inbox.replaceChildren(); return; }
  const {period, trades} = r.data;
  const build = (t) => tradeCard(t, team, period);
  const pendingTrades = trades.filter((t) => t.status === "PROPOSED");
  inbox.replaceChildren(
    section("Needs your response", pendingTrades.filter((t) => t.to === team), build),
    section("Waiting on other GMs", pendingTrades.filter((t) => t.from === team), build),
    section(`Accepted trades`, trades.filter((t) => t.status === "ACCEPTED" || t.status === "APPLIED"), build),
    section("Closed proposals", trades.filter((t) => !["PROPOSED", "ACCEPTED", "APPLIED"].includes(t.status)), build, false)
  );
  status.textContent = `${message ? message + " · " : ""}${team} · trades now take effect in period ${period} · updated ${new Date().toLocaleTimeString()}`;
}

loadButton.onclick = () => load();
display(html`<div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end;">${teamSelector} ${passwordInput} ${loadButton}</div>`);
display(status);
display(inbox);

// Commissioner: every proposal of the season, read-only, behind its own password (ADMIN_PASSWORD on the Worker).
const adminPassword = html`<input type="password" placeholder="Commissioner password" autocomplete="off">`;
const adminButton = html`<button>Show all trades</button>`;
const adminStatus = html`<div style="margin:0.5rem 0;"></div>`;
const adminList = html`<div></div>`;
const statusLabel = {PROPOSED: "Pending", ACCEPTED: "Accepted", APPLIED: "Completed", DECLINED: "Declined", WITHDRAWN: "Withdrawn", COUNTERED: "Countered", VOID: "Void", EXPIRED: "Expired"};
const adminSide = (side) => [...side.players.map(playerText), ...side.picks.map(pickLabel)].join("; ") || "nothing";
adminButton.onclick = async () => {
  adminStatus.textContent = "Loading…";
  const r = await callTrades("admin-list", {season: _season, password: adminPassword.value});
  if (!r.ok) { adminStatus.textContent = `FAILED: ${r.error}`; adminList.replaceChildren(); return; }
  const {trades} = r.data;
  const counts = Object.entries(Object.groupBy(trades, (t) => t.status)).map(([k, v]) => `${v.length} ${statusLabel[k] ?? k}`).join(" · ");
  adminStatus.textContent = `${trades.length} proposals${counts ? ` (${counts})` : ""} · updated ${new Date().toLocaleTimeString()}`;
  adminList.replaceChildren(...trades.map((t) => html`<div class="card" style="max-width:50em;">
    <div><strong>${t.from} → ${t.to}</strong> · <em>${statusLabel[t.status] ?? t.status}</em> · period ${t.period} · proposed ${new Date(t.createdAt).toLocaleString()}${t.respondedAt ? ` · answered ${new Date(t.respondedAt).toLocaleString()}` : ""}${t.counters ? " · counter-offer" : ""}</div>
    <div>${t.from} sends: ${adminSide(t.give)}</div>
    <div>${t.to} sends: ${adminSide(t.get)}</div>
    ${t.note ? html`<div><em>"${t.note}"</em></div>` : ""}
  </div>`));
};
display(html`<details style="margin-top:1.5rem;"><summary><strong>Commissioner: all trade proposals</strong></summary>
  <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:flex-end; margin-top:0.5rem;">${adminPassword} ${adminButton}</div>
  ${adminStatus}${adminList}
</details>`);

display(html`<h2>League trade log</h2>`);
display(tradeLog);
if (window._fhlTeam && window._fhlPw) load(); // arriving from Compare Teams: load straight away
```
