import { readCsvFile, getContract, seasons, currentSeason, loadSeasonData, mapPosition, getStatsForPeriod, indexBy, periodLookup, assertPlayersKnown } from "../components/loadfiles.js";
import { identityColumns, statColumns, sortRoster, activeTotals, reserveTotals } from "../components/playerRows.js";

function buildSeasonRosters(sf, teamInfo, playerInfo, contracts) {
  const { season, statsData, rosterPeriods, latestStatsIndex, latestRosterFile, availablePeriods, getOverallStats } = sf;
  const teams = teamInfo.map(team => team.ABBR).sort();
  // The newest roster file, which may be one period ahead of the stats (next period's lineup)
  const latestRosterPeriod = rosterPeriods.length ? rosterPeriods[rosterPeriods.length - 1].period : 0;
  const playerIndex = indexBy(playerInfo, "ID");
  assertPlayersKnown(playerIndex, rosterPeriods.map(p => ({ name: `${season} rosters_p${String(p.period).padStart(2, "0")}.csv`, rows: p.data })));
  const stats = periodLookup(statsData);
  // Only periods that have stats are reported; a roster file with no stats yet (the upcoming period) is skipped
  const scoredRosterPeriods = rosterPeriods.filter(p => statsData[p.period]);
  const bestRatingFirst = (a, b) => b.Rating - a.Rating;

  const teamData = teamInfo.map(team => {
    team["OVERALL"] = {};
    const overallRoster = latestRosterFile.filter(player => player.ABBR === team.ABBR);
    team["OVERALL"]['ROSTER'] = overallRoster.map(player => {
      const info = playerIndex.get(player.ID);
      const contract = getContract(contracts, player.ID, latestRosterPeriod);
      const position = mapPosition(info.Pos);
      const playerStats = getOverallStats(position, latestStatsIndex.get(player.ID) || {});
      return {
        PLAYER_ID: player.ID,
        ...identityColumns(info, position, season, contract),
        Reserve: "",
        ...statColumns(position, playerStats),
        Rating: playerStats.games_played ? playerStats.rating : 0,
      };
    });
    sortRoster(team["OVERALL"]['ROSTER'], bestRatingFirst);
    team["OVERALL"]['ACTIVE_TOTALS'] = activeTotals(team["OVERALL"]['ROSTER']);
    team["OVERALL"]['RESERVE_TOTALS'] = { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 };

    const overallRatings = indexBy(team["OVERALL"]['ROSTER'], "PLAYER_ID");
    scoredRosterPeriods.forEach(periodInfo => {
      team[periodInfo.period] = {};
      const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
      const currentStats = stats.stats(periodInfo.period);
      const previousStats = stats.previous(periodInfo.period);
      team[periodInfo.period]['ROSTER'] = roster.map(player => {
        const info = playerIndex.get(player.ID);
        const contract = getContract(contracts, player.ID, periodInfo.period);
        const position = mapPosition(info.Pos);
        const playerStats = getStatsForPeriod(position, currentStats.get(player.ID) || {}, previousStats.get(player.ID) || {});
        return {
          PLAYER_ID: player.ID,
          ...identityColumns(info, position, season, contract),
          Reserve: player.RESERVE,
          ...statColumns(position, playerStats),
          Rating: overallRatings.get(player.ID)?.Rating || 0, // a player's rating is their season rating, in every period
        };
      });
      sortRoster(team[periodInfo.period]['ROSTER'], bestRatingFirst);
      team[periodInfo.period]['ACTIVE_TOTALS'] = activeTotals(team[periodInfo.period]['ROSTER']);
      team[periodInfo.period]['RESERVE_TOTALS'] = reserveTotals(team[periodInfo.period]['ROSTER']);
    });

    return team;
  });

  return { teamData, teams, availablePeriods: [...availablePeriods, "OVERALL"], latestPeriod: sf.latestPeriod, latestRosterPeriod };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  allData[season] = buildSeasonRosters(sf, teamInfo, playerInfo, contracts);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
