import { buildSeasonStandings } from "./standingsHelpers.js";
import { buildSeasonPlayoffs } from "./playoffHelpers.js";
import { readCsvFile, loadSeasonData } from "./loadfiles.js";

// Teams are returned in pick order (first pick first), per the league rules:
//   1) missed the playoffs  2) made the playoffs, not a division winner, no Conference Final
//   3) division winners with no Conference Final  4) Conference Final losers
//   5) Cup Final runner-up  6) champion
// Teams listed in playoff_ineligible.csv qualified on standings but were barred, so they
// count as playoff teams that lost before the Conference Finals.
// Within a group, fewer regular season points picks first. Groups whose playoff
// results aren't known yet (rounds not played) fall back to the regular season.
export function computeBaseOrder(standings, playoffs, ineligible = []) {
  const rows = standings.overallStandings;
  const rank = {};
  const divisionWinners = new Set();
  rows.forEach(t => { rank[t.team] = t.overallRank; });
  for (const division of new Set(rows.map(t => t.division))) {
    const best = rows.filter(t => t.division === division).sort((a, b) => a.overallRank - b.overallRank)[0];
    if (best) divisionWinners.add(best.team);
  }
  const byPoints = teams => [...teams].sort((a, b) => rank[b] - rank[a]);
  const allTeams = rows.map(t => t.team);

  const rounds = playoffs.availableRounds;
  const bracketTeams = r => (playoffs.bracket.rounds[r - 1]?.matchups ?? [])
    .flatMap(m => [m.team1, m.team2]).filter(Boolean);
  // Participants of round r are only certain once round r-1 has been played
  const teamsIn = r => (r === 1 ? bracketTeams(1) : rounds.includes(r - 1) ? bracketTeams(r) : null);

  if (rounds.length === 0) return byPoints(allTeams);

  // Teams barred from the playoffs (e.g. negative bank balance) still count as having qualified
  const playoffTeams = new Set([...teamsIn(1), ...ineligible]);
  const conferenceFinalists = new Set(teamsIn(3) ?? []);
  const finalists = new Set(teamsIn(4) ?? []);

  const group1 = allTeams.filter(t => !playoffTeams.has(t));
  const rest = allTeams.filter(t => playoffTeams.has(t) && !conferenceFinalists.has(t));
  const group2 = rest.filter(t => !divisionWinners.has(t));
  const group3 = rest.filter(t => divisionWinners.has(t));
  const group4 = [...conferenceFinalists].filter(t => !finalists.has(t));

  let champion = null;
  if (rounds.includes(4)) {
    const m = playoffs.data[4]?.matchups?.[0];
    const a = m?.team1?.rankings?.total, b = m?.team2?.rankings?.total;
    if (a != null && b != null && a !== b) champion = a < b ? m.team1.abbr : m.team2.abbr;
  }
  const group5 = byPoints([...finalists].filter(t => t !== champion));

  return [...byPoints(group1), ...byPoints(group2), ...byPoints(group3), ...byPoints(group4),
    ...group5, ...(champion ? [champion] : [])];
}

// draft_order.csv holds the round 1 lottery winners (ORDER 1 and 2). A round that
// lists every team (a draft already held) is kept verbatim instead of recomputed.
export function buildDraftOrderRows(baseOrder, fileRows) {
  const forRound = r => fileRows.filter(row => row.ROUND === String(r)).sort((a, b) => +a.ORDER - +b.ORDER);
  const toRows = (teams, round) => teams.map((team, i) => ({ ORDER: String(i + 1), TEAM: team, ROUND: String(round) }));
  const isComplete = rows => rows.length >= baseOrder.length;

  const lottery = forRound(1);
  const winners = lottery.map(r => r.TEAM);
  const round1 = isComplete(lottery) ? winners : [...winners, ...baseOrder.filter(t => !winners.includes(t))];
  const round2 = forRound(2);
  return [...toRows(round1, 1), ...toRows(isComplete(round2) ? round2.map(r => r.TEAM) : baseOrder, 2)];
}

export async function loadDraftOrderRows(season, sf) {
  const basePath = sf.basePath;
  const teamInfo = await readCsvFile(`${basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${basePath}/player_info.csv`);
  const bracketConfig = await readCsvFile(`${basePath}/playoff_bracket.csv`);
  let ineligible = [];
  try {
    ineligible = (await readCsvFile(`${basePath}/playoff_ineligible.csv`)).map(r => r.TEAM);
  } catch (e) {
    // No barred teams recorded for this season
  }
  const fileRows = await readCsvFile(`${basePath}/draft_order.csv`);
  const standings = buildSeasonStandings(sf, teamInfo, playerInfo);
  const playoffs = buildSeasonPlayoffs(sf, teamInfo, bracketConfig);
  return buildDraftOrderRows(computeBaseOrder(standings.rankings, playoffs, ineligible), fileRows);
}
