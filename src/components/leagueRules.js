// League rules, in one place: season length, the money rules, roster limits and the stat weights. Plain constants and
// pure functions, so the data loaders (Node), the pages (browser), the Worker and the GitHub scripts can all import
// them. Change a rule here and it changes everywhere.

// ---- Season and money ----

// A season has 25 periods. A team's salary is spread over them (salary / 25 is charged each period), and the number of
// periods left in the season is this minus the periods already completed.
export const PERIODS_PER_SEASON = 25;

// A team is charged at least this much cash per period, however small its payroll
export const MIN_PERIOD_COST = 13;

// Cash charged to a team for one period: salary / PERIODS_PER_SEASON, with a minimum of MIN_PERIOD_COST
// (so payrolls under MIN_PERIOD_COST * PERIODS_PER_SEASON = 325 all pay the minimum).
export function periodCost(totalSalary) {
  const perPeriod = totalSalary / PERIODS_PER_SEASON;
  return perPeriod < MIN_PERIOD_COST ? MIN_PERIOD_COST : perPeriod;
}

// Cash left at the end of the season if a team keeps `latestSalary` as its payroll from now on: its cash less the cost of
// every period that is still to be charged (the period in progress included). periodsCompleted = the latest period - 1.
export function projectedBudget(cash, latestSalary, periodsCompleted) {
  return cash - periodCost(latestSalary) * (PERIODS_PER_SEASON - periodsCompleted);
}

// What waiving a player costs his team, charged to its cash from the period the cut takes effect: half his salary, for
// the part of his contract still to run, as a fraction of a season. A "C-YY" contract runs to the end of season YY, so
// besides the periods left this season (period..25, counting the period the cut takes effect in) it has 25 for every
// later season. Draft (D26) and under-22 (U22, D26U22) contracts cost nothing.
//   C-27 $6 cut for period 8 of 2026-27: 1/2 x 6 x (18/25) = 2.16;  C-28: 1/2 x 6 x (43/25) = 5.16
// Rounded to cents, like the FHL Trader report it matches.
export function waiverCost({ salary, contract, period, season }) {
  const m = /^C-(\d\d)$/.exec(contract ?? "");
  const extraSeasons = m ? Number(m[1]) - Number(String(season).slice(5)) : -1;
  if (extraSeasons < 0) return 0;
  const periodsToRun = PERIODS_PER_SEASON - period + 1 + extraSeasons * PERIODS_PER_SEASON;
  return Math.round(((salary || 0) / 2) * (periodsToRun / PERIODS_PER_SEASON) * 100) / 100;
}

// ---- Rosters ----

// Everyone a team owns, active and reserve: a trade must leave both teams within these limits
export const MIN_ROSTER = 20;
export const MAX_ROSTER = 36;

// The active lineup a GM submits for a period
export const ACTIVE_LINEUP = { players: 20, minDefensemen: 6, maxDefensemen: 7, goalies: 2 };

// What is wrong with an active lineup, as [{code, message}] (empty = legal). counts = {total, defensemen, goalies} of the
// ACTIVE players. A regular-season lineup must be exactly 20 players with 6-7 defensemen and 2 goalies; a playoff lineup
// only has the maximums (20 players, 7 defensemen, 2 goalies), since teams can run short once players are eliminated.
export function lineupProblems({ total, defensemen, goalies }, { playoff = false } = {}) {
  const L = ACTIVE_LINEUP;
  const problems = [];
  const add = (code, message) => problems.push({ code, message });
  if (total > L.players) add("TOO_MANY_PLAYERS", `Too many active players (${total}, max ${L.players})`);
  if (defensemen > L.maxDefensemen) add("TOO_MANY_DEFENSEMEN", `Too many defensemen (${defensemen}, max ${L.maxDefensemen})`);
  if (goalies > L.goalies) add("TOO_MANY_GOALIES", `Too many goalies (${goalies}, max ${L.goalies})`);
  if (!playoff) {
    if (total < L.players) add("TOO_FEW_PLAYERS", `Too few active players (${total}, need ${L.players})`);
    if (defensemen < L.minDefensemen) add("TOO_FEW_DEFENSEMEN", `Too few defensemen (${defensemen}, min ${L.minDefensemen})`);
    if (goalies < L.goalies) add("TOO_FEW_GOALIES", `Too few goalies (${goalies}, need ${L.goalies})`);
  }
  return problems;
}

// ---- Stat formulas (used by calcDStat / calcGStat in loadfiles.js) ----

// DStat counts time on ice in units of this many minutes: 20 for a defenseman, 30 for everyone else
export const DSTAT_TOI_DIVISOR = { D: 20, other: 30 };

// GStat = wins * 2 + ties * 1 + shutouts * 2 + shots against * 0.15 - goals against
export const GSTAT_WEIGHTS = { win: 2, tie: 1, shutout: 2, shotAgainst: 0.15 };

// ---- Positions ----

// Every skater position (C, LW, RW, F, ...) counts as F; only G and D are distinguished
export function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F";
}

// Display order of positions on a roster: defensemen, forwards, goalies
export const POSITION_ORDER = { D: 1, F: 2, G: 3 };

// ---- Standings ----

// The record-by-rank table below is written for a league of this many teams
export const TEAMS_IN_LEAGUE = 32;

// Each period, the teams are ranked on five stats and the overall rank (1 = best) turns into a 3-game record
// [from rank, to rank, wins, losses, ties]
const RECORD_BY_RANK = [
  [1, 4, 3, 0, 0],
  [5, 7, 2, 0, 1],
  [8, 12, 2, 1, 0],
  [13, 13, 1, 0, 2],
  [14, 19, 1, 1, 1],
  [20, 24, 1, 2, 0],
  [25, 25, 0, 1, 2],
  [26, 28, 0, 2, 1],
  [29, 32, 0, 3, 0],
];

export function recordForRank(overallRank) {
  const row = RECORD_BY_RANK.find(([from, to]) => overallRank >= from && overallRank <= to);
  return row ? { wins: row[2], losses: row[3], ties: row[4] } : { wins: 0, losses: 0, ties: 0 }; // outside the table
}
