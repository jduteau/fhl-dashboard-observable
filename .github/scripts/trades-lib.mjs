// Pure trade logic shared by record-trades.mjs and apply-moves.mjs (materialize). No file or network access here.
//
// A stored trade (src/data/static/<season>/trades/trades_pNN.json, {"trades": [...]}):
//   { id, from, to, give: {players:[id], picks:[{pick, season}]}, get: {...}, acceptedAt,
//     appliedAt?  (set by materialize when the trade was applied to the new roster),
//     skipped?    (set by materialize, with the reason, when the trade could no longer be applied) }
// `give` is what team `from` sends to `to`; `get` is what `from` receives.
import { MIN_ROSTER, MAX_ROSTER } from "../../src/components/leagueRules.js";
export { MIN_ROSTER, MAX_ROSTER };

const TEAM = /^[A-Z]{2,4}$/;
const PLAYER = /^[\w.'-]{1,20}$/;
const PICK = /^[A-Z]{2,4}\d{1,2}$/;
const SEASON = /^\d{4}-\d{2}$/;
const TRADE_ID = /^[0-9a-f-]{36}$/;

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

// Applies trades (oldest first) to the new period's roster rows and to draft-pick ownership.
//   rows:          [{ID, ABBR, RESERVE}] - mutated: traded players change ABBR and keep their RESERVE designation
//   picksBySeason: Map(draftSeason -> Map(pickId -> ownerAbbr)) - mutated
// A trade is applied all-or-nothing and re-checked against current ownership and roster sizes; one that can no
// longer happen is skipped with a reason. Mutates each trade, setting appliedAt or skipped.
export function applyTrades(rows, trades, picksBySeason, now = new Date().toISOString()) {
  const rowById = new Map(rows.map((r) => [r.ID, r]));
  const sizes = new Map();
  for (const r of rows) sizes.set(r.ABBR, (sizes.get(r.ABBR) ?? 0) + 1);
  const applied = [];
  const skipped = [];

  for (const t of [...trades].sort(byAcceptedAt)) {
    delete t.appliedAt;
    delete t.skipped;
    // Tolerate hand-edited files with a missing players/picks list.
    const items = (side) => ({ players: side?.players ?? [], picks: side?.picks ?? [] });
    const legs = [
      { giver: t.from, receiver: t.to, items: items(t.give) },
      { giver: t.to, receiver: t.from, items: items(t.get) },
    ];
    const problem = (() => {
      const delta = new Map();
      for (const { giver, receiver, items } of legs) {
        for (const id of items.players) {
          if (rowById.get(id)?.ABBR !== giver) return `${id} is not on ${giver}'s roster`;
          delta.set(giver, (delta.get(giver) ?? 0) - 1);
          delta.set(receiver, (delta.get(receiver) ?? 0) + 1);
        }
        for (const p of items.picks) {
          const owner = picksBySeason.get(p.season)?.get(p.pick);
          if (owner === undefined) return `pick ${p.pick} (${p.season}) does not exist`;
          if (owner !== giver) return `${giver} does not own ${p.pick} (${p.season})`;
        }
      }
      for (const team of [t.from, t.to]) {
        const size = (sizes.get(team) ?? 0) + (delta.get(team) ?? 0);
        if (size < MIN_ROSTER || size > MAX_ROSTER) return `${team} would have ${size} players (must be ${MIN_ROSTER}-${MAX_ROSTER})`;
      }
      return null;
    })();

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
    t.appliedAt = now;
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
