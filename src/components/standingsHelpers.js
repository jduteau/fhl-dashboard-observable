import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, getStatsForPeriod, indexBy, periodLookup, assertPlayersKnown } from "./loadfiles.js";
import { recordForRank, TEAMS_IN_LEAGUE } from "./leagueRules.js";
import { statColumns, sortRoster, activeTotals } from "./playerRows.js";
import { RANKED_STATS, roundForRanking, rankStat, rankOverall } from "./ranking.js";

// Games played by the goalies a team had active in a period
function goalieGames(team, period) {
  return (team[period]?.ROSTER || [])
    .filter(player => player.Position === "G" && player.Reserve !== "R")
    .reduce((total, goalie) => total + (goalie.GamesPlayed || 0), 0);
}

// Rankings of one stat for one period: {teamAbbr: rank}
function calculateRankings(teams, period, statKey) {
  const entries = teams.map(team => ({
    key: team.ABBR,
    value: roundForRanking(statKey, team[period]?.ACTIVE_TOTALS?.[statKey] || 0),
    played: statKey !== "gstat" || goalieGames(team, period) > 0,
  }));
  return rankStat(entries, statKey, teams.length);
}

// Overall rank of each team for a period, from its five stat ranks (see ranking.js)
function calculateOverallRankings(teams, period, individualRankings) {
  return rankOverall(teams.map(team => ({
    key: team.ABBR,
    ranks: Object.fromEntries(RANKED_STATS.map(stat => [stat, individualRankings[stat][team.ABBR]])),
    values: team[period]?.ACTIVE_TOTALS,
  })));
}

// Function to create team rankings double array
function createTeamRankings(teams, availablePeriods) {
  const teamRankings = [];
  const statKeys = RANKED_STATS;
  
  availablePeriods.forEach((period, periodIndex) => {
    // Initialize period array
    teamRankings[periodIndex] = [];
    
    // Calculate individual stat rankings for this period
    const individualRankings = {};
    statKeys.forEach(statKey => {
      individualRankings[statKey] = calculateRankings(teams, period, statKey);
    });
    
    // Calculate overall rankings for this period
    const overallRankings = calculateOverallRankings(teams, period, individualRankings);
    
    // Create rankings data for each team for this period
    teams.forEach(team => {
      const activeTotals = team[period]?.ACTIVE_TOTALS || {};
      const teamOverallRank = overallRankings[team.ABBR] || 0;
      const record = recordForRank(teamOverallRank); // the 3-game record this rank earns (table in leagueRules.js)
      
      teamRankings[periodIndex].push({
        period: period,
        team: team.ABBR,
        // Stat totals
        goals: activeTotals.goals || 0,
        assists: activeTotals.assists || 0,
        toughness: activeTotals.toughness || 0,
        dstat: activeTotals.dstat || 0,
        gstat: activeTotals.gstat || 0,
        goalieGames: goalieGames(team, period),
        // Individual stat rankings
        goalsRank: individualRankings.goals[team.ABBR] || 0,
        assistsRank: individualRankings.assists[team.ABBR] || 0,
        toughnessRank: individualRankings.toughness[team.ABBR] || 0,
        dstatRank: individualRankings.dstat[team.ABBR] || 0,
        gstatRank: individualRankings.gstat[team.ABBR] || 0,
        // Overall ranking
        overall: individualRankings.goals[team.ABBR] + individualRankings.assists[team.ABBR] + individualRankings.toughness[team.ABBR] + individualRankings.dstat[team.ABBR] + individualRankings.gstat[team.ABBR],
        overallRank: teamOverallRank,
        // Record based on overall rank
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
        record: `${record.wins}-${record.losses}-${record.ties}`
      });
    });
  });
  
  // Calculate overall standings by summing across all periods
  const overallStandings = [];
  const teamAbbrs = teams.map(team => team.ABBR);
  
  teamAbbrs.forEach(teamAbbr => {
    let totalGoals = 0;
    let totalAssists = 0;
    let totalToughness = 0;
    let totalDstat = 0;
    let totalGstat = 0;
    let totalGoalieGames = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    
    // Get team info for full name
    const teamInfo = teams.find(t => t.ABBR === teamAbbr);
    
    // Sum across all periods for this team
    teamRankings.forEach(periodData => {
      const teamData = periodData.find(t => t.team === teamAbbr);
      if (teamData) {
        totalGoals += teamData.goals || 0;
        totalAssists += teamData.assists || 0;
        totalToughness += teamData.toughness || 0;
        totalDstat += teamData.dstat || 0;
        totalGstat += teamData.gstat || 0;
        totalGoalieGames += teamData.goalieGames || 0;
        totalWins += teamData.wins || 0;
        totalLosses += teamData.losses || 0;
        totalTies += teamData.ties || 0;
      }
    });
    
    overallStandings.push({
      team: teamAbbr,
      teamName: teamInfo.NAME,
      division: teamInfo.DIVISION,
      goals: totalGoals,
      assists: totalAssists,
      toughness: totalToughness,
      dstat: totalDstat,
      gstat: totalGstat,
      goalieGames: totalGoalieGames,
      wins: totalWins,
      losses: totalLosses,
      ties: totalTies,
      points: totalWins * 2 + totalTies // Standard hockey points calculation
    });
  });
  
  // Sort overall standings by points (descending), then by wins (descending)
  overallStandings.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.goals !== b.goals) return b.goals - a.goals;
    return b.assists - a.assists;
  });
  
  // Add overall ranking based on standings position
  overallStandings.forEach((team, index) => {
    team.overallRank = index + 1;
  });

  // Season-long rank of each stat (ranked on the unrounded season totals)
  RANKED_STATS.forEach(statKey => {
    const ranks = rankStat(
      overallStandings.map(team => ({ key: team.team, value: team[statKey] || 0, played: (team.goalieGames || 0) > 0 })),
      statKey,
      overallStandings.length
    );
    overallStandings.forEach(team => {
      team[`${statKey}Rank`] = ranks[team.team];
    });
  });

  // Return object with both period rankings and overall standings
  return {
    periods: teamRankings,
    overallStandings: overallStandings
  };
}

