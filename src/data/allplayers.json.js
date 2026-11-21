import { readCsvFile, getContract, seasons, currentSeason, loadSeasonData, mapPosition, getStatsForPeriod, periodLookup } from "../components/loadfiles.js";
import { identityColumns, statColumns } from "../components/playerRows.js";

function buildSeasonAllPlayers(sf, teamInfo, playerInfo, contracts, drafted) {
  const { season, latestStatsIndex, latestRosterIndex, statsPeriods, statsData, availablePeriods, getOverallStats } = sf;
  const stats = periodLookup(statsData);
  const teams = ["All", ...teamInfo.map(team => team.ABBR).sort(), "FA"];

  const draftedIds = new Set(drafted.map(d => String(d.hockeydb).trim()));

  const playerData = playerInfo.map(info => {
    const isDrafted = !!info.HockeyDB && draftedIds.has(String(info.HockeyDB).trim());
    const roster = latestRosterIndex.get(info.ID);
    const contract = getContract(contracts, info.ID);
    const position = mapPosition(info.Pos);
    const playerStats = getOverallStats(position, latestStatsIndex.get(info.ID) || {});
    const overallRating = playerStats.games_played ? playerStats.rating : 0;

    // The same row layout for the season totals and for each period; the rating is always the season rating
    const row = (lineOfStats) => ({
      PLAYER_ID: info.ID,
      FHL: roster?.ABBR || 'FA',
      Drafted: isDrafted,
      ...identityColumns(info, position, season, contract),
      ...statColumns(position, lineOfStats, { goalieRecord: true }),
      Rating: overallRating,
    });

    const player = { OVERALL: row(playerStats) };
    statsPeriods.forEach(periodInfo => {
      player[periodInfo.period] = row(getStatsForPeriod(position, stats.stats(periodInfo.period).get(info.ID) || {}, stats.previous(periodInfo.period).get(info.ID) || {}));
    });
    return player;
  });

  return { playerData, teams, availablePeriods: [...availablePeriods, "OVERALL"] };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  const drafted = await readCsvFile(`${sf.basePath}/drafted_players.csv`);
  allData[season] = buildSeasonAllPlayers(sf, teamInfo, playerInfo, contracts, drafted);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
