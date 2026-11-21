// Pure trade logic shared by record-trades.mjs and apply-moves.mjs (materialize). No file or network access here.
//
// A stored trade (src/data/static/<season>/trades/trades_pNN.json, {"trades": [...]}):
//   { id, from, to, give: {players:[id], picks:[{pick, season}]}, get: {...}, acceptedAt,
//     appliedAt?  (set by materialize when the trade was applied to the new roster),
//     skipped?    (set by materialize, with the reason, when the trade could no longer be applied) }
// `give` is what team `from` sends to `to`; `get` is what `from` receives.
import { tradeProblem, TEAM, PLAYER, PICK, SEASON, TRADE_ID } from "../../src/components/tradeRules.js";

function cleanSide(side, label) {
  const players = side?.players ?? [];
  const picks = side?.picks ?? [];
  if (!Array.isArray(players) || !players.every((p) => typeof p === "string" && PLAYER.test(p))) throw new Error(`Invalid ${label} players`);
  if (!Array.isArray(picks) || !picks.every((p) => p && PICK.test(p.pick ?? "") && SEASON.test(p.season ?? ""))) throw new Error(`Invalid ${label} picks`);
  return { players: [...players], picks: picks.map((p) => ({ pick: p.pick, season: p.season })) };
}

// Validates and normalizes a trade received from the Worker. Throws on anything unexpected.
export function cleanTrade(t) {
  if (!t || !TRADE_ID.test(t.id ?? "")) throw new Error("Invalid trade id");
  if (!TEAM.test(t.from ?? "") || !TEAM.test(t.to ?? "") || t.from === t.to) throw new Error(`Invalid teams in trade ${t.id}`);
  if (typeof t.acceptedAt !== "string" || Number.isNaN(Date.parse(t.acceptedAt))) throw new Error(`Invalid acceptedAt in trade ${t.id}`);
  const give = cleanSide(t.give, "give");
  const get = cleanSide(t.get, "get");
  const assets = give.players.length + give.picks.length + get.players.length + get.picks.length;
  if (assets === 0) throw new Error(`Trade ${t.id} is empty`);
  return { id: t.id, from: t.from, to: t.to, give, get, acceptedAt: t.acceptedAt };
}

const byAcceptedAt = (a, b) => a.acceptedAt.localeCompare(b.acceptedAt) || a.id.localeCompare(b.id);

// Adds incoming trades to the stored list by id. Trades already stored are left untouched (they may carry
// appliedAt/skipped). Returns the new list (oldest first) and the ids that were added.
export function mergeTrades(existing, incoming) {
  const known = new Set(existing.map((t) => t.id));
  const added = [];
  const merged = [...existing];
  for (const raw of incoming) {
    const t = cleanTrade(raw);
    if (known.has(t.id)) continue;
    known.add(t.id);
    merged.push(t);
    added.push(t.id);
  }
  return { trades: merged.sort(byAcceptedAt), added };
}

// Which period `materialize` writes the roster for, and which roster it starts from.
//   rosterPeriods / statsPeriods: the period numbers that have a roster file / a stats file
// Normally that is the period after the latest roster. But a latest roster for a period with no stats yet (it has not
// started) is the output of an earlier run, so running again REGENERATES it from the roster before it, picking up trades
// agreed and moves submitted since, instead of creating yet another period.
export function materializeTarget(rosterPeriods, statsPeriods) {
  const latestRoster = Math.max(...rosterPeriods);
  const latestStats = statsPeriods.length ? Math.max(...statsPeriods) : 0;
  const regenerate = latestRoster > latestStats && rosterPeriods.includes(latestRoster - 1);
  return regenerate
    ? { period: latestRoster, base: latestRoster - 1, regenerate }
    : { period: latestRoster + 1, base: latestRoster, regenerate };
}

// Undoes the draft-pick moves of trades an earlier run already applied (those carrying appliedAt), newest first, so the
// trades can be applied again from the same starting point. Players need no undoing, because the roster is rebuilt from
// the previous period's file. A pick is only handed back if its current owner is the team the trade gave it to.
// (A trade flagged skipped moved nothing, so it is left alone.)
//   picksBySeason: Map(draftSeason -> Map(pickId -> ownerAbbr)) - mutated. Returns how many picks were handed back.
export function revertAppliedPicks(trades, picksBySeason) {
  let reverted = 0;
  for (const t of [...trades].filter((x) => x.appliedAt && !x.skipped).sort(byAcceptedAt).reverse()) {
    for (const [giver, receiver, side] of [[t.from, t.to, t.give], [t.to, t.from, t.get]]) {
      for (const p of side?.picks ?? []) {
        const owners = picksBySeason.get(p.season);
        if (owners?.get(p.pick) === receiver) { owners.set(p.pick, giver); reverted++; }
      }
    }
  }
  return reverted;
}

