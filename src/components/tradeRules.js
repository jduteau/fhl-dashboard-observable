// The rules a trade must meet, shared by everything that checks one: the Worker (when a GM proposes or accepts) and the
// roster script (when the agreed trades are applied to the next period's roster). Pure functions and constants, so both
// can import them.
import { MIN_ROSTER, MAX_ROSTER } from "./leagueRules.js";

// ---- Identifier formats ----
export const TEAM = /^[A-Z]{2,4}$/; // ANA
export const PLAYER = /^[\w.'-]{1,20}$/; // berglja01
export const PICK = /^[A-Z]{2,4}\d{1,2}$/; // ANA1: the team's pick in round 1
export const SEASON = /^\d{4}-\d{2}$/; // 2026-27
export const TRADE_ID = /^[0-9a-f-]{36}$/; // a UUID

// Why a trade cannot happen right now, as a sentence, or null if it can.
//   legs:  [{giver, receiver, players: [playerId], picks: [{season, pick}]}]: what each side sends (the first leg's
//          giver and receiver are the two teams in the trade)
//   state: {playerOwner(id) -> abbr or undefined, pickOwner(season, pick) -> abbr or undefined, size(abbr) -> number}
//          as things stand: who owns each player and pick, and how many players each team has
// Each side must own what it gives (a pick must also exist), and both teams must end up with between MIN_ROSTER and
// MAX_ROSTER players.
export function tradeProblem(legs, state) {
  const delta = new Map();
  for (const { giver, receiver, players, picks } of legs) {
    for (const id of players) {
      if (state.playerOwner(id) !== giver) return `${id} is not on ${giver}'s roster`;
      delta.set(giver, (delta.get(giver) ?? 0) - 1);
      delta.set(receiver, (delta.get(receiver) ?? 0) + 1);
    }
    for (const { season, pick } of picks) {
      const owner = state.pickOwner(season, pick);
      if (owner === undefined) return `Pick ${pick} (${season}) does not exist`;
      if (owner !== giver) return `${giver} does not own ${pick} (${season})`;
    }
  }
  for (const team of [legs[0].giver, legs[0].receiver]) {
    const size = state.size(team) + (delta.get(team) ?? 0);
    if (size < MIN_ROSTER || size > MAX_ROSTER)
      return `${team} would have ${size} players after this trade (must be ${MIN_ROSTER}-${MAX_ROSTER})`;
  }
  return null;
}
