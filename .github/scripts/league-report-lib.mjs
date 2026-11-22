// The "FHL Trader" style league report that is emailed when the commissioner materializes a new period: the agreed
// trades, every team's roster moves, free-agent signings and waiver cuts/claims. Pure functions (see test/).

// FHL Trader volume numbers: period 4 of 2026-27 (week ending Oct 25, 2026) was volume 577, and each period adds one.
// Only valid within the 2026-27 season's numbering; a later season needs a new anchor.
export const VOLUME_ANCHOR = { season: "2026-27", period: 4, volume: 577 };
export const volumeNumber = (season, period, anchor = VOLUME_ANCHOR) =>
  season === anchor.season ? anchor.volume + (Number(period) - anchor.period) : null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Oct 25, 2026": the day before the new period starts (the last day of the week the report covers).
export function weekEnding(periodStart) {
  const d = new Date(`${periodStart}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function reportTitle({ season, period, periodStart }) {
  const volume = volumeNumber(season, period);
  const week = weekEnding(periodStart);
  return `FHL Trader${volume ? ` Volume ${volume}` : ""}${week ? ` (Week ending ${week})` : ` (Period ${period})`}`;
}

const pickLabel = (p) => `${p.pick}(${String(p.season).slice(-2)})`; // SEA2 of 2026-27 -> SEA2(27)
const sideText = (items, nameOf) => {
  const all = [...(items?.players ?? []).map(nameOf), ...(items?.picks ?? []).map(pickLabel)];
  return all.length ? all.join(", ") : "(nothing)";
};

// trades: applied trades {from, to, give, get}; `give` is what `from` sends to `to`, `get` what `to` sends to `from`.
export function tradeLines(trades, nameOf) {
  return trades.map((t) => `To ${t.from}: ${sideText(t.get, nameOf)}\nTo ${t.to}: ${sideText(t.give, nameOf)}`);
}

// moves: [{team, promote:[id], demote:[id]}] (those actually applied)
export function moveLines(moves, nameOf) {
  return [...moves]
    .filter((m) => m.promote.length || m.demote.length)
    .sort((a, b) => a.team.localeCompare(b.team))
    .map((m) => [m.team, m.promote.length && `Promote: ${m.promote.map(nameOf).join(", ")}`, m.demote.length && `Demote: ${m.demote.map(nameOf).join(", ")}`].filter(Boolean).join("\n"));
}

// transactions: applied ones {type: sign|waive|claim, team, player, salary?, contract?, from?}
// info: Map(playerId -> {Name, Pos, HockeyDB}); mapPos turns a Pos into F/D/G.
export function transactionSections(transactions, nameOf, info, mapPos) {
  const sections = [];
  const sign = transactions.filter((t) => t.type === "sign");
  if (sign.length) {
    const lines = sign.map((t) => {
      const i = info.get(t.player);
      return [t.team, nameOf(t.player), mapPos(i?.Pos), i?.HockeyDB, t.salary, t.contract].filter((x) => x !== undefined && x !== "").join(" ");
    });
    sections.push(`Free-Agent Signings\n-------------------\n${lines.join("\n")}`);
  }
  const claim = transactions.filter((t) => t.type === "claim");
  if (claim.length) sections.push(`Waiver Claims\n-------------\n${claim.map((t) => `${t.team} claimed ${nameOf(t.player)} from ${t.from}`).join("\n")}`);
  const waive = transactions.filter((t) => t.type === "waive");
  if (waive.length) sections.push(`Waiver Cuts\n-----------\n${waive.map((t) => `${t.team} ${nameOf(t.player)}`).join("\n")}`);
  return sections;
}

// Builds {subject, message}. Sections with nothing in them are left out.
export function buildLeagueReport({ season, period, periodStart, trades = [], moves = [], transactions = [], info, mapPos }) {
  const nameOf = (id) => info.get(id)?.Name ?? id;
  const title = reportTitle({ season, period, periodStart });
  const parts = [title];
  const tl = tradeLines(trades, nameOf);
  if (tl.length) parts.push(`TRADES\n\n${tl.join("\n\n")}`);
  const ml = moveLines(moves, nameOf);
  if (ml.length) parts.push(`ROSTER MOVES\n\n${ml.join("\n\n")}`);
  parts.push(...transactionSections(transactions, nameOf, info, mapPos));
  if (parts.length === 1) parts.push("No trades, roster moves or transactions this period.");
  return { subject: title, message: parts.join("\n\n") };
}