// Applies trades (oldest first) to the new period's roster rows and to draft-pick ownership.
//   rows:          [{ID, ABBR, RESERVE}] - mutated: traded players change ABBR and keep their RESERVE designation
//   picksBySeason: Map(draftSeason -> Map(pickId -> ownerAbbr)) - mutated
// A trade is applied all-or-nothing and re-checked against current ownership and roster sizes; one that can no
// longer happen is skipped with a reason. Mutates each trade, setting appliedAt or skipped; a trade that was applied
// before and applies again keeps its original appliedAt, so running this again changes nothing.
export function applyTrades(rows, trades, picksBySeason, now = new Date().toISOString()) {
  const rowById = new Map(rows.map((r) => [r.ID, r]));
  const sizes = new Map();
  for (const r of rows) sizes.set(r.ABBR, (sizes.get(r.ABBR) ?? 0) + 1);
  const applied = [];
  const skipped = [];

  for (const t of [...trades].sort(byAcceptedAt)) {
    const previouslyAppliedAt = t.skipped ? undefined : t.appliedAt; // a flag left beside `skipped` is stale
    delete t.appliedAt;
    delete t.skipped;
    // Tolerate hand-edited files with a missing players/picks list.
    const items = (side) => ({ players: side?.players ?? [], picks: side?.picks ?? [] });
    const legs = [
      { giver: t.from, receiver: t.to, items: items(t.give) },
      { giver: t.to, receiver: t.from, items: items(t.get) },
    ];
    const problem = tradeProblem(
      legs.map(({ giver, receiver, items }) => ({ giver, receiver, players: items.players, picks: items.picks })),
      {
        playerOwner: (id) => rowById.get(id)?.ABBR,
        pickOwner: (season, pick) => picksBySeason.get(season)?.get(pick),
        size: (team) => sizes.get(team) ?? 0,
      }
    );

    if (problem) {
      t.skipped = problem;
      skipped.push({ id: t.id, reason: problem });
      continue;
    }
    for (const { giver, receiver, items } of legs) {
      for (const id of items.players) {
        rowById.get(id).ABBR = receiver;
        sizes.set(giver, sizes.get(giver) - 1);
        sizes.set(receiver, (sizes.get(receiver) ?? 0) + 1);
      }
      for (const p of items.picks) picksBySeason.get(p.season).set(p.pick, receiver);
    }
    t.appliedAt = previouslyAppliedAt ?? now;
    applied.push(t.id);
  }
  return { applied, skipped };
}

// Rewrites the OWNER column of a draft_picks.csv for the given picks, leaving every other byte
// (header, BOM, CRLF line endings) alone so the diff is only the traded picks.
export function updatePicksText(text, ownerByPick) {
  return text
    .split(/(\r?\n)/)
    .map((part) => {
      const m = /^([^,\r\n]+),([^,\r\n]*)$/.exec(part);
      return m && ownerByPick.has(m[1]) ? `${m[1]},${ownerByPick.get(m[1])}` : part;
    })
    .join("");
}

// Roster moves are submitted against the roster as it looks after the agreed trades. If a trade was agreed AFTER a GM
// submitted (so the roster they saw has since changed), some of their moves can name players who are no longer on the
// team, or who are no longer in the state the move assumes. Keep the moves that still make sense and report the rest.
//   rows: the post-trade roster rows [{ID, ABBR, RESERVE}]
export function reconcileMoves(rows, team, promote, demote) {
  const mine = new Map(rows.filter((r) => r.ABBR === team).map((r) => [r.ID, r]));
  const keptPromote = promote.filter((id) => mine.get(id)?.RESERVE === "R");
  const keptDemote = demote.filter((id) => mine.has(id) && mine.get(id).RESERVE !== "R");
  const dropped = [...promote.filter((id) => !keptPromote.includes(id)), ...demote.filter((id) => !keptDemote.includes(id))];
  return { promote: keptPromote, demote: keptDemote, dropped };
}
