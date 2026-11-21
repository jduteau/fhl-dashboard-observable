// How the league ranks teams: each team is ranked on five stats, and the five ranks add up to an overall rank. Used for
// the regular-season standings (one set of ranks per period) and for each playoff round.
//
// The best value gets the highest rank (the number of teams, 32 in the regular season) and the worst gets 1; teams with
// equal values share the rank of the first of them. The overall rank counts the other way: 1 is the best.

export const RANKED_STATS = ["goals", "assists", "toughness", "dstat", "gstat"];

// Values within this of the previous one count as equal (0 = must be exactly equal), which absorbs floating-point noise
// in DStat and GStat
const STAT_TOLERANCE = { goals: 0, assists: 0, toughness: 0, dstat: 0.0001, gstat: 0.01 };

// Decimals a team's total is rounded to before it is ranked (period and playoff totals are; season totals are not)
const STAT_DECIMALS = { dstat: 4, gstat: 2 };

export function roundForRanking(statKey, value) {
  const decimals = STAT_DECIMALS[statKey];
  return decimals ? Math.round(value * 10 ** decimals) / 10 ** decimals : value;
}

// entries: [{key, value}] -> {key: rank}; ranks count down from `top`
function rankDescending(entries, top, tolerance) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const ranks = {};
  let rank = top;
  let previous = null;
  sorted.forEach((entry, index) => {
    const equal = previous !== null && (tolerance > 0 ? Math.abs(entry.value - previous) < tolerance : entry.value === previous);
    if (!equal) rank = top - index;
    ranks[entry.key] = rank;
    previous = entry.value;
  });
  return ranks;
}

// Ranks one stat across the teams. entries: [{key, value, played}] -> {key: rank}; `total` is the number of teams.
// GStat is special: a team whose goalies played no games ranks below EVERY team whose goalies did, however poor their
// GStat (a team with no goalie games has a GStat of 0, which would otherwise beat a bad one).
export function rankStat(entries, statKey, total) {
  const tolerance = STAT_TOLERANCE[statKey];
  if (statKey !== "gstat") return rankDescending(entries, total, tolerance);
  const ranks = rankDescending(entries.filter(e => e.played), total, tolerance);
  const lowestRankWithGames = Object.values(ranks).length ? Math.min(...Object.values(ranks)) : total + 1;
  return { ...ranks, ...rankDescending(entries.filter(e => !e.played), lowestRankWithGames - 1, tolerance) };
}

// The overall rank (1 = best) from the five stat ranks. teams: [{key, ranks: {goals, ...}, values: {goals, ...}}], where
// `ranks` are the team's rank on each stat and `values` its totals. The team with the highest rank total is first; level
// totals are split by goals, then assists, toughness, DStat and GStat (more is better); teams level on all of that share
// a rank. -> {key: overall rank}
export function rankOverall(teams) {
  const rows = teams.map(team => ({
    key: team.key,
    totalRank: RANKED_STATS.reduce((sum, stat) => sum + (team.ranks[stat] || 0), 0),
    ...Object.fromEntries(RANKED_STATS.map(stat => [stat, team.values?.[stat] || 0])),
  }));
  rows.sort((a, b) => {
    if (a.totalRank !== b.totalRank) return b.totalRank - a.totalRank;
    for (const stat of RANKED_STATS) if (a[stat] !== b[stat]) return b[stat] - a[stat];
    return 0;
  });
  const ranks = {};
  let rank = 1;
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    const tie = previous && previous.totalRank === row.totalRank && RANKED_STATS.every(stat => previous[stat] === row[stat]);
    if (!tie && index > 0) rank = index + 1;
    ranks[row.key] = rank;
  });
  return ranks;
}
