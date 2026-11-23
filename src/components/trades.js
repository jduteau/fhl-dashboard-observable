// Shared by the Compare Teams (propose), Trades (inbox) and My Account pages.

import {MIN_ROSTER, MAX_ROSTER, POSITION_ORDER, projectedBudget} from "./leagueRules.js";

export {MIN_ROSTER, MAX_ROSTER};

// Deployed Cloudflare Worker (see worker/README.md)
export const WORKER_URL = "https://fhl-roster-moves.fhldashboard.workers.dev";

// POST to a Worker endpoint such as "trades/list". Resolves to {ok, error, data}; never throws.
export async function callWorker(path, body) {
  try {
    const res = await fetch(`${WORKER_URL}/${path}`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? {ok: true, data} : {ok: false, error: data.error ?? `HTTP ${res.status}`};
  } catch (e) {
    return {ok: false, error: String(e)};
  }
}

export const callTrades = (endpoint, body) => callWorker(`trades/${endpoint}`, body);
export const callAccount = (endpoint, body) => callWorker(`account/${endpoint}`, body);

// Accepts a team-info pick {PICK, DraftSeason} or a Worker pick {pick, season}: "ANA1 (2026-27)"
export const pickLabel = (p) => `${p.PICK ?? p.pick} (${p.DraftSeason ?? p.season})`;

// What a trade does to the two teams (same budget formula Compare Teams has always used).
//   team1/team2: team-info rows (CASH, LatestSalary); roster1/roster2: current rosters;
//   out1/out2: player objects (with Salary) that team1/team2 send away.
// warnings = budget goes negative (allowed); blockers = roster size outside 20-36 (the Worker refuses these).
export function evaluateTrade({tisd, team1, team2, roster1, roster2, out1, out2}) {
  const sum = (players) => players.reduce((total, p) => total + (p?.Salary || 0), 0);
  const budget = (team, salaryOut, salaryIn) => projectedBudget(team.CASH, team.LatestSalary - salaryOut + salaryIn, tisd.lastPeriodNum);
  const budget1 = budget(team1, sum(out1), sum(out2));
  const budget2 = budget(team2, sum(out2), sum(out1));
  const size1 = roster1.length - out1.length + out2.length;
  const size2 = roster2.length - out2.length + out1.length;
  const warnings = [];
  const blockers = [];
  for (const [abbr, b, size] of [[team1.ABBR, budget1, size1], [team2.ABBR, budget2, size2]]) {
    if (b < 0) warnings.push(`${abbr}'s budget would be negative ($${b.toFixed(2)})`);
    if (size < MIN_ROSTER || size > MAX_ROSTER) blockers.push(`${abbr} would have ${size} players (must be ${MIN_ROSTER}-${MAX_ROSTER})`);
  }
  return {budget1, budget2, size1, size2, warnings, blockers};
}

// The period trades (and transactions and roster moves) take effect in: the one after the newest roster file, whether or not
// that period has started (rosters.json publishes latestRosterPeriod).
export function nextPeriodOf(rostersSeasonData) {
  return rostersSeasonData.latestRosterPeriod + 1;
}

// Trades both GMs agreed to that haven't been applied to a roster file yet (from trades.json): this is the state the
// league is heading for, so every page that shows rosters or picks for trading should show it.
export function agreedTrades(tradesData, season, nextPeriod) {
  return (tradesData.data[season] ?? []).filter((t) => t.period === nextPeriod && !t.skipped);
}

// Applies the agreed trades, oldest first, to the current rosters and pick lists, so an asset acquired in one trade can
// be traded again in the next one.
//   abbrs: team abbreviations; rosterOf(abbr) -> player rows (with PLAYER_ID, Position, Reserve, Salary);
//   picksOf(abbr) -> [{PICK, DraftSeason}]
// Returns {roster: Map(abbr -> rows), picks: Map(abbr -> picks), salaryDelta: Map(abbr -> number)}. Rows and picks that
// changed team are copies tagged `Acquired: "from XYZ"`; the inputs are not modified.
export function applyAgreedTrades({abbrs, rosterOf, picksOf, trades}) {
  const roster = new Map(abbrs.map((a) => [a, [...rosterOf(a)]]));
  const picks = new Map(abbrs.map((a) => [a, [...picksOf(a)]]));
  const salaryDelta = new Map(abbrs.map((a) => [a, 0]));
  const take = (list, match) => { const i = list.findIndex(match); return i < 0 ? null : list.splice(i, 1)[0]; };

  for (const t of [...trades].sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt))) {
    for (const [giver, receiver, side] of [[t.from, t.to, t.give], [t.to, t.from, t.get]]) {
      if (!roster.has(giver) || !roster.has(receiver)) continue;
      for (const {id} of side.players) {
        const row = take(roster.get(giver), (p) => p.PLAYER_ID === id);
        if (!row) continue; // not where the trade says (stale data): leave it alone rather than invent a roster
        roster.get(receiver).push({...row, Acquired: `from ${giver}`});
        salaryDelta.set(giver, salaryDelta.get(giver) - (row.Salary || 0));
        salaryDelta.set(receiver, salaryDelta.get(receiver) + (row.Salary || 0));
      }
      for (const p of side.picks) {
        const pick = take(picks.get(giver), (x) => x.PICK === p.pick && x.DraftSeason === p.season);
        if (pick) picks.get(receiver).push({...pick, Acquired: `from ${giver}`});
      }
    }
  }
  for (const rows of roster.values()) rows.sort((a, b) => (POSITION_ORDER[a.Position] ?? 9) - (POSITION_ORDER[b.Position] ?? 9) || (a.Reserve === "R") - (b.Reserve === "R"));
  return {roster, picks, salaryDelta};
}
