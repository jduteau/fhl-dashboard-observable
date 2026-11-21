import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, calcToughness, calcDStat, calcGStat, statInputs } from "./loadfiles.js";
import { RANKED_STATS, roundForRanking, rankStat, rankOverall } from "./ranking.js";

// Ranks one stat across the teams in a round (see ranking.js): {teamAbbr: rank}
function calculateRankings(teams, statKey) {
  const entries = teams.map(team => ({
    key: team.abbr,
    value: roundForRanking(statKey, team[statKey] || 0),
    played: statKey !== "gstat" || (team.goalieGp || 0) > 0,
  }));
  return rankStat(entries, statKey, teams.length);
}

// Overall rank of each team in a round, from its five stat ranks
function calculateOverallRankings(teams, individualRankings) {
  return rankOverall(teams.map(team => ({
    key: team.abbr,
    ranks: Object.fromEntries(RANKED_STATS.map(stat => [stat, individualRankings[stat][team.abbr]])),
    values: team,
  })));
}

function calculateTeamStats(round, teamAbbr, prevRound, teamInfo) {
  if (!round.statsFile || !round.rosterFile) return null;
  const teamRoster = round.rosterFile.filter(player => player.ABBR === teamAbbr);
  const teamPlayerIds = teamRoster.map(player => player.ID);
  const teamPlayers = round.statsFile.filter(player => teamPlayerIds.includes(player.hockeyRef));
  const prevStatsMap = {};
  if (prevRound && prevRound.statsFile) {
    prevRound.statsFile.forEach(p => { prevStatsMap[p.hockeyRef] = p; });
  }
  const stat = (player, field) => {
    const curr = player[field] || 0;
    const prev = prevStatsMap[player.hockeyRef] ? (prevStatsMap[player.hockeyRef][field] || 0) : 0;
    return curr - prev;
  };
  const deltaInputs = (player) => statInputs((name) => stat(player, `stats/${name}`));
  let teamTotals = { goals: 0, assists: 0, points: 0, pim: 0, hits: 0, toughness: 0, blocks: 0, takeaways: 0, giveaways: 0, toi: 0, dstat: 0, gstat: 0, gp: 0, goalieGp: 0 };
  teamPlayers.forEach(player => {
    const rosterEntry = teamRoster.find(r => r.ID === player.hockeyRef);
    if (!rosterEntry || rosterEntry.RESERVE === 'R') return;
    const position = mapPosition(player.pos);
    teamTotals.goals += stat(player, "stats/goals");
    teamTotals.assists += stat(player, "stats/assists");
    teamTotals.points += stat(player, "stats/goals") + stat(player, "stats/assists");
    teamTotals.pim += stat(player, "stats/pim");
    teamTotals.hits += stat(player, "stats/hits");
    teamTotals.toughness += calcToughness(deltaInputs(player));
    teamTotals.blocks += stat(player, "stats/blocks");
    teamTotals.takeaways += stat(player, "stats/take");
    teamTotals.giveaways += stat(player, "stats/give");
    teamTotals.toi += stat(player, "stats/toi");
    if (position === "D" || position === "F") {
      teamTotals.dstat += calcDStat(position, deltaInputs(player));
    }
    if (position === "G") {
      teamTotals.gstat += calcGStat(deltaInputs(player));
      teamTotals.goalieGp += stat(player, "stats/gp");
    }
    teamTotals.gp += stat(player, "stats/gp");
  });
  const teamData = teamInfo.find(t => t.ABBR === teamAbbr);
  return {
    abbr: teamAbbr,
    name: teamData ? teamData.NAME : teamAbbr,
    division: teamData ? teamData.DIVISION : "Unknown",
    ...teamTotals,
    playerCount: teamPlayers.length
  };
}

export function buildSeasonPlayoffs(sf, teamInfo, bracketConfig) {
  const { availablePlayoffRounds } = sf;

  const playoffBracket = {
    rounds: [
      { round: 1, name: "First Round", matchups: [] },
      { round: 2, name: "Conference Semi-Finals", matchups: [] },
      { round: 3, name: "Conference Finals", matchups: [] },
      { round: 4, name: "Stanley Cup Final", matchups: [] }
    ]
  };
  bracketConfig.forEach(row => {
    const roundIndex = row.round - 1;
    if (roundIndex >= 0 && roundIndex < playoffBracket.rounds.length) {
      playoffBracket.rounds[roundIndex].matchups.push({
        matchup: parseInt(row.matchup),
        team1: row.team1,
        team2: row.team2
      });
    }
  });

  const playoffData = {};
  availablePlayoffRounds.forEach((round, roundIndex) => {
    const prevRound = roundIndex > 0 ? availablePlayoffRounds[roundIndex - 1] : null;
    playoffData[round.round] = { ...round, matchups: [] };
    const bracketRound = playoffBracket.rounds[round.round - 1];
    const roundTeams = [];
    if (bracketRound) {
      bracketRound.matchups.forEach(matchup => {
        if (matchup.team1) roundTeams.push(matchup.team1);
        if (matchup.team2) roundTeams.push(matchup.team2);
      });
    }
    const roundTeamStats = roundTeams
      .map(abbr => calculateTeamStats(round, abbr, prevRound, teamInfo))
      .filter(Boolean);

    const individualRankings = {};
    RANKED_STATS.forEach(k => {
      individualRankings[k] = calculateRankings(roundTeamStats, k);
    });
    const overallRankings = calculateOverallRankings(roundTeamStats, individualRankings);

    if (bracketRound) {
      bracketRound.matchups.forEach(matchup => {
        const team1Stats = calculateTeamStats(round, matchup.team1, prevRound, teamInfo);
        const team2Stats = calculateTeamStats(round, matchup.team2, prevRound, teamInfo);
        if (team1Stats) team1Stats.rankings = { goals: individualRankings.goals[matchup.team1], assists: individualRankings.assists[matchup.team1], toughness: individualRankings.toughness[matchup.team1], dstat: individualRankings.dstat[matchup.team1], gstat: individualRankings.gstat[matchup.team1], total: overallRankings[matchup.team1] };
        if (team2Stats) team2Stats.rankings = { goals: individualRankings.goals[matchup.team2], assists: individualRankings.assists[matchup.team2], toughness: individualRankings.toughness[matchup.team2], dstat: individualRankings.dstat[matchup.team2], gstat: individualRankings.gstat[matchup.team2], total: overallRankings[matchup.team2] };
        playoffData[round.round].matchups.push({ matchup: matchup.matchup, team1: team1Stats, team2: team2Stats, winner: null });
      });
    }
  });

  return {
    availableRounds: availablePlayoffRounds.map(r => r.round),
    roundNames: availablePlayoffRounds.reduce((acc, r) => { acc[r.round] = r.name; return acc; }, {}),
    bracket: playoffBracket,
    data: playoffData,
    teams: teamInfo
  };
}
