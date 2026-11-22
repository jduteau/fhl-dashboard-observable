---
theme: dashboard
toc: false
---

# Team Management

```js
import {MIN_PERIOD_COST, lineupProblems} from "./components/leagueRules.js";
import {nextPeriodRosters, activeCounts} from "./components/nextRoster.js";

// Load the data files
const teamInfo = await FileAttachment("./data/teamInfo.json").json();
const draftOrder = await FileAttachment("./data/draftOrder.json").json();
const tradesData = await FileAttachment("./data/trades.json").json();
const movesData = await FileAttachment("./data/moves.json").json();
const transactionsData = await FileAttachment("./data/transactions.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || teamInfo.currentSeason;
const _sd = teamInfo.data[_season];
const _draftSd = draftOrder.data[_season];
const currentPeriod = _sd.latestPeriod;
const _currentDraftYear = parseInt(_season.split("-")[0]) + 1;
const _nextDraftYear = _currentDraftYear + 1;
const isCurrentSeason = _season === teamInfo.currentSeason;
const nextPeriod = currentPeriod + 1;

// The active roster for the next period: the current roster with the recorded waivers / signings and agreed trades applied,
// and the lineup moves the GM has submitted (without a submission, everyone keeps their current status).
const _next = isCurrentSeason ? nextPeriodRosters({
  abbrs: _sd.teams.map((t) => t.ABBR),
  rosterOf: (abbr) => _sd.teams.find((t) => t.ABBR === abbr)[currentPeriod].ROSTER,
  season: _season, nextPeriod, transactionsData, tradesData, movesData
}) : null;
const _cashRows = _sd.teams.map((t) => {
  if (!_next) return t;
  const c = activeCounts(_next.get(t.ABBR));
  return {...t, NextActive: `(${c.F}-${c.D}-${c.G}) ${c.total}`, NextActiveProblems: lineupProblems({total: c.total, defensemen: c.D, goalies: c.G})};
});
```
<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('cash-tab', this)">Team Cash Balances</button>
    <button class="tab-button" onclick="showTab('picks-tab', this)">Team Draft Picks</button>
    <button class="tab-button" onclick="showTab('draft-order-tab', this)">Draft Order</button>
    <button class="tab-button" onclick="showTab('owner-tab', this)">Team Owners</button>
  </div>
  
  <div id="cash-tab" class="tab-content active">
    <h3>CASH AS OF END OF PERIOD: ${currentPeriod-1}</h3>
    ${Inputs.table(_cashRows, {
      columns: [
        "ABBR",
        "NAME", 
        "CASH",
        "LatestSalary",
        "SalaryPerPeriod",
        "Budget",
        "AddSalary",
        "TotalPlayerCount",
        "ActivePlayerCount",
        ...(_next ? ["NextActive"] : [])
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        CASH: "Cash",
        LatestSalary: "Salaries",
        SalaryPerPeriod: "Salary/Period",
        Budget: "Budget",
        AddSalary: "Salary to Add",
        TotalPlayerCount: "Players (F/D/G)",
        ActivePlayerCount: "Active (F/D/G)",
        NextActive: `Active, period ${nextPeriod} (F/D/G)`
      },
      format: {
        CASH: x => x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        LatestSalary: x => x.toLocaleString("en-US"),
        SalaryPerPeriod: (x, i, data) => {
          const value = x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
          return x < MIN_PERIOD_COST ? html`<span style="background-color: yellow;">${MIN_PERIOD_COST.toFixed(2)}</span>` : value;
        },
        Budget: (x, i, data) => {
          const value = x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
          return x < 0 ? html`<span style="background-color: red;">${value}</span>` : value;
        },
        AddSalary: x => x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        // Highlighted when that lineup would not be legal (20 active, 6-7 D, 2 G): the GM still has to fix it
        NextActive: (x, i, data) => {
          const problems = data[i].NextActiveProblems ?? [];
          return problems.length ? html`<span style="background-color: yellow;" title="${problems.map((p) => p.message).join("; ")}">${x}</span>` : x;
        },
      },
      sort: "ABBR",
      rows: 32,
      layout: "auto",
      width: {
        ABBR: 60,
        CASH: 60,
        LatestSalary: 60,
        Budget: 60,
        AddSalary: 100
      },
      select: false
    })}
  </div>

  <div id="picks-tab" class="tab-content">
    ${Inputs.table(_sd.teams, {
      columns: [
        "ABBR",
        "NAME",
        "CURRENT_PICKS",
        "NEXT_PICKS"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        CURRENT_PICKS: `${_currentDraftYear} Draft`,
        NEXT_PICKS: `${_nextDraftYear} Draft`,
      },
      width: {
        ABBR: 60,
      },
      sort: "ABBR",
      rows: 32,
      select: false
    })}
  </div>

  <div id="draft-order-tab" class="tab-content">
    ${Inputs.table(_draftSd.combined, {
      columns: ["order", "r1pick", "r1", "r2pick", ..._draftSd.otherRoundNumbers.map(r => `r${r}`)],
      header: {
        order: "Pick #",
        r1pick: "R1 Original Team",
        r1: "R1 Held By",
        r2pick: "R2-4 Original Team",
        ...Object.fromEntries(_draftSd.otherRoundNumbers.map(r => [`r${r}`, `R${r} Held By`]))
      },
      layout: "auto",
      width: {
        order: 65,
        r1pick: 130,
        r2pick: 145
      },
      rows: 32,
      select: false
    })}
  </div>

  <div id="owner-tab" class="tab-content">
    ${Inputs.table(_sd.teams, {
      columns: [
        "ABBR",
        "NAME",
        "OWNER",
        "LOCATION"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        OWNER: "Owner",
        LOCATION: "Location"
      },
      sort: "ABBR",
      rows: 32,
      width: {
        ABBR: 60
      },
      select: false
    })}
  </div>
</div>

<link rel="stylesheet" href="./styles/tabs.css">
