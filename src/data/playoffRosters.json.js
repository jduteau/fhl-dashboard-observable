import { readCsvFile, getContract, seasons, currentSeason, loadSeasonData, mapPosition, getStatsForPeriod, indexBy, assertPlayersKnown } from "../components/loadfiles.js";
import { identityColumns, statColumns, sortRoster, activeTotals, reserveTotals } from "../components/playerRows.js";

function buildSeasonPlayoffRosters(sf, teamInfo, playerInfo, contracts) {
  const { season, availablePlayoffRounds } = sf;
  const getOverallStats = sf.getOverallStats;
  const teams = teamInfo.map(team => team.ABBR).sort();
  const playerIndex = indexBy(playerInfo, "ID");
  assertPlayersKnown(playerIndex, availablePlayoffRounds.map(r => ({ name: `${season} rosters_playoff_r${String(r.round).padStart(2, "0")}.csv`, rows: r.rosterFile })));
  const statsIndexes = new Map(availablePlayoffRounds.map(r => [r, indexBy(r.statsFile, "hockeyRef")]));

  // Playoff rosters are priced with each player's latest contract: contracts can't change during the playoffs, so there
  // is only one to pick. Players are listed by name within their position.
  const buildRow = (player, info, stats) => {
    const position = mapPosition(info.Pos);
    return {
      PLAYER_ID: player.ID,
      ...identityColumns(info, position, season, getContract(contracts, player.ID)),
      Reserve: player.RESERVE || "",
      ...statColumns(position, stats(position)),
    };
  };
  const byName = (a, b) => a.Name.localeCompare(b.Name);

  const teamData = teamInfo.map(team => {

    availablePlayoffRounds.forEach((round, index) => {
      const roundKey = `R${round.round.toString().padStart(2, '0')}`;
      team[roundKey] = {};
      const roster = round.rosterFile.filter(player => player.ABBR === team.ABBR);
      const currentStats = statsIndexes.get(round);
      const previousStats = index > 0 ? statsIndexes.get(availablePlayoffRounds[index - 1]) : null;

      // A round's stats are what was added since the previous round (the first round's are the totals so far)
      team[roundKey]['ROSTER'] = roster.map(player => buildRow(player, playerIndex.get(player.ID), (position) => {
        const current = currentStats.get(player.ID) || {};
        return previousStats ? getStatsForPeriod(position, current, previousStats.get(player.ID) || {}) : getOverallStats(position, current);
      }));
      sortRoster(team[roundKey]['ROSTER'], byName);
      team[roundKey]['ACTIVE_TOTALS'] = activeTotals(team[roundKey]['ROSTER']);
      team[roundKey]['RESERVE_TOTALS'] = reserveTotals(team[roundKey]['ROSTER']);
    });

    // OVERALL: cumulative stats from the latest playoff round
    if (availablePlayoffRounds.length > 0) {
      const latestRound = availablePlayoffRounds[availablePlayoffRounds.length - 1];
      const overallRoster = latestRound.rosterFile.filter(player => player.ABBR === team.ABBR);
      team['OVERALL'] = {};
      team['OVERALL']['ROSTER'] = overallRoster.map(player => buildRow(player, playerIndex.get(player.ID),
        (position) => getOverallStats(position, statsIndexes.get(latestRound).get(player.ID) || {})));
      sortRoster(team['OVERALL']['ROSTER'], byName);
      team['OVERALL']['ACTIVE_TOTALS'] = activeTotals(team['OVERALL']['ROSTER']);
      team['OVERALL']['RESERVE_TOTALS'] = reserveTotals(team['OVERALL']['ROSTER']);
    }

    return team;
  });

  return {
    teamData,
    teams,
    availablePeriods: availablePlayoffRounds.length > 0
      ? [...availablePlayoffRounds.map(r => `R${r.round.toString().padStart(2, '0')}`), 'OVERALL']
      : [],
    roundNames: {
      ...availablePlayoffRounds.reduce((acc, r) => {
        acc[`R${r.round.toString().padStart(2, '0')}`] = r.name;
        return acc;
      }, {}),
      ...(availablePlayoffRounds.length > 0 ? { OVERALL: 'Overall' } : {})
    }
  };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  allData[season] = buildSeasonPlayoffRosters(sf, teamInfo, playerInfo, contracts);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));

      
