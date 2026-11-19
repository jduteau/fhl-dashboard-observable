// Shared by the Compare Teams (propose) and Trades (inbox) pages.

// Deployed Cloudflare Worker (see worker/README.md)
export const WORKER_URL = "https://fhl-roster-moves.fhldashboard.workers.dev";
export const MIN_ROSTER = 20;
export const MAX_ROSTER = 36;

// POST to a /trades/* endpoint. Resolves to {ok, error, data}; never throws.
export async function callTrades(endpoint, body) {
  try {
    const res = await fetch(`${WORKER_URL}/trades/${endpoint}`, {
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

// Accepts a team-info pick {PICK, DraftSeason} or a Worker pick {pick, season}: "ANA1 (2026-27)"
export const pickLabel = (p) => `${p.PICK ?? p.pick} (${p.DraftSeason ?? p.season})`;

// What a trade does to the two teams (same budget formula Compare Teams has always used).
//   team1/team2: team-info rows (CASH, LatestSalary); roster1/roster2: current rosters;
//   out1/out2: player objects (with Salary) that team1/team2 send away.
// warnings = budget goes negative (allowed); blockers = roster size outside 20-36 (the Worker refuses these).
export function evaluateTrade({tisd, team1, team2, roster1, roster2, out1, out2}) {
  const sum = (players) => players.reduce((total, p) => total + (p?.Salary || 0), 0);
  const budget = (team, salaryOut, salaryIn) => {
    const perPeriod = (team.LatestSalary - salaryOut + salaryIn) / 25;
    return team.CASH - (perPeriod < 13 ? 13 : perPeriod) * (25 - tisd.lastPeriodNum);
  };
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
