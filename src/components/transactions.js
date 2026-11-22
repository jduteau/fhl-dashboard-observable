// Free-agent signings and waiver cuts recorded by the commissioner (from transactions.json). Like agreed trades, they
// take effect in the next period's rosters, so every page that shows what a team is about to have applies them.
import {POSITION_ORDER} from "./leagueRules.js";

// Transactions recorded for the next period that haven't been skipped.
export function pendingTransactions(transactionsData, season, nextPeriod) {
  return (transactionsData.data[season] ?? []).filter((t) => t.period === nextPeriod && !t.skipped);
}

// Applies the transactions, oldest first, to the current rosters: waived players leave, signed free agents join in
// reserve. Same shape as applyAgreedTrades: rosterOf(abbr) -> player rows (PLAYER_ID, Position, Reserve, Salary).
// Returns {roster: Map(abbr -> rows), salaryDelta: Map(abbr -> number)}. Signed rows are tagged `Acquired: "FA signing"`.
// The inputs are not modified. Transactions that don't fit (stale data) are ignored.
export function applyPendingTransactions({abbrs, rosterOf, transactions}) {
  const roster = new Map(abbrs.map((a) => [a, [...rosterOf(a)]]));
  const salaryDelta = new Map(abbrs.map((a) => [a, 0]));
  const owner = (id) => abbrs.find((a) => roster.get(a).some((p) => p.PLAYER_ID === id));
  for (const t of [...transactions].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!roster.has(t.team)) continue;
    if (t.type === "sign" && t.row && !owner(t.player)) {
      roster.get(t.team).push({...t.row, Reserve: "R", Acquired: "FA signing"});
      salaryDelta.set(t.team, salaryDelta.get(t.team) + (t.salary || 0));
    } else if (t.type === "waive") {
      const list = roster.get(t.team);
      const i = list.findIndex((p) => p.PLAYER_ID === t.player);
      if (i < 0) continue;
      salaryDelta.set(t.team, salaryDelta.get(t.team) - (list[i].Salary || 0));
      list.splice(i, 1);
    }
  }
  for (const rows of roster.values()) rows.sort((a, b) => (POSITION_ORDER[a.Position] ?? 9) - (POSITION_ORDER[b.Position] ?? 9) || (a.Reserve === "R") - (b.Reserve === "R"));
  return {roster, salaryDelta};
}

// "Signed Jane Doe ($5, C-27)" / "Waived Jane Doe"
export const describeTransaction = (t) => t.type === "sign" ? `signed ${t.name} ($${t.salary}, ${t.contract})` : `waived ${t.name}`;
