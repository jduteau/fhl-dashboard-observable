// What each team's roster will be in the next period, as far as the league knows today: the current roster with the
// commissioner's recorded transactions (waiver cuts, claims, free-agent signings) applied, then the trades both GMs agreed
// to (the order the new period is built in), then the lineup moves the GM has submitted (promote = reserve -> active,
// demote = active -> reserve; with no submission, players keep their current status).
import {pendingTransactions, applyPendingTransactions} from "./transactions.js";
import {agreedTrades, applyAgreedTrades} from "./trades.js";

// Reserve players (R) and players who cannot play (N/A) are not in the active lineup. (The same rule as isActive in
// playerRows.js, which pages cannot import because it pulls in loadfiles.js and so the filesystem.)
const isActive = (player) => player.Reserve !== "R" && player.Reserve !== "N/A";

//   abbrs, rosterOf(abbr): team abbreviations and their current player rows (PLAYER_ID, Position, Reserve, Salary)
//   transactionsData / tradesData / movesData: the published transactions.json, trades.json and moves.json
// Returns Map(abbr -> player rows with their Reserve status for the next period). The inputs are not modified.
export function nextPeriodRosters({abbrs, rosterOf, season, nextPeriod, transactionsData, tradesData, movesData}) {
  const afterTransactions = applyPendingTransactions({abbrs, rosterOf, transactions: pendingTransactions(transactionsData, season, nextPeriod)}).roster;
  const afterTrades = applyAgreedTrades({
    abbrs, rosterOf: (abbr) => afterTransactions.get(abbr), picksOf: () => [], trades: agreedTrades(tradesData, season, nextPeriod)
  }).roster;
  const submitted = movesData.moves?.[nextPeriod] ?? {};
  return new Map(abbrs.map((abbr) => {
    const m = submitted[abbr];
    return [abbr, afterTrades.get(abbr).map((p) =>
      m?.promote?.includes(p.PLAYER_ID) ? {...p, Reserve: ""} : m?.demote?.includes(p.PLAYER_ID) ? {...p, Reserve: "R"} : p)];
  }));
}

// Players per position among a roster's ACTIVE players: {F, D, G, total}
export function activeCounts(rows) {
  const counts = {F: 0, D: 0, G: 0};
  for (const p of rows.filter(isActive)) counts[p.Position === "G" ? "G" : p.Position === "D" ? "D" : "F"]++;
  return {...counts, total: counts.F + counts.D + counts.G};
}