export function buildSeasonStandings(sf, teamInfo, playerInfo) {
  const { statsData, rosterPeriods, availablePeriods } = sf;
  if (teamInfo.length !== TEAMS_IN_LEAGUE)
    console.warn(`[${sf.season ?? ""}] the record-by-rank table is written for ${TEAMS_IN_LEAGUE} teams but this league has ${teamInfo.length}; ranks outside it earn no record`);
  const playerIndex = indexBy(playerInfo, "ID");
  assertPlayersKnown(playerIndex, rosterPeriods.map(p => ({ name: `${sf.season ?? ""} rosters_p${String(p.period).padStart(2, "0")}.csv`.trim(), rows: p.data })));
  const stats = periodLookup(statsData);
  // A roster file with no stats yet (the upcoming period) has nothing to rank, so it is skipped
  const scoredRosterPeriods = rosterPeriods.filter(p => statsData[p.period]);

  const teamData = teamInfo.map(team => {
    scoredRosterPeriods.forEach(periodInfo => {
      team[periodInfo.period] = {};
      const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
      const currentStats = stats.stats(periodInfo.period);
      const previousStats = stats.previous(periodInfo.period);
      team[periodInfo.period]['ROSTER'] = roster.map(player => {
        const info = playerIndex.get(player.ID);
        const position = mapPosition(info.Pos);
        const playerStats = getStatsForPeriod(position, currentStats.get(player.ID) || {}, previousStats.get(player.ID) || {});
        return {
          PLAYER_ID: player.ID,
          Name: info.Name,
          Position: position,
          NHLTeam: info.NHL,
          Reserve: player.RESERVE,
          ...statColumns(position, playerStats, { separateGStat: true }),
        };
      });
      sortRoster(team[periodInfo.period]['ROSTER'], (a, b) => a.GamesPlayed - b.GamesPlayed);
      team[periodInfo.period]['ACTIVE_TOTALS'] = activeTotals(team[periodInfo.period]['ROSTER'], { separateGStat: true });
    });
    return team;
  });

  function periodHasTeamStats(teams, period) {
    return teams.some(team => {
      const activeTotals = team[period]?.ACTIVE_TOTALS;
      if (!activeTotals) return false;
      return (activeTotals.goals || 0) > 0 ||
             (activeTotals.assists || 0) > 0 ||
             (activeTotals.toughness || 0) > 0 ||
             (activeTotals.dstat || 0) > 0 ||
             (activeTotals.gstat || 0) > 0;
    });
  }

  const periodsWithStats = availablePeriods.filter(period => periodHasTeamStats(teamData, period));
  const rankings = createTeamRankings(teamData, periodsWithStats);

  return { teams: teamInfo, rankings, availablePeriods: periodsWithStats };
}
