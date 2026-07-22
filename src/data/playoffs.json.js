import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition } from "../components/loadfiles.js";

// Pure ranking functions used across all seasons

function calculateRankings(teams, statKey) {
  if (statKey === 'gstat') return calculateGstatRankings(teams);
  const isFloatStat = statKey === 'dstat';
  const precision = isFloatStat ? 0.0001 : 0;
  const multiplier = isFloatStat ? 10000 : 1;
  const teamStats = teams.map(team => ({
    team,
    value: isFloatStat ? Math.round((team[statKey] || 0) * multiplier) / multiplier : (team[statKey] || 0)
  }));
  teamStats.sort((a, b) => b.value - a.value);
  const rankings = {};
  let currentRank = teams.length;
  let previousValue = null;
  teamStats.forEach((teamStat, index) => {
    const valuesEqual = isFloatStat
      ? Math.abs(teamStat.value - (previousValue || 0)) < precision
      : previousValue === teamStat.value;
    if (previousValue === null || !valuesEqual) currentRank = teams.length - index;
    rankings[teamStat.team.abbr] = currentRank;
    previousValue = teamStat.value;
  });
  return rankings;
}

function calculateGstatRankings(teams) {
  const teamsWithGoalieGames = [], teamsWithoutGoalieGames = [];
  teams.forEach(team => {
    const gstatValue = Math.round((team.gstat || 0) * 100) / 100;
    const teamStat = { team, value: gstatValue };
    ((team.goalieGp || 0) > 0 ? teamsWithGoalieGames : teamsWithoutGoalieGames).push(teamStat);
  });
  teamsWithGoalieGames.sort((a, b) => b.value - a.value);
  teamsWithoutGoalieGames.sort((a, b) => b.value - a.value);
  const rankings = {};
  const gstatPrecision = 0.01;
  let currentRank = teams.length, previousValue = null;
  teamsWithGoalieGames.forEach((teamStat, index) => {
    const valuesEqual = previousValue !== null && Math.abs(teamStat.value - previousValue) < gstatPrecision;
    if (!valuesEqual) currentRank = teams.length - index;
    rankings[teamStat.team.abbr] = currentRank;
    previousValue = teamStat.value;
  });
  const lowestRankWithGames = teamsWithGoalieGames.length > 0
    ? Math.min(...teamsWithGoalieGames.map(t => rankings[t.team.abbr])) : teams.length + 1;
  let rankForNoGames = lowestRankWithGames - 1;
  previousValue = null;
  teamsWithoutGoalieGames.forEach((teamStat, index) => {
    const valuesEqual = previousValue !== null && Math.abs(teamStat.value - previousValue) < gstatPrecision;
    if (!valuesEqual) rankForNoGames = lowestRankWithGames - 1 - index;
    rankings[teamStat.team.abbr] = rankForNoGames;
    previousValue = teamStat.value;
  });
  return rankings;
}

function calculateOverallRankings(teams, individualRankings) {
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  const teamTotals = teams.map(team => ({
    team,
    totalRank: statKeys.reduce((sum, k) => sum + (individualRankings[k][team.abbr] || 0), 0),
    goals: team.goals || 0, assists: team.assists || 0, toughness: team.toughness || 0,
    dstat: team.dstat || 0, gstat: team.gstat || 0
  }));
  teamTotals.sort((a, b) => {
    if (a.totalRank !== b.totalRank) return b.totalRank - a.totalRank;
    if (a.goals !== b.goals) return b.goals - a.goals;
    if (a.assists !== b.assists) return b.assists - a.assists;
    if (a.toughness !== b.toughness) return b.toughness - a.toughness;
    if (a.dstat !== b.dstat) return b.dstat - a.dstat;
    return b.gstat - a.gstat;
  });
  const overallRankings = {};
  let currentRank = 1, previousTotalRank = null, previousTiebreakers = null;
  teamTotals.forEach((teamTotal, index) => {
    const tb = { goals: teamTotal.goals, assists: teamTotal.assists, toughness: teamTotal.toughness, dstat: teamTotal.dstat, gstat: teamTotal.gstat };
    const isTie = previousTotalRank === teamTotal.totalRank && previousTiebreakers &&
      previousTiebreakers.goals === tb.goals && previousTiebreakers.assists === tb.assists &&
      previousTiebreakers.toughness === tb.toughness && previousTiebreakers.dstat === tb.dstat &&
      previousTiebreakers.gstat === tb.gstat;
    if (!isTie && index > 0) currentRank = index + 1;
    overallRankings[teamTotal.team.abbr] = currentRank;
    previousTotalRank = teamTotal.totalRank;
    previousTiebreakers = tb;
  });
  return overallRankings;
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
    teamTotals.toughness += stat(player, "stats/pim") + stat(player, "stats/hits");
    teamTotals.blocks += stat(player, "stats/blocks");
    teamTotals.takeaways += stat(player, "stats/take");
    teamTotals.giveaways += stat(player, "stats/give");
    teamTotals.toi += stat(player, "stats/toi");
    if (position === "D") {
      teamTotals.dstat += stat(player, "stats/toi") / 20 + stat(player, "stats/blocks") + stat(player, "stats/take") - stat(player, "stats/give");
    } else if (position === "F") {
      teamTotals.dstat += stat(player, "stats/toi") / 30 + stat(player, "stats/blocks") + stat(player, "stats/take") - stat(player, "stats/give");
    }
    if (position === "G") {
      teamTotals.gstat += 2 * stat(player, "stats/wins") + stat(player, "stats/ties") + 2 * stat(player, "stats/so") + 0.15 * stat(player, "stats/sa") - stat(player, "stats/ga");
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

function buildSeasonPlayoffs(sf, teamInfo, bracketConfig) {
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
    ['goals', 'assists', 'toughness', 'dstat', 'gstat'].forEach(k => {
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

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const bracketConfig = await readCsvFile(`${sf.basePath}/playoff_bracket.csv`);
  allData[season] = buildSeasonPlayoffs(sf, teamInfo, bracketConfig);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));

