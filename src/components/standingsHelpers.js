import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, getStatsForPeriod, indexBy, periodLookup, assertPlayersKnown } from "./loadfiles.js";
import { recordForRank, TEAMS_IN_LEAGUE } from "./leagueRules.js";
import { statColumns, sortRoster, activeTotals } from "./playerRows.js";

// ---- Ranking one stat across the teams ----
//
// The best value gets the highest rank (the number of teams, 32 in this league) and the worst gets 1; teams with equal
// values share the rank of the first of them. Values within `tolerance` of the previous one count as equal (0 = must be
// exactly equal), which absorbs floating-point noise in DStat and GStat.
const STAT_TOLERANCE = { goals: 0, assists: 0, toughness: 0, dstat: 0.0001, gstat: 0.01 };

// Decimals a team's period total is rounded to before ranking (the season totals are ranked unrounded)
const STAT_DECIMALS = { dstat: 4, gstat: 2 };

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

// entries: [{key, value, played}]. GStat is special: a team whose goalies played no games ranks below EVERY team whose
// goalies did, however poor their GStat (a team with no goalie games has a GStat of 0, which would otherwise beat a bad one).
function rankStat(entries, statKey, total) {
  const tolerance = STAT_TOLERANCE[statKey];
  if (statKey !== "gstat") return rankDescending(entries, total, tolerance);
  const ranks = rankDescending(entries.filter(e => e.played), total, tolerance);
  const lowestRankWithGames = Object.values(ranks).length ? Math.min(...Object.values(ranks)) : total + 1;
  return { ...ranks, ...rankDescending(entries.filter(e => !e.played), lowestRankWithGames - 1, tolerance) };
}

// Games played by the goalies a team had active in a period
function goalieGames(team, period) {
  return (team[period]?.ROSTER || [])
    .filter(player => player.Position === "G" && player.Reserve !== "R")
    .reduce((total, goalie) => total + (goalie.GamesPlayed || 0), 0);
}

// Rankings of one stat for one period: {teamAbbr: rank}
function calculateRankings(teams, period, statKey) {
  const decimals = STAT_DECIMALS[statKey];
  const entries = teams.map(team => {
    const value = team[period]?.ACTIVE_TOTALS?.[statKey] || 0;
    return {
      key: team.ABBR,
      value: decimals ? Math.round(value * 10 ** decimals) / 10 ** decimals : value,
      played: statKey !== "gstat" || goalieGames(team, period) > 0,
    };
  });
  return rankStat(entries, statKey, teams.length);
}

// Function to calculate overall rankings based on sum of individual ranks
function calculateOverallRankings(teams, period, individualRankings) {
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  
  // Calculate total rank for each team
  const teamTotals = teams.map(team => {
    const totalRank = statKeys.reduce((sum, statKey) => sum + (individualRankings[statKey][team.ABBR] || 0), 0);
    
    return {
      team: team,
      totalRank: totalRank,
      // Include individual values for tiebreaking
      goals: team[period]?.ACTIVE_TOTALS?.goals || 0,
      assists: team[period]?.ACTIVE_TOTALS?.assists || 0,
      toughness: team[period]?.ACTIVE_TOTALS?.toughness || 0,
      dstat: team[period]?.ACTIVE_TOTALS?.dstat || 0,
      gstat: team[period]?.ACTIVE_TOTALS?.gstat || 0
    };
  });
  
  // Sort by total rank (ascending - lower total rank is better), then by tiebreakers
  teamTotals.sort((a, b) => {
    // First sort by total rank (ascending)
    if (a.totalRank !== b.totalRank) {
      return b.totalRank - a.totalRank;
    }
    
    // Tiebreakers in order: goals, assists, toughness, dstat, gstat (all descending)
    if (a.goals !== b.goals) return b.goals - a.goals;
    if (a.assists !== b.assists) return b.assists - a.assists;
    if (a.toughness !== b.toughness) return b.toughness - a.toughness;
    if (a.dstat !== b.dstat) return b.dstat - a.dstat;
    return b.gstat - a.gstat;
  });
  
  // Assign overall rankings with ties handled properly
  const overallRankings = {};
  let currentRank = 1;
  let previousTotalRank = null;
  let previousTiebreakers = null;
  
  teamTotals.forEach((teamTotal, index) => {
    const currentTiebreakers = {
      goals: teamTotal.goals,
      assists: teamTotal.assists,
      toughness: teamTotal.toughness,
      dstat: teamTotal.dstat,
      gstat: teamTotal.gstat
    };
    
    // Check if this team has the same total rank and all tiebreakers as the previous team
    const isTie = previousTotalRank === teamTotal.totalRank &&
      previousTiebreakers &&
      previousTiebreakers.goals === currentTiebreakers.goals &&
      previousTiebreakers.assists === currentTiebreakers.assists &&
      previousTiebreakers.toughness === currentTiebreakers.toughness &&
      previousTiebreakers.dstat === currentTiebreakers.dstat &&
      previousTiebreakers.gstat === currentTiebreakers.gstat;
    
    if (!isTie && index > 0) {
      currentRank = index + 1;
    }
    
    overallRankings[teamTotal.team.ABBR] = currentRank;
    previousTotalRank = teamTotal.totalRank;
    previousTiebreakers = currentTiebreakers;
  });
  
  return overallRankings;
}

// Function to create team rankings double array
function createTeamRankings(teams, availablePeriods) {
  const teamRankings = [];
  const statKeys = ['goals', 'assists', 'toughness', 'dstat', 'gstat'];
  
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
  ['goals', 'assists', 'toughness', 'dstat', 'gstat'].forEach(statKey => {
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
