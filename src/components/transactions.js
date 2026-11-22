// Free-agent signings, waiver cuts and waiver claims recorded by the commissioner (from transactions.json). Like agreed trades, they
// take effect in the next period's rosters, so every page that shows what a team is about to have applies them.
import {POSITION_ORDER} from "./leagueRules.js";

// Transactions recorded for the next period that haven't been skipped.
export function pendingTransactions(transactionsData, season, nextPeriod) {
  return (transactionsData.data[season] ?? []).filter((t) => t.period === nextPeriod && !t.skipped);
}

// Applies the transactions, oldest first, to the current rosters: waived players leave, signed free agents join in
// reserve. Same shape as applyAgreedTrades: rosterOf(abbr) -> player rows (PLAYER_ID, Position, Reserve, Salary).
// Returns {roster: Map(abbr -> rows), salaryDelta: Map(abbr -> number), waiverCost: Map(abbr -> cash)}; waiverCost is what
// the waiver cuts (each carrying its `cost`) take off the team's cash when they take effect. Signed rows are tagged `Acquired: "FA signing"`,
// claimed ones `Acquired: "waiver claim from XYZ"` (a claim moves the player with his contract and status, like a trade).
// The inputs are not modified. Transactions that don't fit (stale data) are ignored.
export function applyPendingTransactions({abbrs, rosterOf, transactions}) {
  const roster = new Map(abbrs.map((a) => [a, [...rosterOf(a)]]));
  const salaryDelta = new Map(abbrs.map((a) => [a, 0]));
  const waiverCost = new Map(abbrs.map((a) => [a, 0]));
  const owner = (id) => abbrs.find((a) => roster.get(a).some((p) => p.PLAYER_ID === id));
  for (const t of [...transactions].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!roster.has(t.team)) continue;
    if (t.type === "sign" && t.row && !owner(t.player)) {
      roster.get(t.team).push({...t.row, Reserve: "R", Acquired: "FA signing"});
      salaryDelta.set(t.team, salaryDelta.get(t.team) + (t.salary || 0));
    } else if (t.type === "claim") {
      const from = roster.get(t.from);
      const i = from ? from.findIndex((p) => p.PLAYER_ID === t.player) : -1;
      if (i < 0) continue;
      const [row] = from.splice(i, 1);
      roster.get(t.team).push({...row, Acquired: `waiver claim from ${t.from}`});
      salaryDelta.set(t.from, salaryDelta.get(t.from) - (row.Salary || 0));
      salaryDelta.set(t.team, salaryDelta.get(t.team) + (row.Salary || 0));
    } else if (t.type === "waive") {
      const list = roster.get(t.team);
      const i = list.findIndex((p) => p.PLAYER_ID === t.player);
      if (i < 0) continue;
      salaryDelta.set(t.team, salaryDelta.get(t.team) - (list[i].Salary || 0));
      waiverCost.set(t.team, Math.round((waiverCost.get(t.team) + (t.cost || 0)) * 100) / 100);
      list.splice(i, 1);
    }
  }
  for (const rows of roster.values()) rows.sort((a, b) => (POSITION_ORDER[a.Position] ?? 9) - (POSITION_ORDER[b.Position] ?? 9) || (a.Reserve === "R") - (b.Reserve === "R"));
  return {roster, salaryDelta, waiverCost};
}

