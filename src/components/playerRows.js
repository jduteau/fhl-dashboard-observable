// Building blocks for the player rows the data loaders publish (rosters.json, playoffRosters.json, allplayers.json,
// standings.json, teamInfo.json ...). Each loader composes a row from the pieces it needs:
//
//   { PLAYER_ID: id, ...identityColumns(...), Reserve, ...statColumns(...), Rating }
//
// so the columns, their order and their goalie/skater rules are defined once, here.
import { calculateAge } from "./loadfiles.js";
import { POSITION_ORDER } from "./leagueRules.js";

// Who the player is and what they cost: Name, HockeyDB, PuckPedia, BirthDate, Age, Position, NHLTeam, Salary, Contract.
//   info = the player_info.csv row; contract = the contract row in effect (or undefined)
//   links: false leaves out the HockeyDB and PuckPedia ids
export function identityColumns(info, position, season, contract, { links = true } = {}) {
  return {
    Name: info.Name,
    ...(links ? { HockeyDB: info.HockeyDB, PuckPedia: info.PuckPedia } : {}),
    BirthDate: info.BirthDate,
    Age: calculateAge(info.BirthDate, season),
    Position: position,
    NHLTeam: info.NHL,
    Salary: contract?.Salary || 0,
    Contract: contract?.Contract || '---',
  };
}

// The stat columns for one player, from a stat line (the result of getOverallStats / getStatsForPeriod). Skaters get
// Goals ... TOI, Toughness and DStat; goalies get Record, SO, SA, GA and a GStat; the other kind's columns are null.
//   goalieRecord: true  also include Wins, Losses and Ties (before Record)
//   separateGStat: true DStat stays null for goalies and their GStat has its own column; by default a goalie's GStat is
//                       published in the DStat column
export function statColumns(position, stats, { goalieRecord = false, separateGStat = false } = {}) {
  const goalie = position === "G";
  const skater = (value) => (goalie ? null : value);
  const forGoalie = (value) => (goalie ? value : null);
  return {
    Goals: skater(stats.goals),
    Assists: skater(stats.assists),
    PIM: skater(stats.pim),
    Hits: skater(stats.hits),
    Blocks: skater(stats.blocks),
    Take: skater(stats.take),
    Give: skater(stats.give),
    TOI: skater(stats.toi),
    ...(goalieRecord ? {
      Wins: forGoalie(stats.wins || 0),
      Losses: forGoalie(stats.losses || 0),
      Ties: forGoalie(stats.ties || 0),
    } : {}),
    Record: forGoalie(`${stats.wins}-${stats.losses}-${stats.ties}`),
    SO: forGoalie(stats.so || 0),
    SA: forGoalie(stats.sa || 0),
    GA: forGoalie(stats.ga || 0),
    Toughness: skater(stats.toughness),
    DStat: goalie ? (separateGStat ? null : (stats.gstat || 0)) : stats.dstat,
    ...(separateGStat ? { GStat: forGoalie(stats.gstat || 0) } : {}),
    GamesPlayed: stats.games_played,
  };
}

// ---- Rosters ----

// Reserve players (R) and players who cannot play (N/A) are not in the active lineup
export const isActive = (player) => player.Reserve !== "R" && player.Reserve !== "N/A";
export const isReserve = (player) => player.Reserve === "R";

// Sort a roster in place: defensemen, forwards, goalies; within a position active players before reserves; then
// `thenBy(a, b)` (e.g. best rating first). Returns the roster.
export function sortRoster(roster, thenBy = () => 0) {
  const reserveRank = (player) => (player.Reserve === "R" ? 1 : 0);
  return roster.sort((a, b) =>
    (POSITION_ORDER[a.Position] - POSITION_ORDER[b.Position]) || (reserveRank(a) - reserveRank(b)) || thenBy(a, b));
}

// Team totals over some of a roster's players: {goals, assists, toughness, dstat, gstat}. A goalie's GStat is published
// in the DStat column, so it is counted as gstat (and never as dstat) unless `separateGStat`, where rows carry GStat.
export function sumTotals(roster, filter, { separateGStat = false } = {}) {
  return roster.filter(filter).reduce((totals, player) => {
    const goalie = player.Position === "G";
    return {
      goals: totals.goals + (goalie ? 0 : (player.Goals || 0)),
      assists: totals.assists + (goalie ? 0 : (player.Assists || 0)),
      toughness: totals.toughness + (goalie ? 0 : (player.Toughness || 0)),
      dstat: totals.dstat + (separateGStat ? (player.DStat || 0) : (goalie ? 0 : (player.DStat || 0))),
      gstat: totals.gstat + (separateGStat ? (player.GStat !== null ? player.GStat : 0) : (goalie ? (player.DStat || 0) : 0)),
    };
  }, { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
}

export const activeTotals = (roster, options) => sumTotals(roster, isActive, options);
export const reserveTotals = (roster, options) => sumTotals(roster, isReserve, options);