// "signed Jane Doe ($5, C-27)" / "waived Jane Doe" / "claimed Jane Doe off waivers from ANA"
export const describeTransaction = (t) => t.type === "sign" ? `signed ${t.name} ($${t.salary}, ${t.contract})`
  : t.type === "claim" ? `claimed ${t.name} off waivers from ${t.from}`
  : t.cost > 0 ? `waived ${t.name} (costs $${t.cost.toFixed(2)})` : `waived ${t.name}`;

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Turns pasted text into transactions. Two layouts, which can be mixed (blank lines, dashed lines and lines starting with #
// are skipped):
//  1. The FHL Trader waiver report, pasted as it is:
//       CLAIMED PLAYERS                                     (claim: BUF -> CAR)
//       BUF Gabe Smith (F)  -- Claimed by CAR (1 claim received)
//       WAIVED PLAYERS                                      (waive)
//       BOS Connor Ingram         (G) $6  C-28 cost: ...
//  2. One transaction per line:  sign TEAM Player Name SALARY   waive TEAM Player Name   claim TEAM from OTHER Player Name
//     (a claim: TEAM claims the player off waivers from OTHER)
// A name is matched to a player of the right kind: a free agent for a signing, one on that team for a cut, one on the team
// he is claimed from for a claim; accents and case are ignored. The salary and contract in a report are not read: a
// cut takes the player off his team whatever he costs.
//   players: [{id, name, pos, nhl}]; ownerOf(id) -> abbr, or undefined for a free agent
// Returns {items: [{type, team, player, name, pos, salary?, from?}], errors: [{line, message}]}.
export function parseTransactionLines(text, {players, ownerOf}) {
  const items = [];
  const errors = [];
  const T = "([A-Za-z]{2,4})";
  let section = null; // "claimed" | "waived" while inside a report section
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^[=-]{3,}$/.test(line)) continue;
    const header = /^(claimed|waived)\s+players\b/i.exec(line);
    if (header) { section = header[1].toLowerCase(); continue; }
    const fail = (message) => errors.push({line, message});

    let type, team, from, name, salary;
    const m = /^(sign|waive|claim)\s+(.+)$/i.exec(line);
    if (m) {
      type = m[1].toLowerCase();
      const parts = type === "sign" ? new RegExp(`^${T}\\s+(.+?)\\s+\\$?(\\d+)$`).exec(m[2])
        : type === "waive" ? new RegExp(`^${T}\\s+(.+)$`).exec(m[2])
        : new RegExp(`^${T}\\s+from\\s+${T}\\s+(.+)$`, "i").exec(m[2]);
      if (!parts) { fail(type === "sign" ? "Expected: sign TEAM Player Name SALARY" : type === "waive" ? "Expected: waive TEAM Player Name" : "Expected: claim TEAM from OTHER Player Name"); continue; }
      team = parts[1].toUpperCase();
      if (type === "claim") { from = parts[2].toUpperCase(); name = parts[3]; }
      else { name = parts[2]; if (type === "sign") salary = Number(parts[3]); }
    } else if (section === "claimed") {
      const r = new RegExp(`^${T}\\s+(.+?)\\s+\\([FDG]\\)\\s*--\\s*claimed by\\s+${T}\\b`, "i").exec(line);
      if (!r) { fail("Expected: TEAM Player Name (F) -- Claimed by TEAM"); continue; }
      type = "claim"; from = r[1].toUpperCase(); name = r[2]; team = r[3].toUpperCase();
    } else if (section === "waived") {
      const r = new RegExp(`^${T}\\s+(.+?)\\s+\\([FDG]\\)`).exec(line);
      if (!r) { fail("Expected: TEAM Player Name (F) $salary contract ..."); continue; }
      type = "waive"; team = r[1].toUpperCase(); name = r[2];
    } else { fail("Start the line with sign, waive or claim, or paste the report with its CLAIMED / WAIVED PLAYERS headings"); continue; }

    const where = type === "sign" ? undefined : type === "waive" ? team : from;
    const found = players.filter((p) => norm(p.name) === norm(name) && (where === undefined ? ownerOf(p.id) === undefined : ownerOf(p.id) === where));
    if (found.length !== 1) {
      fail(found.length ? `More than one player named ${name}` : type === "sign" ? `${name} is not a free agent` : `${name} is not on ${where}'s roster`);
      continue;
    }
    items.push({type, team, player: found[0].id, name: found[0].name, pos: found[0].pos, ...(salary !== undefined ? {salary} : {}), ...(from ? {from} : {})});
  }
  return {items, errors};
}
